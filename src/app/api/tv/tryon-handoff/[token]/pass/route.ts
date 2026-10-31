import crypto from 'crypto';
import { resolveAccess } from '@/lib/maharaja/access';
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { resolveGarmentType, type CustomerCategory } from '@/lib/maharaja/config';
import { getCatalogueProduct } from '@/lib/maharaja/catalogue';
import { moduleLimit,
  getMaharajaWorkspace,
  getVideoPass,
  incrementMaharajaUsage,
  logMaharajaActivity,
  saveVideoPass,
  type MaharajaVideoPass,
} from '@/lib/maharaja/server';
import { lookVideoAvailable, readTryOnHandoff } from '@/lib/maharaja/tryon-handoff';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { activeClientId, bindClient } from '@/lib/maharaja/client-context';

export const dynamic = 'force-dynamic';

const CATEGORY_BY_GENDER: Record<string, CustomerCategory> = { women: 'women', men: 'men', boys: 'boy', girls: 'girl' };

/**
 * Turns a Try-On look from the TV or tablet into a private 24-hour AI Video pass. The customer
 * then creates the event master image with Gemini, approves it and renders the video on the phone,
 * through the same credit-checked flow as billing-counter passes.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const rate = await enforceRateLimit(req, 'tryon-look-pass', 10, 10 * 60 * 1000, token);
  if (!rate.allowed) {
    return NextResponse.json({ success: false, error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  }
  const handoff = await readTryOnHandoff(token);
  if (!handoff) return NextResponse.json({ success: false, error: 'This private look link has expired.' }, { status: 404 });
  bindClient(handoff.clientId);

  const body = await req.json().catch(() => ({}));
  const imageIndex = Number(body?.imageIndex);
  const look = Number.isInteger(imageIndex) ? handoff.looks[imageIndex] : undefined;
  if (!look) return NextResponse.json({ success: false, error: 'The selected look is unavailable.' }, { status: 404 });
  if (!lookVideoAvailable(handoff, look)) {
    return NextResponse.json({ success: false, error: 'Catalogue festival videos are made on the store TV.' }, { status: 403 });
  }

  const existingCode = handoff.lookPassCodes?.[String(imageIndex)];
  if (existingCode) {
    const existing = await getVideoPass(existingCode);
    if (existing && existing.status === 'active' && existing.expiresAtMs > Date.now()) {
      return NextResponse.json({ success: true, pass: publicPass(existing) });
    }
  }

  const workspace = await getMaharajaWorkspace();
  if (!workspace.campaignEnabled) {
    return NextResponse.json({ success: false, error: `${workspace.clientName} campaign is currently paused.` }, { status: 403 });
  }
  if (!look.sku.startsWith('OWN-') && !resolveAccess(workspace.devices, workspace.modules).catalogueVideo) {
    return NextResponse.json({ success: false, error: 'Catalogue festival videos are switched off for this store.' }, { status: 403 });
  }
  const videoLimit = moduleLimit(workspace, 'video');
  const videoUsed = Number(workspace.usage?.videosGenerated || 0);
  if (videoLimit <= 0 || videoUsed >= videoLimit) {
    return NextResponse.json({ success: false, error: 'AI Video is paused right now. Please ask our staff for help.' }, { status: 403 });
  }

  const category = CATEGORY_BY_GENDER[look.gender || ''] || 'women';
  const product = look.sku && !look.sku.startsWith('OWN-') ? await getCatalogueProduct(look.sku) : null;
  const catalogueLook = Boolean(product && product.eligibleForVideo !== false);
  const now = Date.now();
  const validityMs = 24 * 60 * 60 * 1000;
  const code = crypto.randomBytes(18).toString('base64url');
  const pass: MaharajaVideoPass = {
    id: code,
    code,
    clientId: activeClientId(),
    phone: '',
    phoneMasked: '',
    experienceType: catalogueLook ? 'catalogue-gift' : 'purchased-garment',
    ...(catalogueLook && product ? {
      catalogueSku: product.sku,
      catalogueTitle: product.title,
      cataloguePrice: product.price,
      catalogueStoragePath: product.storagePath,
    } : {}),
    billLast4: '',
    eventId: workspace.defaultEvent,
    status: 'active',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + validityMs).toISOString(),
    expiresAtMs: now + validityMs,
    videoMasterCategory: category,
    videoMasterGarmentType: resolveGarmentType(category, look.garmentType),
    tryOnImageDone: false,
    tryOnImageUrl: '',
    videoMasterDone: false,
    videoMasterUrl: '',
    videoMasterApproved: false,
    videoMasterApprovedUrl: '',
    videoGenerating: false,
    videoDone: false,
    retryUsed: false,
    whatsappOptIn: false,
    usage: { scans: 0, imagesGenerated: 0, videosGenerated: 0, goLive: 0 },
  };

  const db = getDb();
  if (db) {
    const ref = db.collection('tvTryOnHandoffs').doc(token);
    const claimed = await db.runTransaction(async (transaction) => {
      const fresh = (await transaction.get(ref)).data();
      const already = fresh?.lookPassCodes?.[String(imageIndex)];
      if (already && already !== existingCode) return already as string;
      transaction.set(ref, { lookPassCodes: { [String(imageIndex)]: code } }, { merge: true });
      return '';
    });
    if (claimed) {
      const existing = await getVideoPass(claimed);
      if (existing) return NextResponse.json({ success: true, pass: publicPass(existing) });
    }
  } else {
    const record = getMockStore().sessions.get(`tv_handoff_${token}`);
    record.lookPassCodes = { ...(record.lookPassCodes || {}), [String(imageIndex)]: code };
  }

  await Promise.all([
    saveVideoPass(pass),
    incrementMaharajaUsage('videoPasses'),
    logMaharajaActivity('video-pass', `${catalogueLook ? 'Catalogue' : 'Own garment'} AI Video pass created from a Try-On look`, {
      experienceType: pass.experienceType,
      source: 'tryon-look',
    }),
  ]);
  return NextResponse.json({ success: true, pass: publicPass(pass) });
}

function publicPass(pass: MaharajaVideoPass) {
  const path = pass.experienceType === 'catalogue-gift' ? `/maharaja/catalogue/${pass.code}` : `/maharaja/video/${pass.code}`;
  return { code: pass.code, experienceType: pass.experienceType, expiresAt: pass.expiresAt, path };
}
