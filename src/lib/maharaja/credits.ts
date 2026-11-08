/**
 * Credit status per service. A store hears at 50%, 70%, 90% and 95% of its package and when it is
 * finished; there is no daily cap per store, since the store has paid for the package.
 * `none`: the service is not in the plan (limit 0), so it never raises a warning.
 */
export type CreditLevel = 'none' | 'ok' | 'half' | 'low' | 'critical' | 'final' | 'exhausted';

export type CreditStatus = { label: string; used: number; limit: number; pct: number; level: CreditLevel };

/** The points (per cent of the package used) at which the store and TryFocus admin are told. */
export const CREDIT_ALERT_STEPS = [50, 70, 90, 95, 100] as const;

export function creditLevel(used: number, limit: number): CreditLevel {
  if (limit <= 0) return 'none';
  const pct = (used / limit) * 100;
  if (used >= limit) return 'exhausted';
  if (pct >= 95) return 'final';
  if (pct >= 90) return 'critical';
  if (pct >= 70) return 'low';
  if (pct >= 50) return 'half';
  return 'ok';
}

/** The alert step a new credit crossed (50, 70, 90, 95 or 100), or null when it crossed none. */
export function crossedCreditStep(usedBefore: number, usedAfter: number, limit: number): number | null {
  if (limit <= 0) return null;
  const before = (usedBefore / limit) * 100;
  const after = (usedAfter / limit) * 100;
  const crossed = CREDIT_ALERT_STEPS.filter((step) => before < step && after >= step);
  return crossed.length ? crossed[crossed.length - 1] : null;
}

export function creditStatuses(
  usage: { tryOnGenerated?: number; liveSessions?: number; videosGenerated?: number },
  limits: { image: number; live: number; video: number },
): CreditStatus[] {
  return ([
    ['Try-On', Number(usage.tryOnGenerated || 0), limits.image],
    ['Live Mirror', Number(usage.liveSessions || 0), limits.live],
    ['AI Video', Number(usage.videosGenerated || 0), limits.video],
  ] as const).map(([label, used, limit]) => {
    if (limit <= 0) return { label, used, limit, pct: 0, level: 'none' as CreditLevel };
    const pct = Math.min(100, Math.floor((used / limit) * 100));
    return { label, used, limit, pct, level: creditLevel(used, limit) };
  });
}

/** Levels the store is told about (from 50% used). */
export function needsCreditAlert(status: CreditStatus) {
  return status.level !== 'ok' && status.level !== 'none';
}

export function creditWarningText(status: CreditStatus) {
  if (status.level === 'exhausted') return `${status.label} credits are finished. Customers see a paused message until credits are added.`;
  const left = Math.max(0, status.limit - status.used);
  return `${status.label}: ${status.pct}% used, ${left.toLocaleString('en-IN')} of ${status.limit.toLocaleString('en-IN')} credits left.`;
}

/** The word and pill tone shown for a credit level: stores read a status, not a bar. */
export const CREDIT_LEVEL_STATUS: Record<CreditLevel, { text: string; tone: 'neutral' | 'success' | 'warn' | 'danger' }> = {
  none: { text: 'Not in plan', tone: 'neutral' },
  ok: { text: 'Good', tone: 'success' },
  half: { text: 'Half used', tone: 'warn' },
  low: { text: 'Running low', tone: 'warn' },
  critical: { text: 'Almost finished', tone: 'danger' },
  final: { text: 'Last 5% left', tone: 'danger' },
  exhausted: { text: 'Finished', tone: 'danger' },
};
