'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  LoaderCircle,
  Monitor,
  Plus,
  RefreshCw,
  Smartphone,
  Tablet,
  Trash2,
  Tv,
  Video,
} from 'lucide-react';
import { CREDIT_LEVEL_STATUS, creditStatuses } from '@/lib/maharaja/credits';
import { StatusPill } from '@/components/ui';
import PlatformOverview, { type PlatformSpend } from '@/components/PlatformOverview';
import { PACKAGES, modulesForPackage, packageLabel, packageOf, resolveAccess, type PackageId } from '@/lib/maharaja/access';
import { FREE_TRIAL_IMAGE_CREDITS, PHONE_PACKAGE, PHONE_PACKAGE_CREDITS, PLATFORM_LABELS, PRESETS, clampCredits, formatRupees, platformOfPackage, presetFor, type Credits, type Platform, type PresetId } from '@/lib/maharaja/pricing';

/**
 * The platforms a store can book, ticked in any mix: TV, Tablet, both, or Phone on its own. The phone
 * always comes with the TV and the tablet, so it is ticked and locked whenever either is ticked.
 * Device and module rules for each mix live in access.ts.
 */
const PLATFORM_PICKS = [
  { key: 'tv', Icon: Tv, title: 'TV', text: 'Try-On, AI Video and Live Mirror on the showroom TV, with the Go Live player.' },
  { key: 'tablet', Icon: Tablet, title: 'Tablet', text: 'Try-On and the AI Video QR at the counter, with the Go Live player.' },
  { key: 'phone', Icon: Smartphone, title: 'Phone', text: 'Try-On on the customer’s phone from the Wall QR. No AI Video.' },
] as const;

type PlatformPick = (typeof PLATFORM_PICKS)[number]['key'];

/** The package a tick-box change leads to. Unticking everything leaves Phone, which can be booked alone. */
function togglePlatform(current: PackageId, pick: PlatformPick): PackageId {
  const d = PACKAGES[current].devices;
  if (pick === 'phone') return current;
  const tv = pick === 'tv' ? !d.tv : d.tv;
  const tablet = pick === 'tablet' ? !d.tablet : d.tablet;
  return tv ? (tablet ? 'tv-tablet' : 'tv') : tablet ? 'tablet' : 'phone';
}

function PlatformPicker({ value, onChange, compact = false }: { value: PackageId; onChange: (next: PackageId) => void; compact?: boolean }) {
  const d = PACKAGES[value].devices;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {PLATFORM_PICKS.map(({ key, Icon, title, text }) => {
        const ticked = key === 'phone' ? true : d[key];
        const locked = key === 'phone';
        const note = key === 'phone' ? (d.tv || d.tablet ? 'Included with TV and Tablet' : 'Booked on its own') : null;
        return (
          <button
            key={key}
            type="button"
            role="checkbox"
            aria-checked={ticked}
            aria-disabled={locked}
            onClick={() => { if (!locked) onChange(togglePlatform(value, key)); }}
            className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${ticked ? 'border-ink bg-white ring-1 ring-ink' : 'border-line bg-white hover:border-line-strong'} ${locked ? 'cursor-default' : ''}`}
          >
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${ticked ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white'}`}>
              {ticked && <Check className="h-3.5 w-3.5" />}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-base font-bold text-ink"><Icon className="h-4 w-4" />{title}</span>
              {!compact && <span className="mt-1 block text-sm font-normal text-muted">{text}</span>}
              {note && <span className="mt-1 block text-xs font-semibold text-muted">{note}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

type PricingAnswer = {
  quote: { creditsTotal: number; softwareFee: number; gst: number; total: number; credits: Credits };
  margin: { aiCost: number; creditProfit: number; creditMargin: number };
};

/** Price, AI cost and profit of a package (from the server, which alone knows our costs). */
function PackageQuote({ platform, credits, software }: { platform: Platform; credits: Credits; software: boolean }) {
  const [answer, setAnswer] = useState<PricingAnswer | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ platform, image: String(credits.image), video: String(credits.video), live: String(credits.live), software: software ? '1' : '0' });
    fetch(`/api/admin/pricing?${params}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => { if (active) { setAnswer(data?.success ? data : null); setFailed(!data?.success); } })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [platform, credits.image, credits.video, credits.live, software]);
  if (failed) return <p className="text-sm text-danger">Price unavailable. Check the connection and try again.</p>;
  if (!answer) return <p className="text-sm text-muted">Working out the price…</p>;
  const { quote, margin } = answer;
  return (
    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      <div className="flex justify-between gap-3"><dt className="text-muted">Credits</dt><dd className="tabular-nums font-semibold">{formatRupees(quote.creditsTotal)}</dd></div>
      {software && <div className="flex justify-between gap-3"><dt className="text-muted">Software (one time)</dt><dd className="tabular-nums font-semibold">{formatRupees(quote.softwareFee)}</dd></div>}
      <div className="flex justify-between gap-3"><dt className="text-muted">GST (18%)</dt><dd className="tabular-nums">{formatRupees(quote.gst)}</dd></div>
      <div className="flex justify-between gap-3"><dt className="font-bold text-ink">Store pays</dt><dd className="tabular-nums font-bold text-ink">{formatRupees(quote.total)}</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-muted">Our AI cost (all credits used)</dt><dd className="tabular-nums">{formatRupees(margin.aiCost)}</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-muted">Credit profit</dt><dd className="tabular-nums font-semibold text-success">{formatRupees(margin.creditProfit)} · {Math.round(margin.creditMargin * 100)}%</dd></div>
    </dl>
  );
}

/**
 * One client's settings at a glance, each tile with the step that changes it. Read top-down, it answers:
 * what did they book, what is left, can they sign in, how do customers get results, how is it going.
 */
/** What the store did in its own workspace (from /api/admin/clients?clientId=). */
type StoreDetail = {
  catalogue: { total: number; showing: number; video: number; live: number };
  hasLogo: boolean;
  instagramUrl: string;
  customCategories: boolean;
  tryOnMinimum: number;
  videoMinimum: number;
  festival: string;
  report: { month: string; counts: Record<string, number>; lastCounts: Record<string, number> } | null;
  activity: Array<{ id: string; label: string; createdAt: string }>;
};

const MONTH_COUNTS = [
  ['Wall QR scans', 'tryOnScans', 'image'],
  ['Try-On looks', 'tryOnGenerated', 'image'],
  ['AI Video QRs given', 'videoPasses', 'video'],
  ['AI Videos made', 'videosGenerated', 'video'],
  ['Go Live plays', 'goLive', 'video'],
  ['Live Mirror sessions', 'liveSessions', 'live'],
  ['Downloads', 'downloads', null],
  ['Retries', 'retries', null],
] as const;

/**
 * What is happening in the store's own workspace: what is working for customers, what the store has set up
 * and switched on, this month against last month, and the latest activity. Read only for TryFocus.
 */
function StoreActivity({ client, detail }: { client: Client; detail: StoreDetail | null | 'error' }) {
  const access = resolveAccess(client.devices, client.modules);
  if (detail === 'error') return <section className="tf-card p-6"><h2 className="text-2xl font-bold">In the store&apos;s workspace</h2><p className="mt-2 text-sm text-danger">Could not load the store&apos;s workspace. Refresh to try again.</p></section>;
  if (!detail) return <section className="tf-card p-6"><h2 className="text-2xl font-bold">In the store&apos;s workspace</h2><p className="mt-2 flex items-center gap-2 text-sm text-muted"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading what the store has set up…</p></section>;
  const live = client.status === 'Active';
  const levelOf = (label: string) => creditStatuses({ tryOnGenerated: client.usage.image, liveSessions: client.usage.live, videosGenerated: client.usage.video }, client.limits).find((item) => item.label === label)?.level;
  type Tone = 'success' | 'warn' | 'danger' | 'neutral';
  const status = (label: string, pieces: number, empty: string): [string, Tone] => {
    if (!live) return ['Paused', 'neutral'];
    if (levelOf(label) === 'exhausted') return ['Credits finished', 'danger'];
    if (pieces === 0) return [empty, 'warn'];
    return ['Working', 'success'];
  };
  const working: Array<[string, string, [string, Tone]]> = [
    ['Try-On', `${[client.devices.tv && 'TV', client.devices.tablet && 'Tablet', 'Phone (Wall QR)'].filter(Boolean).join(' · ')} · ${detail.catalogue.showing} garments showing`, status('Try-On', detail.catalogue.showing, 'Own outfit only')],
    ...(access.modules.video ? [['AI Video', `${detail.catalogue.video} garments on AI Video`, status('AI Video', detail.catalogue.video, 'No garments on')] as [string, string, [string, Tone]]] : []),
    ...(access.modules.live ? [['Live Mirror', `TV · ${detail.catalogue.live} garments on Live Mirror`, status('Live Mirror', detail.catalogue.live, 'No garments on')] as [string, string, [string, Tone]]] : []),
    ...(access.modules.video ? [['Go Live player', 'LED or wall screen', (client.devices.led ? (live ? ['Working', 'success'] : ['Paused', 'neutral']) : ['Off', 'neutral']) as [string, Tone]] as [string, string, [string, Tone]]] : []),
  ];
  const setup: Array<[string, string, boolean | null]> = [
    ['Garments', `${detail.catalogue.showing} of ${detail.catalogue.total} showing to customers`, detail.catalogue.showing > 0],
    ['Categories customers see', detail.customCategories ? 'The store chose its own list' : 'Standard list (not chosen yet)', detail.customCategories],
    ...(access.modules.video ? [['AI Video garments', `${detail.catalogue.video} switched on`, detail.catalogue.video > 0] as [string, string, boolean]] : []),
    ...(access.modules.live ? [['Live Mirror garments', `${detail.catalogue.live} switched on`, detail.catalogue.live > 0] as [string, string, boolean]] : []),
    ['Logo', detail.hasLogo ? 'Uploaded, on every downloaded look' : 'Not uploaded', detail.hasLogo],
    ['Instagram', detail.instagramUrl || 'Not added', Boolean(detail.instagramUrl)],
    ['Wall QR price tag', detail.tryOnMinimum ? `Scan a tag of ₹${detail.tryOnMinimum.toLocaleString('en-IN')} or more first` : 'Off: anyone who scans can try', null],
    ...(access.modules.video ? [
      ['AI Video gift', detail.videoMinimum ? `For bills from ₹${detail.videoMinimum.toLocaleString('en-IN')}` : 'For every bill', null] as [string, string, null],
      ['Festival theme', detail.festival, null] as [string, string, null],
    ] : []),
  ];
  const toDo = setup.filter(([, , done]) => done === false).length;
  const counts = detail.report?.counts || {};
  const last = detail.report?.lastCounts || {};
  const monthName = detail.report?.month ? new Date(`${detail.report.month}-15T00:00:00Z`).toLocaleString('en-IN', { month: 'long' }) : 'This month';
  const tiles = MONTH_COUNTS.filter(([, , module]) => module === null || access.modules[module]);
  return (
    <section className="tf-card p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-2xl font-bold">In the store&apos;s workspace</h2>
        <p className="text-sm text-muted">What {client.name} sees and has done. Read only.</p>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="font-bold text-ink">Working now</h3>
          <ul className="mt-2 divide-y divide-line">
            {working.map(([title, where, [text, tone]]) => (
              <li key={title} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0"><span className="block font-semibold text-ink">{title}</span><span className="block text-muted">{where}</span></span>
                <StatusPill tone={tone}>{text}</StatusPill>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-bold text-ink">Set up by the store <span className="font-normal text-muted">· {toDo ? `${toDo} to do` : 'all done'}</span></h3>
          <ul className="mt-2 divide-y divide-line">
            {setup.map(([title, text, done]) => (
              <li key={title} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  {done === true ? <Check className="h-4 w-4 shrink-0 text-success" /> : done === false ? <span className="ml-1 h-2 w-2 shrink-0 rounded-full bg-warn" /> : <span className="ml-1 h-2 w-2 shrink-0 rounded-full bg-line-strong" />}
                  <span className="font-semibold text-ink">{title}</span>
                </span>
                <span className="min-w-0 text-right text-muted">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <h3 className="mt-6 font-bold text-ink">{monthName} so far</h3>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([label, key]) => (
          <div key={key} className="rounded-2xl bg-canvas p-4">
            <p className="text-[13px] font-medium text-muted">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{Number(counts[key] || 0).toLocaleString('en-IN')}</p>
            <p className="mt-0.5 text-xs tabular-nums text-subtle">Last month {Number(last[key] || 0).toLocaleString('en-IN')}</p>
          </div>
        ))}
      </div>

      <h3 className="mt-6 font-bold text-ink">Latest activity</h3>
      {detail.activity.length === 0
        ? <p className="mt-2 text-sm text-muted">Nothing yet.</p>
        : <ul className="mt-2 divide-y divide-line text-sm">
            {detail.activity.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 py-2">
                <span className="min-w-0 text-ink">{item.label}</span>
                <span className="shrink-0 tabular-nums text-muted">{new Date(item.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
              </li>
            ))}
          </ul>}
    </section>
  );
}

function ClientStatus({ client }: { client: Client }) {
  const access = resolveAccess(client.devices, client.modules);
  const credits = creditStatuses({ tryOnGenerated: client.usage.image, liveSessions: client.usage.live, videosGenerated: client.usage.video }, {
    image: access.modules.image ? client.limits.image : 0,
    live: access.modules.live ? client.limits.live : 0,
    video: access.modules.video ? client.limits.video : 0,
  }).filter((status) => status.level !== 'none');
  const tile = (id: string, title: string, body: React.ReactNode, warn = false) => (
    <article className={`flex flex-col rounded-2xl border p-4 ${warn ? 'border-warn/50 bg-warn-soft/40' : 'border-line bg-white'}`}>
      <p className="text-[13px] font-semibold text-muted">{title}</p>
      <div className="mt-2 flex-1 text-sm text-ink">{body}</div>
      {id && <a href={`#${id}`} className="mt-3 text-sm font-semibold text-ink underline">Change</a>}
    </article>
  );
  const creditsWarn = credits.some((status) => status.level !== 'ok');
  return (
    <section className="tf-card p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-2xl font-bold">Set up by TryFocus</h2>
        <p className="text-sm text-muted">What this store is given. Change it in the steps below.</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tile('setup-platform', 'Platform', <>
          <p className="font-bold">{packageLabel(client.devices)}</p>
          <p className="mt-1 text-muted">{['Try-On', access.modules.video && 'AI Video', access.modules.live && 'Live Mirror'].filter(Boolean).join(' · ')}</p>
        </>)}
        {tile('setup-credits', 'Credits', credits.length ? (
          <ul className="space-y-1.5">
            {credits.map((status) => (
              <li key={status.label} className="flex items-center justify-between gap-2">
                <span>{status.label} <span className="tabular-nums text-muted">· {Math.max(0, status.limit - status.used).toLocaleString('en-IN')} left</span></span>
                <StatusPill tone={CREDIT_LEVEL_STATUS[status.level].tone}>{CREDIT_LEVEL_STATUS[status.level].text}</StatusPill>
              </li>
            ))}
          </ul>
        ) : <p className="text-warn">No credits set</p>, creditsWarn || !credits.length)}
        {tile('setup-login', 'Store login', client.logins?.length
          ? <><p className="font-bold">{client.logins.join(', ')}</p><p className="mt-1 text-muted">Opens TV, tablet, Go Live player and workspace</p></>
          : <p className="text-warn">Not created yet. The store cannot sign in.</p>, !client.logins?.length)}
        {tile('setup-delivery', 'Delivery', <ul className="space-y-1">
          <li className="flex justify-between gap-2"><span>QR</span><span className="font-semibold">Always on</span></li>
          <li className="flex justify-between gap-2"><span>WhatsApp link</span><span className="font-semibold">{client.whatsappConnected ? 'On' : 'Off'}</span></li>
          {access.modules.video && <li className="flex justify-between gap-2"><span>Go Live player</span><span className="font-semibold">{client.devices.led ? 'On' : 'Off'}</span></li>}
        </ul>)}
        {tile('', 'AI cost (TryFocus only)', <ul className="space-y-1">
          <li className="flex justify-between gap-2"><span>Today</span><span className="tabular-nums font-semibold">{client.spend ? formatRupees(client.spend.todayInr) : '—'}</span></li>
          <li className="flex justify-between gap-2"><span>This month</span><span className="tabular-nums font-semibold">{client.spend ? formatRupees(client.spend.monthInr) : '—'}</span></li>
          <li className="flex justify-between gap-2"><span>All time looks · videos</span><span className="tabular-nums font-semibold">{client.usage.image.toLocaleString('en-IN')} · {client.usage.video.toLocaleString('en-IN')}</span></li>
        </ul>)}
        {tile('', 'Store screens', client.links?.workspace
          ? <><a href={client.links.workspace} target="_blank" rel="noreferrer" className="font-semibold underline">Open workspace</a><p className="mt-1 text-muted">The TV, tablet and Go Live player links are in the workspace.</p></>
          : <p className="text-muted">Links appear after the first save.</p>)}
      </div>
    </section>
  );
}

type Client = {
  id: string;
  name: string;
  branch: string;
  workspaceCode?: string;
  status: 'Active' | 'Paused';
  minPurchaseTryOnDisabled: boolean;
  deliveryMode?: 'whatsapp' | 'qr';
  whatsappConnected: boolean;
  /** TryFocus WhatsApp Cloud API credentials are configured on the server. */
  whatsappApiReady?: boolean;
  /** Staff login usernames TryFocus created for this client. */
  logins?: string[];
  devices: { tv: boolean; tablet: boolean; mobile: boolean; led: boolean };
  usage: { image: number; live: number; video: number; passes?: number; goLive?: number; downloads?: number; scans?: number };
  limits: { image: number; live: number; video: number };
  /** GenLook Try-On credits locked to this store out of TryFocus's GenLook balance, and how many it used. */
  genlookCredits?: number;
  genlookUsed?: number;
  spend?: { todayInr: number; monthInr: number };
  /** Modules this client bought; a module that is off is blocked even with credits left. */
  modules?: { image: boolean; live: boolean; video: boolean };
  links?: {
    workspace: string;
    tryOn: string;
    billing: string;
    openVideo: string;
    tv: string;
  };
};

/** This browser's copy of the client list, shown instantly while the live list loads. */
const CLIENTS_CACHE_KEY = 'tryfocus:admin-clients';

const initialClients: Client[] = [
  {
    id: 'maharaja',
    name: 'The Majestic Maharaja',
    branch: 'Thanjavur · Main Showroom',
    workspaceCode: 'workspace',
    status: 'Active',
    minPurchaseTryOnDisabled: true,
    deliveryMode: 'qr',
    whatsappConnected: false,
    devices: { tv: true, tablet: true, mobile: true, led: true },
    usage: { image: 0, live: 0, video: 0 },
    limits: { image: 4000, live: 500, video: 500 },
  },
];

const plans = [
  { key: 'image', label: 'Try-On images', icon: Smartphone },
  { key: 'video', label: 'AI Videos', icon: Video },
  { key: 'live', label: 'Live Mirror sessions', icon: Monitor },
] as const;

export default function TryFocusAdmin() {
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [platformSpend, setPlatformSpend] = useState<PlatformSpend | null>(null);
  // Empty = TryFocus platform overview; a client id = that workspace's management.
  const [clientId, setClientId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [authRequired, setAuthRequired] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedNotice, setSavedNotice] = useState<string>('');
  const [errorNotice, setErrorNotice] = useState<string>('');

  // New retailer creation form
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [newStoreName, setNewStoreName] = useState<string>('');
  const [newStoreBranch, setNewStoreBranch] = useState<string>('');
  // Phone Try-On is what we sell first: the form opens on Phone with the November offer.
  const [newPackage, setNewPackage] = useState<PackageId>('phone');
  // 'trial' = the free start for a new client: 60 Try-On credits, no AI Video or Live Mirror.
  const [newPreset, setNewPreset] = useState<PresetId | 'trial' | 'phone-package'>('trial');
  const [creatingClient, setCreatingClient] = useState<boolean>(false);

  const loadClients = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/clients', { cache: 'no-store' });
      if (res.status === 401) {
        try { window.localStorage.removeItem(CLIENTS_CACHE_KEY); } catch { /* private mode */ }
        setAuthRequired(true);
        return;
      }
      setAuthRequired(false);
      const data = await res.json();
      if (res.ok && data?.success && Array.isArray(data.clients) && data.clients.length > 0) {
        setClients(data.clients);
        try { window.localStorage.setItem(CLIENTS_CACHE_KEY, JSON.stringify({ clients: data.clients, platform: data.platform || null })); } catch { /* private mode */ }
      }
      if (data?.platform) setPlatformSpend(data.platform);
    } catch {
      // keep fallback state if network is offline
    } finally {
      setLoading(false);
    }
  }, []);

  // The last client list shows at once (this browser's copy); the live list replaces it a moment later.
  useEffect(() => {
    try {
      const cached = JSON.parse(window.localStorage.getItem(CLIENTS_CACHE_KEY) || 'null');
      if (cached && Array.isArray(cached.clients) && cached.clients.length > 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- the browser's saved copy is only readable after mount
        setClients(cached.clients);
        if (cached.platform) setPlatformSpend(cached.platform);
        setLoading(false);
      }
    } catch { /* private mode or an old copy */ }
    void loadClients();
  }, [loadClients]);

  const client = useMemo(
    () => clients.find((item) => item.id === clientId) || clients[0],
    [clients, clientId]
  );

  // What the picked store did in its own workspace; loaded each time a client is picked.
  const [storeDetail, setStoreDetail] = useState<{ id: string; detail: StoreDetail | 'error' } | null>(null);
  useEffect(() => {
    if (!clientId) return;
    let active = true;
    fetch(`/api/admin/clients?clientId=${encodeURIComponent(clientId)}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => { if (active) setStoreDetail({ id: clientId, detail: data?.success && data.detail ? data.detail : 'error' }); })
      .catch(() => { if (active) setStoreDetail({ id: clientId, detail: 'error' }); });
    return () => { active = false; };
  }, [clientId]);

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  // An empty username field means the client's existing login, so the usual action is a password reset.
  const loginName = (loginUsername.trim() || client.logins?.[0] || '').toLowerCase();
  const loginExists = Boolean(client.logins?.includes(loginName));

  // Creates or resets the client's own staff login; it opens only this client's workspace.
  async function saveClientLogin(event: React.FormEvent) {
    event.preventDefault();
    setSavedNotice('');
    setErrorNotice('');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: client.id,
          name: client.name,
          branch: client.branch,
          campaignEnabled: client.status === 'Active',
          minPurchaseTryOnDisabled: client.minPurchaseTryOnDisabled,
          deliveryMode: client.deliveryMode || 'qr',
          whatsappConnected: client.whatsappConnected,
          devices: client.devices,
          limits: client.limits,
          loginUsername: loginName,
          loginPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not save the client login.');
      if (Array.isArray(data.clients)) setClients(data.clients);
      setSavedNotice(loginExists
        ? `Password reset for "${loginName}". Devices using it are signed out.`
        : `Login "${loginName}" created for ${client.name}. It opens only this client's workspace.`);
      setLoginUsername('');
      setLoginPassword('');
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : 'Could not save the client login.');
    } finally {
      setSaving(false);
    }
  }

  // Turns the login off and signs out every device using it straight away.
  async function disableClientLogin(username: string) {
    if (!window.confirm(`Disable "${username}"? Every device using this login is signed out immediately.`)) return;
    setSaving(true);
    setErrorNotice('');
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: client.id, name: client.name, branch: client.branch, campaignEnabled: client.status === 'Active', disableLogin: username }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not disable the login.');
      if (Array.isArray(data.clients)) setClients(data.clients);
      setSavedNotice(`Login "${username}" disabled and signed out everywhere.`);
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : 'Could not disable the login.');
    } finally {
      setSaving(false);
    }
  }

  async function persistClientPatch(nextPatch: Partial<Client>) {
    const mergedClient: Client = {
      ...client,
      ...nextPatch,
      devices: nextPatch.devices ? { ...client.devices, ...nextPatch.devices } : client.devices,
      limits: nextPatch.limits ? { ...client.limits, ...nextPatch.limits } : client.limits,
      modules: nextPatch.modules ? { ...(client.modules || { image: true, live: true, video: true }), ...nextPatch.modules } : client.modules,
    };

    setClients((items) =>
      items.map((item) => (item.id === client.id ? mergedClient : item))
    );
    setSavedNotice('');
    setErrorNotice('');
    setSaving(true);

    try {
      const res = await fetch('/api/admin/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: mergedClient.id,
          name: mergedClient.name,
          branch: mergedClient.branch,
          status: mergedClient.status,
          campaignEnabled: mergedClient.status === 'Active',
          minPurchaseTryOnDisabled: mergedClient.minPurchaseTryOnDisabled,
          deliveryMode: mergedClient.deliveryMode || 'qr',
          whatsappConnected: mergedClient.whatsappConnected,
          devices: mergedClient.devices,
          limits: mergedClient.limits,
          modules: mergedClient.modules,
          ...(typeof mergedClient.genlookCredits === 'number' ? { genlookCredits: mergedClient.genlookCredits } : {}),
        }),
      });
      if (res.status === 401) {
        setAuthRequired(true);
        return;
      }
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Could not save client configuration.');
      }
      if (Array.isArray(data.clients)) {
        setClients(data.clients);
      }
      setSavedNotice(`Saved ${mergedClient.name} configuration to backend.`);
      window.setTimeout(() => setSavedNotice(''), 3000);
    } catch (err) {
      setErrorNotice(
        err instanceof Error ? err.message : 'Unable to save client configuration.'
      );
    } finally {
      setSaving(false);
    }
  }

  function updateClient(next: Partial<Client>) {
    void persistClientPatch(next);
  }

  const currentPackage = packageOf(client.devices);
  const currentPlatform = platformOfPackage(currentPackage);
  const clientAccess = resolveAccess(client.devices, client.modules);
  const currentPreset = presetFor(currentPlatform, client.limits);
  const newPlatform = platformOfPackage(newPackage);
  const newCredits = newPreset === 'trial'
    ? { image: FREE_TRIAL_IMAGE_CREDITS, video: 0, live: 0 }
    : newPreset === 'phone-package'
      ? { image: PHONE_PACKAGE_CREDITS, video: 0, live: 0 }
      : clampCredits(newPlatform, PRESETS[newPreset]);
  const [topUpPreset, setTopUpPreset] = useState<PresetId>('standard');
  const topUpCredits = clampCredits(currentPlatform, PRESETS[topUpPreset]);

  // The platform decides the modules: every module it includes comes with it, the others go off.
  function choosePackage(id: PackageId) {
    const devices = { ...PACKAGES[id].devices, led: PACKAGES[id].devices.led && client.devices.led !== false };
    void persistClientPatch({ devices, modules: modulesForPackage(id) });
  }

  // A top-up adds a package's credits to what the store has left; used credits stay counted.
  function addTopUp(credits: Credits) {
    void persistClientPatch({
      limits: {
        image: client.limits.image + credits.image,
        video: client.limits.video + credits.video,
        live: client.limits.live + credits.live,
      },
    });
  }

  function setLimit(key: keyof Client['limits'], value: number) {
    const nextLimits = { ...client.limits, [key]: Math.max(0, value) };
    setClients((items) =>
      items.map((item) =>
        item.id === client.id ? { ...item, limits: nextLimits } : item
      )
    );
  }

  const [deleteName, setDeleteName] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Deletes the client's workspace, catalogue, looks, videos, files and logins for good.
  async function deleteWorkspace() {
    if (deleteName.trim().toLowerCase() !== client.name.trim().toLowerCase()) return;
    if (!window.confirm(`Delete ${client.name} for good? Its screens stop working and nothing can be brought back.`)) return;
    setDeleting(true);
    setSavedNotice('');
    setErrorNotice('');
    try {
      const res = await fetch(`/api/admin/clients?clientId=${encodeURIComponent(client.id)}`, { method: 'DELETE' });
      if (res.status === 401) { setAuthRequired(true); return; }
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not delete the workspace.');
      if (Array.isArray(data.clients)) {
        setClients(data.clients);
        try { window.localStorage.setItem(CLIENTS_CACHE_KEY, JSON.stringify({ clients: data.clients, platform: platformSpend })); } catch { /* private mode */ }
      }
      setSavedNotice(`${client.name} and its workspace are deleted.`);
      setDeleteName('');
      setClientId('');
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : 'Could not delete the workspace.');
    } finally {
      setDeleting(false);
    }
  }

  async function saveCurrentConfiguration() {
    await persistClientPatch({});
  }

  async function createNewRetailer(e: React.FormEvent) {
    e.preventDefault();
    if (!newStoreName.trim()) {
      setErrorNotice('Enter a retailer store name.');
      return;
    }
    setCreatingClient(true);
    setErrorNotice('');
    try {
      const slug = newStoreName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: slug,
          name: newStoreName.trim(),
          branch: newStoreBranch.trim() || 'Main Showroom',
          status: 'Active',
          minPurchaseTryOnDisabled: true,
          deliveryMode: 'qr',
          devices: PACKAGES[newPackage].devices,
          modules: modulesForPackage(newPackage),
          limits: newCredits,
          // The store's GenLook credits match its Try-On credits for the trial and the Phone package.
          genlookCredits: newPreset === 'trial' ? FREE_TRIAL_IMAGE_CREDITS : newPreset === 'phone-package' ? PHONE_PACKAGE_CREDITS : undefined,
        }),
      });
      if (res.status === 401) {
        setAuthRequired(true);
        return;
      }
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Could not create retailer workspace.');
      }
      if (Array.isArray(data.clients)) {
        setClients(data.clients);
      }
      if (data.client?.id) {
        setClientId(data.client.id);
      }
      setNewStoreName('');
      setNewStoreBranch('');
      setShowCreateForm(false);
      setSavedNotice(`Created isolated workspace for ${data.client?.name || newStoreName}.`);
    } catch (err) {
      setErrorNotice(
        err instanceof Error ? err.message : 'Unable to create retailer workspace.'
      );
    } finally {
      setCreatingClient(false);
    }
  }

  if (authRequired) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F4F5F2] px-6 text-ink">
        <div className="rounded-2xl w-full max-w-md border border-line bg-[#FFFFFF] p-8 shadow-sm">
          <h1 className="mt-3 text-2xl font-bold text-ink">
            Operator authentication required
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#555E5A]">
            Sign in with your TryFocus operator credentials to view or modify multi-store client workspaces, device provisioning, and credit limits.
          </p>
          <Link
            href="/login?next=/admin"
            className="rounded-xl mt-6 flex w-full items-center justify-center border border-brand bg-brand px-5 py-3 text-xs font-bold text-[#FAF6EE] transition hover:bg-[#5E0E1E]"
          >
            Sign In to TryFocus Admin
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-sm font-bold text-white">TF</span>
            <div>
              <h1 className="text-lg font-bold text-ink">TryFocus admin</h1>
              <p className="text-sm text-muted">{loading ? 'Loading clients…' : `${clients.length} client${clients.length === 1 ? '' : 's'}`}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowCreateForm((v) => !v)}
              className="tf-btn tf-btn-secondary !min-h-11 px-4 text-sm"
            >
              <Plus className="h-4 w-4" />
              New client
            </button>
            {clientId && <button
              type="button"
              disabled={saving}
              onClick={saveCurrentConfiguration}
              className="tf-btn tf-btn-primary !min-h-11 px-4 text-sm"
            >
              {saving ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {saving ? 'Saving…' : 'Save changes'}
            </button>}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-5 py-6 sm:px-8">
        {(savedNotice || errorNotice) && (
          <div
            className={`rounded-2xl border p-4 text-sm font-semibold ${
 errorNotice
 ? 'border-danger bg-[#FEF3F2] text-danger'
 : 'border-success bg-[#EBF5EE] text-success'
 }`}
          >
            {errorNotice || savedNotice}
          </div>
        )}

        {/* Create New Retailer Workspace Drawer */}
        {showCreateForm && (
          <form
            onSubmit={createNewRetailer}
            className="tf-card p-6"
          >
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h2 className="mt-1 text-2xl font-bold text-ink">
                  New client workspace
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="text-xs font-semibold text-muted underline"
              >
                Cancel
              </button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-4">
              <label className="block text-xs font-bold text-muted">
                Store name
                <input
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  placeholder="e.g. Pothys Silk Palace"
                  className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3 text-sm text-ink outline-none focus:border-brand"
                  required
                />
              </label>
              <label className="block text-xs font-bold text-muted">
                Branch / City
                <input
                  value={newStoreBranch}
                  onChange={(e) => setNewStoreBranch(e.target.value)}
                  placeholder="e.g. Chennai · T. Nagar"
                  className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3 text-sm text-ink outline-none focus:border-brand"
                />
              </label>
              <div className="block text-xs font-bold text-muted sm:col-span-2">
                <p>Platform · tick TV, Tablet or both (Phone comes with them), or Phone alone</p>
                <div className="mt-1.5 font-normal"><PlatformPicker compact value={newPackage} onChange={(next) => { setNewPackage(next); setNewPreset(next === 'phone' ? 'trial' : 'standard'); }} /></div>
                <select
                  aria-label="Credit package"
                  value={newPreset}
                  onChange={(e) => setNewPreset(e.target.value as PresetId | 'trial' | 'phone-package')}
                  className="mt-2 h-11 w-full rounded-xl border border-line-strong bg-white px-3 text-sm text-ink outline-none focus:border-brand"
                >
                  {newPackage === 'phone' ? (
                    <>
                      <option value="trial">November offer · {FREE_TRIAL_IMAGE_CREDITS} free Try-On, no service charge</option>
                      <option value="phone-package">Phone package · {PHONE_PACKAGE_CREDITS.toLocaleString('en-IN')} Try-On (₹{PHONE_PACKAGE.fee.toLocaleString('en-IN')})</option>
                    </>
                  ) : (
                    <>
                      <option value="trial">Free trial · {FREE_TRIAL_IMAGE_CREDITS} Try-On</option>
                      {(Object.keys(PRESETS) as PresetId[]).map((id) => <option key={id} value={id}>{PRESETS[id].label}</option>)}
                    </>
                  )}
                </select>
                <span className="mt-2 block font-normal tabular-nums">
                  {newCredits.image.toLocaleString('en-IN')} images{newCredits.video ? ` · ${newCredits.video.toLocaleString('en-IN')} AI Videos` : ''}{newCredits.live ? ` · ${newCredits.live.toLocaleString('en-IN')} Live Mirror` : ''}
                </span>
              </div>
              <div className="sm:col-span-2 lg:col-span-3 rounded-2xl bg-canvas p-4">
                {newPreset === 'trial'
                  ? <p className="text-sm text-muted">{newPackage === 'phone' ? 'November offer (till 30 November): ' : 'Free trial: '}{FREE_TRIAL_IMAGE_CREDITS} Try-On credits and {FREE_TRIAL_IMAGE_CREDITS} GenLook credits locked to the store, no charge. Top up from the client&apos;s card when they buy.</p>
                  : <>
                    <p className="mb-2 text-xs font-bold text-muted">{newPreset === 'phone-package' ? `Phone package: ₹${PHONE_PACKAGE.fee.toLocaleString('en-IN')} with ${PHONE_PACKAGE.credits.toLocaleString('en-IN')} Try-On + ${PHONE_PACKAGE.retryPercent}% retries` : `${PLATFORM_LABELS[newPlatform]} · ${PRESETS[newPreset].label}, with software`}</p>
                    <PackageQuote platform={newPlatform} credits={newCredits} software />
                  </>}
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={creatingClient}
                  className="rounded-xl h-11 w-full bg-brand px-5 text-xs font-bold text-[#FAF6EE] disabled:opacity-50"
                >
                  {creatingClient ? 'Creating…' : 'Create workspace'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Client Selector & Status */}
        <section>
          <div className="tf-card p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-ink">
                  {clientId ? client.name : 'All clients'}
                </h2>
                <p className="mt-2 max-w-xl text-sm text-muted">
                  {clientId
                    ? `${client.branch} · ${packageLabel(client.devices)}`
                    : 'Status of every client. Pick one to see and change its settings.'}
                </p>
                {clientId && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    aria-pressed={client.status === 'Active'}
                    onClick={() => updateClient({ status: client.status === 'Active' ? 'Paused' : 'Active' })}
                    className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ${client.status === 'Active' ? 'bg-success-soft text-success' : 'bg-line text-muted'}`}
                    title={client.status === 'Active' ? 'Tap to pause every screen of this store' : 'Tap to turn this store back on'}
                  >
                    <span className={`h-2 w-2 rounded-full ${client.status === 'Active' ? 'bg-success' : 'bg-subtle'}`} />
                    {client.status === 'Active' ? 'Live for customers' : 'Paused'}
                  </button>
                  <button type="button" onClick={() => setClientId('')} className="min-h-10 px-1 text-sm font-semibold text-muted underline">All clients</button>
                  </div>
                )}
              </div>
              <div className="relative min-w-64">
                <label className="mb-1.5 block text-xs font-bold text-muted">
                  Client
                </label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="h-11 w-full appearance-none rounded-xl border border-line-strong bg-white px-3.5 text-sm font-semibold text-ink outline-none focus:border-brand"
                >
                  <option value="">All clients</option>
                  {clients.map((item) => {
                    const low = creditStatuses({ tryOnGenerated: item.usage.image, liveSessions: item.usage.live, videosGenerated: item.usage.video }, item.limits)
                      .some((status) => status.level !== 'ok' && status.level !== 'none');
                    return (
                      <option key={item.id} value={item.id}>
                        {low ? '⚠ ' : ''}{item.name} ({item.branch}){low ? ' · low credits' : ''}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown className="pointer-events-none absolute bottom-3.5 right-3.5 h-4 w-4 text-muted" />
              </div>
            </div>
          </div>

        </section>

        {!clientId && <PlatformOverview clients={clients} platform={platformSpend} onSelect={setClientId} />}

        {clientId && (<>

        <StoreActivity client={client} detail={storeDetail?.id === clientId ? storeDetail.detail : null} />

        <ClientStatus client={client} />

        {/* What this client booked: a platform decides its modules (the phone comes with the TV and the tablet). */}
        <section id="setup-platform" className="tf-card scroll-mt-24 p-6">
          <h2 className="text-2xl font-bold">1. Platform</h2>
          <p className="mt-1 text-sm text-muted">Now: <b className="text-ink">{packageLabel(client.devices)}</b> · {['Try-On', clientAccess.modules.video && 'AI Video', clientAccess.modules.live && 'Live Mirror'].filter(Boolean).join(' · ')}. Tick TV, Tablet or both; Phone comes with them, or book Phone alone. Modules switch with the platforms.</p>

          <div className="mt-5"><PlatformPicker value={currentPackage} onChange={choosePackage} /></div>

          <div className="mt-4 flex items-start gap-3.5 rounded-2xl bg-canvas p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-ink"><Smartphone className="h-5 w-5" /></span>
            <p className="text-sm text-muted">
              <b className="text-ink">Included:</b> the workspace and, with the TV or the tablet, the customer’s phone (Wall QR Try-On, the photo upload QR and the AI Video on the phone) and Go Live on the store’s own LED or wall screen.
            </p>
          </div>

        </section>

        {/* Credits: limits are running totals; a top-up adds a package to them. */}
        <section id="setup-credits" className="tf-card scroll-mt-24 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">2. Credits</h2>
              <p className="mt-1 text-sm text-muted">{currentPreset ? `Set to ${PRESETS[currentPreset].label}.` : 'Custom limits.'} Limits are running totals; a top-up adds a package to them.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PRESETS) as PresetId[]).map((id) => {
                const plan = clampCredits(currentPlatform, PRESETS[id]);
                const selected = currentPreset === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => void persistClientPatch({ limits: plan })}
                    className={`min-h-11 rounded-xl border px-4 text-left text-sm ${selected ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white hover:border-ink'}`}
                  >
                    <span className="block font-bold">Set to {PRESETS[id].label}</span>
                    <span className={`block text-xs tabular-nums ${selected ? 'text-white/80' : 'text-muted'}`}>{plan.image.toLocaleString('en-IN')} images{plan.video ? ` · ${plan.video.toLocaleString('en-IN')} videos` : ''}{plan.live ? ` · ${plan.live.toLocaleString('en-IN')} live` : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-canvas p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-bold text-ink">Top up</p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Top-up package"
                  value={topUpPreset}
                  onChange={(e) => setTopUpPreset(e.target.value as PresetId)}
                  className="h-10 rounded-xl border border-line-strong bg-white px-3 text-sm text-ink"
                >
                  {(Object.keys(PRESETS) as PresetId[]).map((id) => <option key={id} value={id}>{PRESETS[id].label}</option>)}
                </select>
                <button type="button" disabled={saving} onClick={() => addTopUp(topUpCredits)} className="min-h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50">
                  Add {topUpCredits.image.toLocaleString('en-IN')} images{topUpCredits.video ? ` · ${topUpCredits.video.toLocaleString('en-IN')} videos` : ''}{topUpCredits.live ? ` · ${topUpCredits.live.toLocaleString('en-IN')} live` : ''}
                </button>
              </div>
            </div>
            <div className="mt-3"><PackageQuote platform={currentPlatform} credits={topUpCredits} software={false} /></div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {plans.map((plan) => {
              const key = plan.key;
              const used = client.usage[key];
              const limit = client.limits[key];
              const percent = limit ? Math.min(100, Math.round((used / limit) * 100)) : 100;
              const level = percent >= 100 ? 'exhausted' as const : percent >= 95 ? 'critical' as const : percent >= 80 ? 'low' as const : 'ok' as const;
              const Icon = plan.icon;
              const running = clientAccess.modules[key];
              return (
                <article key={key} className={`rounded-2xl border p-5 ${running ? 'border-line bg-canvas' : 'border-dashed border-line-strong bg-white'}`}>
                  <div className="flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-white">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="tabular-nums text-xs font-semibold text-muted">
                      {used.toLocaleString('en-IN')} used
                    </span>
                  </div>
                  <h3 className="mt-3 text-xl font-bold text-ink">{plan.label}</h3>
                  {!running && <p className="mt-1 text-xs text-muted">Not on the {PLATFORM_LABELS[currentPlatform]} platform.</p>}
                  <div className="mt-3 flex items-center gap-3">
                    <input
                      aria-label={`${plan.label} limit`}
                      type="number"
                      value={limit}
                      onChange={(e) => setLimit(key, Number(e.target.value))}
                      onBlur={() => void saveCurrentConfiguration()}
                      className="h-10 w-32 border border-line bg-white px-3 tabular-nums text-sm font-bold text-ink outline-none focus:border-brand"
                    />
                    <span className="text-xs text-muted">limit</span>
                  </div>
                  {resolveAccess(client.devices, client.modules).blockedBy[key] && (
                    <p className="mt-2 text-xs font-semibold text-danger">{resolveAccess(client.devices, client.modules).blockedBy[key]}</p>
                  )}
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <p className="tabular-nums text-sm text-muted"><b className="text-ink">{Math.max(0, limit - used).toLocaleString('en-IN')}</b> left</p>
                    {running && limit > 0 && <StatusPill tone={CREDIT_LEVEL_STATUS[level].tone}>{CREDIT_LEVEL_STATUS[level].text}</StatusPill>}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-canvas p-4">
            <label htmlFor="genlook-credits" className="text-sm font-semibold text-ink">GenLook credits locked to this store</label>
            <input
              id="genlook-credits"
              type="number"
              min={0}
              value={client.genlookCredits ?? 0}
              onChange={(e) => { const value = Math.max(0, Number(e.target.value) || 0); setClients((items) => items.map((item) => (item.id === client.id ? { ...item, genlookCredits: value } : item))); }}
              onBlur={() => void saveCurrentConfiguration()}
              className="h-10 w-28 border border-line bg-white px-3 tabular-nums text-sm font-bold text-ink outline-none focus:border-brand"
            />
            <span className="text-sm text-muted">{(client.genlookUsed ?? 0).toLocaleString('en-IN')} used. No other store can use these. With none left, Try-On uses the backup engine.</span>
          </div>
        </section>


        {/* Client staff login */}
        <section id="setup-login" className="tf-card scroll-mt-24 p-6">
          <h2 className="text-2xl font-bold text-ink">3. Store login</h2>
          <p className="mt-1 text-sm text-muted">
            This login opens only {client.name}&apos;s workspace, counter and devices. It cannot open TryFocus admin or another client.
          </p>
          <p className="mt-3 text-sm">
            <span className="text-[#535A56]">Existing logins: </span>
            {!client.logins?.length && <span className="tabular-nums font-bold">none yet</span>}
          </p>
          {Boolean(client.logins?.length) && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {client.logins!.map((username) => (
                <li key={username} className="flex items-center gap-2 border border-line px-3 py-1 text-sm">
                  <span className="tabular-nums font-bold">{username}</span>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void disableClientLogin(username)}
                    className="min-h-10 px-2 text-xs font-bold text-danger underline"
                  >
                    Disable
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={saveClientLogin} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input
              aria-label="Client login username"
              value={loginUsername}
              onChange={(event) => setLoginUsername(event.target.value)}
              placeholder={client.logins?.[0] ? `Username (${client.logins[0]})` : 'Username (e.g. srireadymade)'}
              autoComplete="off"
              className="min-h-11 border border-line px-3 text-sm outline-none focus:border-brand"
            />
            <input
              aria-label="Client login password"
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              placeholder={loginExists ? 'New password (8+ characters)' : 'Password (8+ characters)'}
              autoComplete="new-password"
              className="min-h-11 border border-line px-3 text-sm outline-none focus:border-brand"
            />
            <button
              type="submit"
              disabled={saving || loginName.length < 3 || loginPassword.length < 8}
              className="min-h-11 bg-brand px-5 text-xs font-bold text-white disabled:opacity-50"
            >
              {loginExists ? 'Reset password' : 'Create login'}
            </button>
          </form>
          <p className="mt-2 text-xs text-muted">{loginExists ? 'Type a different username to add a second login.' : 'The store signs in once with this on the TV, tablet, Go Live player and workspace.'}</p>
        </section>

        {/* How customers get what they made: QR always, WhatsApp link when connected, Go Live on the store screen. */}
        <section id="setup-delivery" className="tf-card scroll-mt-24 p-6">
          <h2 className="text-2xl font-bold">4. Delivery</h2>
          <p className="mt-1 text-sm text-muted">Customers always get a QR. These add to it.</p>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-line p-4">
              <div>
                <p className="font-bold text-ink">WhatsApp link</p>
                <p className="mt-1 text-sm text-muted">{client.whatsappApiReady || client.whatsappConnected ? 'Sends the look or video link on WhatsApp as well as the QR.' : 'WhatsApp is not set up for this store yet, so customers get the QR only.'}</p>
              </div>
                <button
                  type="button"
                  aria-pressed={Boolean(client.whatsappConnected)}
                  disabled={!client.whatsappConnected && !client.whatsappApiReady}
                  onClick={() =>
                    updateClient({
                      whatsappConnected: !client.whatsappConnected,
                      deliveryMode: client.whatsappConnected ? 'qr' : 'whatsapp',
                    })
                  }
                  className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${client.whatsappConnected ? 'bg-ink text-white' : 'border border-line-strong text-muted'}`}
                >
                  {client.whatsappConnected ? 'On' : 'Off'}
                </button>
            </div>
            {clientAccess.modules.video && <>
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-line p-4">
              <div>
                <p className="font-bold text-ink">Go Live player</p>
                <p className="mt-1 text-sm text-muted">Plays every customer AI Video and the store’s promos on their LED or wall screen. Off makes AI Videos download only.</p>
              </div>
              <button
                type="button"
                aria-pressed={client.devices.led}
                onClick={() => void persistClientPatch({ devices: { ...client.devices, led: !client.devices.led } })}
                className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold ${client.devices.led ? 'bg-ink text-white' : 'border border-line-strong text-muted'}`}
              >
                {client.devices.led ? 'On' : 'Off'}
              </button>
            </div>
            </>}
          </div>
        </section>

        {client.id !== 'maharaja' && (
          <section className="tf-card border-danger/40 p-6">
            <h2 className="text-2xl font-bold">Delete workspace</h2>
            <p className="mt-1 text-sm text-muted">Removes {client.name} for good: its settings, catalogue, looks, videos, leads, files and store logins. Its TV, tablet, Go Live player and Wall QR stop working. This cannot be undone.</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input
                aria-label="Type the store name to confirm"
                value={deleteName}
                onChange={(event) => setDeleteName(event.target.value)}
                placeholder={`Type ${client.name} to confirm`}
                autoComplete="off"
                className="min-h-11 w-full max-w-sm rounded-xl border border-line-strong bg-white px-3 text-sm outline-none focus:border-danger"
              />
              <button
                type="button"
                disabled={deleting || deleteName.trim().toLowerCase() !== client.name.trim().toLowerCase()}
                onClick={() => void deleteWorkspace()}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-danger px-5 text-sm font-bold text-white disabled:opacity-40"
              >
                {deleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleting ? 'Deleting…' : 'Delete workspace'}
              </button>
            </div>
          </section>
        )}

        </>)}
      </div>
    </main>
  );
}
