import { NextRequest, NextResponse } from 'next/server';
import { getOperatorSession } from '@/lib/auth/operator';
import { bindClient } from '@/lib/maharaja/client-context';
import { MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { LEAD_SOURCES, type LeadSource, cleanLeadText, leadsCsv, listLeads, maskMobile, normalizeIndianMobile, recordLead } from '@/lib/maharaja/leads';
import { readMirrorRecording } from '@/lib/maharaja/mirror-recordings';
import { resolveRequestClientId, verifyClientSessionCurrent, verifyMaharajaAccess } from '@/lib/maharaja/server';
import { readTryOnHandoff } from '@/lib/maharaja/tryon-handoff';
import { enforceRateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * `{ kind, ref, phone, marketingConsent, source }`: the customer's WhatsApp number before a download.
 * `kind` + `ref` name what is being downloaded (an AI Video or Try-On pass code, a TV looks link, a Live
 * Mirror video); it must be live, and it decides the store the lead belongs to. Returns the download token.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  const ref = typeof body?.ref === 'string' ? body.ref.trim() : '';
  const source: LeadSource = LEAD_SOURCES.includes(body?.source) ? body.source : 'try-on';
  if (!['pass', 'looks', 'mirror'].includes(kind) || !ref) {
    return NextResponse.json({ success: false, error: 'This download link is incomplete. Scan the QR again.' }, { status: 400 });
  }
  const rate = await enforceRateLimit(req, 'customer-lead', 12, 10 * 60 * 1000, ref);
  if (!rate.allowed) {
    return NextResponse.json({ success: false, error: 'Too many tries. Please wait a minute and try again.' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } });
  }
  const phone = normalizeIndianMobile(body?.phone);
  if (!phone) {
    return NextResponse.json({ success: false, error: 'Enter a 10-digit WhatsApp number.' }, { status: 400 });
  }
  // The AI Video download also asks for a name and city (the store follows up on premium pieces).
  const name = cleanLeadText(body?.name);
  const city = cleanLeadText(body?.city);
  if (source === 'ai-video' && (!name || !city)) {
    return NextResponse.json({ success: false, error: 'Enter your name and city.' }, { status: 400 });
  }

  let clientId: string | null = null;
  if (kind === 'pass') {
    const access = await verifyMaharajaAccess(req, ref, source === 'ai-video' ? 'ai-video' : 'try-on');
    // A finished AI Video can still be downloaded until its link expires.
    if (access.allowed) clientId = access.clientId;
    else if (source === 'ai-video' && access.error === 'This AI Video has been completed.') clientId = await resolveRequestClientId(req, ref);
  } else if (kind === 'looks') {
    const handoff = await readTryOnHandoff(ref);
    if (handoff) clientId = handoff.clientId || MAHARAJA_CLIENT_ID;
  } else {
    const recording = await readMirrorRecording(ref);
    if (recording) clientId = recording.clientId || MAHARAJA_CLIENT_ID;
  }
  if (!clientId) {
    return NextResponse.json({ success: false, error: 'This link has expired. Ask our staff for a new QR.' }, { status: 404 });
  }
  bindClient(clientId);
  const lead = await recordLead({ phone, marketingConsent: body?.marketingConsent === true, source, name, city, clientId });
  return NextResponse.json({ success: true, token: lead.token, phoneMasked: maskMobile(phone), alreadyRegistered: lead.alreadyRegistered }, { headers: { 'Cache-Control': 'private, no-store' } });
}

/** The store's customer list for its staff: JSON, or a CSV file with `?format=csv`. */
export async function GET(req: NextRequest) {
  // Only from the signed-in session: a store sees its own customers, TryFocus admin names the store.
  // A Go Live or TV pairing on the same browser never decides whose list this is.
  await verifyClientSessionCurrent(req);
  const session = getOperatorSession(req);
  const clientId = session?.role === 'client'
    ? session.clientId
    : session?.role === 'admin'
      ? (req.nextUrl.searchParams.get('clientId') || '').trim() || MAHARAJA_CLIENT_ID
      : null;
  if (!clientId) {
    return NextResponse.json({ success: false, error: 'Sign in to see your customers.' }, { status: 401 });
  }
  bindClient(clientId);
  const leads = await listLeads();
  if (req.nextUrl.searchParams.get('format') === 'csv') {
    return new NextResponse(`﻿${leadsCsv(leads)}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }
  return NextResponse.json({
    success: true,
    total: leads.length,
    offersAllowed: leads.filter((lead) => lead.marketingConsent).length,
    leads,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
