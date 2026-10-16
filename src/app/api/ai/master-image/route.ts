import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { AI_CONFIG } from '@/lib/ai/config';
import { GoogleGenAI } from '@google/genai';
import { CustomerCategory, isEventId, MAHARAJA_CLIENT_ID, MASTER_IMAGE_UNIVERSAL_PREFIX, buildTryOnPrompt } from '@/lib/maharaja/config';
import { finishTryOnGrant, incrementMaharajaUsage, incrementPassUsage, logMaharajaActivity, markPassTryOnImageDone, markPassVideoMasterDone, reserveTryOnGrant, validTryOnDeviceId, verifyMaharajaAccess } from '@/lib/maharaja/server';
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

export async function POST(req: NextRequest) {
  let reservedDeviceId = '';
  let reservedSessionId = '';
  try {
    const body = await req.json();
    const { sessionId, garmentAnalysis, personAnalysis, personPhoto, garmentPhotos, conceptPrompt, templateId, accessCode } = body;
    const service = body.service === 'try-on' ? 'try-on' : 'ai-video';
    const access = await verifyMaharajaAccess(req, accessCode, service);
    if (!access.allowed) {
      return NextResponse.json({ success: false, error: access.error }, { status: 401 });
    }
    // A billing pass owns exactly one Try-On image and one video master image.
    // Asking again returns the stored image; the provider is never called twice.
    if (access.pass) {
      const existingUrl = service === 'try-on'
        ? (access.pass.tryOnImageDone ? access.pass.tryOnImageUrl : '')
        : (access.pass.videoMasterDone ? access.pass.videoMasterUrl : '');
      if (existingUrl) {
        return NextResponse.json({
          success: true,
          sessionId,
          masterImageUrl: existingUrl,
          reused: true,
          operatorMessage: 'Existing approved image returned.',
        });
      }
    }
    const eventId = isEventId(body.eventId) ? body.eventId : access.pass?.eventId || 'diwali';

    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'sessionId is required.' }, { status: 400 });
    }

    if (!personPhoto) {
      return NextResponse.json(
        { success: false, error: 'Customer photo is missing. Upload one clear customer photo before generating the AI image.' },
        { status: 400 }
      );
    }

    if (!Array.isArray(garmentPhotos) || garmentPhotos.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Garment photo is missing. Upload at least one garment photo before generating the AI image.' },
        { status: 400 }
      );
    }
    if (service === 'try-on' && garmentPhotos.length > 1) {
      return NextResponse.json({ success: false, error: 'Upload one garment photo only for AI Try-On.' }, { status: 400 });
    }
    if (service === 'ai-video' && garmentPhotos.length > 3) {
      return NextResponse.json({ success: false, error: 'Upload up to three garment photos only for AI Video.' }, { status: 400 });
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

    const isDemoAsset = AI_CONFIG.IS_DEMO_MODE;
    const nowIso = new Date().toISOString();

    let masterImageUrl = '';

    if (body.usePreset && process.env.NODE_ENV !== 'production') {
      const presetPath = path.join(process.cwd(), 'public', 'test-master-women.jpg');
      if (fs.existsSync(presetPath)) {
        const rawBuffer = fs.readFileSync(presetPath);
        const finalBuffer = service === 'try-on'
          ? await applyMaharajaWatermark(rawBuffer)
          : rawBuffer;
        masterImageUrl = `data:image/jpeg;base64,${finalBuffer.toString('base64')}`;
      } else {
        masterImageUrl = '/test-master-women.jpg';
      }
    } else if (isDemoAsset) {
      if (reservedDeviceId) await finishTryOnGrant(reservedDeviceId, reservedSessionId, false);
      return NextResponse.json(
        { success: false, error: 'Real Gemini master image generation is disabled because DEMO_MODE=true.' },
        { status: 400 }
      );
    } else {
      const ai = getGenAIClient();
      if (!ai) {
        if (reservedDeviceId) await finishTryOnGrant(reservedDeviceId, reservedSessionId, false);
        return NextResponse.json(
          { success: false, error: 'Gemini image generation key is missing. Upload an AI image manually or configure GOOGLE_AI_API_KEY_PRIMARY.' },
          { status: 500 }
        );
      }

      try {
        const contents: any[] = [];

        if (personPhoto) {
          const personBase64 = personPhoto.split(',')[1] || personPhoto;
          contents.push({ inlineData: { mimeType: 'image/jpeg', data: personBase64 } });
        }

        if (garmentPhotos && Array.isArray(garmentPhotos)) {
          garmentPhotos.forEach((photo: string) => {
            const garmentBase64 = photo.split(',')[1] || photo;
            contents.push({ inlineData: { mimeType: 'image/jpeg', data: garmentBase64 } });
          });
        }

        const customerCategory: CustomerCategory = ['women', 'men', 'girl', 'boy'].includes(templateId) ? templateId : 'women';

        let prompt = '';
        if (service === 'try-on') {
          prompt = buildTryOnPrompt(customerCategory);
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

          const templatePrompt = typeof conceptPrompt === 'string' && conceptPrompt.trim()
            ? conceptPrompt.trim()
            : 'Create an elegant premium Diwali fashion setting with warm glowing diyas, traditional lamps, subtle rangoli, floral decorations and refined festive golden lighting.';

          prompt = `${MASTER_IMAGE_UNIVERSAL_PREFIX}

${referenceHierarchy}

SUBJECT: An ${customerCategory === 'men' ? 'adult man' : customerCategory === 'women' ? 'adult woman' : customerCategory === 'boy' ? 'young boy' : 'young girl'}.
ENVIRONMENT & SETTING: ${templatePrompt}

Strictly preserve the real customer identity from Image 1 and the real garment design from the garment images. No text, logos, or watermarks. Full body head-to-toe with both feet visible.`;
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

          const bucket = getStorageBucket();
          if (bucket) {
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
          } else if (process.env.NODE_ENV === 'production' && !AI_CONFIG.ALLOW_MOCK_BACKEND) {
            throw new Error('Cloud Storage configuration error: Firebase Storage bucket is unavailable in production. Master images must be persisted to Storage to prevent exceeding Firestore document size limits.');
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

    if (db) {
      await db.collection('sessions').doc(sessionId).set({
        sessionId,
        clientId: MAHARAJA_CLIENT_ID,
        accessCode: typeof accessCode === 'string' ? accessCode : null,
        service,
        eventId,
        garmentAnalysis,
        personAnalysis,
        templateId: templateId || null,
        ...safeImageFields,
        status: 'master_ready',
        updatedAt: nowIso
      }, { merge: true });
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
        ...imageFields,
        status: 'master_ready',
        updatedAt: nowIso
      });
    }

    if (service === 'try-on') {
      await incrementMaharajaUsage('tryOnGenerated');
    }
    if (access.pass) {
      await incrementPassUsage(access.pass.code, 'imagesGenerated');
      const passImageUrl = (db && masterImageUrl.startsWith('data:') && masterImageUrl.length > 700000)
        ? masterImageUrl.slice(0, 500) + '...[truncated-data-url]'
        : masterImageUrl;
      if (service === 'try-on') {
        await markPassTryOnImageDone(access.pass.code, passImageUrl);
      } else {
        await markPassVideoMasterDone(access.pass.code, passImageUrl);
      }
    }
    await logMaharajaActivity('try-on', `${service === 'try-on' ? 'AI Try-On' : 'AI Video master image'} generated`, { sessionId, eventId });
    if (reservedDeviceId) await finishTryOnGrant(reservedDeviceId, reservedSessionId, true);

    return NextResponse.json({
      success: true,
      sessionId,
      masterImageUrl,
      isDemoAsset,
      operatorMessage: 'Master fashion reference generated successfully.'
    });
  } catch (error: any) {
    console.error('Master Image Route Error:', error);
    if (reservedDeviceId) await finishTryOnGrant(reservedDeviceId, reservedSessionId, false).catch(() => undefined);
    return NextResponse.json(
      { success: false, error: 'Failed to generate master reference image.' },
      { status: 500 }
    );
  }
}
