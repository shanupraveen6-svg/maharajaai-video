import crypto from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { NextRequest } from 'next/server';
import { getOperatorSession, verifyOperatorRequest } from '@/lib/auth/operator';
import { verifyTvRequest } from '@/lib/auth/display';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { getWhatsAppStatus } from '@/lib/whatsapp';
import { activeClientId } from './client-context';
import { getLiveAudioTrack, getPreviewAudioTrack } from './audio';
import { generateCustomer6sVideo, generateLive9sVideo, validateBrandedVideo } from './video-processor';
import {
  AI_VIDEO_MIN_PURCHASE,
  type EventId,
  type CustomerCategory,
  MAHARAJA_CLIENT_ID,
  MAHARAJA_WORKSPACE_CODE,
  TRY_ON_MIN_PURCHASE,
  EVENT_IDS,
  isEventId,
  resolveGarmentType,
  ENFORCE_REPEAT_LIMITS,
} from './config';
import { type VideoConceptId } from './video-concepts';

export type MaharajaWorkspace = {
  clientId: string;
  clientName: string;
  branch?: string;
  workspaceCode: string;
  campaignEnabled: boolean;
  minPurchaseTryOnDisabled?: boolean;
  tvBillSuffixRequired?: boolean;
  /** Bill amount (INR) from which the counter offers the AI Video QR; 0 offers it on every bill. */
  videoMinPurchase?: number;
  deliveryMode?: 'whatsapp' | 'qr';
  whatsappConnected?: boolean;
  devices?: {
    tv: boolean;
    tablet: boolean;
    mobile: boolean;
    led: boolean;
  };
  limits?: {
    image: number;
    live: number;
    video: number;
  };
  activeEvents: EventId[];
  defaultEvent: EventId;
  tryOnCode: string;
  billingCode: string;
  /** Permanent poster capability exchanged for a private, expiring customer pass. */
  openVideoCode: string;
  createdAt: string;
  updatedAt: string;
  usage: {
    tryOnScans: number;
    tryOnGenerated: number;
    liveSessions?: number;
    videoPasses: number;
    videosGenerated: number;
    goLive: number;
    retries: number;
    downloads: number;
  };
};

export type MaharajaActivity = {
  id: string;
  type:
    | 'campaign'
    | 'video-pass'
    | 'price-scan'
    | 'duplicate-tag-scan'
    | 'try-on'
    | 'video-master'
    | 'video-start'
    | 'video-ready'
    | 'video-failed'
    | 'image-failed'
    | 'video'
    | 'go-live'
    | 'retry'
    | 'download'
    | 'share'
    | 'qr-download'
    | 'image-approved'
    | 'image-rejected';
  label: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

export type MaharajaVideoPass = {
  id: string;
  code: string;
  clientId: string;
  phone: string;
  phoneMasked: string;
  experienceType?: 'purchased-garment' | 'catalogue-gift';
  catalogueSku?: string;
  catalogueTitle?: string;
  cataloguePrice?: number;
  catalogueStoragePath?: string;
  customerName?: string;
  customerLocality?: string;
  billLast4: string;
  eventId: EventId;
  status: 'active' | 'used' | 'revoked' | 'expired';
  expiredReason?: string;
  createdAt: string;
  expiresAt: string;
  expiresAtMs: number;
  /** Counter QR passes start their 24-hour validity when the customer first opens them. */
  activateOnScan?: boolean;
  activatedAt?: string;
  /** Plain, garment-focused Try-On image (never used as a video source). */
  tryOnImageDone?: boolean;
  tryOnImageUrl?: string;
  /** Festival/cinematic master image; the only image ever sent to the video provider. */
  videoMasterDone?: boolean;
  videoMasterUrl?: string;
  /** Explicit approval status: true ONLY after customer/operator reviews and approves the image. */
  videoMasterApproved?: boolean;
  videoMasterApprovedAtMs?: number;
  videoMasterApprovedUrl?: string;
  /** Deprecated v1 fields remain readable for passes created before the v2 rollout. */
  videoMasterPromptSet?: 'set-1' | 'set-2';
  videoMasterPoseId?: string;
  videoMasterConceptId?: VideoConceptId;
  videoPromptArchitectureVersion?: string;
  videoMasterCategory?: CustomerCategory;
  videoMasterGarmentType?: string;
  /** Legacy metadata retained for existing pass reads only. */
  videoMasterExperienceId?: string;
  videoMasterGarmentRoles?: string[];
  videoReferenceSessionId?: string;
  videoPersonPhotoStoragePath?: string;
  videoGarmentPhotoStoragePaths?: string[];
  rejectedMasterUrls?: string[];
  /** Active image generation ID bound to this pass to prevent in-flight race conditions. */
  activeMasterGenerationId?: string;
  activeImageGenerationId?: string;
  imageGenerating?: boolean;
  imageGeneratingAtMs?: number;
  videoGenerating?: boolean;
  /** Epoch ms when videoGenerating was set; lets a crashed request's lock expire. */
  videoGeneratingAtMs?: number;
  videoDone?: boolean;
  retryUsed?: boolean;
  retryEnabled?: boolean;
  retryEnabledAtMs?: number;
  lastVideoFailed?: boolean;
  lastVideoFailedAtMs?: number;
  /** Active generation job ID bound to this pass to prevent stale job updates. */
  activeVideoJobId?: string;
  /** True once Fal H3 has accepted the job and is actively rendering. */
  providerAccepted?: boolean;
  whatsappOptIn?: boolean;
  whatsappSentAt?: string;
  whatsappDeliveryStatus?: 'pending' | 'sending' | 'sent' | 'failed';
  usage: { scans: number; imagesGenerated: number; videosGenerated: number; goLive: number };
};

export type MaharajaTryOnGrant = {
  deviceHash: string;
  tokenHash: string;
  status: 'active' | 'processing' | 'used';
  amount: number;
  createdAt: string;
  expiresAtMs: number;
  sessionId?: string;
  completedAt?: string;
  retryUsed?: boolean;
};

export type ServiceAllowanceCounter = {
  used: number; // 0, 1, or 2 (maximum 2 successful outputs when limits enforced)
  max: number;
  generating: boolean;
  generatingAtMs?: number;
  lastJobId?: string;
};

export type CustomerCampaignEntitlement = {
  phone: string; // normalized 10 digits
  normalizedPhone?: string;
  clientId: string;
  qualifyingPassCode: string;
  passCodes: string[];
  billAmount: number; // >= 5000
  billLast4?: string;
  eventId: EventId;
  createdAt: string;
  updatedAt: string;
  tryOn: ServiceAllowanceCounter;
  masterImage: ServiceAllowanceCounter;
  video: ServiceAllowanceCounter;
};

export type CustomerServiceAllowances = {
  enforceRepeatLimits?: boolean;
  tryOn: { used: number; max: number; remaining: number };
  masterImage: { used: number; max: number; remaining: number };
  video: { used: number; max: number; remaining: number };
};

export function normalizePhoneNumber(raw: unknown): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') return '';
  const str = String(raw).trim();
  // If string contains letters or underscores (like pass IDs, session IDs, tokens), it is not a phone number
  if (/[a-zA-Z_]/.test(str)) return '';
  const digits = str.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function getCustomerServiceAllowances(entitlement: CustomerCampaignEntitlement | null | undefined): CustomerServiceAllowances {
  const tryOnUsed = Math.max(0, Number(entitlement?.tryOn?.used || 0));
  const masterImageUsed = Math.max(0, Number(entitlement?.masterImage?.used || 0));
  const videoUsed = Math.max(0, Number(entitlement?.video?.used || 0));

  if (!ENFORCE_REPEAT_LIMITS) {
    return {
      enforceRepeatLimits: false,
      tryOn: {
        used: tryOnUsed,
        max: 999,
        remaining: 999,
      },
      masterImage: {
        used: masterImageUsed,
        max: 999,
        remaining: 999,
      },
      video: {
        used: videoUsed,
        max: 999,
        remaining: 999,
      },
    };
  }

  return {
    enforceRepeatLimits: true,
    tryOn: {
      used: Math.min(2, tryOnUsed),
      max: 2,
      remaining: Math.max(0, 2 - tryOnUsed),
    },
    masterImage: {
      used: Math.min(2, masterImageUsed),
      max: 2,
      remaining: Math.max(0, 2 - masterImageUsed),
    },
    video: {
      used: Math.min(2, videoUsed),
      max: 2,
      remaining: Math.max(0, 2 - videoUsed),
    },
  };
}

function deviceHash(deviceId: string) {
  return crypto.createHash('sha256').update(`${activeClientId()}:${deviceId}`).digest('hex');
}

function grantTokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function validTryOnDeviceId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(value);
}

export async function getTryOnDeviceStatus(deviceId: string) {
  const hash = deviceHash(deviceId);
  const db = getDb();
  if (db) {
    const snapshot = await db.collection('clientWorkspaces').doc(activeClientId())
      .collection('tryOnDevices').doc(hash).get();
    return snapshot.exists ? snapshot.data() as MaharajaTryOnGrant : null;
  }
  return (getMockStore().tryOnGrants.get(`${activeClientId()}:${hash}`) as MaharajaTryOnGrant | undefined) || null;
}

export type TagDuplicateAnalysis = {
  isDuplicate: boolean;
  duplicateType: 'none' | 'same_device' | 'different_device_used' | 'different_device_active';
  scannedCount: number;
  firstScannedAt?: string;
  previousAmount?: number;
};

export async function analyzeTagDuplicate(deviceId: string, barcodeOrText: string, amount: number): Promise<TagDuplicateAnalysis> {
  const cleanId = (barcodeOrText || '').trim().toLowerCase().slice(0, 128);
  const tagHash = crypto.createHash('sha256').update(`${activeClientId()}:tag:${cleanId}`).digest('hex');
  const dHash = deviceHash(deviceId);
  const now = new Date().toISOString();
  const db = getDb();

  let tagRecord: any = null;
  if (db) {
    const doc = await db.collection('clientWorkspaces').doc(activeClientId()).collection('scannedTags').doc(tagHash).get();
    if (doc.exists) tagRecord = doc.data();
  } else {
    tagRecord = getMockStore().scannedTags?.get(tagHash) || null;
  }

  if (!tagRecord) {
    const newRecord = {
      tagHash,
      barcode: cleanId,
      amount,
      firstDeviceIdHash: dHash,
      lastDeviceIdHash: dHash,
      firstScannedAt: now,
      lastScannedAt: now,
      scanCount: 1,
      usedForTryOn: false,
    };
    if (db) {
      await db.collection('clientWorkspaces').doc(activeClientId()).collection('scannedTags').doc(tagHash).set(newRecord);
    } else {
      if (!getMockStore().scannedTags) getMockStore().scannedTags = new Map();
      getMockStore().scannedTags.set(tagHash, newRecord);
    }
    return { isDuplicate: false, duplicateType: 'none', scannedCount: 1 };
  }

  const isSameDevice = tagRecord.firstDeviceIdHash === dHash || tagRecord.lastDeviceIdHash === dHash;
  const isUsed = tagRecord.usedForTryOn === true;
  const updatedScanCount = (tagRecord.scanCount || 1) + 1;

  const update = {
    lastDeviceIdHash: dHash,
    lastScannedAt: now,
    scanCount: updatedScanCount,
    amount: amount || tagRecord.amount,
  };

  if (db) {
    await db.collection('clientWorkspaces').doc(activeClientId()).collection('scannedTags').doc(tagHash).set(update, { merge: true });
  } else {
    getMockStore().scannedTags.set(tagHash, { ...tagRecord, ...update });
  }

  if (isSameDevice) {
    return {
      isDuplicate: ENFORCE_REPEAT_LIMITS,
      duplicateType: ENFORCE_REPEAT_LIMITS ? 'same_device' : 'none',
      scannedCount: updatedScanCount,
      firstScannedAt: tagRecord.firstScannedAt,
      previousAmount: tagRecord.amount,
    };
  }

  if (isUsed) {
    return {
      isDuplicate: ENFORCE_REPEAT_LIMITS,
      duplicateType: ENFORCE_REPEAT_LIMITS ? 'different_device_used' : 'none',
      scannedCount: updatedScanCount,
      firstScannedAt: tagRecord.firstScannedAt,
      previousAmount: tagRecord.amount,
    };
  }

  return {
    isDuplicate: ENFORCE_REPEAT_LIMITS,
    duplicateType: ENFORCE_REPEAT_LIMITS ? 'different_device_active' : 'none',
    scannedCount: updatedScanCount,
    firstScannedAt: tagRecord.firstScannedAt,
    previousAmount: tagRecord.amount,
  };
}

export async function markTagUsedForTryOn(barcodeOrText: string, sessionId?: string) {
  const cleanId = (barcodeOrText || '').trim().toLowerCase().slice(0, 128);
  const tagHash = crypto.createHash('sha256').update(`${activeClientId()}:tag:${cleanId}`).digest('hex');
  const now = new Date().toISOString();
  const db = getDb();
  if (db) {
    await db.collection('clientWorkspaces').doc(activeClientId()).collection('scannedTags').doc(tagHash).set({
      usedForTryOn: true,
      usedAt: now,
      sessionId: sessionId || null,
    }, { merge: true });
  } else {
    const record = getMockStore().scannedTags?.get(tagHash) as any;
    if (record) {
      getMockStore().scannedTags.set(tagHash, { ...record, usedForTryOn: true, usedAt: now, sessionId });
    }
  }
}

export async function issueTryOnGrant(deviceId: string, amount: number) {
  if (ENFORCE_REPEAT_LIMITS) {
    const existing = await getTryOnDeviceStatus(deviceId);
    if (existing?.status === 'used') {
      return { allowed: false as const, error: 'This device has already completed its Maharaja AI Try-On.' };
    }
    if (existing?.status === 'processing') return { allowed: false as const, error: 'A Try-On is already being generated on this device.' };
  }
  
  const token = crypto.randomBytes(24).toString('base64url');
  const now = Date.now();
  const grant: MaharajaTryOnGrant = {
    deviceHash: deviceHash(deviceId),
    tokenHash: grantTokenHash(token),
    status: 'active',
    amount,
    createdAt: new Date(now).toISOString(),
    expiresAtMs: now + 30 * 60 * 1000,
  };
  const db = getDb();
  if (db) {
    await db.collection('clientWorkspaces').doc(activeClientId())
      .collection('tryOnDevices').doc(grant.deviceHash).set(grant);
  } else {
    getMockStore().tryOnGrants.set(`${activeClientId()}:${grant.deviceHash}`, grant);
  }
  return { allowed: true as const, token, expiresAtMs: grant.expiresAtMs };
}

export async function reserveTryOnGrant(deviceId: string, token: string, sessionId: string) {
  const hash = deviceHash(deviceId);
  const db = getDb();
  if (db) {
    const ref = db.collection('clientWorkspaces').doc(activeClientId()).collection('tryOnDevices').doc(hash);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const grant = snapshot.exists ? snapshot.data() as MaharajaTryOnGrant : null;
      if (!grant || grant.tokenHash !== grantTokenHash(token) || grant.expiresAtMs < Date.now()) return { allowed: false as const, error: 'Scan the price tag again to start Try-On.' };
      if (ENFORCE_REPEAT_LIMITS && grant.status === 'used') return { allowed: false as const, error: 'This device has already completed its Maharaja AI Try-On.' };
      if (ENFORCE_REPEAT_LIMITS && grant.status === 'processing' && grant.sessionId !== sessionId) return { allowed: false as const, error: 'A Try-On is already being generated on this device.' };
      transaction.set(ref, { status: 'processing', sessionId }, { merge: true });
      return { allowed: true as const };
    });
  }
  const key = `${activeClientId()}:${hash}`;
  const grant = getMockStore().tryOnGrants.get(key) as MaharajaTryOnGrant | undefined;
  if (!grant || grant.tokenHash !== grantTokenHash(token) || grant.expiresAtMs < Date.now()) return { allowed: false as const, error: 'Scan the price tag again to start Try-On.' };
  if (ENFORCE_REPEAT_LIMITS && grant.status === 'used') return { allowed: false as const, error: 'This device has already completed its Maharaja AI Try-On.' };
  if (ENFORCE_REPEAT_LIMITS && grant.status === 'processing' && grant.sessionId !== sessionId) return { allowed: false as const, error: 'A Try-On is already being generated on this device.' };
  getMockStore().tryOnGrants.set(key, { ...grant, status: 'processing', sessionId });
  return { allowed: true as const };
}

export async function finishTryOnGrant(deviceId: string, sessionId: string, completed: boolean) {
  const hash = deviceHash(deviceId);
  const update = completed
    ? {
        status: 'used' as const,
        sessionId,
        completedAt: new Date().toISOString(),
      }
    : { status: 'active' as const, sessionId: '' };
  const db = getDb();
  if (db) {
    await db.collection('clientWorkspaces').doc(activeClientId()).collection('tryOnDevices').doc(hash).set(update, { merge: true });
  } else {
    const key = `${activeClientId()}:${hash}`;
    const grant = getMockStore().tryOnGrants.get(key) as MaharajaTryOnGrant | undefined;
    if (grant) getMockStore().tryOnGrants.set(key, { ...grant, ...update });
  }
}

function stableCode(label: string, length = 20, clientId = MAHARAJA_CLIENT_ID) {
  const secret = process.env.OPERATOR_AUTH_SECRET || 'tryfocus-maharaja-local-dev-secret';
  return crypto.createHmac('sha256', secret).update(`${clientId}:${label}`).digest('base64url').slice(0, length);
}

/** Secret code in a workspace's Go Live TV link; derived from the auth secret, so it cannot be guessed. */
export function goLiveCodeFor(clientId: string) {
  return stableCode('go-live-screen', 24, clientId);
}

/**
 * Client whose Go Live link this request comes from (`?screen=` on the page, `x-golive-screen` on its
 * API calls). The link plays only while the workspace is active and has AI Video in its plan.
 */
export async function goLiveClientId(req: NextRequest): Promise<string | null> {
  const code = (req.headers?.get('x-golive-screen') || req.nextUrl?.searchParams.get('screen') || '').trim();
  if (!/^[A-Za-z0-9_-]{24}$/.test(code)) return null;
  const workspace = (await listClientWorkspaces()).find((ws) => goLiveCodeFor(ws.clientId) === code);
  if (!workspace?.campaignEnabled || Number(workspace.limits?.video ?? 0) <= 0) return null;
  return workspace.clientId;
}

function defaultWorkspace(clientId = MAHARAJA_CLIENT_ID): MaharajaWorkspace {
  const now = new Date().toISOString();
  const isMaharaja = clientId === MAHARAJA_CLIENT_ID;
  return {
    clientId,
    clientName: isMaharaja ? 'The Majestic Maharaja' : clientId,
    branch: isMaharaja ? 'Thanjavur · Main Showroom' : 'Main Showroom',
    workspaceCode: isMaharaja ? (process.env.MAHARAJA_WORKSPACE_CODE || MAHARAJA_WORKSPACE_CODE) : `${clientId}-workspace`,
    campaignEnabled: isMaharaja,
    minPurchaseTryOnDisabled: true,
    tvBillSuffixRequired: true,
    videoMinPurchase: AI_VIDEO_MIN_PURCHASE,
    deliveryMode: 'qr',
    whatsappConnected: false,
    devices: isMaharaja
      ? { tv: true, tablet: true, mobile: true, led: true }
      : { tv: false, tablet: true, mobile: true, led: false },
    limits: isMaharaja
      ? { image: 4000, live: 500, video: 500 }
      : { image: 4000, live: 0, video: 500 },
    activeEvents: ['diwali'],
    defaultEvent: 'diwali',
    tryOnCode: stableCode('permanent-try-on', 20, clientId),
    billingCode: stableCode('billing-counter', 20, clientId),
    openVideoCode: stableCode('temporary-open-video', 20, clientId),
    createdAt: now,
    updatedAt: now,
    usage: {
      tryOnScans: 0,
      tryOnGenerated: 0,
      liveSessions: 0,
      videoPasses: 0,
      videosGenerated: 0,
      goLive: 0,
      retries: 0,
      downloads: 0,
    },
  };
}

function normalizeWorkspace(data: Partial<MaharajaWorkspace>, fallback: MaharajaWorkspace): MaharajaWorkspace {
  const merged = {
    ...fallback,
    ...data,
    devices: {
      tv: true,
      tablet: true,
      mobile: true,
      led: true,
      ...(fallback.devices || {}),
      ...(data.devices || {}),
    },
    limits: {
      image: 4000,
      live: 500,
      video: 500,
      ...(fallback.limits || {}),
      ...(data.limits || {}),
    },
    minPurchaseTryOnDisabled: typeof data.minPurchaseTryOnDisabled === 'boolean'
      ? data.minPurchaseTryOnDisabled
      : (fallback.minPurchaseTryOnDisabled ?? true),
    tvBillSuffixRequired: typeof data.tvBillSuffixRequired === 'boolean'
      ? data.tvBillSuffixRequired
      : (fallback.tvBillSuffixRequired ?? true),
    videoMinPurchase: Number.isFinite(Number(data.videoMinPurchase)) && data.videoMinPurchase !== undefined && data.videoMinPurchase !== null
      ? Math.max(0, Math.round(Number(data.videoMinPurchase)))
      : (fallback.videoMinPurchase ?? AI_VIDEO_MIN_PURCHASE),
    deliveryMode: data.deliveryMode === 'whatsapp' ? ('whatsapp' as const) : ('qr' as const),
    usage: {
      ...fallback.usage,
      ...data.usage,
      liveSessions: Number(data.usage?.liveSessions ?? fallback.usage.liveSessions ?? 0),
    },
  };
  return {
    ...merged,
    activeEvents: ['diwali'],
    defaultEvent: 'diwali',
  };
}

async function loadMaharajaWorkspace(): Promise<MaharajaWorkspace> {
  const fallback = defaultWorkspace(MAHARAJA_CLIENT_ID);
  const db = getDb();

  if (db) {
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      await ref.create({
        ...fallback,
        createdAtTimestamp: Timestamp.now(),
        updatedAtTimestamp: Timestamp.now(),
      }).catch(() => undefined);
      const created = await ref.get();
      if (!created.exists) return fallback;
      const createdData = created.data() as Partial<MaharajaWorkspace>;
      return normalizeWorkspace(createdData, fallback);
    }
    const data = snapshot.data() as Partial<MaharajaWorkspace>;
    return normalizeWorkspace(data, fallback);
  }

  const mockStore = getMockStore();
  const existing = mockStore.clientWorkspaces.get(MAHARAJA_CLIENT_ID) as MaharajaWorkspace | undefined;
  if (existing) return normalizeWorkspace(existing, fallback);
  mockStore.clientWorkspaces.set(MAHARAJA_CLIENT_ID, fallback);
  return fallback;
}

/** Workspace of the client bound to this request (Maharaja when none is bound). */
export async function getMaharajaWorkspace(): Promise<MaharajaWorkspace> {
  const clientId = activeClientId();
  return clientId === MAHARAJA_CLIENT_ID ? loadMaharajaWorkspace() : getClientWorkspaceById(clientId);
}

export async function updateMaharajaSettings(
  settings: Partial<
    Pick<
      MaharajaWorkspace,
      | 'clientName'
      | 'branch'
      | 'campaignEnabled'
      | 'minPurchaseTryOnDisabled'
      | 'tvBillSuffixRequired'
      | 'videoMinPurchase'
      | 'deliveryMode'
      | 'whatsappConnected'
      | 'devices'
      | 'limits'
      | 'activeEvents'
      | 'defaultEvent'
      | 'openVideoCode'
    >
  > & { regenerateOpenVideoCode?: boolean },
  clientId = activeClientId()
) {
  const workspace = clientId === activeClientId()
    ? await getMaharajaWorkspace()
    : await getClientWorkspaceById(clientId);
  const { regenerateOpenVideoCode, ...rest } = settings;
  const nextOpenVideoCode = regenerateOpenVideoCode
    ? crypto.randomBytes(15).toString('base64url')
    : rest.openVideoCode || workspace.openVideoCode;

  const productionSettings: Partial<MaharajaWorkspace> = {
    ...rest,
    openVideoCode: nextOpenVideoCode,
    activeEvents: ['diwali'] as EventId[],
    defaultEvent: 'diwali' as EventId,
    ...(rest.devices ? { devices: { ...(workspace.devices || { tv: true, tablet: true, mobile: true, led: true }), ...rest.devices } } : {}),
    ...(rest.limits ? { limits: { ...(workspace.limits || { image: 4000, live: 500, video: 500 }), ...rest.limits } } : {}),
  };
  const updated = normalizeWorkspace(
    { ...workspace, ...productionSettings, updatedAt: new Date().toISOString() },
    defaultWorkspace(clientId)
  );
  const db = getDb();
  if (db) {
    await db.collection('clientWorkspaces').doc(clientId).set({
      ...productionSettings,
      updatedAt: updated.updatedAt,
      updatedAtTimestamp: Timestamp.now(),
    }, { merge: true });
  } else {
    getMockStore().clientWorkspaces.set(clientId, updated);
  }
  return updated;
}

export async function getClientWorkspaceById(clientId: string): Promise<MaharajaWorkspace> {
  const cleanId = String(clientId || '').trim().toLowerCase() || MAHARAJA_CLIENT_ID;
  if (cleanId === MAHARAJA_CLIENT_ID) return loadMaharajaWorkspace();
  const fallback = defaultWorkspace(cleanId);
  const db = getDb();
  if (db) {
    const snap = await db.collection('clientWorkspaces').doc(cleanId).get();
    if (snap.exists) {
      return normalizeWorkspace(snap.data() as Partial<MaharajaWorkspace>, fallback);
    }
    return fallback;
  }
  const existing = getMockStore().clientWorkspaces.get(cleanId) as Partial<MaharajaWorkspace> | undefined;
  if (existing) return normalizeWorkspace(existing, fallback);
  getMockStore().clientWorkspaces.set(cleanId, fallback);
  return fallback;
}

export async function listClientWorkspaces(): Promise<MaharajaWorkspace[]> {
  const maharaja = await loadMaharajaWorkspace();
  const byId = new Map<string, MaharajaWorkspace>([
    [maharaja.clientId, maharaja],
  ]);

  const db = getDb();
  if (db) {
    const snap = await db.collection('clientWorkspaces').get();
    snap.docs.forEach((doc) => {
      const id = doc.id;
      const normalized = normalizeWorkspace(doc.data() as Partial<MaharajaWorkspace>, defaultWorkspace(id));
      byId.set(id, normalized);
    });
  } else {
    for (const [id, raw] of getMockStore().clientWorkspaces.entries()) {
      const normalized = normalizeWorkspace(raw as Partial<MaharajaWorkspace>, defaultWorkspace(id));
      byId.set(id, normalized);
    }
  }
  return Array.from(byId.values());
}

export async function getClientWorkspaceByWorkspaceCode(workspaceCode?: string | null): Promise<MaharajaWorkspace | null> {
  const cleanCode = String(workspaceCode || '').trim();
  if (!cleanCode || cleanCode === 'workspace' || cleanCode === MAHARAJA_CLIENT_ID || cleanCode === (process.env.MAHARAJA_WORKSPACE_CODE || MAHARAJA_WORKSPACE_CODE)) {
    return getMaharajaWorkspace();
  }
  const all = await listClientWorkspaces();
  const matched = all.find(
    (ws) =>
      ws.workspaceCode === cleanCode ||
      ws.clientId === cleanCode.toLowerCase() ||
      `${ws.clientId}-workspace` === cleanCode.toLowerCase()
  );
  return matched || null;
}

export async function resolveWorkspaceByAccessCode(code?: string | null): Promise<MaharajaWorkspace> {
  const clean = String(code || '').trim();
  if (!clean) return getMaharajaWorkspace();
  const all = await listClientWorkspaces();
  const matched = all.find(
    (ws) => ws.tryOnCode === clean || ws.billingCode === clean || ws.openVideoCode === clean
  );
  return matched || getMaharajaWorkspace();
}

export async function upsertClientWorkspace(input: {
  id?: string;
  clientId?: string;
  name?: string;
  clientName?: string;
  branch?: string;
  status?: 'Active' | 'Paused';
  campaignEnabled?: boolean;
  minPurchaseTryOnDisabled?: boolean;
  deliveryMode?: 'whatsapp' | 'qr';
  whatsappConnected?: boolean;
  devices?: Partial<{ tv: boolean; tablet: boolean; mobile: boolean; led: boolean }>;
  limits?: Partial<{ image: number; live: number; video: number }>;
}): Promise<MaharajaWorkspace> {
  const rawId = input.id || input.clientId || input.name || input.clientName || '';
  const cleanId = String(rawId)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!cleanId) {
    throw new Error('Client workspace ID or store name is required.');
  }
  const existing = await getClientWorkspaceById(cleanId);
  const campaignEnabled = typeof input.campaignEnabled === 'boolean'
    ? input.campaignEnabled
    : input.status
      ? input.status === 'Active'
      : existing.campaignEnabled;

  return updateMaharajaSettings(
    {
      clientName: input.clientName || input.name || existing.clientName,
      branch: input.branch || existing.branch || 'Main Showroom',
      campaignEnabled,
      ...(typeof input.minPurchaseTryOnDisabled === 'boolean'
        ? { minPurchaseTryOnDisabled: input.minPurchaseTryOnDisabled }
        : {}),
      ...(input.deliveryMode ? { deliveryMode: input.deliveryMode } : {}),
      ...(typeof input.whatsappConnected === 'boolean'
        ? { whatsappConnected: input.whatsappConnected }
        : {}),
      ...(input.devices
        ? {
            devices: {
              tv: input.devices.tv ?? existing.devices?.tv ?? true,
              tablet: input.devices.tablet ?? existing.devices?.tablet ?? true,
              mobile: input.devices.mobile ?? existing.devices?.mobile ?? true,
              led: input.devices.led ?? existing.devices?.led ?? true,
            },
          }
        : {}),
      ...(input.limits
        ? {
            limits: {
              image: Math.max(0, Number(input.limits.image ?? existing.limits?.image ?? 4000)),
              live: Math.max(0, Number(input.limits.live ?? existing.limits?.live ?? 500)),
              video: Math.max(0, Number(input.limits.video ?? existing.limits?.video ?? 500)),
            },
          }
        : {}),
    },
    cleanId
  );
}

export async function logMaharajaActivity(
  type: MaharajaActivity['type'],
  label: string,
  metadata?: MaharajaActivity['metadata']
) {
  const createdAt = new Date().toISOString();
  const id = `${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
  const activity: MaharajaActivity = { id, type, label, createdAt, ...(metadata ? { metadata } : {}) };
  const db = getDb();
  if (db) {
    await db.collection('clientWorkspaces').doc(activeClientId())
      .collection('activityLogs').doc(id).set({ ...activity, createdAtTimestamp: Timestamp.now() });
  } else {
    getMockStore().activityLogs.set(`${activeClientId()}:${id}`, activity);
  }
  return activity;
}

export async function listMaharajaActivity(limit = 30): Promise<MaharajaActivity[]> {
  const db = getDb();
  if (db) {
    const snapshot = await db.collection('clientWorkspaces').doc(activeClientId())
      .collection('activityLogs').orderBy('createdAtTimestamp', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => doc.data() as MaharajaActivity);
  }
  return Array.from(getMockStore().activityLogs.entries())
    .filter(([key]) => key.startsWith(`${activeClientId()}:`))
    .map(([, value]) => value as MaharajaActivity)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

const PUBLIC_APP_ORIGIN = 'https://www.tryfocus.in';

/** WhatsApp delivery is on only when TryFocus admin connected it for this client and the API is configured. */
export function isWhatsAppEnabled(workspace: MaharajaWorkspace) {
  return workspace.whatsappConnected === true && getWhatsAppStatus().configured;
}

export function getPublicAppUrl(pathname: string) {
  return new URL(pathname, PUBLIC_APP_ORIGIN).toString();
}

export function getWorkspaceLinks(workspace: MaharajaWorkspace) {
  const adminUrl = getPublicAppUrl(`/maharaja/${workspace.workspaceCode}`);
  // Opens the client's own mobile try-on (free or price-tag gated, as the client chose).
  const tryOnUrl = getPublicAppUrl(`/maharaja/mobile/experience?access=${encodeURIComponent(workspace.tryOnCode)}`);
  const billingUrl = getPublicAppUrl(`/maharaja/billing/${workspace.billingCode}`);
  // A poster is permanent; every scan must mint a separate, expiring customer pass.
  const openVideoUrl = getPublicAppUrl(`/maharaja/video-poster?code=${encodeURIComponent(workspace.openVideoCode)}`);
  const tvUrl = getPublicAppUrl('/maharaja/tv');
  // Opens this workspace's Go Live wall on any TV browser, without a login.
  const goLiveUrl = getPublicAppUrl(`/tv?screen=${goLiveCodeFor(workspace.clientId)}`);
  return {
    adminUrl,
    tryOnUrl,
    billingUrl,
    openVideoUrl,
    links: {
      workspace: adminUrl,
      tryOn: tryOnUrl,
      billing: billingUrl,
      openVideo: openVideoUrl,
      tv: tvUrl,
      goLive: goLiveUrl,
    },
  };
}

/** Client that issued a pass code; codes are random, so one top-level index serves every client. */
async function passClientId(code: string): Promise<string | null> {
  if (!code || code.length > 120) return null;
  const db = getDb();
  if (db) return ((await db.collection('customerPassIndex').doc(code).get()).data()?.clientId as string | undefined) || null;
  return (getMockStore().sessions.get(`pass_index_${code}`) as { clientId?: string } | undefined)?.clientId || null;
}

export async function getVideoPass(code: string, clientId = activeClientId()): Promise<MaharajaVideoPass | null> {
  const db = getDb();
  if (db) {
    const snapshot = await db.collection('clientWorkspaces').doc(clientId)
      .collection('customerPasses').doc(code).get();
    if (snapshot.exists) return snapshot.data() as MaharajaVideoPass;
  } else {
    const value = getMockStore().customerPasses.get(`${clientId}:${code}`);
    if (value && typeof value === 'object') return value as MaharajaVideoPass;
  }
  const indexedClient = await passClientId(code);
  if (indexedClient && indexedClient !== clientId) return getVideoPass(code, indexedClient);

  // Fallback: If code is a 10-digit phone number, resolve latest pass for this phone
  const cleanPhone = normalizePhoneNumber(code);
  if (cleanPhone.length === 10) {
    const entitlement = await getCampaignEntitlementByPhone(cleanPhone);
    if (entitlement?.passCodes?.length) {
      const latestCode = entitlement.passCodes[entitlement.passCodes.length - 1];
      if (latestCode && latestCode !== code) {
        return getVideoPass(latestCode);
      }
    }
  }

  return null;
}

/** Starts a counter pass's 24-hour validity on its first open; later opens keep the original window. */
export async function activateVideoPassOnFirstScan(code: string): Promise<MaharajaVideoPass | null> {
  const activate = (pass: MaharajaVideoPass): MaharajaVideoPass => {
    const now = Date.now();
    const expiresAtMs = now + 24 * 60 * 60 * 1000;
    return { ...pass, activatedAt: new Date(now).toISOString(), expiresAt: new Date(expiresAtMs).toISOString(), expiresAtMs };
  };
  const db = getDb();
  if (!db) {
    const key = `${activeClientId()}:${code}`;
    const pass = getMockStore().customerPasses.get(key) as MaharajaVideoPass | undefined;
    if (!pass?.activateOnScan || pass.activatedAt) return pass || null;
    const next = activate(pass);
    getMockStore().customerPasses.set(key, next);
    return next;
  }
  const ref = db.collection('clientWorkspaces').doc(activeClientId()).collection('customerPasses').doc(code);
  return db.runTransaction(async (transaction) => {
    const pass = (await transaction.get(ref)).data() as MaharajaVideoPass | undefined;
    if (!pass?.activateOnScan || pass.activatedAt) return pass || null;
    const next = activate(pass);
    transaction.set(ref, {
      activatedAt: next.activatedAt,
      expiresAt: next.expiresAt,
      expiresAtMs: next.expiresAtMs,
      expiresAtTimestamp: Timestamp.fromMillis(next.expiresAtMs),
    }, { merge: true });
    return next;
  });
}

export async function saveVideoPass(pass: MaharajaVideoPass) {
  const db = getDb();
  const ownerClientId = pass.clientId || activeClientId();
  if (db) {
    await db.collection('customerPassIndex').doc(pass.code).set({ clientId: ownerClientId, expiresAtMs: pass.expiresAtMs });
  } else {
    getMockStore().sessions.set(`pass_index_${pass.code}`, { clientId: ownerClientId });
  }
  if (db) {
    await db.collection('clientWorkspaces').doc(activeClientId())
      .collection('customerPasses').doc(pass.code).set({
        ...pass,
        createdAtTimestamp: Timestamp.fromDate(new Date(pass.createdAt)),
        expiresAtTimestamp: Timestamp.fromDate(new Date(pass.expiresAt)),
      }, { merge: true });
  } else {
    getMockStore().customerPasses.set(`${activeClientId()}:${pass.code}`, pass);
  }

  // Atomically bind pass to customer's normalized mobile campaign entitlement (₹5,000+ qualifying pass)
  const phone = normalizePhoneNumber(pass.phone);
  if (phone && phone.length === 10 && pass.experienceType !== 'catalogue-gift') {
    await getOrCreateCampaignEntitlement(phone, pass.code, 5000, pass.eventId, pass.billLast4);
  }
}

async function resolvePhoneFromTarget(phoneOrCode: string): Promise<string> {
  const clean = normalizePhoneNumber(phoneOrCode);
  if (clean.length === 10) return clean;
  const pass = await getVideoPass(phoneOrCode);
  if (pass?.phone) {
    return normalizePhoneNumber(pass.phone);
  }
  return '';
}

export async function getOrCreateCampaignEntitlement(
  phone: string,
  qualifyingPassCode: string,
  billAmount: number = 5000,
  eventId: EventId = 'diwali',
  billLast4?: string
): Promise<CustomerCampaignEntitlement> {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized || normalized.length !== 10) {
    throw new Error('Valid 10-digit customer mobile number is required for campaign entitlement.');
  }

  const db = getDb();
  const nowIso = new Date().toISOString();
  if (db) {
    const ref = db.collection('clientWorkspaces').doc(activeClientId())
      .collection('campaignEntitlements').doc(normalized);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const existing = snap.data() as CustomerCampaignEntitlement;
        const passCodes = Array.from(new Set([...(existing.passCodes || []), qualifyingPassCode].filter(Boolean)));
        const updated: CustomerCampaignEntitlement = {
          ...existing,
          passCodes,
          updatedAt: nowIso,
        };
        tx.set(ref, updated, { merge: true });
        return updated;
      }
      const initial: CustomerCampaignEntitlement = {
        phone: normalized,
        clientId: activeClientId(),
        qualifyingPassCode,
        passCodes: [qualifyingPassCode].filter(Boolean),
        billAmount: Math.max(5000, billAmount),
        billLast4,
        eventId,
        createdAt: nowIso,
        updatedAt: nowIso,
        tryOn: { used: 0, max: 2, generating: false },
        masterImage: { used: 0, max: 2, generating: false },
        video: { used: 0, max: 2, generating: false },
      };
      tx.set(ref, initial);
      return initial;
    });
  }

  const store = getMockStore();
  const key = `${activeClientId()}:${normalized}`;
  const existing = store.campaignEntitlements.get(key) as CustomerCampaignEntitlement | undefined;
  if (existing) {
    const passCodes = Array.from(new Set([...(existing.passCodes || []), qualifyingPassCode].filter(Boolean)));
    const updated: CustomerCampaignEntitlement = {
      ...existing,
      passCodes,
      updatedAt: nowIso,
    };
    store.campaignEntitlements.set(key, updated);
    return updated;
  }
  const initial: CustomerCampaignEntitlement = {
    phone: normalized,
    normalizedPhone: normalized,
    clientId: activeClientId(),
    qualifyingPassCode,
    passCodes: [qualifyingPassCode].filter(Boolean),
    billAmount: Math.max(5000, billAmount),
    billLast4,
    eventId,
    createdAt: nowIso,
    updatedAt: nowIso,
    tryOn: { used: 0, max: 2, generating: false },
    masterImage: { used: 0, max: 2, generating: false },
    video: { used: 0, max: 2, generating: false },
  };
  store.campaignEntitlements.set(key, initial);
  return initial;
}

export async function getCampaignEntitlementByPhone(phone: string): Promise<CustomerCampaignEntitlement | null> {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized || normalized.length !== 10) return null;
  const db = getDb();
  if (db) {
    const snap = await db.collection('clientWorkspaces').doc(activeClientId())
      .collection('campaignEntitlements').doc(normalized).get();
    if (!snap.exists) return null;
    const data = snap.data() as CustomerCampaignEntitlement;
    return { ...data, normalizedPhone: data.normalizedPhone || data.phone };
  }
  const key = `${activeClientId()}:${normalized}`;
  const item = getMockStore().campaignEntitlements.get(key);
  if (!item || typeof item !== 'object') return null;
  const data = item as CustomerCampaignEntitlement;
  return { ...data, normalizedPhone: data.normalizedPhone || data.phone };
}

export async function getCampaignEntitlementForPass(code: string): Promise<CustomerCampaignEntitlement | null> {
  if (!code) return null;
  // 1. Prioritize pass lookup if code corresponds to an existing customer pass
  const pass = await getVideoPass(code);
  if (pass?.experienceType === 'catalogue-gift') return null;
  if (pass?.phone) {
    const normalized = normalizePhoneNumber(pass.phone);
    if (normalized.length === 10) {
      let entitlement = await getCampaignEntitlementByPhone(normalized);
      if (!entitlement) {
        entitlement = await getOrCreateCampaignEntitlement(normalized, pass.code, 5000, pass.eventId, pass.billLast4);
      }
      return entitlement;
    }
  }
  // 2. Direct phone number fallback
  const cleanPhone = normalizePhoneNumber(code);
  if (cleanPhone.length === 10) {
    return getCampaignEntitlementByPhone(cleanPhone);
  }
  return null;
}

export async function acquireServiceGenerationLock(
  phoneOrCode: string,
  service: 'try-on' | 'master-image' | 'video',
  options?: { jobId?: string; forceRegenerate?: boolean; generationId?: string }
): Promise<{ ok: true; generationId?: string } | { ok: false; error: string }> {
  const targetPass = await getVideoPass(phoneOrCode);
  if (targetPass?.experienceType === 'catalogue-gift') {
    const used = service === 'video' ? Number(targetPass.usage?.videosGenerated || 0) : Number(targetPass.usage?.imagesGenerated || 0);
    if (used >= 2) return { ok: false, error: 'AI Video Gift Link allowance exhausted (2/2 completed).' };
    return { ok: true, generationId: options?.generationId };
  }
  const phone = await resolvePhoneFromTarget(phoneOrCode);
  if (!phone) {
    return { ok: true, generationId: options?.generationId };
  }

  const db = getDb();
  const now = Date.now();
  const serviceKey = service === 'try-on' ? 'tryOn' : (service === 'master-image' ? 'masterImage' : 'video');
  const serviceLabel = service === 'try-on' ? 'AI Try-On' : (service === 'master-image' ? 'Celebration Gemini Master Image' : 'H3 Cinematic Video');

  if (db) {
    const ref = db.collection('clientWorkspaces').doc(activeClientId())
      .collection('campaignEntitlements').doc(phone);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      let entitlement: CustomerCampaignEntitlement;
      if (!snap.exists) {
        entitlement = {
          phone,
          clientId: activeClientId(),
          qualifyingPassCode: phoneOrCode,
          passCodes: [phoneOrCode],
          billAmount: 5000,
          eventId: 'diwali',
          createdAt: new Date(now).toISOString(),
          updatedAt: new Date(now).toISOString(),
          tryOn: { used: 0, max: 2, generating: false },
          masterImage: { used: 0, max: 2, generating: false },
          video: { used: 0, max: 2, generating: false },
        };
      } else {
        entitlement = snap.data() as CustomerCampaignEntitlement;
      }

      const counter = entitlement[serviceKey] || { used: 0, max: 2, generating: false };
      if (ENFORCE_REPEAT_LIMITS && Number(counter.used || 0) >= 2) {
        return {
          ok: false,
          error: `${serviceLabel} allowance exhausted (2/2 completed). Maximum 2 generations reached for this customer mobile number.`,
        };
      }


      const lockStaleMs = service === 'video' ? 3 * 60 * 1000 : 90 * 1000;
      if (counter.generating) {
        let passStale = false;
        if (phoneOrCode) {
          const pass = await getVideoPass(phoneOrCode);
          if (pass) {
            const passTime = service === 'video' ? Number(pass.videoGeneratingAtMs || 0) : Number(pass.imageGeneratingAtMs || 0);
            if (passTime && (now - passTime >= lockStaleMs)) {
              passStale = true;
            }
          }
        }
        if (!passStale && (now - Number(counter.generatingAtMs || 0) < lockStaleMs)) {
          return {
            ok: false,
            error: `${serviceLabel} generation is already in progress for this customer. Please wait.`,
          };
        }
      }

      const updatedCounter: ServiceAllowanceCounter = {
        ...counter,
        used: counter.used || 0,
        max: 2,
        generating: true,
        generatingAtMs: now,
        ...(options?.jobId ? { lastJobId: options.jobId } : {}),
      };

      tx.set(ref, {
        ...entitlement,
        [serviceKey]: updatedCounter,
        updatedAt: new Date(now).toISOString(),
      }, { merge: true });

      return { ok: true, generationId: options?.generationId };
    });
  }

  const store = getMockStore();
  const key = `${activeClientId()}:${phone}`;
  let entitlement = store.campaignEntitlements.get(key) as CustomerCampaignEntitlement | undefined;
  if (!entitlement) {
    entitlement = {
      phone,
      clientId: activeClientId(),
      qualifyingPassCode: phoneOrCode,
      passCodes: [phoneOrCode],
      billAmount: 5000,
      eventId: 'diwali',
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      tryOn: { used: 0, max: 2, generating: false },
      masterImage: { used: 0, max: 2, generating: false },
      video: { used: 0, max: 2, generating: false },
    };
  }

  const counter = entitlement[serviceKey] || { used: 0, max: 2, generating: false };
  if (ENFORCE_REPEAT_LIMITS && Number(counter.used || 0) >= 2) {
    return {
      ok: false,
      error: `${serviceLabel} allowance exhausted (2/2 completed). Maximum 2 generations reached for this customer mobile number.`,
    };
  }


  const lockStaleMs = service === 'video' ? 3 * 60 * 1000 : 90 * 1000;
  if (counter.generating) {
    let passStale = false;
    if (phoneOrCode) {
      const pass = await getVideoPass(phoneOrCode);
      if (pass) {
        const passTime = service === 'video' ? Number(pass.videoGeneratingAtMs || 0) : Number(pass.imageGeneratingAtMs || 0);
        if (passTime && (now - passTime >= lockStaleMs)) {
          passStale = true;
        }
      }
    }
    if (!passStale && (now - Number(counter.generatingAtMs || 0) < lockStaleMs)) {
      return {
        ok: false,
        error: `${serviceLabel} generation is already in progress for this customer. Please wait.`,
      };
    }
  }

  const updatedCounter: ServiceAllowanceCounter = {
    ...counter,
    used: counter.used || 0,
    max: 2,
    generating: true,
    generatingAtMs: now,
    ...(options?.jobId ? { lastJobId: options.jobId } : {}),
  };

  store.campaignEntitlements.set(key, {
    ...entitlement,
    [serviceKey]: updatedCounter,
    updatedAt: new Date(now).toISOString(),
  });

  return { ok: true, generationId: options?.generationId };
}

export async function releaseServiceGenerationLock(
  phoneOrCode: string,
  service: 'try-on' | 'master-image' | 'video',
  _options?: { generationId?: string; jobId?: string }
): Promise<void> {
  const targetPass = await getVideoPass(phoneOrCode);
  if (targetPass?.experienceType === 'catalogue-gift') return;
  const phone = await resolvePhoneFromTarget(phoneOrCode);
  if (!phone) return;

  const serviceKey = service === 'try-on' ? 'tryOn' : (service === 'master-image' ? 'masterImage' : 'video');
  const db = getDb();
  const nowIso = new Date().toISOString();

  if (db) {
    const ref = db.collection('clientWorkspaces').doc(activeClientId())
      .collection('campaignEntitlements').doc(phone);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const entitlement = snap.data() as CustomerCampaignEntitlement;
      const counter = entitlement[serviceKey] || { used: 0, max: 2, generating: false };
      tx.set(ref, {
        ...entitlement,
        [serviceKey]: {
          ...counter,
          generating: false,
        },
        updatedAt: nowIso,
      }, { merge: true });
    });
    return;
  }

  const store = getMockStore();
  const key = `${activeClientId()}:${phone}`;
  const entitlement = store.campaignEntitlements.get(key) as CustomerCampaignEntitlement | undefined;
  if (!entitlement) return;
  const counter = entitlement[serviceKey] || { used: 0, max: 2, generating: false };
  store.campaignEntitlements.set(key, {
    ...entitlement,
    [serviceKey]: {
      ...counter,
      generating: false,
    },
    updatedAt: nowIso,
  });
}

export async function recordServiceGenerationSuccess(
  phoneOrCode: string,
  service: 'try-on' | 'master-image' | 'video',
  _payload?: { url?: string; jobId?: string }
): Promise<{ used: number; max: number; exhausted: boolean }> {
  const targetPass = await getVideoPass(phoneOrCode);
  if (targetPass?.experienceType === 'catalogue-gift') {
    const current = service === 'video' ? Number(targetPass.usage?.videosGenerated || 0) : Number(targetPass.usage?.imagesGenerated || 0);
    const used = Math.min(2, current + 1);
    return { used, max: 2, exhausted: used >= 2 };
  }
  const phone = await resolvePhoneFromTarget(phoneOrCode);
  if (!phone) return { used: 1, max: ENFORCE_REPEAT_LIMITS ? 2 : 999, exhausted: false };

  const serviceKey = service === 'try-on' ? 'tryOn' : (service === 'master-image' ? 'masterImage' : 'video');
  const db = getDb();
  const nowIso = new Date().toISOString();

  if (db) {
    const ref = db.collection('clientWorkspaces').doc(activeClientId())
      .collection('campaignEntitlements').doc(phone);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      let entitlement: CustomerCampaignEntitlement;
      if (!snap.exists) {
        entitlement = {
          phone,
          clientId: activeClientId(),
          qualifyingPassCode: phoneOrCode,
          passCodes: [phoneOrCode],
          billAmount: 5000,
          eventId: 'diwali',
          createdAt: nowIso,
          updatedAt: nowIso,
          tryOn: { used: 0, max: 2, generating: false },
          masterImage: { used: 0, max: 2, generating: false },
          video: { used: 0, max: 2, generating: false },
        };
      } else {
        entitlement = snap.data() as CustomerCampaignEntitlement;
      }
      const counter = entitlement[serviceKey] || { used: 0, max: 2, generating: false };
      const nextUsed = ENFORCE_REPEAT_LIMITS
        ? Math.min(2, (Number(counter.used) || 0) + 1)
        : (Number(counter.used) || 0) + 1;
      const updatedCounter: ServiceAllowanceCounter = {
        ...counter,
        used: nextUsed,
        max: ENFORCE_REPEAT_LIMITS ? 2 : 999,
        generating: false,
      };

      tx.set(ref, {
        ...entitlement,
        [serviceKey]: updatedCounter,
        updatedAt: nowIso,
      }, { merge: true });

      return { used: nextUsed, max: ENFORCE_REPEAT_LIMITS ? 2 : 999, exhausted: ENFORCE_REPEAT_LIMITS ? nextUsed >= 2 : false };
    });
  }

  const store = getMockStore();
  const key = `${activeClientId()}:${phone}`;
  let entitlement = store.campaignEntitlements.get(key) as CustomerCampaignEntitlement | undefined;
  if (!entitlement) {
    entitlement = {
      phone,
      clientId: activeClientId(),
      qualifyingPassCode: phoneOrCode,
      passCodes: [phoneOrCode],
      billAmount: 5000,
      eventId: 'diwali',
      createdAt: nowIso,
      updatedAt: nowIso,
      tryOn: { used: 0, max: 2, generating: false },
      masterImage: { used: 0, max: 2, generating: false },
      video: { used: 0, max: 2, generating: false },
    };
  }
  const counter = entitlement[serviceKey] || { used: 0, max: 2, generating: false };
  const nextUsed = ENFORCE_REPEAT_LIMITS
    ? Math.min(2, (Number(counter.used) || 0) + 1)
    : (Number(counter.used) || 0) + 1;
  const updatedCounter: ServiceAllowanceCounter = {
    ...counter,
    used: nextUsed,
    max: ENFORCE_REPEAT_LIMITS ? 2 : 999,
    generating: false,
  };

  store.campaignEntitlements.set(key, {
    ...entitlement,
    [serviceKey]: updatedCounter,
    updatedAt: nowIso,
  });

  return { used: nextUsed, max: ENFORCE_REPEAT_LIMITS ? 2 : 999, exhausted: ENFORCE_REPEAT_LIMITS ? nextUsed >= 2 : false };
}

export async function expireActivePassesForPhone(phone: string, excludeCode?: string, experienceType?: 'purchased-garment' | 'catalogue-gift'): Promise<number> {
  const db = getDb();
  if (db) {
    const snapshot = await db.collection('clientWorkspaces').doc(activeClientId())
      .collection('customerPasses')
      .where('phone', '==', phone)
      .where('status', '==', 'active')
      .get();
    if (snapshot.empty) return 0;

    const batch = db.batch();
    let count = 0;
    const nowIso = new Date().toISOString();
    snapshot.docs.forEach((doc) => {
      const existing = doc.data() as MaharajaVideoPass;
      const existingType = existing.experienceType || 'purchased-garment';
      if ((!excludeCode || doc.id !== excludeCode) && (!experienceType || existingType === experienceType)) {
        batch.set(doc.ref, {
          status: 'expired',
          expiredReason: 'superseded_by_retry',
          updatedAt: nowIso,
          updatedAtTimestamp: Timestamp.now(),
        }, { merge: true });
        count++;
      }
    });
    if (count > 0) {
      await batch.commit();
    }
    return count;
  }

  const store = getMockStore();
  let count = 0;
  const nowIso = new Date().toISOString();
  for (const [key, rawPass] of store.customerPasses.entries()) {
    if (key.startsWith(`${activeClientId()}:`)) {
      const p = rawPass as MaharajaVideoPass;
      if (p.phone === phone && p.status === 'active' && (!excludeCode || p.code !== excludeCode) && (!experienceType || (p.experienceType || 'purchased-garment') === experienceType)) {
        store.customerPasses.set(key, {
          ...p,
          status: 'expired',
          expiredReason: 'superseded_by_retry',
        });
        count++;
      }
    }
  }
  return count;
}

export async function listRecentVideoPasses(limit = 8): Promise<MaharajaVideoPass[]> {
  const db = getDb();
  if (db) {
    const snapshot = await db.collection('clientWorkspaces').doc(activeClientId())
      .collection('customerPasses').orderBy('createdAtTimestamp', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => doc.data() as MaharajaVideoPass);
  }
  return Array.from(getMockStore().customerPasses.entries())
    .filter(([key]) => key.startsWith(`${activeClientId()}:`))
    .map(([, value]) => value as MaharajaVideoPass)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function incrementMaharajaUsage(field: keyof MaharajaWorkspace['usage']) {
  const db = getDb();
  if (db) {
    // set() treats dotted keys as literal field names, so the counter is written as a nested map.
    await db.collection('clientWorkspaces').doc(activeClientId()).set({
      usage: { [field]: FieldValue.increment(1) },
      updatedAt: new Date().toISOString(),
      updatedAtTimestamp: Timestamp.now(),
    }, { merge: true });
    return;
  }
  const workspace = await getMaharajaWorkspace();
  getMockStore().clientWorkspaces.set(activeClientId(), {
    ...workspace,
    usage: { ...workspace.usage, [field]: Number(workspace.usage[field] || 0) + 1 },
  });
}

/**
 * Takes one store credit only while usage is below the limit, in a single transaction, so parallel
 * generations (for example five TV looks at once) cannot exceed what the client bought.
 */
export async function reserveMaharajaUsage(field: 'tryOnGenerated' | 'videosGenerated' | 'liveSessions', limit: number) {
  if (limit <= 0) return false;
  const db = getDb();
  if (db) {
    const ref = db.collection('clientWorkspaces').doc(activeClientId());
    return db.runTransaction(async (transaction) => {
      const used = Number((await transaction.get(ref)).data()?.usage?.[field] || 0);
      if (used >= limit) return false;
      transaction.set(ref, { usage: { [field]: used + 1 }, updatedAt: new Date().toISOString() }, { merge: true });
      return true;
    });
  }
  // The mock store is read and written without an await in between, so it is atomic as well.
  const fallback = defaultWorkspace(activeClientId());
  const stored = getMockStore().clientWorkspaces.get(activeClientId()) as MaharajaWorkspace | undefined;
  const workspace = stored ? normalizeWorkspace(stored, fallback) : fallback;
  const used = Number(workspace.usage[field] || 0);
  if (used >= limit) return false;
  getMockStore().clientWorkspaces.set(activeClientId(), { ...workspace, usage: { ...workspace.usage, [field]: used + 1 } });
  return true;
}

/** Returns a reserved credit when the generation it was reserved for did not complete. */
export async function releaseMaharajaUsage(field: 'tryOnGenerated' | 'videosGenerated' | 'liveSessions') {
  const db = getDb();
  if (db) {
    await db.collection('clientWorkspaces').doc(activeClientId()).set({
      usage: { [field]: FieldValue.increment(-1) },
    }, { merge: true });
    return;
  }
  const workspace = await getMaharajaWorkspace();
  getMockStore().clientWorkspaces.set(activeClientId(), {
    ...workspace,
    usage: { ...workspace.usage, [field]: Math.max(0, Number(workspace.usage[field] || 0) - 1) },
  });
}

export async function incrementPassUsage(code: string, field: keyof MaharajaVideoPass['usage']) {
  const db = getDb();
  if (db) {
    await db.collection('clientWorkspaces').doc(activeClientId())
      .collection('customerPasses').doc(code).set({
        usage: { [field]: FieldValue.increment(1) },
      }, { merge: true });
    return;
  }
  const pass = await getVideoPass(code);
  if (pass) {
    getMockStore().customerPasses.set(`${activeClientId()}:${code}`, {
      ...pass,
      usage: { ...pass.usage, [field]: Number(pass.usage[field] || 0) + 1 },
    });
  }
}

export async function markVideoPassUsed(code: string) {
  const db = getDb();
  const update = {
    status: 'used' as const,
    usedAt: new Date().toISOString(),
  };
  if (db) {
    await db.collection('clientWorkspaces').doc(activeClientId())
      .collection('customerPasses').doc(code).set({
        ...update,
        usedAtTimestamp: Timestamp.now(),
      }, { merge: true });
  } else {
    const pass = getMockStore().customerPasses.get(`${activeClientId()}:${code}`) as MaharajaVideoPass | undefined;
    if (pass) {
      getMockStore().customerPasses.set(`${activeClientId()}:${code}`, {
        ...pass,
        status: 'used',
      });
    }
  }
}

async function mergePassUpdate(code: string, update: Partial<MaharajaVideoPass>) {
  const db = getDb();
  if (db) {
    await db.collection('clientWorkspaces').doc(activeClientId())
      .collection('customerPasses').doc(code).set(update, { merge: true });
  } else {
    const pass = getMockStore().customerPasses.get(`${activeClientId()}:${code}`) as MaharajaVideoPass | undefined;
    if (pass) {
      getMockStore().customerPasses.set(`${activeClientId()}:${code}`, { ...pass, ...update });
    }
  }
}

export async function markPassTryOnImageDone(code: string, tryOnImageUrl: string) {
  await mergePassUpdate(code, { tryOnImageDone: true, tryOnImageUrl, imageGenerating: false });
  await recordServiceGenerationSuccess(code, 'try-on', { url: tryOnImageUrl });
}

export async function markPassVideoMasterDone(
  code: string,
  videoMasterUrl: string,
  meta?: {
    conceptId?: VideoConceptId;
    promptArchitectureVersion?: string;
    category?: CustomerCategory;
    garmentType?: string;
    /** Retained only so already-issued v1 sessions remain readable. New v2 jobs do not set it. */
    experienceId?: string;
    garmentRoles?: string[];
    referenceSessionId?: string;
    personPhotoStoragePath?: string;
    garmentPhotoStoragePaths?: string[];
  },
  generationId?: string
) {
  const db = getDb();
  if (db) {
    const ref = db.collection('clientWorkspaces').doc(activeClientId()).collection('customerPasses').doc(code);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const pass = snap.data() as MaharajaVideoPass;
      // Safeguard 1: Mandatory generation ID fencing.
      // If pass has an active generation, or generationId was supplied, they MUST match and generationId cannot be missing.
      if (pass.activeMasterGenerationId || generationId) {
        if (!generationId || pass.activeMasterGenerationId !== generationId) {
          console.warn(`[Safeguard 1] Stale or missing master image generation ID rejected: pass active generation is ${pass.activeMasterGenerationId || 'none'}, received ${generationId || 'none'}`);
          return;
        }
      }
      const cat = meta?.category;
      const garment = meta?.garmentType || (cat ? resolveGarmentType(cat) : undefined);
      const updateData: Record<string, any> = {
        videoMasterDone: true,
        videoMasterUrl,
        videoMasterApproved: false,
        videoMasterApprovedUrl: '',
        imageGenerating: false,
        activeMasterGenerationId: FieldValue.delete(),
      };
      if (meta?.conceptId) updateData.videoMasterConceptId = meta.conceptId;
      if (meta?.promptArchitectureVersion) updateData.videoPromptArchitectureVersion = meta.promptArchitectureVersion;
      if (cat) updateData.videoMasterCategory = cat;
      if (garment) updateData.videoMasterGarmentType = garment;
      if (meta?.experienceId) updateData.videoMasterExperienceId = meta.experienceId;
      if (meta?.garmentRoles) updateData.videoMasterGarmentRoles = meta.garmentRoles.slice(0, 2);
      if (meta?.referenceSessionId) updateData.videoReferenceSessionId = meta.referenceSessionId;
      if (meta?.personPhotoStoragePath) updateData.videoPersonPhotoStoragePath = meta.personPhotoStoragePath;
      if (meta?.garmentPhotoStoragePaths) updateData.videoGarmentPhotoStoragePaths = meta.garmentPhotoStoragePaths.slice(0, 2);
      tx.update(ref, updateData);
    });
    await recordServiceGenerationSuccess(code, 'master-image', { url: videoMasterUrl });
    return;
  }
  const key = `${activeClientId()}:${code}`;
  const pass = getMockStore().customerPasses.get(key) as MaharajaVideoPass | undefined;
  if (pass) {
    if (pass.activeMasterGenerationId || generationId) {
      if (!generationId || pass.activeMasterGenerationId !== generationId) {
        console.warn(`[Safeguard 1] Stale or missing master image generation ID rejected: pass active generation is ${pass.activeMasterGenerationId || 'none'}, received ${generationId || 'none'}`);
        return;
      }
    }
    const cat = meta?.category;
    const garment = meta?.garmentType || (cat ? resolveGarmentType(cat) : undefined);
    const passCopy: any = {
      ...pass,
      videoMasterDone: true,
      videoMasterUrl,
      videoMasterApproved: false,
      videoMasterApprovedUrl: '',
      imageGenerating: false,
    };
    delete passCopy.activeMasterGenerationId;
    if (meta?.conceptId) passCopy.videoMasterConceptId = meta.conceptId;
    if (meta?.promptArchitectureVersion) passCopy.videoPromptArchitectureVersion = meta.promptArchitectureVersion;
    if (cat) passCopy.videoMasterCategory = cat;
    if (garment) passCopy.videoMasterGarmentType = garment;
    if (meta?.experienceId) passCopy.videoMasterExperienceId = meta.experienceId;
    if (meta?.garmentRoles) passCopy.videoMasterGarmentRoles = meta.garmentRoles.slice(0, 2);
    if (meta?.referenceSessionId) passCopy.videoReferenceSessionId = meta.referenceSessionId;
    if (meta?.personPhotoStoragePath) passCopy.videoPersonPhotoStoragePath = meta.personPhotoStoragePath;
    if (meta?.garmentPhotoStoragePaths) passCopy.videoGarmentPhotoStoragePaths = meta.garmentPhotoStoragePaths.slice(0, 2);
    getMockStore().customerPasses.set(key, passCopy);
    await recordServiceGenerationSuccess(code, 'master-image', { url: videoMasterUrl });
  }
}

export async function approvePassVideoMaster(code: string, approvedUrl?: string) {
  const db = getDb();
  if (db) {
    const ref = db.collection('clientWorkspaces').doc(activeClientId()).collection('customerPasses').doc(code);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('Pass not found');
      const pass = snap.data() as MaharajaVideoPass;
      if (!pass.videoMasterDone || !pass.videoMasterUrl) {
        throw new Error('No master image exists to approve.');
      }
      if (approvedUrl && pass.videoMasterUrl !== approvedUrl) {
        throw new Error('Approval URL mismatch: Master image was superseded by another generation.');
      }
      tx.update(ref, {
        videoMasterApproved: true,
        videoMasterApprovedUrl: approvedUrl || pass.videoMasterUrl,
        videoMasterApprovedAtMs: Date.now(),
      });
    });
  } else {
    const key = `${activeClientId()}:${code}`;
    const pass = getMockStore().customerPasses.get(key) as MaharajaVideoPass | undefined;
    if (pass) {
      if (!pass.videoMasterDone || !pass.videoMasterUrl) {
        throw new Error('No master image exists to approve.');
      }
      if (approvedUrl && pass.videoMasterUrl !== approvedUrl) {
        throw new Error('Approval URL mismatch: Master image was superseded by another generation.');
      }
      getMockStore().customerPasses.set(key, {
        ...pass,
        videoMasterApproved: true,
        videoMasterApprovedUrl: approvedUrl || pass.videoMasterUrl,
        videoMasterApprovedAtMs: Date.now(),
      });
    }
  }
}

export async function rejectPassMasterImage(code: string, service: 'try-on' | 'ai-video' = 'ai-video', reason?: string) {
  const db = getDb();
  if (db) {
    const ref = db.collection('clientWorkspaces').doc(activeClientId()).collection('customerPasses').doc(code);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const pass = snap.data() as MaharajaVideoPass;
      // Safeguard 2: Rejection cannot reopen an already completed/consumed video pass!
      if (pass.status === 'used' || pass.videoDone) {
        throw new Error('Cannot reject or reset master image on an already completed video pass.');
      }
      // Safeguard 2: Rejection is strictly blocked once H3 video generation has been claimed or started!
      if (pass.videoGenerating || pass.activeVideoJobId || pass.providerAccepted) {
        throw new Error('Cannot reject master image while AI video generation is in progress. Please wait for the video to complete or fail.');
      }
      const rejectedList = Array.isArray(pass.rejectedMasterUrls) ? [...pass.rejectedMasterUrls] : [];
      if (service === 'ai-video' && pass.videoMasterUrl) {
        rejectedList.push(pass.videoMasterUrl);
      }
      const update: Record<string, any> = service === 'ai-video'
        ? {
            videoMasterDone: false,
            videoMasterUrl: '',
            videoMasterApproved: false,
            videoMasterApprovedUrl: '',
            rejectedMasterUrls: rejectedList,
            imageGenerating: false,
            activeMasterGenerationId: FieldValue.delete(),
          }
        : {
            tryOnImageDone: false,
            tryOnImageUrl: '',
            imageGenerating: false,
          };
      tx.update(ref, update);
    });
  } else {
    const key = `${activeClientId()}:${code}`;
    const pass = getMockStore().customerPasses.get(key) as MaharajaVideoPass | undefined;
    if (pass) {
      if (pass.status === 'used' || pass.videoDone) {
        throw new Error('Cannot reject or reset master image on an already completed video pass.');
      }
      if (pass.videoGenerating || pass.activeVideoJobId || pass.providerAccepted) {
        throw new Error('Cannot reject master image while AI video generation is in progress. Please wait for the video to complete or fail.');
      }
      const rejectedList = Array.isArray(pass.rejectedMasterUrls) ? [...pass.rejectedMasterUrls] : [];
      if (service === 'ai-video' && pass.videoMasterUrl) {
        rejectedList.push(pass.videoMasterUrl);
      }
      const copy: any = {
        ...pass,
        ...(service === 'ai-video'
          ? {
              videoMasterDone: false,
              videoMasterUrl: '',
              videoMasterApproved: false,
              videoMasterApprovedUrl: '',
              rejectedMasterUrls: rejectedList,
              imageGenerating: false,
            }
          : {
              tryOnImageDone: false,
              tryOnImageUrl: '',
              imageGenerating: false,
            }),
      };
      if (service === 'ai-video') {
        delete copy.activeMasterGenerationId;
      }
      getMockStore().customerPasses.set(key, copy);
    }
  }

  await releaseServiceGenerationLock(code, service === 'try-on' ? 'try-on' : 'master-image');
}

export async function markPassWhatsAppDelivery(code: string, status: 'sent' | 'failed') {
  await mergePassUpdate(code, {
    whatsappDeliveryStatus: status,
    ...(status === 'sent' ? { whatsappSentAt: new Date().toISOString() } : {}),
  });
}

export async function claimPassWhatsAppDelivery(code: string) {
  const db = getDb();
  if (db) {
    const ref = db.collection('clientWorkspaces').doc(activeClientId()).collection('customerPasses').doc(code);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return false;
      const pass = snapshot.data() as MaharajaVideoPass;
      if (pass.whatsappDeliveryStatus === 'sending' || pass.whatsappDeliveryStatus === 'sent') return false;
      transaction.set(ref, { whatsappDeliveryStatus: 'sending' }, { merge: true });
      return true;
    });
  }
  const key = `${activeClientId()}:${code}`;
  const pass = getMockStore().customerPasses.get(key) as MaharajaVideoPass | undefined;
  if (!pass || pass.whatsappDeliveryStatus === 'sending' || pass.whatsappDeliveryStatus === 'sent') return false;
  getMockStore().customerPasses.set(key, { ...pass, whatsappDeliveryStatus: 'sending' });
  return true;
}

/** Called once the video provider has accepted the job: marks as rendering and binds the job ID. */
export async function markPassVideoSubmitted(code: string, jobId: string) {
  await mergePassUpdate(code, {
    videoGenerating: true,
    videoGeneratingAtMs: Date.now(),
    videoDone: false,
    activeVideoJobId: jobId,
    providerAccepted: true,
    lastVideoFailed: false,
  });
}

/** Called once the final video is confirmed ready by /api/video/status: completes the video and releases lock. */
export async function markPassVideoReady(code: string, jobId?: string) {
  const db = getDb();
  if (db) {
    const ref = db.collection('clientWorkspaces').doc(activeClientId()).collection('customerPasses').doc(code);
    const markedReady = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return false;
      const pass = snapshot.data() as MaharajaVideoPass;
      if (!jobId || !pass.activeVideoJobId || pass.activeVideoJobId !== jobId) {
        console.warn(`Ignoring video ready from non-active job ${jobId}; active job is ${pass.activeVideoJobId || 'none'}`);
        return false;
      }
      tx.update(ref, {
        videoDone: true,
        videoGenerating: false,
        providerAccepted: false,
        lastVideoFailed: false,
        activeVideoJobId: FieldValue.delete(),
      });
      return true;
    });
    if (!markedReady) return;
    await recordServiceGenerationSuccess(code, 'video', { jobId });
    await incrementMaharajaUsage('videosGenerated');
    await logMaharajaActivity('video-ready', 'Customer AI Video MP4 completed and ready', { code, jobId: jobId || null });
    return;
  }
  const key = `${activeClientId()}:${code}`;
  const pass = getMockStore().customerPasses.get(key) as MaharajaVideoPass | undefined;
  if (!pass) return;
  if (!jobId || !pass.activeVideoJobId || pass.activeVideoJobId !== jobId) {
    console.warn(`Ignoring video ready from non-active job ${jobId}; active job is ${pass.activeVideoJobId || 'none'}`);
    return;
  }
  const copy = {
    ...pass,
    videoDone: true,
    videoGenerating: false,
    providerAccepted: false,
    lastVideoFailed: false,
  };
  delete (copy as any).activeVideoJobId;
  getMockStore().customerPasses.set(key, copy);

  await recordServiceGenerationSuccess(code, 'video', { jobId });
  await incrementMaharajaUsage('videosGenerated');
  await logMaharajaActivity('video-ready', 'Customer AI Video MP4 completed and ready', { code, jobId: jobId || null });
}

/** Backwards-compatible alias for markPassVideoReady. */
export async function markPassVideoDone(code: string, jobId?: string) {
  await markPassVideoReady(code, jobId);
}

/** Releases the video lock after a provider rejection / failure (video stays available). */
export async function releasePassVideoLock(code: string) {
  const db = getDb();
  if (db) {
    const ref = db.collection('clientWorkspaces').doc(activeClientId()).collection('customerPasses').doc(code);
    await ref.update({
      videoGenerating: false,
      providerAccepted: false,
      activeVideoJobId: FieldValue.delete(),
    });
  } else {
    const key = `${activeClientId()}:${code}`;
    const pass = getMockStore().customerPasses.get(key) as MaharajaVideoPass | undefined;
    if (pass) {
      const copy = { ...pass, videoGenerating: false, providerAccepted: false };
      delete (copy as any).activeVideoJobId;
      getMockStore().customerPasses.set(key, copy);
    }
  }
  await releaseServiceGenerationLock(code, 'video');
}

/**
 * Called when a submitted video generation job permanently fails on the provider queue.
 * Reopens the pass video slot so the customer's legitimate 1-video entitlement is not consumed by a failed render.
 */
export async function markPassVideoFailed(code: string, jobId?: string) {
  const db = getDb();
  let releasedActiveJob = false;
  if (db) {
    const ref = db.collection('clientWorkspaces').doc(activeClientId()).collection('customerPasses').doc(code);
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return;
      const pass = snapshot.data() as MaharajaVideoPass;
      if (!jobId || !pass.activeVideoJobId || pass.activeVideoJobId !== jobId) {
        console.warn(`Ignoring video failed from non-active job ${jobId}; active job is ${pass.activeVideoJobId || 'none'}`);
        return;
      }
      tx.update(ref, {
        videoDone: false,
        videoGenerating: false,
        providerAccepted: false,
        retryUsed: false,
        retryEnabled: true,
        lastVideoFailed: true,
        lastVideoFailedAtMs: Date.now(),
        activeVideoJobId: FieldValue.delete(),
      });
      releasedActiveJob = true;
    });
  } else {
    const key = `${activeClientId()}:${code}`;
    const pass = getMockStore().customerPasses.get(key) as MaharajaVideoPass | undefined;
    if (pass) {
      if (!jobId || !pass.activeVideoJobId || pass.activeVideoJobId !== jobId) {
        console.warn(`Ignoring video failed from non-active job ${jobId}; active job is ${pass.activeVideoJobId || 'none'}`);
        return;
      }
      const copy = {
        ...pass,
        videoDone: false,
        videoGenerating: false,
        providerAccepted: false,
        retryUsed: false,
        retryEnabled: true,
        lastVideoFailed: true,
        lastVideoFailedAtMs: Date.now(),
      };
      delete (copy as any).activeVideoJobId;
      getMockStore().customerPasses.set(key, copy);
      releasedActiveJob = true;
    }
  }

  // A stale failure callback must never release the phone-level lock of a newer active retry.
  if (releasedActiveJob) {
    await releaseServiceGenerationLock(code, 'video', { jobId });
    await logMaharajaActivity('video-failed', 'Customer AI Video render failed', { code, jobId: jobId || null });
  }
}

/**
 * Retry approval, enforced server-side.
 * Enforces independent 2-generation ceiling per service (original + retry).
 */
export async function enablePassCustomerRetry(
  code: string,
  target: 'image' | 'video' = 'video',
  service: 'try-on' | 'ai-video' = 'ai-video'
) {
  const retryPass = await getVideoPass(code);
  const entitlement = await getCampaignEntitlementForPass(code);
  const allowances = retryPass?.experienceType === 'catalogue-gift'
    ? {
        enforceRepeatLimits: true,
        tryOn: { used: 0, max: 0, remaining: 0 },
        masterImage: { used: Math.min(2, Number(retryPass.usage?.imagesGenerated || 0)), max: 2, remaining: Math.max(0, 2 - Number(retryPass.usage?.imagesGenerated || 0)) },
        video: { used: Math.min(2, Number(retryPass.usage?.videosGenerated || 0)), max: 2, remaining: Math.max(0, 2 - Number(retryPass.usage?.videosGenerated || 0)) },
      }
    : getCustomerServiceAllowances(entitlement);

  if (target === 'video') {
    if (ENFORCE_REPEAT_LIMITS && allowances.video.used >= 2) {
      throw new Error('H3 Cinematic Video allowance exhausted (2/2 completed). Maximum 2 generations reached for this customer mobile number.');
    }
  } else if (target === 'image') {
    if (service === 'try-on') {
      if (ENFORCE_REPEAT_LIMITS && allowances.tryOn.used >= 2) {
        throw new Error('AI Try-On allowance exhausted (2/2 completed). Maximum 2 generations reached for this customer mobile number.');
      }
    } else {
      if (ENFORCE_REPEAT_LIMITS && allowances.masterImage.used >= 2) {
        throw new Error('Celebration Gemini Master Image allowance exhausted (2/2 completed). Maximum 2 generations reached for this customer mobile number.');
      }
    }
  }

  const db = getDb();
  const updates: Record<string, any> = {
    retryUsed: false,
    retryEnabled: true,
    status: 'active' as const,
  };

  if (target === 'image') {
    if (service === 'try-on') {
      updates.tryOnImageDone = false;
      updates.tryOnImageUrl = '';
    } else {
      updates.videoMasterDone = false;
      updates.videoMasterUrl = '';
      updates.videoMasterApproved = false;
      updates.videoMasterApprovedUrl = '';
      updates.videoDone = false;
      updates.videoGenerating = false;
      updates.providerAccepted = false;
    }
  } else {
    // target === 'video'
    updates.videoDone = false;
    updates.videoGenerating = false;
    updates.providerAccepted = false;
  }

  if (db) {
    const ref = db.collection('clientWorkspaces').doc(activeClientId()).collection('customerPasses').doc(code);
    await ref.update({
      ...updates,
      activeVideoJobId: FieldValue.delete(),
    });
    return;
  }
  const key = `${activeClientId()}:${code}`;
  const pass = getMockStore().customerPasses.get(key) as MaharajaVideoPass | undefined;
  if (pass) {
    const copy = {
      ...pass,
      ...updates,
    };
    delete (copy as any).activeVideoJobId;
    getMockStore().customerPasses.set(key, copy);
  }
}

export async function finalizeCompletedVideo({
  sessionId,
  jobId,
  outputVideoUrl,
  videoBuffer,
  provider = 'fal-h3-max',
  accessCode,
  clientId = activeClientId(),
  eventId = 'diwali',
}: {
  sessionId: string;
  jobId: string;
  outputVideoUrl?: string;
  videoBuffer?: Buffer;
  provider?: string;
  accessCode?: string | null;
  clientId?: string;
  eventId?: string;
}): Promise<{ success: true; videoUrl: string; liveVideoUrl?: string; storagePath: string; liveStoragePath?: string; presentationFallback?: boolean } | { success: false; error: string }> {
  const db = getDb();

  let fileBuffer: Buffer | null = videoBuffer || null;

  if (!fileBuffer && outputVideoUrl) {
    let providerUrl: URL;
    try {
      providerUrl = new URL(outputVideoUrl);
    } catch {
      return { success: false, error: 'Video provider returned an invalid result URL.' };
    }
    const providerHostAllowed = providerUrl.protocol === 'https:' && (
      providerUrl.hostname === 'fal.media' ||
      providerUrl.hostname.endsWith('.fal.media') ||
      providerUrl.hostname === 'fal.run' ||
      providerUrl.hostname.endsWith('.fal.run')
    );
    if (!providerHostAllowed) {
      return { success: false, error: 'Video provider returned an untrusted result URL.' };
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const fetchRes = await fetch(outputVideoUrl);
        if (fetchRes.ok) {
          fileBuffer = Buffer.from(await fetchRes.arrayBuffer());
          break;
        }
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1200));
      } catch {
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1200));
      }
    }
  }

  if (!fileBuffer || fileBuffer.length === 0) {
    return { success: false, error: 'Video content buffer is unavailable for finalization.' };
  }

  const storagePath = clientId
    ? `clients/${clientId}/sessions/${sessionId}/video/final-6s.mp4`
    : `sessions/${sessionId}/video/final-6s.mp4`;
  const liveStoragePath = clientId
    ? `clients/${clientId}/sessions/${sessionId}/video/live-9s.mp4`
    : `sessions/${sessionId}/video/live-9s.mp4`;
  const bucket = getStorageBucket();
  const ownerPass = accessCode ? await getVideoPass(accessCode) : null;
  const createLiveVersion = true;

  let customerVideo: Buffer;
  let liveVideo: Buffer | null = null;
  let presentationFallback = false;
  try {
    customerVideo = await generateCustomer6sVideo(fileBuffer, getPreviewAudioTrack(sessionId, eventId));
    if (createLiveVersion) liveVideo = await generateLive9sVideo(fileBuffer, getLiveAudioTrack(sessionId, eventId));
    await validateBrandedVideo(customerVideo, 6);
    if (liveVideo) await validateBrandedVideo(liveVideo, 9);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown processing error';
    // A paid provider render must remain accessible even when branding or
    // duration validation fails on the deployment runtime.
    console.warn('Video presentation processing failed; retaining provider MP4:', message);
    customerVideo = fileBuffer;
    liveVideo = null;
    presentationFallback = true;
  }

  let signedUrl = outputVideoUrl || '';
  let liveSignedUrl = outputVideoUrl || '';

  if (bucket) {
    try {
      const file = bucket.file(storagePath);
      const liveFile = bucket.file(liveStoragePath);
      await file.save(customerVideo, {
          contentType: 'video/mp4',
          public: false,
          metadata: {
            cacheControl: 'private, no-store, max-age=0',
            metadata: {
              durationSeconds: '6',
              playbackMode: presentationFallback ? 'external' : 'embedded',
              hasEmbeddedAudio: presentationFallback ? 'false' : 'true',
            },
          },
        });
      if (liveVideo) await liveFile.save(liveVideo, {
          contentType: 'video/mp4',
          public: false,
          metadata: {
            cacheControl: 'private, no-store, max-age=0',
            metadata: {
              durationSeconds: '9',
              playbackMode: 'embedded',
              hasEmbeddedAudio: 'true',
            },
          },
        });

      const sUrlRes = await file.getSignedUrl({ action: 'read', expires: Date.now() + 24 * 60 * 60 * 1000 }).catch(() => null);
      const lUrlRes = liveVideo ? await liveFile.getSignedUrl({ action: 'read', expires: Date.now() + 24 * 60 * 60 * 1000 }).catch(() => null) : null;
      if (sUrlRes?.[0]) signedUrl = sUrlRes[0];
      if (lUrlRes?.[0]) liveSignedUrl = lUrlRes[0];
      const [customerExists] = await file.exists();
      const [liveExists] = liveVideo ? await liveFile.exists() : [true];
      if (!customerExists || !liveExists) throw new Error('Final video files were not persisted to storage.');
    } catch (stErr) {
      return { success: false, error: `Final video storage failed: ${stErr instanceof Error ? stErr.message : 'unknown storage error'}` };
    }
  } else {
    const mockStore = getMockStore();
    mockStore.sessions?.set(`mock_blob_${storagePath}`, { buffer: customerVideo });
    if (liveVideo) mockStore.sessions?.set(`mock_blob_${liveStoragePath}`, { buffer: liveVideo });
    if (!signedUrl) signedUrl = `/mock-media/${storagePath}`;
    if (liveVideo && !liveSignedUrl) liveSignedUrl = `/mock-media/${liveStoragePath}`;
  }

  let customerName: string | null = null;
  let customerLocality: string | null = null;
  if (accessCode) {
    try {
      if (ownerPass?.customerName) customerName = ownerPass.customerName;
      if (ownerPass?.customerLocality) customerLocality = ownerPass.customerLocality;
    } catch {
      // non-blocking
    }
  }

  const nowIso = new Date().toISOString();

  if (db) {
    await Promise.all([
      db.collection('videos').doc(`video_${sessionId}`).set({
        id: `video_${sessionId}`,
        sessionId,
        storagePath,
        ...(liveVideo ? { liveStoragePath } : {}),
        eventId,
        status: 'ready',
        provider: provider || 'fal-h3-max',
        customerName: customerName || null,
        customerLocality: customerLocality || null,
	      playbackMode: presentationFallback ? 'external' : 'embedded',
        durationSeconds: liveVideo ? 9 : 6,
	      hasEmbeddedAudio: !presentationFallback,
        createdAt: nowIso,
      }, { merge: true }),
      db.collection('sessions').doc(sessionId).set({
        videoStatus: 'ready',
        videoUrl: signedUrl,
        videoStoragePath: storagePath,
        ...(liveVideo ? { liveVideoUrl: liveSignedUrl, liveVideoStoragePath: liveStoragePath } : {}),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: nowIso,
      }, { merge: true }),
    ]);
  } else {
    const mockStore = getMockStore();
    mockStore.videos.set(`video_${sessionId}`, {
      id: `video_${sessionId}`,
      sessionId,
      storagePath,
      ...(liveVideo ? { liveStoragePath } : {}),
      eventId,
      status: 'ready',
      provider: provider || 'fal-h3-max',
      customerName: customerName || null,
      customerLocality: customerLocality || null,
      playbackMode: presentationFallback ? 'external' : 'embedded',
      durationSeconds: liveVideo ? 9 : 6,
      hasEmbeddedAudio: !presentationFallback,
      createdAt: nowIso,
    });
    const session = mockStore.sessions.get(sessionId) || {};
    mockStore.sessions.set(sessionId, {
      ...session,
      videoStatus: 'ready',
      videoUrl: signedUrl,
      videoStoragePath: storagePath,
      ...(liveVideo ? { liveVideoUrl: liveSignedUrl, liveVideoStoragePath: liveStoragePath } : {}),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: nowIso,
    });
  }

  if (accessCode) {
    await markPassVideoReady(accessCode, jobId);
  }
  await logMaharajaActivity('video-ready', `${eventId} AI Video ready`, { sessionId, jobId });

  return {
    success: true,
    videoUrl: signedUrl,
    ...(liveVideo ? { liveVideoUrl: liveSignedUrl, liveStoragePath } : {}),
    ...(presentationFallback ? { presentationFallback: true } : {}),
    storagePath,
  };
}

export async function enableTryOnDeviceCustomerRetry(deviceId: string) {
  const hash = deviceHash(deviceId);
  const db = getDb();
  const update = {
    status: 'active' as const,
    retryUsed: true,
    expiresAtMs: Date.now() + 30 * 60 * 1000,
  };
  if (db) {
    await db.collection('clientWorkspaces').doc(activeClientId()).collection('tryOnDevices').doc(hash).set(update, { merge: true });
    return;
  }
  const key = `${activeClientId()}:${hash}`;
  const grant = getMockStore().tryOnGrants.get(key) as MaharajaTryOnGrant | undefined;
  if (grant) {
    getMockStore().tryOnGrants.set(key, { ...grant, ...update });
  }
}

// Longer than the 120-second image route budget so a slow provider response
// cannot be mistaken for a stale request and charged a second time.
const IMAGE_LOCK_STALE_MS = 3 * 60 * 1000;

export type ImageLockResult =
  | { ok: true; existingUrl?: string; approved?: boolean; generationId?: string }
  | { ok: false; error: string };

function evaluateImageLock(
  pass: MaharajaVideoPass | undefined | null,
  service: 'try-on' | 'ai-video',
  now: number,
  forceRegenerate: boolean = false
): ImageLockResult {
  if (!pass) return { ok: false, error: 'This Maharaja experience link is invalid or expired.' };
  if (!forceRegenerate) {
    if (service === 'try-on' && pass.tryOnImageDone && pass.tryOnImageUrl) {
      return { ok: true, existingUrl: pass.tryOnImageUrl };
    }
    // Safeguard 2: Recover pending unapproved OR approved master image upon refresh,
    // so long as it has NOT been explicitly rejected.
    if (service === 'ai-video' && pass.videoMasterDone && pass.videoMasterUrl) {
      const isRejected = Array.isArray(pass.rejectedMasterUrls) && pass.rejectedMasterUrls.includes(pass.videoMasterUrl);
      if (!isRejected) {
        return {
          ok: true,
          existingUrl: pass.videoMasterApproved ? (pass.videoMasterApprovedUrl || pass.videoMasterUrl) : pass.videoMasterUrl,
          approved: Boolean(pass.videoMasterApproved),
        };
      }
    }
  }
  if (pass.imageGenerating) {
    if (now - Number(pass.imageGeneratingAtMs || 0) < IMAGE_LOCK_STALE_MS) {
      return { ok: false, error: 'An AI image is already being generated for this pass. Please wait a moment.' };
    }
  }
  return { ok: true };
}

export async function acquirePassImageLock(
  code: string,
  service: 'try-on' | 'ai-video',
  forceRegenerate: boolean = false,
  generationId?: string
): Promise<ImageLockResult> {
  const db = getDb();
  const now = Date.now();
  const boundGenId = generationId || `gen_${now}_${crypto.randomBytes(4).toString('hex')}`;
  const lockUpdate: Record<string, any> = {
    imageGenerating: true,
    imageGeneratingAtMs: now,
    activeImageGenerationId: boundGenId,
  };
  if (service === 'ai-video') {
    lockUpdate.activeMasterGenerationId = boundGenId;
  }

  // Check pass state first
  const pass = await getVideoPass(code);
  const result = evaluateImageLock(pass, service, now, forceRegenerate);
  if (!result.ok || result.existingUrl) {
    return result;
  }

  // Atomic phone-level entitlement lock check
  const serviceLock = await acquireServiceGenerationLock(
    code,
    service === 'try-on' ? 'try-on' : 'master-image',
    { forceRegenerate, generationId: boundGenId }
  );
  if (!serviceLock.ok) {
    return { ok: false, error: serviceLock.error };
  }

  if (db) {
    const ref = db.collection('clientWorkspaces').doc(activeClientId()).collection('customerPasses').doc(code);
    await db.runTransaction(async (tx) => {
      tx.update(ref, lockUpdate);
    });
    return { ok: true, generationId: boundGenId };
  }

  const key = `${activeClientId()}:${code}`;
  const existingPass = getMockStore().customerPasses.get(key) as MaharajaVideoPass | undefined;
  if (existingPass) {
    getMockStore().customerPasses.set(key, { ...existingPass, ...lockUpdate });
  }
  return { ok: true, generationId: boundGenId };
}

export async function releasePassImageLock(code: string, generationId?: string): Promise<void> {
  const db = getDb();
  if (db) {
    const ref = db.collection('clientWorkspaces').doc(activeClientId()).collection('customerPasses').doc(code);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const pass = snap.data() as MaharajaVideoPass;
      if (generationId && (pass.activeImageGenerationId || pass.activeMasterGenerationId) !== generationId) {
        return;
      }
      tx.update(ref, { imageGenerating: false, activeImageGenerationId: FieldValue.delete(), activeMasterGenerationId: FieldValue.delete() });
    });
  } else {
    const key = `${activeClientId()}:${code}`;
    const pass = getMockStore().customerPasses.get(key) as MaharajaVideoPass | undefined;
    if (pass) {
      if (!generationId || (pass.activeImageGenerationId || pass.activeMasterGenerationId) === generationId) {
        getMockStore().customerPasses.set(key, { ...pass, imageGenerating: false, activeImageGenerationId: undefined, activeMasterGenerationId: undefined });
      }
    }
  }

  await releaseServiceGenerationLock(code, 'master-image', { generationId });
  await releaseServiceGenerationLock(code, 'try-on', { generationId });
}

const VIDEO_LOCK_STALE_MS = 3 * 60 * 1000;

type VideoLockResult = { ok: true } | { ok: false; error: string };

function evaluateVideoLock(pass: MaharajaVideoPass | undefined | null, now: number): VideoLockResult {
  if (!pass) return { ok: false, error: 'This Maharaja AI Video pass is invalid or expired.' };
  if (!pass.videoMasterDone || !pass.videoMasterUrl) {
    return { ok: false, error: 'Create the AI Video image first, then generate the video.' };
  }
  if (!pass.videoMasterApproved) {
    return { ok: false, error: 'Customer approval required: Please review and approve the master image before starting H3 video generation.' };
  }
  if (pass.videoGenerating) {
    // If provider has accepted the job and activeVideoJobId exists, it is actively rendering with the provider.
    // It remains locked until that exact job reaches READY or FAILED, with no 3-minute expiration.
    if (pass.providerAccepted && pass.activeVideoJobId) {
      return { ok: false, error: 'A video is already being generated for this pass. Please wait.' };
    }
    // Stale timeout recovers a crashed pre-provider/submitting lock (providerAccepted !== true) after 3 minutes.
    if (now - Number(pass.videoGeneratingAtMs || 0) < VIDEO_LOCK_STALE_MS) {
      return { ok: false, error: 'A video is already being generated for this pass. Please wait.' };
    }
  }
  return { ok: true };
}

/**
 * Atomically claims the video slot of a customer pass before any provider call.
 * Enforces server-side phone entitlement limits (max 2: 1 original + 1 customer retry).
 * Binds activeVideoJobId atomically within the lock transaction when provided, with providerAccepted=false initially.
 */
export async function acquirePassVideoLock(code: string, jobId?: string): Promise<VideoLockResult> {
  const db = getDb();
  const now = Date.now();
  const lockUpdate: Record<string, any> = {
    videoGenerating: true,
    videoGeneratingAtMs: now,
    lastVideoFailed: false,
    providerAccepted: false,
  };
  if (jobId) {
    lockUpdate.activeVideoJobId = jobId;
  }

  // 1. Check pass state
  const pass = await getVideoPass(code);
  const evalResult = evaluateVideoLock(pass, now);
  if (!evalResult.ok) {
    return evalResult;
  }

  // 2. Atomic phone-level video lock & allowance check
  const serviceLock = await acquireServiceGenerationLock(code, 'video', { jobId });
  if (!serviceLock.ok) {
    return { ok: false, error: serviceLock.error };
  }

  try {
    if (db) {
      const ref = db.collection('clientWorkspaces').doc(activeClientId()).collection('customerPasses').doc(code);
      await db.runTransaction(async (tx) => {
        tx.update(ref, lockUpdate);
      });
      return { ok: true };
    }

    const key = `${activeClientId()}:${code}`;
    const existingPass = getMockStore().customerPasses.get(key) as MaharajaVideoPass | undefined;
    if (existingPass) {
      getMockStore().customerPasses.set(key, { ...existingPass, ...lockUpdate });
    }
    return { ok: true };
  } catch (error) {
    await releaseServiceGenerationLock(code, 'video', { jobId });
    throw error;
  }
}

export async function verifyMaharajaAccess(
  req: NextRequest,
  accessCode: unknown,
  service: 'try-on' | 'ai-video'
) {
  const code = typeof accessCode === 'string' ? accessCode.trim() : '';
  const sessionClientId = req?.headers ? getOperatorSession(req)?.clientId || null : null;
  let workspace = await resolveWorkspaceByAccessCode(code);
  const codeMatchedWorkspace = Boolean(code) && [workspace.tryOnCode, workspace.billingCode, workspace.openVideoCode].includes(code);
  if (!codeMatchedWorkspace) {
    const passOwner = code ? await passClientId(code) : null;
    const ownerId = passOwner || sessionClientId;
    if (ownerId && ownerId !== workspace.clientId) workspace = await getClientWorkspaceById(ownerId);
  }
  const resolvedClientId = workspace.clientId || MAHARAJA_CLIENT_ID;
  if (!workspace.campaignEnabled) return { allowed: false as const, error: `${workspace.clientName || 'Maharaja'} campaign is currently paused.` };

  // 1. Resolve the pass by its private QR code. A phone number opens a customer's pass only for
  // signed-in staff, so knowing someone's number never reveals their photos or videos.
  const cleanPhone = normalizePhoneNumber(code);
  const phoneLookup = cleanPhone.length === 10;
  let entitlement: CustomerCampaignEntitlement | null = null;
  let pass: MaharajaVideoPass | null = null;

  if (phoneLookup) {
    if (!req?.headers || !verifyOperatorRequest(req)) {
      return { allowed: false as const, error: 'Open your private link or scan your QR code to continue.' };
    }
    entitlement = await getCampaignEntitlementByPhone(cleanPhone);
    if (entitlement && entitlement.passCodes.length > 0) {
      const latestCode = entitlement.passCodes[entitlement.passCodes.length - 1];
      pass = await getVideoPass(latestCode);
    }
  }

  if (!pass && code) {
    pass = await getVideoPass(code, resolvedClientId);
    if (pass?.phone) {
      entitlement = await getCampaignEntitlementForPass(code);
    }
  }

  const allowances = pass?.experienceType === 'catalogue-gift'
    ? {
        enforceRepeatLimits: true,
        tryOn: { used: 0, max: 0, remaining: 0 },
        masterImage: { used: Math.min(2, Number(pass.usage?.imagesGenerated || 0)), max: 2, remaining: Math.max(0, 2 - Number(pass.usage?.imagesGenerated || 0)) },
        video: { used: Math.min(2, Number(pass.usage?.videosGenerated || 0)), max: 2, remaining: Math.max(0, 2 - Number(pass.usage?.videosGenerated || 0)) },
      }
    : getCustomerServiceAllowances(entitlement);

  if (service === 'try-on') {
    // The permanent Try-On QR is a capability.
    if (code === workspace.tryOnCode) {
      return { allowed: true as const, clientId: resolvedClientId, pass: null, workspace, entitlement, allowances };
    }
    if (pass) {
      if (pass.expiresAtMs < Date.now()) {
        return { allowed: false as const, error: 'This Maharaja AI experience link has expired. Please contact the billing counter.' };
      }
      return { allowed: true as const, clientId: resolvedClientId, pass, workspace, entitlement, allowances };
    }
    return (req?.headers && await verifyTvRequest(req))
      ? { allowed: true as const, clientId: resolvedClientId, pass: null, workspace, entitlement, allowances }
      : { allowed: false as const, error: 'This Maharaja Try-On QR is invalid or expired. Please scan the Maharaja QR again.' };
  }

  // service === 'ai-video'
  // The shared poster code is never a customer pass. It is exchanged for a
  // distinct 24-hour pass by the poster entry endpoint.

  if (pass) {
    if (pass.expiresAtMs < Date.now()) {
      return { allowed: false as const, error: 'This Maharaja AI experience link has expired. Please contact the billing counter.' };
    }
    // Note: Do not block access if pass has completed video (pass.status === 'used' or videoDone);
    // Customer retains the right to view, download, or use an included retry.
    return { allowed: true as const, clientId: pass.clientId || resolvedClientId, pass, workspace, entitlement, allowances };
  }

  if (entitlement) {
    return { allowed: true as const, clientId: resolvedClientId, pass, workspace, entitlement, allowances };
  }

  return (req?.headers && await verifyTvRequest(req))
    ? { allowed: true as const, clientId: resolvedClientId, pass: null, workspace, entitlement, allowances }
    : { allowed: false as const, error: 'This Maharaja AI Video pass is invalid or expired.' };
}

/**
 * Client a request belongs to: a customer QR or pass code decides first, then a client's own staff
 * login. TryFocus admin and paired Maharaja devices fall through to null (Maharaja), unless an admin
 * names another client with `requestedClientId`. Bind the result with bindClient() in the handler.
 */
export async function resolveRequestClientId(req: NextRequest, accessCode?: unknown, requestedClientId?: string | null) {
  const goLiveClient = await goLiveClientId(req);
  if (goLiveClient) return goLiveClient;
  const code = typeof accessCode === 'string' ? accessCode.trim() : '';
  if (code) {
    const all = await listClientWorkspaces();
    const byCode = all.find((ws) => ws.tryOnCode === code || ws.billingCode === code || ws.openVideoCode === code);
    if (byCode) return byCode.clientId;
    const passOwner = await passClientId(code);
    if (passOwner) return passOwner;
  }
  const session = getOperatorSession(req);
  if (session?.role === 'client') return session.clientId;
  return session?.role === 'admin' && requestedClientId ? requestedClientId : null;
}

export function publicWorkspaceView(workspace: MaharajaWorkspace) {
  return {
    clientId: workspace.clientId,
    clientName: workspace.clientName,
    campaignEnabled: workspace.campaignEnabled,
    tryOnMinimum: workspace.minPurchaseTryOnDisabled === false ? Math.max(500, TRY_ON_MIN_PURCHASE) : TRY_ON_MIN_PURCHASE,
    aiVideoMinimum: workspace.videoMinPurchase ?? AI_VIDEO_MIN_PURCHASE,
    tvBillSuffixRequired: workspace.tvBillSuffixRequired ?? true,
    activeEvents: workspace.activeEvents,
    defaultEvent: workspace.defaultEvent,
  };
}
