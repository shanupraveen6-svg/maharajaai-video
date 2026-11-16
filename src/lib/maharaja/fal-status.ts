/**
 * Whether fal (AI Video videos, Live Try-On) can take work right now, from its free token-mint call — the same
 * call every Live Try-On makes first. 'no-balance' means the account is locked until it is topped up. Checked
 * at most once every 5 minutes per server, so the TVs' regular catalogue reads stay fast.
 */
export type FalStatus = 'ok' | 'no-balance' | 'invalid' | 'missing' | 'unverified';

let cached: { status: FalStatus; at: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function falStatus(force = false): Promise<FalStatus> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.status;
  const key = process.env.FAL_KEY?.trim();
  let status: FalStatus = 'unverified';
  if (!key) status = 'missing';
  else {
    try {
      const response = await fetch('https://rest.fal.ai/tokens/', {
        method: 'POST',
        headers: { Authorization: `Key ${key}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowed_apps: ['lucy2-vton'], token_expiration: 1 }),
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      });
      const detail = response.ok ? '' : String((await response.json().catch(() => ({})))?.detail || '');
      status = response.ok ? 'ok'
        : /balance|locked/i.test(detail) ? 'no-balance'
        : response.status === 401 || response.status === 403 ? 'invalid'
        : 'unverified';
    } catch {
      status = 'unverified';
    }
  }
  cached = { status, at: Date.now() };
  return status;
}

/** Only a definite answer switches fal's experiences off; a passing network problem never does. */
export function falUnavailable(status: FalStatus) {
  return status === 'no-balance' || status === 'invalid' || status === 'missing';
}
