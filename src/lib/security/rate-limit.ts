import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/firebase/admin';

type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };
type LocalEntry = { count: number; resetAt: number };

const localLimits: Map<string, LocalEntry> = (global as typeof globalThis & { __MAHARAJA_RATE_LIMITS__?: Map<string, LocalEntry> })
  .__MAHARAJA_RATE_LIMITS__ || new Map();
(global as typeof globalThis & { __MAHARAJA_RATE_LIMITS__?: Map<string, LocalEntry> }).__MAHARAJA_RATE_LIMITS__ = localLimits;

function requestIp(req: NextRequest) {
  return (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown')
    .split(',')[0]
    .trim()
    .slice(0, 80);
}

function keyFor(req: NextRequest, scope: string, identity?: string) {
  return crypto.createHash('sha256')
    .update(`${scope}:${identity || requestIp(req)}`)
    .digest('hex');
}

export async function enforceRateLimit(
  req: NextRequest,
  scope: string,
  limit: number,
  windowMs: number,
  identity?: string
): Promise<RateLimitResult> {
  const now = Date.now();
  const key = keyFor(req, scope, identity);

  const db = getDb();
  if (db) {
    const ref = db.collection('securityRateLimits').doc(key);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const stored = snapshot.data();
      const resetAt = Number(stored?.resetAtMs || 0);
      const count = resetAt > now ? Number(stored?.count || 0) : 0;
      if (count >= limit) {
        return { allowed: false as const, retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
      }
      transaction.set(ref, {
        scope,
        count: count + 1,
        resetAtMs: resetAt > now ? resetAt : now + windowMs,
        expiresAt: new Date((resetAt > now ? resetAt : now + windowMs) + 24 * 60 * 60 * 1000),
        updatedAt: new Date(now).toISOString(),
      }, { merge: true });
      return { allowed: true as const };
    });
  }

  // Local fallback for development and deterministic tests.
  const current = localLimits.get(key);
  if (current && current.resetAt > now) {
    if (current.count >= limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
    }
    current.count += 1;
    return { allowed: true };
  }

  localLimits.set(key, { count: 1, resetAt: now + windowMs });
  return { allowed: true };
}
