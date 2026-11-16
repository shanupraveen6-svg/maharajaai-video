export type TryOnEngine = 'genlook' | 'gemini';
const TRY_ON_ENGINES: TryOnEngine[] = ['genlook', 'gemini'];

/**
 * The order Try-On image engines are tried in for store garments: TRYON_ENGINE_ORDER (comma-separated, e.g.
 * "gemini,genlook") or GenLook → Gemini. Gemini, the disclosed backup, is always kept as the last resort.
 */
export function tryOnEngineOrder(value = process.env.TRYON_ENGINE_ORDER): TryOnEngine[] {
  const configured = String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is TryOnEngine => (TRY_ON_ENGINES as string[]).includes(item));
  const order = Array.from(new Set(configured.length ? configured : TRY_ON_ENGINES));
  return order.includes('gemini') ? order : [...order, 'gemini'];
}
