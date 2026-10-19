import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json({
    success: false,
    status: 'disabled',
    error: 'AI video generation is temporarily unavailable while the video pipeline is being rebuilt.',
  }, { status: 503 });
}
