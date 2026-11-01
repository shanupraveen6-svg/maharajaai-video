import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb, getMockStore } from '@/lib/firebase/admin';
import { activeClientId } from './client-context';

/**
 * Customers who saved a Try-On look, an AI Video or a Live Mirror video. Before any download the customer
 * gives a WhatsApp number; the store keeps it as a lead in its own workspace at
 * `clientWorkspaces/<clientId>/leads/<phone hash>`, one record per number.
 *
 * Marketing consent is separate and optional (India's DPDP Act asks for consent that is specific and not a
 * condition of the service): only numbers with `marketingConsent` may get the store's offers.
 *
 * The number then unlocks downloads for that customer through a signed lead token, which the download
 * route checks, so a download cannot skip the form.
 */
export type LeadSource = 'try-on' | 'ai-video' | 'live-mirror' | 'tv-looks';

export type CustomerLead = {
  id: string;
  phone: string;
  marketingConsent: boolean;
  marketingConsentAt?: string | null;
  sources: LeadSource[];
  downloads: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

export const LEAD_SOURCES: LeadSource[] = ['try-on', 'ai-video', 'live-mirror', 'tv-looks'];
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** A 10-digit Indian mobile number (starts with 6–9), from "+91 98765 43210", "098765 43210" and the like. */
export function normalizeIndianMobile(raw: unknown) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : '';
}

export function maskMobile(phone: string) {
  return phone.length === 10 ? `${phone.slice(0, 2)}******${phone.slice(-2)}` : '';
}

function secret() {
  return process.env.OPERATOR_AUTH_SECRET?.trim() || 'tryfocus-maharaja-local-dev-secret';
}

function leadId(clientId: string, phone: string) {
  return crypto.createHmac('sha256', secret()).update(`lead:${clientId}:${phone}`).digest('hex').slice(0, 32);
}

function sign(payload: string) {
  return crypto.createHmac('sha256', secret()).update(`lead-token:${payload}`).digest('base64url');
}

/** A download token for one customer of one store, valid for a day. */
export function issueLeadToken(clientId: string, id: string, now = Date.now()) {
  const payload = `${clientId}.${id}.${now + TOKEN_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

/** The lead a token belongs to, when it is genuine, unexpired and for this store. */
export function verifyLeadToken(token: unknown, clientId = activeClientId(), now = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 4) return null;
  const [tokenClient, id, expires, signature] = parts;
  const expected = sign(parts.slice(0, 3).join('.'));
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  if (tokenClient !== clientId || !(Number(expires) > now)) return null;
  return { clientId: tokenClient, leadId: id };
}

/** Saves (or updates) the customer's number in the store's leads and returns its download token. */
export async function recordLead({ phone, marketingConsent, source, clientId = activeClientId() }: {
  phone: string;
  marketingConsent: boolean;
  source: LeadSource;
  clientId?: string;
}) {
  const id = leadId(clientId, phone);
  const nowIso = new Date().toISOString();
  const db = getDb();
  if (db) {
    const ref = db.collection('clientWorkspaces').doc(clientId).collection('leads').doc(id);
    await db.runTransaction(async (transaction) => {
      const existing = (await transaction.get(ref)).data() as CustomerLead | undefined;
      transaction.set(ref, {
        id,
        phone,
        sources: FieldValue.arrayUnion(source),
        lastSeenAt: nowIso,
        ...(existing ? {} : { firstSeenAt: nowIso, downloads: 0 }),
        // A customer who ticks the box once stays opted in until they ask the store to stop.
        ...(marketingConsent && !existing?.marketingConsent ? { marketingConsent: true, marketingConsentAt: nowIso } : {}),
        ...(!existing && !marketingConsent ? { marketingConsent: false } : {}),
      }, { merge: true });
    });
  } else {
    const store = getMockStore().leads;
    const key = `${clientId}:${id}`;
    const existing = store.get(key) as CustomerLead | undefined;
    store.set(key, {
      id,
      phone,
      marketingConsent: Boolean(existing?.marketingConsent || marketingConsent),
      marketingConsentAt: existing?.marketingConsent ? existing.marketingConsentAt : marketingConsent ? nowIso : null,
      sources: Array.from(new Set([...(existing?.sources || []), source])),
      downloads: existing?.downloads || 0,
      firstSeenAt: existing?.firstSeenAt || nowIso,
      lastSeenAt: nowIso,
    });
  }
  return { leadId: id, token: issueLeadToken(clientId, id) };
}

/** Counts a download against the customer's lead. */
export async function countLeadDownload(id: string, clientId = activeClientId()) {
  const db = getDb();
  if (db) {
    await db.collection('clientWorkspaces').doc(clientId).collection('leads').doc(id)
      .set({ downloads: FieldValue.increment(1), lastSeenAt: new Date().toISOString() }, { merge: true });
    return;
  }
  const key = `${clientId}:${id}`;
  const existing = getMockStore().leads.get(key);
  if (existing) getMockStore().leads.set(key, { ...existing, downloads: Number(existing.downloads || 0) + 1, lastSeenAt: new Date().toISOString() });
}

export async function listLeads(clientId = activeClientId()): Promise<CustomerLead[]> {
  const db = getDb();
  const leads: CustomerLead[] = db
    ? (await db.collection('clientWorkspaces').doc(clientId).collection('leads').get()).docs.map((doc) => ({ ...(doc.data() as CustomerLead), id: doc.id }))
    : Array.from(getMockStore().leads.entries()).filter(([key]) => key.startsWith(`${clientId}:`)).map(([, value]) => value as CustomerLead);
  return leads.sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)));
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  // A leading =, +, - or @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function leadsCsv(leads: CustomerLead[]) {
  const rows = [['WhatsApp number', 'Offers allowed', 'Offers allowed on', 'Used', 'Downloads', 'First seen', 'Last seen']];
  for (const lead of leads) {
    rows.push([
      // Digits only (country code first), so spreadsheets and WhatsApp tools read it as a number.
      `91${lead.phone}`,
      lead.marketingConsent ? 'Yes' : 'No',
      lead.marketingConsentAt || '',
      (lead.sources || []).join(' / '),
      String(lead.downloads || 0),
      lead.firstSeenAt || '',
      lead.lastSeenAt || '',
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}
