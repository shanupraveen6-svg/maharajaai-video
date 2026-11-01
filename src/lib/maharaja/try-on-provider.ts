const FAL_TRY_ON_MODEL = 'fal-ai/image-apps-v2/virtual-try-on';

export type TryOnEngine = 'genlook' | 'fal' | 'fashn' | 'gemini';
const TRY_ON_ENGINES: TryOnEngine[] = ['genlook', 'fal', 'fashn', 'gemini'];

/**
 * The order Try-On image engines are tried in: TRYON_ENGINE_ORDER (comma-separated, e.g. "fal,gemini,fashn,genlook")
 * or GenLook → fal → FASHN → Gemini. Gemini, the disclosed backup, is always kept as the last resort.
 */
export function tryOnEngineOrder(value = process.env.TRYON_ENGINE_ORDER): TryOnEngine[] {
  const configured = String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is TryOnEngine => (TRY_ON_ENGINES as string[]).includes(item));
  const order = Array.from(new Set(configured.length ? configured : TRY_ON_ENGINES));
  return order.includes('gemini') ? order : [...order, 'gemini'];
}
const MAX_RESULT_BYTES = 16 * 1024 * 1024;

export function buildFalTryOnInput(personBase64: string, garmentBase64: string) {
  return {
    person_image_url: `data:image/jpeg;base64,${personBase64}`,
    clothing_image_url: `data:image/jpeg;base64,${garmentBase64}`,
    preserve_pose: true,
    aspect_ratio: { ratio: '9:16' },
  };
}

export async function generateFalTryOn(personBase64: string, garmentBase64: string, key: string): Promise<Buffer> {
  const response = await fetch(`https://fal.run/${FAL_TRY_ON_MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(buildFalTryOnInput(personBase64, garmentBase64)),
    signal: AbortSignal.timeout(90_000),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Fal Try-On did not complete (${response.status}). Please ask staff to check this request before retrying.`);
  }
  const payload = await response.json();
  const imageUrl = payload?.images?.[0]?.url;
  if (typeof imageUrl !== 'string') throw new Error('Fal Try-On returned no image. Please ask staff to check the provider before retrying.');
  const url = new URL(imageUrl);
  if (url.protocol !== 'https:' || !(url.hostname === 'fal.media' || url.hostname.endsWith('.fal.media'))) {
    throw new Error('Fal Try-On returned an untrusted image location.');
  }
  const imageResponse = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: 'no-store' });
  if (!imageResponse.ok) throw new Error('Fal Try-On completed, but its image could not be downloaded. Ask staff to check the result before retrying.');
  if (Number(imageResponse.headers.get('content-length') || 0) > MAX_RESULT_BYTES) throw new Error('Fal Try-On image exceeded the delivery limit.');
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_RESULT_BYTES) throw new Error('Fal Try-On returned an invalid image.');
  return buffer;
}
