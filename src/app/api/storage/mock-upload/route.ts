import { NextRequest, NextResponse } from 'next/server';
import { getMockStore } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

function mockUploadsAllowed() {
  return process.env.VERCEL_ENV !== 'production' && process.env.ALLOW_MOCK_BACKEND === 'true';
}

export async function PUT(req: NextRequest) {
  try {
    if (!mockUploadsAllowed()) return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
    const searchParams = req.nextUrl.searchParams;
    const path = searchParams.get('path');
    if (!path) return NextResponse.json({ success: false, error: 'Path parameter required.' }, { status: 400 });

    const buffer = Buffer.from(await req.arrayBuffer());
    const mockStore = getMockStore();
    if (!mockStore.sessions) mockStore.sessions = new Map();
    mockStore.sessions.set(`mock_blob_${path}`, {
      buffer,
      contentType: req.headers.get('content-type') || 'image/jpeg',
      updatedAt: Date.now(),
    });

    return NextResponse.json({ success: true, path });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!mockUploadsAllowed()) return NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 });
    const searchParams = req.nextUrl.searchParams;
    const path = searchParams.get('path');
    if (!path) return NextResponse.json({ success: false, error: 'Path parameter required.' }, { status: 400 });

    const mockStore = getMockStore();
    const stored = mockStore.sessions?.get(`mock_blob_${path}`);
    if (!stored || !stored.buffer) {
      return NextResponse.json({ success: false, error: 'Blob not found in mock store.' }, { status: 404 });
    }

    return new NextResponse(stored.buffer, {
      headers: {
        'Content-Type': stored.contentType || 'image/jpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
