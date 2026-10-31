'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  Monitor,
  Plus,
  RefreshCw,
  Smartphone,
  Tablet,
  Tv,
  Video,
} from 'lucide-react';
import { catalogueCategories, formatINR, sampleCatalogue } from '@/lib/tryfocus/sample-data';
import { CREDIT_BAR_COLOURS, creditStatuses } from '@/lib/maharaja/credits';

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
  usage: { image: number; live: number; video: number };
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
    label: 'AI Image Try-On',
    standard: '4,000 generations',
    pro: '6,000 generations',
    icon: Smartphone,
  },
  {
    key: 'live',
    label: 'Live AI Try-On (TV Only)',
    standard: '500 × 60-second sessions',
    pro: '1,000 × 60-second sessions',
    icon: Monitor,
  },
  {
    key: 'video',
    label: 'AI Video (1-Day Pass)',
    standard: '500 video rewards',
    pro: '1,000 video rewards',
    icon: Video,
  },
] as const;

export default function TryFocusAdmin() {
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [clientId, setClientId] = useState<string>(initialClients[0].id);
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
      <main className="flex min-h-screen items-center justify-center bg-[#F4F5F2] px-6 text-[#161918]">
        <div className="w-full max-w-md border border-[#D8DCD7] bg-[#FFFFFF] p-8 shadow-sm">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7A1428]">
            TryFocus Super Admin · Protected Control Plane
          </p>
          <h1 className="mt-3 font-serif text-2xl font-semibold text-[#161918]">
            Operator authentication required
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#555E5A]">
            Sign in with your TryFocus operator credentials to view or modify multi-store client workspaces, device provisioning, and credit limits.
          </p>
          <Link
            href="/login?next=/admin"
            className="mt-6 flex w-full items-center justify-center border border-[#7A1428] bg-[#7A1428] px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-[#FAF6EE] transition hover:bg-[#5E0E1E]"
          >
            Sign In to TryFocus Admin
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F4F5F2] text-[#161918]">
      {/* Unified TryFocus Top Header */}
      <header className="sticky top-0 z-30 border-b border-[#D8DCD7] bg-[#F4F5F2]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center border border-[#161918] bg-[#161918] font-mono text-xs font-bold tracking-widest text-[#FAF6EE]">
              TF
            </span>
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7A1428]">
                TryFocus Super Admin · Universal Client Control Plane
              </p>
              <h1 className="font-serif text-xl font-semibold text-[#161918]">
                Store Management & Surface Provisioning
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowCreateForm((v) => !v)}
              className="inline-flex items-center gap-1.5 border border-[#161918] bg-white px-3.5 py-2 text-xs font-semibold text-[#161918] hover:bg-[#161918] hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              New Retailer Workspace
            </button>
            <Link
              href={client.links?.workspace || (client.id === 'maharaja' ? '/maharaja/workspace' : `/${client.id}/workspace`)}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-[#D8DCD7] bg-[#FAFBF8] px-3.5 py-2 text-xs font-semibold text-[#161918] hover:border-[#161918]"
            >
              {client.name} Workspace ↗
            </Link>
            <Link
              href={client.id === 'maharaja' ? '/maharaja/tv/experience' : `/${client.id}/tv/experience`}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-[#D8DCD7] bg-[#FAFBF8] px-3.5 py-2 text-xs font-semibold text-[#161918] hover:border-[#161918]"
            >
              TV Smart Mirror ↗
            </Link>
            <Link
              href={client.links?.tv || (client.id === 'maharaja' ? '/maharaja/tv' : `/${client.id}/tv`)}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-[#D8DCD7] bg-[#FAFBF8] px-3.5 py-2 text-xs font-semibold text-[#161918] hover:border-[#161918]"
            >
              TV Wall ↗
            </Link>
            <button
              type="button"
              disabled={saving}
              onClick={saveCurrentConfiguration}
              className="inline-flex items-center gap-1.5 bg-[#7A1428] px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] text-[#FAF6EE] disabled:opacity-50"
            >
              {saving ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-6 sm:px-8">
        {(savedNotice || errorNotice) && (
          <div
            className={`border p-4 text-sm font-semibold ${
              errorNotice
                ? 'border-[#B42318] bg-[#FEF3F2] text-[#B42318]'
                : 'border-[#256B45] bg-[#EBF5EE] text-[#256B45]'
            }`}
          >
            {errorNotice || savedNotice}
          </div>
        )}

        {/* Create New Retailer Workspace Drawer */}
        {showCreateForm && (
          <form
            onSubmit={createNewRetailer}
            className="border-2 border-[#161918] bg-white p-6 shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-[#D8DCD7] pb-4">
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#7A1428]">
                  Provision New Client Store
                </p>
                <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                  Create Isolated Retailer Workspace
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="text-xs font-semibold text-[#535A56] underline"
              >
                Cancel
              </button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#535A56]">
                Retailer Store Name
                <input
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  placeholder="e.g. Pothys Silk Palace"
                  className="mt-1.5 h-11 w-full border border-[#D8DCD7] bg-[#FAFBF8] px-3 text-sm font-semibold text-[#161918] outline-none focus:border-[#7A1428]"
                  required
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#535A56]">
                Branch / City
                <input
                  value={newStoreBranch}
                  onChange={(e) => setNewStoreBranch(e.target.value)}
                  placeholder="e.g. Chennai · T. Nagar"
                  className="mt-1.5 h-11 w-full border border-[#D8DCD7] bg-[#FAFBF8] px-3 text-sm font-semibold text-[#161918] outline-none focus:border-[#7A1428]"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={creatingClient}
                  className="h-11 w-full bg-[#7A1428] px-5 text-xs font-bold uppercase tracking-[0.16em] text-[#FAF6EE] disabled:opacity-50"
                >
                  {creatingClient ? 'Creating Workspace...' : 'Create Store Workspace'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Client Selector & Status */}
        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-6">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
              Store Setup · {loading ? 'Syncing...' : `${clients.length} Retailers Connected`}
            </p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-serif text-3xl font-semibold text-[#161918]">
                  Set up each store from one place.
                </h2>
                <p className="mt-2 max-w-xl text-sm text-[#535A56]">
                  Turn store experiences on or off, set hard generation credit ceilings, and control how customers continue on mobile. Every change persists to the backend and is enforced in the APIs.
                </p>
              </div>
              <div className="relative min-w-64">
                <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#535A56]">
                  Selected Retailer
                </label>
                <select
                  value={client.id}
                  onChange={(e) => setClientId(e.target.value)}
                  className="h-11 w-full appearance-none border border-[#D8DCD7] bg-white px-3.5 text-sm font-semibold text-[#161918] outline-none focus:border-[#7A1428]"
                >
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
                <ChevronDown className="pointer-events-none absolute bottom-3.5 right-3.5 h-4 w-4 text-[#535A56]" />
              </div>
            </div>
          </div>

          <aside className="flex flex-col justify-between border border-[#D8DCD7] bg-white p-6">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                Client Status & Policy
              </p>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="font-serif text-2xl font-semibold text-[#161918]">{client.name}</p>
                  <p className="text-xs text-[#535A56]">{client.branch}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateClient({ status: client.status === 'Active' ? 'Paused' : 'Active' })
                  }
                  className={`px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider ${
                    client.status === 'Active'
                      ? 'border border-[#256B45] bg-[#EBF5EE] text-[#256B45]'
                      : 'border border-[#B42318] bg-[#FEF3F2] text-[#B42318]'
                  }`}
                >
                  {client.status}
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 border-t border-[#D8DCD7] pt-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#535A56]">AI Image Try-On ₹500 Minimum:</span>
                <button
                  type="button"
                  onClick={() =>
                    updateClient({ minPurchaseTryOnDisabled: !client.minPurchaseTryOnDisabled })
                  }
                  className="font-mono font-bold text-[#256B45] underline"
                >
                  {client.minPurchaseTryOnDisabled
                    ? 'DISABLED (Direct Scan Active)'
                    : 'ENABLED (₹500 Tag Required)'}
                </button>
              </div>
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
                  className="min-h-10 py-2 text-right font-mono font-bold text-[#7A1428] underline disabled:cursor-not-allowed disabled:text-[#8A918D] disabled:no-underline"
                >
                  {client.whatsappConnected
                    ? 'CONNECTED (Link + QR)'
                    : client.whatsappApiReady
                      ? 'NOT CONNECTED (QR Only)'
                      : 'API NOT CONFIGURED (QR Only)'}
                </button>
              </div>
            </div>
          </aside>
        </section>

        {/* Client staff login */}
        <section className="border border-[#D8DCD7] bg-white p-6">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">Client Staff Login</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">{client.name} login</h2>
          <p className="mt-1 text-sm text-[#535A56]">
            This login opens only {client.name}&apos;s workspace, counter and devices. It cannot open TryFocus admin or another client.
          </p>
          <p className="mt-3 text-sm">
            <span className="text-[#535A56]">Existing logins: </span>
            <span className="font-mono font-bold">{client.logins?.length ? client.logins.join(', ') : 'none yet'}</span>
          </p>
          <form onSubmit={saveClientLogin} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input
              aria-label="Client login username"
              value={loginUsername}
              onChange={(event) => setLoginUsername(event.target.value)}
              placeholder="Username (e.g. srireadymade)"
              autoComplete="off"
              className="min-h-11 border border-[#D8DCD7] px-3 text-sm outline-none focus:border-[#7A1428]"
            />
            <input
              aria-label="Client login password"
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              placeholder="Password (8+ characters)"
              autoComplete="new-password"
              className="min-h-11 border border-[#D8DCD7] px-3 text-sm outline-none focus:border-[#7A1428]"
            />
            <button
              type="submit"
              disabled={saving || loginUsername.trim().length < 3 || loginPassword.length < 8}
              className="min-h-11 bg-[#7A1428] px-5 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50"
            >
              Save login
            </button>
          </form>
          <p className="mt-2 text-xs text-[#535A56]">Saving an existing username resets its password.</p>
        </section>

        {/* Purchased Device Access & Retailer Permissions */}
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="border border-[#D8DCD7] bg-white p-6">
            <div className="flex items-center justify-between border-b border-[#D8DCD7] pb-4">
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                  Purchased Device Surfaces
                </p>
                <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                  Turn Each Surface On or Off
                </h2>
              </div>
              <Tv className="h-6 w-6 text-[#7A1428]" />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(
                [
                  [
                    'tv',
                    'Interactive TV / Smart Mirror',
                    'AI Image Try-On, 60s Live Mirror & Catalogue Video',
                    Tv,
                  ],
                  [
                    'tablet',
                    'Counter Tablet & Billing',
                    'Staff-assisted 1-day Direct QR & giveaway passes',
                    Tablet,
                  ],
                  [
                    'mobile',
                    'Customer Mobile QR',
                    'Direct image scan, 1-day video pass, Download + Go Live',
                    Smartphone,
                  ],
                  [
                    'led',
                    'Showroom TV Wall (/maharaja/tv)',
                    'Plays approved customer Go Live videos & idle loop',
                    Monitor,
                  ],
                ] as const
              ).map(([key, title, description, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleDevice(key)}
                  className={`flex items-start gap-3.5 border p-4 text-left transition ${
                    client.devices[key]
                      ? 'border-[#7A1428] bg-[#FAFBF8]'
                      : 'border-[#D8DCD7] bg-[#F4F5F2] opacity-65'
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center ${
                      client.devices[key]
                        ? 'bg-[#7A1428] text-white'
                        : 'border border-[#D8DCD7] bg-white text-[#535A56]'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-serif text-base font-semibold text-[#161918]">{title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#535A56]">{description}</p>
                    <span
                      className={`mt-2.5 inline-block px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                        client.devices[key]
                          ? 'bg-[#EBF5EE] text-[#256B45]'
                          : 'bg-[#ECEEE9] text-[#535A56]'
                      }`}
                    >
                      {client.devices[key] ? 'Subscribed · Enabled' : 'Disabled'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-6">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
              Experience settings
            </p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
              Customer routing & active rules
            </h2>
            <div className="mt-4 space-y-3">
              {[
                [
                  'Mobile try-on',
                  client.minPurchaseTryOnDisabled
                    ? 'Free QR access is active for this store (₹500 tag gate disabled).'
                    : '₹500 minimum price-tag verification is required before Try-On.',
                ],
                [
                  'Video delivery',
                  client.whatsappConnected && client.whatsappApiReady
                    ? 'WhatsApp 1-day link + QR fallback is active for 24 hours.'
                    : 'Direct customer QR is active for 24 hours.',
                ],
                [
                  'TV video',
                  client.devices.tv
                    ? 'Featured catalogue looks generate Diwali portrait on TV and continue to mobile.'
                    : 'TV kiosk surface is currently disabled for this store.',
                ],
                [
                  'Customer choices',
                  client.devices.led
                    ? 'Customers can privately download or approve a Go Live video for the Showroom TV Wall.'
                    : 'Customers can privately download their AI outputs.',
                ],
              ].map(([title, desc]) => (
                <div key={title} className="flex gap-3 border border-[#D8DCD7] bg-white p-3.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#256B45]" />
                  <div>
                    <p className="text-xs font-bold text-[#161918]">{title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[#535A56]">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Usage & Hard Budget Ceilings */}
        <section className="border border-[#D8DCD7] bg-white p-6">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#D8DCD7] pb-4">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                Usage & Credit Ceilings (Enforced in APIs)
              </p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                Generation Credits for {client.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={saveCurrentConfiguration}
              className="border border-[#161918] bg-[#FAFBF8] px-3.5 py-1.5 font-mono text-xs font-bold uppercase text-[#161918] hover:bg-[#161918] hover:text-white"
            >
              Apply Credit Limits
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
                <article key={key} className="border border-[#D8DCD7] bg-[#FAFBF8] p-5">
                  <div className="flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center bg-[#161918] text-white">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="font-mono text-xs font-semibold text-[#535A56]">
                      {used.toLocaleString('en-IN')} used
                    </span>
                  </div>
                  <h3 className="mt-3 font-serif text-xl font-semibold text-[#161918]">
                    {plan.label}
                  </h3>
                  <div className="mt-3 flex items-center gap-3">
                    <input
                      aria-label={`${plan.label} limit`}
                      type="number"
                      value={limit}
                      onChange={(e) => setLimit(key, Number(e.target.value))}
                      onBlur={() => void saveCurrentConfiguration()}
                      className="h-10 w-32 border border-[#D8DCD7] bg-white px-3 font-mono text-sm font-bold text-[#161918] outline-none focus:border-[#7A1428]"
                    />
                    <span className="text-xs text-[#535A56]">hard limit</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      aria-pressed={client.modules?.[key] !== false}
                      onClick={() => void persistClientPatch({ modules: { ...(client.modules || { image: true, live: true, video: true }), [key]: client.modules?.[key] === false } })}
                      className={`min-h-10 px-3 text-xs font-bold uppercase tracking-wider ${client.modules?.[key] === false ? 'border border-[#D8DCD7] bg-white text-[#535A56]' : 'bg-[#256B45] text-white'}`}
                    >
                      {client.modules?.[key] === false ? 'Module off' : 'Module on'}
                    </button>
                    {(['standard', 'pro'] as const).map((tier) => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => void persistClientPatch({ limits: { ...client.limits, [key]: PLAN_CREDITS[key][tier] } })}
                        className="min-h-10 border border-[#161918] bg-white px-3 text-xs font-bold uppercase tracking-wider"
                      >
                        {tier === 'standard' ? 'Standard' : 'Pro'} · {PLAN_CREDITS[key][tier].toLocaleString('en-IN')}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 h-2 overflow-hidden bg-[#ECEEE9]">
                    <div className={`h-full ${CREDIT_BAR_COLOURS[level]}`} style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mt-2 font-mono text-xs text-[#535A56]">
                    {Math.max(0, limit - used).toLocaleString('en-IN')} remaining · {percent}% used
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        {/* Store Catalogue Summary */}
        <section className="border border-[#D8DCD7] bg-[#FAFBF8] p-6">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#D8DCD7] pb-4">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                Active Store Catalogue · {sampleCatalogue.length} Default Outfits (Managed in Client Workspace)
              </p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                Women & Men South Indian Collection
              </h2>
            </div>
            <Link
              href="/maharaja/workspace"
              className="inline-flex items-center gap-1.5 bg-[#7A1428] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-[#FAF6EE]"
            >
              Manage Store Catalogue
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalogueCategories.map((cat) => {
              const items = sampleCatalogue.filter((item) => item.category === cat.id);
              return (
                <div key={cat.id} className="border border-[#D8DCD7] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#7A1428]">
                      {cat.gender} · {items.length} Models
                    </span>
                    <span className="font-mono text-xs text-[#535A56]">
                      {formatINR(items[0]?.price || 0)} –{' '}
                      {formatINR(items[items.length - 1]?.price || 0)}
                    </span>
                  </div>
                  <h3 className="mt-1 font-serif text-lg font-semibold text-[#161918]">
                    {cat.label}
                  </h3>
                  <p className="text-xs text-[#535A56]">{cat.description}</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
