import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import {
  DISPLAY_COOKIE,
  DISPLAY_MAX_AGE,
  displayClientId,
  issueDisplayToken,
  revokeDisplayTokens,
} from '@/lib/auth/display';
import { activeClientId, bindClient } from '@/lib/maharaja/client-context';
import { resolveRequestClientId } from '@/lib/maharaja/server';
import { guardRoute } from '@/lib/http/guard';

async function postHandler(req: NextRequest) {
  bindClient(await resolveRequestClientId(req));
  // Staff login pairs a screen; an already paired screen of the same workspace renews itself.
  const renewing = (await displayClientId(req)) === activeClientId();
  if (!verifyOperatorRequest(req) && !renewing)
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

async function deleteHandler(req: NextRequest) {
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

export const POST = guardRoute(postHandler, 'tv/pair POST');
export const DELETE = guardRoute(deleteHandler, 'tv/pair DELETE');
