import { createHash } from 'crypto';
import { savePhoneLook } from '@/lib/maharaja/phone-looks';
import { resultExpiresAtIso, resultExpiresAtMs } from '@/lib/maharaja/retention';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { AI_CONFIG } from '@/lib/ai/config';
import { GoogleGenAI } from '@google/genai';
import { type CustomerCategory, type GarmentType, GARMENT_TYPE_RULES, GENLOOK_GARMENT_DESCRIPTIONS, isEventId, buildTryOnPrompt, customerRateLimit } from '@/lib/maharaja/config';
import { buildVideoMasterPrompt, getVideoConcept, VIDEO_PROMPT_ARCHITECTURE_VERSION } from '@/lib/maharaja/video-concepts';
import { SPEND_CAP_MESSAGE, recordAiCost, spendAllowed } from '@/lib/maharaja/usage-ledger';
import { claimPassDevice, tryOnMinimumFor, moduleLimit, acquirePassImageLock, finishTryOnGrant, getCampaignEntitlementForPass, getCustomerServiceAllowances, incrementPassUsage, issueTryOnGrant, logMaharajaActivity, releaseGenlookCredit, reserveGenlookCredit, markPassTryOnImageDone, markPassVideoMasterDone, releaseMaharajaUsage, releasePassImageLock, reserveMaharajaUsage, reserveTryOnGrant, validTryOnDeviceId, verifyMaharajaAccess } from '@/lib/maharaja/server';
import { applyMaharajaWatermark } from '@/lib/maharaja/watermark';
import { tryOnEngineOrder, generateFalTryOn } from '@/lib/maharaja/try-on-provider';
import { canFallbackFromGenlook, generateGenlookTryOn } from '@/lib/maharaja/genlook-provider';
import { generateFashnTryOn } from '@/lib/maharaja/fashn-provider';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { activeClientId, bindClient } from '@/lib/maharaja/client-context';
import { garmentTypeFor } from '@/lib/maharaja/garment-type';

/** Photo-processing consent texts the server accepts: the current one first. */
const CONSENT_VERSIONS = ['2026-11-privacy-v4', '2026-10-privacy-v3'];
export const maxDuration = 300;
const MAX_SOURCE_IMAGE_BYTES = 8 * 1024 * 1024;

export async function GET(req: NextRequest) {
  if (!verifyOperatorRequest(req)) return NextResponse.json({ error: 'Operator sign-in required.' }, { status: 401 });
  return NextResponse.json({
    genlookConfigured: Boolean(AI_CONFIG.GENLOOK_API_KEY?.trim()),
    falBackupConfigured: Boolean(process.env.FAL_KEY?.trim()),
    geminiConfigured: Boolean(AI_CONFIG.PRIMARY_API_KEY?.trim()),
    geminiModel: AI_CONFIG.GEMINI_IMAGE_MODEL,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

function getGenAIClient() {
  const apiKey = AI_CONFIG.PRIMARY_API_KEY;
  if (!apiKey || apiKey.trim() === '') return null;
  try {
    return new GoogleGenAI({ apiKey });
  } catch (err) {
    return null;
  }
}

function formatGeminiImageError(error: any) {
  const raw = error?.message || String(error || 'Unknown Gemini error.');
  const lower = raw.toLowerCase();

  if (lower.includes('resource_exhausted') || lower.includes('quota') || lower.includes('free tier')) {
    return 'Image generation is temporarily unavailable because the service limit was reached. Please ask our staff for help.';
  }

  if (lower.includes('api key') || lower.includes('permission') || lower.includes('unauthenticated')) {
    return 'Try-On needs attention from our staff. Please try again in a moment.';
  }

  if (lower.includes('model') || lower.includes('not found')) {
    return 'The image service is temporarily unavailable. Please ask our staff for help.';
  }

  if (/safety|blocked|policy/.test(lower)) return 'These photos could not be processed. Please use a clear, appropriate customer and garment photo.';
  if (/timeout|timed out|deadline|abort/.test(lower)) return 'Image generation took too long. Please check your connection and try again.';
  if (/photo|source/.test(lower)) return 'The uploaded photos could not be read. Please add them again and retry.';
  return 'We couldn’t create your look. Please try again, or ask our staff for help.';
}

async function resolveImageBase64(input: unknown, bucket: any, sessionId: string, allowedCataloguePath = ''): Promise<string> {
  if (typeof input !== 'string' || !input.trim()) return '';
  const trimmed = input.trim();
  if (trimmed.startsWith('data:image/')) {
    return trimmed.split(',')[1] || trimmed;
  }
  if (trimmed.startsWith('/images/catalogue-demo/') || trimmed.startsWith('/images/maharaja-client/')) {
    const publicRoot = path.resolve(process.cwd(), 'public');
    const publicFilePath = path.resolve(publicRoot, `.${trimmed}`);
    if (!publicFilePath.startsWith(`${publicRoot}${path.sep}`)) throw new Error('Invalid catalogue photo path.');
    const buffer = await fs.readFile(publicFilePath);
    if (buffer.byteLength > MAX_SOURCE_IMAGE_BYTES) throw new Error('Catalogue photo exceeds the 8 MB processing limit.');
    return buffer.toString('base64');
  }
  const expectedPrefix = `clients/${activeClientId()}/sessions/${sessionId}/`;
  if (!trimmed.startsWith(expectedPrefix) && trimmed !== allowedCataloguePath) throw new Error('Photo source does not belong to this customer session.');
  const mockStore = getMockStore();
  const mockBlob = mockStore.sessions?.get(`mock_blob_${trimmed}`);
  if (mockBlob?.buffer) {
    return mockBlob.buffer.toString('base64');
  }
  if (bucket) {
    try {
      const file = bucket.file(trimmed);
      const [buffer] = await file.download();
      if (buffer.byteLength > MAX_SOURCE_IMAGE_BYTES) throw new Error('Uploaded photo exceeds the 8 MB processing limit.');
      const textCheck = buffer.toString('utf8', 0, 32);
      if (textCheck !== 'mock_file_content') {
        return buffer.toString('base64');
      }
    } catch (err) {
      console.warn('Storage file download warning:', err);
    }
  }
  throw new Error('Customer photo could not be read from secure storage.');
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let referencesReadyAt = 0;
  let imageReadyAt = 0;
  let imageProvider = 'gemini';
  let genlookAttempted = false;
  let genlookOutcomeUncertain = false;
  let falTryOnAttempted = false;
  let geminiAttempted = false;
  let storageReadyAt = 0;
  let reservedDeviceId = '';
  let reservedSessionId = '';
  let lockedPassCode = '';
  let boundGenerationId: string | undefined;
  let imageCompleted = false;
  let reservedTryOnCredit = false;
  try {
    const body = await req.json();
    const { sessionId, garmentAnalysis, personAnalysis, personPhoto, garmentPhotos, garmentRoles, conceptPrompt, templateId, accessCode } = body;
    const service = body.service === 'try-on' ? 'try-on' : 'ai-video';
    if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{8,120}$/.test(sessionId)) {
      return NextResponse.json({ success: false, error: 'Please reload the page and try again.' }, { status: 400 });
    }
    // A screen left open across a release still sends the previous version; both are accepted and recorded.
    const consentVersion = CONSENT_VERSIONS.includes(body.consentVersion) ? String(body.consentVersion) : '';
    if (body.processingConsent !== true || !consentVersion) {
      return NextResponse.json({ success: false, error: 'Photo processing permission is required before generation.' }, { status: 400 });
    }
    if ((body.templateId === 'girl' || body.templateId === 'boy') && body.guardianProcessingConsent !== true) {
      return NextResponse.json({ success: false, error: 'Parent or legal guardian permission is required for child photo processing.' }, { status: 400 });
    }
    const access = await verifyMaharajaAccess(req, accessCode, service);
    bindClient(access.allowed ? access.clientId : null);
    if (!access.allowed) {
      return NextResponse.json({ success: false, error: access.error }, { status: 401 });
    }
    if (access.pass && validTryOnDeviceId(body.deviceId) && !await claimPassDevice(access.pass.code, body.deviceId)) {
      return NextResponse.json({ success: false, error: 'This QR is already open on another phone.' }, { status: 403 });
    }
    // Customer QR codes and passes are phone sessions; kiosk sessions say whether they are the TV or the tablet.
    const codeAccess = Boolean(access.pass) || (typeof accessCode === 'string' && accessCode.trim() !== '' && accessCode.trim() === access.workspace.tryOnCode);
    const surface = codeAccess ? 'mobile' : body.surface === 'tablet' ? 'tablet' : 'tv';
    if (access.workspace.devices?.[surface] === false) {
      const surfaceLabel = surface === 'mobile' ? 'Mobile' : surface === 'tablet' ? 'Tablet' : 'Interactive TV';
      return NextResponse.json({ success: false, error: `${surfaceLabel} experience is currently turned off for this store.` }, { status: 403 });
    }
    if (!await spendAllowed()) {
      return NextResponse.json({ success: false, error: SPEND_CAP_MESSAGE }, { status: 503 });
    }
    if (service === 'try-on') {
      // Reserved now and returned in finally if this request does not deliver an image.
      if (!await reserveMaharajaUsage('tryOnGenerated', moduleLimit(access.workspace, 'image'))) {
        return NextResponse.json({
          success: false,
          error: surface === 'mobile' ? 'Try-On is not available right now. Please contact 9994837342.' : 'AI Try-On is paused right now. Please ask our staff for help.',
        }, { status: 403 });
      }
      reservedTryOnCredit = true;
    } else {
      const videoLimit = moduleLimit(access.workspace, 'video');
      const videoUsed = Number(access.workspace.usage?.videosGenerated || 0);
      if (videoLimit <= 0 || videoUsed >= videoLimit) {
        return NextResponse.json({ success: false, error: 'AI Video is paused right now. Please ask our staff for help.' }, { status: 403 });
      }
    }
    const rateIdentity = access.pass?.code || (typeof body.deviceId === 'string' ? body.deviceId : sessionId);
    // A shopper commonly tries five or more looks in one visit; video masters stay tighter.
    const rate = await enforceRateLimit(req, `master-image:${service}`, customerRateLimit(service === 'try-on' ? 12 : 4), 10 * 60 * 1000, rateIdentity);
    if (!rate.allowed) {
      return NextResponse.json({ success: false, error: 'Image generation is temporarily limited for this customer. Please wait and try again.' }, {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfterSeconds) },
      });
    }

    // A billing pass owns exactly one Try-On image and one video master image.
    // Atomically claim the slot before calling Gemini to prevent duplicate generation.
    if (access.pass) {
      const forceRegenerate = Boolean(body.forceRegenerate || body.retry || body.isRetry);
      const lockResult = await acquirePassImageLock(access.pass.code, service, forceRegenerate);
      if (!lockResult.ok) {
        return NextResponse.json({ success: false, error: lockResult.error }, { status: 409 });
      }
      if (lockResult.existingUrl) {
        return NextResponse.json({
          success: true,
          sessionId,
          masterImageUrl: lockResult.existingUrl,
          approved: lockResult.approved || false,
          reused: true,
          operatorMessage: lockResult.approved ? 'Existing approved image returned.' : 'Pending master image returned for customer review.',
        });
      }
      boundGenerationId = lockResult.generationId;
      lockedPassCode = access.pass.code;
    }
    const eventId = isEventId(body.eventId) ? body.eventId : access.pass?.eventId || 'diwali';

    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'sessionId is required.' }, { status: 400 });
    }

    const ownershipDb = getDb();
    const existingSession = ownershipDb
      ? (await ownershipDb.collection('sessions').doc(sessionId).get()).data()
      : getMockStore().sessions.get(sessionId);
    if (existingSession?.accessCode && existingSession.accessCode !== accessCode) {
      return NextResponse.json({ success: false, error: 'This media session belongs to another customer pass.' }, { status: 403 });
    }

    const personInput = body.personPhotoStoragePath || body.personPhotoUrl || personPhoto;
    const cataloguePath = access.pass?.experienceType === 'catalogue-gift' ? String(access.pass.catalogueStoragePath || '') : '';
    const garmentInputs: string[] = cataloguePath ? [cataloguePath] : (Array.isArray(body.garmentPhotoStoragePaths) && body.garmentPhotoStoragePaths.length > 0)
      ? body.garmentPhotoStoragePaths
      : (Array.isArray(body.garmentPhotoUrls) && body.garmentPhotoUrls.length > 0)
      ? body.garmentPhotoUrls
      : (Array.isArray(garmentPhotos) ? garmentPhotos : []);

    if (!personInput) {
      return NextResponse.json(
        { success: false, error: 'Customer photo is missing. Upload one clear customer photo before generating the AI image.' },
        { status: 400 }
      );
    }

    if (!Array.isArray(garmentInputs) || garmentInputs.length === 0) {
      return NextResponse.json(
        { success: false, error: access.pass?.experienceType === 'catalogue-gift' ? 'Select a catalogue garment before creating your portrait.' : 'Add a garment photo before creating your look.' },
        { status: 400 }
      );
    }
    // Try-On uses only the one try-on garment photo (retries too); the AI Video portrait may use two.
    const maxGarmentPhotos = service === 'ai-video' ? 2 : 1;
    if (garmentInputs.length > maxGarmentPhotos) {
      return NextResponse.json({
        success: false,
        error: service === 'ai-video' ? 'Use up to 2 outfit photos for AI Video.' : 'Try-On uses one outfit photo.',
      }, { status: 400 });
    }

    if (service === 'try-on' && !access.pass && accessCode === access.workspace.tryOnCode) {
      const requirePriceTag = tryOnMinimumFor(access.workspace) > 0;
      if (!validTryOnDeviceId(body.deviceId)) return NextResponse.json({ success: false, error: 'Please reload the page and try again.' }, { status: 400 });
      let token = typeof body.tryOnGrant === 'string' ? body.tryOnGrant : '';
      if (!requirePriceTag && !token) {
        // The Wall QR on a phone: one Try-On (and one hidden retry) per phone, always.
        const grant = await issueTryOnGrant(body.deviceId, 0, true);
        if (!grant.allowed) return NextResponse.json({ success: false, error: grant.error }, { status: 409 });
        token = grant.token;
      }
      if (!token) return NextResponse.json({ success: false, error: 'Scan and verify a garment price tag of ₹500 or above first.' }, { status: 403 });
      const reservation = await reserveTryOnGrant(body.deviceId, token, sessionId, true);
      if (!reservation.allowed) return NextResponse.json({ success: false, error: reservation.error }, { status: 409 });
      reservedDeviceId = body.deviceId; reservedSessionId = sessionId;
    }

    const nowIso = new Date().toISOString();
    const ai = getGenAIClient();
    if (!ai && (service === 'ai-video' || (!AI_CONFIG.GENLOOK_API_KEY?.trim() && !process.env.FAL_KEY?.trim()))) {
      if (reservedDeviceId) await finishTryOnGrant(reservedDeviceId, reservedSessionId, false);
      return NextResponse.json(
        { success: false, error: 'Try-On is unavailable right now. Please try again shortly.' },
        { status: 503 }
      );
    }
    const bucket = getStorageBucket();
    if (!bucket) {
      if (reservedDeviceId) await finishTryOnGrant(reservedDeviceId, reservedSessionId, false);
      return NextResponse.json(
        { success: false, error: 'Try-On is unavailable right now. Please ask our staff.' },
        { status: 503 }
      );
    }

    let masterImageUrl = '';
    let videoPersonPath: string | undefined;
    let videoGarmentPaths: string[] = [];
    let referenceSaving: Promise<unknown> | null = null;
    const customerCategory: CustomerCategory = ['women', 'men', 'girl', 'boy'].includes(templateId) ? templateId : 'women';
    if (body.garmentTypeConfirmed !== true) {
      return NextResponse.json({ success: false, error: 'Choose and confirm the garment type before generating. This keeps every garment structure and reference role explicit.' }, { status: 400 });
    }
    const garmentType = garmentTypeFor({ audience: customerCategory, categoryId: body.catalogueProductCategory, storedType: body.garmentType, title: body.catalogueProductTitle, analysis: garmentAnalysis, roles: garmentRoles });
    const concept = service === 'ai-video' ? getVideoConcept(body.conceptId) : null;
    if (service === 'ai-video' && (!concept || concept.category !== customerCategory)) {
      return NextResponse.json({ success: false, error: 'Select one film concept for the chosen customer category before generating.' }, { status: 400 });
    }
    const sanitizedGarmentRoles = Array.isArray(garmentRoles)
      ? garmentRoles.slice(0, garmentInputs.length).map((role: unknown) => String(role))
      : [];

    try {
        const contents: any[] = [];

        const sourceReferences = await Promise.all([
          resolveImageBase64(personInput, bucket, sessionId),
          ...garmentInputs.map((input) => resolveImageBase64(input, bucket, sessionId, cataloguePath)),
        ]);
        const maxDim = service === 'try-on' ? 1280 : 1792;
        const jpegQuality = service === 'try-on' ? 86 : 92;
        const chromaSubsampling = service === 'try-on' ? '4:2:0' : '4:4:4';
        const targetPersonWidth = service === 'try-on' ? 720 : 1080;
        const targetPersonHeight = service === 'try-on' ? 1280 : 1920;
        const preparedReferences = await Promise.all(
          sourceReferences.map(async (source, index) => {
            const pipeline = sharp(Buffer.from(source, 'base64')).rotate();
            // Person photo (Image 1) must always be strictly in vertical format (9:16) for TV kiosk and try-on.
            // Using Sharp's native cover resize after .rotate() handles EXIF orientation safely in one pass.
            if (index === 0) {
              return pipeline
                .resize(targetPersonWidth, targetPersonHeight, { fit: 'cover', position: 'centre' })
                .jpeg({ quality: jpegQuality, progressive: true, chromaSubsampling })
                .toBuffer();
            }
            return pipeline
              .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: jpegQuality, progressive: true, chromaSubsampling })
              .toBuffer();
          })
        );
        const [personBase64, ...garmentBase64s] = preparedReferences.map((image) => image.toString('base64'));
        // GenLook keeps the customer's own framing (no 9:16 crop) and gets sharper photos than Gemini needs.
        const genlookSources = service === 'try-on'
          ? await Promise.all(sourceReferences.slice(0, 2).map(async (source) => {
            // GenLook refuses photos it finds too small ("resolution too low"): small store images and
            // compressed phone photos are enlarged to at least 1200 px on the long side, large ones capped at 1600.
            const image = sharp(Buffer.from(source, 'base64')).rotate();
            const { width = 0, height = 0 } = await image.metadata();
            const longSide = Math.max(width, height);
            const target = longSide < 1200 ? 1200 : Math.min(1600, longSide);
            return image.resize(target, target, { fit: 'inside', kernel: 'lanczos3' })
              .jpeg({ quality: 90, progressive: true })
              .toBuffer()
              .then((buffer) => buffer.toString('base64'));
          }))
          : [];
        if (service === 'ai-video') {
          videoPersonPath = `clients/${activeClientId()}/sessions/${sessionId}/person/reference.jpg`;
          videoGarmentPaths = garmentBase64s.map((_, index) => `clients/${activeClientId()}/sessions/${sessionId}/garment/reference-${index}.jpg`);
          // Saved while Gemini draws the portrait (awaited after it), not before: the customer waits for one, not both.
          referenceSaving = Promise.all([videoPersonPath, ...videoGarmentPaths].map((referencePath, index) => bucket.file(referencePath).save(preparedReferences[index], { contentType: 'image/jpeg', public: false, metadata: { cacheControl: 'private, no-store' } })));
          referenceSaving.catch(() => undefined);
        }
        if (personBase64) contents.push({ inlineData: { mimeType: 'image/jpeg', data: personBase64 } });
        // The portrait's outfit photos go to Gemini at 1280 px (as Try-On does): less to upload and read, the
        // garment detail Gemini uses is kept. The saved references stay full size for the video render.
        const geminiGarments = service === 'ai-video'
          ? await Promise.all(preparedReferences.slice(1).map((buffer) => sharp(buffer)
            .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
            .toBuffer()
            .then((small) => small.toString('base64'))))
          : garmentBase64s;
        geminiGarments.forEach((garmentBase64) => {
          if (garmentBase64) contents.push({ inlineData: { mimeType: 'image/jpeg', data: garmentBase64 } });
        });
        referencesReadyAt = Date.now();

        const roleInstructions = sanitizedGarmentRoles.length
          ? sanitizedGarmentRoles.map((role: string, idx: number) => `- Garment Image ${idx + 1} = ${role.toUpperCase()}`).join('\n')
          : '- Garment Image 1 is the exact uploaded garment reference.';

        // The AI Video portrait's garment block (the Try-On prompt carries its own and gets nothing appended).
        const categoryGarmentLine = `- ${GARMENT_TYPE_RULES[garmentType]}`;

        const garmentFidelityRules = `EXACT GARMENT ROLE & COLOR INSTRUCTIONS:
${roleInstructions}
- Preserve every garment colour, dye hue, and colour transition exactly as shown in the uploaded garment references without color shift. Do not introduce, remove, shift, warm, cool, desaturate, or reinterpret any garment colour.
- Never shift colors or alter clothing into unrequested garments or added embroidery.
${categoryGarmentLine}
- Professional model lighting must enhance clarity, contrast, and depth without altering the true dye color of any garment.`;

        let prompt = '';
        if (service === 'try-on') {
          prompt = `${buildTryOnPrompt(customerCategory, {
            audience: typeof body.templateId === 'string' ? body.templateId : customerCategory,
            categoryId: typeof body.catalogueProductCategory === 'string' ? body.catalogueProductCategory : (typeof body.category === 'string' ? body.category : undefined),
            garmentType,
            productTitle: typeof body.catalogueProductTitle === 'string' ? body.catalogueProductTitle : undefined,
          })}`;
        } else {
          const referenceHierarchy = `REFERENCE PRIORITY:
- The first image (original customer photograph) is the authoritative identity reference.
- The current garment photograph(s), identified by the explicit roles above, are the only authoritative garment-design references.
- No previous Try-On result, previous master image or prior customer output is supplied or permitted as a reference.`;

          const fullConcept = buildVideoMasterPrompt(concept!, garmentType, eventId);

          prompt = `${fullConcept}\n\n${garmentFidelityRules}\n\n${referenceHierarchy}`;
        }

        let rawBuffer: Buffer | null = null;
        // Try-On engines in order (TRYON_ENGINE_ORDER, default GenLook → fal → FASHN → Gemini); one that is not
        // configured is skipped. An engine whose
        // outcome is uncertain (it may still have made and billed the image) stops the chain: no double charge.
        // Every Try-On, the customer's retry included, uses the same engines (GenLook first); the AI Video
        // portrait uses Gemini.
        const engines = service === 'try-on' ? tryOnEngineOrder() : ['gemini' as const];
        let lastEngineError: unknown = null;
        // The outfit photo and its product name for GenLook. A set (two or three pieces in one photo) is split
        // into its pieces first, so every engine dresses each piece as itself.
        const genlookGarment = genlookSources[1] || garmentBase64s[0];
        const baseProduct = {
          // Prefixed with the store, so GenLook keeps every store's products apart.
          externalId: `${activeClientId()}-${typeof body.catalogueProductId === 'string' ? body.catalogueProductId : `customer-${garmentType}`}`,
          // A store piece keeps its own name; a customer's own outfit is named by its type.
          title: (typeof body.catalogueProductId === 'string' && typeof body.catalogueProductTitle === 'string'
            ? body.catalogueProductTitle
            : GENLOOK_GARMENT_DESCRIPTIONS[garmentType].title).slice(0, 120),
        };
        // TryFocus rule: one garment per Try-On, always sent as one piece. A customer's own photo that shows
        // two or more garments is refused before anything is made (no credit used): one garment at a time.
        let detectedSingle: GenlookPiece | null = null;
        if (service === 'try-on' && genlookGarment) {
          const ownOutfit = typeof body.catalogueProductId !== 'string';
          const found = await prepareGenlookPieces(ai, genlookGarment, garmentType, baseProduct, ownOutfit);
          if (found.length > 1 && ownOutfit) {
            return NextResponse.json({
              success: false,
              code: 'ONE_GARMENT',
              error: 'This photo shows more than one garment. Please photograph one garment at a time, laid flat or hung, the whole piece in the frame.',
            }, { status: 422 });
          }
          detectedSingle = found.length === 1 ? found[0] : null;
          // fal, FASHN and Gemini get the same cut-out own garment GenLook gets.
          if (ownOutfit && detectedSingle && detectedSingle.image !== genlookGarment) {
            garmentBase64s[0] = detectedSingle.image;
            const garmentPart = contents[1];
            if (garmentPart?.inlineData) garmentPart.inlineData.data = detectedSingle.image;
          }
        }
        for (const engine of engines) {
          if (rawBuffer) break;
          if (engine === 'genlook') {
            const key = AI_CONFIG.GENLOOK_API_KEY?.trim();
            if (!key) continue;
            // GenLook runs only on this store's own GenLook credits; with none left the next engine is used.
            if (!await reserveGenlookCredit()) continue;
            genlookAttempted = true;
            try {
              // One garment, one product: the whole photo with one exact description of that garment.
              const piece: GenlookPiece = detectedSingle || { image: genlookGarment, product: { ...baseProduct, description: (await describeGarmentForGenlook(ai, genlookGarment, garmentType)).slice(0, 500) } };
              rawBuffer = await generateGenlookTryOn(genlookSources[0] || personBase64, [piece], key);
              imageProvider = 'genlook-try-on';
            } catch (error) {
              if (!canFallbackFromGenlook(error)) {
                // GenLook may still have made and charged for the image: the store's credit stays used.
                genlookOutcomeUncertain = true;
                throw error;
              }
              await releaseGenlookCredit().catch(() => undefined);
              lastEngineError = error;
              console.warn(`GenLook Try-On failed (${error instanceof Error ? error.message : 'unknown'}); using the next image engine.`);
            }
          } else if (engine === 'fal') {
            const key = process.env.FAL_KEY?.trim();
            if (!key) continue;
            falTryOnAttempted = true;
            try {
              rawBuffer = await generateFalTryOn(personBase64, garmentBase64s[0], key);
              imageProvider = 'fal-image-apps-v2-try-on';
            } catch (falError) {
              lastEngineError = falError;
              console.warn('Fal Try-On failed; using the next image engine.', falError);
            }
          } else if (engine === 'fashn') {
            const key = process.env.FASHN_API_KEY?.trim();
            if (!key) continue;
            try {
              rawBuffer = await generateFashnTryOn(personBase64, garmentBase64s[0], key, { timeoutMs: Math.max(20_000, Math.min(60_000, startedAt + 200_000 - Date.now())) });
              imageProvider = 'fashn-tryon-v1.6';
            } catch (fashnError) {
              lastEngineError = fashnError;
              console.warn('FASHN Try-On failed; using the next image engine.', fashnError);
            }
          } else if (engine === 'gemini') {
            if (!ai) continue;
            // Stay inside the 300 s function limit so the credit and pass lock are always released in finally.
            const geminiBudgetMs = Math.min(150_000, startedAt + 280_000 - Date.now());
            if (geminiBudgetMs < 25_000) throw new Error('The image service is busy right now. Please try again in a moment.');
            contents.push(prompt);
            geminiAttempted = true;
            const geminiDeadline = Date.now() + geminiBudgetMs;
            const askGemini = (responseModalities: string[]) => ai.models.generateContent({
              model: AI_CONFIG.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image',
              contents,
              config: {
                responseModalities,
                imageConfig: { aspectRatio: '9:16' },
                abortSignal: AbortSignal.timeout(Math.max(1_000, geminiDeadline - Date.now())),
              },
            });
            let genResponse;
            try {
              // Image only: asking for text as well makes Gemini write before it draws.
              genResponse = await askGemini(['IMAGE']);
            } catch (modalityError: any) {
              // A model that refuses image-only answers 400 straight away (nothing made, nothing billed):
              // ask again the old way, text and image, within the same time budget.
              const status = Number(modalityError?.status || modalityError?.code || 0);
              if (status !== 400) throw modalityError;
              console.warn('Gemini refused image-only output; asking for text and image.', String(modalityError?.message || '').slice(0, 200));
              genResponse = await askGemini(['TEXT', 'IMAGE']);
            }
            const part = genResponse.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
            if (part?.inlineData?.data) {
              rawBuffer = Buffer.from(part.inlineData.data, 'base64');
              imageProvider = 'gemini';
            }
          }
        }
        if (!rawBuffer && !geminiAttempted) {
          throw lastEngineError || new Error('No Try-On image service is available. Please ask our staff for help.');
        }
        imageReadyAt = Date.now();
        // The AI Video references must be saved before the portrait is handed on to the video step.
        if (referenceSaving) await referenceSaving;
        if (rawBuffer) {
          await recordAiCost(service === 'try-on' ? 'try-on' : 'video-portrait');
          const finalBuffer = service === 'try-on'
            ? await applyMaharajaWatermark(rawBuffer)
            : await sharp(rawBuffer).rotate().jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
          masterImageUrl = `data:image/jpeg;base64,${finalBuffer.toString('base64')}`;

          try {
            if (service === 'try-on') {
              // Try-On is returned straight to the browser. A phone's Wall QR look is also kept for one
              // hour, so scanning the QR again shows it.
              masterImageUrl = `data:image/jpeg;base64,${finalBuffer.toString('base64')}`;
              if (reservedDeviceId) await savePhoneLook(activeClientId(), reservedDeviceId, finalBuffer);
            } else {
              const storagePath = `clients/${activeClientId()}/sessions/${sessionId}/master/master.jpg`;
              const file = bucket.file(storagePath);
              await file.save(finalBuffer, { contentType: 'image/jpeg', public: false });
              const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: resultExpiresAtMs() });
              masterImageUrl = signedUrl;
            }
            storageReadyAt = Date.now();
          } catch (storageErr) {
            console.error('Firebase Storage upload failed for master image:', storageErr);
            throw new Error(`Cloud Storage error: Failed to persist ${service} image (${storageErr instanceof Error ? storageErr.message : String(storageErr)}). Verify Firebase Storage bucket permissions.`);
          }
        } else {
          if (reservedDeviceId) await finishTryOnGrant(reservedDeviceId, reservedSessionId, false);
          return NextResponse.json(
            { success: false, error: 'An image could not be created from these photos. Please try a clearer customer and garment photo.' },
            { status: 502 }
          );
        }
    } catch (genError: any) {
      console.error('Master Image Generation Error:', genError);
      await logMaharajaActivity('image-failed', `${service === 'try-on' ? 'AI Try-On' : 'AI Video master image'} generation failed`, { sessionId, service });
      if (reservedDeviceId) await finishTryOnGrant(reservedDeviceId, reservedSessionId, false);
      return NextResponse.json(
        { success: false, error: geminiAttempted
          ? formatGeminiImageError(genError)
          : genlookAttempted && genlookOutcomeUncertain
            ? 'GenLook Try-On outcome is uncertain. Please ask staff to check before retrying; no backup request was sent.'
          : falTryOnAttempted && !imageReadyAt
            ? 'Try-On provider outcome is uncertain. Please ask staff to check before retrying; no second AI request was sent.'
            : falTryOnAttempted
              ? 'Try-On was created but could not be delivered. Please ask staff to check this result before retrying.'
              : formatGeminiImageError(genError) },
        { status: 500 }
      );
    }

    const db = getDb();

    // Try-On and video-master images live in separate fields/paths so one can never overwrite the other.
    const imageFields = service === 'try-on'
      ? {
        tryOnImageUrl: null,
        tryOnStoragePath: null,
        tryOnImageDone: true,
      }
      : {
        masterImageUrl,
        masterStoragePath: `clients/${activeClientId()}/sessions/${sessionId}/master/master.jpg`,
        personPhotoStoragePath: videoPersonPath || null,
        garmentPhotoStoragePaths: videoGarmentPaths,
        masterImageApproved: false,
        masterImageApprovedAt: null,
        masterImageApprovedUrl: null,
      };

    // Protect Firestore against 1MB document size limit if Storage was bypassed
    const safeImageFields: Record<string, unknown> = { ...imageFields };
    // Everything generated is kept one hour (see retention.ts).
    safeImageFields.expiresAt = resultExpiresAtIso();
    if (db && service === 'ai-video' && masterImageUrl.startsWith('data:') && masterImageUrl.length > 700000) {
      console.warn('Image data URI exceeds 700KB; truncating Firestore document cache to avoid 1MB document size limit.');
      safeImageFields.masterImageUrl = masterImageUrl.slice(0, 500) + '...[truncated-data-url-use-storage]';
    }

    const persistenceTasks: Promise<unknown>[] = [];
    if (db) {
      persistenceTasks.push(db.collection('sessions').doc(sessionId).set({
        sessionId,
        clientId: activeClientId(),
        accessCode: typeof accessCode === 'string' ? accessCode : null,
        service,
        eventId,
        garmentAnalysis: garmentAnalysis ?? null,
        personAnalysis: personAnalysis ?? null,
        templateId: templateId || null,
        conceptId: concept?.id || null,
        promptArchitectureVersion: service === 'ai-video' ? VIDEO_PROMPT_ARCHITECTURE_VERSION : null,
        garmentType,
        garmentRoles: sanitizedGarmentRoles.slice(0, 3),
        processingConsent: true,
        guardianProcessingConsent: customerCategory === 'girl' || customerCategory === 'boy',
        consentVersion,
        consentedAt: nowIso,
        ...safeImageFields,
        status: 'master_ready',
        updatedAt: nowIso
      }, { merge: true }));
    } else {
      const mockStore = getMockStore();
      mockStore.sessions.set(sessionId, {
        ...(mockStore.sessions.get(sessionId) || {}),
        sessionId,
        clientId: activeClientId(),
        accessCode: typeof accessCode === 'string' ? accessCode : null,
        service,
        eventId,
        garmentAnalysis: garmentAnalysis ?? null,
        personAnalysis: personAnalysis ?? null,
        templateId: templateId || null,
        conceptId: concept?.id || null,
        promptArchitectureVersion: service === 'ai-video' ? VIDEO_PROMPT_ARCHITECTURE_VERSION : null,
        garmentType,
        garmentRoles: sanitizedGarmentRoles.slice(0, 3),
        processingConsent: true,
        guardianProcessingConsent: customerCategory === 'girl' || customerCategory === 'boy',
        consentVersion,
        consentedAt: nowIso,
        ...imageFields,
        status: 'master_ready',
        updatedAt: nowIso
      });
    }

    if (access.pass) {
      const passImageUrl = (db && masterImageUrl.startsWith('data:') && masterImageUrl.length > 700000)
        ? masterImageUrl.slice(0, 500) + '...[truncated-data-url]'
        : masterImageUrl;
      persistenceTasks.push((async () => {
        await incrementPassUsage(access.pass!.code, 'imagesGenerated');
        if (service === 'try-on') {
          await markPassTryOnImageDone(access.pass!.code, '');
        } else {
          await markPassVideoMasterDone(access.pass!.code, passImageUrl, {
            conceptId: concept!.id,
            promptArchitectureVersion: VIDEO_PROMPT_ARCHITECTURE_VERSION,
            category: customerCategory,
            garmentType,
            garmentRoles: sanitizedGarmentRoles.slice(0, 2),
            referenceSessionId: sessionId,
            personPhotoStoragePath: videoPersonPath,
            garmentPhotoStoragePaths: videoGarmentPaths,
          }, boundGenerationId);
        }
      })());
    }
    const activityType: 'try-on' | 'video-master' = service === 'try-on' ? 'try-on' : 'video-master';
    persistenceTasks.push(logMaharajaActivity(activityType, `${service === 'try-on' ? 'AI Try-On' : 'AI Video master image'} generated`, { sessionId, eventId, service, provider: imageProvider }));
    if (reservedDeviceId) persistenceTasks.push(finishTryOnGrant(reservedDeviceId, reservedSessionId, true));
    await Promise.all(persistenceTasks);

    if (service === 'try-on' && bucket) {
      const sourcePaths = [body.personPhotoStoragePath, ...(Array.isArray(body.garmentPhotoStoragePaths) ? body.garmentPhotoStoragePaths : [])]
        .filter((value): value is string => typeof value === 'string' && value.startsWith(`clients/${activeClientId()}/sessions/${sessionId}/`));
      await Promise.all(sourcePaths.map((path) => bucket.file(path).delete({ ignoreNotFound: true })))
        .catch((cleanupError) => console.error('Try-On source cleanup failed:', cleanupError));
    }

    imageCompleted = true;

    const updatedEntitlement = lockedPassCode ? await getCampaignEntitlementForPass(lockedPassCode) : null;
    const updatedAllowances = getCustomerServiceAllowances(updatedEntitlement);
    const completedAt = Date.now();
    const timing = {
      referencePreparationMs: referencesReadyAt ? referencesReadyAt - startedAt : null,
      imageGenerationMs: imageReadyAt && referencesReadyAt ? imageReadyAt - referencesReadyAt : null,
      imagePersistenceMs: storageReadyAt && imageReadyAt ? storageReadyAt - imageReadyAt : null,
      totalMs: completedAt - startedAt,
    };
    console.info('Maharaja image generation timing', { sessionId, service, provider: imageProvider, conceptId: concept?.id || null, ...timing });

    return NextResponse.json({
      success: true,
      sessionId,
      masterImageUrl,
      approved: service === 'try-on',
      provider: imageProvider,
      conceptId: concept?.id || null,
      timing,
      allowances: updatedAllowances,
      operatorMessage: service === 'try-on'
        ? 'Try-On image generated successfully.'
        : 'Festival portrait generated. Customer review is required before video generation.'
    });
  } catch (error: any) {
    console.error('Master Image Route Error:', error);
    if (reservedDeviceId) await finishTryOnGrant(reservedDeviceId, reservedSessionId, false).catch(() => undefined);
    return NextResponse.json(
      { success: false, error: formatGeminiImageError(error) },
      { status: 500 }
    );
  } finally {
    if (reservedTryOnCredit && !imageCompleted) {
      await releaseMaharajaUsage('tryOnGenerated').catch((err) => console.error('Try-On credit release failed:', err));
    }
    if (lockedPassCode && !imageCompleted) {
      await releasePassImageLock(lockedPassCode, boundGenerationId).catch((err) => console.error('Image lock release failed:', err));
    }
  }
}

/**
 * One exact sentence about the garment in the photo for GenLook's product listing: sleeves, pockets,
 * collar, closure, print and colours. Saved per photo, so a store piece is described only once.
 */
async function describeGarmentForGenlook(ai: ReturnType<typeof getGenAIClient>, garmentBase64: string, garmentType: GarmentType): Promise<string> {
  const fallback = GENLOOK_GARMENT_DESCRIPTIONS[garmentType].description;
  if (!ai) return fallback;
  const hash = `${activeClientId()}-${createHash('sha256').update(garmentBase64).digest('hex').slice(0, 40)}`;
  const db = getDb();
  const cacheRef = db ? db.collection('genlookGarmentDescriptions').doc(hash) : null;
  try {
    // A saved description is reused only for the same garment type (one made under an old, wrong type is redone).
    const saved = cacheRef ? (await cacheRef.get()).data() : undefined;
    const cached = saved?.garmentType === garmentType ? saved?.description : undefined;
    if (typeof cached === 'string' && cached) return cached;
    const response = await ai.models.generateContent({
      model: AI_CONFIG.GEMINI_ANALYSIS_MODEL,
      contents: [
        { inlineData: { mimeType: 'image/jpeg', data: garmentBase64 } },
        `This photo shows a ${GENLOOK_GARMENT_DESCRIPTIONS[garmentType].title.toLowerCase()} for a virtual try-on product listing. In one plain sentence of at most 45 words, describe only the garment as it is: garment type, sleeve length, collar or neckline, how many pockets and where, closure, print or pattern, colours, fit and length. Do not mention the background, floor, hanger, person or anything not visible. No marketing words.`,
      ],
      config: { abortSignal: AbortSignal.timeout(8_000) },
    });
    const text = (response.text || '').replace(/\s+/g, ' ').trim();
    if (text.length < 15) return fallback;
    if (cacheRef) await cacheRef.set({ description: text, garmentType, createdAt: new Date().toISOString() }).catch(() => undefined);
    return text;
  } catch {
    return fallback;
  }
}

type GenlookPiece = { image: string; product: { externalId: string; title: string; description: string } };

/** The garment cut out of its photo (box on a 0-1000 scale, 4% margin), at least 1200 px for GenLook. A box
 * that already fills almost the whole photo leaves it as it is. */
async function cropToPiece(garmentBase64: string, box: number[]): Promise<string> {
  const [ymin, xmin, ymax, xmax] = box.map((n) => Math.min(1000, Math.max(0, n)));
  if ((ymax - ymin) * (xmax - xmin) > 0.85 * 1000 * 1000) return garmentBase64;
  const source = Buffer.from(garmentBase64, 'base64');
  const { width = 0, height = 0 } = await sharp(source).metadata();
  if (!width || !height) return garmentBase64;
  const padX = (xmax - xmin) * 0.04;
  const padY = (ymax - ymin) * 0.04;
  const left = Math.max(0, Math.floor(((xmin - padX) / 1000) * width));
  const top = Math.max(0, Math.floor(((ymin - padY) / 1000) * height));
  const cropWidth = Math.min(width - left, Math.ceil(((xmax - xmin + padX * 2) / 1000) * width));
  const cropHeight = Math.min(height - top, Math.ceil(((ymax - ymin + padY * 2) / 1000) * height));
  if (cropWidth < 64 || cropHeight < 64) return garmentBase64;
  const crop = await sharp(source).extract({ left, top, width: cropWidth, height: cropHeight })
    .resize(1200, 1200, { fit: 'inside', kernel: 'lanczos3' }).jpeg({ quality: 90 }).toBuffer();
  return crop.toString('base64');
}

/**
 * GenLook products for one outfit photo. A set laid out piece by piece (a shirt beside a veshti) is found by
 * Gemini, each piece cut out with its own exact description; one garment (or an on-model photo) stays one
 * product. Anything unexpected falls back to one product with one description. Saved per photo.
 */
async function prepareGenlookPieces(ai: ReturnType<typeof getGenAIClient>, garmentBase64: string, garmentType: GarmentType, base: { externalId: string; title: string }, ownOutfit = false): Promise<GenlookPiece[]> {
  const single = async () => [{ image: garmentBase64, product: { ...base, description: (await describeGarmentForGenlook(ai, garmentBase64, garmentType)).slice(0, 500) } }];
  if (!ai) return single();
  const hash = `${activeClientId()}-${createHash('sha256').update(garmentBase64).digest('hex').slice(0, 40)}`;
  const db = getDb();
  const cacheRef = db ? db.collection('genlookGarmentPieces').doc(hash) : null;
  try {
    type Found = { name: string; box: number[]; description: string };
    const savedPieces = cacheRef ? (await cacheRef.get()).data() : undefined;
    let found: Found[] | undefined = savedPieces?.garmentType === garmentType ? savedPieces?.pieces : undefined;
    if (!found) {
      const response = await ai.models.generateContent({
        model: AI_CONFIG.GEMINI_ANALYSIS_MODEL,
        contents: [
          { inlineData: { mimeType: 'image/jpeg', data: garmentBase64 } },
          `This is a product photo of a ${GENLOOK_GARMENT_DESCRIPTIONS[garmentType].title.toLowerCase()} for a virtual try-on. Find each separate garment piece shown (for example a shirt and a veshti laid side by side). Ignore labels, props, lamps, leaves, and any cloth that is only background decoration. If a person is holding the garment up in front of them, return only the held garment, never the person, their own clothes or hands. If it is one garment, or a person wearing the outfit, return one piece. Return JSON: {"pieces":[{"name":"shirt","box":[ymin,xmin,ymax,xmax],"description":"..."}]} with the box on a 0-1000 scale around the whole piece. Each description is one plain sentence of at most 40 words: the main body colour first, then where any print or pattern sits (all over, or only on a border, strip or band), and for a top its sleeves, collar, pockets and closure. Never give one piece the print of another.`,
        ],
        config: { responseMimeType: 'application/json', abortSignal: AbortSignal.timeout(12_000) },
      });
      const parsed = JSON.parse(response.text || '{}');
      found = Array.isArray(parsed?.pieces) ? parsed.pieces : [];
      if (cacheRef) await cacheRef.set({ pieces: found, garmentType, createdAt: new Date().toISOString() }).catch(() => undefined);
    }
    const valid = (found || []).filter((piece) => Array.isArray(piece.box) && piece.box.length === 4 && piece.box.every((n) => Number.isFinite(n))
      && piece.box[2] - piece.box[0] > 80 && piece.box[3] - piece.box[1] > 80 && typeof piece.description === 'string').slice(0, 3);
    // A store's catalogue photo is always one product, even if it shows a set: described as a whole.
    if (valid.length >= 2 && !ownOutfit) return single();
    if (valid.length < 2) {
      // One garment: a customer's own outfit is named by what it is (kurta, saree...), not the category tapped.
      const detected = String(valid[0]?.name || '').trim();
      const title = ownOutfit && detected ? detected.charAt(0).toUpperCase() + detected.slice(1, 60) : base.title;
      // A customer's own garment held up in the hand (or with room around it) is cut out first, so the
      // engines see only the garment, not the person, hands or room holding it.
      const image = ownOutfit && valid[0] ? await cropToPiece(garmentBase64, valid[0].box) : garmentBase64;
      return [{ image, product: { ...base, title, description: (valid[0]?.description || (await describeGarmentForGenlook(ai, garmentBase64, garmentType))).slice(0, 500) } }];
    }
    return await Promise.all(valid.map(async (piece, index) => {
      const crop = await cropToPiece(garmentBase64, piece.box);
      const name = String(piece.name || `piece ${index + 1}`).slice(0, 40);
      return {
        image: crop,
        product: { externalId: `${base.externalId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, title: name.charAt(0).toUpperCase() + name.slice(1), description: piece.description.slice(0, 500) },
      };
    }));
  } catch {
    return single();
  }
}
