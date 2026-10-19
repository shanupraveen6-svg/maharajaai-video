import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json({
    success: false,
    status: 'disabled',
    error: 'Go Live is temporarily disabled while explicit-consent queueing is being rebuilt.',
  }, { status: 503 });
}
