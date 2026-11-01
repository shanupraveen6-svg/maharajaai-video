import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { activeClientId } from './client-context';
import { MAHARAJA_CLIENT_ID } from './config';

/**
 * Each workspace's Go Live library: the videos its Go Live screens may play, kept inside the workspace at
 * `clientWorkspaces/<clientId>/goLive/<videoId>`. Media stays in Storage under `clients/<clientId>/…`
 * (Maharaja's original demo clips also sit at the bucket root), so a library entry and its files belong to
 * one store. A Go Live screen reads only its own store's library; no screen scans other stores' records.
 *
 * Writers: the customer's Go Live consent (queued, not yet replayable), the end of the second live play
 * (published to the replay loop), showcase uploads, and the one-time import of a workspace's older records.
 */
export type GoLiveEntry = {
  id: string;
  sessionId: string | null;
  storagePath: string;
  /** The 9-second Go Live cut when there is one; the TV plays it instead of the 6-second customer copy. */
  liveStoragePath?: string | null;
  status: 'ready';
  published: boolean;
  replayEnabled: boolean;
  isShowcaseSample?: boolean;
  universalPool?: boolean;
  displayName?: string | null;
  customerName?: string | null;
  customerLocality?: string | null;
  eventId?: string | null;
  category?: string | null;
  templateId?: string | null;
  playbackMode?: 'embedded' | 'external';
  hasEmbeddedAudio?: boolean;
  durationSeconds?: number;
  liveAudioUrl?: string | null;
  contentType?: string | null;
  createdAt: string;
  expiresAt?: string | null;
  updatedAt: string;
};

/** The version written on a workspace once its older Go Live records were imported into its library. */
export const GO_LIVE_LIBRARY_VERSION = 1;

export function goLiveCollection(db: Firestore, clientId = activeClientId()) {
  return db.collection('clientWorkspaces').doc(clientId).collection('goLive');
}

function mockKey(clientId: string, id: string) {
  return `${clientId}:${id}`;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

/** A library entry from a `videos` record (the shared record every Go Live video also keeps). */
export function goLiveEntryFromVideo(video: Record<string, any> & { id: string }): GoLiveEntry {
  const nowIso = new Date().toISOString();
  return {
    id: String(video.id),
    sessionId: video.sessionId || null,
    storagePath: String(video.storagePath || ''),
    liveStoragePath: video.liveStoragePath || null,
    status: 'ready',
    published: video.published === true,
    replayEnabled: video.replayEnabled === true,
    isShowcaseSample: video.isShowcaseSample === true,
    universalPool: video.universalPool === true,
    displayName: video.displayName || video.catalog?.displayName || null,
    customerName: video.customerName || null,
    customerLocality: video.customerLocality || null,
    eventId: video.eventId || null,
    category: video.category || null,
    templateId: video.templateId || null,
    playbackMode: video.playbackMode === 'external' ? 'external' : video.playbackMode === 'embedded' ? 'embedded' : undefined,
    hasEmbeddedAudio: typeof video.hasEmbeddedAudio === 'boolean' ? video.hasEmbeddedAudio : undefined,
    durationSeconds: Number.isFinite(Number(video.durationSeconds)) && video.durationSeconds !== null ? Number(video.durationSeconds) : undefined,
    liveAudioUrl: video.liveAudioUrl || null,
    contentType: video.contentType || null,
    createdAt: video.createdAt || nowIso,
    expiresAt: video.expiresAt || null,
    updatedAt: nowIso,
  };
}

/** Adds or updates one library entry (merged). Pass a transaction to write it with other records at once. */
export function saveGoLiveEntry(
  entry: Partial<GoLiveEntry> & { id: string },
  { clientId = activeClientId(), transaction }: { clientId?: string; transaction?: Transaction } = {},
) {
  const data = withoutUndefined({ ...entry, updatedAt: entry.updatedAt || new Date().toISOString() });
  const db = getDb();
  if (db) {
    const ref = goLiveCollection(db, clientId).doc(entry.id);
    if (transaction) {
      transaction.set(ref, data, { merge: true });
      return Promise.resolve();
    }
    return ref.set(data, { merge: true }).then(() => undefined);
  }
  const store = getMockStore().goLive;
  const key = mockKey(clientId, entry.id);
  store.set(key, { ...(store.get(key) || {}), ...data });
  return Promise.resolve();
}

/** Writes many entries in batches of 400 (Firestore allows 500 writes a batch). */
export async function saveGoLiveEntries(entries: Array<Partial<GoLiveEntry> & { id: string }>, clientId = activeClientId()) {
  const db = getDb();
  if (!db) {
    for (const entry of entries) await saveGoLiveEntry(entry, { clientId });
    return;
  }
  for (let start = 0; start < entries.length; start += 400) {
    const batch = db.batch();
    for (const entry of entries.slice(start, start + 400)) {
      batch.set(goLiveCollection(db, clientId).doc(entry.id), withoutUndefined({ ...entry, updatedAt: entry.updatedAt || new Date().toISOString() }), { merge: true });
    }
    await batch.commit();
  }
}

export async function listGoLiveEntries(clientId = activeClientId()): Promise<GoLiveEntry[]> {
  const db = getDb();
  if (db) {
    const snapshot = await goLiveCollection(db, clientId).get();
    return snapshot.docs.map((doc) => ({ ...(doc.data() as GoLiveEntry), id: doc.id }));
  }
  const prefix = `${clientId}:`;
  return Array.from(getMockStore().goLive.entries())
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => ({ ...(value as GoLiveEntry), id: key.slice(prefix.length) }));
}

/** Removes every library entry made from these customer sessions (a deletion or a privacy cleanup). */
export async function deleteGoLiveEntriesForSessions(sessionIds: string[], clientId = activeClientId()) {
  const wanted = new Set(sessionIds.filter(Boolean));
  if (!wanted.size) return 0;
  const db = getDb();
  if (db) {
    const snapshot = await goLiveCollection(db, clientId).get();
    const docs = snapshot.docs.filter((doc) => wanted.has(String(doc.data().sessionId || '')) || wanted.has(doc.id.replace(/^video_/, '')));
    for (let start = 0; start < docs.length; start += 400) {
      const batch = db.batch();
      docs.slice(start, start + 400).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
    return docs.length;
  }
  let removed = 0;
  for (const [key, value] of getMockStore().goLive.entries()) {
    if (!key.startsWith(`${clientId}:`)) continue;
    if (wanted.has(String(value?.sessionId || '')) || wanted.has(key.slice(clientId.length + 1).replace(/^video_/, ''))) {
      getMockStore().goLive.delete(key);
      removed += 1;
    }
  }
  return removed;
}

/** Whether this workspace's older Go Live records were already imported into its library. */
export async function goLiveLibraryImported(db: Firestore, clientId = activeClientId()) {
  const snapshot = await db.collection('clientWorkspaces').doc(clientId).get();
  return Number(snapshot.data()?.goLiveLibraryVersion || 0) >= GO_LIVE_LIBRARY_VERSION;
}

export async function markGoLiveLibraryImported(db: Firestore, clientId = activeClientId()) {
  await db.collection('clientWorkspaces').doc(clientId).set({
    goLiveLibraryVersion: GO_LIVE_LIBRARY_VERSION,
    goLiveLibraryImportedAt: new Date().toISOString(),
  }, { merge: true });
}

/**
 * Storage folders that hold a store's showcase clips. Listing only these keeps a library refresh cheap:
 * Maharaja's demo clips at the bucket root and in its demo folders, and every store's own folders.
 */
export function showcasePrefixesFor(clientId = activeClientId()) {
  const own = ['live-testing', 'showcase', 'showcases', 'demo', 'demos'].map((folder) => `clients/${clientId}/${folder}/`);
  return clientId === MAHARAJA_CLIENT_ID
    ? [...own, 'live-testing/', 'showcase/', 'showcases/', 'demo/', 'demos/']
    : own;
}
