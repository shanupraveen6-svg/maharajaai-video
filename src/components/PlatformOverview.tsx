'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
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
    ['AI Videos', sum((item) => item.usage.video).toLocaleString('en-IN'), `${sum((item) => item.usage.goLive || 0).toLocaleString('en-IN')} sent to Go Live`],
    ['Western Try-On', sum((item) => item.usage.live).toLocaleString('en-IN'), 'live sessions'],
  ];

  return (
    <div className="space-y-4">

      {/* The platform at a glance: four numbers in one strip. */}
      <section className="tf-card grid grid-cols-2 divide-line p-0 lg:grid-cols-4 lg:divide-x">
        {totals.map(([label, value, note]) => (
          <article key={label} className="px-5 py-4">
            <p className="text-[13px] font-medium text-muted">{label}</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums">{value}</p>
            <p className="text-[12px] text-subtle">{note}</p>
          </article>
        ))}
      </section>

      <section className="tf-card px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-bold">
          {attention.length ? <AlertTriangle className="h-5 w-5 text-warn" /> : <CheckCircle2 className="h-5 w-5 text-success" />}
          {attention.length ? `Needs action (${attention.length})` : 'All clients are fine: credits and logins are in order'}
        </h2>
        {attention.length === 0 ? null : (
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
          <h2 className="text-lg font-bold">Clients</h2>
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

      {/* TryFocus's own vendor balances (GenLook, fal.ai, Gemini, FASHN): kept out of the way, closed by default. */}
      <details className="tf-card p-5">
        <summary className="cursor-pointer text-lg font-bold">Engine balances (TryFocus vendors)</summary>
        <div className="mt-4"><EngineCredits /></div>
      </details>
    </div>
  );
}

type Engine = 'genlook' | 'fal' | 'gemini' | 'fashn';
type TopUp = { id: string; at: string; note?: string; credits?: number; paidUsd?: number; usd?: number; enteredAmount?: number; enteredCurrency?: 'usd' | 'inr' };
type EngineRow = { purchased?: number; used?: number; free?: number; configured: boolean; topUps: TopUp[]; liveApiBalance?: number; locked?: number };

const ENGINES: Array<{ id: Engine; name: string; usedFor: string; unit: 'credits' | 'usd' }> = [
  { id: 'genlook', name: 'GenLook', usedFor: 'Try-On', unit: 'credits' },
  { id: 'fal', name: 'fal.ai', usedFor: 'AI Video, Live Mirror, Try-On backup', unit: 'usd' },
  { id: 'gemini', name: 'Google Gemini', usedFor: 'AI Video portrait, Try-On backup', unit: 'usd' },
  { id: 'fashn', name: 'FASHN', usedFor: 'Try-On backup', unit: 'usd' },
];

/**
 * Every AI vendor in one table: what TryFocus has logged paying it, what the stores used, what is free.
 * GenLook counts credits; fal, Gemini and FASHN count dollars (a top-up can be entered in rupees). The
 * top-up form opens only for the row whose button is tapped, so the table stays compact.
 */
function EngineCredits() {
  const [rows, setRows] = useState<Partial<Record<Engine, EngineRow>>>({});
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<Engine | null>(null);
  const [history, setHistory] = useState<Engine | null>(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'usd' | 'inr'>('usd');
  const [paidUsd, setPaidUsd] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [genlook, vendors] = await Promise.all([
      fetch('/api/admin/genlook', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch('/api/admin/api-ledger', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    ]);
    const next: Partial<Record<Engine, EngineRow>> = {};
    if (genlook) next.genlook = {
      purchased: genlook.purchased, used: genlook.usedEverywhere, free: genlook.free, locked: genlook.locked,
      liveApiBalance: genlook.liveApiBalance, configured: genlook.configured !== false, topUps: genlook.topUps || [],
    };
    for (const id of ['fal', 'gemini', 'fashn'] as const) {
      const v = vendors?.providers?.[id];
      if (v) next[id] = { purchased: v.purchasedUsd, used: v.usedUsd, free: v.freeUsd, configured: v.configured !== false, topUps: v.topUps || [] };
    }
    setRows(next);
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  function openTopUp(id: Engine) {
    setOpen(open === id ? null : id);
    setAmount(''); setPaidUsd(''); setNote(''); setCurrency('usd'); setError('');
  }

  async function save(engine: (typeof ENGINES)[number]) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value === 0) { setError(engine.unit === 'credits' ? 'Enter how many credits were added.' : 'Enter how much was paid.'); return; }
    setSaving(true); setError('');
    try {
      const res = engine.id === 'genlook'
        ? await fetch('/api/admin/genlook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credits: value, ...(paidUsd.trim() ? { paidUsd: Number(paidUsd) } : {}), ...(note.trim() ? { note: note.trim() } : {}) }) })
        : await fetch('/api/admin/api-ledger', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: engine.id, amount: value, currency, ...(note.trim() ? { note: note.trim() } : {}) }) });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not log the top-up.');
      setOpen(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not log the top-up.');
    } finally {
      setSaving(false);
    }
  }

  const fmt = (unit: 'credits' | 'usd', value?: number) => value === undefined ? '—'
    : unit === 'credits' ? value.toLocaleString('en-IN') : `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  const state = (row?: EngineRow): [string, 'success' | 'warn' | 'danger' | 'neutral'] => {
    if (!row) return ['…', 'neutral'];
    if (!row.configured) return ['No key', 'neutral'];
    if (!row.purchased) return ['Log a top-up', 'warn'];
    if ((row.free ?? 0) <= 0) return ['Top up now', 'danger'];
    if ((row.free ?? 0) < row.purchased * 0.2) return ['Running low', 'warn'];
    return ['Good', 'success'];
  };

  return (
    <section className="tf-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Engine credits</h2>
        <p className="text-[13px] text-muted">What TryFocus paid each AI vendor, and what the stores used</p>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-[12px] font-semibold text-muted">
            <tr><th className="py-1.5 pr-3">Engine</th><th className="py-1.5 pr-3 text-right">Purchased</th><th className="py-1.5 pr-3 text-right">Used</th><th className="py-1.5 pr-3 text-right">Free</th><th className="py-1.5 pr-3" /><th className="py-1.5" /></tr>
          </thead>
          <tbody className="border-t border-line">
            {ENGINES.map((engine) => {
              const row = rows[engine.id];
              const [word, tone] = state(row);
              const matches = engine.id === 'genlook' && typeof row?.liveApiBalance === 'number' && row.liveApiBalance === row.free;
              return (
                <Fragment key={engine.id}>
                  <tr className="border-b border-line align-middle">
                    <td className="py-2.5 pr-3">
                      <span className="font-semibold text-ink">{engine.name}</span> <span className="text-muted">· {engine.usedFor}</span>
                      {engine.id === 'genlook' && typeof row?.liveApiBalance === 'number' && (
                        <span className={`block text-[12px] ${matches ? 'text-success' : 'text-warn'}`}>GenLook&apos;s own account: {row.liveApiBalance.toLocaleString('en-IN')}{matches ? ' · matches' : ' · does not match, check for a missed top-up'}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{loaded ? fmt(engine.unit, row?.purchased) : '…'}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{loaded ? fmt(engine.unit, row?.used) : '…'}</td>
                    <td className={`py-2.5 pr-3 text-right font-bold tabular-nums ${(row?.free ?? 0) < 0 ? 'text-danger' : 'text-ink'}`}>{loaded ? fmt(engine.unit, row?.free) : '…'}</td>
                    <td className="py-2.5 pr-3"><StatusPill tone={tone}>{word}</StatusPill></td>
                    <td className="py-2.5 text-right">
                      <span className="inline-flex gap-1.5">
                        {Boolean(row?.topUps.length) && <button type="button" onClick={() => setHistory(history === engine.id ? null : engine.id)} className="min-h-9 rounded-lg px-2.5 text-[13px] font-semibold text-muted hover:text-ink">History</button>}
                        <button type="button" onClick={() => openTopUp(engine.id)} aria-expanded={open === engine.id} className="min-h-9 rounded-lg border border-line-strong px-3 text-[13px] font-semibold text-ink hover:border-ink">{open === engine.id ? 'Cancel' : 'Add top-up'}</button>
                      </span>
                    </td>
                  </tr>
                  {open === engine.id && (
                    <tr className="border-b border-line bg-canvas">
                      <td colSpan={6} className="px-3 py-3">
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="text-[12px] font-semibold text-muted">{engine.unit === 'credits' ? 'Credits added' : 'Amount paid'}
                            <span className="mt-1 flex">
                              {engine.unit === 'usd' && (
                                <select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value === 'inr' ? 'inr' : 'usd')} className="h-10 rounded-l-xl border border-r-0 border-line bg-white px-2 text-sm font-bold text-ink">
                                  <option value="usd">$</option><option value="inr">₹</option>
                                </select>
                              )}
                              <input type="number" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={engine.unit === 'credits' ? '500' : currency === 'inr' ? '4900' : '50'} className={`h-10 w-28 border border-line bg-white px-3 tabular-nums text-sm font-bold text-ink outline-none focus:border-brand ${engine.unit === 'usd' ? 'rounded-r-xl' : 'rounded-xl'}`} />
                            </span>
                          </label>
                          {engine.unit === 'credits' && (
                            <label className="text-[12px] font-semibold text-muted">$ paid (optional)
                              <input type="number" value={paidUsd} onChange={(e) => setPaidUsd(e.target.value)} placeholder="20" className="mt-1 block h-10 w-24 rounded-xl border border-line bg-white px-3 tabular-nums text-sm font-bold text-ink outline-none focus:border-brand" />
                            </label>
                          )}
                          <label className="min-w-[160px] flex-1 text-[12px] font-semibold text-muted">Note (optional)
                            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nov top-up" className="mt-1 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand" />
                          </label>
                          <button type="button" disabled={saving} onClick={() => void save(engine)} className="h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save top-up'}</button>
                        </div>
                        {error && <p className="mt-2 text-sm font-semibold text-danger">{error}</p>}
                      </td>
                    </tr>
                  )}
                  {history === engine.id && row && (
                    <tr className="border-b border-line">
                      <td colSpan={6} className="px-3 py-2">
                        <ul className="divide-y divide-line text-[13px]">
                          {row.topUps.map((item) => (
                            <li key={item.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                              <span>{new Date(item.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{item.note ? ` · ${item.note}` : ''}</span>
                              <span className="tabular-nums text-muted">{engine.unit === 'credits'
                                ? `+${(item.credits ?? 0).toLocaleString('en-IN')} credits${typeof item.paidUsd === 'number' ? ` · $${item.paidUsd}` : ''}`
                                : item.enteredCurrency === 'inr'
                                  ? `₹${(item.enteredAmount ?? 0).toLocaleString('en-IN')} ($${(item.usd ?? 0).toFixed(2)})`
                                  : `$${(item.usd ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
