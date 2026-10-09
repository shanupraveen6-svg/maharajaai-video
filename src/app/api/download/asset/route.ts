import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = new Set([
  'storage.googleapis.com',
  'firebasestorage.googleapis.com',
  'storage.cloud.google.com',
]);

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (typeof url !== 'string' || !url.trim()) {
      return NextResponse.json({ success: false, error: 'Missing download URL.' }, { status: 400 });
    }

    const parsed = new URL(url);
    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      return NextResponse.json({ success: false, error: 'Download host is not allowed.' }, { status: 400 });
    }

    const upstream = await fetch(parsed.toString(), { cache: 'no-store' });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ success: false, error: 'Unable to fetch generated asset.' }, { status: 502 });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
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
