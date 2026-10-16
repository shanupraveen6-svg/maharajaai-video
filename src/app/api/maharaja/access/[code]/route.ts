import { NextRequest, NextResponse, after } from 'next/server';
import { getEventOption } from '@/lib/maharaja/config';
import {
  getTryOnDeviceStatus,
  incrementMaharajaUsage,
  incrementPassUsage,
  publicWorkspaceView,
  verifyMaharajaAccess,
  validTryOnDeviceId,
} from '@/lib/maharaja/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const service = req.nextUrl.searchParams.get('service') === 'try-on' ? 'try-on' : 'ai-video';
    const access = await verifyMaharajaAccess(req, code, service);
    if (!access.allowed) {
      return NextResponse.json({ success: false, error: access.error }, { status: 403 });
    }

    const workspace = access.workspace;
    const deviceId = req.nextUrl.searchParams.get('deviceId');
    const deviceStatus = validTryOnDeviceId(deviceId) ? await getTryOnDeviceStatus(deviceId) : null;
    after(async () => {
      try {
        if (service === 'try-on') await incrementMaharajaUsage('tryOnScans');
        else if (access.pass) await incrementPassUsage(access.pass.code, 'scans');
      } catch (err) {
        console.warn('Maharaja access counter update failed:', err);
      }
    });

    return NextResponse.json({
      success: true,
      workspace: publicWorkspaceView(workspace),
      access: {
        service,
        code,
        eventId: access.pass?.eventId || 'diwali',
        eventLabel: getEventOption(access.pass?.eventId || 'diwali').label,
        phoneMasked: access.pass?.phoneMasked || null,
        billLast4: access.pass?.billLast4 || null,
        expiresAt: access.pass?.expiresAt || null,
        tryOnUsed: deviceStatus?.status === 'used',
        tryOnImageDone: access.pass?.tryOnImageDone || false,
        tryOnImageUrl: access.pass?.tryOnImageUrl || null,
        videoMasterDone: access.pass?.videoMasterDone || false,
        videoMasterUrl: access.pass?.videoMasterUrl || null,
        videoDone: access.pass?.videoDone || false,
        retryUsed: access.pass?.retryUsed || false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to verify Maharaja access.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
