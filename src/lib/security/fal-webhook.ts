import crypto from 'crypto';

function secret() {
  return (process.env.FAL_WEBHOOK_SECRET || process.env.OPERATOR_AUTH_SECRET || '').trim();
}

export function canSignFalWebhook() {
  return secret().length >= 24;
}

export function signFalWebhook(jobId: string, sessionId: string) {
  const value = secret();
  if (value.length < 24) return '';
  return crypto.createHmac('sha256', value).update(`${jobId}:${sessionId}`).digest('hex');
}

export function verifyFalWebhook(jobId: string, sessionId: string, token: string) {
  const expected = signFalWebhook(jobId, sessionId);
  if (!expected || !token || expected.length !== token.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

