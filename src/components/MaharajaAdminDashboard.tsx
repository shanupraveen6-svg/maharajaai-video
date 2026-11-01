'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { CREDIT_BAR_COLOURS, creditStatuses, creditWarningText } from '@/lib/maharaja/credits';
import GoLivePromoManager from '@/components/GoLivePromoManager';
import ClientVideoLibrary from '@/components/ClientVideoLibrary';
import LockedAmountField from '@/components/LockedAmountField';
import { packageLabel, resolveAccess } from '@/lib/maharaja/access';
import { conceptsForCategory } from '@/lib/maharaja/video-concepts';
import type { CustomerCategory } from '@/lib/maharaja/config';
import { LIVE_CATEGORIES, isLiveMirrorReady } from '@/lib/tryfocus/live-categories';
import { fetchCompleteCatalogue } from '@/lib/maharaja/catalogue-client';
import {
  Download,
  ExternalLink,
  LoaderCircle,
  Monitor,
  QrCode,
  Tablet,
  Tv,
  Upload,
  Phone,
} from 'lucide-react';
import CatalogueBulkImport from '@/components/CatalogueBulkImport';
import TabletVideoHandoff from '@/components/TabletVideoHandoff';
import { NavTabs, Segmented, StatusPill } from '@/components/ui';
import { EVENT_OPTIONS, type EventId } from '@/lib/maharaja/config';
import {
  catalogueCategories,
  formatINR,
  type CatalogueCategoryId,
  type CatalogueAudience,
} from '@/lib/tryfocus/sample-data';

type WorkspaceData = {
  clientId: string;
  clientName: string;
  branch?: string;
  workspaceCode: string;
  campaignEnabled: boolean;
  minPurchaseTryOnDisabled?: boolean;
  tvBillSuffixRequired?: boolean;
  videoMinPurchase?: number;
  tryOnMinPurchase?: number;
  minimumsLockedUntil?: { tryOn?: number; video?: number };
  instagramUrl?: string;
  deliveryMode?: 'whatsapp' | 'qr';
  whatsappConnected?: boolean;
  whatsappEnabled?: boolean;
  devices?: {
    tv: boolean;
    tablet: boolean;
    mobile: boolean;
    led: boolean;
  };
  limits?: {
    image: number;
    live: number;
    video: number;
  };
  modules?: { image: boolean; live: boolean; video: boolean };
  activeEvents: EventId[];
  defaultEvent: EventId;
  tryOnCode: string;
  billingCode: string;
  openVideoCode: string;
  links: {
    workspace: string;
    tryOn: string;
    billing: string;
    openVideo: string;
    tv: string;
    /** Permanent Go Live player link for this workspace. */
    goLive: string;
  };
  whatsapp?: {
    configured: boolean;
    phoneNumberIdConfigured: boolean;
    templateName: string;
    languageCode: string;
    missing: string[];
  };
  usage: {
    tryOnScans: number;
    tryOnGenerated: number;
    liveSessions?: number;
    videoPasses: number;
    videosGenerated: number;
    goLive: number;
    retries: number;
    downloads: number;
  };
  showcaseSamples: Array<{
    id: string;
    displayName: string;
    createdAt: string;
  }>;
  goLiveAudit: GoLiveAuditItem[];
  /** This month's and last month's usage counters (IST months). */
  report?: { month: string; counts: Record<string, number>; lastCounts: Record<string, number> };
};

export type GoLiveAuditItem = {
  id: string;
  sessionId: string;
  customerName: string;
  customerLocality: string;
  eventId: string;
  queueNumber: number | null;
  status: string;
  liveConsent: boolean;
  loopConsent: boolean;
  promotionConsent: boolean;
  createdAt: string;
  expiresAt: string | null;
  videoUrl: string;
};

type ManagedCatalogueItem = {
  id: string;
  sku: string;
  title: string;
  price: number;
  gender: CatalogueAudience;
  audience: 'Women' | 'Men' | 'Boys' | 'Girls';
  category: CatalogueCategoryId;
  garmentType: string;
  imageUrl: string;
  thumbnailUrl?: string;
  garmentReferenceUrl?: string;
  fabricNote?: string;
  badge?: string;
  newArrival: boolean;
  eligibleForVideo: boolean;
  eligibleForLive?: boolean;
  active: boolean;
  sortOrder: number;
};

type CatalogueExperience = 'tryon' | 'live' | 'video';

const CATALOGUE_PAGE_SIZE = 16;
const CONCEPT_AUDIENCE: Record<CatalogueAudience, CustomerCategory> = { women: 'women', men: 'men', boys: 'boy', girls: 'girl' };

/** Live Mirror has its own four bridal categories; Try-On and AI Video use the full list. */
function categoryOptionsFor(experience: CatalogueExperience, gender: CatalogueAudience): Array<{ id: CatalogueCategoryId; label: string }> {
  if (experience === 'live') return LIVE_CATEGORIES[gender];
  return catalogueCategories.filter((cat) => cat.gender === gender).map((cat) => ({ id: cat.id as CatalogueCategoryId, label: cat.label }));
}

export default function MaharajaAdminDashboard({
  workspaceCode,
  expectedWorkspaceCode,
}: {
  workspaceCode?: string;
  expectedWorkspaceCode?: string;
}) {
  const activeWorkspaceCode = workspaceCode || expectedWorkspaceCode || 'workspace';
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [section, setSection] = useState<'overview' | 'catalogue' | 'qr' | 'gift' | 'golive'>('overview');
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Visible QR codes on the client workspace page
  const [tryOnQrImage, setTryOnQrImage] = useState<string>('');

  // Managed Catalogue state (Task 8 & Task 10)
  const [catalogue, setCatalogue] = useState<ManagedCatalogueItem[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState<boolean>(true);
  const [catGender, setCatGender] = useState<CatalogueAudience>('women');
  const [catExperience, setCatExperience] = useState<CatalogueExperience>('tryon');
  const [catFilter, setCatFilter] = useState<CatalogueCategoryId>('sarees');
  const [cataloguePage, setCataloguePage] = useState(0);
  const [showAddGarment, setShowAddGarment] = useState<boolean>(false);


  const loadWorkspace = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/maharaja/workspace?workspaceCode=${encodeURIComponent(activeWorkspaceCode)}`,
        { cache: 'no-store' }
      );
      const data = await response.json();
      if (response.status === 401) {
        setAuthRequired(true);
        setError('');
        return;
      }
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to load Maharaja workspace.');
      }
      setWorkspace(data.workspace);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load workspace.');
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceCode]);

  const loadCatalogue = useCallback(async () => {
    try {
      setCatalogue(await fetchCompleteCatalogue(true));
    } catch {
      // non-blocking
    } finally {
      setCatalogueLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
    void loadCatalogue();
    const timer = window.setInterval(loadWorkspace, 15000);
    return () => window.clearInterval(timer);
  }, [loadWorkspace, loadCatalogue]);

  // Generate visible QR images for Try-On and Direct AI Video
  useEffect(() => {
    if (!workspace?.links) return;
    if (workspace.links.tryOn) {
      QRCode.toDataURL(workspace.links.tryOn, {
        width: 260,
        margin: 1,
        color: { dark: '#161918', light: '#FAFBF8' },
      })
        .then(setTryOnQrImage)
        .catch(() => setTryOnQrImage(''));
    }
  }, [workspace]);

  async function savePatch(
    patch: Partial<
      Pick<
        WorkspaceData,
        | 'campaignEnabled'
        | 'activeEvents'
        | 'defaultEvent'
        | 'minPurchaseTryOnDisabled'
        | 'tvBillSuffixRequired'
        | 'videoMinPurchase'
        | 'tryOnMinPurchase'
        | 'instagramUrl'
      >
    >
  ) {
    setSaving(true);
    setNotice('');
    setError('');
    try {
      const response = await fetch('/api/maharaja/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...patch, workspaceCode: activeWorkspaceCode }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to update Maharaja settings.');
      }
      setWorkspace(data.workspace);
      setNotice('Store configuration saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update settings.');
    } finally {
      setSaving(false);
    }
  }

  function selectDefaultEvent(eventId: EventId) {
    if (!workspace || eventId !== 'diwali') return;
    const nextEvents = workspace.activeEvents.includes(eventId)
      ? workspace.activeEvents
      : [...workspace.activeEvents, eventId];
    void savePatch({ activeEvents: nextEvents, defaultEvent: eventId });
  }

  async function downloadBrandedQr(
    filename: string,
    title: string,
    subtitle: string,
    targetUrl: string
  ) {
    const qrCanvas = document.createElement('canvas');
    await QRCode.toCanvas(qrCanvas, targetUrl, {
      width: 560,
      margin: 2,
      color: { dark: '#161918', light: '#FAFBF8' },
    });

    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1120;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#F4F5F2';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#7A1428';
    ctx.lineWidth = 8;
    ctx.strokeRect(32, 32, canvas.width - 64, canvas.height - 64);

    ctx.fillStyle = '#7A1428';
    ctx.font = '700 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TRYFOCUS × THE MAJESTIC MAHARAJA', canvas.width / 2, 108);

    ctx.fillStyle = '#161918';
    ctx.font = '700 44px Georgia, serif';
    ctx.fillText(title, canvas.width / 2, 174);

    ctx.fillStyle = '#535A56';
    ctx.font = '500 24px sans-serif';
    ctx.fillText(subtitle, canvas.width / 2, 224);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(150, 276, 600, 600);
    ctx.strokeStyle = '#D8DCD7';
    ctx.lineWidth = 3;
    ctx.strokeRect(150, 276, 600, 600);
    ctx.drawImage(qrCanvas, 170, 296, 560, 560);

    ctx.fillStyle = '#161918';
    ctx.font = '600 24px monospace';
    ctx.fillText('SCAN WITH MOBILE CAMERA', canvas.width / 2, 950);

    const anchor = document.createElement('a');
    anchor.href = canvas.toDataURL('image/png');
    anchor.download = filename;
    anchor.click();
  }

  async function toggleCatalogueField(
    item: ManagedCatalogueItem,
    patch: Partial<Pick<ManagedCatalogueItem, 'active' | 'newArrival' | 'eligibleForVideo' | 'eligibleForLive'>>
  ) {
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/maharaja/catalogue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: item.sku,
          ...patch,
          ...(typeof patch.newArrival === 'boolean'
            ? { badge: patch.newArrival ? 'NEW ARRIVAL' : 'ROYAL SILK' }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Unable to update garment.');
      }
      setCatalogue((prev) =>
        prev.map((row) => (row.sku === item.sku ? { ...row, ...data.product } : row))
      );
      setNotice(`Updated ${item.sku}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update garment.');
    }
  }

  // The catalogue shows only experiences this store has; a stale choice falls back to the first one.
  const allowedExperiences = useMemo(() => {
    if (!workspace) return ['tryon'] as CatalogueExperience[];
    // AI Video pieces are offered on the TV and by the gift QR, so every AI Video store picks them; Live
    // Mirror needs the TV.
    const rules = resolveAccess(workspace.devices, workspace.modules);
    return (['tryon', 'video', 'live'] as const).filter((key) => key === 'tryon' ? rules.modules.image : key === 'live' ? rules.modules.live : rules.modules.video);
  }, [workspace]);
  const shownExperience: CatalogueExperience = allowedExperiences.includes(catExperience) ? catExperience : allowedExperiences[0] ?? 'tryon';
  const catCategories = useMemo(() => categoryOptionsFor(shownExperience, catGender), [shownExperience, catGender]);
  const activeCatFilter = catCategories.some((cat) => cat.id === catFilter) ? catFilter : catCategories[0]?.id;
  const filteredCatalogue = useMemo(
    () => catalogue.filter((item) => item.gender === catGender && item.category === activeCatFilter),
    [catalogue, catGender, activeCatFilter]
  );
  const catalogueTotalPages = Math.max(1, Math.ceil(filteredCatalogue.length / CATALOGUE_PAGE_SIZE));

  useEffect(() => setCataloguePage(0), [catExperience, catGender, catFilter]);

  if (loading && !workspace) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F4F5F2] text-ink">
        <LoaderCircle className="h-8 w-8 animate-spin text-brand" />
      </main>
    );
  }

  if (authRequired) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F4F5F2] px-6 text-ink">
        <div className="rounded-2xl max-w-md border border-line bg-canvas p-8 text-center">
          <h1 className="mt-2 text-3xl font-bold">
            Sign in to manage your store
          </h1>
          <p className="mt-3 text-sm text-muted">
            Access devices, QR handoffs, catalogue publishing, campaigns and the video library from one private workspace.
          </p>
          <button
            type="button"
            onClick={() => router.push(`/login?next=/maharaja/${activeWorkspaceCode}`)}
            className="mt-6 bg-brand px-5 py-3 text-xs font-bold text-[#FAF6EE]"
          >
            Sign in
          </button>
        </div>
      </main>
    );
  }

  const isValidWorkspace =
    Boolean(workspace) &&
    (activeWorkspaceCode === workspace?.workspaceCode ||
      activeWorkspaceCode === workspace?.clientId ||
      // "workspace" means the signed-in login's own workspace; the server decides which one that is.
      activeWorkspaceCode === 'workspace');

  if (!workspace || !isValidWorkspace) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F4F5F2] px-6 text-ink">
        <div className="rounded-2xl max-w-md border border-line bg-canvas p-8 text-center">
          <h1 className="mt-2 text-3xl font-bold">
            Workspace Not Found
          </h1>
          <p className="mt-3 text-sm text-muted">
            Check the workspace URL with your TryFocus administrator.
          </p>
        </div>
      </main>
    );
  }

  const devices = workspace.devices || { tv: true, tablet: true, mobile: true, led: true };
  // Effective credits: a module that is off, or whose device is off (see access.ts), counts as 0, which
  // hides its QR, credits and Go Live.
  const purchased = workspace.limits || { image: 4000, live: 500, video: 500 };
  const access = resolveAccess(devices, workspace.modules);
  const limits = {
    image: access.modules.image ? purchased.image : 0,
    live: access.modules.live ? purchased.live : 0,
    video: access.modules.video ? purchased.video : 0,
  };
  const minGateDisabled = workspace.minPurchaseTryOnDisabled !== false;
  const currentEvent =
    EVENT_OPTIONS.find((item) => item.id === workspace.defaultEvent) || EVENT_OPTIONS[0];
  // WhatsApp is connected per client by TryFocus admin; the client workspace only shows its status.
  const goLiveList = Array.isArray(workspace.goLiveAudit) ? workspace.goLiveAudit : [];
  const credits = creditStatuses(workspace.usage, limits);
  const videoMinimum = workspace.videoMinPurchase ?? 5000;
  // Go Live plays every AI Video (TV and gift QR) on the store's player, which comes with the TV.
  const goLiveOn = access.goLive && limits.video > 0;
  const monthCounts = workspace.report?.counts || {};
  const lastMonthCounts = workspace.report?.lastCounts || {};
  const monthName = workspace.report?.month
    ? new Date(`${workspace.report.month}-15T00:00:00Z`).toLocaleString('en-IN', { month: 'long' })
    : 'This month';
  // The store's monthly report: what customers did, against last month.
  const monthTiles = ([
    ['Wall QR scans', 'tryOnScans', limits.image > 0],
    ['Try-On looks', 'tryOnGenerated', limits.image > 0],
    ['Live Mirror sessions', 'liveSessions', limits.live > 0],
    ['AI Video QRs given', 'videoPasses', limits.video > 0],
    ['AI Videos made', 'videosGenerated', limits.video > 0],
    ['Go Live plays', 'goLive', goLiveOn],
    ['Downloads', 'downloads', true],
  ] as const).filter(([, , on]) => on);
  const catalogueExperiences = allowedExperiences.map((value) => ({ value, label: value === 'tryon' ? 'Try-On' : value === 'live' ? 'Live Mirror' : 'AI Video' }));
  // Customers' own phones are reached through the wall QR, so they are not a screen to open here.
  const screens = [
    devices.tv && { key: 'tv', title: 'Portrait TV', href: '/maharaja/tv/experience', desc: 'Try-On, Live Mirror and AI Video from your collection', Icon: Tv },
    devices.tablet && { key: 'tablet', title: 'Tablet', href: '/maharaja/tablet/experience', desc: limits.video > 0 ? 'Try-On from the collection or your own outfit, and the AI Video QR' : 'Try-On from the collection or your own outfit', Icon: Tablet },
    goLiveOn && { key: 'golive', title: 'Go Live player', href: workspace.links.goLive, desc: 'Plays your customers’ AI Videos, and your promos', Icon: Monitor },
  ].filter((screen) => screen !== false);
  const creditAlerts = credits.filter((item) => item.level !== 'ok' && item.level !== 'none');

  return (
    <main className="min-h-screen bg-canvas text-ink">
      {creditAlerts.length > 0 && (
        <div role="alert" className="border-b border-danger/20 bg-danger-soft px-5 py-3 text-sm text-danger sm:px-8">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
            <div>{creditAlerts.map((item) => <p key={item.label} className="font-semibold">{creditWarningText(item)}</p>)}</div>
            <a href="tel:9994837342" className="inline-flex items-center gap-1.5 font-semibold underline underline-offset-4"><Phone className="h-4 w-4" /> Add credits: 9994837342</a>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 pt-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">{workspace.clientName.replace(/^The\s+/i, '').charAt(0)}</span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold">{workspace.clientName}</h1>
              <p className="text-sm text-muted">{workspace.branch || 'Main showroom'} · Store workspace</p>
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => savePatch({ campaignEnabled: !workspace.campaignEnabled })}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${workspace.campaignEnabled ? 'bg-success-soft text-success' : 'bg-line text-muted'}`}
            title={workspace.campaignEnabled ? 'Tap to pause all customer experiences' : 'Tap to turn customer experiences back on'}
          >
            <span className={`h-2 w-2 rounded-full ${workspace.campaignEnabled ? 'bg-success' : 'bg-subtle'}`} />
            {workspace.campaignEnabled ? 'Live for customers' : 'Paused'}
          </button>
        </div>
        <div className="mx-auto mt-2 max-w-6xl px-5 sm:px-8">
          <NavTabs
            label="Workspace sections"
            value={section}
            onChange={setSection}
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'catalogue', label: 'Catalogue' },
              ...(limits.video > 0 ? [{ value: 'gift' as const, label: 'AI Video gift' }] : []),
              ...(limits.image > 0 ? [{ value: 'qr' as const, label: 'Wall QR' }] : []),
              ...(goLiveOn ? [{ value: 'golive' as const, label: 'Go Live & videos' }] : []),
            ]}
          />
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-5 py-6 sm:px-8">
        {(error || notice) && (
          <div className={`rounded-2xl p-4 text-sm font-medium ${error ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>
            {error || notice}
          </div>
        )}

        {section === 'overview' && <>
        <section className="tf-card p-6">
          <h2 className="text-lg font-bold">Festival theme</h2>
          <p className="mt-1 text-sm text-muted">Sets the scene for AI Videos. Now showing: <b className="text-ink">{currentEvent.label}</b></p>
          <div className="mt-4 flex flex-wrap gap-2">
            {EVENT_OPTIONS.map((ev) => {
              const selected = workspace.defaultEvent === ev.id;
              const isDiwali = ev.id === 'diwali';
              return (
                <button
                  key={ev.id}
                  type="button"
                  disabled={saving || !isDiwali}
                  onClick={() => selectDefaultEvent(ev.id)}
                  className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${selected ? 'bg-ink text-white' : isDiwali ? 'border border-line bg-white hover:border-ink' : 'border border-dashed border-line text-subtle'}`}
                >
                  {ev.label}{!isDiwali && <span className="ml-1.5 text-xs font-medium">Soon</span>}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold">{monthName} so far</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {monthTiles.map(([label, key]) => {
              const value = Number(monthCounts[key] || 0);
              const last = Number(lastMonthCounts[key] || 0);
              return (
                <div key={key} className="tf-card p-4">
                  <p className="text-[13px] font-medium text-muted">{label}</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums">{value.toLocaleString('en-IN')}</p>
                  <p className="mt-0.5 text-xs text-subtle tabular-nums">Last month {last.toLocaleString('en-IN')} · All time {Number(workspace.usage[key] || 0).toLocaleString('en-IN')}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr] [&>*]:min-w-0">
          <div className="tf-card p-6">
            <h2 className="text-lg font-bold">Credits left</h2>
            <p className="mt-1 text-sm text-muted">Your plan’s allowance for each experience.</p>
            <div className="mt-5 space-y-5">
              {credits.filter((item) => item.level !== 'none').map(({ label, used, limit, pct, level }) => (
                <div key={label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{label}</span>
                    <span className="text-sm text-muted"><b className="text-ink tabular-nums">{Math.max(0, limit - used).toLocaleString('en-IN')}</b> of {limit.toLocaleString('en-IN')} left</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
                    <div className={`h-full rounded-full ${CREDIT_BAR_COLOURS[level]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="tf-card p-6">
            <h2 className="text-lg font-bold">Your screens</h2>
            <p className="mt-1 text-sm text-muted">Package: {packageLabel(devices)}. Open each screen on the device it runs on.</p>
            <ul className="mt-4 divide-y divide-line">
              {screens.map(({ key, title, href, desc, Icon }) => (
                <li key={key} className="flex items-center gap-3 py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><Icon className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{title}</span>
                    <span className="block text-sm text-muted">{desc}</span>
                  </span>
                  <a href={href} target="_blank" rel="noopener noreferrer" className="tf-btn tf-btn-secondary !min-h-10 shrink-0 px-3 text-sm">
                    Open <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
              {limits.image > 0 && 'Customers try outfits on their own phones through the Wall QR. '}
              {limits.video > 0 && 'Give the AI Video gift QR after a purchase from the AI Video gift tab.'}
            </p>
          </div>
        </section>

        </>}

        {section === 'catalogue' && (
          <section className="tf-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">Your catalogue</h2>
                <p className="mt-1 text-sm text-muted">{catalogue.filter((item) => item.active).length} of {catalogue.length} garments showing to customers. Changes reach the TV, tablet and phones straight away.</p>
              </div>
              <button type="button" onClick={() => setShowAddGarment((open) => !open)} className="tf-btn tf-btn-primary !min-h-11 px-4 text-sm">
                <Upload className="h-4 w-4" /> {showAddGarment ? 'Close' : 'Add garments'}
              </button>
            </div>

            {showAddGarment && (
              <div className="mt-5 border-t border-line pt-5">
                <CatalogueBulkImport onPublished={loadCatalogue} />
              </div>
            )}

            <div className="mt-5 border-b border-line">
              <NavTabs label="Experience" value={shownExperience} onChange={setCatExperience} options={catalogueExperiences} />
            </div>

            <div className="mt-4 max-w-md">
              <Segmented
                size="sm"
                label="Who is it for?"
                value={catGender}
                onChange={(g) => { setCatGender(g); setCatFilter(categoryOptionsFor(shownExperience, g)[0]?.id ?? 'sarees'); }}
                options={([['women', 'Women'], ['men', 'Men'], ['boys', 'Boys'], ['girls', 'Girls']] as const).map(([value, label]) => ({ value, label }))}
              />
            </div>

            <div role="group" aria-label="Category" className="mt-3 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
              {catCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  aria-pressed={activeCatFilter === cat.id}
                  onClick={() => setCatFilter(cat.id)}
                  className={`-mb-px min-h-11 shrink-0 border-b-2 px-2.5 text-sm transition ${activeCatFilter === cat.id ? 'border-ink font-bold text-ink' : 'border-transparent font-medium text-muted hover:text-ink'}`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {shownExperience === 'video' && (
              <div className="mt-4">
                <p className="text-sm font-semibold text-ink">Video shots for {catGender}</p>
                <p className="mt-0.5 text-sm text-muted">Every AI Video for {catGender} uses one of these scenes. The customer’s outfit stays exactly as it is.</p>
                <ul className="mt-3 grid gap-3 sm:grid-cols-3">
                  {conceptsForCategory(CONCEPT_AUDIENCE[catGender]).map((concept, index) => (
                    <li key={concept.id} className="rounded-2xl border border-line bg-canvas p-4">
                      <p className="text-xs font-semibold text-muted">Shot {index + 1}</p>
                      <p className="mt-0.5 font-bold text-ink">{concept.title}</p>
                      <p className="mt-1 text-sm text-muted">{concept.mood}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm text-muted">Garments switched on below are offered for AI Video{devices.tv ? ' on the TV and' : ''} in the gift QR’s new collection. Keep your best, higher-value pieces here.</p>
              </div>
            )}

            {catalogueLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted">
                <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading catalogue…
              </div>
            ) : filteredCatalogue.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted">No garments in this category yet. Use Add garments to upload some.</p>
            ) : (
              <>
                <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {filteredCatalogue.slice(cataloguePage * CATALOGUE_PAGE_SIZE, (cataloguePage + 1) * CATALOGUE_PAGE_SIZE).map((item) => {
                    const on = shownExperience === 'tryon' ? item.active : shownExperience === 'live' ? isLiveMirrorReady(item) : item.eligibleForVideo;
                    // Live Mirror pieces all look ready; the switch alone says whether the TV shows them.
                    const faded = shownExperience !== 'live' && !on;
                    return (
                      <li key={item.sku} className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white ${faded ? 'border-dashed border-line-strong' : 'border-line'}`}>
                        <div className={`aspect-[3/4] w-full bg-canvas ${faded ? 'opacity-50' : ''}`}>
                          <img src={item.thumbnailUrl || item.imageUrl} alt={item.title} loading="lazy" className="h-full w-full object-contain object-top" />
                        </div>
                        <div className="flex flex-1 flex-col p-3">
                          <p className="line-clamp-1 text-sm font-semibold text-ink">{item.title}</p>
                          <p className="text-sm tabular-nums text-muted">{item.price > 0 ? formatINR(item.price) : 'No price'} · {item.sku}</p>
                          <div className="mt-auto flex flex-wrap gap-2 pt-3">
                            {shownExperience === 'tryon' && <>
                              <button type="button" aria-pressed={item.active} onClick={() => void toggleCatalogueField(item, { active: !item.active })} className={`min-h-9 rounded-full px-3 text-xs font-semibold ${item.active ? 'bg-ink text-white' : 'border border-line-strong text-muted'}`}>
                                {item.active ? 'Showing' : 'Hidden'}
                              </button>
                              <button type="button" aria-pressed={item.newArrival} onClick={() => void toggleCatalogueField(item, { newArrival: !item.newArrival })} className={`min-h-9 rounded-full px-3 text-xs font-semibold ${item.newArrival ? 'bg-ink text-white' : 'border border-line-strong text-muted'}`}>
                                New arrival
                              </button>
                            </>}
                            {shownExperience === 'live' && (<button type="button" aria-pressed={on} onClick={() => void toggleCatalogueField(item, { eligibleForLive: !item.eligibleForLive })} className={`min-h-9 rounded-full px-3 text-xs font-semibold ${on ? 'bg-ink text-white' : 'border border-line-strong text-muted'}`}>
                                  {on ? 'On Live Mirror' : 'Off'}
                                </button>)}
                            {shownExperience === 'video' && (
                              <button type="button" aria-pressed={on} onClick={() => void toggleCatalogueField(item, { eligibleForVideo: !item.eligibleForVideo })} className={`min-h-9 rounded-full px-3 text-xs font-semibold ${on ? 'bg-ink text-white' : 'border border-line-strong text-muted'}`}>
                                {on ? 'On AI Video' : 'Off'}
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-5 flex items-center justify-between gap-3 text-sm">
                  <button type="button" disabled={cataloguePage === 0} onClick={() => setCataloguePage((page) => page - 1)} className="tf-btn tf-btn-secondary !min-h-11 px-4 text-sm">
                    Back
                  </button>
                  <span className="tabular-nums text-muted">Page {cataloguePage + 1} of {catalogueTotalPages} · {filteredCatalogue.length} garments</span>
                  <button type="button" disabled={cataloguePage + 1 >= catalogueTotalPages} onClick={() => setCataloguePage((page) => page + 1)} className="tf-btn tf-btn-secondary !min-h-11 px-4 text-sm">
                    More
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {section === 'qr' && (
          <section className="max-w-3xl">
            {limits.image > 0 && (
              <div className="tf-card flex flex-col p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-2xl font-bold">Wall QR for Try-On</h2>
                  <StatusPill>Permanent</StatusPill>
                </div>
                <p className="mt-2 text-sm text-muted">Print it once and paste it on a wall, mirror or trial room. Customers scan it to try your outfits on their own phone.</p>

                <div className="mt-5 grid gap-5 sm:grid-cols-[180px_1fr] sm:items-center">
                  <div className="flex items-center justify-center rounded-2xl border border-line bg-canvas p-3">
                    {tryOnQrImage
                      ? <img src={tryOnQrImage} alt="Wall QR for Try-On" className="h-40 w-40 object-contain" />
                      : <span className="flex h-40 w-40 items-center justify-center"><QrCode className="h-10 w-10 text-muted" /></span>}
                  </div>
                  <ul className="space-y-2 text-sm text-ink">
                    <li>The QR never changes, so posters stay valid.</li>
                    <li>{minGateDisabled ? 'Anyone who scans can try outfits.' : `Customers scan a price tag of ${formatINR(workspace.tryOnMinPurchase ?? 500)} or more first.`}</li>
                    <li>Each Try-On uses one credit.</li>
                  </ul>
                </div>

                <div className="mt-5 border-t border-line pt-4">
                  <LockedAmountField
                    key={`tryon-${minGateDisabled ? 0 : workspace.tryOnMinPurchase ?? 500}`}
                    id="tryon-min-purchase"
                    label="Price tag needed first (₹)"
                    hint="0 = anyone can use it"
                    value={minGateDisabled ? 0 : workspace.tryOnMinPurchase ?? 500}
                    lockedUntil={workspace.minimumsLockedUntil?.tryOn}
                    disabled={saving}
                    onSave={(value) => savePatch({ tryOnMinPurchase: value })}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => downloadBrandedQr(`${workspace.clientName.replace(/[^a-z0-9]+/gi, '-')}-Try-On-wall-QR.png`, 'Try-On', 'Scan to try our outfits on your phone', workspace.links.tryOn)}
                  className="tf-btn tf-btn-primary mt-5 self-start"
                >
                  <Download className="h-4 w-4" /> Download for printing
                </button>
              </div>
            )}

          </section>
        )}

        {section === 'gift' && limits.video > 0 && (
          <section className="mx-auto max-w-md space-y-4">
            <TabletVideoHandoff qrOnly />
            <div className="tf-card p-5">
              <LockedAmountField
                key={`video-${videoMinimum}`}
                id="video-min-purchase"
                label="Give the gift for bills from (₹)"
                hint="0 = every bill"
                value={videoMinimum}
                lockedUntil={workspace.minimumsLockedUntil?.video}
                disabled={saving}
                onSave={(value) => savePatch({ videoMinPurchase: value })}
              />
            </div>
          </section>
        )}

        {section === 'golive' && (goLiveOn ? (
          <div className="space-y-6">
            <section className="tf-card p-6">
              <h2 className="text-lg font-bold">Went live ({goLiveList.length.toLocaleString('en-IN')})</h2>
              <div className="mt-4"><ClientVideoLibrary embedded /></div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
              <div className="tf-card p-6">
                <h2 className="text-lg font-bold">Promo videos</h2>
                <div className="mt-4"><GoLivePromoManager /></div>
              </div>

              <form
                className="tf-card self-start p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = new FormData(event.currentTarget).get('instagram');
                  void savePatch({ instagramUrl: typeof value === 'string' ? value : '' });
                }}
              >
                <label htmlFor="store-instagram" className="block text-lg font-bold">Instagram</label>
                <div className="mt-4 flex gap-2">
                  <input
                    id="store-instagram"
                    name="instagram"
                    key={workspace.instagramUrl || ''}
                    defaultValue={workspace.instagramUrl || ''}
                    placeholder="@yourstore"
                    className="min-h-11 min-w-0 flex-1 border border-line px-3 text-sm outline-none focus:border-brand"
                  />
                  <button type="submit" disabled={saving} className="tf-btn tf-btn-dark !min-h-11 px-4 text-sm">Save</button>
                </div>
              </form>
            </section>
          </div>
        ) : (
          <section className="tf-card p-6">
            <h2 className="text-2xl font-bold">Go Live player</h2>
            <p className="mt-2 max-w-xl text-sm text-muted">Go Live plays your customers’ AI Videos on your own LED or wall screen. It is switched off for your store right now. To turn it on, call TryFocus: <a href="tel:9994837342" className="font-semibold text-ink underline underline-offset-4">9994837342</a></p>
          </section>
        ))}
      </div>
    </main>
  );
}
