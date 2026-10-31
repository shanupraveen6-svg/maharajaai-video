'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  LoaderCircle,
  Monitor,
  Plus,
  RefreshCw,
  Smartphone,
  Tablet,
  Tv,
  Video,
} from 'lucide-react';
import { CREDIT_BAR_COLOURS, creditStatuses } from '@/lib/maharaja/credits';
import PlatformOverview from '@/components/PlatformOverview';
import { resolveAccess } from '@/lib/maharaja/access';

/** What stops when each device is turned off (the rules live in access.ts). */
const DEVICE_STOPS: Record<'tv' | 'tablet' | 'mobile' | 'led', string> = {
  tv: 'Off also stops Live Mirror, catalogue AI Video and the Go Live link',
  tablet: 'Off stops tablet try-on; the biller can still show AI Video QRs from a phone',
  mobile: 'Always included in every package',
  led: 'Off stops only catalogue AI Video on the TV; own-garment AI Video keeps working',
};

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

/** Credits in each plan, matching the pricing on the TryFocus home page. */
const PLAN_CREDITS = {
  image: { standard: 4000, pro: 6000 },
  live: { standard: 500, pro: 1000 },
  video: { standard: 500, pro: 1000 },
} as const;

const plans = [
  {
    key: 'image',
    label: 'Try-On',
    standard: '4,000 generations',
    pro: '6,000 generations',
    icon: Smartphone,
  },
  {
    key: 'live',
    label: 'Live Mirror (TV only)',
    standard: '500 × 60-second sessions',
    pro: '1,000 × 60-second sessions',
    icon: Monitor,
  },
  {
    key: 'video',
    label: 'AI Video',
    standard: '500 video rewards',
    pro: '1,000 video rewards',
    icon: Video,
  },
] as const;

export default function TryFocusAdmin() {
  const [clients, setClients] = useState<Client[]>(initialClients);
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
  const [creatingClient, setCreatingClient] = useState<boolean>(false);

  const loadClients = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/clients', { cache: 'no-store' });
      if (res.status === 401) {
        setAuthRequired(true);
        return;
      }
      setAuthRequired(false);
      const data = await res.json();
      if (res.ok && data?.success && Array.isArray(data.clients) && data.clients.length > 0) {
        setClients(data.clients);
      }
    } catch {
      // keep fallback state if network is offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  const client = useMemo(
    () => clients.find((item) => item.id === clientId) || clients[0],
    [clients, clientId]
  );

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

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
          loginUsername,
          loginPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not save the client login.');
      if (Array.isArray(data.clients)) setClients(data.clients);
      setSavedNotice(`Login "${loginUsername.trim().toLowerCase()}" saved for ${client.name}. It opens only this client's workspace.`);
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

  function toggleDevice(key: keyof Client['devices']) {
    if (key === 'mobile') return;
    void persistClientPatch({
      devices: { ...client.devices, [key]: !client.devices[key] },
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
          devices: { tv: true, tablet: true, mobile: true, led: true },
          limits: { image: 4000, live: 500, video: 500 },
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

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
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
        <section className={`grid gap-6 ${clientId ? 'lg:grid-cols-[1.2fr_0.8fr]': ''}`}>
          <div className="tf-card p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-ink">
                  {clientId ? client.name : 'All clients'}
                </h2>
                <p className="mt-2 max-w-xl text-sm text-muted">
                  {clientId
                    ? 'Status, logins, devices, modules and credits for this client.'
                    : 'Usage and alerts across every client. Pick one to manage it.'}
                </p>
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
              {clientId && <><a
                href={`/maharaja/${encodeURIComponent(client.workspaceCode || client.id)}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl mt-3 flex min-h-11 items-center justify-center gap-2 bg-ink px-4 text-xs font-bold text-white"
              >
                Open {client.name} workspace ↗
              </a>
              <p className="mt-2 text-xs text-muted">Opens exactly what this client sees: QR codes, Go Live, promos, catalogue and rules.</p></>}
            </div>
          </div>

          {clientId && <aside className="rounded-2xl flex flex-col justify-between border border-line bg-white p-6">
            <div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-ink">{client.name}</p>
                  <p className="text-xs text-muted">{client.branch}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateClient({ status: client.status === 'Active' ? 'Paused' : 'Active' })
                  }
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
 client.status === 'Active'
 ? 'bg-success-soft text-success'
 : 'bg-danger-soft text-danger'
 }`}
                >
                  {client.status}
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 border-t border-line pt-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#535A56]">WhatsApp Link Delivery:</span>
                <button
                  type="button"
                  disabled={!client.whatsappConnected && !client.whatsappApiReady}
                  onClick={() =>
                    updateClient({
                      whatsappConnected: !client.whatsappConnected,
                      deliveryMode: client.whatsappConnected ? 'qr' : 'whatsapp',
                    })
                  }
                  className="min-h-10 py-2 text-right tabular-nums font-bold text-brand underline disabled:cursor-not-allowed disabled:text-subtle disabled:no-underline"
                >
                  {client.whatsappConnected
                    ? 'CONNECTED (Link + QR)'
                    : client.whatsappApiReady
                      ? 'NOT CONNECTED (QR Only)'
                      : 'Not connected (QR only)'}
                </button>
              </div>
            </div>
          </aside>}
        </section>

        {!clientId && <PlatformOverview clients={clients} onSelect={setClientId} />}

        {clientId && (<>
        {/* Client staff login */}
        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="mt-1 text-2xl font-bold text-ink">{client.name} login</h2>
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
              placeholder="Username (e.g. srireadymade)"
              autoComplete="off"
              className="min-h-11 border border-line px-3 text-sm outline-none focus:border-brand"
            />
            <input
              aria-label="Client login password"
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              placeholder="Password (8+ characters)"
              autoComplete="new-password"
              className="min-h-11 border border-line px-3 text-sm outline-none focus:border-brand"
            />
            <button
              type="submit"
              disabled={saving || loginUsername.trim().length < 3 || loginPassword.length < 8}
              className="min-h-11 bg-brand px-5 text-xs font-bold text-white disabled:opacity-50"
            >
              Save login
            </button>
          </form>
          <p className="mt-2 text-xs text-muted">Saving an existing username resets its password.</p>
        </section>

        {/* Purchased Device Access & Retailer Permissions */}
        <section className="grid gap-6">
          <div className="rounded-2xl border border-line bg-white p-6">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h2 className="mt-1 text-2xl font-bold text-ink">
                  Devices
                </h2>
              </div>
              <Tv className="h-6 w-6 text-brand" />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(
                [
                  [
                    'tv',
                    'Portrait TV',
                    'Try-On, Live Mirror and catalogue AI Video',
                    Tv,
                  ],
                  [
                    'tablet',
                    'Counter tablet',
                    'Staff Try-On and AI Video QRs for customers',
                    Tablet,
                  ],
                  [
                    'mobile',
                    'Customer phone',
                    'Try-On from the permanent QR and AI Video passes',
                    Smartphone,
                  ],
                  [
                    'led',
                    'Go Live player',
                    'Plays customer AI videos and promos on any screen',
                    Monitor,
                  ],
                ] as const
              ).map(([key, title, description, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleDevice(key)}
                  className={`flex items-start gap-3.5 rounded-2xl border p-4 text-left transition ${
 client.devices[key]
 ? 'border-line bg-white hover:border-line-strong'
 : 'border-dashed border-line-strong bg-canvas opacity-70'
 }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
 client.devices[key]
 ? 'bg-brand-soft text-brand'
 : 'border border-line bg-white text-muted'
 }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-base font-bold text-ink">{title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
                    <span
                      className={`mt-2.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
 client.devices[key]
 ? 'bg-[#EBF5EE] text-success'
 : 'bg-line text-muted'
 }`}
                    >
                      {client.devices[key] ? 'On' : 'Off'}
                    </span>
                    <p className="mt-1.5 text-xs text-muted">{DEVICE_STOPS[key]}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

        </section>

        {/* Usage & Hard Budget Ceilings */}
        <section className="rounded-2xl border border-line bg-white p-6">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
            <div>
              <h2 className="mt-1 text-2xl font-bold text-ink">
                Credits
              </h2>
            </div>
            <button
              type="button"
              onClick={saveCurrentConfiguration}
              className="rounded-xl border border-ink bg-canvas px-3.5 py-1.5 text-xs font-bold text-ink hover:bg-ink hover:text-white"
            >
              Apply limits
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {plans.map((plan) => {
              const key = plan.key;
              const used = client.usage[key];
              const limit = client.limits[key];
              const percent = limit ? Math.min(100, Math.round((used / limit) * 100)) : 100;
              const level = percent >= 100 ? 'exhausted' : percent >= 95 ? 'critical' : percent >= 80 ? 'low' : 'ok';
              const Icon = plan.icon;
              return (
                <article key={key} className="rounded-2xl border border-line bg-canvas p-5">
                  <div className="flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center bg-ink text-white">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="tabular-nums text-xs font-semibold text-muted">
                      {used.toLocaleString('en-IN')} used
                    </span>
                  </div>
                  <h3 className="mt-3 text-xl font-bold text-ink">
                    {plan.label}
                  </h3>
                  <div className="mt-3 flex items-center gap-3">
                    <input
                      aria-label={`${plan.label} limit`}
                      type="number"
                      value={limit}
                      onChange={(e) => setLimit(key, Number(e.target.value))}
                      onBlur={() => void saveCurrentConfiguration()}
                      className="h-10 w-32 border border-line bg-white px-3 tabular-nums text-sm font-bold text-ink outline-none focus:border-brand"
                    />
                    <span className="text-xs text-muted">hard limit</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      aria-pressed={client.modules?.[key] !== false}
                      onClick={() => void persistClientPatch({ modules: { ...(client.modules || { image: true, live: true, video: true }), [key]: client.modules?.[key] === false } })}
                      className={`min-h-10 px-3 text-xs font-bold ${client.modules?.[key] === false ? 'border border-line bg-white text-muted': 'bg-success text-white'}`}
                    >
                      {client.modules?.[key] === false ? 'Module off' : 'Module on'}
                    </button>
                    {resolveAccess(client.devices, client.modules).blockedBy[key] && (
                      <span className="w-full text-xs font-semibold text-danger">
                        {key === 'video' ? '' : 'Not running: '}{resolveAccess(client.devices, client.modules).blockedBy[key]}
                      </span>
                    )}
                    {(['standard', 'pro'] as const).map((tier) => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => void persistClientPatch({ limits: { ...client.limits, [key]: PLAN_CREDITS[key][tier] } })}
                        className="min-h-10 border border-line-strong bg-white px-3 text-xs font-semibold hover:border-ink"
                      >
                        {tier === 'standard' ? 'Standard' : 'Pro'} · {PLAN_CREDITS[key][tier].toLocaleString('en-IN')}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
                    <div className={`h-full ${CREDIT_BAR_COLOURS[level]}`} style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mt-2 tabular-nums text-xs text-muted">
                    {Math.max(0, limit - used).toLocaleString('en-IN')} remaining · {percent}% used
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        </>)}
      </div>
    </main>
  );
}
