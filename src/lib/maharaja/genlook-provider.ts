const GENLOOK_BASE_URL = 'https://api.genlook.app/tryon/v1';
const MAX_RESULT_BYTES = 16 * 1024 * 1024;

type ProductDetails = { externalId: string; title: string; description: string };

class GenlookProviderError extends Error {
  constructor(message: string, readonly safeToFallback: boolean) {
    super(message);
    this.name = 'GenlookProviderError';
  }
}

function decodeBase64(value: string) {
  return Buffer.from(value.replace(/^data:image\/[a-zA-Z+]+;base64,/, ''), 'base64');
}

async function uploadImage(base64: string, apiKey: string, label: string) {
  const bytes = decodeBase64(base64);
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new GenlookProviderError(`${label} image is invalid or too large for GenLook.`, true);
  const mime = base64.match(/^data:(image\/(?:jpeg|png|webp));base64,/)?.[1] || 'image/jpeg';
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(bytes)], { type: mime }), `${label}.${mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'}`);
  let response: Response;
  try {
    response = await fetch(`${GENLOOK_BASE_URL}/images/upload`, { method: 'POST', headers: { 'x-api-key': apiKey }, body: form, signal: AbortSignal.timeout(30_000), cache: 'no-store' });
  } catch { throw new GenlookProviderError('GenLook photo upload did not complete.', false); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload?.imageId !== 'string') throw new GenlookProviderError(`GenLook rejected the ${label} image.`, true);
  return payload.imageId as string;
}

function safeResultUrl(value: unknown) {
  if (typeof value !== 'string') throw new GenlookProviderError('GenLook returned no result image.', false);
  let url: URL;
  try { url = new URL(value); } catch { throw new GenlookProviderError('GenLook returned an invalid result location.', false); }
  if (url.protocol !== 'https:' || /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) throw new GenlookProviderError('GenLook returned an untrusted result location.', false);
  return url;
}

export async function generateGenlookTryOn(personBase64: string, garmentBase64: string, apiKey: string, product: ProductDetails): Promise<Buffer> {
  const personImageId = await uploadImage(personBase64, apiKey, 'customer');
  const garmentBytes = decodeBase64(garmentBase64);
  if (!garmentBytes.length || garmentBytes.length > 10 * 1024 * 1024) throw new GenlookProviderError('Garment photo is invalid or too large.', true);
  const garmentMime = garmentBase64.match(/^data:(image\/(?:jpeg|png|webp));base64,/)?.[1] || 'image/jpeg';
  const form = new FormData();
  form.set('data', JSON.stringify({ products: [{ externalId: product.externalId, title: product.title, description: product.description, images: [{ source: { fileKey: 'product' } }] }], person: { image: { source: { id: personImageId } } } }));
  form.set('product', new Blob([new Uint8Array(garmentBytes)], { type: garmentMime }), `garment.${garmentMime === 'image/png' ? 'png' : garmentMime === 'image/webp' ? 'webp' : 'jpg'}`);
  let response: Response;
  try {
    response = await fetch(`${GENLOOK_BASE_URL}/try-on/sync`, {
      method: 'POST', headers: { 'x-api-key': apiKey, Accept: 'application/json' },
      body: form,
      signal: AbortSignal.timeout(100_000), cache: 'no-store',
    });
  } catch { throw new GenlookProviderError('GenLook generation outcome is uncertain.', false); }
  let payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new GenlookProviderError('GenLook could not create this try-on.', response.status < 500);
  // The sync endpoint may return 202 after 90 seconds while generation continues.
  if (response.status === 202 && typeof payload?.generationId === 'string') {
    const generationId = encodeURIComponent(payload.generationId);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      let poll: Response;
      try {
        poll = await fetch(`${GENLOOK_BASE_URL}/generations/${generationId}`, { headers: { 'x-api-key': apiKey }, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
      } catch { throw new GenlookProviderError('GenLook is still processing this look. Please ask staff to check before retrying.', false); }
      if (!poll.ok) throw new GenlookProviderError('GenLook result could not be checked.', false);
      payload = await poll.json().catch(() => ({}));
      if (payload?.status === 'FAILED') throw new GenlookProviderError('GenLook could not create this look.', true);
      if (payload?.status === 'COMPLETED' && payload?.resultImageUrl) break;
    }
  }
  const resultUrl = safeResultUrl(payload?.resultImageUrl);
  const imageResponse = await fetch(resultUrl, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
  if (!imageResponse.ok) throw new GenlookProviderError('GenLook completed but the result could not be delivered.', false);
  if (Number(imageResponse.headers.get('content-length') || 0) > MAX_RESULT_BYTES) throw new GenlookProviderError('GenLook result image is too large.', false);
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_RESULT_BYTES) throw new GenlookProviderError('GenLook returned an invalid result image.', false);
  return buffer;
}

export function canFallbackFromGenlook(error: unknown) {
  return error instanceof GenlookProviderError && error.safeToFallback;
}
