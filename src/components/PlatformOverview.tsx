'use client';

import { AlertTriangle, ArrowRight, Store } from 'lucide-react';
import { creditStatuses } from '@/lib/maharaja/credits';
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
  usage: { image: number; live: number; video: number; passes?: number; goLive?: number; downloads?: number; scans?: number };
  limits: { image: number; live: number; video: number };
  /** Estimated AI spend in rupees (see usage-ledger.ts). */
  spend?: { todayInr: number; monthInr: number };
};

/** Today's estimated AI spend across every client, with the daily caps. */
export type PlatformSpend = { todayInr: number; clientCapInr: number | null; platformCapInr: number | null };

const inr = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;

const MODULES: Array<[ModuleKey, string]> = [['image', 'Try-On'], ['video', 'AI Video'], ['live', 'Live Mirror']];

/** Effective credits: a module that is off, or whose device is off, counts as not in the plan. */
function planLimit(client: OverviewClient, key: ModuleKey) {
  return resolveAccess(client.devices, client.modules).modules[key] ? client.limits[key] : 0;
}

/**
 * TryFocus platform view shown when no client is selected: totals across every workspace, what needs
 * attention (credits, WhatsApp requests, missing logins, paused stores) and a row per client.
 */
export default function PlatformOverview({ clients, platform, onSelect }: { clients: OverviewClient[]; platform?: PlatformSpend | null; onSelect: (clientId: string) => void }) {
  const active = clients.filter((item) => item.status === 'Active').length;
  const sum = (pick: (item: OverviewClient) => number) => clients.reduce((total, item) => total + pick(item), 0);
  const credits = (item: OverviewClient) => creditStatuses(
    { tryOnGenerated: item.usage.image, liveSessions: item.usage.live, videosGenerated: item.usage.video },
    { image: planLimit(item, 'image'), live: planLimit(item, 'live'), video: planLimit(item, 'video') },
  );

  const attention: Array<{ client: OverviewClient; text: string; tone: 'red' | 'amber' }> = [];
  for (const item of clients) {
    for (const status of credits(item)) {
      if (status.level === 'exhausted') attention.push({ client: item, text: `${status.label} credits used up`, tone: 'red' });
      else if (status.level === 'critical' || status.level === 'low') attention.push({ client: item, text: `${status.label}: ${status.limit - status.used} credits left`, tone: 'amber' });
    }
    if (!item.logins?.length) attention.push({ client: item, text: 'No client login yet', tone: 'amber' });
    const clientCap = platform?.clientCapInr;
    if (clientCap && item.spend && item.spend.todayInr >= clientCap) attention.push({ client: item, text: 'Daily AI spending cap reached; AI is paused until midnight', tone: 'red' });
    else if (clientCap && item.spend && item.spend.todayInr >= clientCap * 0.8) attention.push({ client: item, text: `${inr(item.spend.todayInr)} of the ${inr(clientCap)} daily AI cap used`, tone: 'amber' });
    if (item.status === 'Paused') attention.push({ client: item, text: 'Workspace paused', tone: 'amber' });
  }

  const kpis: Array<[string, string, string]> = [
    ['Client workspaces', String(clients.length), `${active} active · ${clients.length - active} paused`],
    ['Try-On images', sum((item) => item.usage.image).toLocaleString('en-IN'), `${sum((item) => item.usage.scans || 0).toLocaleString('en-IN')} QR opens`],
    ['AI videos', sum((item) => item.usage.video).toLocaleString('en-IN'), `${sum((item) => item.usage.passes || 0).toLocaleString('en-IN')} video passes issued`],
    ['Go Live plays queued', sum((item) => item.usage.goLive || 0).toLocaleString('en-IN'), `${sum((item) => item.usage.downloads || 0).toLocaleString('en-IN')} downloads`],
    ['Live Mirror sessions', sum((item) => item.usage.live).toLocaleString('en-IN'), '60-second sessions'],
    ['AI cost today (est.)', inr(platform?.todayInr || 0), platform?.platformCapInr ? `Cap ${inr(platform.platformCapInr)} a day` : 'No daily cap set'],
    ['AI cost this month (est.)', inr(sum((item) => item.spend?.monthInr || 0)), 'From the AI_COST_* estimates'],
    ['Needs attention', String(attention.length), attention.length ? 'See the list below' : 'All clients healthy'],
  ];
  if (clients[0] && platform?.platformCapInr && platform.todayInr >= platform.platformCapInr) {
    attention.unshift({ client: clients[0], text: 'Platform daily AI cap reached: every store is paused until midnight', tone: 'red' });
  }

  const adoption = MODULES.map(([key, label]) => [label, clients.filter((item) => planLimit(item, key) > 0).length] as const);
  const packages = (['tv', 'tablet', 'tv-tablet', 'phone'] as const)
    .map((id) => [PACKAGES[id].label, clients.filter((item) => packageOf(item.devices) === id).length] as const)
    .filter(([label, count]) => label !== PACKAGES.phone.label || count > 0);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(([label, value, note]) => (
          <article key={label} className="tf-card p-5">
            <p className="text-[13px] font-medium text-muted">{label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
            <p className="mt-1 text-[13px] text-subtle">{note}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="tf-card p-5">
          <h2 className="flex items-center gap-2 text-xl font-bold"><AlertTriangle className="h-5 w-5 text-warn" /> Needs attention</h2>
          {attention.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing needs action right now.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[#ECEEE9]">
              {attention.map((item, index) => (
                <li key={`${item.client.id}-${index}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold">{item.client.name}</span>
                    <span className={`ml-2 ${item.tone === 'red' ? 'text-[#B42318]' : 'text-[#7A4A0B]'}`}>
                      {item.text}
                    </span>
                  </span>
                  <button type="button" onClick={() => onSelect(item.client.id)} className="flex min-h-10 shrink-0 items-center gap-1 px-2 text-xs font-bold text-brand">
                    Open <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="tf-card p-5">
          <h2 className="text-xl font-bold">What clients bought</h2>
          <p className="mt-3 text-[13px] font-semibold text-muted">Modules</p>
          {adoption.map(([label, count]) => (
            <p key={label} className="mt-1 flex justify-between text-sm"><span>{label}</span><span className="tabular-nums font-bold">{count} / {clients.length}</span></p>
          ))}
          <p className="mt-4 text-xs font-bold text-muted">Packages</p>
          {packages.map(([label, count]) => (
            <p key={label} className="mt-1 flex justify-between text-sm"><span>{label}</span><span className="tabular-nums font-bold">{count} / {clients.length}</span></p>
          ))}
        </article>
      </section>

      <section className="tf-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-canvas text-[13px] font-semibold text-muted">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Status</th>
              {MODULES.map(([, label]) => <th key={label} className="px-4 py-3">{label}</th>)}
              <th className="px-4 py-3">AI cost (month)</th>
              <th className="px-4 py-3">WhatsApp</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {clients.map((item) => (
              <tr key={item.id} className="border-t border-line">
                <td className="px-4 py-3"><span className="flex items-center gap-2 font-semibold"><Store className="h-4 w-4 text-brand" />{item.name}</span><span className="text-xs text-muted">{item.branch}</span></td>
                <td className="px-4 py-3"><span className={item.status === 'Active' ? 'text-[#256B45]' : 'text-[#7A4A0B]'}>{item.status}</span></td>
                {MODULES.map(([key]) => {
                  const limit = planLimit(item, key);
                  return <td key={key} className="px-4 py-3 tabular-nums text-xs">{limit > 0 ? `${item.usage[key].toLocaleString('en-IN')} / ${limit.toLocaleString('en-IN')}` : '—'}</td>;
                })}
                <td className="px-4 py-3 tabular-nums text-xs">{item.spend ? inr(item.spend.monthInr) : '—'}</td>
                <td className="px-4 py-3 text-xs">{item.whatsappConnected ? 'Connected' : '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={() => onSelect(item.id)} className="tf-btn tf-btn-dark !min-h-10 px-4 text-sm">Manage</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
