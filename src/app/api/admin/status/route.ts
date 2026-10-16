import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/admin';
import { getBackendMode, isRealFirebaseAvailable } from '@/lib/firebase/admin';
import { AI_CONFIG } from '@/lib/ai/config';

export async function GET(req: NextRequest) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized Admin Session' }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    systemStatus: {
      backendMode: getBackendMode(),
      allowMockBackend: AI_CONFIG.ALLOW_MOCK_BACKEND,
      isDemoMode: AI_CONFIG.IS_DEMO_MODE,
      realFirebaseAvailable: isRealFirebaseAvailable(),
      models: {
        analysis: AI_CONFIG.GEMINI_ANALYSIS_MODEL,
        image: AI_CONFIG.GEMINI_IMAGE_MODEL,
        video: 'minimax/h3-max-turbo/image-to-video'
      },
      qaStatus: 'not_implemented'
    }
  });
}
