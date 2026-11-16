import { createHash } from 'node:crypto';

const GENLOOK_BASE_URL = 'https://api.genlook.app/tryon/v1';
const MAX_RESULT_BYTES = 16 * 1024 * 1024;

type ProductDetails = { externalId: string; title: string; description: string };

class GenlookProviderError extends Error {
  /** Nothing was made or charged (GenLook refunds failed looks), so the next engine can run without a double charge. */
  readonly safeToFallback: boolean;
  /** A passing problem (busy, server error, network): the same request may work a moment later. */
  readonly retryable: boolean;
  constructor(message: string, safeToFallback: boolean, retryable = false) {
    super(message);
    this.name = 'GenlookProviderError';
    this.safeToFallback = safeToFallback;
    this.retryable = retryable;
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function decodeBase64(value: string) {
  return Buffer.from(value.replace(/^data:image\/[a-zA-Z+]+;base64,/, ''), 'base64');
}

function imageMime(value: string, bytes: Buffer) {
  const declared = value.match(/^data:(image\/(?:jpeg|png|webp));base64,/)?.[1];
  if (declared) return declared;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  throw new GenlookProviderError('Please use a JPEG, PNG or WebP photo.', true);
}

/** The GenLook account's remaining credits (1 credit per standard Try-On image). */
export async function getGenlookCredits(apiKey: string): Promise<{ ok: true; creditBalance: number } | { ok: false; error: string }> {
  try {
    const response = await fetch(`${GENLOOK_BASE_URL}/account/credits`, { headers: { 'x-api-key': apiKey }, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) return { ok: false, error: 'The GenLook key is invalid or inactive.' };
    if (!response.ok || typeof data?.creditBalance !== 'number') return { ok: false, error: 'GenLook did not return a credit balance.' };
    return { ok: true, creditBalance: data.creditBalance };
  } catch {
    return { ok: false, error: 'GenLook could not be reached.' };
  }
}

async function uploadImage(base64: string, apiKey: string, label: string) {
  const bytes = decodeBase64(base64);
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new GenlookProviderError(`${label} image is invalid or too large for GenLook.`, true);
  const mime = imageMime(base64, bytes);
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(bytes)], { type: mime }), `${label}.${mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'}`);
  // GenLook's default crops to 4:5 around the person and invents what the photo does not show (legs,
  // shoes). Keeping the customer's own framing makes the look match the photo they took.
  form.set('crop', 'false');
  // An upload makes nothing and costs nothing, so a busy or dropped upload is simply sent again once.
  let response: Response | null = null;
  for (let attempt = 0; attempt < 2 && !response?.ok; attempt += 1) {
    if (attempt) await pause(1200);
    try {
      response = await fetch(`${GENLOOK_BASE_URL}/images/upload`, { method: 'POST', headers: { 'x-api-key': apiKey }, body: form, signal: AbortSignal.timeout(30_000), cache: 'no-store' });
      if (!response.ok && response.status !== 429 && response.status < 500) break;
    } catch {
      response = null;
    }
  }
  if (!response) throw new GenlookProviderError('GenLook photo upload did not complete.', true, true);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload?.imageId !== 'string') {
    console.warn(`GenLook rejected the ${label} image: ${response.status} ${payload?.code || ''} ${payload?.message || ''}`);
    throw new GenlookProviderError(`GenLook rejected the ${label} image (${response.status} ${payload?.code || ''}).`, true, response.status === 429 || response.status >= 500);
  }
  return payload.imageId as string;
}

function safeResultUrl(value: unknown) {
  if (typeof value !== 'string') throw new GenlookProviderError('GenLook returned no result image.', false);
  let url: URL;
  try { url = new URL(value); } catch { throw new GenlookProviderError('GenLook returned an invalid result location.', false); }
  if (url.protocol !== 'https:' || /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) throw new GenlookProviderError('GenLook returned an untrusted result location.', false);
  return url;
}

/**
 * One try-on with GenLook. `garmentBase64` is one product photo, or several pieces of a set (shirt and
 * veshti, kurta and pyjama...), each sent as its own product so GenLook dresses every piece as itself.
 * GenLook charges 1 credit for one product and 2 for several.
 */
export async function generateGenlookTryOn(personBase64: string, garmentBase64: string | Array<{ image: string; product: ProductDetails }>, apiKey: string, product?: ProductDetails, budgetMs = 220_000): Promise<Buffer> {
  // The whole look (upload, make, download) must finish inside budgetMs, so a backup engine still has time.
  const deadline = Date.now() + budgetMs;
  const personImageId = await uploadImage(personBase64, apiKey, 'customer');
  const pieces = Array.isArray(garmentBase64) ? garmentBase64.slice(0, 4) : [{ image: garmentBase64, product: product! }];
  const form = new FormData();
  const products = pieces.map((piece, index) => {
    const bytes = decodeBase64(piece.image);
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new GenlookProviderError('Garment photo is invalid or too large.', true);
    const mime = imageMime(piece.image, bytes);
    const fileKey = `product${index}`;
    form.set(fileKey, new Blob([new Uint8Array(bytes)], { type: mime }), `garment-${index}.${mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'}`);
    const externalId = `${piece.product.externalId.slice(0, 60)}-${createHash('sha256').update(bytes).digest('hex').slice(0, 20)}`;
    return { externalId, title: piece.product.title, description: piece.product.description, images: [{ source: { fileKey } }] };
  });
  // GenLook's own account logo is off: every store's look carries only that store's logo (added by us).
  form.set('data', JSON.stringify({ products, person: { image: { source: { id: personImageId } } }, output: { watermark: false, resolution: genlookResolution() } }));
  let response: Response;
  try {
    response = await fetch(`${GENLOOK_BASE_URL}/try-on/sync`, {
      method: 'POST', headers: { 'x-api-key': apiKey, Accept: 'application/json' },
      body: form,
      signal: AbortSignal.timeout(Math.max(5_000, Math.min(92_000, deadline - Date.now()))), cache: 'no-store',
    });
  } catch { throw new GenlookProviderError('GenLook did not answer in time.', false, true); }
  let payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    // GenLook's own reason (for example INVALID_IMAGE) is what tells us why the backup engine was used.
    // A refused or failed look is not charged (GenLook refunds failures), so the backup can always run.
    console.warn(`GenLook try-on refused: ${response.status} ${payload?.code || ''} ${payload?.message || ''}`);
    throw new GenlookProviderError(`GenLook could not create this try-on (${response.status} ${payload?.code || ''}).`, true, response.status === 429 || response.status >= 500);
  }
  // The sync endpoint may return 202 after 90 seconds while generation continues.
  if (response.status === 202 && typeof payload?.generationId === 'string') {
    const generationId = encodeURIComponent(payload.generationId);
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      let poll: Response;
      try {
        poll = await fetch(`${GENLOOK_BASE_URL}/generations/${generationId}`, { headers: { 'x-api-key': apiKey }, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
      } catch { continue; }
      if (!poll.ok) continue;
      payload = await poll.json().catch(() => ({}));
      if (payload?.status === 'FAILED') throw new GenlookProviderError('GenLook could not create this look.', true, true);
      if (payload?.status === 'COMPLETED' && payload?.resultImageUrl) break;
    }
    if (!payload?.resultImageUrl) throw new GenlookProviderError('GenLook did not finish in time.', false);
  }
  const resultUrl = safeResultUrl(payload?.resultImageUrl);
  // The look is made and paid for: fetch it up to three times rather than lose it to one dropped download.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await pause(800 * attempt);
    try {
      const imageResponse = await fetch(resultUrl, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
      if (!imageResponse.ok) continue;
      if (Number(imageResponse.headers.get('content-length') || 0) > MAX_RESULT_BYTES) break;
      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      if (buffer.length && buffer.length <= MAX_RESULT_BYTES) return buffer;
    } catch {
      // try again
    }
  }
  throw new GenlookProviderError('GenLook made the look, but it could not be downloaded.', false);
}

/**
 * GenLook's result size: '2k' (about 2048 px, sharp on a 43-inch TV; 1 extra credit) unless
 * GENLOOK_RESOLUTION=default (1200 px on the long side).
 */
export function genlookResolution(): '2k' | 'default' {
  return String(process.env.GENLOOK_RESOLUTION || '2k').trim().toLowerCase() === 'default' ? 'default' : '2k';
}

/** GenLook credits one look uses: 1, plus 1 for a 2K result. */
export function genlookCreditsPerLook() {
  return genlookResolution() === '2k' ? 2 : 1;
}

export function canFallbackFromGenlook(error: unknown) {
  return error instanceof GenlookProviderError && error.safeToFallback;
}

/** Whether the same GenLook request is worth sending again (busy, server error, network). */
export function canRetryGenlook(error: unknown) {
  return error instanceof GenlookProviderError && error.retryable;
}
