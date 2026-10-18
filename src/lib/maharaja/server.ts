import crypto from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { NextRequest } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { applyMaharajaVideoWatermark, generateLive9sVideo } from './video-processor';
import { getLiveAudioTrack } from './audio';
import {
  AI_VIDEO_MIN_PURCHASE,
  type EventId,
  type CustomerCategory,
  type VideoPromptSet,
  MAHARAJA_CLIENT_ID,
  MAHARAJA_WORKSPACE_CODE,
  TRY_ON_MIN_PURCHASE,
  EVENT_IDS,
  isEventId,
  resolveGarmentType,
  ENFORCE_REPEAT_LIMITS,
} from './config';

export type MaharajaWorkspace = {
  clientId: typeof MAHARAJA_CLIENT_ID;
  clientName: string;
  workspaceCode: string;
  campaignEnabled: boolean;
  activeEvents: EventId[];
  defaultEvent: EventId;
  tryOnCode: string;
  billingCode: string;
  createdAt: string;
  updatedAt: string;
  usage: {
    tryOnScans: number;
    tryOnGenerated: number;
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
  clientId: typeof MAHARAJA_CLIENT_ID;
  phone: string;
  phoneMasked: string;
  billLast4: string;
  eventId: EventId;
  status: 'active' | 'used' | 'revoked' | 'expired';
  expiredReason?: string;
  createdAt: string;
  expiresAt: string;
  expiresAtMs: number;
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
  videoMasterPromptSet?: VideoPromptSet;
  videoMasterCategory?: CustomerCategory;
  videoMasterGarmentType?: string;
  rejectedMasterUrls?: string[];
  /** Active image generation ID bound to this pass to prevent in-flight race conditions. */
  activeMasterGenerationId?: string;
  imageGenerating?: boolean;
  imageGeneratingAtMs?: number;
  videoGenerating?: boolean;
  /** Epoch ms when videoGenerating was set; lets a crashed request's lock expire. */
  videoGeneratingAtMs?: number;
  videoDone?: boolean;
  retryUsed?: boolean;
  retryApproved?: boolean;
  retryApprovedAtMs?: number;
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
  used: number; // 0, 1, or 2 (maximum 2 successful outputs)
  max: 2;
  generating: boolean;
  generatingAtMs?: number;
  lastJobId?: string;
  managerAuthorized?: boolean;
};

export type CustomerCampaignEntitlement = {
  phone: string; // normalized 10 digits
  normalizedPhone?: string;
  clientId: typeof MAHARAJA_CLIENT_ID;
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
  tryOn: { used: number; max: 2; remaining: number };
  masterImage: { used: number; max: 2; remaining: number };
  video: { used: number; max: 2; remaining: number; managerAuthorized?: boolean };
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
  const tryOnUsed = Math.min(2, Math.max(0, Number(entitlement?.tryOn?.used || 0)));
  const masterImageUsed = Math.min(2, Math.max(0, Number(entitlement?.masterImage?.used || 0)));
  const videoUsed = Math.min(2, Math.max(0, Number(entitlement?.video?.used || 0)));
  return {
    tryOn: {
      used: tryOnUsed,
      max: 2,
      remaining: Math.max(0, 2 - tryOnUsed),
    },
    masterImage: {
      used: masterImageUsed,
      max: 2,
      remaining: Math.max(0, 2 - masterImageUsed),
    },
    video: {
      used: videoUsed,
      max: 2,
      remaining: Math.max(0, 2 - videoUsed),
      managerAuthorized: Boolean(entitlement?.video?.managerAuthorized),
    },
  };
}

function deviceHash(deviceId: string) {
  return crypto.createHash('sha256').update(`${MAHARAJA_CLIENT_ID}:${deviceId}`).digest('hex');
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
    const snapshot = await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID)
      .collection('tryOnDevices').doc(hash).get();
    return snapshot.exists ? snapshot.data() as MaharajaTryOnGrant : null;
  }
  return (getMockStore().tryOnGrants.get(`${MAHARAJA_CLIENT_ID}:${hash}`) as MaharajaTryOnGrant | undefined) || null;
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
  const tagHash = crypto.createHash('sha256').update(`${MAHARAJA_CLIENT_ID}:tag:${cleanId}`).digest('hex');
  const dHash = deviceHash(deviceId);
  const now = new Date().toISOString();
  const db = getDb();

  let tagRecord: any = null;
  if (db) {
    const doc = await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('scannedTags').doc(tagHash).get();
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
      await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('scannedTags').doc(tagHash).set(newRecord);
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
    await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('scannedTags').doc(tagHash).set(update, { merge: true });
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
  const tagHash = crypto.createHash('sha256').update(`${MAHARAJA_CLIENT_ID}:tag:${cleanId}`).digest('hex');
  const now = new Date().toISOString();
  const db = getDb();
  if (db) {
    await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('scannedTags').doc(tagHash).set({
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
    await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID)
      .collection('tryOnDevices').doc(grant.deviceHash).set(grant);
  } else {
    getMockStore().tryOnGrants.set(`${MAHARAJA_CLIENT_ID}:${grant.deviceHash}`, grant);
  }
  return { allowed: true as const, token, expiresAtMs: grant.expiresAtMs };
}

export async function reserveTryOnGrant(deviceId: string, token: string, sessionId: string) {
  const hash = deviceHash(deviceId);
  const db = getDb();
  if (db) {
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('tryOnDevices').doc(hash);
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
  const key = `${MAHARAJA_CLIENT_ID}:${hash}`;
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
    await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('tryOnDevices').doc(hash).set(update, { merge: true });
  } else {
    const key = `${MAHARAJA_CLIENT_ID}:${hash}`;
    const grant = getMockStore().tryOnGrants.get(key) as MaharajaTryOnGrant | undefined;
    if (grant) getMockStore().tryOnGrants.set(key, { ...grant, ...update });
  }
}

function stableCode(label: string, length = 20) {
  const secret = process.env.OPERATOR_AUTH_SECRET;
  if (!secret) {
    throw new Error('OPERATOR_AUTH_SECRET must be configured.');
  }
  return crypto.createHmac('sha256', secret).update(`${MAHARAJA_CLIENT_ID}:${label}`).digest('base64url').slice(0, length);
}

function defaultWorkspace(): MaharajaWorkspace {
  const now = new Date().toISOString();
  return {
    clientId: MAHARAJA_CLIENT_ID,
    clientName: 'Maharaja',
    workspaceCode: process.env.MAHARAJA_WORKSPACE_CODE || MAHARAJA_WORKSPACE_CODE,
    campaignEnabled: true,
    activeEvents: ['diwali'],
    defaultEvent: 'diwali',
    tryOnCode: stableCode('permanent-try-on'),
    billingCode: stableCode('billing-counter'),
    createdAt: now,
    updatedAt: now,
    usage: {
      tryOnScans: 0,
      tryOnGenerated: 0,
      videoPasses: 0,
      videosGenerated: 0,
      goLive: 0,
      retries: 0,
      downloads: 0,
    },
  };
}

function normalizeWorkspace(data: Partial<MaharajaWorkspace>, fallback: MaharajaWorkspace): MaharajaWorkspace {
  const merged = { ...fallback, ...data, usage: { ...fallback.usage, ...data.usage } };
  const defaultEv: EventId = isEventId(merged.defaultEvent) ? merged.defaultEvent : 'diwali';
  // Strictly enforce single active event (no 2-3 events at the same time), defaulting to Diwali
  const activeEv: EventId = (Array.isArray(merged.activeEvents) && merged.activeEvents.length === 1 && isEventId(merged.activeEvents[0]))
    ? merged.activeEvents[0]
    : defaultEv;
  return {
    ...merged,
    activeEvents: [activeEv],
    defaultEvent: activeEv,
  };
}

export async function getMaharajaWorkspace(): Promise<MaharajaWorkspace> {
  const fallback = defaultWorkspace();
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

export async function updateMaharajaSettings(settings: Partial<Pick<MaharajaWorkspace, 'campaignEnabled' | 'activeEvents' | 'defaultEvent'>>) {
  const workspace = await getMaharajaWorkspace();
  const updated = { ...workspace, ...settings, updatedAt: new Date().toISOString() };
  const db = getDb();
  if (db) {
    await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).set({
      ...settings,
      updatedAt: updated.updatedAt,
      updatedAtTimestamp: Timestamp.now(),
    }, { merge: true });
  } else {
    getMockStore().clientWorkspaces.set(MAHARAJA_CLIENT_ID, updated);
  }
  return updated;
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
    await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID)
      .collection('activityLogs').doc(id).set({ ...activity, createdAtTimestamp: Timestamp.now() });
  } else {
    getMockStore().activityLogs.set(`${MAHARAJA_CLIENT_ID}:${id}`, activity);
  }
  return activity;
}

export async function listMaharajaActivity(limit = 30): Promise<MaharajaActivity[]> {
  const db = getDb();
  if (db) {
    const snapshot = await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID)
      .collection('activityLogs').orderBy('createdAtTimestamp', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => doc.data() as MaharajaActivity);
  }
  return Array.from(getMockStore().activityLogs.entries())
    .filter(([key]) => key.startsWith(`${MAHARAJA_CLIENT_ID}:`))
    .map(([, value]) => value as MaharajaActivity)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function getWorkspaceLinks(origin: string, workspace: MaharajaWorkspace) {
  return {
    adminUrl: `${origin}/maharaja/${workspace.workspaceCode}`,
    tryOnUrl: `${origin}/maharaja/try-on?access=${workspace.tryOnCode}`,
    billingUrl: `${origin}/maharaja/billing/${workspace.billingCode}`,
  };
}

export async function getVideoPass(code: string): Promise<MaharajaVideoPass | null> {
  const db = getDb();
  if (db) {
    const snapshot = await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID)
      .collection('customerPasses').doc(code).get();
    if (snapshot.exists) return snapshot.data() as MaharajaVideoPass;
  } else {
    const value = getMockStore().customerPasses.get(`${MAHARAJA_CLIENT_ID}:${code}`);
    if (value && typeof value === 'object') return value as MaharajaVideoPass;
  }

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

export async function saveVideoPass(pass: MaharajaVideoPass) {
  const db = getDb();
  if (db) {
    await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID)
      .collection('customerPasses').doc(pass.code).set({
        ...pass,
        createdAtTimestamp: Timestamp.fromDate(new Date(pass.createdAt)),
        expiresAtTimestamp: Timestamp.fromDate(new Date(pass.expiresAt)),
      }, { merge: true });
  } else {
    getMockStore().customerPasses.set(`${MAHARAJA_CLIENT_ID}:${pass.code}`, pass);
  }

  // Atomically bind pass to customer's normalized mobile campaign entitlement (₹5,000+ qualifying pass)
  const phone = normalizePhoneNumber(pass.phone);
  if (phone && phone.length === 10) {
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
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID)
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
        clientId: MAHARAJA_CLIENT_ID,
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
  const key = `${MAHARAJA_CLIENT_ID}:${normalized}`;
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
    clientId: MAHARAJA_CLIENT_ID,
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
    const snap = await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID)
      .collection('campaignEntitlements').doc(normalized).get();
    if (!snap.exists) return null;
    const data = snap.data() as CustomerCampaignEntitlement;
    return { ...data, normalizedPhone: data.normalizedPhone || data.phone };
  }
  const key = `${MAHARAJA_CLIENT_ID}:${normalized}`;
  const item = getMockStore().campaignEntitlements.get(key);
  if (!item || typeof item !== 'object') return null;
  const data = item as CustomerCampaignEntitlement;
  return { ...data, normalizedPhone: data.normalizedPhone || data.phone };
}

export async function getCampaignEntitlementForPass(code: string): Promise<CustomerCampaignEntitlement | null> {
  if (!code) return null;
  // 1. Prioritize pass lookup if code corresponds to an existing customer pass
  const pass = await getVideoPass(code);
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
  const phone = await resolvePhoneFromTarget(phoneOrCode);
  if (!phone) {
    return { ok: true, generationId: options?.generationId };
  }

  const db = getDb();
  const now = Date.now();
  const serviceKey = service === 'try-on' ? 'tryOn' : (service === 'master-image' ? 'masterImage' : 'video');
  const serviceLabel = service === 'try-on' ? 'AI Try-On' : (service === 'master-image' ? 'Celebration Gemini Master Image' : 'H3 Cinematic Video');

  if (db) {
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID)
      .collection('campaignEntitlements').doc(phone);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      let entitlement: CustomerCampaignEntitlement;
      if (!snap.exists) {
        entitlement = {
          phone,
          clientId: MAHARAJA_CLIENT_ID,
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
      if (Number(counter.used || 0) >= 2) {
        return {
          ok: false,
          error: `${serviceLabel} allowance exhausted (2/2 completed). Maximum 2 generations reached for this customer mobile number.`,
        };
      }

      if (service === 'video' && Number(counter.used || 0) === 1 && !counter.managerAuthorized) {
        return {
          ok: false,
          error: 'H3 Cinematic Video retry requires manager authorization.',
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
  const key = `${MAHARAJA_CLIENT_ID}:${phone}`;
  let entitlement = store.campaignEntitlements.get(key) as CustomerCampaignEntitlement | undefined;
  if (!entitlement) {
    entitlement = {
      phone,
      clientId: MAHARAJA_CLIENT_ID,
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
  if (Number(counter.used || 0) >= 2) {
    return {
      ok: false,
      error: `${serviceLabel} allowance exhausted (2/2 completed). Maximum 2 generations reached for this customer mobile number.`,
    };
  }

  if (service === 'video' && Number(counter.used || 0) === 1 && !counter.managerAuthorized) {
    return {
      ok: false,
      error: 'H3 Cinematic Video retry requires manager authorization.',
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
  const phone = await resolvePhoneFromTarget(phoneOrCode);
  if (!phone) return;

  const serviceKey = service === 'try-on' ? 'tryOn' : (service === 'master-image' ? 'masterImage' : 'video');
  const db = getDb();
  const nowIso = new Date().toISOString();

  if (db) {
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID)
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
  const key = `${MAHARAJA_CLIENT_ID}:${phone}`;
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
): Promise<{ used: number; max: 2; exhausted: boolean }> {
  const phone = await resolvePhoneFromTarget(phoneOrCode);
  if (!phone) return { used: 1, max: 2, exhausted: false };

  const serviceKey = service === 'try-on' ? 'tryOn' : (service === 'master-image' ? 'masterImage' : 'video');
  const db = getDb();
  const nowIso = new Date().toISOString();

  if (db) {
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID)
      .collection('campaignEntitlements').doc(phone);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      let entitlement: CustomerCampaignEntitlement;
      if (!snap.exists) {
        entitlement = {
          phone,
          clientId: MAHARAJA_CLIENT_ID,
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
      const nextUsed = Math.min(2, (Number(counter.used) || 0) + 1);
      const updatedCounter: ServiceAllowanceCounter = {
        ...counter,
        used: nextUsed,
        max: 2,
        generating: false,
        ...(service === 'video' ? { managerAuthorized: false } : {}),
      };

      tx.set(ref, {
        ...entitlement,
        [serviceKey]: updatedCounter,
        updatedAt: nowIso,
      }, { merge: true });

      return { used: nextUsed, max: 2, exhausted: nextUsed >= 2 };
    });
  }

  const store = getMockStore();
  const key = `${MAHARAJA_CLIENT_ID}:${phone}`;
  let entitlement = store.campaignEntitlements.get(key) as CustomerCampaignEntitlement | undefined;
  if (!entitlement) {
    entitlement = {
      phone,
      clientId: MAHARAJA_CLIENT_ID,
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
  const nextUsed = Math.min(2, (Number(counter.used) || 0) + 1);
  const updatedCounter: ServiceAllowanceCounter = {
    ...counter,
    used: nextUsed,
    max: 2,
    generating: false,
    ...(service === 'video' ? { managerAuthorized: false } : {}),
  };

  store.campaignEntitlements.set(key, {
    ...entitlement,
    [serviceKey]: updatedCounter,
    updatedAt: nowIso,
  });

  return { used: nextUsed, max: 2, exhausted: nextUsed >= 2 };
}

export async function authorizeVideoRetry(phoneOrCode: string): Promise<{ success: boolean; ok: boolean; error?: string }> {
  const phone = await resolvePhoneFromTarget(phoneOrCode);
  if (!phone) return { success: false, ok: false, error: 'Customer phone entitlement not found.' };

  const db = getDb();
  const nowIso = new Date().toISOString();

  if (db) {
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID)
      .collection('campaignEntitlements').doc(phone);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { success: false, ok: false, error: 'Customer entitlement not found.' };
      const entitlement = snap.data() as CustomerCampaignEntitlement;
      if (Number(entitlement.video?.used || 0) >= 2) {
        return {
          success: false,
          ok: false,
          error: 'H3 Cinematic Video allowance exhausted (2/2 completed). Maximum 2 generations reached for this customer mobile number.',
        };
      }
      tx.set(ref, {
        ...entitlement,
        video: {
          ...entitlement.video,
          managerAuthorized: true,
        },
        updatedAt: nowIso,
      }, { merge: true });
      return { success: true, ok: true };
    });
  }

  const store = getMockStore();
  const key = `${MAHARAJA_CLIENT_ID}:${phone}`;
  const entitlement = store.campaignEntitlements.get(key) as CustomerCampaignEntitlement | undefined;
  if (!entitlement) return { success: false, ok: false, error: 'Customer entitlement not found.' };
  if (Number(entitlement.video?.used || 0) >= 2) {
    return {
      success: false,
      ok: false,
      error: 'H3 Cinematic Video allowance exhausted (2/2 completed). Maximum 2 generations reached for this customer mobile number.',
    };
  }
  store.campaignEntitlements.set(key, {
    ...entitlement,
    video: {
      ...entitlement.video,
      managerAuthorized: true,
    },
    updatedAt: nowIso,
  });

  // Also update customer pass if phoneOrCode is a pass code or resolves to an active pass
  const pass = await getVideoPass(phoneOrCode);
  if (pass) {
    await mergePassUpdate(pass.code, {
      retryApproved: true,
      videoDone: false,
      videoGenerating: false,
      status: 'active',
    });
  }

  return { success: true, ok: true };
}

export async function expireActivePassesForPhone(phone: string, excludeCode?: string): Promise<number> {
  const db = getDb();
  if (db) {
    const snapshot = await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID)
      .collection('customerPasses')
      .where('phone', '==', phone)
      .where('status', '==', 'active')
      .get();
    if (snapshot.empty) return 0;

    const batch = db.batch();
    let count = 0;
    const nowIso = new Date().toISOString();
    snapshot.docs.forEach((doc) => {
      if (!excludeCode || doc.id !== excludeCode) {
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
    if (key.startsWith(`${MAHARAJA_CLIENT_ID}:`)) {
      const p = rawPass as MaharajaVideoPass;
      if (p.phone === phone && p.status === 'active' && (!excludeCode || p.code !== excludeCode)) {
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
    const snapshot = await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID)
      .collection('customerPasses').orderBy('createdAtTimestamp', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => doc.data() as MaharajaVideoPass);
  }
  return Array.from(getMockStore().customerPasses.entries())
    .filter(([key]) => key.startsWith(`${MAHARAJA_CLIENT_ID}:`))
    .map(([, value]) => value as MaharajaVideoPass)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function incrementMaharajaUsage(field: keyof MaharajaWorkspace['usage']) {
  const db = getDb();
  if (db) {
    await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).set({
      [`usage.${field}`]: FieldValue.increment(1),
      updatedAt: new Date().toISOString(),
      updatedAtTimestamp: Timestamp.now(),
    }, { merge: true });
    return;
  }
  const workspace = await getMaharajaWorkspace();
  getMockStore().clientWorkspaces.set(MAHARAJA_CLIENT_ID, {
    ...workspace,
    usage: { ...workspace.usage, [field]: Number(workspace.usage[field] || 0) + 1 },
  });
}

export async function incrementPassUsage(code: string, field: keyof MaharajaVideoPass['usage']) {
  const db = getDb();
  if (db) {
    await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID)
      .collection('customerPasses').doc(code).set({
        [`usage.${field}`]: FieldValue.increment(1),
      }, { merge: true });
    return;
  }
  const pass = await getVideoPass(code);
  if (pass) {
    getMockStore().customerPasses.set(`${MAHARAJA_CLIENT_ID}:${code}`, {
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
    await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID)
      .collection('customerPasses').doc(code).set({
        ...update,
        usedAtTimestamp: Timestamp.now(),
      }, { merge: true });
  } else {
    const pass = getMockStore().customerPasses.get(`${MAHARAJA_CLIENT_ID}:${code}`) as MaharajaVideoPass | undefined;
    if (pass) {
      getMockStore().customerPasses.set(`${MAHARAJA_CLIENT_ID}:${code}`, {
        ...pass,
        status: 'used',
      });
    }
  }
}

async function mergePassUpdate(code: string, update: Partial<MaharajaVideoPass>) {
  const db = getDb();
  if (db) {
    await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID)
      .collection('customerPasses').doc(code).set(update, { merge: true });
  } else {
    const pass = getMockStore().customerPasses.get(`${MAHARAJA_CLIENT_ID}:${code}`) as MaharajaVideoPass | undefined;
    if (pass) {
      getMockStore().customerPasses.set(`${MAHARAJA_CLIENT_ID}:${code}`, { ...pass, ...update });
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
  meta?: { promptSet?: VideoPromptSet; category?: CustomerCategory; garmentType?: string },
  generationId?: string
) {
  const db = getDb();
  if (db) {
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('customerPasses').doc(code);
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
        videoMasterApproved: false, // Image completed is NOT approved yet
        videoMasterApprovedUrl: '',
        imageGenerating: false,
        activeMasterGenerationId: FieldValue.delete(),
      };
      if (meta?.promptSet) updateData.videoMasterPromptSet = meta.promptSet;
      if (cat) updateData.videoMasterCategory = cat;
      if (garment) updateData.videoMasterGarmentType = garment;
      tx.update(ref, updateData);
    });
    await recordServiceGenerationSuccess(code, 'master-image', { url: videoMasterUrl });
    return;
  }
  const key = `${MAHARAJA_CLIENT_ID}:${code}`;
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
    if (meta?.promptSet) passCopy.videoMasterPromptSet = meta.promptSet;
    if (cat) passCopy.videoMasterCategory = cat;
    if (garment) passCopy.videoMasterGarmentType = garment;
    getMockStore().customerPasses.set(key, passCopy);
    await recordServiceGenerationSuccess(code, 'master-image', { url: videoMasterUrl });
  }
}

export async function approvePassVideoMaster(code: string, approvedUrl?: string) {
  const db = getDb();
  if (db) {
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('customerPasses').doc(code);
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
    const key = `${MAHARAJA_CLIENT_ID}:${code}`;
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
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('customerPasses').doc(code);
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
    const key = `${MAHARAJA_CLIENT_ID}:${code}`;
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
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('customerPasses').doc(code);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return false;
      const pass = snapshot.data() as MaharajaVideoPass;
      if (pass.whatsappDeliveryStatus === 'sending' || pass.whatsappDeliveryStatus === 'sent') return false;
      transaction.set(ref, { whatsappDeliveryStatus: 'sending' }, { merge: true });
      return true;
    });
  }
  const key = `${MAHARAJA_CLIENT_ID}:${code}`;
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
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('customerPasses').doc(code);
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
  const key = `${MAHARAJA_CLIENT_ID}:${code}`;
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
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('customerPasses').doc(code);
    await ref.update({
      videoGenerating: false,
      providerAccepted: false,
      activeVideoJobId: FieldValue.delete(),
    });
  } else {
    const key = `${MAHARAJA_CLIENT_ID}:${code}`;
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
  if (db) {
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('customerPasses').doc(code);
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
        lastVideoFailed: true,
        lastVideoFailedAtMs: Date.now(),
        activeVideoJobId: FieldValue.delete(),
      });
    });
  } else {
    const key = `${MAHARAJA_CLIENT_ID}:${code}`;
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
        lastVideoFailed: true,
        lastVideoFailedAtMs: Date.now(),
      };
      delete (copy as any).activeVideoJobId;
      getMockStore().customerPasses.set(key, copy);
    }
  }

  // Exactly-once accounting: failed provider call does NOT consume allowance
  await releaseServiceGenerationLock(code, 'video', { jobId });
}

/**
 * Retry approval, enforced server-side.
 * Enforces independent 2-generation ceiling per service (original + retry).
 */
export async function markPassRetryApproved(
  code: string,
  target: 'image' | 'video' = 'video',
  service: 'try-on' | 'ai-video' = 'ai-video'
) {
  const entitlement = await getCampaignEntitlementForPass(code);
  const allowances = getCustomerServiceAllowances(entitlement);

  if (target === 'video') {
    if (allowances.video.used >= 2) {
      throw new Error('H3 Cinematic Video allowance exhausted (2/2 completed). Maximum 2 generations reached for this customer mobile number.');
    }
    await authorizeVideoRetry(code);
  } else if (target === 'image') {
    if (service === 'try-on') {
      if (allowances.tryOn.used >= 2) {
        throw new Error('AI Try-On allowance exhausted (2/2 completed). Maximum 2 generations reached for this customer mobile number.');
      }
    } else {
      if (allowances.masterImage.used >= 2) {
        throw new Error('Celebration Gemini Master Image allowance exhausted (2/2 completed). Maximum 2 generations reached for this customer mobile number.');
      }
    }
  }

  const db = getDb();
  const updates: Record<string, any> = {
    retryUsed: true,
    retryApproved: true,
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
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('customerPasses').doc(code);
    await ref.update({
      ...updates,
      activeVideoJobId: FieldValue.delete(),
    });
    return;
  }
  const key = `${MAHARAJA_CLIENT_ID}:${code}`;
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
  accessCode,
  clientId = MAHARAJA_CLIENT_ID,
  eventId = 'diwali',
}: {
  sessionId: string;
  jobId: string;
  outputVideoUrl: string;
  accessCode?: string | null;
  clientId?: string;
  eventId?: string;
}): Promise<{ success: true; videoUrl: string; liveVideoUrl?: string; storagePath: string; liveStoragePath?: string } | { success: false; error: string }> {
  const db = getDb();

  let fileBuffer: Buffer | null = null;
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

  const storagePath = clientId
    ? `clients/${clientId}/sessions/${sessionId}/video/final.mp4`
    : `sessions/${sessionId}/video/final.mp4`;
  const liveStoragePath = clientId
    ? `clients/${clientId}/sessions/${sessionId}/video/live_9s.mp4`
    : `sessions/${sessionId}/video/live_9s.mp4`;
  const bucket = getStorageBucket();

  if (!bucket || !fileBuffer) {
    const errMessage = 'The completed video could not be saved to Maharaja media storage. The video slot has been restored.';
    if (accessCode) await markPassVideoFailed(accessCode, jobId);
    return { success: false, error: errMessage };
  }

  try {
    // 1. Permanently watermark the 6-second video with the Maharaja official circular logo
    const watermarkedBuffer = await applyMaharajaVideoWatermark(fileBuffer);

    // 2. Generate the authentic 9-second showroom video with embedded live soundtrack and logo
    const liveAudioTrack = getLiveAudioTrack(sessionId, eventId);
    const live9sBuffer = await generateLive9sVideo(fileBuffer, liveAudioTrack);

    const file = bucket.file(storagePath);
    await file.save(watermarkedBuffer, { contentType: 'video/mp4', public: false });
    const [exists] = await file.exists();
    if (!exists) throw new Error('Storage did not confirm the completed MP4.');
    const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 24 * 60 * 60 * 1000 });

    let liveSignedUrl = signedUrl;
    try {
      const liveFile = bucket.file(liveStoragePath);
      await liveFile.save(live9sBuffer, { contentType: 'video/mp4', public: false });
      const [liveExists] = await liveFile.exists();
      if (liveExists) {
        const [lUrl] = await liveFile.getSignedUrl({ action: 'read', expires: Date.now() + 24 * 60 * 60 * 1000 });
        liveSignedUrl = lUrl;
      }
    } catch (liveErr) {
      console.warn('Live 9s video save warning, using 6s fallback:', liveErr);
    }

    if (db) {
      await Promise.all([
        db.collection('videos').doc(`video_${sessionId}`).set({
          id: `video_${sessionId}`,
          sessionId,
          storagePath,
          liveStoragePath,
          status: 'ready',
          provider: 'fal-h3-max-turbo',
          createdAt: new Date().toISOString(),
        }, { merge: true }),
        db.collection('sessions').doc(sessionId).set({
          videoStatus: 'ready',
          videoUrl: signedUrl,
          videoStoragePath: storagePath,
          liveVideoUrl: liveSignedUrl,
          liveStoragePath,
          updatedAt: new Date().toISOString(),
        }, { merge: true }),
      ]);
    } else {
      const mockStore = getMockStore();
      mockStore.videos.set(`video_${sessionId}`, {
        id: `video_${sessionId}`,
        sessionId,
        storagePath,
        liveStoragePath,
        status: 'ready',
        provider: 'fal-h3-max-turbo',
        createdAt: new Date().toISOString(),
      });
      const session = mockStore.sessions.get(sessionId) || {};
      mockStore.sessions.set(sessionId, {
        ...session,
        videoStatus: 'ready',
        videoUrl: signedUrl,
        videoStoragePath: storagePath,
        liveVideoUrl: liveSignedUrl,
        liveStoragePath,
        updatedAt: new Date().toISOString(),
      });
    }

    if (accessCode) {
      await markPassVideoReady(accessCode, jobId);
    }
    await logMaharajaActivity('video-ready', `${eventId} AI Video ready`, { sessionId, jobId });

    return { success: true, videoUrl: signedUrl, liveVideoUrl: liveSignedUrl, storagePath, liveStoragePath };
  } catch (stSaveErr: any) {
    console.error('Finalize completed video storage save failed:', stSaveErr);
    const errMessage = 'The completed video could not be saved to Maharaja media storage. The video slot has been restored.';
    if (accessCode) await markPassVideoFailed(accessCode, jobId);
    return { success: false, error: errMessage };
  }
}

export async function markTryOnDeviceRetryApproved(deviceId: string) {
  const hash = deviceHash(deviceId);
  const db = getDb();
  const update = {
    status: 'active' as const,
    retryUsed: true,
    expiresAtMs: Date.now() + 30 * 60 * 1000,
  };
  if (db) {
    await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('tryOnDevices').doc(hash).set(update, { merge: true });
    return;
  }
  const key = `${MAHARAJA_CLIENT_ID}:${hash}`;
  const grant = getMockStore().tryOnGrants.get(key) as MaharajaTryOnGrant | undefined;
  if (grant) {
    getMockStore().tryOnGrants.set(key, { ...grant, ...update });
  }
}

const IMAGE_LOCK_STALE_MS = 90 * 1000;

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
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('customerPasses').doc(code);
    await db.runTransaction(async (tx) => {
      tx.update(ref, lockUpdate);
    });
    return { ok: true, generationId: boundGenId };
  }

  const key = `${MAHARAJA_CLIENT_ID}:${code}`;
  const existingPass = getMockStore().customerPasses.get(key) as MaharajaVideoPass | undefined;
  if (existingPass) {
    getMockStore().customerPasses.set(key, { ...existingPass, ...lockUpdate });
  }
  return { ok: true, generationId: boundGenId };
}

export async function releasePassImageLock(code: string, generationId?: string): Promise<void> {
  const db = getDb();
  if (db) {
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('customerPasses').doc(code);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const pass = snap.data() as MaharajaVideoPass;
      if (generationId && pass.activeMasterGenerationId !== generationId) {
        return;
      }
      tx.update(ref, { imageGenerating: false, activeMasterGenerationId: FieldValue.delete() });
    });
  } else {
    const key = `${MAHARAJA_CLIENT_ID}:${code}`;
    const pass = getMockStore().customerPasses.get(key) as MaharajaVideoPass | undefined;
    if (pass) {
      if (!generationId || pass.activeMasterGenerationId === generationId) {
        getMockStore().customerPasses.set(key, { ...pass, imageGenerating: false, activeMasterGenerationId: undefined });
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
  if (pass.videoDone && !pass.retryApproved) {
    return { ok: false, error: 'This pass has already completed video generation. Store manager authorization is required to start a retry.' };
  }
  if (pass.videoDone && pass.retryUsed) {
    return { ok: false, error: 'This pass has already completed video generation and used its retry allowance.' };
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
 * Enforces server-side phone entitlement limits (max 2: 1 original + 1 manager-authorized retry).
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

  if (db) {
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('customerPasses').doc(code);
    await db.runTransaction(async (tx) => {
      tx.update(ref, lockUpdate);
    });
    return { ok: true };
  }

  const key = `${MAHARAJA_CLIENT_ID}:${code}`;
  const existingPass = getMockStore().customerPasses.get(key) as MaharajaVideoPass | undefined;
  if (existingPass) {
    getMockStore().customerPasses.set(key, { ...existingPass, ...lockUpdate });
  }
  return { ok: true };
}

export async function verifyMaharajaAccess(
  req: NextRequest,
  accessCode: unknown,
  service: 'try-on' | 'ai-video'
) {
  const code = typeof accessCode === 'string' ? accessCode.trim() : '';
  const workspace = await getMaharajaWorkspace();
  if (!workspace.campaignEnabled) return { allowed: false as const, error: 'Maharaja campaign is currently paused.' };

  // 1. Resolve entitlement and pass by normalized phone number or QR code
  const cleanPhone = normalizePhoneNumber(code);
  let entitlement: CustomerCampaignEntitlement | null = null;
  let pass: MaharajaVideoPass | null = null;

  if (cleanPhone.length === 10) {
    entitlement = await getCampaignEntitlementByPhone(cleanPhone);
    if (entitlement && entitlement.passCodes.length > 0) {
      const latestCode = entitlement.passCodes[entitlement.passCodes.length - 1];
      pass = await getVideoPass(latestCode);
    }
  }

  if (!pass && code) {
    pass = await getVideoPass(code);
    if (pass?.phone) {
      entitlement = await getCampaignEntitlementForPass(code);
    }
  }

  const allowances = getCustomerServiceAllowances(entitlement);

  if (service === 'try-on') {
    // The permanent Try-On QR is a capability.
    if (code === workspace.tryOnCode) {
      return { allowed: true as const, clientId: MAHARAJA_CLIENT_ID, pass: null, workspace, entitlement, allowances };
    }
    if (pass) {
      if (pass.expiresAtMs < Date.now()) {
        return { allowed: false as const, error: 'This Maharaja AI experience link has expired. Please contact the billing counter.' };
      }
      return { allowed: true as const, clientId: MAHARAJA_CLIENT_ID, pass, workspace, entitlement, allowances };
    }
    return (req?.headers && verifyOperatorRequest(req))
      ? { allowed: true as const, clientId: MAHARAJA_CLIENT_ID, pass: null, workspace, entitlement, allowances }
      : { allowed: false as const, error: 'This Maharaja Try-On QR is invalid or expired. Please scan the Maharaja QR again.' };
  }

  // service === 'ai-video'
  if (pass && pass.clientId === MAHARAJA_CLIENT_ID) {
    if (pass.expiresAtMs < Date.now()) {
      return { allowed: false as const, error: 'This Maharaja AI experience link has expired. Please contact the billing counter.' };
    }
    // Note: Do not block access if pass has completed video (pass.status === 'used' or videoDone);
    // customer retains the right to view, download, or claim an authorized retry.
    return { allowed: true as const, clientId: MAHARAJA_CLIENT_ID, pass, workspace, entitlement, allowances };
  }

  if (entitlement) {
    return { allowed: true as const, clientId: MAHARAJA_CLIENT_ID, pass, workspace, entitlement, allowances };
  }

  return (req?.headers && verifyOperatorRequest(req))
    ? { allowed: true as const, clientId: MAHARAJA_CLIENT_ID, pass: null, workspace, entitlement, allowances }
    : { allowed: false as const, error: 'This Maharaja AI Video pass is invalid or expired.' };
}

export function publicWorkspaceView(workspace: MaharajaWorkspace) {
  return {
    clientId: workspace.clientId,
    clientName: workspace.clientName,
    campaignEnabled: workspace.campaignEnabled,
    tryOnMinimum: TRY_ON_MIN_PURCHASE,
    aiVideoMinimum: AI_VIDEO_MIN_PURCHASE,
    activeEvents: workspace.activeEvents,
    defaultEvent: workspace.defaultEvent,
  };
}
