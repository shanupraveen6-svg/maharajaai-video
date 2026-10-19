import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    success: false,
    status: 'disabled',
    error: 'The previous AI video status pipeline has been removed.',
  }, { status: 503 });
}
