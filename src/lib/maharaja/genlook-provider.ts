import { createHash } from 'node:crypto';

const GENLOOK_BASE_URL = 'https://api.genlook.app/tryon/v1';
const MAX_RESULT_BYTES = 16 * 1024 * 1024;

type ProductDetails = { externalId: string; title: string; description: string };

class GenlookProviderError extends Error {
  /** Nothing was made or charged (GenLook refunds failed looks), so the next engine can run without a double charge. */
  readonly safeToFallback: boolean;
  /** A passing problem (busy, server error, network): the same request may work a moment later. */
  readonly retryable: boolean;
  /** Cached product or person id was expired or missing on GenLook's side; safe to resend whole photos. */
  readonly staleCache: boolean;
  constructor(message: string, safeToFallback: boolean, retryable = false, staleCache = false) {
    super(message);
    this.name = 'GenlookProviderError';
    this.safeToFallback = safeToFallback;
    this.retryable = retryable;
    this.staleCache = staleCache;
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
  // A customer's photo stays at GenLook for one day only.
  form.set('keepForDays', '1');
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

/** The id a garment photo is known by at GenLook: the store's product id plus the photo's own fingerprint. */
export function genlookProductId(baseExternalId: string, imageBase64: string) {
  return `${baseExternalId.slice(0, 60)}-${createHash('sha256').update(decodeBase64(imageBase64)).digest('hex').slice(0, 20)}`;
}

/** A customer photo sent to GenLook once (kept there one day); its id is then used for every look. */
export function uploadGenlookPersonImage(personBase64: string, apiKey: string) {
  return uploadImage(personBase64, apiKey, 'customer');
}

/**
 * Registers a garment at GenLook ahead of time (photo, name, exact description). It costs nothing and never
 * expires; a look then sends only the product's id, with no photo to upload and nothing to read again.
 */
export async function registerGenlookProduct(piece: { image: string; product: ProductDetails }, apiKey: string): Promise<string> {
  const bytes = decodeBase64(piece.image);
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new GenlookProviderError('Garment photo is invalid or too large.', true);
  const mime = imageMime(piece.image, bytes);
  const externalId = genlookProductId(piece.product.externalId, piece.image);
  const form = new FormData();
  form.set('photo', new Blob([new Uint8Array(bytes)], { type: mime }), `garment.${mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'}`);
  form.set('data', JSON.stringify({ externalId, title: piece.product.title, description: piece.product.description, images: [{ source: { fileKey: 'photo' } }] }));
  const response = await fetch(`${GENLOOK_BASE_URL}/products`, { method: 'POST', headers: { 'x-api-key': apiKey, Accept: 'application/json' }, body: form, signal: AbortSignal.timeout(30_000), cache: 'no-store' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new GenlookProviderError(`GenLook did not register the garment (${response.status} ${payload?.code || ''}).`, true, response.status === 429 || response.status >= 500);
  }
  return externalId;
}

export type GenlookTryOnOptions = {
  /** The customer photo's id from an earlier upload this session; without it the photo is uploaded now. */
  personImageId?: string;
  /** Product ids GenLook already holds: those are sent by id alone. */
  knownProductIds?: string[];
  /** Called with the product ids GenLook now holds after this look. */
  onProductsKnown?: (ids: string[]) => void;
};

function sendGenlookTryOnJson(personImageId: string, productIds: string[], apiKey: string, deadline: number) {
  const signal = AbortSignal.timeout(Math.max(5_000, Math.min(92_000, deadline - Date.now())));
  return fetch(`${GENLOOK_BASE_URL}/try-on/sync`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      products: productIds.map((externalId) => ({ externalId })),
      person: { image: { source: { id: personImageId } } },
      output: { watermark: false, resolution: genlookResolution() },
    }),
    signal,
    cache: 'no-store',
  });
}

async function completeGenlookSyncResponse(
  response: Response,
  payload: any,
  apiKey: string,
  startedAt: number,
  uploadedAt: number,
  deadline: number,
  timingMeta: { personReused: boolean; productById: boolean },
): Promise<Buffer> {
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
  const generatedAt = Date.now();
  // The look is made and paid for: fetch it up to three times rather than lose it to one dropped download.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await pause(800 * attempt);
    try {
      const imageResponse = await fetch(resultUrl, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
      if (!imageResponse.ok) continue;
      if (Number(imageResponse.headers.get('content-length') || 0) > MAX_RESULT_BYTES) break;
      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      if (buffer.length && buffer.length <= MAX_RESULT_BYTES) {
        // Where a look's seconds go: our upload, GenLook's own generation, and fetching the result.
        console.info('GenLook timing', {
          uploadMs: uploadedAt - startedAt,
          generateMs: generatedAt - uploadedAt,
          downloadMs: Date.now() - generatedAt,
          resolution: genlookResolution(),
          ...timingMeta,
          running: response.headers.get('x-ratelimit-remaining'),
        });
        return buffer;
      }
    } catch {
      // try again
    }
  }
  throw new GenlookProviderError('GenLook made the look, but it could not be downloaded.', false);
}

/**
 * Pure ID fast path for pre-warmed garments and an already uploaded customer photo: skips all base64/Sharp
 * preparation on the server and fires `/try-on/sync` immediately with JSON IDs. Throws `staleCache: true`
 * (safeToFallback: true) if GenLook reports a missing product or expired customer photo so the caller can
 * fall back seamlessly to uploading the full photos once.
 */
export async function generateGenlookTryOnById(personImageId: string, productIds: string[], apiKey: string, budgetMs = 150_000): Promise<Buffer> {
  const startedAt = Date.now();
  const deadline = startedAt + budgetMs;
  let response: Response;
  try {
    response = await sendGenlookTryOnJson(personImageId, productIds, apiKey, deadline);
  } catch {
    throw new GenlookProviderError('GenLook did not answer in time.', false, true);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(payload?.code || '');
    const staleCache = (response.status === 400 || response.status === 404) && /PRODUCT_NOT_FOUND|IMAGE|NOT_FOUND/.test(code);
    console.warn(`GenLook ID fast-path refused: ${response.status} ${code} ${payload?.message || ''}`);
    throw new GenlookProviderError(
      `GenLook could not create this try-on (${response.status} ${code}).`,
      true,
      response.status === 429 || response.status >= 500,
      staleCache,
    );
  }
  return completeGenlookSyncResponse(response, payload, apiKey, startedAt, startedAt, deadline, {
    personReused: true,
    productById: true,
  });
}

/**
 * One try-on with GenLook. `garmentBase64` is one product photo, or several pieces of a set (shirt and
 * veshti, kurta and pyjama...), each sent as its own product so GenLook dresses every piece as itself.
 * GenLook charges 1 credit for one product and 2 for several.
 * The fast path: the customer photo by its id and the garment by its product id, so nothing is uploaded and
 * GenLook reuses what it already knows about the garment. A product or photo GenLook no longer has is sent
 * again in the same call.
 */
export async function generateGenlookTryOn(personBase64: string, garmentBase64: string | Array<{ image: string; product: ProductDetails }>, apiKey: string, product?: ProductDetails, budgetMs = 220_000, options: GenlookTryOnOptions = {}): Promise<Buffer> {
  // The whole look (upload, make, download) must finish inside budgetMs, so a backup engine still has time.
  const startedAt = Date.now();
  const deadline = startedAt + budgetMs;
  let personImageId = options.personImageId || await uploadImage(personBase64, apiKey, 'customer');
  let personReused = Boolean(options.personImageId);
  const uploadedAt = Date.now();
  const pieces = (Array.isArray(garmentBase64) ? garmentBase64.slice(0, 4) : [{ image: garmentBase64, product: product! }]).map((piece) => {
    const bytes = decodeBase64(piece.image);
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new GenlookProviderError('Garment photo is invalid or too large.', true);
    return { ...piece, bytes, externalId: genlookProductId(piece.product.externalId, piece.image) };
  });
  const known = new Set(options.knownProductIds || []);
  let byId = pieces.every((piece) => known.has(piece.externalId));

  const send = async () => {
    if (byId) {
      return sendGenlookTryOnJson(personImageId, pieces.map((piece) => piece.externalId), apiKey, deadline);
    }
    const signal = AbortSignal.timeout(Math.max(5_000, Math.min(92_000, deadline - Date.now())));
    const form = new FormData();
    const products = pieces.map((piece, index) => {
      const mime = imageMime(piece.image, piece.bytes);
      const fileKey = `product${index}`;
      form.set(fileKey, new Blob([new Uint8Array(piece.bytes)], { type: mime }), `garment-${index}.${mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'}`);
      return { externalId: piece.externalId, title: piece.product.title, description: piece.product.description, images: [{ source: { fileKey } }] };
    });
    // GenLook's own account logo is off: every store's look carries only that store's logo (added by us).
    form.set('data', JSON.stringify({ products, person: { image: { source: { id: personImageId } } }, output: { watermark: false, resolution: genlookResolution() } }));
    return fetch(`${GENLOOK_BASE_URL}/try-on/sync`, { method: 'POST', headers: { 'x-api-key': apiKey, Accept: 'application/json' }, body: form, signal, cache: 'no-store' });
  };

  let response: Response;
  let payload: any = {};
  for (let round = 0; ; round += 1) {
    try { response = await send(); } catch { throw new GenlookProviderError('GenLook did not answer in time.', false, true); }
    payload = await response.json().catch(() => ({}));
    if (response.ok || round >= 2) break;
    const code = String(payload?.code || '');
    // GenLook no longer has the product: send it whole, as a first look does.
    if (byId && code === 'PRODUCT_NOT_FOUND') { byId = false; continue; }
    // GenLook no longer has the customer photo from earlier: upload it again.
    if (personReused && (response.status === 400 || response.status === 404) && /IMAGE|NOT_FOUND/.test(code) && code !== 'PRODUCT_NOT_FOUND') {
      personImageId = await uploadImage(personBase64, apiKey, 'customer');
      personReused = false;
      continue;
    }
    break;
  }
  if (!response.ok) {
    // GenLook's own reason (for example INVALID_IMAGE) is what tells us why the backup engine was used.
    // A refused or failed look is not charged (GenLook refunds failures), so the backup can always run.
    console.warn(`GenLook try-on refused: ${response.status} ${payload?.code || ''} ${payload?.message || ''}`);
    throw new GenlookProviderError(`GenLook could not create this try-on (${response.status} ${payload?.code || ''}).`, true, response.status === 429 || response.status >= 500);
  }
  options.onProductsKnown?.(pieces.map((piece) => piece.externalId));
  return completeGenlookSyncResponse(response, payload, apiKey, startedAt, uploadedAt, deadline, {
    personReused,
    productById: byId,
  });
}

/**
 * GenLook's result size: 'default' (1200 px on the long side, 1 credit, the faster one) unless
 * GENLOOK_RESOLUTION=2k (about 2048 px, 1 extra credit, a few seconds slower).
 */
export function genlookResolution(): '2k' | 'default' {
  // Speed first: the default size (1200 px, 1 credit) is a few seconds faster than 2K and half the credits.
  // GENLOOK_RESOLUTION=2k asks for the larger look.
  return String(process.env.GENLOOK_RESOLUTION || 'default').trim().toLowerCase() === '2k' ? '2k' : 'default';
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

/** True when GenLook did not recognize a cached product or customer photo id (safe to resend whole photos). */
export function isGenlookCacheMiss(error: unknown) {
  return error instanceof GenlookProviderError && error.staleCache;
}
