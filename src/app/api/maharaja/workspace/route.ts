import { NextRequest, NextResponse } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { getDb, getMockStore, getSignedPlaybackUrl } from '@/lib/firebase/admin';
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
    const [workspace, recentPasses, allActivity] = await Promise.all([
      getMaharajaWorkspace(),
      listRecentVideoPasses(),
      listMaharajaActivity(300),
    ]);
    const daily = new Map<string, { date: string; scans: number; tryOns: number; gmv: number; downloads: number }>();
    for (const item of allActivity) {
      const date = item.createdAt.slice(0, 10);
      const row = daily.get(date) || { date, scans: 0, tryOns: 0, gmv: 0, downloads: 0 };
      if (item.type === 'price-scan') { row.scans += 1; row.gmv += Number(item.metadata?.amount || 0); }
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
      .filter((item) => item.type === 'price-scan' && item.metadata?.amount)
      .map((item) => Number(item.metadata?.amount || 0));

    const passAmounts = allActivity
      .filter((item) => item.type === 'video-pass' && item.metadata?.amount)
      .map((item) => Number(item.metadata?.amount || 0));
    // GMV is exact only for OCR-scanned garment prices. Billing-counter values are
    // eligibility tiers, so they are reported as customer counts rather than rupees.
    const totalGmv = scannedPrices.reduce((sum, amount) => sum + amount, 0);

    const tier5kPlus = passAmounts.filter((amt) => amt >= 5000).length;
    const tier7kPlus = passAmounts.filter((amt) => amt >= 7000).length;
    const tier10kPlus = passAmounts.filter((amt) => amt >= 10000).length;

    const passAbove5k = passAmounts.filter((amount) => amount >= 5000);
    const totalAbove5kCount = Math.max(
      workspace.usage.videoPasses || 0,
      passAbove5k.length
    );

    const allKnownAbove5k = passAbove5k;
    let tier5kTo7k = allKnownAbove5k.filter((amt) => amt >= 5000 && amt < 7000).length;
    let tier7kTo10k = allKnownAbove5k.filter((amt) => amt >= 7000 && amt < 10000).length;

    const remainingPasses = totalAbove5kCount - (tier5kTo7k + tier7kTo10k + tier10kPlus);
    if (remainingPasses > 0) {
      tier5kTo7k += remainingPasses;
    }

    const imageRetries = allActivity.filter(
      (item) => item.type === 'retry' && (item.metadata?.target === 'image' || item.metadata?.service === 'try-on')
    ).length;
    const videoRetries = allActivity.filter(
      (item) => item.type === 'retry' && (item.metadata?.target === 'video' || item.metadata?.service === 'ai-video')
    ).length;

    const imagesSuccess = Math.max(workspace.usage.tryOnGenerated || 0, allActivity.filter((item) => item.type === 'try-on').length);
    const readyPassesCount = recentPasses.filter((pass) => pass.videoDone === true).length;
    const readyActivityCount = allActivity.filter(
      (item) => item.type === 'video-ready' || (item.type === 'video' && Boolean(item.metadata?.videoUrl))
    ).length;
    const videosSuccess = Math.max(workspace.usage.videosGenerated || 0, readyPassesCount, readyActivityCount);

    // Group days into weekly summary
    const weeklyMap = new Map<string, { week: string; scans: number; tryOns: number; gmv: number; conversion: number }>();
    for (const d of days) {
      const dateObj = new Date(d.date);
      const day = dateObj.getDay();
      const diff = dateObj.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(dateObj.setDate(diff)).toISOString().slice(0, 10);
      const weekLabel = `Week of ${monday}`;
      const wRow = weeklyMap.get(weekLabel) || { week: weekLabel, scans: 0, tryOns: 0, gmv: 0, conversion: 0 };
      wRow.scans += d.scans;
      wRow.tryOns += d.tryOns;
      wRow.gmv += d.gmv;
      weeklyMap.set(weekLabel, wRow);
    }
    const weeks = Array.from(weeklyMap.values()).map((w) => ({
      ...w,
      conversion: w.scans ? Math.min(100, Math.round((w.tryOns / w.scans) * 100)) : 0,
    }));

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
    const rawAudit: Array<{
      id: string;
      createdAt: string;
      customerName: string;
      phone: string;
      phoneMasked: string;
      videoUrl: string;
      sessionId: string;
      queueNumber: number;
    }> = [];

    allActivity
      .filter((item) => item.type === 'go-live')
      .forEach((item) => {
        const metadata = item.metadata || {};
        const sessionId = String(metadata.sessionId || '');
        if (sessionId) seenSessions.add(sessionId);

        const matchedQueue = liveQueueItems.find((q) => q.sessionId === sessionId);
        const customerName = String(metadata.customerName || matchedQueue?.customerName || 'Maharaja Customer');
        const phone = String(metadata.phone || '');
        const phoneMasked = String(metadata.phoneMasked || (phone ? `${phone.slice(0, 2)}******${phone.slice(-2)}` : 'Customer'));
        const videoUrl = String(metadata.videoUrl || matchedQueue?.videoUrl || '');
        const queueNumber = Number(metadata.queueNumber || matchedQueue?.queueNumber || 1);

        if (videoUrl && videoUrl.trim().length > 10 && !videoUrl.includes('undefined')) {
          rawAudit.push({
            id: item.id,
            createdAt: item.createdAt,
            customerName,
            phone,
            phoneMasked,
            videoUrl,
            sessionId,
            queueNumber,
          });
        }
      });

    // Also include any items from liveQueue that have a real video
    liveQueueItems.forEach((q) => {
      const videoUrl = String(q.videoUrl || '');
      if (videoUrl && videoUrl.trim().length > 10 && !videoUrl.includes('undefined')) {
        if (!q.sessionId || !seenSessions.has(q.sessionId)) {
          if (q.sessionId) seenSessions.add(q.sessionId);
          rawAudit.push({
            id: q.id,
            createdAt: q.createdAt || new Date().toISOString(),
            customerName: q.customerName || 'Maharaja Customer',
            phone: '',
            phoneMasked: 'Customer',
            videoUrl,
            sessionId: q.sessionId || '',
            queueNumber: Number(q.queueNumber || 1),
          });
        }
      }
    });

    const resolvedGoLiveAudit = await Promise.all(
      rawAudit.map(async (item) => {
        let videoUrl = item.videoUrl;
        if (videoUrl.startsWith('sessions/') || videoUrl.startsWith('clients/')) {
          try {
            videoUrl = await getSignedPlaybackUrl(videoUrl);
          } catch {
            // Keep original URL if signing fails
          }
        }
        return { ...item, videoUrl };
      })
    );

    resolvedGoLiveAudit.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({
      success: true,
      workspace: {
        ...workspace,
        ...getWorkspaceLinks(workspace),
        recentPasses: recentPasses.map(publicPass),
        activity: allActivity.slice(0, 30),
        goLiveAudit: resolvedGoLiveAudit,
        integrations: { whatsapp: getWhatsAppStatus() },
        analytics: {
          totalGmv,
          totalGarments: scannedPrices.length,
          imagesSuccess,
          imageRetries,
          videosSuccess,
          videoRetries,
          tryOnsCount: imagesSuccess,
          shoppersAbove5000: tier5kPlus,
          tier5kPlus,
          tier7kPlus,
          tier10kPlus,
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
          weeks,
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
