import { NextRequest, NextResponse } from 'next/server';
import { verifyTvRequest } from '@/lib/auth/display';
import { resolveRequestClientId, incrementMaharajaUsage } from '@/lib/maharaja/server';
import { bindClient } from '@/lib/maharaja/client-context';

export const dynamic = 'force-dynamic';

/** Counts one Live AI Mirror credit once the AI stream is actually playing on the paired TV. */
export async function POST(req: NextRequest) {
  bindClient(await resolveRequestClientId(req));
  if (!await verifyTvRequest(req)) return NextResponse.json({ success: false, error: 'Sign in or pair this display first.' }, { status: 401 });
  await incrementMaharajaUsage('liveSessions');
  return NextResponse.json({ success: true });
}
