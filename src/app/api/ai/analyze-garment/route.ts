import { NextRequest, NextResponse } from 'next/server';
import { analyzeGarmentImages } from '@/lib/ai/gemini';
import { verifyMaharajaAccess } from '@/lib/maharaja/server';

export const maxDuration = 45;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { images, accessCode } = body;
    const service = body.service === 'try-on' ? 'try-on' : 'ai-video';
    const access = await verifyMaharajaAccess(req, accessCode, service);
    if (!access.allowed) {
      return NextResponse.json({ success: false, error: access.error }, { status: 401 });
    }

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one garment photograph is required.' },
        { status: 400 }
      );
    }
    const maxImages = service === 'try-on' ? 1 : 3;
    if (images.length > maxImages) {
      return NextResponse.json({ success: false, error: service === 'try-on' ? 'Upload one garment photo only.' : 'Upload up to three garment photos.' }, { status: 400 });
    }

    const analysis = await analyzeGarmentImages(images);

    return NextResponse.json({
      success: true,
      analysis
    });
  } catch (error: any) {
    console.error('Garment Analysis Route Error:', error);
    return NextResponse.json(
      { success: false, error: 'The garment photos could not be checked. Retake clear front and detail photos.' },
      { status: 500 }
    );
  }
}
