/** `none`: the service is not in the client's plan (limit 0), so it never raises a warning. */
export type CreditLevel = 'none' | 'ok' | 'low' | 'critical' | 'exhausted';

export type CreditStatus = { label: string; used: number; limit: number; pct: number; level: CreditLevel };

/** Credit use per service with a warning level at 80%, 95% and 100% of the client's package. */
export function creditStatuses(
  usage: { tryOnGenerated?: number; liveSessions?: number; videosGenerated?: number },
  limits: { image: number; live: number; video: number },
): CreditStatus[] {
  return ([
    ['AI Image Try-On', Number(usage.tryOnGenerated || 0), limits.image],
    ['60s Live AI Mirror', Number(usage.liveSessions || 0), limits.live],
    ['AI Video', Number(usage.videosGenerated || 0), limits.video],
  ] as const).map(([label, used, limit]) => {
    if (limit <= 0) return { label, used, limit, pct: 0, level: 'none' as CreditLevel };
    const pct = Math.min(100, Math.round((used / limit) * 100));
    const level: CreditLevel = pct >= 100 ? 'exhausted' : pct >= 95 ? 'critical' : pct >= 80 ? 'low' : 'ok';
    return { label, used, limit, pct, level };
  });
}

export function creditWarningText(status: CreditStatus) {
  if (status.level === 'exhausted') return `${status.label} credits are used up. Customers see a paused message until credits are added.`;
  return `${status.label}: ${status.limit - status.used} of ${status.limit} credits left (${100 - status.pct}%).`;
}

export const CREDIT_BAR_COLOURS: Record<CreditLevel, string> = {
  none: 'bg-[#ECEEE9]',
  ok: 'bg-[#7A1428]',
  low: 'bg-[#B7791F]',
  critical: 'bg-[#B42318]',
  exhausted: 'bg-[#B42318]',
};
