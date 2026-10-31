import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { activeClientId, bindClient } from '@/lib/maharaja/client-context';
import { resolveRequestClientId } from '@/lib/maharaja/server';
import { verifyTvRequest } from '@/lib/auth/display';
import { savePhotoTransfer } from '@/lib/maharaja/photo-transfer';
import { enforceRateLimit } from '@/lib/security/rate-limit';

export async function POST(req: NextRequest) {
  bindClient(await resolveRequestClientId(req));
  if (!await verifyTvRequest(req)) return NextResponse.json({ error: 'Sign in or pair this display first.' }, { status: 401 });
  const rate = await enforceRateLimit(req, 'photo-transfer-create', 12, 600_000);
  if (!rate.allowed) return NextResponse.json({ error: 'Please wait before creating another upload QR.' }, { status: 429 });
  const token = crypto.randomBytes(24).toString('base64url');
  const receiver = crypto.randomBytes(24).toString('base64url');
  const expiresAtMs = Date.now() + 10 * 60_000;
  await savePhotoTransfer(token, { receiver, expiresAtMs, status: 'waiting', clientId: activeClientId() });
  return NextResponse.json({ token, receiver, expiresAtMs }, { headers: { 'Cache-Control': 'no-store' } });
}
