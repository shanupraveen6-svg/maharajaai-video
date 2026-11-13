'use client';

import TrialCatalogueCard from '@/components/TrialCatalogueCard';
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
import { CREDIT_LEVEL_STATUS, creditLevel, creditStatuses } from '@/lib/maharaja/credits';
import { StatusPill } from '@/components/ui';
import PlatformOverview, { type PlatformSpend } from '@/components/PlatformOverview';
import MaharajaAdminDashboard from '@/components/MaharajaAdminDashboard';
import { PACKAGES, modulesForPackage, packageLabel, packageOf, resolveAccess, type PackageId } from '@/lib/maharaja/access';
import { PLATFORM_LABELS, PRESETS, clampCredits, platformOfPackage, presetFor, type Credits, type PresetId } from '@/lib/maharaja/pricing';

/**
 * The platforms a store can book: TV, Tablet or both. The customer's phone (Wall QR Try-On and AI Video made
 * on the phone) comes with either, so it is always ticked and locked. Phone on its own is no longer sold.
 * Device and module rules for each mix live in access.ts.
 */
const PLATFORM_PICKS = [
  { key: 'tv', Icon: Tv, title: 'TV', text: 'Try-On, AI Video and Live Try-On on the showroom TV, with the Go Live player.' },
  { key: 'tablet', Icon: Tablet, title: 'Tablet', text: 'Try-On at the counter, run by your team. AI Video starts only on the TV.' },
  { key: 'phone', Icon: Smartphone, title: 'Phone', text: 'Included: Wall QR Try-On and AI Video made on the customer’s phone.' },
] as const;

type PlatformPick = (typeof PLATFORM_PICKS)[number]['key'];

/** The package a tick-box change leads to. TV or Tablet must stay ticked: unticking the last one does nothing. */
function togglePlatform(current: PackageId, pick: PlatformPick): PackageId {
  const d = PACKAGES[current].devices;
  if (pick === 'phone') return current;
  const tv = pick === 'tv' ? !d.tv : d.tv;
  const tablet = pick === 'tablet' ? !d.tablet : d.tablet;
  if (!tv && !tablet) return current;
  return tv ? (tablet ? 'tv-tablet' : 'tv') : 'tablet';
}

export function PlatformPicker({ value, onChange, compact = false }: { value: PackageId; onChange: (next: PackageId) => void; compact?: boolean }) {
  const d = PACKAGES[value].devices;
  // Compact: a row of small toggles (the client view and the new-client form).
  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {PLATFORM_PICKS.map(({ key, Icon, title }) => {
          const ticked = key === 'phone' ? true : d[key];
          const locked = key === 'phone';
          return (
            <button
              key={key}
              type="button"
              role="checkbox"
              aria-checked={ticked}
              aria-disabled={locked}
              title={locked ? 'Included with TV and Tablet' : undefined}
              onClick={() => { if (!locked) onChange(togglePlatform(value, key)); }}
              className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition ${ticked ? 'border-ink bg-white text-ink ring-1 ring-ink' : 'border-line-strong bg-white text-muted hover:border-ink'} ${locked ? 'cursor-default opacity-80' : ''}`}
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded border ${ticked ? 'border-ink bg-ink text-white' : 'border-line-strong'}`}>{ticked && <Check className="h-3 w-3" />}</span>
              <Icon className="h-4 w-4" />{title}{locked && <span className="text-xs font-normal text-muted">included</span>}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {PLATFORM_PICKS.map(({ key, Icon, title, text }) => {
        const ticked = key === 'phone' ? true : d[key];
        const locked = key === 'phone';
        const note = key === 'phone' ? 'Included with TV and Tablet' : null;
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


/**
 * One client's settings at a glance, each tile with the step that changes it. Read top-down, it answers:
 * what did they book, what is left, can they sign in, how do customers get results, how is it going.
 */

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
  /** Draws on GenLook's shared balance (no locked number). */
  genlookShared?: boolean;
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
  { key: 'live', label: 'Live Try-On sessions', icon: Monitor },
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
    // Back from New client workspace (its own page): that store is already saved, so pick it straight away.
    try {
      const params = new URLSearchParams(window.location.search);
      const created = params.get('client');
      if (created) {
        setClientId(created);
        if (params.get('created')) setSavedNotice('Created the new client workspace. It is live in the store dropdown.');
        window.history.replaceState(null, '', '/admin');
      }
    } catch { /* no URL params to read */ }
  }, [loadClients]);

  const client = useMemo(
    () => clients.find((item) => item.id === clientId) || clients[0],
    [clients, clientId]
  );

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
          // GenLook credits are sent only when they are changed, never with every save.
          ...('genlookCredits' in nextPatch ? { genlookCredits: nextPatch.genlookCredits ?? null } : {}),
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
      <header className="border-b border-line bg-canvas">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-sm font-bold text-white">TF</span>
            <div>
              <h1 className="text-lg font-bold text-ink">TryFocus admin</h1>
              <p className="text-sm text-muted">{loading ? 'Loading clients…' : `${clients.length} client${clients.length === 1 ? '' : 's'}`}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/maharaja/admin/new"
              className="tf-btn tf-btn-secondary !min-h-11 px-4 text-sm"
            >
              <Plus className="h-4 w-4" />
              New client
            </Link>

          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-4 px-5 py-5 sm:px-8">
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

        {/* Client Selector & Status */}
        <section>
          <div className="tf-card px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-ink">
                  {clientId ? client.name : 'All clients'}
                </h2>
                <p className="mt-0.5 text-sm text-muted">
                  {clientId
                    ? `${client.branch} · ${packageLabel(client.devices)}`
                    : 'Pick a client to see and change its settings.'}
                </p>
                {clientId && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
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
                <select
                  aria-label="Client"
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
                <ChevronDown className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-muted" />
              </div>
            </div>
          </div>

        </section>

        {!clientId && <PlatformOverview clients={clients} platform={platformSpend} onSelect={setClientId} />}

      </div>

      {/* Same screen the store logs into, plus one TryFocus-only tab (Plan) for what TryFocus sets up. */}
      {clientId && (
        <MaharajaAdminDashboard
          key={clientId}
          workspaceCode={clientId}
          adminTab={(
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">Only TryFocus sees this tab. The store sees the plan read-only on its Overview.</p>
                <button type="button" disabled={saving} onClick={saveCurrentConfiguration} className="tf-btn tf-btn-primary !min-h-11 px-5 text-sm">
                  {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
        {/* What this client booked: a platform decides its modules (the phone comes with the TV and the tablet). */}
        <section id="setup-platform" className="tf-card scroll-mt-24 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">1. Platform</h2>
              <p className="mt-0.5 text-sm text-muted">{['Try-On', clientAccess.modules.video && 'AI Video', clientAccess.modules.live && 'Live Try-On'].filter(Boolean).join(' · ')}. The customer&apos;s phone comes with either.</p>
            </div>
            <PlatformPicker compact value={currentPackage} onChange={choosePackage} />
          </div>
        </section>

        {/* Credits: limits are running totals; a top-up adds a package to them. */}
        <section id="setup-credits" className="tf-card scroll-mt-24 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">2. Credits</h2>
              <p className="mt-0.5 text-sm text-muted">{currentPreset ? `Set to ${PRESETS[currentPreset].label}.` : 'Custom limits.'} A top-up adds a package to the limits.</p>
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
                    title={`${plan.image.toLocaleString('en-IN')} images${plan.video ? ` · ${plan.video.toLocaleString('en-IN')} videos` : ''}${plan.live ? ` · ${plan.live.toLocaleString('en-IN')} live` : ''}`}
                    className={`min-h-10 rounded-xl border px-3.5 text-sm font-semibold ${selected ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white hover:border-ink'}`}
                  >
                    {PRESETS[id].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-canvas p-4">
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
          </div>

          {/* Limits: one row per service, the limit editable in place. */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[12px] font-semibold text-muted">
                <tr><th className="py-1.5 pr-3">Service</th><th className="py-1.5 pr-3 text-right">Used</th><th className="py-1.5 pr-3">Limit</th><th className="py-1.5 pr-3 text-right">Left</th><th className="py-1.5" /></tr>
              </thead>
              <tbody className="divide-y divide-line border-t border-line">
                {plans.map((plan) => {
                  const key = plan.key;
                  const used = client.usage[key];
                  const limit = client.limits[key];
                  const level = creditLevel(used, limit);
                  const running = clientAccess.modules[key];
                  const blocked = clientAccess.blockedBy[key];
                  return (
                    <tr key={key} className={running ? '' : 'text-muted'}>
                      <td className="py-2 pr-3 font-semibold">{plan.label}{!running && <span className="block text-xs font-normal">{blocked || `Not on the ${PLATFORM_LABELS[currentPlatform]} platform`}</span>}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{used.toLocaleString('en-IN')}</td>
                      <td className="py-2 pr-3">
                        <input
                          aria-label={`${plan.label} limit`}
                          type="number"
                          value={limit}
                          onChange={(e) => setLimit(key, Number(e.target.value))}
                          onBlur={() => void saveCurrentConfiguration()}
                          className="h-9 w-28 rounded-lg border border-line bg-white px-2.5 tabular-nums font-bold text-ink outline-none focus:border-brand"
                        />
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums font-semibold">{Math.max(0, limit - used).toLocaleString('en-IN')}</td>
                      <td className="py-2 text-right">{running && limit > 0 && <StatusPill tone={CREDIT_LEVEL_STATUS[level].tone}>{CREDIT_LEVEL_STATUS[level].text}</StatusPill>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-canvas px-4 py-3">
            {client.genlookShared ? (
              <>
                <p className="text-sm font-semibold text-ink">GenLook: uses the shared balance</p>
                <span className="text-sm text-muted">{(client.genlookUsed ?? 0).toLocaleString('en-IN')} used. Try-On uses GenLook while the account has free credits.</span>
              </>
            ) : (
              <>
                <label htmlFor="genlook-credits" className="text-sm font-semibold text-ink">GenLook credits locked to this store</label>
                <input
                  id="genlook-credits"
                  type="number"
                  min={0}
                  value={client.genlookCredits ?? 0}
                  onChange={(e) => { const value = Math.max(0, Number(e.target.value) || 0); setClients((items) => items.map((item) => (item.id === client.id ? { ...item, genlookCredits: value } : item))); }}
                  onBlur={(e) => void persistClientPatch({ genlookCredits: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-10 w-28 border border-line bg-white px-3 tabular-nums text-sm font-bold text-ink outline-none focus:border-brand"
                />
                <span className="text-sm text-muted">{(client.genlookUsed ?? 0).toLocaleString('en-IN')} used. No other store can use these. With none left, Try-On uses the backup engine.</span>
                {client.id === 'maharaja' && (
                  <button type="button" disabled={saving} onClick={() => void persistClientPatch({ genlookCredits: undefined, genlookShared: true })} className="min-h-10 rounded-xl border border-line-strong bg-white px-3 text-sm font-semibold">Use the shared balance</button>
                )}
              </>
            )}
          </div>
        </section>


        {/* Client staff login */}
        <section id="setup-login" className="tf-card scroll-mt-24 p-5">
          <h2 className="text-lg font-bold text-ink">3. Store login</h2>
          <p className="mt-0.5 text-sm text-muted">
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
        <section id="setup-delivery" className="tf-card scroll-mt-24 p-5">
          <h2 className="text-lg font-bold">4. Delivery</h2>
          <p className="mt-0.5 text-sm text-muted">Customers always get a QR. These add to it.</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
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

        <TrialCatalogueCard key={`trial-${client.id}`} clientId={client.id} />

        {client.id !== 'maharaja' && (
          <section className="tf-card border-danger/40 p-5">
            <h2 className="text-lg font-bold">Delete workspace</h2>
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

            </div>
          )}
        />
      )}
    </main>
  );
}
