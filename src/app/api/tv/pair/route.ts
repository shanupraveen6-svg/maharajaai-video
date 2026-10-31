import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import {
  DISPLAY_COOKIE,
  DISPLAY_MAX_AGE,
  issueDisplayToken,
  revokeDisplayTokens,
} from '@/lib/auth/display';
import { activeClientId, bindClient } from '@/lib/maharaja/client-context';
import { resolveRequestClientId } from '@/lib/maharaja/server';

export async function POST(req: NextRequest) {
  bindClient(await resolveRequestClientId(req));
  if (!verifyOperatorRequest(req))
    return NextResponse.json(
      {
        success: false,
        error: 'Staff login is required to pair this display.',
      },
      { status: 401 },
    );
  const response = NextResponse.json({ success: true });
  response.cookies.set(DISPLAY_COOKIE, await issueDisplayToken(activeClientId()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: DISPLAY_MAX_AGE,
  });
  return response;
}

export async function DELETE(req: NextRequest) {
  bindClient(await resolveRequestClientId(req));
  if (!verifyOperatorRequest(req))
    return NextResponse.json(
      { success: false, error: 'Staff login is required.' },
      { status: 401 },
    );
  await revokeDisplayTokens(activeClientId());
  const response = NextResponse.json({ success: true });
  response.cookies.set(DISPLAY_COOKIE, '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
  return response;
}
