import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/operator';
import { AI_CONFIG } from '@/lib/ai/config';
import { getGenlookCredits } from '@/lib/maharaja/genlook-provider';

export const dynamic = 'force-dynamic';

/** TryFocus admin only: whether GenLook (the Try-On engine) is connected and its credits left. */
export async function GET(req: NextRequest) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized TryFocus admin session.' }, { status: 401 });
  }
  const key = AI_CONFIG.GENLOOK_API_KEY;
  if (!key) return NextResponse.json({ success: true, configured: false, error: 'GENLOOK_API_KEY is not set.' });
  const result = await getGenlookCredits(key);
  return NextResponse.json(result.ok
    ? { success: true, configured: true, creditBalance: result.creditBalance }
    : { success: true, configured: true, error: result.error });
}
