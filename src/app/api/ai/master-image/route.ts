import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { AI_CONFIG } from '@/lib/ai/config';
import { GoogleGenAI } from '@google/genai';
import { type CustomerCategory, isEventId, MAHARAJA_CLIENT_ID, buildTryOnPrompt, resolveGarmentType } from '@/lib/maharaja/config';
import { buildVideoMasterPrompt, getVideoConcept, VIDEO_PROMPT_ARCHITECTURE_VERSION } from '@/lib/maharaja/video-concepts';
import { acquirePassImageLock, finishTryOnGrant, getCampaignEntitlementForPass, getCustomerServiceAllowances, getTryOnDeviceStatus, incrementMaharajaUsage, incrementPassUsage, logMaharajaActivity, markPassTryOnImageDone, markPassVideoMasterDone, releasePassImageLock, reserveTryOnGrant, validTryOnDeviceId, verifyMaharajaAccess } from '@/lib/maharaja/server';
import { applyMaharajaWatermark } from '@/lib/maharaja/watermark';
import { generateFalTryOn } from '@/lib/maharaja/try-on-provider';
import { enforceRateLimit } from '@/lib/security/rate-limit';

export const maxDuration = 120;
const MAX_SOURCE_IMAGE_BYTES = 8 * 1024 * 1024;

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
    return 'Image generation is temporarily unavailable because the service limit was reached. Please ask Maharaja staff for assistance.';
  }

  if (lower.includes('api key') || lower.includes('permission') || lower.includes('unauthenticated')) {
    return 'Image generation needs attention from Maharaja staff. Please try again after staff check the service.';
  }

  if (lower.includes('model') || lower.includes('not found')) {
    return 'The image service is temporarily unavailable. Please ask Maharaja staff for assistance.';
  }

  if (/safety|blocked|policy/.test(lower)) return 'These photos could not be processed. Please use a clear, appropriate customer and garment photo.';
  if (/timeout|timed out|deadline|abort/.test(lower)) return 'Image generation took too long. Please check your connection and try again.';
  if (/photo|source/.test(lower)) return 'The uploaded photos could not be read. Please add them again and retry.';
  return 'Your image could not be completed. Please try again or ask Maharaja staff for assistance.';
}

async function resolveImageBase64(input: unknown, bucket: any, sessionId: string, allowedCataloguePath = ''): Promise<string> {
  if (typeof input !== 'string' || !input.trim()) return '';
  const trimmed = input.trim();
  if (!bucket && trimmed.startsWith('data:image/')) {
    return trimmed.split(',')[1] || trimmed;
  }
  const expectedPrefix = `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/`;
  if (!trimmed.startsWith(expectedPrefix) && trimmed !== allowedCataloguePath) throw new Error('Photo source does not belong to this customer session.');
  if (bucket) {
    try {
      const file = bucket.file(trimmed);
      const [buffer] = await file.download();
      if (buffer.byteLength > MAX_SOURCE_IMAGE_BYTES) throw new Error('Uploaded photo exceeds the 8 MB processing limit.');
      return buffer.toString('base64');
    } catch (err) {
      console.warn('Storage file download warning:', err);
    }
  }
  const mockStore = getMockStore();
  const mockBlob = mockStore.sessions?.get(`mock_blob_${trimmed}`);
  if (mockBlob?.buffer) {
    return mockBlob.buffer.toString('base64');
  }
  throw new Error('Customer photo could not be read from secure storage.');
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let referencesReadyAt = 0;
  let imageReadyAt = 0;
  let imageProvider = 'gemini';
  let falTryOnAttempted = false;
  let geminiAttempted = false;
  let storageReadyAt = 0;
  let reservedDeviceId = '';
  let reservedSessionId = '';
  let lockedPassCode = '';
  let boundGenerationId: string | undefined;
  let imageCompleted = false;
  try {
    const body = await req.json();
    const { sessionId, garmentAnalysis, personAnalysis, personPhoto, garmentPhotos, garmentRoles, conceptPrompt, templateId, accessCode } = body;
    const service = body.service === 'try-on' ? 'try-on' : 'ai-video';
    if (body.processingConsent !== true || body.consentVersion !== '2026-10-privacy-v2') {
      return NextResponse.json({ success: false, error: 'Photo processing permission is required before generation.' }, { status: 400 });
    }
    if ((body.templateId === 'girl' || body.templateId === 'boy') && body.guardianProcessingConsent !== true) {
      return NextResponse.json({ success: false, error: 'Parent or legal guardian permission is required for child photo processing.' }, { status: 400 });
    }
    const access = await verifyMaharajaAccess(req, accessCode, service);
    if (!access.allowed) {
      return NextResponse.json({ success: false, error: access.error }, { status: 401 });
    }
    const rateIdentity = access.pass?.code || (typeof body.deviceId === 'string' ? body.deviceId : sessionId);
    const rate = await enforceRateLimit(req, `master-image:${service}`, 4, 10 * 60 * 1000, rateIdentity);
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
        { success: false, error: access.pass?.experienceType === 'catalogue-gift' ? 'Select a Maharaja catalogue saree before generating.' : 'Garment photo is missing. Upload at least one garment photo before generating the AI image.' },
        { status: 400 }
      );
    }
    const deviceStatus = service === 'try-on' && validTryOnDeviceId(body.deviceId)
      ? await getTryOnDeviceStatus(body.deviceId)
      : null;
    const tryOnRetry = service === 'try-on' && (Number(access.allowances.tryOn.used || 0) > 0 || deviceStatus?.retryUsed === true);
    const maxGarmentPhotos = service === 'ai-video' ? 2 : tryOnRetry ? 3 : 1;
    if (garmentInputs.length > maxGarmentPhotos) {
      return NextResponse.json({
        success: false,
        error: service === 'ai-video'
          ? 'Upload up to 2 garment photos max for AI Video.'
          : tryOnRetry ? 'Upload up to 3 garment photos max for the Gemini retry.' : 'The first Try-On uses exactly one garment photo.',
      }, { status: 400 });
    }

    if (service === 'try-on' && !access.pass) {
      if (!validTryOnDeviceId(body.deviceId) || typeof body.tryOnGrant !== 'string') {
        return NextResponse.json({ success: false, error: 'Scan and verify the Maharaja price tag before generating.' }, { status: 403 });
      }
      const reservation = await reserveTryOnGrant(body.deviceId, body.tryOnGrant, sessionId);
      if (!reservation.allowed) return NextResponse.json({ success: false, error: reservation.error }, { status: 409 });
      reservedDeviceId = body.deviceId;
      reservedSessionId = sessionId;
    }

    const nowIso = new Date().toISOString();
    const ai = getGenAIClient();
    if (!ai && (service === 'ai-video' || tryOnRetry || !process.env.FAL_KEY?.trim())) {
      if (reservedDeviceId) await finishTryOnGrant(reservedDeviceId, reservedSessionId, false);
      return NextResponse.json(
        { success: false, error: 'Gemini image generation is not configured.' },
        { status: 503 }
      );
    }
    const bucket = getStorageBucket();
    if (!bucket) {
      if (reservedDeviceId) await finishTryOnGrant(reservedDeviceId, reservedSessionId, false);
      return NextResponse.json(
        { success: false, error: 'Maharaja secure media storage is unavailable. Please ask staff for assistance.' },
        { status: 503 }
      );
    }

    let masterImageUrl = '';
    const customerCategory: CustomerCategory = ['women', 'men', 'girl', 'boy'].includes(templateId) ? templateId : 'women';
    if (access.pass?.experienceType === 'catalogue-gift' && customerCategory !== 'women' && customerCategory !== 'girl') {
      return NextResponse.json({ success: false, error: 'AI Video Gift is available only for Women or Girl categories.' }, { status: 400 });
    }
    if (body.garmentTypeConfirmed !== true) {
      return NextResponse.json({ success: false, error: 'Choose and confirm the garment type before generating. This keeps every garment structure and reference role explicit.' }, { status: 400 });
    }
    const garmentType = resolveGarmentType(customerCategory, body.garmentType, garmentAnalysis, garmentRoles);
    const concept = service === 'ai-video' ? getVideoConcept(body.conceptId) : null;
    if (service === 'ai-video' && (!concept || concept.category !== customerCategory)) {
      return NextResponse.json({ success: false, error: 'Select one film concept for the chosen customer category before generating.' }, { status: 400 });
    }
    const sanitizedGarmentRoles = Array.isArray(garmentRoles)
      ? garmentRoles.slice(0, garmentInputs.length).map((role: unknown) => String(role))
      : [];

    try {
        const contents: any[] = [];

        const [personBase64, ...garmentBase64s] = await Promise.all([
          resolveImageBase64(personInput, bucket, sessionId),
          ...garmentInputs.map((input) => resolveImageBase64(input, bucket, sessionId, cataloguePath)),
        ]);
        if (personBase64) contents.push({ inlineData: { mimeType: 'image/jpeg', data: personBase64 } });
        garmentBase64s.forEach((garmentBase64) => {
          if (garmentBase64) contents.push({ inlineData: { mimeType: 'image/jpeg', data: garmentBase64 } });
        });
        referencesReadyAt = Date.now();

        const roleInstructions = sanitizedGarmentRoles.length
          ? sanitizedGarmentRoles.map((role: string, idx: number) => `- Garment Image ${idx + 1} = ${role.toUpperCase()}`).join('\n')
          : '- Garment Image 1 is the exact uploaded garment reference.';

        const categoryGarmentLine = garmentType === 'saree'
          ? '- For traditional Indian sarees: preserve the exact saree body, pallu, border finish, motif geometry, blouse construction and drape shown in the supplied references. Never convert it into salwar, churidar, lehenga or a one-piece garment.'
          : garmentType === 'lehenga'
            ? '- For lehengas: preserve exact flared skirt/kalis silhouette, choli neckline, embroidery motifs, and dupatta drape. Strictly no saree pleats or pallu.'
            : garmentType === 'salwar'
              ? '- For salwar/anarkali: preserve exact tunic flare, neckline, churidar fit, and dupatta drape. Strictly no saree pleats or pallu.'
              : garmentType === 'kurta_dhoti'
                ? '- If the uploaded reference is traditional wear: preserve exact kurta silhouette, collar construction, placket buttons, fabric weave, and dhoti/veshti/pyjama drape. If the reference is a modern shirt/trousers: preserve exact shirt collar, placket, sleeves, and trousers without converting to ethnic wear.'
              : garmentType === 'boy_ethnic'
                  ? '- If the uploaded reference is traditional ethnic wear: preserve exact kurta-pyjama or dhoti-shirt silhouette. If the reference is a modern shirt/t-shirt/trousers: preserve exact shirt, print/ombre pattern, collar, and pants without converting to a kurta.'
                : garmentType === 'pattu_pavadai'
                  ? '- For girls\' traditional wear: preserve exact pattu pavadai (silk skirt and blouse/choli) or anarkali silhouette and border details. Strictly no adult saree drape.'
                  : garmentType === 'one_piece'
                    ? '- For a one-piece garment: preserve the exact single-garment silhouette, neckline, sleeves, hem, print, and fabric details. Do not invent a second piece or layer.'
                    : garmentType === 'two_piece'
                      ? '- For a two-piece set: preserve the supplied top and bottom as separate pieces. Do not add a third layer, dupatta, saree drape, or replacement garment.'
                      : garmentType === 'three_piece'
                        ? '- For a three-piece set: preserve the exact outer layer, inner layer, and bottom in their supplied order. Do not remove or invent a layer.'
                        : garmentType === 'shirt_pant'
                          ? '- For shirt and pant: preserve the exact shirt collar, sleeves, placket, print or color treatment, and the supplied trousers. Never convert it to kurta or ethnic wear.'
                          : garmentType === 'tshirt_bottom'
                            ? '- For T-shirt and bottom: preserve the exact casual top, print, neckline, and supplied bottom. Never add a jacket or convert it to formal or ethnic wear.'
                            : garmentType === 'dhoti_veshti'
                              ? '- For dhoti or veshti: preserve the supplied shirt or kurta, dhoti/veshti pleats, border, drape, and any angavastram detail. Never convert it to trousers or a saree.'
                  : '- Garment type is intentionally unspecified. Copy only the uploaded garment references; do not infer a traditional, ethnic, western, formal, or casual replacement.';

        const garmentFidelityRules = `EXACT GARMENT ROLE & COLOR INSTRUCTIONS:
${roleInstructions}
- Preserve every garment colour, dye hue, and colour transition exactly as shown in the uploaded garment references without color shift. Do not introduce, remove, shift, warm, cool, desaturate, or reinterpret any garment colour.
- Never shift colors or alter clothing into unrequested garments or added embroidery.
${categoryGarmentLine}
- Professional model lighting must enhance clarity, contrast, and depth without altering the true dye color of any garment.`;

        let prompt = '';
        if (service === 'try-on') {
          prompt = `${buildTryOnPrompt(customerCategory)}\n\n${garmentFidelityRules}`;
        } else {
          const referenceHierarchy = `REFERENCE PRIORITY:
- The first image (original customer photograph) is the authoritative identity reference.
- The current garment photograph(s), identified by the explicit roles above, are the only authoritative garment-design references.
- No previous Try-On result, previous master image or prior customer output is supplied or permitted as a reference.`;

          const fullConcept = buildVideoMasterPrompt(concept!, garmentType, eventId);

          prompt = `${fullConcept}\n\n${garmentFidelityRules}\n\n${referenceHierarchy}`;
        }

        let rawBuffer: Buffer | null = null;
        if (service === 'try-on' && !tryOnRetry && process.env.FAL_KEY?.trim()) {
          falTryOnAttempted = true;
          rawBuffer = await generateFalTryOn(personBase64, garmentBase64s[0], process.env.FAL_KEY.trim());
          imageProvider = 'fal-image-apps-v2-try-on';
        }
        if (!rawBuffer) {
          if (!ai) throw new Error('Both Try-On image services are unavailable. Please ask Maharaja staff for assistance.');
          contents.push(prompt);
          geminiAttempted = true;
          const genResponse = await ai.models.generateContent({
            model: AI_CONFIG.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image',
            contents,
            config: {
              responseModalities: ['TEXT', 'IMAGE'],
              imageConfig: { aspectRatio: '9:16' },
            },
          });
          const part = genResponse.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
          if (part?.inlineData?.data) rawBuffer = Buffer.from(part.inlineData.data, 'base64');
        }
        imageReadyAt = Date.now();
        if (rawBuffer) {
          const finalBuffer = service === 'try-on'
            ? await applyMaharajaWatermark(rawBuffer)
            : rawBuffer;
          masterImageUrl = `data:image/jpeg;base64,${finalBuffer.toString('base64')}`;

          try {
            if (service === 'try-on') {
              // Try-On is returned directly to the browser and is not retained as a cloud result.
              masterImageUrl = `data:image/jpeg;base64,${finalBuffer.toString('base64')}`;
            } else {
              const storagePath = `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/master/master.jpg`;
              const file = bucket.file(storagePath);
              await file.save(finalBuffer, { contentType: 'image/jpeg', public: false });
              const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 24 * 60 * 60 * 1000 });
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
        masterStoragePath: `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/master/master.jpg`,
        personPhotoStoragePath: typeof body.personPhotoStoragePath === 'string' ? body.personPhotoStoragePath : null,
        garmentPhotoStoragePaths: garmentInputs.slice(0, 2),
        masterImageApproved: false,
        masterImageApprovedAt: null,
        masterImageApprovedUrl: null,
      };

    // Protect Firestore against 1MB document size limit if Storage was bypassed
    const safeImageFields: Record<string, unknown> = { ...imageFields };
    if (db && service === 'ai-video' && masterImageUrl.startsWith('data:') && masterImageUrl.length > 700000) {
      console.warn('Image data URI exceeds 700KB; truncating Firestore document cache to avoid 1MB document size limit.');
      safeImageFields.masterImageUrl = masterImageUrl.slice(0, 500) + '...[truncated-data-url-use-storage]';
    }

    const persistenceTasks: Promise<unknown>[] = [];
    if (db) {
      persistenceTasks.push(db.collection('sessions').doc(sessionId).set({
        sessionId,
        clientId: MAHARAJA_CLIENT_ID,
        accessCode: typeof accessCode === 'string' ? accessCode : null,
        service,
        eventId,
        garmentAnalysis,
        personAnalysis,
        templateId: templateId || null,
        conceptId: concept?.id || null,
        promptArchitectureVersion: service === 'ai-video' ? VIDEO_PROMPT_ARCHITECTURE_VERSION : null,
        garmentType,
        garmentRoles: sanitizedGarmentRoles.slice(0, 3),
        processingConsent: true,
        guardianProcessingConsent: customerCategory === 'girl' || customerCategory === 'boy',
        consentVersion: '2026-10-privacy-v2',
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
        clientId: MAHARAJA_CLIENT_ID,
        accessCode: typeof accessCode === 'string' ? accessCode : null,
        service,
        eventId,
        garmentAnalysis,
        personAnalysis,
        templateId: templateId || null,
        conceptId: concept?.id || null,
        promptArchitectureVersion: service === 'ai-video' ? VIDEO_PROMPT_ARCHITECTURE_VERSION : null,
        garmentType,
        garmentRoles: sanitizedGarmentRoles.slice(0, 3),
        processingConsent: true,
        guardianProcessingConsent: customerCategory === 'girl' || customerCategory === 'boy',
        consentVersion: '2026-10-privacy-v2',
        consentedAt: nowIso,
        ...imageFields,
        status: 'master_ready',
        updatedAt: nowIso
      });
    }

    if (service === 'try-on') persistenceTasks.push(incrementMaharajaUsage('tryOnGenerated'));
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
            personPhotoStoragePath: typeof body.personPhotoStoragePath === 'string' ? body.personPhotoStoragePath : undefined,
            garmentPhotoStoragePaths: garmentInputs.slice(0, 2),
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
        .filter((value): value is string => typeof value === 'string' && value.startsWith(`clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/`));
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
    if (lockedPassCode && !imageCompleted) {
      await releasePassImageLock(lockedPassCode, boundGenerationId).catch((err) => console.error('Image lock release failed:', err));
    }
  }
}
