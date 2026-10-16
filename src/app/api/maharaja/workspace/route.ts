import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import {
  getMaharajaWorkspace,
  getWorkspaceLinks,
  listRecentVideoPasses,
  listMaharajaActivity,
  logMaharajaActivity,
  updateMaharajaSettings,
} from '@/lib/maharaja/server';
import { EVENT_IDS, FESTIVE_TIER_MIN, LUXURY_TIER_MIN, isEventId } from '@/lib/maharaja/config';
import { getWhatsAppStatus } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

function publicPass(pass: Awaited<ReturnType<typeof listRecentVideoPasses>>[number]) {
  return {
    code: pass.code,
    phoneMasked: pass.phoneMasked,
    billLast4: pass.billLast4,
    eventId: pass.eventId,
    status: pass.status,
    createdAt: pass.createdAt,
    expiresAt: pass.expiresAt,
    usage: pass.usage,
  };
}

export async function GET(req: NextRequest) {
  if (!verifyOperatorRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized Maharaja session.' }, { status: 401 });
  }

  try {
    const workspace = await getMaharajaWorkspace();
    const [recentPasses, allActivity] = await Promise.all([listRecentVideoPasses(), listMaharajaActivity(500)]);
    const daily = new Map<string, { date: string; scans: number; tryOns: number; gmv: number; downloads: number }>();
    for (const item of allActivity) {
      const date = item.createdAt.slice(0, 10);
      const row = daily.get(date) || { date, scans: 0, tryOns: 0, gmv: 0, downloads: 0 };
      if (item.type === 'price-scan') { row.scans += 1; row.gmv += Number(item.metadata?.amount || 0); }
      if (item.type === 'video-pass') { row.gmv += Number(item.metadata?.amount || 0); }
      if (item.type === 'try-on') row.tryOns += 1;
      if (item.type === 'download') row.downloads += 1;
      daily.set(date, row);
    }
    const days = Array.from(daily.values()).sort((a, b) => b.date.localeCompare(a.date)).map((row) => ({
      ...row,
      averagePrice: row.scans ? Math.round(row.gmv / row.scans) : 0,
      conversion: row.scans ? Math.min(100, Math.round((row.tryOns / row.scans) * 100)) : 0,
    }));
    const luxuryThreshold = Number(process.env.MAHARAJA_LUXURY_TIER_MIN) || LUXURY_TIER_MIN;
    const festiveThreshold = Number(process.env.MAHARAJA_FESTIVE_TIER_MIN) || FESTIVE_TIER_MIN;
    const scannedPrices = allActivity
      .filter((item) => (item.type === 'price-scan' || item.type === 'video-pass') && item.metadata?.amount)
      .map((item) => Number(item.metadata?.amount || 0));
    const totalGmv = scannedPrices.reduce((sum, amount) => sum + amount, 0);

    const passAmounts = allActivity
      .filter((item) => item.type === 'video-pass' && item.metadata?.amount)
      .map((item) => Number(item.metadata?.amount || 0));

    const scanAbove5k = scannedPrices.filter((amount) => amount >= 5000);
    const passAbove5k = passAmounts.filter((amount) => amount >= 5000);
    const totalAbove5kCount = Math.max(
      workspace.usage.videoPasses || 0,
      scanAbove5k.length + passAbove5k.length
    );

    const allKnownAbove5k = [...scanAbove5k, ...passAbove5k];
    let tier5kTo7k = allKnownAbove5k.filter((amt) => amt >= 5000 && amt < 7000).length;
    let tier7kTo10k = allKnownAbove5k.filter((amt) => amt >= 7000 && amt < 10000).length;
    let tier10kPlus = allKnownAbove5k.filter((amt) => amt >= 10000).length;

    const remainingPasses = totalAbove5kCount - (tier5kTo7k + tier7kTo10k + tier10kPlus);
    if (remainingPasses > 0) {
      tier5kTo7k += remainingPasses;
    }

    const luxuryCount = scannedPrices.filter((amount) => amount >= luxuryThreshold).length;
    const brandedReach = allActivity.filter((item) => item.type === 'download' || item.type === 'share').length;

    // Retrieve live queue items to ensure comprehensive Go-Live records
    const liveQueueItems: any[] = [];
    const db = getDb();
    if (db) {
      try {
        const snap = await db.collection('liveQueue')
          .where('screenId', '==', 'maharaja-main')
          .limit(50)
          .get();
        snap.docs.forEach((doc) => liveQueueItems.push({ id: doc.id, ...doc.data() }));
      } catch (err) {
        console.warn('liveQueue fetch warning in workspace route:', err);
      }
    } else {
      const mockStore = getMockStore();
      liveQueueItems.push(...(mockStore.liveQueue || []));
    }

    const seenSessions = new Set<string>();
    const goLiveAudit = allActivity
      .filter((item) => item.type === 'go-live')
      .map((item) => {
        const metadata = item.metadata || {};
        const sessionId = String(metadata.sessionId || '');
        if (sessionId) seenSessions.add(sessionId);

        const matchedQueue = liveQueueItems.find((q) => q.sessionId === sessionId);
        const customerName = String(metadata.customerName || matchedQueue?.customerName || 'Maharaja Customer');
        const phone = String(metadata.phone || '');
        const phoneMasked = String(metadata.phoneMasked || (phone ? `${phone.slice(0, 2)}******${phone.slice(-2)}` : 'Customer'));
        const videoUrl = String(metadata.videoUrl || matchedQueue?.videoUrl || '');
        const queueNumber = Number(metadata.queueNumber || matchedQueue?.queueNumber || 1);

        return {
          id: item.id,
          createdAt: item.createdAt,
          customerName,
          phone,
          phoneMasked,
          videoUrl,
          sessionId,
          queueNumber,
        };
      });

    // Also include any items from liveQueue that were enqueued
    liveQueueItems.forEach((q) => {
      if (q.sessionId && !seenSessions.has(q.sessionId)) {
        seenSessions.add(q.sessionId);
        goLiveAudit.push({
          id: q.id,
          createdAt: q.createdAt || new Date().toISOString(),
          customerName: q.customerName || 'Maharaja Customer',
          phone: '',
          phoneMasked: 'Customer',
          videoUrl: q.videoUrl || '',
          sessionId: q.sessionId,
          queueNumber: Number(q.queueNumber || 1),
        });
      }
    });

    goLiveAudit.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({
      success: true,
      workspace: {
        ...workspace,
        ...getWorkspaceLinks(req.nextUrl.origin, workspace),
        recentPasses: recentPasses.map(publicPass),
        activity: allActivity.slice(0, 30),
        goLiveAudit,
        integrations: { whatsapp: getWhatsAppStatus() },
        analytics: {
          totalGmv,
          totalGarments: scannedPrices.length,
          tryOnsCount: workspace.usage.tryOnGenerated || 0,
          shoppersAbove5000: totalAbove5kCount,
          tiers: {
            tier5kTo7k,
            tier7kTo10k,
            tier10kPlus,
            total: totalAbove5kCount,
          },
          brandedReach,
          luxuryCount,
          festiveCount: scannedPrices.length - luxuryCount,
          luxuryThreshold,
          festiveThreshold,
          days,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Maharaja workspace.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!verifyOperatorRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized Maharaja session.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const settings: Parameters<typeof updateMaharajaSettings>[0] = {};
    if (typeof body.campaignEnabled === 'boolean') settings.campaignEnabled = body.campaignEnabled;
    if (Array.isArray(body.activeEvents)) {
      const activeEvents = body.activeEvents.filter(isEventId);
      if (!activeEvents.length) {
        return NextResponse.json({ success: false, error: 'Select a valid festival event.' }, { status: 400 });
      }
      // Strictly enforce single event selection (no 2-3 events at the same time)
      const singleEvent = activeEvents[0];
      settings.activeEvents = [singleEvent];
      settings.defaultEvent = singleEvent;
    } else if (isEventId(body.defaultEvent)) {
      settings.activeEvents = [body.defaultEvent];
      settings.defaultEvent = body.defaultEvent;
    }
    if (!Object.keys(settings).length) {
      return NextResponse.json({ success: false, error: `Provide campaignEnabled or active event (${EVENT_IDS.join(', ')}).` }, { status: 400 });
    }
    const workspace = await updateMaharajaSettings(settings);
    await logMaharajaActivity('campaign', 'Maharaja campaign settings updated', {
      enabled: workspace.campaignEnabled,
      activeEvents: workspace.activeEvents.join(','),
      defaultEvent: workspace.defaultEvent,
    });
    return NextResponse.json({ success: true, workspace });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update Maharaja workspace.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
