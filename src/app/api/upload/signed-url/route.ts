import { NextRequest, NextResponse } from 'next/server';
import { getStorageBucket, isRealFirebaseAvailable } from '@/lib/firebase/admin';
import { verifyOperatorRequest } from '@/lib/auth/operator';

export async function POST(req: NextRequest) {
  try {
    if (!verifyOperatorRequest(req)) {
      return NextResponse.json({ success: false, error: 'Unauthorized operator session. Please login again.' }, { status: 401 });
    }

    const body = await req.json();
    const { sessionId, assetType, contentType = 'image/jpeg' } = body;

    if (!sessionId || !assetType) {
      return NextResponse.json(
        { success: false, error: 'sessionId and assetType parameters are required.' },
        { status: 400 }
      );
    }

    const ext = (contentType.split('/')[1] || 'jpg').split(';')[0];
    const assetId = `${assetType}_${Date.now()}`;
    
    let storagePath = '';
    if (assetType === 'garment') {
      storagePath = `sessions/${sessionId}/garments/${assetId}.${ext}`;
    } else if (assetType === 'person') {
      storagePath = `sessions/${sessionId}/person/${assetId}.${ext}`;
    } else if (assetType === 'master') {
      storagePath = `sessions/${sessionId}/master/master.${ext}`;
    } else if (assetType === 'video') {
      const videoExt = ext === 'webm' ? 'webm' : 'mp4';
      storagePath = `sessions/${sessionId}/video/final.${videoExt}`;
    } else {
      return NextResponse.json({ success: false, error: 'Invalid assetType.' }, { status: 400 });
    }

    const bucket = getStorageBucket();

    if (bucket && isRealFirebaseAvailable()) {
      const file = bucket.file(storagePath);
      const [uploadUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes signed upload URL
        contentType
      });

      return NextResponse.json({
        success: true,
        uploadUrl,
        storagePath,
        assetId,
        directUpload: true
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Firebase Storage is not configured. Direct upload URL cannot be generated.',
        storagePath,
        assetId,
        directUpload: false
      },
      { status: 500 }
    );
  } catch (error: any) {
    console.error('Signed Upload URL Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to generate upload URL' }, { status: 500 });
  }
}
