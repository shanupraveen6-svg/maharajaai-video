'use client';

import { useEffect, useState } from 'react';
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
export type PlatformSpend = { todayInr: number; clientCapInr: number | null; platformCapInr: number | null };

const RETRY_ALLOWANCE = 0.15;

const inr = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;

/** Effective credits: a module that is off, or whose device is off, counts as not in the plan. */
function planLimit(client: OverviewClient, key: ModuleKey) {
  return resolveAccess(client.devices, client.modules).modules[key] ? client.limits[key] : 0;
}

/** What needs doing for one client, most urgent first, each with the action to take. */
function clientAlerts(item: OverviewClient, platform?: PlatformSpend | null) {
  const alerts: Array<{ text: string; tone: 'danger' | 'warn' }> = [];
  for (const status of creditStatusesOf(item)) {
    if (status.level === 'exhausted') alerts.push({ text: `${status.label} credits finished: top up`, tone: 'danger' });
    else if (status.level === 'critical' || status.level === 'low') alerts.push({ text: `${status.label}: ${(status.limit - status.used).toLocaleString('en-IN')} credits left`, tone: 'warn' });
  }
  if (!item.logins?.length) alerts.push({ text: 'No store login yet: create one', tone: 'warn' });
  const clientCap = platform?.clientCapInr;
  if (clientCap && item.spend && item.spend.todayInr >= clientCap) alerts.push({ text: 'Daily AI cap reached, AI paused till midnight', tone: 'danger' });
  else if (clientCap && item.spend && item.spend.todayInr >= clientCap * 0.8) alerts.push({ text: `${inr(item.spend.todayInr)} of the ${inr(clientCap)} daily AI cap used`, tone: 'warn' });
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
  const alertsById = new Map(clients.map((item) => [item.id, clientAlerts(item, platform)]));
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

      <GenlookCredits />
    </div>
  );
}

/** GenLook (the Try-On engine): its balance, the credits locked to stores, and what is left to give out. */
function GenlookCredits() {
  type Store = { clientId: string; name: string; allowance: number; used: number; left: number };
  const [state, setState] = useState<{ balance?: number; locked?: number; free?: number; stores?: Store[]; error?: string } | null>(null);
  useEffect(() => {
    fetch('/api/admin/genlook', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => setState({
        balance: typeof data?.creditBalance === 'number' ? data.creditBalance : undefined,
        locked: typeof data?.locked === 'number' ? data.locked : undefined,
        free: typeof data?.free === 'number' ? data.free : undefined,
        stores: Array.isArray(data?.stores) ? data.stores : [],
        error: data?.error,
      }))
      .catch(() => setState({ error: 'GenLook could not be checked.' }));
  }, []);
  const number = (value?: number) => (value === undefined ? '—' : value.toLocaleString('en-IN'));
  return (
    <section className="tf-card p-5">
      <h2 className="text-lg font-bold">Try-On engine credits (GenLook)</h2>
      <dl className="mt-3 grid grid-cols-3 gap-3">
        <div><dt className="text-[13px] text-muted">GenLook balance</dt><dd className="mt-1 text-3xl font-bold tabular-nums">{state === null ? '…' : number(state.balance)}</dd></div>
        <div><dt className="text-[13px] text-muted">Locked for stores</dt><dd className="mt-1 text-3xl font-bold tabular-nums">{state === null ? '…' : number(state.locked)}</dd></div>
        <div><dt className="text-[13px] text-muted">Free (the demo uses this)</dt><dd className={`mt-1 text-3xl font-bold tabular-nums ${(state?.free ?? 0) < 0 ? 'text-danger' : ''}`}>{state === null ? '…' : number(state.free)}</dd></div>
      </dl>
      {state?.error && <p className="mt-3 text-sm font-semibold text-danger">{state.error}</p>}
      {(state?.free ?? 0) < 0 && <p className="mt-3 text-sm font-semibold text-danger">GenLook has fewer credits than stores are promised. Top up GenLook.</p>}
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
