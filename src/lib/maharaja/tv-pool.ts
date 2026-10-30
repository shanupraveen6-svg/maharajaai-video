export type TvPoolItem = {
  queueId: string;
  videoId?: string | null;
  storagePath?: string | null;
  source?: 'live' | 'replay' | 'promo';
};

function identity(item: TvPoolItem): string {
  return item.storagePath || item.videoId || item.queueId;
}

export function mergeTvPool<T extends TvPoolItem>(
  current: T[],
  incoming: T[],
  blockedQueueIds: ReadonlySet<string> = new Set(),
): T[] {
  const merged = [...current];
  const indexByIdentity = new Map(merged.map((item, index) => [identity(item), index]));

  for (const item of incoming) {
    if (!item.queueId || blockedQueueIds.has(item.queueId)) continue;
    const key = identity(item);
    const existingIndex = indexByIdentity.get(key);
    if (existingIndex === undefined) {
      indexByIdentity.set(key, merged.length);
      merged.push(item);
      continue;
    }
    // Never let a background refresh replace an in-progress priority play.
    if (merged[existingIndex].source === 'live' && item.source === 'replay') continue;
    const stableQueueId = merged[existingIndex].source === item.source
      ? merged[existingIndex].queueId
      : item.queueId;
    merged[existingIndex] = { ...merged[existingIndex], ...item, queueId: stableQueueId };
  }

  return merged;
}

export function nextTvPoolIndex<T extends TvPoolItem>(items: T[], currentQueueId: string | null): number {
  if (!items.length) return -1;
  const currentIndex = currentQueueId
    ? items.findIndex((item) => item.queueId === currentQueueId)
    : -1;
  return currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
}

export function isApprovedDemoVideoPath(storagePath: string): boolean {
  if (!storagePath || /(^|\/)clients\/maharaja\/sessions\//i.test(storagePath)) return false;
  if (!storagePath.includes('/')) return true;
  return /(^|\/)(?:live-testing|showcase|showcases|demo|demos)(?:\/|$)/i.test(storagePath);
}

/** Whether the Go Live screen plays a store promo next: after `every` customer videos, never twice in a row. */
export function isPromoDue(customerPlaysSincePromo: number, every: number, promoCount: number, currentSource?: TvPoolItem['source']) {
  return promoCount > 0 && currentSource !== 'promo' && customerPlaysSincePromo >= Math.max(1, every);
}

/** Index of the customer video to play after a promo: the one after the video the promo interrupted. */
export function resumeIndexAfterPromo<T extends TvPoolItem>(items: T[], interruptedQueueId: string | null) {
  if (!items.length) return -1;
  const index = items.findIndex((item) => item.queueId === interruptedQueueId);
  return index >= 0 ? (index + 1) % items.length : 0;
}
