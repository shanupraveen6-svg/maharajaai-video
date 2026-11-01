import { NextRequest, NextResponse } from 'next/server';
import { mirrorRecordingUrls, readMirrorRecording } from '@/lib/maharaja/mirror-recordings';
import { getClientWorkspaceById } from '@/lib/maharaja/server';

export const dynamic = 'force-dynamic';

/** The customer's phone: the private id in the QR is the only key. */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const record = await readMirrorRecording(id);
  if (!record) return NextResponse.json({ success: false, error: 'This Live Mirror video has expired.' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  const [urls, workspace] = await Promise.all([mirrorRecordingUrls(record), getClientWorkspaceById(record.clientId)]);
  return NextResponse.json({
    success: true,
    ...urls,
    contentType: record.contentType,
    garmentTitle: record.garmentTitle,
    clientName: workspace.clientName,
    expiresAt: new Date(record.expiresAtMs).toISOString(),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
