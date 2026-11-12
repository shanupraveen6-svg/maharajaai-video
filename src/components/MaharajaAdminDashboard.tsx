'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { CREDIT_LEVEL_STATUS, creditStatuses, creditWarningText } from '@/lib/maharaja/credits';
import GoLivePromoManager from '@/components/GoLivePromoManager';
import ClientVideoLibrary from '@/components/ClientVideoLibrary';
import LockedAmountField from '@/components/LockedAmountField';
import { resolveAccess } from '@/lib/maharaja/access';
import { conceptsForCategory } from '@/lib/maharaja/video-concepts';
import type { CustomerCategory } from '@/lib/maharaja/config';
import { isLiveMirrorReady } from '@/lib/tryfocus/live-categories';
import { fetchCompleteCatalogue } from '@/lib/maharaja/catalogue-client';
import {
  ChevronDown,
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
import { allCategoriesFor, categoriesFor, isWesternCategory, AUDIENCES, type CustomCategory, type StoreCategoryLists, type WesternOverrides } from '@/lib/tryfocus/store-categories';
import CatalogueTable, { type CatalogueBulkAction, type CatalogueRowPatch, type CatalogueTableRow, type CategoryOption } from '@/components/CatalogueTable';
import { NavTabs, Segmented, StatusPill } from '@/components/ui';
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
const HISTORY_PAGE_SIZE = 50;
const CONCEPT_AUDIENCE: Record<CatalogueAudience, CustomerCategory> = { women: 'women', men: 'men', boys: 'boy', girls: 'girl' };
const AUDIENCE_NAMES: Record<CatalogueAudience, string> = { women: 'Women', men: 'Men', boys: 'Boys', girls: 'Girls' };
const AUDIENCE_POSSESSIVE: Record<CatalogueAudience, string> = { women: "Women's", men: "Men's", boys: "Boys'", girls: "Girls'" };

/** The upload day of a garment in India, as YYYY-MM-DD (sorts) and as "1 Oct 2026" (reads). */
function uploadDay(createdAt?: string): { key: string; label: string } {
  const date = createdAt ? new Date(createdAt) : null;
  if (!date || Number.isNaN(date.getTime())) return { key: '0000-00-00', label: 'Date not recorded' };
  return {
    key: date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
    label: date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }),
  };
}

function AccordionRow({ open, onToggle, title, summary, children }: { open: boolean; onToggle: () => void; title: string; summary?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="tf-card overflow-hidden">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-h-16 w-full items-center justify-between gap-4 px-6 py-3 text-left hover:bg-canvas">
        <span className="min-w-0">
          <span className="block text-lg font-bold text-ink">{title}</span>
          {summary && <span className="mt-0.5 block text-sm text-muted">{summary}</span>}
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-line px-6 py-5">{children}</div>}
    </section>
  );
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
  const [section, setSection] = useState<'overview' | 'catalogue' | 'qr' | 'golive' | 'customers' | 'settings'>('overview');
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
  // Catalogue tab: four accordion rows; the garment table filtered by Who → category (or Needs attention).
  const [catOpen, setCatOpen] = useState({ categories: false, upload: false, garments: true, history: true });
  const [catGender, setCatGender] = useState<CatalogueAudience | null>(null);
  const [catFilter, setCatFilter] = useState<string>('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [catalogueBusy, setCatalogueBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState<Set<string>>(new Set());
  const [historyShown, setHistoryShown] = useState<Record<string, number>>({});
  const [historyTicked, setHistoryTicked] = useState<string | null>(null);
  const [historyConfirm, setHistoryConfirm] = useState<string | null>(null);
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
  const westernSettings = useMemo(() => workspace?.westernOverrides || {}, [workspace?.westernOverrides]);
  const westernOf = useCallback((id: string) => isWesternCategory(id, customCats, westernSettings), [customCats, westernSettings]);

  /** Every category an audience can have (hidden ones too, so a garment in one still has a valid choice). */
  const tableCategoryOptions = useCallback((gender: CatalogueAudience): CategoryOption[] =>
    allCategoriesFor(gender, customCats).map((cat) => ({ id: cat.id as string, label: cat.label, western: westernOf(cat.id as string) })), [customCats, westernOf]);

  /** What's wrong with a garment, if anything — shown on its row and gathered under Needs attention. */
  const garmentFlags = useCallback((item: ManagedCatalogueItem): string[] => {
    const flags: string[] = [];
    const ownAudience = allCategoriesFor(item.gender, customCats).some((cat) => cat.id === item.category);
    if (!ownAudience) flags.push(`Not a ${AUDIENCE_POSSESSIVE[item.gender]} category`);
    else if (!categoriesFor(workspace?.categoryLists, item.gender, customCats).some((cat) => cat.id === item.category)) flags.push('Category hidden');
    return flags;
  }, [customCats, workspace?.categoryLists]);

  const needsAttention = useCallback((item: ManagedCatalogueItem) =>
    garmentFlags(item).length > 0 || (item.eligibleForVideo && !(item.price > 0)), [garmentFlags]);

  const toRow = useCallback((item: ManagedCatalogueItem): CatalogueTableRow => ({
    key: item.sku,
    sku: item.sku,
    image: item.thumbnailUrl || item.imageUrl,
    title: item.title,
    category: item.category,
    gender: item.gender,
    price: item.price > 0 ? String(item.price) : '',
    aiVideo: item.eligibleForVideo,
    western: item.eligibleForLive === true,
    newArrival: item.newArrival,
    trending: item.trending === true,
    active: item.active,
    flags: garmentFlags(item),
  }), [garmentFlags]);

  const garmentCounts = useMemo(() => catalogue.reduce<Record<string, number>>((counts, item) => {
    counts[item.category] = (counts[item.category] || 0) + 1;
    return counts;
  }, {}), [catalogue]);

  const attentionList = useMemo(() => catalogue.filter(needsAttention), [catalogue, needsAttention]);

  /** Tabs for the chosen audience: the categories customers see, plus any hidden one that still holds garments. */
  const catTabs = useMemo(() => {
    if (!catGender) return [];
    const shown = categoriesFor(workspace?.categoryLists, catGender, customCats);
    const hiddenWithGarments = allCategoriesFor(catGender, customCats).filter((cat) => !shown.some((item) => item.id === cat.id) && catalogue.some((item) => item.gender === catGender && item.category === cat.id));
    return [
      ...shown.map((cat) => ({ id: cat.id as string, label: cat.label, hidden: false })),
      ...hiddenWithGarments.map((cat) => ({ id: cat.id as string, label: cat.label, hidden: true })),
    ];
  }, [catGender, workspace?.categoryLists, customCats, catalogue]);
  // Opens on the first category that actually has garments, not an empty one.
  const activeCatFilter = catTabs.some((cat) => cat.id === catFilter) ? catFilter
    : (catTabs.find((cat) => catalogue.some((item) => item.gender === catGender && item.category === cat.id)) || catTabs[0])?.id;

  const filteredCatalogue = useMemo(() => {
    if (attentionOnly) return attentionList;
    if (!catGender) return [];
    return catalogue.filter((item) => item.gender === catGender && item.category === activeCatFilter);
  }, [attentionOnly, attentionList, catalogue, catGender, activeCatFilter]);
  const catalogueTotalPages = Math.max(1, Math.ceil(filteredCatalogue.length / CATALOGUE_PAGE_SIZE));

  /** One row per upload day, newest first, with what went in that day. */
  const uploadHistory = useMemo(() => {
    const days = new Map<string, { key: string; label: string; items: ManagedCatalogueItem[] }>();
    for (const item of catalogue) {
      const day = uploadDay(item.createdAt);
      if (!days.has(day.key)) days.set(day.key, { ...day, items: [] });
      days.get(day.key)!.items.push(item);
    }
    return Array.from(days.values()).sort((a, b) => b.key.localeCompare(a.key)).map((day) => {
      const parts = new Map<string, number>();
      for (const item of day.items) {
        const label = `${AUDIENCE_NAMES[item.gender]}: ${allCategoriesFor(item.gender, customCats).find((cat) => cat.id === item.category)?.label || 'Other'}`;
        parts.set(label, (parts.get(label) || 0) + 1);
      }
      return { ...day, breakdown: Array.from(parts.entries()).sort((a, b) => b[1] - a[1]).map(([label, count]) => `${label} ${count}`) };
    });
  }, [catalogue, customCats]);

  /** Garments whose Western Try-On switch disagrees with their category's Western wear setting. */
  const westernMismatches = useMemo(() => catalogue.filter((item) => (item.eligibleForLive === true) !== westernOf(item.category)).length, [catalogue, westernOf]);

  /** An edit in the garment table, saved at once. A new category brings its garment type and Western wear. */
  function changeSaved(sku: string, patch: CatalogueRowPatch) {
    const item = catalogue.find((row) => row.sku === sku);
    if (!item) return;
    if (patch.title !== undefined) void toggleCatalogueField(item, { title: patch.title });
    if (patch.price !== undefined) void toggleCatalogueField(item, { price: Math.max(0, Number(patch.price) || 0) });
    if (patch.aiVideo !== undefined) void toggleCatalogueField(item, { eligibleForVideo: patch.aiVideo });
    if (patch.western !== undefined) void toggleCatalogueField(item, { eligibleForLive: patch.western });
    if (patch.category) {
      const category = allCategoriesFor(item.gender, customCats).find((cat) => cat.id === patch.category);
      if (category) void toggleCatalogueField(item, { category: category.id, garmentType: category.garmentType, eligibleForLive: westernOf(category.id as string) });
    }
  }

  async function bulkSaved(action: CatalogueBulkAction, skus: string[], on: boolean) {
    const apiAction = action === 'new-arrival' ? (on ? 'new-arrival-on' : 'new-arrival-off')
      : action === 'trending' ? (on ? 'trending-on' : 'trending-off')
        : action;
    setCatalogueBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/maharaja/catalogue/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceCode: activeWorkspaceCode, skus, action: apiAction }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not update the garments.');
      const chosen = new Set(skus);
      if (action === 'delete') {
        setCatalogue((prev) => prev.filter((item) => !chosen.has(item.sku)));
      } else {
        const patch: Partial<ManagedCatalogueItem> = action === 'new-arrival' ? { newArrival: on, badge: on ? 'NEW ARRIVAL' : 'ROYAL SILK' }
          : action === 'trending' ? { trending: on }
            : { active: action === 'show' };
        setCatalogue((prev) => prev.map((item) => (chosen.has(item.sku) ? { ...item, ...patch } : item)));
      }
      const word = action === 'delete' ? 'deleted' : action === 'hide' ? 'hidden' : action === 'show' ? 'showing again'
        : `${on ? 'tagged' : 'untagged'} ${action === 'trending' ? 'Trending' : 'New arrival'}`;
      setNotice(`${data.count} garment(s) ${word}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the garments.');
    } finally {
      setCatalogueBusy(false);
    }
  }

  /** WW on or off for a category: its garments follow, so Western Try-On always matches the category. */
  async function setWesternWear(categoryId: string, western: boolean) {
    setCatalogueBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/maharaja/catalogue/western', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceCode: activeWorkspaceCode, categoryId, western }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not update Western wear.');
      setWorkspace((prev) => (prev ? { ...prev, westernOverrides: data.westernOverrides } : prev));
      setCatalogue((prev) => prev.map((item) => (item.category === categoryId ? { ...item, eligibleForLive: western } : item)));
      const label = allCategoriesFor(catGender || 'women', customCats).find((cat) => cat.id === categoryId)?.label
        || AUDIENCES.flatMap((aud) => allCategoriesFor(aud, customCats)).find((cat) => cat.id === categoryId)?.label || 'This category';
      setNotice(`${label} is ${western ? 'now Western wear' : 'no longer Western wear'}. ${data.changed} garment(s) switched ${western ? 'on' : 'off'} for Western Try-On.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update Western wear.');
    } finally {
      setCatalogueBusy(false);
    }
  }

  /** The one-time correction: every existing garment brought in line with its category's Western wear. */
  async function applyWesternRule() {
    setCatalogueBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/maharaja/catalogue/western', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceCode: activeWorkspaceCode, applyAll: true }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Could not apply the Western wear rule.');
      setWorkspace((prev) => (prev ? { ...prev, westernRuleAppliedAt: data.westernRuleAppliedAt } : prev));
      await loadCatalogue();
      setNotice(`Done: ${data.on} garment(s) switched on and ${data.off} switched off for Western Try-On, to match their category.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not apply the Western wear rule.');
    } finally {
      setCatalogueBusy(false);
    }
  }

  useEffect(() => setCataloguePage(0), [catGender, catFilter, attentionOnly]);

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
  // Try-On (Western Try-On) only to a store with the TV (Tablet-only stores never see those two).
  const monthTiles = ([
    ['Image Try-On', 'tryOnGenerated', limits.image > 0],
    ['AI Video', 'videosGenerated', limits.video > 0],
    ['Go Live', 'goLive', Boolean(devices.tv) && goLiveOn],
    ['Real Try-On (Western Try-On)', 'liveSessions', Boolean(devices.tv) && limits.live > 0],
    ['Wall QR scans', 'tryOnScans', limits.image > 0],
  ] as const).filter(([, , on]) => on);
  // Customers' own phones are reached through the wall QR, so they are not a screen to open here.
  const screens = [
    devices.tv && { key: 'tv', title: 'Portrait TV', href: '/maharaja/tv/experience', desc: 'Try-On, Western Try-On and AI Video from your collection', Icon: Tv },
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
  // Audiences customers cannot pick on AI Video yet (no piece switched on with a price): they see "Coming soon".
  const videoMissing = (['women', 'men', 'boys', 'girls'] as const)
    .filter((who) => !showing.some((item) => item.eligibleForVideo && item.gender === who && Number(item.price || 0) > 0))
    .map((who) => ({ women: 'Women', men: 'Men', boys: 'Boys', girls: 'Girls' })[who]);
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
      title: 'Try-On',
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
      title: 'Western Try-On',
      where: 'TV',
      note: catalogueLoading ? undefined : `${livePieces.toLocaleString('en-IN')} garments on Western Try-On`,
      ...rowStatus('Western Try-On', livePieces, 'Switch on garments'),
    },
    limits.video > 0 && {
      title: 'Go Live player',
      where: 'Your LED or wall screen',
      ...(goLiveOn
        ? (workspace.campaignEnabled ? { status: 'Working', tone: 'success' as Tone } : { status: 'Paused', tone: 'neutral' as Tone })
        : { status: 'Off', tone: 'neutral' as Tone, note: 'AI Videos are download only' }),
    },
    {
      title: 'Customers get their looks by',
      where: workspace.whatsappConnected ? 'QR and WhatsApp link' : 'QR (WhatsApp link not set up)',
      status: workspace.whatsappConnected ? 'QR + WhatsApp' : 'QR',
      tone: 'neutral' as Tone,
    },
  ].filter((row) => row !== false);

  // Your plan: one row per feature, with its status and the credits left (Go Live has no credits).
  const planRows = working
    .filter((row) => row.title !== 'Customers get their looks by')
    .map((row) => ({ ...row, credit: credits.find((item) => item.label === row.title && item.level !== 'none') }));
  const toneText: Record<Tone, string> = { success: 'text-success', warn: 'text-warn', danger: 'text-danger', neutral: 'text-muted' };

  return (
    <main className="min-h-screen bg-canvas text-ink">
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
          {limits.video > 0 && !catalogueLoading && videoMissing.length > 0 && videoMissing.length < 4 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm">
              <span className="text-ink">AI Video shows &quot;Coming soon&quot; for <b>{videoMissing.join(', ')}</b>: switch on pieces with a price for them.</span>
              <button type="button" onClick={() => { setSection('catalogue'); window.scrollTo({ top: 0 }); }} className="min-h-9 rounded-lg border border-line-strong bg-white px-3 text-[13px] font-semibold">Catalogue · AI Video</button>
            </div>
          )}
          <p className="mt-3 text-sm text-muted">Customers get their looks by {workspace.whatsappConnected ? 'QR and WhatsApp' : 'QR'}. To add credits or a platform: <a href="tel:9994837342" className="font-semibold text-ink underline underline-offset-4">9994837342</a></p>
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

          </div>
        )}

        {section === 'catalogue' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-2xl font-bold">Your catalogue</h2>
              <p className="text-sm text-muted">
                {catalogueLoading ? 'Loading…' : `${catalogue.length.toLocaleString('en-IN')} garments · ${catalogue.filter((item) => item.active).length.toLocaleString('en-IN')} showing to customers`}
                {catalogueBusy && <LoaderCircle className="ml-2 inline h-4 w-4 animate-spin" />}
              </p>
            </div>

            <AccordionRow
              open={catOpen.categories}
              onToggle={() => setCatOpen((open) => ({ ...open, categories: !open.categories }))}
              title="Categories customers see"
              summary={`Add, hide or make your own. WW marks Western wear: also on Western Try-On, and new uploads start on there.`}
            >
              <StoreCategoriesEditor
                lists={workspace.categoryLists}
                customCategories={workspace.customCategories}
                westernOverrides={workspace.westernOverrides}
                garmentCounts={garmentCounts}
                saving={saving || catalogueBusy}
                onSave={(categoryLists) => void savePatch({ categoryLists })}
                onWestern={(categoryId, western) => void setWesternWear(categoryId, western)}
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
                    nextLists[aud] = categoriesFor(workspace.categoryLists, aud, workspace.customCategories || [])
                      .map((cat) => cat.id as CatalogueCategoryId)
                      .filter((catId) => catId !== id);
                  }
                  void savePatch({ customCategories: nextCustoms, categoryLists: nextLists });
                }}
              />
            </AccordionRow>

            <AccordionRow
              open={catOpen.upload}
              onToggle={() => setCatOpen((open) => ({ ...open, upload: !open.upload }))}
              title="Upload catalogue"
              summary="Who → category → photos or a whole folder. Prices and switches right in the table."
            >
              <CatalogueBulkImport
                workspaceCode={activeWorkspaceCode}
                experiences={{ video: limits.video > 0, live: limits.live > 0 }}
                categoryLists={workspace.categoryLists}
                customCategories={workspace.customCategories}
                westernOverrides={workspace.westernOverrides}
                onPublished={async (count) => {
                  await loadCatalogue();
                  if (count > 0) {
                    const today = uploadDay(new Date().toISOString()).key;
                    setHistoryOpen((open) => new Set(open).add(today));
                    setCatOpen((open) => ({ ...open, history: true }));
                  }
                }}
              />
            </AccordionRow>

            <AccordionRow
              open={catOpen.garments}
              onToggle={() => setCatOpen((open) => ({ ...open, garments: !open.garments }))}
              title="All garments"
              summary="Pick who it's for, then a category. Edit, tag, hide or delete right in the table."
            >
              <div className="space-y-4">
                {!workspace.westernRuleAppliedAt && limits.live > 0 && westernMismatches > 0 && !catalogueLoading && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warn bg-warn-soft p-4">
                    <p className="text-sm text-ink"><b>{westernMismatches} garment(s)</b> don&apos;t match their category&apos;s Western wear setting, so Western Try-On shows the wrong pieces. Set every garment to match its category once; you can still switch any one back.</p>
                    <button type="button" disabled={catalogueBusy} onClick={() => void applyWesternRule()} className="tf-btn tf-btn-primary !min-h-11 shrink-0 px-5 text-sm">Match all to their category</button>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="max-w-md flex-1">
                    <Segmented
                      size="sm"
                      label="Who is it for?"
                      value={attentionOnly ? null : catGender}
                      onChange={(g) => { setAttentionOnly(false); setCatGender(g); setCatFilter(''); }}
                      options={AUDIENCES.map((value) => ({ value, label: AUDIENCE_NAMES[value] }))}
                    />
                  </div>
                  {attentionList.length > 0 && (
                    <button type="button" aria-pressed={attentionOnly} onClick={() => setAttentionOnly((on) => !on)} className={`min-h-11 rounded-full px-4 text-sm font-semibold ${attentionOnly ? 'bg-ink text-white' : 'border border-warn bg-warn-soft text-ink'}`}>
                      Needs attention · {attentionList.length}
                    </button>
                  )}
                </div>

                {!attentionOnly && catGender && (
                  <div role="group" aria-label="Category" className="flex flex-wrap gap-x-1 border-b border-line">
                    {catTabs.map((cat) => {
                      const count = catalogue.filter((item) => item.gender === catGender && item.category === cat.id).length;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          aria-pressed={activeCatFilter === cat.id}
                          onClick={() => setCatFilter(cat.id)}
                          className={`-mb-px min-h-11 border-b-2 px-2.5 text-sm transition ${activeCatFilter === cat.id ? 'border-ink font-bold text-ink' : 'border-transparent font-medium text-muted hover:text-ink'}`}
                        >
                          {cat.label}
                          {westernOf(cat.id) && <span className="ml-1.5 rounded-full bg-ink px-1.5 py-px text-[10px] font-bold text-white">WW</span>}
                          <span className="ml-1 text-xs font-medium tabular-nums opacity-60">{count}</span>
                          {cat.hidden && <span className="ml-1 text-xs font-medium text-muted">(hidden)</span>}
                        </button>
                      );
                    })}
                  </div>
                )}

                {attentionOnly && <p className="text-sm text-muted">Garments customers can&apos;t see properly: a category from another audience, a hidden category, or AI Video without a price. Fix them here; each leaves this list once it&apos;s right.</p>}

                {catalogueLoading ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading catalogue…</div>
                ) : !attentionOnly && !catGender ? (
                  <p className="py-10 text-center text-sm text-muted">Tap Women, Men, Boys or Girls to see your garments.</p>
                ) : (
                  <>
                    <CatalogueTable
                      rows={filteredCatalogue.slice(cataloguePage * CATALOGUE_PAGE_SIZE, (cataloguePage + 1) * CATALOGUE_PAGE_SIZE).map(toRow)}
                      mode="saved"
                      experiences={{ video: limits.video > 0, live: limits.live > 0 }}
                      categoryOptions={tableCategoryOptions}
                      onChange={changeSaved}
                      onBulk={bulkSaved}
                      busy={catalogueBusy}
                      emptyText={attentionOnly ? 'Nothing needs attention.' : 'No garments in this category yet. Open Upload catalogue to add some.'}
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

                {limits.video > 0 && catGender && !attentionOnly && (
                  <details className="rounded-2xl border border-line bg-canvas p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-ink">AI Video scenes for {AUDIENCE_NAMES[catGender]}</summary>
                    <p className="mt-2 text-sm text-muted">Every AI Video for {AUDIENCE_NAMES[catGender]} uses one of these scenes. The customer&apos;s outfit stays exactly as it is.</p>
                    <ul className="mt-3 grid gap-3 sm:grid-cols-3">
                      {conceptsForCategory(CONCEPT_AUDIENCE[catGender]).map((concept, index) => (
                        <li key={concept.id} className="rounded-2xl border border-line bg-white p-4">
                          <p className="text-xs font-semibold text-muted">Shot {index + 1}</p>
                          <p className="mt-0.5 font-bold text-ink">{concept.title}</p>
                          <p className="mt-1 text-sm text-muted">{concept.mood}</p>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </AccordionRow>

            <AccordionRow
              open={catOpen.history}
              onToggle={() => setCatOpen((open) => ({ ...open, history: !open.history }))}
              title="Upload history"
              summary={uploadHistory.length ? `${uploadHistory.length} upload day(s), newest first. Open a day to edit what went in; tick it to delete the whole day.` : 'Nothing uploaded yet.'}
            >
              <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
                {uploadHistory.map((day) => {
                  const open = historyOpen.has(day.key);
                  const ticked = historyTicked === day.key;
                  const shown = historyShown[day.key] || HISTORY_PAGE_SIZE;
                  return (
                    <li key={day.key}>
                      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={ticked}
                          onChange={() => { setHistoryConfirm(null); setHistoryTicked(ticked ? null : day.key); }}
                          aria-label={`Select the upload of ${day.label}`}
                          className="h-5 w-5 accent-ink"
                        />
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setHistoryOpen((current) => { const next = new Set(current); if (next.has(day.key)) next.delete(day.key); else next.add(day.key); return next; })}
                          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <ChevronDown className={`h-5 w-5 shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} />
                          <span className="w-28 shrink-0 font-bold text-ink">{day.label}</span>
                          <span className="shrink-0 font-semibold tabular-nums text-ink">{day.items.length} garments</span>
                          <span className="min-w-0 truncate text-sm text-muted">{day.breakdown.join(' · ')}</span>
                        </button>
                        {ticked && historyConfirm !== day.key && (
                          <button type="button" onClick={() => setHistoryConfirm(day.key)} className="min-h-10 rounded-full border border-danger px-4 text-sm font-semibold text-danger hover:bg-danger-soft">Delete this upload</button>
                        )}
                        {ticked && historyConfirm === day.key && (
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-danger">Delete all {day.items.length} for good?</span>
                            <button
                              type="button"
                              disabled={catalogueBusy}
                              onClick={() => { void bulkSaved('delete', day.items.map((item) => item.sku), false).then(() => { setHistoryTicked(null); setHistoryConfirm(null); }); }}
                              className="min-h-10 rounded-full bg-danger px-4 text-sm font-bold text-white"
                            >
                              Yes, delete
                            </button>
                            <button type="button" onClick={() => setHistoryConfirm(null)} className="min-h-10 px-2 text-sm font-semibold text-muted">Cancel</button>
                          </span>
                        )}
                      </div>
                      {open && (
                        <div className="space-y-3 border-t border-line bg-canvas p-4">
                          <CatalogueTable
                            rows={day.items.slice(0, shown).map(toRow)}
                            mode="saved"
                            experiences={{ video: limits.video > 0, live: limits.live > 0 }}
                            categoryOptions={tableCategoryOptions}
                            onChange={changeSaved}
                            onBulk={bulkSaved}
                            busy={catalogueBusy}
                          />
                          {day.items.length > shown && (
                            <button type="button" onClick={() => setHistoryShown((current) => ({ ...current, [day.key]: shown + HISTORY_PAGE_SIZE }))} className="tf-btn tf-btn-secondary !min-h-11 px-5 text-sm">
                              Show {Math.min(HISTORY_PAGE_SIZE, day.items.length - shown)} more of {day.items.length - shown}
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </AccordionRow>
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

            {limits.video > 0 && (
              <div className="tf-card mt-4 p-5">
                <h2 className="text-lg font-bold">AI Video on the TV</h2>
                <p className="mt-1 text-sm text-muted">The bill a customer needs before the TV&apos;s AI Video starts.</p>
                <div className="mt-4">
                  <LockedAmountField
                    key={`video-${videoMinimum}`}
                    id="video-min-purchase"
                    label="Minimum bill (₹)"
                    hint="0 = every bill (a free gift)"
                    value={videoMinimum}
                    lockedUntil={workspace.minimumsLockedUntil?.video}
                    disabled={saving}
                    onSave={(value) => savePatch({ videoMinPurchase: value })}
                  />
                </div>
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

            <section className="tf-card max-w-2xl p-6">
              <h2 className="text-lg font-bold">Promo videos</h2>
              <div className="mt-4"><GoLivePromoManager clientId={activeWorkspaceCode} /></div>
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
