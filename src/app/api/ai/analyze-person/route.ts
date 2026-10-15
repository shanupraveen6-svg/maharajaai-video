import { NextRequest, NextResponse } from 'next/server';
import { analyzePersonImage } from '@/lib/ai/gemini';
import { verifyMaharajaAccess } from '@/lib/maharaja/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { image, accessCode } = body;
    const service = body.service === 'try-on' ? 'try-on' : 'ai-video';
    const access = await verifyMaharajaAccess(req, accessCode, service);
    if (!access.allowed) {
      return NextResponse.json({ success: false, error: access.error }, { status: 401 });
    }

    if (!image) {
      return NextResponse.json(
        { success: false, error: 'Customer photograph is required.' },
        { status: 400 }
      );
    }

    const expectedGroup = body.category === 'boy' || body.category === 'girl' ? 'child' : 'adult';
    const analysis = await analyzePersonImage(image, expectedGroup);

    return NextResponse.json({
      success: true,
      analysis
    });
  } catch (error: any) {
    console.error('Person Analysis Route Error:', error);
    return NextResponse.json(
      { success: false, error: 'The customer photo could not be checked. Retake it in bright light with the full person visible.' },
      { status: 500 }
    );
  }
}
