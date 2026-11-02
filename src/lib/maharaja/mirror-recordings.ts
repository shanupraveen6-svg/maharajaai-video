import { RESULT_LIFETIME_MS } from '@/lib/maharaja/retention';
import crypto from 'crypto';
import { getDb, getMockStore, getStorageBucket } from '@/lib/firebase/admin';
import { activeClientId } from './client-context';

/**
 * The customer's whole Live Mirror session, recorded on the TV and taken home by QR. It is private,
 * expires after 1 day (like the other customer links) and is deleted by the privacy cleanup.
 */
export type MirrorRecording = {
  id: string;
  clientId: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  garmentTitle: string;
  /** A still of each outfit worn, so the family can compare them side by side. */
  looks?: Array<{ title: string; path: string }>;
  expiresAtMs: number;
};

export const MIRROR_RECORDING = {
  maxBytes: 60 * 1024 * 1024,
  lifetimeMs: RESULT_LIFETIME_MS,
  types: { 'video/webm': 'webm', 'video/mp4': 'mp4' } as Record<string, string>,
  maxLooks: 6,
  maxLookBytes: 600 * 1024,
};

const COLLECTION = 'tvMirrorRecordings';
const realBucket = () => (getDb() ? getStorageBucket() : null);
const folderFor = (clientId: string, id: string) => `clients/${clientId}/mirror-recordings/${id}`;
const pathFor = (clientId: string, id: string, ext: string) => `${folderFor(clientId, id)}/session.${ext}`;
const isId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{24}$/.test(value);

/** Strips codec details: `video/webm;codecs=vp9` → `video/webm`. */
function baseType(contentType: unknown) {
  return typeof contentType === 'string' ? contentType.split(';')[0].trim().toLowerCase() : '';
}

export class MirrorRecordingError extends Error {}

/** Reserves a private path and returns a short-lived direct upload URL for one recording. */
export async function createMirrorUpload(contentType: unknown, sizeBytes: unknown) {
  const type = baseType(contentType);
  const ext = MIRROR_RECORDING.types[type];
  if (!ext) throw new MirrorRecordingError('This TV browser records in a format we cannot save.');
  const size = Number(sizeBytes);
  if (!Number.isFinite(size) || size <= 0) throw new MirrorRecordingError('The recording is empty.');
  if (size > MIRROR_RECORDING.maxBytes) throw new MirrorRecordingError('The recording is too large to save.');
  const id = crypto.randomBytes(18).toString('base64url');
  const storagePath = pathFor(activeClientId(), id, ext);
  const bucket = realBucket();
  const uploadUrl = bucket
    ? (await bucket.file(storagePath).getSignedUrl({ version: 'v4', action: 'write', expires: Date.now() + 15 * 60 * 1000, contentType: type }))[0]
    : `/api/storage/mock-upload?path=${encodeURIComponent(storagePath)}`;
  return { id, uploadUrl, contentType: type };
}

/** Reads the outfit stills the TV sent: JPEG data URLs only, a few hundred KB each. */
function decodeLooks(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, MIRROR_RECORDING.maxLooks).flatMap((look) => {
    const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(typeof look?.image === 'string' ? look.image : '');
    if (!match) return [];
    const bytes = Buffer.from(match[1], 'base64');
    if (!bytes.length || bytes.length > MIRROR_RECORDING.maxLookBytes || bytes[0] !== 0xff || bytes[1] !== 0xd8) return [];
    return [{ title: String(look.title || '').trim().slice(0, 120), bytes }];
  });
}

async function saveLooks(clientId: string, id: string, looks: ReturnType<typeof decodeLooks>) {
  const bucket = realBucket();
  return Promise.all(looks.map(async (look, index) => {
    const path = `${folderFor(clientId, id)}/look-${index}.jpg`;
    if (bucket) await bucket.file(path).save(look.bytes, { contentType: 'image/jpeg', public: false, metadata: { cacheControl: 'private, no-store' } });
    else getMockStore().sessions.set(`mock_blob_${path}`, { buffer: look.bytes, contentType: 'image/jpeg', updatedAt: Date.now() });
    return { title: look.title, path };
  }));
}

/** Checks the upload finished and saves the record the customer's QR points at. */
export async function confirmMirrorRecording(id: unknown, contentType: unknown, garmentTitle: unknown, looksInput?: unknown): Promise<MirrorRecording> {
  const type = baseType(contentType);
  const ext = MIRROR_RECORDING.types[type];
  if (!isId(id) || !ext) throw new MirrorRecordingError('Save the recording again.');
  const clientId = activeClientId();
  const storagePath = pathFor(clientId, id, ext);
  const bucket = realBucket();
  let sizeBytes = 0;
  if (bucket) {
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) throw new MirrorRecordingError('The recording did not finish uploading.');
    const [metadata] = await file.getMetadata();
    sizeBytes = Number(metadata.size || 0);
    await file.setMetadata({ cacheControl: 'private, no-store, max-age=0', contentType: type });
  } else {
    const blob = getMockStore().sessions.get(`mock_blob_${storagePath}`) as { buffer?: Buffer } | undefined;
    sizeBytes = blob?.buffer?.length || 0;
  }
  if (!sizeBytes) throw new MirrorRecordingError('The recording did not finish uploading.');
  if (sizeBytes > MIRROR_RECORDING.maxBytes) {
    await deleteMirrorFile(storagePath);
    throw new MirrorRecordingError('The recording is too large to save.');
  }
  const record: MirrorRecording = {
    id,
    clientId,
    storagePath,
    contentType: type,
    sizeBytes,
    garmentTitle: String(garmentTitle || '').trim().slice(0, 120),
    looks: await saveLooks(clientId, id, decodeLooks(looksInput)),
    expiresAtMs: Date.now() + MIRROR_RECORDING.lifetimeMs,
  };
  const db = getDb();
  if (db) await db.collection(COLLECTION).doc(id).set(record);
  else getMockStore().sessions.set(`mirror_recording_${id}`, record);
  return record;
}

/** The recording behind a customer's QR, or null once it has expired. */
export async function readMirrorRecording(id: unknown): Promise<MirrorRecording | null> {
  if (!isId(id)) return null;
  const db = getDb();
  const record = db
    ? ((await db.collection(COLLECTION).doc(id).get()).data() as MirrorRecording | undefined)
    : (getMockStore().sessions.get(`mirror_recording_${id}`) as MirrorRecording | undefined);
  return record && record.expiresAtMs > Date.now() ? record : null;
}

/** Short-lived links to watch and download the recording, and to see each outfit still. */
export async function mirrorRecordingUrls(record: MirrorRecording) {
  const bucket = realBucket();
  if (!bucket) {
    const mockUrl = (path: string) => `/api/storage/mock-upload?path=${encodeURIComponent(path)}`;
    const url = mockUrl(record.storagePath);
    return { videoUrl: url, downloadUrl: url, looks: (record.looks || []).map((look) => ({ title: look.title, imageUrl: mockUrl(look.path) })) };
  }
  const file = bucket.file(record.storagePath);
  const expires = Math.min(record.expiresAtMs, Date.now() + 60 * 60 * 1000);
  const ext = MIRROR_RECORDING.types[record.contentType] || 'webm';
  const [[videoUrl], [downloadUrl], looks] = await Promise.all([
    file.getSignedUrl({ version: 'v4', action: 'read', expires }),
    file.getSignedUrl({ version: 'v4', action: 'read', expires, responseDisposition: `attachment; filename="live-mirror.${ext}"` }),
    Promise.all((record.looks || []).map(async (look) => ({
      title: look.title,
      imageUrl: (await bucket.file(look.path).getSignedUrl({ version: 'v4', action: 'read', expires }))[0],
    }))),
  ]);
  return { videoUrl, downloadUrl, looks };
}

async function deleteMirrorFile(storagePath: string) {
  const bucket = realBucket();
  if (bucket) await bucket.file(storagePath).delete({ ignoreNotFound: true }).catch(() => undefined);
  else getMockStore().sessions.delete(`mock_blob_${storagePath}`);
}
