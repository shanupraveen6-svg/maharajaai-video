import { NextRequest, NextResponse } from 'next/server';
import { applyMaharajaWatermark } from '@/lib/maharaja/watermark';
import { applyMaharajaVideoWatermark } from '@/lib/maharaja/video-processor';

export const dynamic = 'force-dynamic';

const ALLOWED_HOSTS = new Set([
  'storage.googleapis.com',
  'firebasestorage.googleapis.com',
  'storage.cloud.google.com',
]);

export async function POST(req: NextRequest) {
  try {
    const { url, watermark } = await req.json();

    if (typeof url !== 'string' || !url.trim()) {
      return NextResponse.json({ success: false, error: 'Missing download URL.' }, { status: 400 });
    }

    const parsed = new URL(url);
    if (!ALLOWED_HOSTS.has(parsed.hostname) && !parsed.hostname.includes('localhost')) {
      return NextResponse.json({ success: false, error: 'Download host is not allowed.' }, { status: 400 });
    }

    const upstream = await fetch(parsed.toString(), { cache: 'no-store' });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ success: false, error: 'Unable to fetch generated asset.' }, { status: 502 });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    let buffer = Buffer.from(await upstream.arrayBuffer());

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
