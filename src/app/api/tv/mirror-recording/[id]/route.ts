import { NextRequest, NextResponse } from 'next/server';
import { runAfter } from '@/lib/maharaja/run-after';
import { mirrorRecordingUrls, readMirrorRecording, expireMirrorRecordingAfterDownload } from '@/lib/maharaja/mirror-recordings';
import { getClientWorkspaceById } from '@/lib/maharaja/server';
import { MAHARAJA_CLIENT_ID } from '@/lib/maharaja/config';
import { countLeadDownload, verifyLeadToken } from '@/lib/maharaja/leads';

export const dynamic = 'force-dynamic';

/**
 * The customer's phone: the private id in the QR is the only key to watch. The download link comes only
 * with `?lead=` (the token from the customer's WhatsApp number).
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const record = await readMirrorRecording(id);
  if (!record) return NextResponse.json({ success: false, error: 'This Western Try-On video has expired.' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  const [urls, workspace] = await Promise.all([mirrorRecordingUrls(record), getClientWorkspaceById(record.clientId)]);
  const lead = verifyLeadToken(req.nextUrl.searchParams.get('lead'), record.clientId || MAHARAJA_CLIENT_ID);
  if (lead && req.nextUrl.searchParams.get('download') === '1') {
    void countLeadDownload(lead.leadId, record.clientId || MAHARAJA_CLIENT_ID).catch(() => undefined);
    // Downloaded: wiped within minutes; the hour was only the grace period to download.
    runAfter(() => expireMirrorRecordingAfterDownload(id).catch(() => undefined));
  }
  return NextResponse.json({
    success: true,
    ...urls,
    downloadUrl: lead ? urls.downloadUrl : null,
    looks: urls.looks.map((look) => ({ ...look, downloadable: Boolean(lead) })),
    contentType: record.contentType,
    garmentTitle: record.garmentTitle,
    clientName: workspace.clientName,
    expiresAt: new Date(record.expiresAtMs).toISOString(),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
