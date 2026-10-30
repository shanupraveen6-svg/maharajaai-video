import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { applyMaharajaWatermark } from '@/lib/maharaja/watermark';
import { applyMaharajaVideoWatermark } from '@/lib/maharaja/video-processor';
import { verifyMaharajaAccess } from '@/lib/maharaja/server';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { bindClient } from '@/lib/maharaja/client-context';

export const dynamic = 'force-dynamic';

const ALLOWED_HOSTS = new Set([
  'storage.googleapis.com',
  'firebasestorage.googleapis.com',
  'storage.cloud.google.com',
]);
const MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024;

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(entries: Array<{ name: string; data: Buffer }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.data.length, 18); local.writeUInt32LE(entry.data.length, 22); local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, entry.data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16); central.writeUInt32LE(entry.data.length, 20); central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + entry.data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function isMaharajaAsset(url: URL) {
  const decoded = decodeURIComponent(`${url.pathname}${url.search}`);
  return decoded.includes('clients/maharaja/');
}

export async function POST(req: NextRequest) {
  try {
    const { url, watermark, sessionId, accessCode, jobId, kind } = await req.json();
    const rate = await enforceRateLimit(req, 'asset-download', 20, 10 * 60 * 1000, typeof accessCode === 'string' ? accessCode : undefined);
    if (!rate.allowed) {
      return NextResponse.json({ success: false, error: 'Too many download requests. Please wait and try again.' }, {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfterSeconds) },
      });
    }

    if (typeof sessionId === 'string' && typeof accessCode === 'string' && (kind === 'image' || kind === 'video' || kind === 'bundle')) {
      const access = await verifyMaharajaAccess(req, accessCode, 'ai-video');
      bindClient(access.allowed ? access.clientId : null);
      if (!access.allowed || !access.pass) {
        return NextResponse.json({ success: false, error: access.error || 'A valid AI Video pass is required.' }, { status: 401 });
      }
      const db = getDb();
      const session = db
        ? (await db.collection('sessions').doc(sessionId).get()).data()
        : getMockStore().sessions.get(sessionId);
      if (!session || session.accessCode !== accessCode) {
        return NextResponse.json({ success: false, error: 'This media does not belong to this AI Video pass.' }, { status: 403 });
      }

      if (kind === 'bundle') {
        if (typeof jobId !== 'string' || !jobId) return NextResponse.json({ success: false, error: 'A completed video job is required.' }, { status: 400 });
        const job = db
          ? (await db.collection('videoTestJobs').doc(jobId).get()).data()
          : getMockStore().sessions.get(`video_test_${jobId}`);
        if (!job || job.status !== 'ready' || job.sessionId !== sessionId || job.accessCode !== accessCode) {
          return NextResponse.json({ success: false, error: 'The completed video could not be verified.' }, { status: 403 });
        }
        const imagePath = String(session.masterStoragePath || '');
        const videoPath = String(job.videoStoragePath || '');
        const expectedPrefix = `clients/maharaja/sessions/${sessionId}/`;
        if (!imagePath.startsWith(expectedPrefix) || !videoPath.startsWith(expectedPrefix)) {
          return NextResponse.json({ success: false, error: 'The requested media path is invalid.' }, { status: 403 });
        }
        const bucket = getStorageBucket();
        if (!bucket) return NextResponse.json({ success: false, error: 'Secure media storage is unavailable.' }, { status: 503 });
        const [[storedImage], [storedVideo]] = await Promise.all([
          bucket.file(imagePath).download(),
          bucket.file(videoPath).download(),
        ]);
        if (storedImage.byteLength + storedVideo.byteLength > MAX_DOWNLOAD_BYTES) {
          return NextResponse.json({ success: false, error: 'Generated assets are too large to download.' }, { status: 413 });
        }
        const image = Buffer.from(await applyMaharajaWatermark(Buffer.from(storedImage)));
        const zip = createStoredZip([
          { name: `Maharaja-${sessionId}.jpg`, data: image },
          { name: `Maharaja-${sessionId}.mp4`, data: Buffer.from(storedVideo) },
        ]);
        return new NextResponse(zip as any, { headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="Maharaja-${sessionId}.zip"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        } });
      }

      let storagePath = '';
      let contentType = kind === 'image' ? 'image/jpeg' : 'video/mp4';
      if (kind === 'image') {
        storagePath = String(session.masterStoragePath || '');
      } else {
        if (typeof jobId !== 'string' || !jobId) {
          return NextResponse.json({ success: false, error: 'A completed video job is required.' }, { status: 400 });
        }
        const job = db
          ? (await db.collection('videoTestJobs').doc(jobId).get()).data()
          : getMockStore().sessions.get(`video_test_${jobId}`);
        if (!job || job.status !== 'ready' || job.sessionId !== sessionId || job.accessCode !== accessCode) {
          return NextResponse.json({ success: false, error: 'The completed video could not be verified.' }, { status: 403 });
        }
        storagePath = String(job.videoStoragePath || '');
      }

      if (!storagePath.startsWith('clients/maharaja/sessions/')) {
        return NextResponse.json({ success: false, error: 'The requested media path is invalid.' }, { status: 403 });
      }
      const bucket = getStorageBucket();
      if (!bucket) return NextResponse.json({ success: false, error: 'Secure media storage is unavailable.' }, { status: 503 });
      const [stored] = await bucket.file(storagePath).download();
      if (stored.byteLength > MAX_DOWNLOAD_BYTES) {
        return NextResponse.json({ success: false, error: 'Generated asset is too large to download.' }, { status: 413 });
      }
      let buffer = Buffer.from(stored);
      if (kind === 'image') buffer = Buffer.from(await applyMaharajaWatermark(buffer));
      const extension = kind === 'image' ? 'jpg' : 'mp4';
      return new NextResponse(buffer as any, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="Maharaja-${sessionId}.${extension}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    if (typeof url !== 'string' || !url.trim()) {
      return NextResponse.json({ success: false, error: 'Missing download URL.' }, { status: 400 });
    }
    if (!verifyOperatorRequest(req)) {
      return NextResponse.json({ success: false, error: 'Operator access is required.' }, { status: 401 });
    }

    const parsed = new URL(url);
    if (!ALLOWED_HOSTS.has(parsed.hostname) && !parsed.hostname.includes('localhost')) {
      return NextResponse.json({ success: false, error: 'Download host is not allowed.' }, { status: 400 });
    }
    if (!parsed.hostname.includes('localhost') && !isMaharajaAsset(parsed)) {
      return NextResponse.json({ success: false, error: 'Download asset is outside the Maharaja workspace.' }, { status: 403 });
    }
    const upstream = await fetch(parsed.toString(), { cache: 'no-store' });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ success: false, error: 'Unable to fetch generated asset.' }, { status: 502 });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    if (Number(upstream.headers.get('content-length') || 0) > MAX_DOWNLOAD_BYTES) {
      return NextResponse.json({ success: false, error: 'Generated asset is too large to download.' }, { status: 413 });
    }
    let buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.byteLength > MAX_DOWNLOAD_BYTES) {
      return NextResponse.json({ success: false, error: 'Generated asset is too large to download.' }, { status: 413 });
    }

    // Permanently embed the Maharaja official seal onto downloadable image or video media
    if (watermark === true) {
      if (contentType.startsWith('image/')) {
        try {
          const watermarked = await applyMaharajaWatermark(buffer);
          buffer = Buffer.from(watermarked);
        } catch (watermarkErr) {
          console.warn('Image watermark application warning during download:', watermarkErr);
        }
      } else if (contentType.startsWith('video/') || parsed.pathname.endsWith('.mp4')) {
        try {
          const watermarked = await applyMaharajaVideoWatermark(buffer);
          buffer = Buffer.from(watermarked);
        } catch (videoWatermarkErr) {
          console.warn('Video watermark application warning during download:', videoWatermarkErr);
        }
      }
    }

    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Download proxy error:', err);
    return NextResponse.json({ success: false, error: 'Download proxy failed.' }, { status: 500 });
  }
}
