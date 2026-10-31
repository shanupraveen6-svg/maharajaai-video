import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { sendSupportEmail } from '@/lib/notify/email';
import { newEnquiryId, saveEnquiry, type Enquiry } from '@/lib/tryfocus/enquiries';

const MODULES = ['Image Try-On', 'Live AI Try-On', 'AI Video', 'TV Standee'];

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Public enquiry form: saved for TryFocus admin and emailed to TryFocus support. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request.' }, { status: 400 });
  }
  // Hidden field only bots fill in; answer as if it worked.
  if (text(body.website, 200)) return NextResponse.json({ success: true });

  const limit = await enforceRateLimit(req, 'enquiry', 5, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ success: false, error: 'Too many requests. Please call 9994837342.' }, { status: 429 });
  }

  const name = text(body.name, 80);
  const phone = text(body.phone, 20).replace(/[^\d+]/g, '');
  const storeName = text(body.storeName, 120);
  if (name.length < 2) return NextResponse.json({ success: false, error: 'Enter your name.' }, { status: 400 });
  if (!/^(\+?91)?[6-9]\d{9}$/.test(phone)) return NextResponse.json({ success: false, error: 'Enter a valid 10-digit mobile number.' }, { status: 400 });
  if (storeName.length < 2) return NextResponse.json({ success: false, error: 'Enter your store or brand name.' }, { status: 400 });

  const enquiry: Enquiry = {
    id: newEnquiryId(),
    name,
    phone,
    storeName,
    city: text(body.city, 80),
    interest: text(body.interest, 60) || 'General enquiry',
    modules: Array.isArray(body.modules) ? body.modules.filter((item): item is string => MODULES.includes(item as string)) : [],
    message: text(body.message, 1000),
    source: text(body.source, 60) || 'website',
    createdAt: new Date().toISOString(),
    emailed: false,
  };

  enquiry.emailed = await sendSupportEmail(`New enquiry · ${enquiry.interest} · ${enquiry.storeName}`, [
    `${enquiry.name} from ${enquiry.storeName}${enquiry.city ? `, ${enquiry.city}` : ''} is interested in: ${enquiry.interest}.`,
    `Phone: ${enquiry.phone}`,
    `Modules: ${enquiry.modules.length ? enquiry.modules.join(', ') : 'not selected'}`,
    `Message: ${enquiry.message || '—'}`,
    `From: ${enquiry.source} · ${new Date(enquiry.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`,
    `All enquiries: ${req.nextUrl.origin}/admin`,
  ]);

  try {
    await saveEnquiry(enquiry);
  } catch (error) {
    console.error('[enquiry] save failed', error);
    if (!enquiry.emailed) {
      return NextResponse.json({ success: false, error: 'Could not send right now. Please call 9994837342.' }, { status: 500 });
    }
  }
  return NextResponse.json({ success: true });
}
