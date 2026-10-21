import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { AI_CONFIG } from '@/lib/ai/config';
import { getDb, getMockStore, getSignedPlaybackUrl, getStorageBucket } from '@/lib/firebase/admin';
import { getCampaignPose, isCampaignPoseId, MAHARAJA_CLIENT_ID, type CustomerCategory } from '@/lib/maharaja/config';
import { verifyMaharajaAccess } from '@/lib/maharaja/server';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const accessCode = typeof body.accessCode === 'string' ? body.accessCode.trim() : '';
    if (!sessionId || !accessCode) {
      return NextResponse.json({ success: false, error: 'sessionId and accessCode are required.' }, { status: 400 });
    }

    const access = await verifyMaharajaAccess(req, accessCode, 'ai-video');
    if (!access.allowed || !access.pass) {
      return NextResponse.json({ success: false, error: access.allowed ? 'An AI Video pass is required.' : access.error }, { status: 401 });
    }
    if (!access.pass.videoMasterApproved || !access.pass.videoMasterUrl) {
      return NextResponse.json({ success: false, error: 'Approve the opening portrait before preparing the final pose.' }, { status: 409 });
    }

    const db = getDb();
    const session = db
      ? (await db.collection('sessions').doc(sessionId).get()).data()
      : getMockStore().sessions.get(sessionId);
    if (!session || session.accessCode !== accessCode) {
      return NextResponse.json({ success: false, error: 'This portrait session could not be verified.' }, { status: 403 });
    }

    const bucket = getStorageBucket();
    if (!bucket) return NextResponse.json({ success: false, error: 'Secure media storage is unavailable.' }, { status: 503 });
    const poseStoragePath = `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/master/end-pose.jpg`;
    const poseFile = bucket.file(poseStoragePath);
    const [poseExists] = await poseFile.exists();
    if (poseExists) {
      return NextResponse.json({ success: true, poseFrameUrl: await getSignedPlaybackUrl(poseStoragePath), reused: true });
    }

    const masterStoragePath = `clients/${MAHARAJA_CLIENT_ID}/sessions/${sessionId}/master/master.jpg`;
    if (session.masterStoragePath !== masterStoragePath) {
      return NextResponse.json({ success: false, error: 'The approved opening portrait is unavailable.' }, { status: 409 });
    }
    const [masterBuffer] = await bucket.file(masterStoragePath).download();
    const category: CustomerCategory = ['women', 'men', 'girl', 'boy'].includes(session.templateId)
      ? session.templateId
      : 'women';
    const poseId = isCampaignPoseId(session.poseId) ? session.poseId : access.pass.videoMasterPoseId;
    if (!poseId || !isCampaignPoseId(poseId)) {
      return NextResponse.json({ success: false, error: 'The selected final pose is unavailable.' }, { status: 409 });
    }

    const contents: any[] = [{ inlineData: { mimeType: 'image/jpeg', data: masterBuffer.toString('base64') } }];
    const garmentPaths = Array.isArray(session.garmentPhotoStoragePaths)
      ? session.garmentPhotoStoragePaths.filter((value: unknown): value is string => typeof value === 'string').slice(0, 3)
      : [];
    for (const garmentPath of garmentPaths) {
      const [garmentBuffer] = await bucket.file(garmentPath).download();
      contents.push({ inlineData: { mimeType: 'image/jpeg', data: garmentBuffer.toString('base64') } });
    }

    contents.push(`Create the exact final keyframe for this luxury campaign film.

IMAGE 1 is the approved opening portrait and is the absolute authority for identity, face, hairstyle, skin tone, body proportions, complete garment, garment colours, textile details, accessories, lighting, camera position, framing and background. Images 2 onward are garment-detail references only.

Change ONLY the arms and hands from the natural opening stance into this exact completed final pose:
${getCampaignPose(category, poseId)}

Keep the face, expression, head, torso, legs, feet, garment construction, garment drape, scene, lighting and camera completely unchanged. Do not add, remove, recolour or reinterpret clothing. Do not create a chest-touch gesture unless the selected final pose explicitly requires palms together. Do not wave, turn, walk, crop, zoom or change perspective. Produce a photorealistic 9:16 final frame of the same person in the same outfit and scene.`);

    const apiKey = AI_CONFIG.PRIMARY_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ success: false, error: 'Image generation is unavailable.' }, { status: 503 });
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: AI_CONFIG.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image',
      contents,
      config: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '9:16' } },
    });
    const imagePart = response.candidates?.[0]?.content?.parts?.find((part: any) => part.inlineData?.data);
    if (!imagePart?.inlineData?.data) throw new Error('The final pose frame was not returned.');
    await poseFile.save(Buffer.from(imagePart.inlineData.data, 'base64'), { contentType: 'image/jpeg', resumable: false });
    const poseFrameUrl = await getSignedPlaybackUrl(poseStoragePath);
    const update = { poseEndStoragePath: poseStoragePath, poseEndImageUrl: poseFrameUrl, poseEndPoseId: poseId, updatedAt: new Date().toISOString() };
    if (db) await db.collection('sessions').doc(sessionId).set(update, { merge: true });
    else getMockStore().sessions.set(sessionId, { ...session, ...update });

    return NextResponse.json({ success: true, poseFrameUrl, reused: false });
  } catch (error) {
    console.error('Pose frame generation error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'The final pose frame could not be created.' }, { status: 500 });
  }
}
