import { FieldValue } from 'firebase-admin/firestore';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { activeClientId } from './client-context';
import { recordApiUsageUsd, type ApiProvider } from './api-ledger';

/**
 * Two running totals kept beside each workspace's lifetime counters:
 *  - per month, the same usage counters (scans, looks, videos, Go Live…) for the store's monthly report;
 *  - per day, the estimated AI cost of every provider call, for margins and the platform's daily safety cap.
 * Costs are estimates in US dollars (providers bill in dollars). Set the AI_COST_* environment variables
 * from your provider invoices; the defaults below are only a starting point.
 */
export type AiCostKind = 'try-on' | 'video-portrait' | 'video-render' | 'live-session';

const DEFAULT_COST_USD: Record<AiCostKind, number> = {
  'try-on': 0.068,
  'video-portrait': 0.0735,
  // Overridden by the video model's own estimate when one is known.
  'video-render': 0.48,
  // One 30-second Live Mirror session at $0.02 a second.
  'live-session': 0.6,
};

const COST_ENV: Record<AiCostKind, string> = {
  'try-on': 'AI_COST_TRY_ON_USD',
  'video-portrait': 'AI_COST_VIDEO_PORTRAIT_USD',
  'video-render': 'AI_COST_VIDEO_RENDER_USD',
  'live-session': 'AI_COST_LIVE_SESSION_USD',
};

function envNumber(name: string): number | null {
  const value = Number(process.env[name]);
  return process.env[name] !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

export function aiCostUsd(kind: AiCostKind) {
  return envNumber(COST_ENV[kind]) ?? DEFAULT_COST_USD[kind];
}

/** Rupees per dollar for showing spend in ₹ (USD_TO_INR, default 98: about ₹94 plus a ₹4 buffer). */
export function usdToInr(usd: number) {
  return usd * (envNumber('USD_TO_INR') ?? 98);
}

/**
 * A daily safety cap for the whole platform in US dollars (AI_DAILY_CAP_PLATFORM_USD; unset or 0 means
 * none). Stores have no daily cap: they bought a package, and they are told at 50/70/90/95% and when it
 * is finished (see credits.ts).
 */
export function spendCaps() {
  return { platform: envNumber('AI_DAILY_CAP_PLATFORM_USD') || null };
}

/** Store days and months follow India time, so a day's spend resets at midnight IST. */
export function istDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function istMonth(date = new Date()) {
  return istDay(date).slice(0, 7);
}

type MonthLedger = { counts?: Record<string, number>; costUsdByDay?: Record<string, number>; costUsdByKind?: Record<string, number> };
type PlatformDay = { costUsd?: number; byClient?: Record<string, number> };

const monthDoc = (clientId: string, month: string) => getDb()!.collection('clientWorkspaces').doc(clientId).collection('ledger').doc(month);
const platformDoc = (day: string) => getDb()!.collection('platformLedger').doc(day);
const mockMonthKey = (clientId: string, month: string) => `ledger_${clientId}_${month}`;
const mockPlatformKey = (day: string) => `platform_ledger_${day}`;

function bump(target: Record<string, number> | undefined, key: string, delta: number) {
  return { ...(target || {}), [key]: Number(target?.[key] || 0) + delta };
}

/** Adds to this month's copy of a usage counter. Never throws: the report must not block a customer. */
export async function recordUsage(field: string, delta = 1) {
  try {
    const clientId = activeClientId();
    const month = istMonth();
    const db = getDb();
    if (db) {
      await monthDoc(clientId, month).set({ counts: { [field]: FieldValue.increment(delta) } }, { merge: true });
      return;
    }
    const store = getMockStore().sessions;
    const current = (store.get(mockMonthKey(clientId, month)) || {}) as MonthLedger;
    store.set(mockMonthKey(clientId, month), { ...current, counts: bump(current.counts, field, delta) });
  } catch (error) {
    console.error('Usage ledger write failed:', error);
  }
}

/**
 * Records the estimated cost of one AI provider call for this client and for the whole platform.
 * `provider` is the vendor that actually served this call (known at the call site, never guessed — see
 * each caller), so a dollar-billed vendor's lifetime spend (api-ledger.ts) stays attributed correctly;
 * `genlook` is passed for completeness but recorded nowhere here, since GenLook already tracks its own
 * usage in credits (genlook-ledger.ts), not dollars.
 */
export async function recordAiCost(kind: AiCostKind, usd = aiCostUsd(kind), provider?: ApiProvider | 'genlook') {
  if (!(usd > 0)) return;
  const providerWrite = provider && provider !== 'genlook' ? recordApiUsageUsd(provider, usd) : Promise.resolve();
  try {
    const clientId = activeClientId();
    const day = istDay();
    const month = istMonth();
    const db = getDb();
    if (db) {
      await Promise.all([
        monthDoc(clientId, month).set({
          costUsdByDay: { [day]: FieldValue.increment(usd) },
          costUsdByKind: { [kind]: FieldValue.increment(usd) },
        }, { merge: true }),
        platformDoc(day).set({ costUsd: FieldValue.increment(usd), byClient: { [clientId]: FieldValue.increment(usd) } }, { merge: true }),
        providerWrite,
      ]);
      return;
    }
    await providerWrite;
    const store = getMockStore().sessions;
    const current = (store.get(mockMonthKey(clientId, month)) || {}) as MonthLedger;
    store.set(mockMonthKey(clientId, month), {
      ...current,
      costUsdByDay: bump(current.costUsdByDay, day, usd),
      costUsdByKind: bump(current.costUsdByKind, kind, usd),
    });
    const platform = (store.get(mockPlatformKey(day)) || {}) as PlatformDay;
    store.set(mockPlatformKey(day), { costUsd: Number(platform.costUsd || 0) + usd, byClient: bump(platform.byClient, clientId, usd) });
  } catch (error) {
    console.error('AI cost ledger write failed:', error);
  }
}

async function readMonth(clientId: string, month: string): Promise<MonthLedger> {
  const db = getDb();
  if (db) return ((await monthDoc(clientId, month).get()).data() as MonthLedger | undefined) || {};
  return (getMockStore().sessions.get(mockMonthKey(clientId, month)) || {}) as MonthLedger;
}

async function readPlatformDay(day: string): Promise<PlatformDay> {
  const db = getDb();
  if (db) return ((await platformDoc(day).get()).data() as PlatformDay | undefined) || {};
  return (getMockStore().sessions.get(mockPlatformKey(day)) || {}) as PlatformDay;
}

/** Today's estimated spend for one client and for the platform, against the caps. */
export async function spendToday(clientId = activeClientId()) {
  const day = istDay();
  const [month, platform] = await Promise.all([readMonth(clientId, istMonth()), readPlatformDay(day)]);
  return {
    clientUsd: Number(month.costUsdByDay?.[day] || 0),
    platformUsd: Number(platform.costUsd || 0),
    caps: spendCaps(),
  };
}

/**
 * Whether a new paid AI call may start. Fails open on a ledger read error: a reporting hiccup must not
 * stop a customer in the store.
 */
export async function spendAllowed(clientId = activeClientId()) {
  const caps = spendCaps();
  if (!caps.platform) return true;
  try {
    const today = await spendToday(clientId);
    if (today.platformUsd >= caps.platform) return false;
    return true;
  } catch (error) {
    console.error('Spend cap check failed:', error);
    return true;
  }
}

export const SPEND_CAP_MESSAGE = 'AI is resting for today. Please ask our staff for help.';

/** This month and last month for the store's report, plus this month's estimated AI cost. */
export async function monthlyReport(clientId = activeClientId()) {
  const now = new Date();
  const thisMonth = istMonth(now);
  const lastMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
  const lastMonth = istMonth(lastMonthDate);
  const [current, previous] = await Promise.all([readMonth(clientId, thisMonth), readMonth(clientId, lastMonth)]);
  const sum = (values?: Record<string, number>) => Object.values(values || {}).reduce((total, value) => total + Number(value || 0), 0);
  return {
    month: thisMonth,
    lastMonth,
    counts: current.counts || {},
    lastCounts: previous.counts || {},
    costUsd: sum(current.costUsdByDay),
    costUsdByKind: current.costUsdByKind || {},
  };
}
