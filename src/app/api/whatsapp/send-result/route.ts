import { NextRequest, NextResponse } from 'next/server';
import { claimPassWhatsAppDelivery, getPublicAppUrl, getVideoPass, markPassWhatsAppDelivery, verifyMaharajaAccess } from '@/lib/maharaja/server';
import { getWhatsAppStatus, sendWhatsAppResult } from '@/lib/whatsapp';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const access = await verifyMaharajaAccess(req, body.accessCode, 'ai-video');
    if (!access.allowed || !access.pass) return NextResponse.json({ success: false, fallback: 'qr', error: access.allowed ? 'Customer pass is required.' : access.error }, { status: 401 });
    const pass = await getVideoPass(access.pass.code);
    if (!pass?.whatsappOptIn) return NextResponse.json({ success: true, sent: false, fallback: 'qr' });
    if (pass.whatsappSentAt) return NextResponse.json({ success: true, sent: true, duplicate: true });
    if (!pass.videoDone || !sessionId) return NextResponse.json({ success: false, fallback: 'qr', error: 'The AI Video is not ready.' }, { status: 409 });
    const status = getWhatsAppStatus();
    if (!status.configured) return NextResponse.json({ success: true, sent: false, fallback: 'qr', missing: status.missing });
    const claimed = await claimPassWhatsAppDelivery(pass.code);
    if (!claimed) return NextResponse.json({ success: true, sent: pass.whatsappDeliveryStatus === 'sent', duplicate: true, fallback: 'qr' });
    const resultUrl = getPublicAppUrl(`/result/${encodeURIComponent(sessionId)}?access=${encodeURIComponent(pass.code)}`);
    try {
      await sendWhatsAppResult(pass.phone, resultUrl);
      await markPassWhatsAppDelivery(pass.code, 'sent');
      return NextResponse.json({ success: true, sent: true });
    } catch (error) {
      await markPassWhatsAppDelivery(pass.code, 'failed');
      return NextResponse.json({ success: true, sent: false, fallback: 'qr', error: error instanceof Error ? error.message : 'WhatsApp delivery failed.' });
    }
  } catch (error) {
    return NextResponse.json({ success: false, fallback: 'qr', error: error instanceof Error ? error.message : 'Unable to send WhatsApp result.' }, { status: 500 });
  }
}
