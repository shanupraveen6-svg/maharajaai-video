import crypto from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { NextRequest } from 'next/server';
import { verifyOperatorRequest } from '@/lib/auth/operator';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import {
  AI_VIDEO_MIN_PURCHASE,
  EventId,
  MAHARAJA_CLIENT_ID,
  MAHARAJA_WORKSPACE_CODE,
  TRY_ON_MIN_PURCHASE,
  MAX_TRY_ON_RETRIES,
  EVENT_IDS,
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
  type: 'campaign' | 'video-pass' | 'try-on' | 'video' | 'go-live' | 'retry' | 'download' | 'qr-download';
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
  status: 'active' | 'used' | 'revoked';
  createdAt: string;
  expiresAt: string;
  expiresAtMs: number;
  usage: { scans: number; imagesGenerated: number; videosGenerated: number; goLive: number };
};

export type MaharajaTryOnGrant = {
  deviceHash: string;
  tokenHash: string;
  status: 'active' | 'processing' | 'generated' | 'used';
  amount: number;
  retriesCount?: number;
  createdAt: string;
  expiresAtMs: number;
  sessionId?: string;
  masterImageUrl?: string;
  completedAt?: string;
  downloadedAt?: string;
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

export async function isPriceTagUsed(tagFingerprint: string): Promise<boolean> {
  const db = getDb();
  if (db) {
    const doc = await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID)
      .collection('usedPriceTags').doc(tagFingerprint).get();
    return doc.exists;
  }
  const store = getMockStore() as any;
  return !!(store.usedPriceTags && store.usedPriceTags.has(tagFingerprint));
}

export async function recordPriceTagUsed(tagFingerprint: string, deviceId: string, amount: number): Promise<void> {
  const db = getDb();
  const nowIso = new Date().toISOString();
  if (db) {
    await db.collection('clientWorkspaces').doc(MAHARAJA_CLIENT_ID)
      .collection('usedPriceTags').doc(tagFingerprint).set({
        tagFingerprint,
        deviceId,
        amount,
        usedAt: nowIso,
        usedAtTimestamp: Timestamp.now(),
      });
    return;
  }
  const store = getMockStore() as any;
  if (!store.usedPriceTags) store.usedPriceTags = new Map<string, unknown>();
  store.usedPriceTags.set(tagFingerprint, { tagFingerprint, deviceId, amount, usedAt: nowIso });
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

export async function issueTryOnGrant(deviceId: string, amount: number) {
  const existing = await getTryOnDeviceStatus(deviceId);
  if (existing?.status === 'used') {
    return { allowed: false as const, error: 'This device has already completed its Maharaja AI Try-On.' };
  }
  if (existing?.status === 'processing') return { allowed: false as const, error: 'A Try-On is already being generated on this device.' };
  
  const isRetry = existing?.status === 'generated';
  const currentRetries = existing?.retriesCount || 0;
  if (isRetry && currentRetries >= MAX_TRY_ON_RETRIES) {
    return {
      allowed: false as const,
      error: `You have reached the maximum limit of ${MAX_TRY_ON_RETRIES} retries for this Try-On. Download your image to complete your session.`,
    };
  }

  const nextRetriesCount = isRetry ? currentRetries + 1 : currentRetries;
  const token = crypto.randomBytes(24).toString('base64url');
  const now = Date.now();
  const grant: MaharajaTryOnGrant = {
    deviceHash: deviceHash(deviceId),
    tokenHash: grantTokenHash(token),
    status: 'active',
    amount,
    retriesCount: nextRetriesCount,
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
  return { allowed: true as const, token, expiresAtMs: grant.expiresAtMs, retriesCount: nextRetriesCount };
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

export async function finishTryOnGrant(deviceId: string, sessionId: string, completed: boolean, masterImageUrl?: string) {
  const hash = deviceHash(deviceId);
  const existing = await getTryOnDeviceStatus(deviceId);
  const update = completed
    ? {
        status: 'generated' as const,
        sessionId,
        masterImageUrl: masterImageUrl || '',
        retriesCount: existing?.retriesCount || 0,
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

export async function markTryOnDeviceUsed(deviceId: string) {
  const hash = deviceHash(deviceId);
  const db = getDb();
  const update = {
    status: 'used' as const,
    downloadedAt: new Date().toISOString(),
  };
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
  const secret = process.env.OPERATOR_AUTH_SECRET || process.env.ADMIN_PASSWORD || 'tryfocus-local-development';
  return crypto.createHmac('sha256', secret).update(`${MAHARAJA_CLIENT_ID}:${label}`).digest('base64url').slice(0, length);
}

function defaultWorkspace(): MaharajaWorkspace {
  const now = new Date().toISOString();
  return {
    clientId: MAHARAJA_CLIENT_ID,
    clientName: 'Maharaja',
    workspaceCode: process.env.MAHARAJA_WORKSPACE_CODE || MAHARAJA_WORKSPACE_CODE,
    campaignEnabled: true,
    activeEvents: [...EVENT_IDS],
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
      return { ...fallback, ...createdData, usage: { ...fallback.usage, ...createdData.usage } };
    }
    const data = snapshot.data() as Partial<MaharajaWorkspace>;
    return { ...fallback, ...data, usage: { ...fallback.usage, ...data.usage } };
  }

  const mockStore = getMockStore();
  const existing = mockStore.clientWorkspaces.get(MAHARAJA_CLIENT_ID) as MaharajaWorkspace | undefined;
  if (existing) return { ...fallback, ...existing, usage: { ...fallback.usage, ...existing.usage } };
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
      return { allowed: true as const, clientId: MAHARAJA_CLIENT_ID, pass: null };
    }
    const videoPass = code ? await getVideoPass(code) : null;
    if (videoPass) {
      if (videoPass.status === 'used') {
        return { allowed: false as const, error: 'This AI Video has been completed.' };
      }
      if (videoPass.expiresAtMs < Date.now()) {
        return { allowed: false as const, error: 'This Maharaja AI Video pass has expired.' };
      }
      if (videoPass.status === 'active') {
        return { allowed: true as const, clientId: MAHARAJA_CLIENT_ID, pass: videoPass };
      }
    }
    return verifyOperatorRequest(req)
      ? { allowed: true as const, clientId: MAHARAJA_CLIENT_ID, pass: null }
      : { allowed: false as const, error: 'Invalid Maharaja Try-On access.' };
  }

  const pass = code ? await getVideoPass(code) : null;
  if (pass && pass.clientId === MAHARAJA_CLIENT_ID) {
    if (pass.status === 'used') {
      return { allowed: false as const, error: 'This AI Video has been completed.' };
    }
    if (pass.expiresAtMs < Date.now()) {
      return { allowed: false as const, error: 'This Maharaja AI Video pass has expired.' };
    }
    if (pass.status === 'active') {
      return { allowed: true as const, clientId: MAHARAJA_CLIENT_ID, pass };
    }
  }
  return verifyOperatorRequest(req)
    ? { allowed: true as const, clientId: MAHARAJA_CLIENT_ID, pass: null }
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
