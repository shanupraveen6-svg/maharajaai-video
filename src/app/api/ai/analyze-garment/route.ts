import { NextRequest, NextResponse } from 'next/server';
import { analyzeGarmentImages } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { images } = body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one garment photograph is required.' },
        { status: 400 }
      );
    }

    const analysis = await analyzeGarmentImages(images);

    return NextResponse.json({
      success: true,
      analysis
    });
  } catch (error: any) {
    console.error('Garment Analysis Route Error:', error);
    return NextResponse.json(
      { success: false, error: `Failed to analyze garment photos: ${error?.message || 'Unknown Gemini error.'}` },
      { status: 500 }
    );
  }
}
