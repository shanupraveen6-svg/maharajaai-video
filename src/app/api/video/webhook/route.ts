import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ success: false, error: 'Legacy video webhooks are disabled.' }, { status: 410 });
}
