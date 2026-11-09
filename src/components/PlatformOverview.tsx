'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Store } from 'lucide-react';
import { CREDIT_LEVEL_STATUS, creditStatuses } from '@/lib/maharaja/credits';
import { StatusPill } from '@/components/ui';
import { PACKAGES, packageOf, resolveAccess } from '@/lib/maharaja/access';

type ModuleKey = 'image' | 'live' | 'video';

export type OverviewClient = {
  id: string;
  name: string;
  branch: string;
  status: 'Active' | 'Paused';
  whatsappConnected: boolean;
  logins?: string[];
  devices: { tv: boolean; tablet: boolean; mobile: boolean; led: boolean };
  modules?: { image: boolean; live: boolean; video: boolean };
  usage: { image: number; live: number; video: number; passes?: number; goLive?: number; downloads?: number; scans?: number; retries?: number };
  limits: { image: number; live: number; video: number };
  /** Estimated AI spend in rupees (see usage-ledger.ts). */
  spend?: { todayInr: number; monthInr: number };
};

/** Today's estimated AI spend across every client, with the daily caps. */
export type PlatformSpend = { todayInr: number; platformCapInr: number | null };

const RETRY_ALLOWANCE = 0.15;

const inr = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;

/** Effective credits: a module that is off, or whose device is off, counts as not in the plan. */
function planLimit(client: OverviewClient, key: ModuleKey) {
  return resolveAccess(client.devices, client.modules).modules[key] ? client.limits[key] : 0;
}

/** What needs doing for one client, most urgent first, each with the action to take. */
function clientAlerts(item: OverviewClient) {
  const alerts: Array<{ text: string; tone: 'danger' | 'warn' }> = [];
  for (const status of creditStatusesOf(item)) {
    // Told at 50%, 70%, 90%, 95% and finished.
    if (status.level === 'exhausted') alerts.push({ text: `${status.label} credits finished: top up`, tone: 'danger' });
    else if (status.level !== 'ok' && status.level !== 'none') alerts.push({ text: `${status.label}: ${status.pct}% used, ${(status.limit - status.used).toLocaleString('en-IN')} credits left`, tone: status.level === 'critical' || status.level === 'final' ? 'danger' : 'warn' });
  }
  if (!item.logins?.length) alerts.push({ text: 'No store login yet: create one', tone: 'warn' });
  // Prices allow for about 15% retries; above that the store's credits cost us more than planned.
  const results = item.usage.image + item.usage.video;
  const retryRate = results >= 20 ? Number(item.usage.retries || 0) / results : 0;
  if (retryRate > RETRY_ALLOWANCE) alerts.push({ text: `Retries at ${Math.round(retryRate * 100)}% (pricing allows 15%)`, tone: retryRate > 0.25 ? 'danger' : 'warn' });
  return alerts;
}

function creditStatusesOf(item: OverviewClient) {
  return creditStatuses(
    { tryOnGenerated: item.usage.image, liveSessions: item.usage.live, videosGenerated: item.usage.video },
    { image: planLimit(item, 'image'), live: planLimit(item, 'live'), video: planLimit(item, 'video') },
  );
}

/**
 * TryFocus admin status board, shown when no client is picked: four totals, what needs action, and one
 * card per client with its status. Cards wrap; nothing scrolls sideways.
 */
export default function PlatformOverview({ clients, platform, onSelect }: { clients: OverviewClient[]; platform?: PlatformSpend | null; onSelect: (clientId: string) => void }) {
  const live = clients.filter((item) => item.status === 'Active').length;
  const sum = (pick: (item: OverviewClient) => number) => clients.reduce((total, item) => total + pick(item), 0);
  const alertsById = new Map(clients.map((item) => [item.id, clientAlerts(item)]));
  const attention = clients.flatMap((item) => (alertsById.get(item.id) || []).map((alert) => ({ client: item, ...alert })));
  if (clients[0] && platform?.platformCapInr && platform.todayInr >= platform.platformCapInr) {
    attention.unshift({ client: clients[0], text: 'Platform daily AI cap reached: every store is paused till midnight', tone: 'danger' });
  }
  attention.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'danger' ? -1 : 1));

  const packages = (['tv-tablet', 'tv', 'tablet', 'phone'] as const)
    .map((id) => [PACKAGES[id].label, clients.filter((item) => packageOf(item.devices) === id).length] as const)
    .filter(([, count]) => count > 0);

  const totals: Array<[string, string, string]> = [
    ['Clients', String(clients.length), `${live} live · ${clients.length - live} paused`],
    ['Try-On looks', sum((item) => item.usage.image).toLocaleString('en-IN'), `${sum((item) => item.usage.scans || 0).toLocaleString('en-IN')} QR opens · ${sum((item) => item.usage.downloads || 0).toLocaleString('en-IN')} downloads`],
    ['AI Videos', sum((item) => item.usage.video).toLocaleString('en-IN'), `${sum((item) => item.usage.goLive || 0).toLocaleString('en-IN')} sent to Go Live · ${sum((item) => item.usage.live).toLocaleString('en-IN')} Live Mirror`],
    ['AI cost this month', inr(sum((item) => item.spend?.monthInr || 0)), `${inr(platform?.todayInr || 0)} today${platform?.platformCapInr ? ` · cap ${inr(platform.platformCapInr)} a day` : ''}`],
  ];

  return (
    <div className="space-y-6">
      {/* The fuel for the whole business: every AI vendor's credits, first and most prominent. */}
      <section>
        <h2 className="text-xl font-bold">Engine credits</h2>
        <p className="mt-1 text-[13px] text-muted">What has actually been paid to each AI vendor, and what every store&apos;s use of it has cost.</p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <GenlookCredits />
          <ApiVendorCredits provider="fal" />
          <ApiVendorCredits provider="gemini" />
          <ApiVendorCredits provider="fashn" />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {totals.map(([label, value, note]) => (
          <article key={label} className="tf-card p-5">
            <p className="text-[13px] font-medium text-muted">{label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
            <p className="mt-1 text-[13px] text-subtle">{note}</p>
          </article>
        ))}
      </section>

      <section className="tf-card p-5">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          {attention.length ? <AlertTriangle className="h-5 w-5 text-warn" /> : <CheckCircle2 className="h-5 w-5 text-success" />}
          {attention.length ? `Needs action (${attention.length})` : 'All clients are fine'}
        </h2>
        {attention.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Credits, logins and AI spend are in order for every client.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {attention.map((item, index) => (
              <li key={`${item.client.id}-${index}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-semibold">{item.client.name}</span>
                  <span className={`ml-2 ${item.tone === 'danger' ? 'text-danger' : 'text-warn'}`}>{item.text}</span>
                </span>
                <button type="button" onClick={() => onSelect(item.client.id)} className="flex min-h-10 shrink-0 items-center gap-1 px-2 text-sm font-bold text-ink">
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-xl font-bold">Clients</h2>
          {packages.length > 0 && <p className="text-sm text-muted">{packages.map(([label, count]) => `${count} ${label}`).join(' · ')}</p>}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((item) => {
            const alerts = alertsById.get(item.id) || [];
            const statuses = creditStatusesOf(item).filter((status) => status.level !== 'none');
            return (
              <article key={item.id} className="tf-card flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-bold text-ink"><Store className="h-4 w-4 shrink-0 text-muted" /><span className="truncate">{item.name}</span></p>
                    <p className="mt-0.5 truncate text-sm text-muted">{item.branch} · {PACKAGES[packageOf(item.devices)].label}</p>
                  </div>
                  <StatusPill tone={item.status === 'Active' ? 'success' : 'neutral'}>{item.status === 'Active' ? 'Live' : 'Paused'}</StatusPill>
                </div>
                <dl className="mt-4 space-y-1.5 text-sm">
                  {statuses.map((status) => (
                    <div key={status.label} className="flex items-center justify-between gap-3">
                      <dt className="text-muted">{status.label}</dt>
                      <dd className="flex items-center gap-2"><span className="tabular-nums">{Math.max(0, status.limit - status.used).toLocaleString('en-IN')} left</span><StatusPill tone={CREDIT_LEVEL_STATUS[status.level].tone}>{CREDIT_LEVEL_STATUS[status.level].text}</StatusPill></dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-3"><dt className="text-muted">Store login</dt><dd>{item.logins?.length ? item.logins[0] : <span className="text-warn">Not set</span>}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-muted">AI cost this month</dt><dd className="tabular-nums">{item.spend ? inr(item.spend.monthInr) : '—'}</dd></div>
                </dl>
                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                  <span className={`text-sm ${alerts.length ? 'text-warn' : 'text-success'}`}>{alerts.length ? `${alerts.length} to do` : 'All fine'}</span>
                  <button type="button" onClick={() => onSelect(item.id)} className="tf-btn tf-btn-dark !min-h-10 px-4 text-sm">Manage</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

    </div>
  );
}

type GenlookTopUp = { id: string; credits: number; paidUsd?: number; note?: string; at: string };
type GenlookStore = { clientId: string; name: string; allowance: number; used: number; left: number };
type GenlookState = {
  purchased?: number; usedEverywhere?: number; locked?: number; free?: number; liveApiBalance?: number;
  stores?: GenlookStore[]; topUps?: GenlookTopUp[]; error?: string;
};

/**
 * GenLook (the Try-On engine). The headline numbers come from TryFocus's own top-up log — what was
 * actually paid for, minus what every store has used — not from GenLook's balance API; that API's
 * figure is still shown underneath, only so a mismatch is easy to spot.
 */
function GenlookCredits() {
  const [state, setState] = useState<GenlookState | null>(null);
  const [addingCredits, setAddingCredits] = useState('');
  const [addingUsd, setAddingUsd] = useState('');
  const [addingNote, setAddingNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = () => fetch('/api/admin/genlook', { cache: 'no-store' })
    .then((response) => response.json())
    .then((data) => setState({
      purchased: typeof data?.purchased === 'number' ? data.purchased : undefined,
      usedEverywhere: typeof data?.usedEverywhere === 'number' ? data.usedEverywhere : undefined,
      locked: typeof data?.locked === 'number' ? data.locked : undefined,
      free: typeof data?.free === 'number' ? data.free : undefined,
      liveApiBalance: typeof data?.liveApiBalance === 'number' ? data.liveApiBalance : undefined,
      stores: Array.isArray(data?.stores) ? data.stores : [],
      topUps: Array.isArray(data?.topUps) ? data.topUps : [],
      error: data?.error,
    }))
    .catch(() => setState({ error: 'GenLook could not be checked.' }));

  useEffect(() => { load(); }, []);

  async function addTopUp() {
    const credits = Number(addingCredits);
    if (!Number.isFinite(credits) || credits === 0) {
      setSaveError('Enter how many credits this top-up added.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/admin/genlook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credits,
          ...(addingUsd.trim() ? { paidUsd: Number(addingUsd) } : {}),
          ...(addingNote.trim() ? { note: addingNote.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not log the top-up.');
      setAddingCredits(''); setAddingUsd(''); setAddingNote('');
      await load();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not log the top-up.');
    } finally {
      setSaving(false);
    }
  }

  const number = (value?: number) => (value === undefined ? '—' : value.toLocaleString('en-IN'));
  return (
    <section className="tf-card p-5">
      <h2 className="text-lg font-bold">Try-On engine credits (GenLook)</h2>
      <p className="mt-1 text-[13px] text-muted">What TryFocus has logged paying GenLook for, not GenLook&apos;s own balance figure.</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><dt className="text-[13px] text-muted">Purchased</dt><dd className="mt-1 text-3xl font-bold tabular-nums">{state === null ? '…' : number(state.purchased)}</dd></div>
        <div><dt className="text-[13px] text-muted">Used (every store)</dt><dd className="mt-1 text-3xl font-bold tabular-nums">{state === null ? '…' : number(state.usedEverywhere)}</dd></div>
        <div><dt className="text-[13px] text-muted">Locked for stores</dt><dd className="mt-1 text-3xl font-bold tabular-nums">{state === null ? '…' : number(state.locked)}</dd></div>
        <div><dt className="text-[13px] text-muted">Free (Maharaja uses this)</dt><dd className={`mt-1 text-3xl font-bold tabular-nums ${(state?.free ?? 0) < 0 ? 'text-danger' : ''}`}>{state === null ? '…' : number(state.free)}</dd></div>
      </dl>
      {typeof state?.purchased === 'number' && typeof state?.usedEverywhere === 'number' && (
        <p className="mt-2 text-sm font-semibold text-muted tabular-nums">{number((state.purchased) - (state.usedEverywhere))} / {number(state.purchased)} left overall</p>
      )}
      {typeof state?.liveApiBalance === 'number' && (
        <p className="mt-1 text-[13px] text-muted">GenLook&apos;s own account says {number(state.liveApiBalance)} left{Math.abs(state.liveApiBalance - ((state.purchased ?? 0) - (state.usedEverywhere ?? 0))) > 0 ? ' — doesn’t match the log above; check for a missed top-up or a use outside this project.' : '.'}</p>
      )}
      {state?.error && <p className="mt-3 text-sm font-semibold text-danger">{state.error}</p>}
      {(state?.free ?? 0) < 0 && <p className="mt-3 text-sm font-semibold text-danger">GenLook has fewer credits than stores are promised. Top up GenLook.</p>}

      <div className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl bg-canvas p-3">
        <div>
          <label htmlFor="genlook-topup-credits" className="block text-[12px] font-semibold text-muted">Credits added</label>
          <input id="genlook-topup-credits" type="number" value={addingCredits} onChange={(e) => setAddingCredits(e.target.value)} placeholder="500" className="h-10 w-28 border border-line bg-white px-3 tabular-nums text-sm font-bold text-ink outline-none focus:border-brand" />
        </div>
        <div>
          <label htmlFor="genlook-topup-usd" className="block text-[12px] font-semibold text-muted">$ paid (optional)</label>
          <input id="genlook-topup-usd" type="number" value={addingUsd} onChange={(e) => setAddingUsd(e.target.value)} placeholder="50" className="h-10 w-24 border border-line bg-white px-3 tabular-nums text-sm font-bold text-ink outline-none focus:border-brand" />
        </div>
        <div className="min-w-[160px] flex-1">
          <label htmlFor="genlook-topup-note" className="block text-[12px] font-semibold text-muted">Note (optional)</label>
          <input id="genlook-topup-note" type="text" value={addingNote} onChange={(e) => setAddingNote(e.target.value)} placeholder="Nov top-up" className="h-10 w-full border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand" />
        </div>
        <button type="button" disabled={saving} onClick={() => void addTopUp()} className="h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Adding…' : 'Add top-up'}</button>
      </div>
      {saveError && <p className="mt-2 text-sm font-semibold text-danger">{saveError}</p>}

      {state?.topUps && state.topUps.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold text-muted">Top-up history ({state.topUps.length})</summary>
          <ul className="mt-2 divide-y divide-line">
            {state.topUps.map((item) => (
              <li key={item.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{new Date(item.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{item.note ? ` · ${item.note}` : ''}</span>
                <span className="tabular-nums text-muted">{item.credits > 0 ? '+' : ''}{item.credits.toLocaleString('en-IN')} credits{typeof item.paidUsd === 'number' ? ` · $${item.paidUsd.toLocaleString('en-US')}` : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {state?.stores && state.stores.length > 0 && (
        <ul className="mt-4 divide-y divide-line text-sm">
          {state.stores.map((store) => (
            <li key={store.clientId} className="flex justify-between gap-3 py-2">
              <span className="font-semibold">{store.name}</span>
              <span className="tabular-nums text-muted">{store.used} of {store.allowance} used · {store.left} left</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const API_PROVIDER_TITLES: Record<'fal' | 'gemini' | 'fashn', string> = {
  fal: 'fal.ai (video, Live Mirror, Try-On backup)',
  gemini: 'Google Gemini (AI Video portrait, Try-On backup)',
  fashn: 'FASHN (Try-On backup)',
};

type ApiTopUp = { id: string; usd: number; enteredAmount: number; enteredCurrency: 'usd' | 'inr'; note?: string; at: string };
type ApiVendorState = { purchasedUsd?: number; usedUsd?: number; freeUsd?: number; configured?: boolean; topUps?: ApiTopUp[]; error?: string };

/**
 * One dollar-billed vendor (fal, Gemini or FASHN): what TryFocus has logged paying it, what every
 * store's use of it has actually cost (attributed from the real event that used it, not a guess), and a
 * form to log a new top-up. The payment can be entered in dollars or rupees — Gemini and FASHN are often
 * billed in rupees on an India account — a dropdown picks which, and everything is still compared in
 * dollars (Purchased/Used/Free), converted at the ₹98/$1 rate. The same idea as GenlookCredits above,
 * just in money instead of credits.
 */
function ApiVendorCredits({ provider }: { provider: 'fal' | 'gemini' | 'fashn' }) {
  const [state, setState] = useState<ApiVendorState | null>(null);
  const [addingAmount, setAddingAmount] = useState('');
  const [addingCurrency, setAddingCurrency] = useState<'usd' | 'inr'>('usd');
  const [addingNote, setAddingNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = useCallback(() => fetch('/api/admin/api-ledger', { cache: 'no-store' })
    .then((response) => response.json())
    .then((data) => setState(data?.providers?.[provider] || { error: 'Not found.' }))
    .catch(() => setState({ error: `${provider} could not be checked.` })), [provider]);

  useEffect(() => { load(); }, [load]);

  async function addTopUp() {
    const amount = Number(addingAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      setSaveError('Enter how much this top-up added.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/admin/api-ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, amount, currency: addingCurrency, ...(addingNote.trim() ? { note: addingNote.trim() } : {}) }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not log the top-up.');
      setAddingAmount(''); setAddingNote('');
      setState(data.providers?.[provider] || state);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not log the top-up.');
    } finally {
      setSaving(false);
    }
  }

  const usd = (value?: number) => (value === undefined ? '—' : `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
  const entered = (item: ApiTopUp) => item.enteredCurrency === 'inr'
    ? `₹${Math.abs(item.enteredAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
    : `$${Math.abs(item.enteredAmount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  return (
    <section className="tf-card p-5">
      <h3 className="text-lg font-bold">{API_PROVIDER_TITLES[provider]}</h3>
      {state?.configured === false && <p className="mt-1 text-[13px] font-semibold text-warn">No API key set for this vendor yet.</p>}
      <dl className="mt-3 grid grid-cols-3 gap-3">
        <div><dt className="text-[13px] text-muted">Purchased</dt><dd className="mt-1 text-2xl font-bold tabular-nums">{state === null ? '…' : usd(state.purchasedUsd)}</dd></div>
        <div><dt className="text-[13px] text-muted">Used</dt><dd className="mt-1 text-2xl font-bold tabular-nums">{state === null ? '…' : usd(state.usedUsd)}</dd></div>
        <div><dt className="text-[13px] text-muted">Free</dt><dd className={`mt-1 text-2xl font-bold tabular-nums ${(state?.freeUsd ?? 0) < 0 ? 'text-danger' : ''}`}>{state === null ? '…' : usd(state.freeUsd)}</dd></div>
      </dl>
      {state?.error && <p className="mt-3 text-sm font-semibold text-danger">{state.error}</p>}
      {(state?.freeUsd ?? 0) < 0 && <p className="mt-3 text-sm font-semibold text-danger">Spend has gone past what was topped up. Add funds.</p>}

      <div className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl bg-canvas p-3">
        <div>
          <label htmlFor={`${provider}-topup-amount`} className="block text-[12px] font-semibold text-muted">Amount paid</label>
          <div className="flex">
            <select
              aria-label="Currency"
              value={addingCurrency}
              onChange={(e) => setAddingCurrency(e.target.value === 'inr' ? 'inr' : 'usd')}
              className="h-10 rounded-l-xl border border-r-0 border-line bg-white px-2 text-sm font-bold text-ink outline-none focus:border-brand"
            >
              <option value="usd">$</option>
              <option value="inr">₹</option>
            </select>
            <input id={`${provider}-topup-amount`} type="number" value={addingAmount} onChange={(e) => setAddingAmount(e.target.value)} placeholder={addingCurrency === 'inr' ? '4900' : '50'} className="h-10 w-28 rounded-r-xl border border-line bg-white px-3 tabular-nums text-sm font-bold text-ink outline-none focus:border-brand" />
          </div>
        </div>
        <div className="min-w-[140px] flex-1">
          <label htmlFor={`${provider}-topup-note`} className="block text-[12px] font-semibold text-muted">Note (optional)</label>
          <input id={`${provider}-topup-note`} type="text" value={addingNote} onChange={(e) => setAddingNote(e.target.value)} placeholder="Nov top-up" className="h-10 w-full border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand" />
        </div>
        <button type="button" disabled={saving} onClick={() => void addTopUp()} className="h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Adding…' : 'Add top-up'}</button>
      </div>
      {saveError && <p className="mt-2 text-sm font-semibold text-danger">{saveError}</p>}

      {state?.topUps && state.topUps.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold text-muted">Top-up history ({state.topUps.length})</summary>
          <ul className="mt-2 divide-y divide-line">
            {state.topUps.map((item) => (
              <li key={item.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{new Date(item.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{item.note ? ` · ${item.note}` : ''}</span>
                <span className="tabular-nums text-muted">{item.usd < 0 ? '-' : '+'}{entered(item)}{item.enteredCurrency === 'inr' ? ` (${usd(Math.abs(item.usd))})` : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
