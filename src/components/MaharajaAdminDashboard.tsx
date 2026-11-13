'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { CREDIT_LEVEL_STATUS, creditStatuses, creditWarningText } from '@/lib/maharaja/credits';
import GoLivePromoManager from '@/components/GoLivePromoManager';
import ClientVideoLibrary from '@/components/ClientVideoLibrary';
import LockedAmountField from '@/components/LockedAmountField';
import { resolveAccess } from '@/lib/maharaja/access';
import { isLiveMirrorReady } from '@/lib/tryfocus/live-categories';
import { fetchCompleteCatalogue } from '@/lib/maharaja/catalogue-client';
import {
  Download,
  ExternalLink,
  LoaderCircle,
  Monitor,
  QrCode,
  Tablet,
  Tv,
  Phone,
} from 'lucide-react';
import CatalogueBulkImport from '@/components/CatalogueBulkImport';
import StoreCategoriesEditor from '@/components/StoreCategoriesEditor';
import StoreLogoCard from '@/components/StoreLogoCard';
import { allCategoriesFor, categoriesFor, AUDIENCES, type CustomCategory, type StoreCategoryLists, type WesternOverrides } from '@/lib/tryfocus/store-categories';
import CatalogueTable, { type CatalogueTableRow } from '@/components/CatalogueTable';
import { NavTabs, Segmented, StatusPill, Switch } from '@/components/ui';
import CustomerLeads from '@/components/CustomerLeads';
import { downloadBrandedQr as downloadBrandedQrPoster } from '@/lib/maharaja/branded-qr';
import { EVENT_OPTIONS, type EventId } from '@/lib/maharaja/config';
import {
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
  categoryLists?: StoreCategoryLists;
  customCategories?: CustomCategory[];
  videoCategoryLists?: StoreCategoryLists;
  westernOverrides?: WesternOverrides;
  westernRuleAppliedAt?: string;
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
  trending?: boolean;
  eligibleForVideo: boolean;
  eligibleForLive?: boolean;
  active: boolean;
  sortOrder: number;
  createdAt?: string;
};

const CATALOGUE_PAGE_SIZE = 25;
const AUDIENCE_NAMES: Record<CatalogueAudience, string> = { women: 'Women', men: 'Men', boys: 'Boys', girls: 'Girls' };

export default function MaharajaAdminDashboard({
  workspaceCode,
  expectedWorkspaceCode,
  adminTab,
}: {
  workspaceCode?: string;
  expectedWorkspaceCode?: string;
  /** TryFocus admin only: its setup (platform, credits, login, delivery) as one more tab, and no second store header. */
  adminTab?: React.ReactNode;
}) {
  const activeWorkspaceCode = workspaceCode || expectedWorkspaceCode || 'workspace';
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [section, setSection] = useState<'overview' | 'catalogue' | 'qr' | 'golive' | 'customers' | 'settings' | 'plan'>('overview');
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
  // Catalogue tab: Image Try-On (the whole collection), Live Try-On (the garments switched on for it) or
  // AI Video (priced pieces); one panel open at a time.
  const [catSection, setCatSection] = useState<'tryon' | 'live' | 'video'>('tryon');
  const [catPanel, setCatPanel] = useState<'categories' | 'upload' | null>(null);
  const [catGender, setCatGender] = useState<CatalogueAudience | null>(null);
  const [catFilter, setCatFilter] = useState<string>('');
  const [catalogueBusy, setCatalogueBusy] = useState(false);
  // Go Live videos still kept (one day), as counted by the Went live list.
  const [goLiveCount, setGoLiveCount] = useState<number | null>(null);
  const [cataloguePage, setCataloguePage] = useState(0);
  // null until the logo check answers.


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
      setCatalogue(await fetchCompleteCatalogue(true, '', activeWorkspaceCode));
    } catch {
      // non-blocking
    } finally {
      setCatalogueLoading(false);
    }
  }, [activeWorkspaceCode]);

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
        | 'categoryLists'
        | 'videoCategoryLists'
        | 'customCategories'
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
      setNotice('Saved.');
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

  // The printable QR poster, shared with the counter tablet's Wall QR tab.
  function downloadBrandedQr(filename: string, title: string, subtitle: string, targetUrl: string) {
    return downloadBrandedQrPoster({ storeName: workspace?.clientName || '', filename, title, subtitle, targetUrl });
  }

  async function toggleCatalogueField(
    item: ManagedCatalogueItem,
    patch: Partial<Pick<ManagedCatalogueItem, 'active' | 'newArrival' | 'eligibleForVideo' | 'eligibleForLive' | 'price' | 'title' | 'category' | 'garmentType'>>
  ) {
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/maharaja/catalogue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: item.sku,
          workspaceCode: activeWorkspaceCode,
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
      setNotice(`Saved ${data.product?.title || item.sku}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update garment.');
    }
  }

  const customCats = useMemo(() => workspace?.customCategories || [], [workspace?.customCategories]);
  const sectionLists = catSection === 'video' ? workspace?.videoCategoryLists : workspace?.categoryLists;
  // Image Try-On holds everything; Live Try-On the garments switched on for it; AI Video the priced pieces.
  const sectionGarments = useMemo(() => (
    catSection === 'video' ? catalogue.filter((item) => item.eligibleForVideo)
      : catSection === 'live' ? catalogue.filter((item) => item.eligibleForLive === true)
        : catalogue
  ), [catalogue, catSection]);

  const garmentCounts = useMemo(() => sectionGarments.reduce<Record<string, number>>((counts, item) => {
    counts[item.category] = (counts[item.category] || 0) + 1;
    return counts;
  }, {}), [sectionGarments]);

  /** Category tabs: only categories holding a garment for this Who, as "Shirts (20)"; hidden ones marked. */
  const catTabs = useMemo(() => {
    if (!catGender) return [];
    const count = (id: string) => sectionGarments.filter((item) => item.gender === catGender && item.category === id).length;
    const shown = categoriesFor(sectionLists, catGender, customCats);
    const extra = allCategoriesFor(catGender, customCats).filter((cat) => !shown.some((item) => item.id === cat.id));
    return [
      ...shown.map((cat) => ({ id: cat.id as string, label: cat.label, hidden: false, count: count(cat.id as string) })),
      ...extra.map((cat) => ({ id: cat.id as string, label: cat.label, hidden: catSection !== 'live', count: count(cat.id as string) })),
    ].filter((cat) => cat.count > 0);
  }, [catGender, sectionLists, customCats, sectionGarments, catSection]);
  const activeCatFilter = catTabs.some((cat) => cat.id === catFilter) ? catFilter : catTabs[0]?.id;
  const activeCatLabel = catTabs.find((cat) => cat.id === activeCatFilter)?.label || '';

  const filteredCatalogue = useMemo(() => (catGender ? sectionGarments.filter((item) => item.gender === catGender && item.category === activeCatFilter) : []), [sectionGarments, catGender, activeCatFilter]);
  const catalogueTotalPages = Math.max(1, Math.ceil(filteredCatalogue.length / CATALOGUE_PAGE_SIZE));
  // The switch above the Image Try-On table: on when every garment in this category is on Live Try-On.
  const categoryAllLive = filteredCatalogue.length > 0 && filteredCatalogue.every((item) => item.eligibleForLive === true);

  function rowFor(item: ManagedCatalogueItem): CatalogueTableRow {
    return { key: item.sku, sku: item.sku, image: item.thumbnailUrl || item.imageUrl, title: item.title, price: item.price > 0 ? String(item.price) : '', western: item.eligibleForLive === true };
  }

  /** ✕ in Image Try-On deletes the garment; in AI Video or Live Try-On it only takes it off there. */
  async function removeGarments(skus: string[]) {
    const action = catSection === 'video' ? 'ai-video-off' : catSection === 'live' ? 'live-off' : 'delete';
    setCatalogueBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/maharaja/catalogue/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceCode: activeWorkspaceCode, skus, action }) });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not update the garments.');
      const chosen = new Set(skus);
      setCatalogue((prev) => (action === 'delete' ? prev.filter((item) => !chosen.has(item.sku))
        : prev.map((item) => (chosen.has(item.sku) ? (action === 'live-off' ? { ...item, eligibleForLive: false } : { ...item, eligibleForVideo: false }) : item))));
      setNotice(action === 'delete' ? `${data.count} garment(s) deleted.` : `${data.count} garment(s) taken off ${action === 'live-off' ? 'Live Try-On' : 'AI Video'}. They stay in Image Try-On.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the garments.');
    } finally {
      setCatalogueBusy(false);
    }
  }

  /** Live Try-On on or off for a whole category: every garment in it follows, and new uploads into it too. */
  async function setWesternWear(categoryId: string, western: boolean) {
    setCatalogueBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/maharaja/catalogue/western', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceCode: activeWorkspaceCode, categoryId, western }) });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not update Live Try-On.');
      setWorkspace((prev) => (prev ? { ...prev, westernOverrides: data.westernOverrides } : prev));
      setCatalogue((prev) => prev.map((item) => (item.category === categoryId ? { ...item, eligibleForLive: western } : item)));
      setNotice(`${data.changed} garment(s) switched ${western ? 'on' : 'off'} for Live Try-On.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update Live Try-On.');
    } finally {
      setCatalogueBusy(false);
    }
  }

  useEffect(() => setCataloguePage(0), [catGender, catFilter, catSection]);

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
            Your Wall QR, catalogue, credits and customer videos, in one private workspace.
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
            Workspace not found
          </h1>
          <p className="mt-3 text-sm text-muted">
            Check the link with TryFocus.
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
  // Go Live plays every AI Video (made on the TV) on the store's player, which comes with the TV.
  const goLiveOn = access.goLive && limits.video > 0;
  const monthCounts = workspace.report?.counts || {};
  const lastMonthCounts = workspace.report?.lastCounts || {};
  const monthName = workspace.report?.month
    ? new Date(`${workspace.report.month}-15T00:00:00Z`).toLocaleString('en-IN', { month: 'long' })
    : 'This month';
  // The store's monthly report: what customers did, against last month.
  // Counts only, nothing else: Image Try-On and Wall QR scans apply to both packages; Go Live and Real
  // Live Try-On only to a store with the TV (Tablet-only stores never see those two).
  const monthTiles = ([
    ['Image Try-On', 'tryOnGenerated', limits.image > 0],
    ['AI Video', 'videosGenerated', limits.video > 0],
    ['Go Live', 'goLive', Boolean(devices.tv) && goLiveOn],
    ['Live Try-On', 'liveSessions', Boolean(devices.tv) && limits.live > 0],
    ['Wall QR scans', 'tryOnScans', limits.image > 0],
  ] as const).filter(([, , on]) => on);
  // Customers' own phones are reached through the wall QR, so they are not a screen to open here.
  const screens = [
    devices.tv && { key: 'tv', title: 'Portrait TV', href: '/maharaja/tv/experience', desc: 'Try-On, Live Try-On and AI Video from your collection', Icon: Tv },
    devices.tablet && { key: 'tablet', title: 'Tablet', href: '/maharaja/tablet/experience', desc: 'Try-On from the collection or your own outfit', Icon: Tablet },
    goLiveOn && { key: 'golive', title: 'Go Live player', href: workspace.links.goLive, desc: 'Plays your customers’ AI Videos, and your promos', Icon: Monitor },
  ].filter((screen) => screen !== false);
  // Your plan, in the words of the pricing page. The phone comes with the TV and the tablet.
  const planPlatforms = [
    { label: 'TV', on: Boolean(devices.tv) },
    { label: 'Tablet', on: Boolean(devices.tablet) },
    { label: 'Phone', on: true },
  ];
  const creditAlerts = credits.filter((item) => item.level !== 'ok' && item.level !== 'none');

  // Working now: one row per thing customers use, with where it runs and whether it works right now.
  const levelOf = (label: string) => credits.find((item) => item.label === label)?.level ?? 'none';
  const showing = catalogue.filter((item) => item.active);
  const videoPieces = showing.filter((item) => item.eligibleForVideo).length;
  const livePieces = showing.filter((item) => isLiveMirrorReady(item)).length;
  type Tone = 'success' | 'warn' | 'danger' | 'neutral';
  const rowStatus = (label: string, pieces: number | null, noPieces: string): { status: string; tone: Tone } => {
    if (!workspace.campaignEnabled) return { status: 'Paused', tone: 'neutral' };
    const level = levelOf(label);
    if (level === 'exhausted') return { status: 'Credits finished', tone: 'danger' };
    if (pieces === 0 && !catalogueLoading) return { status: noPieces, tone: 'warn' };
    // The design system's one status word for this row; the StatusPill beside it carries the finer
    // 50/70/90/95% wording, so the two don't disagree on how close the credits are.
    if (level !== 'ok') return { status: 'Working, credits low', tone: level === 'critical' || level === 'final' ? 'danger' : 'warn' };
    return { status: 'Working', tone: 'success' };
  };
  const working: Array<{ title: string; where: string; note?: string; status: string; tone: Tone }> = [
    limits.image > 0 && {
      title: 'Image Try-On',
      where: [devices.tv && 'TV', devices.tablet && 'Tablet', 'Customer’s phone (Wall QR)'].filter(Boolean).join(' · '),
      note: catalogueLoading ? undefined : `${showing.length.toLocaleString('en-IN')} garments showing`,
      ...rowStatus('Try-On', showing.length, 'Own outfit only, add garments'),
    },
    limits.video > 0 && {
      title: 'AI Video',
      where: [devices.tv && 'TV', devices.tablet && 'Tablet QR', 'Gift QR'].filter(Boolean).join(' · '),
      note: catalogueLoading ? undefined : `${videoPieces.toLocaleString('en-IN')} garments on AI Video`,
      ...rowStatus('AI Video', videoPieces, 'Switch on garments'),
    },
    limits.live > 0 && {
      title: 'Live Try-On',
      where: 'TV',
      note: catalogueLoading ? undefined : `${livePieces.toLocaleString('en-IN')} garments on Live Try-On`,
      ...rowStatus('Live Try-On', livePieces, 'Switch on garments'),
    },
    limits.video > 0 && {
      title: 'Go Live player',
      where: 'Your LED or wall screen',
      ...(goLiveOn
        ? (workspace.campaignEnabled ? { status: 'Working', tone: 'success' as Tone } : { status: 'Paused', tone: 'neutral' as Tone })
        : { status: 'Off', tone: 'neutral' as Tone, note: 'AI Videos are download only' }),
    },
  ].filter((row) => row !== false);

  // Your plan: one row per feature, with its status and the credits left (Go Live has no credits).
  const planRows = working
    .map((row) => ({ ...row, credit: credits.find((item) => item.label === (row.title === 'Image Try-On' ? 'Try-On' : row.title) && item.level !== 'none') }));
  const toneText: Record<Tone, string> = { success: 'text-success', warn: 'text-warn', danger: 'text-danger', neutral: 'text-muted' };

  // Inside TryFocus admin the page already has its own <main>.
  const Shell = adminTab ? 'div' : 'main';
  return (
    <Shell className="min-h-screen bg-canvas text-ink">
      {(creditAlerts.length > 0 || !workspace.campaignEnabled) && (
        <div role="alert" className="border-b border-danger/20 bg-danger-soft px-5 py-3 text-sm text-danger sm:px-8">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
            <div>
              {!workspace.campaignEnabled && <p className="font-semibold">Your store is paused: customers see a closed message. Tap Paused to turn it back on.</p>}
              {creditAlerts.map((item) => <p key={item.label} className="font-semibold">{creditWarningText(item)}</p>)}
            </div>
            <a href="tel:9994837342" className="inline-flex items-center gap-1.5 font-semibold underline underline-offset-4"><Phone className="h-4 w-4" /> Add credits: 9994837342</a>
          </div>
        </div>
      )}
      <header className={adminTab ? 'border-b border-line bg-canvas' : 'sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur-md'}>
        {!adminTab && <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 pt-4 sm:px-8">
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
        </div>}
        <div className="mx-auto mt-2 max-w-6xl px-5 sm:px-8">
          <NavTabs
            wrap
            label="Workspace sections"
            value={section}
            onChange={setSection}
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'catalogue', label: 'Catalogue' },
              ...(limits.image > 0 ? [{ value: 'qr' as const, label: 'Wall QR' }] : []),
              ...(goLiveOn ? [{ value: 'golive' as const, label: 'Go Live & videos' }] : []),
              { value: 'customers', label: 'Customers' },
              { value: 'settings', label: 'Settings' },
              ...(adminTab ? [{ value: 'plan' as const, label: 'Plan · TryFocus only' }] : []),
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
        {/* 1. Your plan: what TryFocus gave the store, one row per feature with its status and credits left. */}
        <section className="tf-card p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">Your plan</h2>
            <p className="text-sm font-semibold text-muted">{planPlatforms.filter((item) => item.on).map((item) => item.label).join(' · ')}</p>
          </div>
          <ul className="mt-3 divide-y divide-line">
            {planRows.map((row) => (
              <li key={row.title} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-2.5 text-sm sm:grid-cols-[9rem_1fr_auto_auto]">
                <span className="font-semibold text-ink">{row.title}</span>
                <span className={`order-3 col-span-2 sm:order-none sm:col-span-1 ${toneText[row.tone]}`}>{row.status}</span>
                <span className="hidden tabular-nums text-muted sm:block">{row.credit ? <><b className="text-ink">{Math.max(0, row.credit.limit - row.credit.used).toLocaleString('en-IN')}</b> of {row.credit.limit.toLocaleString('en-IN')} left</> : ''}</span>
                <span className="justify-self-end">{row.credit && <StatusPill tone={CREDIT_LEVEL_STATUS[row.credit.level].tone}>{row.credit.limit - row.credit.used > 0 && <span className="sm:hidden">{Math.max(0, row.credit.limit - row.credit.used).toLocaleString('en-IN')} left · </span>}{CREDIT_LEVEL_STATUS[row.credit.level].text}</StatusPill>}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 2. Open your screens: one row of buttons. */}
        {(screens.length > 0 || limits.image > 0) && (
          <section className="tf-card p-5 sm:p-6">
            <h2 className="text-lg font-bold">Open your screens</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {screens.map(({ key, title, href, Icon }) => (
                <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="tf-btn tf-btn-secondary !min-h-11 px-4 text-sm">
                  <Icon className="h-4 w-4" /> {title} <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ))}
              {limits.image > 0 && (
                <button type="button" onClick={() => downloadBrandedQr(`${workspace.clientName.replace(/[^a-z0-9]+/gi, '-')}-Try-On-wall-QR.png`, 'Try-On', 'Scan to try our outfits on your phone', workspace.links.tryOn)} className="tf-btn tf-btn-secondary !min-h-11 px-4 text-sm">
                  <Download className="h-4 w-4" /> Wall QR
                </button>
              )}
            </div>
            {screens.length > 0 && <p className="mt-2 text-sm text-muted">Open each once on its device; it stays signed in.</p>}
          </section>
        )}

        {/* 3. This month: counts only, nothing else. */}
        <section className="tf-card p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">{monthName} so far</h2>
            <p className="text-sm text-muted">Last month in brackets</p>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {monthTiles.map(([label, key]) => (
              <div key={key} className="rounded-2xl bg-canvas p-4">
                <dt className="text-[13px] text-muted">{label}</dt>
                <dd className="mt-1 tabular-nums"><b className="text-2xl text-ink">{Number(monthCounts[key] || 0).toLocaleString('en-IN')}</b> <span className="text-subtle">({Number(lastMonthCounts[key] || 0).toLocaleString('en-IN')})</span></dd>
              </div>
            ))}
          </dl>
        </section>
        </>}

        {section === 'customers' && <CustomerLeads clientId={activeWorkspaceCode} />}

        {section === 'settings' && (
          <div className="max-w-3xl space-y-4">
        <StoreLogoCard clientId={activeWorkspaceCode} />

        <form
          className="tf-card p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get('instagram');
            void savePatch({ instagramUrl: typeof value === 'string' ? value : '' });
          }}
        >
          <label htmlFor="store-instagram" className="block text-lg font-bold">Instagram</label>
          <p className="mt-1 text-sm text-muted">Customers see Follow us on Instagram after they download a look.</p>
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

        {goLiveOn && (
          <section className="tf-card p-6">
            <h2 className="text-lg font-bold">Promotion videos</h2>
            <div className="mt-2"><GoLivePromoManager clientId={activeWorkspaceCode} /></div>
          </section>
        )}

        {(limits.image > 0 || limits.video > 0) && (
          <section className="tf-card space-y-5 p-6">
            <div>
              <h2 className="text-lg font-bold">Minimum bill</h2>
              <p className="mt-1 text-sm text-muted">What a customer must buy before it starts. 0 lets everyone in.</p>
            </div>
            {limits.image > 0 && (
              <LockedAmountField
                key={`tryon-${minGateDisabled ? 0 : workspace.tryOnMinPurchase ?? 500}`}
                id="tryon-min-purchase"
                label="Wall QR Try-On (₹)"
                hint="The phone reads a photo of the bill first · 0 = anyone"
                value={minGateDisabled ? 0 : workspace.tryOnMinPurchase ?? 500}
                lockedUntil={workspace.minimumsLockedUntil?.tryOn}
                disabled={saving}
                onSave={(value) => savePatch({ tryOnMinPurchase: value })}
              />
            )}
            {limits.video > 0 && (
              <LockedAmountField
                key={`video-${videoMinimum}`}
                id="video-min-purchase"
                label="AI Video on the TV (₹)"
                hint="The TV asks for the bill's last 4 digits · 0 = every bill (a free gift)"
                value={videoMinimum}
                lockedUntil={workspace.minimumsLockedUntil?.video}
                disabled={saving}
                onSave={(value) => savePatch({ videoMinPurchase: value })}
              />
            )}
          </section>
        )}

        {limits.video > 0 && (
        <section className="tf-card p-6">
            <h3 className="text-lg font-bold">Festival theme</h3>
            <p className="mt-1 text-sm text-muted">Sets the scene for AI Videos. Now showing: <b className="text-ink">{currentEvent.label}</b>. More festivals are added through the year.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {EVENT_OPTIONS.filter((ev) => ev.id === 'diwali').map((ev) => {
                const selected = workspace.defaultEvent === ev.id;
                return (
                  <button
                    key={ev.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={saving}
                    onClick={() => selectDefaultEvent(ev.id)}
                    className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${selected ? 'bg-ink text-white' : 'border border-line bg-white hover:border-ink'}`}
                  >
                    {ev.label}
                  </button>
                );
              })}
            </div>
          </section>
        )}


          </div>
        )}

        {section === 'plan' && adminTab}

        {section === 'catalogue' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">Your catalogue</h2>
                <p className="mt-1 text-sm text-muted">
                  {catalogueLoading ? 'Loading…' : [
                    `${catalogue.length.toLocaleString('en-IN')} on Image Try-On`,
                    limits.live > 0 && `${catalogue.filter((item) => item.eligibleForLive === true).length.toLocaleString('en-IN')} on Live Try-On`,
                    limits.video > 0 && `${catalogue.filter((item) => item.eligibleForVideo).length.toLocaleString('en-IN')} on AI Video`,
                  ].filter(Boolean).join(' · ')}
                  {catalogueBusy && <LoaderCircle className="ml-2 inline h-4 w-4 animate-spin" />}
                </p>
              </div>
              <div className="w-full max-w-md">
                <Segmented
                  size="sm"
                  label="Section"
                  value={catSection}
                  onChange={(value) => { setCatSection(value); setCatPanel(null); setCatFilter(''); }}
                  options={[
                    { value: 'tryon' as const, label: 'Image Try-On' },
                    ...(limits.live > 0 ? [{ value: 'live' as const, label: 'Live Try-On' }] : []),
                    ...(limits.video > 0 ? [{ value: 'video' as const, label: 'AI Video' }] : []),
                  ]}
                />
              </div>
            </div>

            <section className="tf-card space-y-5 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="w-full max-w-md">
                  <Segmented size="sm" label="Who is it for?" value={catGender} onChange={(g) => { setCatGender(g); setCatFilter(''); }} options={AUDIENCES.map((value) => ({ value, label: value === 'boys' || value === 'girls' ? <>{AUDIENCE_NAMES[value]} <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold leading-none text-brand">Kids</span></> : AUDIENCE_NAMES[value] }))} />
                </div>
                <div className="flex gap-2">
                  {catSection !== 'live' && <button type="button" aria-pressed={catPanel === 'categories'} onClick={() => setCatPanel((open) => (open === 'categories' ? null : 'categories'))} className={`tf-btn !min-h-11 px-5 text-sm ${catPanel === 'categories' ? 'bg-ink text-white' : 'tf-btn-secondary'}`}>Categories</button>}
                  <button type="button" aria-pressed={catPanel === 'upload'} onClick={() => setCatPanel((open) => (open === 'upload' ? null : 'upload'))} className="tf-btn tf-btn-primary !min-h-11 px-5 text-sm">{catPanel === 'upload' ? 'Close upload' : 'Upload garments'}</button>
                </div>
              </div>

              {catPanel === 'categories' && catSection !== 'live' && (
                <div className="rounded-2xl border border-line bg-canvas p-5">
                  {catSection === 'tryon' ? (
                    <StoreCategoriesEditor
                      audience={catGender}
                      lists={workspace.categoryLists}
                      customCategories={workspace.customCategories}
                      garmentCounts={garmentCounts}
                      saving={saving || catalogueBusy}
                      onSave={(categoryLists) => void savePatch({ categoryLists })}
                      onAddCustom={(input) => {
                        const slug = input.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'category';
                        const id = `custom-${slug}-${Date.now().toString(36)}`;
                        const nextCustoms = [...(workspace.customCategories || []), { id, ...input }];
                        const nextLists: StoreCategoryLists = {};
                        for (const aud of AUDIENCES) {
                          const shown = categoriesFor(workspace.categoryLists, aud, workspace.customCategories || []).map((cat) => cat.id as CatalogueCategoryId);
                          nextLists[aud] = aud === input.gender ? [...shown, id] : shown;
                        }
                        void savePatch({ customCategories: nextCustoms, categoryLists: nextLists });
                      }}
                      onDeleteCustom={(id) => {
                        const nextCustoms = (workspace.customCategories || []).filter((cat) => cat.id !== id);
                        const nextLists: StoreCategoryLists = {};
                        for (const aud of AUDIENCES) {
                          nextLists[aud] = categoriesFor(workspace.categoryLists, aud, workspace.customCategories || []).map((cat) => cat.id as CatalogueCategoryId).filter((catId) => catId !== id);
                        }
                        void savePatch({ customCategories: nextCustoms, categoryLists: nextLists });
                      }}
                    />
                  ) : (
                    <StoreCategoriesEditor
                      variant="video"
                      audience={catGender}
                      lists={workspace.videoCategoryLists}
                      customCategories={workspace.customCategories}
                      garmentCounts={garmentCounts}
                      saving={saving || catalogueBusy}
                      onSave={(videoCategoryLists) => void savePatch({ videoCategoryLists })}
                    />
                  )}
                </div>
              )}

              {catPanel === 'upload' && (
                <CatalogueBulkImport
                  key={catSection}
                  kind={catSection}
                  audience={catGender}
                  workspaceCode={activeWorkspaceCode}
                  liveOn={limits.live > 0}
                  categoryLists={catSection === 'video' ? workspace.videoCategoryLists : workspace.categoryLists}
                  customCategories={workspace.customCategories}
                  westernOverrides={workspace.westernOverrides}
                  onDone={async ({ count, gender, category }) => {
                    await loadCatalogue();
                    setCatPanel(null);
                    setCatGender(gender);
                    setCatFilter(category);
                    setNotice(catSection === 'video' ? `${count} garment(s) saved to AI Video.` : catSection === 'live' ? `${count} garment(s) added to Live Try-On (and Image Try-On).` : `${count} garment(s) added to Image Try-On.`);
                  }}
                />
              )}

              {catGender && catTabs.length > 0 && (
                <div role="group" aria-label="Category" className="flex flex-wrap gap-x-1 border-b border-line">
                  {catTabs.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      aria-pressed={activeCatFilter === cat.id}
                      onClick={() => setCatFilter(cat.id)}
                      className={`-mb-px min-h-11 border-b-2 px-3 text-sm transition ${activeCatFilter === cat.id ? 'border-ink font-bold text-ink' : 'border-transparent font-medium text-muted hover:text-ink'}`}
                    >
                      {cat.label} ({cat.count})
                      {cat.hidden && <span className="ml-1 text-xs text-muted">· hidden</span>}
                    </button>
                  ))}
                </div>
              )}

              {catalogueLoading ? (
                <div className="flex items-center justify-center py-12 text-sm text-muted"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading catalogue…</div>
              ) : !catGender ? (
                <p className="py-10 text-center text-sm text-muted">Tap Women, Men, Boys or Girls to see your garments.</p>
              ) : catTabs.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">
                  {catSection === 'live' ? `No ${AUDIENCE_NAMES[catGender]} garments on Live Try-On yet. Use Upload garments, or switch some on in Image Try-On.`
                    : catSection === 'video' ? `No ${AUDIENCE_NAMES[catGender]} pieces on AI Video yet. Use Upload garments to add some.`
                      : `No ${AUDIENCE_NAMES[catGender]} garments yet. Use Upload garments to add some.`}
                </p>
              ) : (
                <>
                  {catSection === 'tryon' && limits.live > 0 && activeCatLabel && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-canvas px-4 py-3">
                      <Switch checked={categoryAllLive} disabled={catalogueBusy} label={`Live Try-On for all ${activeCatLabel}`} onChange={(on) => void setWesternWear(activeCatFilter as string, on)}>
                        Live Try-On for all {activeCatLabel}
                      </Switch>
                      <span className="text-sm text-muted">{filteredCatalogue.filter((item) => item.eligibleForLive === true).length} of {filteredCatalogue.length} on · new uploads follow this switch</span>
                    </div>
                  )}
                  <CatalogueTable
                    key={`${catSection}-${catGender}-${activeCatFilter}`}
                    kind={catSection === 'video' ? 'video' : 'tryon'}
                    rows={filteredCatalogue.slice(cataloguePage * CATALOGUE_PAGE_SIZE, (cataloguePage + 1) * CATALOGUE_PAGE_SIZE).map(rowFor)}
                    showWestern={catSection === 'tryon' && limits.live > 0}
                    removeLabel={catSection === 'video' ? 'Remove from AI Video' : catSection === 'live' ? 'Remove from Live Try-On' : 'Delete'}
                    onWestern={(sku, on) => { const item = catalogue.find((row) => row.sku === sku); if (item) void toggleCatalogueField(item, { eligibleForLive: on }); }}
                    onPrice={(sku, price) => { const item = catalogue.find((row) => row.sku === sku); if (item) void toggleCatalogueField(item, { price: Math.max(0, Number(price) || 0) }); }}
                    onRemove={removeGarments}
                    busy={catalogueBusy}
                    emptyText=""
                  />
                  {catalogueTotalPages > 1 && (
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <button type="button" disabled={cataloguePage === 0} onClick={() => setCataloguePage((page) => page - 1)} className="tf-btn tf-btn-secondary !min-h-11 px-4 text-sm">Back</button>
                      <span className="tabular-nums text-muted">Page {cataloguePage + 1} of {catalogueTotalPages} · {filteredCatalogue.length} garments</span>
                      <button type="button" disabled={cataloguePage + 1 >= catalogueTotalPages} onClick={() => setCataloguePage((page) => page + 1)} className="tf-btn tf-btn-secondary !min-h-11 px-4 text-sm">More</button>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
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

        {section === 'golive' && (goLiveOn ? (
          <div className="space-y-6">
            <section className="tf-card p-6">
              <h2 className="text-lg font-bold">Went live ({(goLiveCount ?? goLiveList.length).toLocaleString('en-IN')})</h2>
              <p className="mt-1 text-sm text-muted">Each video is kept for 1 day, then deleted. This list updates itself.</p>
              <div className="mt-4"><ClientVideoLibrary embedded onCount={setGoLiveCount} /></div>
            </section>

          </div>
        ) : (
          <section className="tf-card p-6">
            <h2 className="text-2xl font-bold">Go Live player</h2>
            <p className="mt-2 max-w-xl text-sm text-muted">Go Live plays your customers’ AI Videos on your own LED or wall screen. It is switched off for your store right now. To turn it on, call TryFocus: <a href="tel:9994837342" className="font-semibold text-ink underline underline-offset-4">9994837342</a></p>
          </section>
        ))}
      </div>
    </Shell>
  );
}
