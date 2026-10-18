import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { AI_CONFIG } from '@/lib/ai/config';
import { GoogleGenAI } from '@google/genai';
import { type CustomerCategory, isEventId, MAHARAJA_CLIENT_ID, MASTER_IMAGE_UNIVERSAL_PREFIX, buildTryOnPrompt, buildMasterPrompt, resolveGarmentType, type VideoPromptSet, getSceneIndex } from '@/lib/maharaja/config';
import { acquirePassImageLock, finishTryOnGrant, getCampaignEntitlementForPass, getCustomerServiceAllowances, incrementMaharajaUsage, incrementPassUsage, logMaharajaActivity, markPassTryOnImageDone, markPassVideoMasterDone, releasePassImageLock, reserveTryOnGrant, validTryOnDeviceId, verifyMaharajaAccess } from '@/lib/maharaja/server';
import { applyMaharajaWatermark } from '@/lib/maharaja/watermark';

export const maxDuration = 120;

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
      const [buffer] = await file.download();
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
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.toString('base64');
    }
  } catch (err) {
    console.warn('URL fetch image warning:', err);
  }
  return trimmed.split(',')[1] || trimmed;
}

export async function POST(req: NextRequest) {
  let reservedDeviceId = '';
  let reservedSessionId = '';
  let lockedPassCode = '';
  let boundGenerationId: string | undefined;
  let imageCompleted = false;
  try {
    const body = await req.json();
    const { sessionId, garmentAnalysis, personAnalysis, personPhoto, garmentPhotos, garmentRoles, conceptPrompt, templateId, accessCode } = body;
    const service = body.service === 'try-on' ? 'try-on' : 'ai-video';
    const access = await verifyMaharajaAccess(req, accessCode, service);
    if (!access.allowed) {
      return NextResponse.json({ success: false, error: access.error }, { status: 401 });
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
        error: service === 'try-on' ? 'Upload exactly one garment photo for AI Try-On.' : 'Upload up to 3 garment photos max.',
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

    try {
        const contents: any[] = [];

        const personBase64 = await resolveImageBase64(personInput, bucket);
        if (personBase64) {
          contents.push({ inlineData: { mimeType: 'image/jpeg', data: personBase64 } });
        }

        for (const input of garmentInputs) {
          const garmentBase64 = await resolveImageBase64(input, bucket);
          if (garmentBase64) {
            contents.push({ inlineData: { mimeType: 'image/jpeg', data: garmentBase64 } });
          }
        }

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
                ? '- For men\'s ethnic wear: preserve exact kurta silhouette, collar construction, placket buttons, fabric weave, and dhoti/veshti/pyjama drape. Strictly no saree pleats, pallu, or blouse styling.'
                : garmentType === 'boy_ethnic'
                  ? '- For boys\' ethnic wear: preserve exact kurta-pyjama or dhoti-shirt silhouette and fabric weave. Strictly no saree, pallu, or adult garment elements.'
                  : '- For girls\' traditional wear: preserve exact pattu pavadai (silk skirt and blouse/choli) or anarkali silhouette and border details. Strictly no adult saree drape.';

        const garmentFidelityRules = `EXACT GARMENT ROLE & COLOR INSTRUCTIONS:
${roleInstructions}
- Preserve exact fabric colors, patterns, and dye hues from each garment reference.
- If a Bottom / Pant reference is grey, it MUST remain pure neutral grey on the customer. Never shift or hallucinate it into beige, tan, cream, brown, or gold.
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

          const fullConcept = buildMasterPrompt(customerCategory, eventId, sessionId, garmentType, promptSet);

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
            const storagePath = service === 'try-on'
              ? `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/master/try-on.jpg`
              : `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/master/master.jpg`;
            const file = bucket.file(storagePath);
            await file.save(finalBuffer, { contentType: 'image/jpeg', public: false });
            const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 24 * 60 * 60 * 1000 });
            masterImageUrl = signedUrl;
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
        tryOnImageUrl: masterImageUrl,
        tryOnStoragePath: `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/master/try-on.jpg`,
      }
      : {
        masterImageUrl,
        masterStoragePath: `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/master/master.jpg`,
      };

    // Protect Firestore against 1MB document size limit if Storage was bypassed
    const safeImageFields = { ...imageFields };
    if (db && masterImageUrl.startsWith('data:') && masterImageUrl.length > 700000) {
      console.warn('Image data URI exceeds 700KB; truncating Firestore document cache to avoid 1MB document size limit.');
      if (service === 'try-on') {
        safeImageFields.tryOnImageUrl = masterImageUrl.slice(0, 500) + '...[truncated-data-url-use-storage]';
      } else {
        safeImageFields.masterImageUrl = masterImageUrl.slice(0, 500) + '...[truncated-data-url-use-storage]';
      }
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
        garmentType,
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
        garmentType,
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
          await markPassTryOnImageDone(access.pass!.code, passImageUrl);
        } else {
          await markPassVideoMasterDone(access.pass!.code, passImageUrl, {
            promptSet,
            category: customerCategory,
            garmentType,
          }, boundGenerationId);
        }
      })());
    }
    const activityType: 'try-on' | 'video-master' = service === 'try-on' ? 'try-on' : 'video-master';
    persistenceTasks.push(logMaharajaActivity(activityType, `${service === 'try-on' ? 'AI Try-On' : 'AI Video master image'} generated`, { sessionId, eventId, service }));
    if (reservedDeviceId) persistenceTasks.push(finishTryOnGrant(reservedDeviceId, reservedSessionId, true));
    await Promise.all(persistenceTasks);

    imageCompleted = true;

    const updatedEntitlement = lockedPassCode ? await getCampaignEntitlementForPass(lockedPassCode) : null;
    const updatedAllowances = getCustomerServiceAllowances(updatedEntitlement);

    return NextResponse.json({
      success: true,
      sessionId,
      masterImageUrl,
      allowances: updatedAllowances,
      operatorMessage: 'Master fashion reference generated successfully.'
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
