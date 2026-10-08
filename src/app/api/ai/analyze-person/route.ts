import { NextRequest, NextResponse } from 'next/server';
import { analyzePersonImage } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { image } = body;

    if (!image) {
      return NextResponse.json(
        { success: false, error: 'Customer photograph is required.' },
        { status: 400 }
      );
    }

    const analysis = await analyzePersonImage(image);

    return NextResponse.json({
      success: true,
      analysis
    });
  } catch (error: any) {
    console.error('Person Analysis Route Error:', error);
    return NextResponse.json(
      { success: false, error: `Failed to analyze customer photo: ${error?.message || 'Unknown Gemini error.'}` },
      { status: 500 }
    );
  }
}
