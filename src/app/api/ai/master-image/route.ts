import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { AI_CONFIG } from '@/lib/ai/config';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60;

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
  try {
    const body = await req.json();
    const { sessionId, garmentAnalysis, personAnalysis, personPhoto, garmentPhotos, conceptPrompt, templateId } = body;

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

    const isDemoAsset = AI_CONFIG.IS_DEMO_MODE;
    const nowIso = new Date().toISOString();

    // Fast test preset: use uploaded purple lehenga women image directly to save Gemini image synthesis cost & time
    const masterImageUrl = '/test-master-women.jpg';

    const db = getDb();

    if (db) {
      await db.collection('sessions').doc(sessionId).set({
        sessionId,
        garmentAnalysis,
        personAnalysis,
        templateId: templateId || null,
        masterImageUrl,
        masterStoragePath: `sessions/${sessionId}/master/master.jpg`,
        status: 'master_ready',
        updatedAt: nowIso
      }, { merge: true });
    } else {
      const mockStore = getMockStore();
      mockStore.sessions.set(sessionId, {
        sessionId,
        garmentAnalysis,
        personAnalysis,
        templateId: templateId || null,
        masterImageUrl,
        masterStoragePath: `sessions/${sessionId}/master/master.jpg`,
        status: 'master_ready',
        updatedAt: nowIso
      });
    }

    return NextResponse.json({
      success: true,
      sessionId,
      masterImageUrl,
      isDemoAsset,
      operatorMessage: isDemoAsset
        ? 'Demo Master Reference Image loaded (Real Google Image synthesis active when DEMO_MODE=false).'
        : 'Master fashion reference synthesized successfully.'
    });
  } catch (error: any) {
    console.error('Master Image Route Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate master reference image.' },
      { status: 500 }
    );
  }
}
