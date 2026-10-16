import crypto from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { NextRequest } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import {
  AI_VIDEO_MIN_PURCHASE,
  type EventId,
  MAHARAJA_CLIENT_ID,
  MAHARAJA_WORKSPACE_CODE,
  TRY_ON_MIN_PURCHASE,
  EVENT_IDS,
  isEventId,
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
  type: 'campaign' | 'video-pass' | 'price-scan' | 'duplicate-tag-scan' | 'try-on' | 'video' | 'go-live' | 'retry' | 'download' | 'share' | 'qr-download';
  label: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean | null>;
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
  videoGenerating?: boolean;
  /** Epoch ms when videoGenerating was set; lets a crashed request's lock expire. */
  videoGeneratingAtMs?: number;
  videoDone?: boolean;
  retryUsed?: boolean;
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
};

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
      isDuplicate: true,
      duplicateType: 'same_device',
      scannedCount: updatedScanCount,
      firstScannedAt: tagRecord.firstScannedAt,
      previousAmount: tagRecord.amount,
    };
  }

  if (isUsed) {
    return {
      isDuplicate: true,
      duplicateType: 'different_device_used',
      scannedCount: updatedScanCount,
      firstScannedAt: tagRecord.firstScannedAt,
      previousAmount: tagRecord.amount,
    };
  }

  return {
    isDuplicate: true,
    duplicateType: 'different_device_active',
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
  const existing = await getTryOnDeviceStatus(deviceId);
  if (existing?.status === 'used') {
    return { allowed: false as const, error: 'This device has already completed its Maharaja AI Try-On.' };
  }
  if (existing?.status === 'processing') return { allowed: false as const, error: 'A Try-On is already being generated on this device.' };
  
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
      if (grant.status === 'used') return { allowed: false as const, error: 'This device has already completed its Maharaja AI Try-On.' };
      if (grant.status === 'processing' && grant.sessionId !== sessionId) return { allowed: false as const, error: 'A Try-On is already being generated on this device.' };
      transaction.set(ref, { status: 'processing', sessionId }, { merge: true });
      return { allowed: true as const };
    });
  }
  const key = `${MAHARAJA_CLIENT_ID}:${hash}`;
  const grant = getMockStore().tryOnGrants.get(key) as MaharajaTryOnGrant | undefined;
  if (!grant || grant.tokenHash !== grantTokenHash(token) || grant.expiresAtMs < Date.now()) return { allowed: false as const, error: 'Scan the price tag again to start Try-On.' };
  if (grant.status === 'used') return { allowed: false as const, error: 'This device has already completed its Maharaja AI Try-On.' };
  if (grant.status === 'processing' && grant.sessionId !== sessionId) return { allowed: false as const, error: 'A Try-On is already being generated on this device.' };
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

export async function clearTryOnGrants() {
  const db = getDb();
  if (db) {
    const snapshot = await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('tryOnDevices').get();
    for (let index = 0; index < snapshot.docs.length; index += 400) {
      const batch = db.batch();
      snapshot.docs.slice(index, index + 400).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
    return snapshot.size;
  }
  const store = getMockStore();
  const keys = Array.from(store.tryOnGrants.keys()).filter((key) => key.startsWith(`${MAHARAJA_CLIENT_ID}:`));
  keys.forEach((key) => store.tryOnGrants.delete(key));
  return keys.length;
}

function stableCode(label: string, length = 20) {
  const secret = process.env.OPERATOR_AUTH_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('OPERATOR_AUTH_SECRET or ADMIN_PASSWORD must be configured in production environment variables.');
    }
    return crypto.createHmac('sha256', 'maharaja-local-dev-secret-only').update(`${MAHARAJA_CLIENT_ID}:${label}`).digest('base64url').slice(0, length);
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
    return snapshot.exists ? snapshot.data() as MaharajaVideoPass : null;
  }
  const value = getMockStore().customerPasses.get(`${MAHARAJA_CLIENT_ID}:${code}`);
  return value && typeof value === 'object' ? value as MaharajaVideoPass : null;
}

export async function saveVideoPass(pass: MaharajaVideoPass) {
  const db = getDb();
  if (db) {
    await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID)
      .collection('customerPasses').doc(pass.code).create({
        ...pass,
        createdAtTimestamp: Timestamp.fromDate(new Date(pass.createdAt)),
        expiresAtTimestamp: Timestamp.fromDate(new Date(pass.expiresAt)),
      });
  } else {
    getMockStore().customerPasses.set(`${MAHARAJA_CLIENT_ID}:${pass.code}`, pass);
  }
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
  await mergePassUpdate(code, { tryOnImageDone: true, tryOnImageUrl });
}

export async function markPassVideoMasterDone(code: string, videoMasterUrl: string) {
  await mergePassUpdate(code, { videoMasterDone: true, videoMasterUrl });
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
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return;
      const pass = snapshot.data() as MaharajaVideoPass;
      if (!jobId || !pass.activeVideoJobId || pass.activeVideoJobId !== jobId) {
        console.warn(`Ignoring video ready from non-active job ${jobId}; active job is ${pass.activeVideoJobId || 'none'}`);
        return;
      }
      tx.update(ref, {
        videoDone: true,
        videoGenerating: false,
        providerAccepted: false,
        lastVideoFailed: false,
        activeVideoJobId: FieldValue.delete(),
      });
    });
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
    return;
  }
  const key = `${MAHARAJA_CLIENT_ID}:${code}`;
  const pass = getMockStore().customerPasses.get(key) as MaharajaVideoPass | undefined;
  if (pass) {
    const copy = { ...pass, videoGenerating: false, providerAccepted: false };
    delete (copy as any).activeVideoJobId;
    getMockStore().customerPasses.set(key, copy);
  }
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
    return;
  }
  const key = `${MAHARAJA_CLIENT_ID}:${code}`;
  const pass = getMockStore().customerPasses.get(key) as MaharajaVideoPass | undefined;
  if (!pass) return;
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

/**
 * Manager retry approval, enforced entirely server-side (no client-sent isRetry flag).
 * Allowed only after a completed first video and only once per pass.
 */
export async function markPassRetryApproved(code: string) {
  const db = getDb();
  if (db) {
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('customerPasses').doc(code);
    await ref.update({
      retryUsed: true,
      videoDone: false,
      videoGenerating: false,
      providerAccepted: false,
      activeVideoJobId: FieldValue.delete(),
    });
    return;
  }
  const key = `${MAHARAJA_CLIENT_ID}:${code}`;
  const pass = getMockStore().customerPasses.get(key) as MaharajaVideoPass | undefined;
  if (pass) {
    const copy = {
      ...pass,
      retryUsed: true,
      videoDone: false,
      videoGenerating: false,
      providerAccepted: false,
    };
    delete (copy as any).activeVideoJobId;
    getMockStore().customerPasses.set(key, copy);
  }
}

const VIDEO_LOCK_STALE_MS = 3 * 60 * 1000;

type VideoLockResult = { ok: true } | { ok: false; error: string };

function evaluateVideoLock(pass: MaharajaVideoPass | undefined | null, now: number): VideoLockResult {
  if (!pass) return { ok: false, error: 'This Maharaja AI Video pass is invalid or expired.' };
  if (pass.videoDone) {
    return { ok: false, error: 'This billing pass has already completed its AI Video. Ask the manager if a retry is required.' };
  }
  if (!pass.videoMasterDone || !pass.videoMasterUrl) {
    return { ok: false, error: 'Create the AI Video image first, then generate the video.' };
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
 * Atomically claims the single video slot of a billing pass before any provider call,
 * so a double-click or a second tab cannot reach the provider twice.
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
  if (db) {
    const ref = db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID).collection('customerPasses').doc(code);
    return db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const result = evaluateVideoLock(snapshot.exists ? snapshot.data() as MaharajaVideoPass : null, now);
      if (result.ok) tx.update(ref, lockUpdate);
      return result;
    });
  }
  // Mock store: check-and-set with no await in between is atomic on the single JS thread.
  const key = `${MAHARAJA_CLIENT_ID}:${code}`;
  const pass = getMockStore().customerPasses.get(key) as MaharajaVideoPass | undefined;
  const result = evaluateVideoLock(pass, now);
  if (result.ok && pass) getMockStore().customerPasses.set(key, { ...pass, ...lockUpdate });
  return result;
}

export async function verifyMaharajaAccess(
  req: NextRequest,
  accessCode: unknown,
  service: 'try-on' | 'ai-video'
) {
  const code = typeof accessCode === 'string' ? accessCode.trim() : '';
  const workspace = await getMaharajaWorkspace();
  if (!workspace.campaignEnabled) return { allowed: false as const, error: 'Maharaja campaign is currently paused.' };

  if (service === 'try-on') {
    if (code && code === workspace.tryOnCode) {
      return { allowed: true as const, clientId: MAHARAJA_CLIENT_ID, pass: null, workspace };
    }
    const videoPass = code ? await getVideoPass(code) : null;
    if (videoPass) {
      if (videoPass.status === 'used') {
        return { allowed: false as const, error: 'This AI Video has been completed.' };
      }
      if (videoPass.expiresAtMs < Date.now()) {
        return { allowed: false as const, error: 'This Maharaja AI experience link has expired. Please contact the billing counter.' };
      }
      if (videoPass.status === 'active') {
        return { allowed: true as const, clientId: MAHARAJA_CLIENT_ID, pass: videoPass, workspace };
      }
    }
    return verifyOperatorRequest(req)
      ? { allowed: true as const, clientId: MAHARAJA_CLIENT_ID, pass: null, workspace }
      : { allowed: false as const, error: 'Invalid Maharaja Try-On access.' };
  }

  const pass = code ? await getVideoPass(code) : null;
  if (pass && pass.clientId === MAHARAJA_CLIENT_ID) {
    if (pass.status === 'used') {
      return { allowed: false as const, error: 'This AI Video has been completed.' };
    }
    if (pass.status === 'expired') {
      return { allowed: false as const, error: 'This QR code was replaced by a retry at the billing counter. Please scan the newest QR code.' };
    }
    if (pass.expiresAtMs < Date.now()) {
      return { allowed: false as const, error: 'This Maharaja AI experience link has expired. Please contact the billing counter.' };
    }
    if (pass.status === 'active') {
      return { allowed: true as const, clientId: MAHARAJA_CLIENT_ID, pass, workspace };
    }
  }
  return verifyOperatorRequest(req)
    ? { allowed: true as const, clientId: MAHARAJA_CLIENT_ID, pass: null, workspace }
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
