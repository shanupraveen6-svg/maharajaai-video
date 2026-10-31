'use client';

import { AlertTriangle, ArrowRight, MessageSquare, Store } from 'lucide-react';
import { creditStatuses } from '@/lib/maharaja/credits';

type ModuleKey = 'image' | 'live' | 'video';

export type OverviewClient = {
  id: string;
  name: string;
  branch: string;
  status: 'Active' | 'Paused';
  whatsappConnected: boolean;
  whatsappRequestedAt?: string | null;
  logins?: string[];
  devices: { tv: boolean; tablet: boolean; mobile: boolean; led: boolean };
  modules?: { image: boolean; live: boolean; video: boolean };
  usage: { image: number; live: number; video: number; passes?: number; goLive?: number; downloads?: number; scans?: number };
  limits: { image: number; live: number; video: number };
};

const MODULES: Array<[ModuleKey, string]> = [['image', 'Image Try-On'], ['live', 'Live Mirror'], ['video', 'AI Video']];

/** Effective credits: a module switched off counts as not in the plan. */
function planLimit(client: OverviewClient, key: ModuleKey) {
  return client.modules?.[key] === false ? 0 : client.limits[key];
}

/**
 * TryFocus platform view shown when no client is selected: totals across every workspace, what needs
 * attention (credits, WhatsApp requests, missing logins, paused stores) and a row per client.
 */
export default function PlatformOverview({ clients, onSelect }: { clients: OverviewClient[]; onSelect: (clientId: string) => void }) {
  const active = clients.filter((item) => item.status === 'Active').length;
  const sum = (pick: (item: OverviewClient) => number) => clients.reduce((total, item) => total + pick(item), 0);
  const credits = (item: OverviewClient) => creditStatuses(
    { tryOnGenerated: item.usage.image, liveSessions: item.usage.live, videosGenerated: item.usage.video },
    { image: planLimit(item, 'image'), live: planLimit(item, 'live'), video: planLimit(item, 'video') },
  );

  const attention: Array<{ client: OverviewClient; text: string; tone: 'red' | 'amber' | 'blue' }> = [];
  for (const item of clients) {
    for (const status of credits(item)) {
      if (status.level === 'exhausted') attention.push({ client: item, text: `${status.label} credits used up`, tone: 'red' });
      else if (status.level === 'critical' || status.level === 'low') attention.push({ client: item, text: `${status.label}: ${status.limit - status.used} credits left`, tone: 'amber' });
    }
    if (!item.whatsappConnected && item.whatsappRequestedAt) attention.push({ client: item, text: `Requested WhatsApp on ${new Date(item.whatsappRequestedAt).toLocaleDateString('en-IN')}`, tone: 'blue' });
    if (!item.logins?.length) attention.push({ client: item, text: 'No client login yet', tone: 'amber' });
    if (item.status === 'Paused') attention.push({ client: item, text: 'Workspace paused', tone: 'amber' });
  }

  const kpis: Array<[string, string, string]> = [
    ['Client workspaces', String(clients.length), `${active} active · ${clients.length - active} paused`],
    ['Try-On images', sum((item) => item.usage.image).toLocaleString('en-IN'), `${sum((item) => item.usage.scans || 0).toLocaleString('en-IN')} QR opens`],
    ['AI videos', sum((item) => item.usage.video).toLocaleString('en-IN'), `${sum((item) => item.usage.passes || 0).toLocaleString('en-IN')} video passes issued`],
    ['Go Live plays queued', sum((item) => item.usage.goLive || 0).toLocaleString('en-IN'), `${sum((item) => item.usage.downloads || 0).toLocaleString('en-IN')} downloads`],
    ['Live Mirror sessions', sum((item) => item.usage.live).toLocaleString('en-IN'), '60-second sessions'],
    ['Needs attention', String(attention.length), attention.length ? 'See the list below' : 'All clients healthy'],
  ];

  const adoption = MODULES.map(([key, label]) => [label, clients.filter((item) => planLimit(item, key) > 0).length] as const);
  const devices = (['tv', 'tablet', 'mobile'] as const).map((key) => [key === 'tv' ? 'TV' : key === 'tablet' ? 'Tablet / laptop' : 'Mobile', clients.filter((item) => item.devices[key]).length] as const);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {kpis.map(([label, value, note]) => (
          <article key={label} className="border border-[#D8DCD7] bg-white p-5">
            <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#7A1428]">{label}</p>
            <p className="mt-2 font-serif text-3xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-[#535A56]">{note}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="border border-[#D8DCD7] bg-white p-5">
          <h2 className="flex items-center gap-2 font-serif text-xl font-semibold"><AlertTriangle className="h-5 w-5 text-[#B7791F]" /> Needs attention</h2>
          {attention.length === 0 ? (
            <p className="mt-3 text-sm text-[#535A56]">Nothing needs action right now.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[#ECEEE9]">
              {attention.map((item, index) => (
                <li key={`${item.client.id}-${index}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold">{item.client.name}</span>
                    <span className={`ml-2 ${item.tone === 'red' ? 'text-[#B42318]' : item.tone === 'blue' ? 'text-[#1D4ED8]' : 'text-[#7A4A0B]'}`}>
                      {item.tone === 'blue' && <MessageSquare className="mr-1 inline h-3.5 w-3.5" />}{item.text}
                    </span>
                  </span>
                  <button type="button" onClick={() => onSelect(item.client.id)} className="flex min-h-10 shrink-0 items-center gap-1 px-2 text-xs font-bold uppercase text-[#7A1428]">
                    Open <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="border border-[#D8DCD7] bg-white p-5">
          <h2 className="font-serif text-xl font-semibold">What clients bought</h2>
          <p className="mt-3 font-mono text-[11px] font-bold uppercase tracking-wider text-[#535A56]">Modules</p>
          {adoption.map(([label, count]) => (
            <p key={label} className="mt-1 flex justify-between text-sm"><span>{label}</span><span className="font-mono font-bold">{count} / {clients.length}</span></p>
          ))}
          <p className="mt-4 font-mono text-[11px] font-bold uppercase tracking-wider text-[#535A56]">Devices</p>
          {devices.map(([label, count]) => (
            <p key={label} className="mt-1 flex justify-between text-sm"><span>{label}</span><span className="font-mono font-bold">{count} / {clients.length}</span></p>
          ))}
        </article>
      </section>

      <section className="overflow-x-auto border border-[#D8DCD7] bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[#FAFBF8] font-mono text-[11px] uppercase tracking-wider text-[#535A56]">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Status</th>
              {MODULES.map(([, label]) => <th key={label} className="px-4 py-3">{label}</th>)}
              <th className="px-4 py-3">WhatsApp</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {clients.map((item) => (
              <tr key={item.id} className="border-t border-[#ECEEE9]">
                <td className="px-4 py-3"><span className="flex items-center gap-2 font-semibold"><Store className="h-4 w-4 text-[#7A1428]" />{item.name}</span><span className="text-xs text-[#535A56]">{item.branch}</span></td>
                <td className="px-4 py-3"><span className={item.status === 'Active' ? 'text-[#256B45]' : 'text-[#7A4A0B]'}>{item.status}</span></td>
                {MODULES.map(([key]) => {
                  const limit = planLimit(item, key);
                  return <td key={key} className="px-4 py-3 font-mono text-xs">{limit > 0 ? `${item.usage[key].toLocaleString('en-IN')} / ${limit.toLocaleString('en-IN')}` : '—'}</td>;
                })}
                <td className="px-4 py-3 text-xs">{item.whatsappConnected ? 'Connected' : item.whatsappRequestedAt ? 'Requested' : '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={() => onSelect(item.id)} className="min-h-10 bg-[#161918] px-3 text-xs font-bold uppercase tracking-wider text-white">Manage</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
