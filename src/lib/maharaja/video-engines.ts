import crypto from 'crypto';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import type { EventId, GarmentType } from './config';
import type { VideoConceptId } from './video-concepts';
import { FAL_VIDEO_MODELS, buildVideoTestInput, type VideoModelId } from './video-test';
import { SPEND_CAP_MESSAGE, recordAiCost, spendAllowed } from './usage-ledger';

/**
 * Automatic engine switching for AI Video, so no single provider can stop the service:
 *  - A job tries the engines in order (VIDEO_ENGINE_ORDER, default H3 Max → Gemini Omni, the ultimate
 *    backup; PixVerse C1 and Vidu Q4 can be added once tested). When fal refuses a submission, the next
 *    engine is tried at once.
 *  - When a render fails, or waits in fal's queue for over 2.5 minutes without starting, the same job
 *    moves to the next engine (the customer keeps waiting on the same screen).
 *  - An engine that failed 3 times in 10 minutes is skipped for the next 15 minutes, across every server
 *    (Firestore `appControl/videoEngineHealth`), unless every engine is resting.
 */
export const ENGINE_FAILURE_LIMIT = 3;
export const ENGINE_FAILURE_WINDOW_MS = 10 * 60 * 1000;
export const ENGINE_REST_MS = 15 * 60 * 1000;
export const QUEUE_TIMEOUT_MS = 150 * 1000;

const HEALTH_DOC = 'appControl/videoEngineHealth';
const DEFAULT_ORDER: VideoModelId[] = ['h3-max', 'gemini-omni'];

/** What a job needs to render again on another engine (stored on the job). */
export type RenderRequest = {
  masterUrl: string;
  garmentUrls: string[];
  conceptId: VideoConceptId;
  garmentRoles: string[];
  eventId: EventId;
  garmentType: GarmentType;
  retryRender: boolean;
};

export type EngineAttempt = { engine: VideoModelId; at: string; requestId?: string; error?: string };

export type SubmittedRender = {
  engine: (typeof FAL_VIDEO_MODELS)[number];
  engineIndex: number;
  requestId: string;
  statusUrl: string;
  responseUrl: string;
  seed: string | number | null;
  attempts: EngineAttempt[];
};

export function engineById(id: unknown) {
  return FAL_VIDEO_MODELS.find((model) => model.id === id) || null;
}

/** The engine order for new jobs: VIDEO_ENGINE_ORDER (comma-separated ids) or the default. */
export function videoEngineOrder(): VideoModelId[] {
  const configured = String(process.env.VIDEO_ENGINE_ORDER || '')
    .split(',')
    .map((id) => id.trim())
    .filter((id): id is VideoModelId => Boolean(engineById(id)));
  const order = configured.length ? configured : DEFAULT_ORDER;
  return Array.from(new Set(order));
}

type HealthRecord = Partial<Record<VideoModelId, number[]>>;

const localHealth: { value: HealthRecord } = (globalThis as typeof globalThis & { __TRYFOCUS_VIDEO_HEALTH__?: { value: HealthRecord } })
  .__TRYFOCUS_VIDEO_HEALTH__ || { value: {} };
(globalThis as typeof globalThis & { __TRYFOCUS_VIDEO_HEALTH__?: { value: HealthRecord } }).__TRYFOCUS_VIDEO_HEALTH__ = localHealth;

async function readHealth(): Promise<HealthRecord> {
  const db = getDb();
  if (!db) return localHealth.value;
  const snapshot = await db.doc(HEALTH_DOC).get().catch(() => null);
  return (snapshot?.data() as HealthRecord | undefined) || {};
}

/** Whether an engine is resting after repeated failures. */
export function engineResting(failures: number[] | undefined, now = Date.now()) {
  const recent = (failures || []).filter((at) => now - at < ENGINE_FAILURE_WINDOW_MS);
  if (recent.length < ENGINE_FAILURE_LIMIT) return false;
  return now - Math.max(...recent) < ENGINE_REST_MS;
}

/** The engine order with resting engines left out (all of them when every engine is resting). */
export async function availableEngines(order = videoEngineOrder()) {
  const health = await readHealth();
  const now = Date.now();
  const awake = order.filter((id) => !engineResting(health[id], now));
  return awake.length ? awake : order;
}

export async function recordEngineFailure(engine: VideoModelId) {
  const now = Date.now();
  const keep = (list: number[] | undefined) => [...(list || []).filter((at) => now - at < ENGINE_FAILURE_WINDOW_MS + ENGINE_REST_MS), now].slice(-10);
  const db = getDb();
  if (!db) {
    localHealth.value = { ...localHealth.value, [engine]: keep(localHealth.value[engine]) };
    return;
  }
  const ref = db.doc(HEALTH_DOC);
  await db.runTransaction(async (transaction) => {
    const current = ((await transaction.get(ref)).data() || {}) as HealthRecord;
    transaction.set(ref, { [engine]: keep(current[engine]), updatedAt: new Date(now).toISOString() }, { merge: true });
  }).catch((error) => console.warn('Video engine health update failed:', error));
}

/** A finished render clears its engine's failure count. */
export async function recordEngineSuccess(engine: VideoModelId) {
  const db = getDb();
  if (!db) {
    localHealth.value = { ...localHealth.value, [engine]: [] };
    return;
  }
  await db.doc(HEALTH_DOC).set({ [engine]: [] }, { merge: true }).catch(() => undefined);
}

function falError(status: number, raw: string) {
  let detail = raw;
  try {
    const parsed = JSON.parse(raw);
    detail = typeof parsed?.detail === 'string' ? parsed.detail : JSON.stringify(parsed?.detail || parsed?.error || parsed);
  } catch { /* plain text */ }
  return `Fal request failed (${status}): ${detail.slice(0, 300)}`;
}

/**
 * Submits a render to the first engine in `chain` (from `startIndex`) that accepts it. Each refusal is
 * recorded against that engine and the next one is tried; the AI cost is recorded once, for the engine
 * that took the job.
 */
export async function submitRender({ chain, startIndex = 0, request, webhookUrl, falKey, attempts = [] }: {
  chain: VideoModelId[];
  startIndex?: number;
  request: RenderRequest;
  webhookUrl: string;
  falKey: string;
  attempts?: EngineAttempt[];
}): Promise<SubmittedRender> {
  const tried = [...attempts];
  let lastError = 'No AI Video engine is available.';
  for (let index = startIndex; index < chain.length; index += 1) {
    const engine = engineById(chain[index]);
    if (!engine) continue;
    if (!await spendAllowed()) throw new Error(SPEND_CAP_MESSAGE);
    try {
      const input = buildVideoTestInput(engine.id, request.masterUrl, request.garmentUrls, request.conceptId, request.garmentRoles, request.eventId, request.garmentType, request.retryRender);
      const queueUrl = new URL(`https://queue.fal.run/${engine.model}`);
      queueUrl.searchParams.set('fal_webhook', webhookUrl);
      const response = await fetch(queueUrl, {
        method: 'POST',
        headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(input),
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      });
      const raw = await response.text();
      if (!response.ok) throw new Error(falError(response.status, raw));
      const provider = JSON.parse(raw);
      const requestId = provider.request_id || provider.requestId;
      const statusUrl = provider.status_url || provider.statusUrl;
      const responseUrl = provider.response_url || provider.responseUrl;
      if (!requestId || !statusUrl || !responseUrl) throw new Error('Fal accepted the request but returned incomplete queue tracking data.');
      await recordAiCost('video-render', engine.estimatedUsd);
      tried.push({ engine: engine.id, at: new Date().toISOString(), requestId });
      return {
        engine,
        engineIndex: index,
        requestId,
        statusUrl,
        responseUrl,
        seed: typeof provider.seed === 'number' || typeof provider.seed === 'string' ? provider.seed : null,
        attempts: tried,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Video submission failed.';
      if (lastError === SPEND_CAP_MESSAGE) throw error;
      tried.push({ engine: engine.id, at: new Date().toISOString(), error: lastError.slice(0, 300) });
      await recordEngineFailure(engine.id);
    }
  }
  const failure = new Error(lastError);
  (failure as Error & { attempts?: EngineAttempt[] }).attempts = tried;
  throw failure;
}

/** A fresh webhook secret for a (re)submission; only its hash is stored on the job. */
export function newWebhookToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: crypto.createHash('sha256').update(token).digest('hex') };
}

export function webhookUrlFor(origin: string, jobId: string, token: string) {
  const url = new URL('/api/video/webhook', origin);
  url.searchParams.set('jobId', jobId);
  url.searchParams.set('token', token);
  return url.toString();
}

/** fal's cancel endpoint for a queued request (its status URL with /cancel). */
export function cancelUrlFor(statusUrl: string) {
  return /\/requests\/[^/]+\/status$/.test(statusUrl) ? statusUrl.replace(/\/status$/, '/cancel') : '';
}

/** Cancels a request that is still waiting in fal's queue. False when it already started (or cannot be cancelled). */
export async function cancelQueuedRender(statusUrl: string, falKey: string) {
  const url = cancelUrlFor(statusUrl);
  if (!url) return false;
  try {
    const response = await fetch(url, { method: 'PUT', headers: { Authorization: `Key ${falKey}`, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    return response.ok;
  } catch {
    return false;
  }
}

type JobRecord = Record<string, any> & { jobId: string };

/**
 * Moves a failed job to the next engine in its chain. Returns the updated job fields when it was
 * resubmitted, or null when no engine is left (the caller then fails the job as before). Only one caller
 * can move a job at a time: the move is claimed on the job record first.
 */
export async function failOverVideoJob(job: JobRecord, { origin, falKey, reason }: { origin: string; falKey: string; reason: string }) {
  const chain = (Array.isArray(job.engineChain) ? job.engineChain : [job.modelId]).filter((id: unknown): id is VideoModelId => Boolean(engineById(id)));
  const currentIndex = Math.max(0, chain.indexOf(job.modelId));
  const request = job.renderRequest as RenderRequest | undefined;
  if (job.modelId) await recordEngineFailure(job.modelId);
  if (!request || currentIndex >= chain.length - 1) return null;

  const db = getDb();
  const claimKey = `${job.requestId || ''}->next`;
  if (db) {
    const ref = db.collection('videoTestJobs').doc(job.jobId);
    const claimed = await db.runTransaction(async (transaction) => {
      const fresh = (await transaction.get(ref)).data();
      // Finished, or already moved to another engine by someone else: nothing to do here.
      if (!fresh || fresh.status === 'ready' || fresh.requestId !== job.requestId) return false;
      // Another request is moving it right now (a claim older than 90 s was abandoned and is taken over).
      const abandoned = Date.now() - new Date(fresh.updatedAt || 0).getTime() > 90_000;
      if (fresh.failoverClaim === claimKey && fresh.status === 'switching' && !abandoned) return false;
      if (fresh.failoverClaim === claimKey && fresh.status === 'failed') return false;
      transaction.set(ref, { failoverClaim: claimKey, status: 'switching', updatedAt: new Date().toISOString() }, { merge: true });
      return true;
    });
    if (!claimed) {
      const fresh = (await ref.get()).data();
      return fresh?.status === 'failed' ? null : { status: 'switching' };
    }
  }

  const resting = await availableEngines(chain.slice(currentIndex + 1));
  const nextIndex = Math.min(...resting.map((id) => chain.indexOf(id)).filter((index) => index > currentIndex));
  const { token, hash } = newWebhookToken();
  const attempts: EngineAttempt[] = Array.isArray(job.engineAttempts) ? job.engineAttempts : [];
  const failedAttempts = attempts.map((attempt) => attempt.requestId === job.requestId ? { ...attempt, error: reason.slice(0, 300) } : attempt);
  try {
    const submitted = await submitRender({
      chain,
      startIndex: Number.isFinite(nextIndex) ? nextIndex : currentIndex + 1,
      request,
      webhookUrl: webhookUrlFor(origin, job.jobId, token),
      falKey,
      attempts: failedAttempts,
    });
    const update = {
      status: 'submitted',
      modelId: submitted.engine.id,
      model: submitted.engine.model,
      estimatedUsd: submitted.engine.estimatedUsd,
      requestId: submitted.requestId,
      statusUrl: submitted.statusUrl,
      responseUrl: submitted.responseUrl,
      seed: submitted.seed,
      webhookTokenHash: hash,
      engineAttempts: submitted.attempts,
      engineSubmittedAt: new Date().toISOString(),
      engineSwitches: Number(job.engineSwitches || 0) + 1,
      providerStatus: 'IN_QUEUE',
      error: null,
      updatedAt: new Date().toISOString(),
    };
    if (db) await db.collection('videoTestJobs').doc(job.jobId).set(update, { merge: true });
    else getMockStore().sessions.set(`video_test_${job.jobId}`, { ...job, ...update });
    return update;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No AI Video engine is available.';
    // Every engine refused: the job ends as failed (the caller releases the customer's pass).
    const update = { status: 'failed', engineAttempts: (error as Error & { attempts?: EngineAttempt[] }).attempts || failedAttempts, error: message, updatedAt: new Date().toISOString() };
    if (db) await db.collection('videoTestJobs').doc(job.jobId).set(update, { merge: true });
    else getMockStore().sessions.set(`video_test_${job.jobId}`, { ...job, ...update });
    return null;
  }
}
