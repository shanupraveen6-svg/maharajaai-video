import { NextRequest, NextResponse } from 'next/server';
import { getOperatorSession, verifyAdminRequest, verifyOperatorRequest } from '@/lib/auth/operator';
import { getDb, getMockStore, getSignedPlaybackUrl } from '@/lib/firebase/admin';
import {
  verifyClientSessionCurrent,
  getClientWorkspaceById,
  getClientWorkspaceByWorkspaceCode,
  getMaharajaWorkspace,
  getWorkspaceLinks,
  listRecentVideoPasses,
  listMaharajaActivity,
  logMaharajaActivity,
  type MaharajaWorkspace,
  updateMaharajaSettings,
} from '@/lib/maharaja/server';
import { EVENT_IDS, FESTIVE_TIER_MIN, LUXURY_TIER_MIN, isEventId } from '@/lib/maharaja/config';
import { getWhatsAppStatus } from '@/lib/whatsapp';
import { bindClient, liveScreenId } from '@/lib/maharaja/client-context';

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

async function listShowcaseSamples(): Promise<Array<{ id: string; displayName: string; createdAt: string }>> {
  const db = getDb();
  if (db) {
    try {
      const snap = await db.collection('videos').where('isShowcaseSample', '==', true).limit(30).get();
      return snap.docs
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            displayName: String(data?.displayName || data?.customerName || 'Maharaja Festival Showcase'),
            createdAt: String(data?.createdAt || new Date().toISOString()),
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }
  const store = getMockStore();
  return Array.from(store.videos.values())
    .filter((v: any) => v && v.isShowcaseSample === true)
    .map((v: any) => ({
      id: String(v.id),
      displayName: String(v.displayName || v.customerName || 'Maharaja Festival Showcase'),
      createdAt: String(v.createdAt || new Date().toISOString()),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function buildHydratedWorkspacePayload(targetWorkspace?: MaharajaWorkspace) {
  const [workspace, recentPasses, allActivity, showcaseSamples] = await Promise.all([
    targetWorkspace ? Promise.resolve(targetWorkspace) : getMaharajaWorkspace(),
    listRecentVideoPasses(100),
    listMaharajaActivity(300),
    listShowcaseSamples(),
  ]);
  const daily = new Map<string, { date: string; scans: number; tryOns: number; gmv: number; downloads: number }>();
  for (const item of allActivity) {
    const date = item.createdAt.slice(0, 10);
    const row = daily.get(date) || { date, scans: 0, tryOns: 0, gmv: 0, downloads: 0 };
    if (item.type === 'price-scan') {
      row.scans += 1;
      row.gmv += Number(item.metadata?.amount || 0);
    }
    if (item.type === 'try-on') row.tryOns += 1;
    if (item.type === 'download') row.downloads += 1;
    daily.set(date, row);
  }
  const days = Array.from(daily.values())
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((row) => ({
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
  const totalGmv = scannedPrices.reduce((sum, amount) => sum + amount, 0);

  const tier5kPlus = passAmounts.filter((amt) => amt >= 5000).length;
  const tier7kPlus = passAmounts.filter((amt) => amt >= 7000).length;
  const tier10kPlus = passAmounts.filter((amt) => amt >= 10000).length;

  const passAbove5k = passAmounts.filter((amount) => amount >= 5000);
  const totalAbove5kCount = Math.max(workspace.usage.videoPasses || 0, passAbove5k.length);

  let tier5kTo7k = passAbove5k.filter((amt) => amt >= 5000 && amt < 7000).length;
  const tier7kTo10k = passAbove5k.filter((amt) => amt >= 7000 && amt < 10000).length;

  const remainingPasses = totalAbove5kCount - (tier5kTo7k + tier7kTo10k + tier10kPlus);
  if (remainingPasses > 0) {
    tier5kTo7k += remainingPasses;
  }

  const recordedTotalRetries = Number(workspace.usage.retries || 0);
  const activityImageRetries = allActivity.filter(
    (item) => item.type === 'retry' && (item.metadata?.target === 'image' || item.metadata?.service === 'try-on')
  ).length;
  const activityVideoRetries = allActivity.filter(
    (item) => item.type === 'retry' && (item.metadata?.target === 'video' || item.metadata?.service === 'ai-video')
  ).length;
  const activityTotalRetries = activityImageRetries + activityVideoRetries;
  const effectiveTotalRetries = Math.max(recordedTotalRetries, activityTotalRetries);
  const imageRetries =
    activityTotalRetries > 0
      ? Math.round(effectiveTotalRetries * (activityImageRetries / activityTotalRetries))
      : Math.floor(effectiveTotalRetries / 2);
  const videoRetries = effectiveTotalRetries - imageRetries;

  const imagesSuccess = Math.max(
    workspace.usage.tryOnGenerated || 0,
    allActivity.filter((item) => item.type === 'try-on').length
  );
  const readyPassesCount = recentPasses.filter((pass) => pass.videoDone === true).length;
  const readyActivityCount = allActivity.filter(
    (item) => item.type === 'video-ready' || (item.type === 'video' && Boolean(item.metadata?.videoUrl))
  ).length;
  const videosSuccess = Math.max(workspace.usage.videosGenerated || 0, readyPassesCount, readyActivityCount);
  const videoFailures = recentPasses.filter((pass) => pass.lastVideoFailed === true && pass.videoDone !== true).length;
  const videosRendering = recentPasses.filter((pass) => pass.videoGenerating === true && pass.videoDone !== true).length;
  const imageFailures = allActivity.filter((item) => item.type === 'image-failed').length;

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

  const liveQueueItems: any[] = [];
  const db = getDb();
  if (db) {
    try {
      const snap = await db
        .collection('liveQueue')
        .where('screenId', '==', liveScreenId())
        .limit(50)
        .get();
      snap.docs.forEach((doc) => liveQueueItems.push({ id: doc.id, ...doc.data() }));
      await Promise.all(
        liveQueueItems.map(async (item) => {
          if (item.videoUrl || !item.videoId) return;
          const video = await db.collection('videos').doc(String(item.videoId)).get();
          const data = video.data();
          item.videoUrl = data?.liveStoragePath || data?.storagePath || '';
          item.promotionConsent = item.promotionConsent === true || data?.promotionConsent === true;
        })
      );
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
    customerLocality: string;
    eventId: string;
    status: string;
    liveConsent: boolean;
    loopConsent: boolean;
    expiresAt: string | null;
    phone: string;
    phoneMasked: string;
    videoUrl: string;
    sessionId: string;
    queueNumber: number;
    promotionConsent: boolean;
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
      const phoneMasked = String(
        metadata.phoneMasked || (phone ? `${phone.slice(0, 2)}******${phone.slice(-2)}` : 'Customer')
      );
      const videoUrl = String(metadata.videoUrl || matchedQueue?.videoUrl || '');
      const queueNumber = Number(metadata.queueNumber || matchedQueue?.queueNumber || 1);
      const promotionConsent = metadata.promotionConsent === true || matchedQueue?.promotionConsent === true;

      if (videoUrl && videoUrl.trim().length > 10 && !videoUrl.includes('undefined')) {
        rawAudit.push({
          id: item.id,
          createdAt: item.createdAt,
          customerName,
          customerLocality: String(metadata.customerLocality || 'Thanjavur'),
          eventId: String(metadata.eventId || workspace.defaultEvent || 'diwali'),
          status: String(matchedQueue?.status || 'ready'),
          liveConsent: true,
          loopConsent: true,
          expiresAt: null,
          phone,
          phoneMasked,
          videoUrl,
          sessionId,
          queueNumber,
          promotionConsent,
        });
      }
    });

  liveQueueItems.forEach((q) => {
    const videoUrl = String(q.videoUrl || '');
    if (videoUrl && videoUrl.trim().length > 10 && !videoUrl.includes('undefined')) {
      if (!q.sessionId || !seenSessions.has(q.sessionId)) {
        if (q.sessionId) seenSessions.add(q.sessionId);
        rawAudit.push({
          id: q.id,
          createdAt: q.createdAt || new Date().toISOString(),
          customerName: q.customerName || 'Maharaja Customer',
          customerLocality: String(q.customerLocality || 'Thanjavur'),
          eventId: String(q.eventId || workspace.defaultEvent || 'diwali'),
          status: String(q.status || 'ready'),
          liveConsent: true,
          loopConsent: true,
          expiresAt: null,
          phone: '',
          phoneMasked: 'Customer',
          videoUrl,
          sessionId: q.sessionId || '',
          queueNumber: Number(q.queueNumber || 1),
          promotionConsent: q.promotionConsent === true,
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

  const whatsappStatus = getWhatsAppStatus();
  return {
    ...workspace,
    ...getWorkspaceLinks(workspace),
    whatsapp: whatsappStatus,
    whatsappConnected: workspace.whatsappConnected === true,
    whatsappEnabled: workspace.whatsappConnected === true && whatsappStatus.configured,
    showcaseSamples,
    recentPasses: recentPasses.map(publicPass),
    activity: allActivity.slice(0, 30),
    goLiveAudit: resolvedGoLiveAudit,
    integrations: { whatsapp: whatsappStatus },
    analytics: {
      totalGmv,
      totalGarments: scannedPrices.length,
      imagesSuccess,
      imageRetries,
      videosSuccess,
      videoRetries,
      imageFailures,
      videoFailures,
      videosRendering,
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
  };
}

/** A client's own login always gets its own workspace; TryFocus admin may open any client by code. */
async function workspaceForSession(req: NextRequest, requestedCode: string | null) {
  if (!await verifyClientSessionCurrent(req)) return null;
  const session = getOperatorSession(req);
  const workspace = session?.role === 'client' && session.clientId
    ? await getClientWorkspaceById(session.clientId)
    : await getClientWorkspaceByWorkspaceCode(requestedCode);
  if (workspace) bindClient(workspace.clientId);
  return workspace;
}

export async function GET(req: NextRequest) {
  await verifyClientSessionCurrent(req);
  if (!verifyOperatorRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized Maharaja session.' }, { status: 401 });
  }

  try {
    const requestedCode = req.nextUrl.searchParams.get('workspaceCode') || req.nextUrl.searchParams.get('clientId');
    const targetWorkspace = await workspaceForSession(req, requestedCode);
    if (!targetWorkspace) {
      return NextResponse.json({ success: false, error: 'Client workspace not found.' }, { status: 404 });
    }
    const workspace = await buildHydratedWorkspacePayload(targetWorkspace);
    return NextResponse.json({
      success: true,
      workspace,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Maharaja workspace.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  await verifyClientSessionCurrent(req);
  if (!verifyOperatorRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized Maharaja session.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const requestedCode = body.workspaceCode || body.clientId || req.nextUrl.searchParams.get('workspaceCode');
    const targetWorkspace = await workspaceForSession(req, requestedCode);
    if (!targetWorkspace) {
      return NextResponse.json({ success: false, error: 'Client workspace not found.' }, { status: 404 });
    }
    // Credits, purchased devices and the WhatsApp connection are set by TryFocus, not by the client.
    if (!verifyAdminRequest(req) && ['limits', 'modules', 'devices', 'whatsappConnected', 'deliveryMode'].some((key) => body[key] !== undefined)) {
      return NextResponse.json({ success: false, error: 'Only TryFocus can change credits, devices or WhatsApp.' }, { status: 403 });
    }
    const settings: Parameters<typeof updateMaharajaSettings>[0] = {};

    if (typeof body.campaignEnabled === 'boolean') {
      settings.campaignEnabled = body.campaignEnabled;
    }
    if (typeof body.minPurchaseTryOnDisabled === 'boolean') {
      settings.minPurchaseTryOnDisabled = body.minPurchaseTryOnDisabled;
    }
    if (typeof body.tvBillSuffixRequired === 'boolean') {
      settings.tvBillSuffixRequired = body.tvBillSuffixRequired;
    }
    if (typeof body.videoMinPurchase === 'number' && Number.isFinite(body.videoMinPurchase)) {
      if (body.videoMinPurchase < 0 || body.videoMinPurchase > 10_000_000) {
        return NextResponse.json({ success: false, error: 'Enter a bill amount between ₹0 and ₹1,00,00,000.' }, { status: 400 });
      }
      settings.videoMinPurchase = Math.round(body.videoMinPurchase);
    }
    if (body.deliveryMode === 'whatsapp' || body.deliveryMode === 'qr') {
      settings.deliveryMode = body.deliveryMode;
    }
    if (typeof body.whatsappConnected === 'boolean') {
      settings.whatsappConnected = body.whatsappConnected;
    }
    if (body.devices && typeof body.devices === 'object') {
      settings.devices = body.devices;
    }
    if (body.limits && typeof body.limits === 'object') {
      settings.limits = body.limits;
    }
    if (body.regenerateOpenVideoCode === true) {
      settings.regenerateOpenVideoCode = true;
    }

    if (Array.isArray(body.activeEvents)) {
      const activeEvents = body.activeEvents.filter(isEventId);
      if (!activeEvents.length) {
        return NextResponse.json({ success: false, error: 'Select a valid festival event.' }, { status: 400 });
      }
      const singleEvent = activeEvents[0];
      if (singleEvent !== 'diwali') {
        return NextResponse.json(
          { success: false, error: 'This event is planned. Diwali is the only production-ready theme.' },
          { status: 409 }
        );
      }
      settings.activeEvents = [singleEvent];
      settings.defaultEvent = singleEvent;
    } else if (isEventId(body.defaultEvent)) {
      if (body.defaultEvent !== 'diwali') {
        return NextResponse.json(
          { success: false, error: 'This event is planned. Diwali is the only production-ready theme.' },
          { status: 409 }
        );
      }
      settings.activeEvents = [body.defaultEvent];
      settings.defaultEvent = body.defaultEvent;
    }

    if (!Object.keys(settings).length) {
      return NextResponse.json(
        { success: false, error: `Provide campaign settings or active event (${EVENT_IDS.join(', ')}).` },
        { status: 400 }
      );
    }

    const updated = await updateMaharajaSettings(settings, targetWorkspace.clientId);
    await logMaharajaActivity('campaign', `${updated.clientName} workspace settings updated`, {
      clientId: updated.clientId,
      enabled: updated.campaignEnabled,
      minPurchaseTryOnDisabled: updated.minPurchaseTryOnDisabled ?? true,
      deliveryMode: updated.deliveryMode || 'qr',
    });

    const workspace = await buildHydratedWorkspacePayload(updated);
    return NextResponse.json({ success: true, workspace });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update Maharaja workspace.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
