import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { clearTryOnGrants, logMaharajaActivity } from '@/lib/maharaja/server';

export async function DELETE(req: NextRequest) {
  if (!verifyOperatorRequest(req)) return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  const cleared = await clearTryOnGrants();
  await logMaharajaActivity('campaign', 'Manager reset AI Try-On device limits', { cleared });
  return NextResponse.json({ success: true, cleared });
}
