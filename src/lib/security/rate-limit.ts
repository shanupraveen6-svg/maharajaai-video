import crypto from 'crypto';
import type { NextRequest } from 'next/server';

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

  // Instant in-memory rate limiting — zero network latency (<0.1ms)
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

