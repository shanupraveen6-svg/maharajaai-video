import { NextRequest, NextResponse, after } from 'next/server';
import { getDb } from '@/lib/firebase/admin';
import { getEventOption, ENFORCE_REPEAT_LIMITS } from '@/lib/maharaja/config';
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
    let recoveryJob: { id: string; sessionId: string } | null = null;
    if (service === 'ai-video' && access.pass && !access.pass.videoDone) {
      const recoverableStatuses = new Set(['preparing', 'submitted', 'processing', 'unknown', 'finalizing', 'post_processing_failed']);
      const db = getDb();
      if (db) {
        let job: { id?: string; sessionId?: string; status?: string; updatedAt?: string } | undefined;
        const activeJobId = access.pass.activeVideoJobId;
        if (activeJobId) job = (await db.collection('videoTestJobs').doc(activeJobId).get()).data();
        if (!job || !recoverableStatuses.has(String(job.status))) {
          const snapshot = await db.collection('videoTestJobs').where('accessCode', '==', access.pass.code).limit(20).get();
          job = snapshot.docs
            .map((doc) => ({ id: doc.id, ...(doc.data() as { sessionId?: string; status?: string; updatedAt?: string }) }))
            .filter((item) => recoverableStatuses.has(String(item.status)))
            .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))[0];
        }
        if (job && typeof job.id === 'string' && typeof job.sessionId === 'string' && recoverableStatuses.has(String(job.status))) {
          recoveryJob = { id: job.id, sessionId: job.sessionId };
        }
      }
    }
    const runBackground = async () => {
      try {
        if (service === 'try-on') await incrementMaharajaUsage('tryOnScans');
        else if (access.pass) await incrementPassUsage(access.pass.code, 'scans');
      } catch (err) {
        console.warn('Maharaja access counter update failed:', err);
      }
    };
    try {
      after(runBackground);
    } catch {
      runBackground().catch(() => undefined);
    }

    return NextResponse.json({
      success: true,
      workspace: publicWorkspaceView(workspace),
      allowances: access.allowances,
      access: {
        service,
        code,
        eventId: access.pass?.eventId || 'diwali',
        eventLabel: getEventOption(access.pass?.eventId || 'diwali').label,
        phoneMasked: access.pass?.phoneMasked || null,
        billLast4: access.pass?.billLast4 || null,
        experienceType: access.pass?.experienceType || 'purchased-garment',
        catalogueProduct: access.pass?.catalogueSku ? {
          sku: access.pass.catalogueSku,
          title: access.pass.catalogueTitle,
          price: access.pass.cataloguePrice,
        } : null,
        expiresAt: access.pass?.expiresAt || null,
        tryOnUsed: ENFORCE_REPEAT_LIMITS && (deviceStatus?.status === 'used' || access.allowances.tryOn.used >= 2),
        tryOnImageDone: access.pass?.tryOnImageDone || false,
        tryOnImageUrl: access.pass?.tryOnImageUrl || null,
        videoMasterDone: access.pass?.videoMasterDone || false,
        videoMasterUrl: access.pass?.videoMasterUrl || null,
        videoMasterApproved: access.pass?.videoMasterApproved || false,
        videoMasterPromptSet: access.pass?.videoMasterPromptSet || null,
        videoMasterPoseId: access.pass?.videoMasterPoseId || null,
        videoMasterCategory: access.pass?.videoMasterCategory || null,
        videoMasterGarmentType: access.pass?.videoMasterGarmentType || null,
        videoDone: access.pass?.videoDone || false,
        videoReferenceSessionId: recoveryJob?.sessionId || access.pass?.videoReferenceSessionId || null,
        activeVideoJobId: recoveryJob?.id || access.pass?.activeVideoJobId || null,
        retryUsed: ENFORCE_REPEAT_LIMITS ? Boolean(access.pass?.retryUsed || deviceStatus?.retryUsed) : false,
        allowances: access.allowances,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to verify Maharaja access.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
