import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { isEventId } from '@/lib/maharaja/config';
import { verifyMaharajaAccess } from '@/lib/maharaja/server';

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId') || '';
  const accessCode = req.nextUrl.searchParams.get('accessCode') || '';
  const access = await verifyMaharajaAccess(req, accessCode, 'ai-video');
  if (!access.allowed) return NextResponse.json({ success: false, error: access.error }, { status: 401 });
  if (!sessionId) return NextResponse.json({ success: false, error: 'Original video session is required.' }, { status: 400 });

  const db = getDb();
  const session = db
    ? (await db.collection('sessions').doc(sessionId).get()).data()
    : getMockStore().sessions.get(sessionId);
  if (!session || session.accessCode !== accessCode || !session.masterImageUrl) {
    return NextResponse.json({ success: false, error: 'The approved image for this video retry is unavailable.' }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    source: {
      masterImageUrl: session.masterImageUrl,
      eventId: isEventId(session.eventId) ? session.eventId : access.pass?.eventId || 'diwali',
      category: ['women', 'men', 'girl', 'boy'].includes(session.templateId) ? session.templateId : 'women',
      garmentAnalysis: session.garmentAnalysis || null,
    },
  });
}
