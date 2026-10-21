import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { AI_CONFIG } from '@/lib/ai/config';
import { GoogleGenAI } from '@google/genai';
import { type CampaignPoseId, type CustomerCategory, getCampaignPoseId, isCampaignPoseId, isEventId, MAHARAJA_CLIENT_ID, MASTER_IMAGE_UNIVERSAL_PREFIX, buildTryOnPrompt, buildMasterPrompt, resolveGarmentType, type VideoPromptSet, getSceneIndex } from '@/lib/maharaja/config';
import { acquirePassImageLock, finishTryOnGrant, getCampaignEntitlementForPass, getCustomerServiceAllowances, incrementMaharajaUsage, incrementPassUsage, logMaharajaActivity, markPassTryOnImageDone, markPassVideoMasterDone, releasePassImageLock, reserveTryOnGrant, validTryOnDeviceId, verifyMaharajaAccess } from '@/lib/maharaja/server';
import { applyMaharajaWatermark } from '@/lib/maharaja/watermark';
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
    return 'Gemini image quota is exhausted or the Vercel API key is connected to a free-tier Google AI project. Create/use an API key from the paid/prepay Maharaja project and update GOOGLE_AI_API_KEY_PRIMARY in Vercel.';
  }

  if (lower.includes('api key') || lower.includes('permission') || lower.includes('unauthenticated')) {
    return 'Gemini API key is invalid or does not have access to image generation. Update GOOGLE_AI_API_KEY_PRIMARY in Vercel with the Maharaja project API key.';
  }

  if (lower.includes('model') || lower.includes('not found')) {
    return `Gemini image model is not available for this API key/project. Current model: ${AI_CONFIG.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image'}.`;
  }

  return raw.length > 280 ? `${raw.slice(0, 280)}...` : raw;
}

async function resolveImageBase64(input: unknown, bucket: any): Promise<string> {
  if (typeof input !== 'string' || !input.trim()) return '';
  const trimmed = input.trim();
  if (trimmed.startsWith('data:') || (!trimmed.startsWith('http') && !trimmed.startsWith('clients/') && !trimmed.startsWith('sessions/'))) {
    return trimmed.split(',')[1] || trimmed;
  }
  if (bucket && (trimmed.startsWith('clients/') || trimmed.startsWith('sessions/'))) {
    try {
      const file = bucket.file(trimmed);
      const [metadata] = await file.getMetadata();
      if (Number(metadata.size || 0) > MAX_SOURCE_IMAGE_BYTES) {
        throw new Error('Uploaded photo exceeds the 8 MB processing limit.');
      }
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
  try {
    const res = await fetch(trimmed);
    if (res.ok) {
      if (Number(res.headers.get('content-length') || 0) > MAX_SOURCE_IMAGE_BYTES) {
        throw new Error('Source photo exceeds the 8 MB processing limit.');
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > MAX_SOURCE_IMAGE_BYTES) throw new Error('Source photo exceeds the 8 MB processing limit.');
      return buf.toString('base64');
    }
  } catch (err) {
    console.warn('URL fetch image warning:', err);
  }
  return trimmed.split(',')[1] || trimmed;
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let referencesReadyAt = 0;
  let geminiReadyAt = 0;
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
    if (body.processingConsent !== true || body.consentVersion !== '2026-10-privacy-v1') {
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
    const garmentInputs: string[] = (Array.isArray(body.garmentPhotoStoragePaths) && body.garmentPhotoStoragePaths.length > 0)
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
        { success: false, error: 'Garment photo is missing. Upload at least one garment photo before generating the AI image.' },
        { status: 400 }
      );
    }
    const maxGarmentPhotos = service === 'try-on' ? 1 : 3;
    if (garmentInputs.length > maxGarmentPhotos) {
      return NextResponse.json({
        success: false,
        error: service === 'try-on' ? 'AI Try-On accepts exactly one garment photo.' : 'Upload up to 3 garment photos max.',
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
    if (!ai) {
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
    const garmentType = resolveGarmentType(customerCategory, body.garmentType, garmentAnalysis, garmentRoles);
    const promptSet: VideoPromptSet = (body.promptSet === 'set-2' || body.promptSet === 'set-1')
      ? body.promptSet
      : (getSceneIndex(sessionId) === 1 ? 'set-2' : 'set-1');
    const poseId: CampaignPoseId = isCampaignPoseId(body.poseId)
      ? body.poseId
      : getCampaignPoseId(sessionId, customerCategory);

    try {
        const contents: any[] = [];

        const [personBase64, ...garmentBase64s] = await Promise.all([
          resolveImageBase64(personInput, bucket),
          ...garmentInputs.map((input) => resolveImageBase64(input, bucket)),
        ]);
        if (personBase64) contents.push({ inlineData: { mimeType: 'image/jpeg', data: personBase64 } });
        garmentBase64s.forEach((garmentBase64) => {
          if (garmentBase64) contents.push({ inlineData: { mimeType: 'image/jpeg', data: garmentBase64 } });
        });
        referencesReadyAt = Date.now();

        const suppliedRoles = Array.isArray(garmentRoles) ? garmentRoles.slice(0, garmentInputs.length) : [];
        const roleInstructions = suppliedRoles.length
          ? suppliedRoles.map((role: string, idx: number) => `- Garment Image ${idx + 1} = ${role.toUpperCase()}`).join('\n')
          : '- Garment Image 1 is the exact uploaded garment reference.';

        const categoryGarmentLine = garmentType === 'saree'
          ? '- For traditional Indian sarees: preserve exact metallic zari borders, gold thread luster, pallu motif geometry, and blouse styling.'
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
                  : '- Garment type is intentionally unspecified. Copy only the uploaded garment references; do not infer a traditional, ethnic, western, formal, or casual replacement.';

        const garmentFidelityRules = `EXACT GARMENT ROLE & COLOR INSTRUCTIONS:
${roleInstructions}
- Preserve exact fabric colors, patterns, and dye hues from each garment reference without color shift (white stays pure white, blue ombre stays blue ombre, grey stays grey).
- Never shift colors or alter clothing into unrequested garments or added embroidery.
${categoryGarmentLine}
- Professional model lighting must enhance clarity, contrast, and depth without altering the true dye color of any garment.`;

        let prompt = '';
        if (service === 'try-on') {
          prompt = `${buildTryOnPrompt(customerCategory)}\n\n${garmentFidelityRules}`;
        } else {
          const tryOnRef = (service === 'ai-video' && (body.tryOnImageUrl || access.pass?.tryOnImageUrl)) || null;
          if (tryOnRef && typeof tryOnRef === 'string') {
            if (tryOnRef.startsWith('http')) {
              try {
                const res = await fetch(tryOnRef);
                if (res.ok) {
                  const arrayBuffer = await res.arrayBuffer();
                  contents.push({ inlineData: { mimeType: 'image/jpeg', data: Buffer.from(arrayBuffer).toString('base64') } });
                }
              } catch (fetchErr) {
                console.warn('Failed to fetch try-on image reference from URL for Gemini:', fetchErr);
              }
            } else {
              const tryOnBase64 = tryOnRef.split(',')[1] || tryOnRef;
              contents.push({ inlineData: { mimeType: 'image/jpeg', data: tryOnBase64 } });
            }
          }

          const referenceHierarchy = `REFERENCE PRIORITY:
- The first image (original customer photograph) is the authoritative identity reference.
- The garment photograph(s) are the authoritative garment-design references.
${tryOnRef ? '- The virtual try-on reference is supplied only to understand approximate garment placement and drape. If the virtual try-on differs from the original customer\'s face, body proportions, skin tone, hairstyle, age, or the original garment\'s color/design, IGNORE those differences and follow the original references.' : ''}`;

          const fullConcept = buildMasterPrompt(customerCategory, eventId, sessionId, garmentType, promptSet, poseId);

          prompt = `${fullConcept}\n\n${garmentFidelityRules}\n\n${referenceHierarchy}`;
        }

        contents.push(prompt);

        const imageModel = AI_CONFIG.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
        const genResponse = await ai.models.generateContent({
          model: imageModel,
          contents,
          config: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: { aspectRatio: '9:16' },
          },
        });
        geminiReadyAt = Date.now();

        const candidate = genResponse.candidates?.[0];
        const part = candidate?.content?.parts?.find((p: any) => p.inlineData);
        if (part?.inlineData?.data) {
          const rawBase64 = part.inlineData.data;

          const rawBuffer = Buffer.from(rawBase64, 'base64');
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
            { success: false, error: 'Gemini returned no image. No fallback image was used. Upload a manual AI image or retry after checking the model.' },
            { status: 502 }
          );
        }
    } catch (genError: any) {
      console.error('Gemini Master Image Generation Error:', genError);
      if (reservedDeviceId) await finishTryOnGrant(reservedDeviceId, reservedSessionId, false);
      return NextResponse.json(
        { success: false, error: formatGeminiImageError(genError) },
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
        garmentPhotoStoragePaths: Array.isArray(body.garmentPhotoStoragePaths)
          ? body.garmentPhotoStoragePaths.filter((value: unknown): value is string => typeof value === 'string').slice(0, 3)
          : [],
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
        promptSet,
        poseId,
        garmentType,
        processingConsent: true,
        guardianProcessingConsent: customerCategory === 'girl' || customerCategory === 'boy',
        consentVersion: '2026-10-privacy-v1',
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
        promptSet,
        poseId,
        garmentType,
        processingConsent: true,
        guardianProcessingConsent: customerCategory === 'girl' || customerCategory === 'boy',
        consentVersion: '2026-10-privacy-v1',
        consentedAt: nowIso,
        ...imageFields,
        status: 'master_ready',
        updatedAt: nowIso
      });
    }

    persistenceTasks.push(incrementMaharajaUsage('tryOnGenerated'));
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
            promptSet,
            poseId,
            category: customerCategory,
            garmentType,
            referenceSessionId: sessionId,
            personPhotoStoragePath: typeof body.personPhotoStoragePath === 'string' ? body.personPhotoStoragePath : undefined,
            garmentPhotoStoragePaths: Array.isArray(body.garmentPhotoStoragePaths)
              ? body.garmentPhotoStoragePaths.filter((value: unknown): value is string => typeof value === 'string').slice(0, 3)
              : [],
          }, boundGenerationId);
        }
      })());
    }
    const activityType: 'try-on' | 'video-master' = service === 'try-on' ? 'try-on' : 'video-master';
    persistenceTasks.push(logMaharajaActivity(activityType, `${service === 'try-on' ? 'AI Try-On' : 'AI Video master image'} generated`, { sessionId, eventId, service }));
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
      geminiGenerationMs: geminiReadyAt && referencesReadyAt ? geminiReadyAt - referencesReadyAt : null,
      imagePersistenceMs: storageReadyAt && geminiReadyAt ? storageReadyAt - geminiReadyAt : null,
      totalMs: completedAt - startedAt,
    };
    console.info('Maharaja image generation timing', { sessionId, service, poseId, ...timing });

    return NextResponse.json({
      success: true,
      sessionId,
      masterImageUrl,
      approved: service === 'try-on',
      poseId,
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
      { success: false, error: 'Failed to generate master reference image.' },
      { status: 500 }
    );
  } finally {
    if (lockedPassCode && !imageCompleted) {
      await releasePassImageLock(lockedPassCode, boundGenerationId).catch((err) => console.error('Image lock release failed:', err));
    }
  }
}
