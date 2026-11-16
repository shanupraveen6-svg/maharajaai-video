import { NextResponse } from 'next/server';
import { guardRoute } from '@/lib/http/guard';

async function postHandler() {
  const response = NextResponse.json({ success: true });
  response.cookies.set('maharaja_operator_auth', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}

export const POST = guardRoute(postHandler, 'operator/logout POST');
