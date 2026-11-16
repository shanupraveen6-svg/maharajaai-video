import { getStorageBucket } from '@/lib/firebase/admin';

/**
 * The storage bucket's browser rule (CORS): lets the TryFocus site upload promo videos straight to storage
 * and read photos from it. Without it browsers block those requests. Checked once per server and set if
 * missing, the first time an upload starts; a failure is only logged (uploads then report their own error).
 */
const SITE_ORIGINS = ['https://www.tryfocus.in', 'https://tryfocus.in'];
let ensured: Promise<void> | null = null;

export function ensureStorageCors() {
  ensured ??= (async () => {
    const bucket = getStorageBucket();
    if (!bucket || typeof bucket.getMetadata !== 'function') return;
    const [meta] = await bucket.getMetadata();
    const rules: Array<{ origin?: string[]; method?: string[] }> = Array.isArray(meta?.cors) ? meta.cors : [];
    const covered = rules.some((rule) => SITE_ORIGINS.every((origin) => rule.origin?.includes(origin)) && ['GET', 'PUT'].every((method) => rule.method?.includes(method)));
    if (covered) return;
    await bucket.setCorsConfiguration([
      ...rules,
      { origin: SITE_ORIGINS, method: ['GET', 'HEAD', 'PUT'], responseHeader: ['Content-Type', 'Content-Length', 'Content-Range', 'Range'], maxAgeSeconds: 3600 },
    ]);
    console.info('Storage CORS rule set for the TryFocus site.');
  })().catch((error) => {
    ensured = null;
    console.warn('Storage CORS rule could not be set:', error instanceof Error ? error.message : error);
  });
  return ensured;
}
