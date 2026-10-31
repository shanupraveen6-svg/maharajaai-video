'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { CREDIT_BAR_COLOURS, creditStatuses, creditWarningText } from '@/lib/maharaja/credits';
import GoLivePromoManager from '@/components/GoLivePromoManager';
import LockedAmountField from '@/components/LockedAmountField';
import { resolveAccess } from '@/lib/maharaja/access';
import { fetchCompleteCatalogue } from '@/lib/maharaja/catalogue-client';
import {
  Download,
  ExternalLink,
  LoaderCircle,
  Monitor,
  QrCode,
  Smartphone,
  Tablet,
  Tv,
  Upload,
  Video,
  Phone,
} from 'lucide-react';
import CatalogueBulkImport from '@/components/CatalogueBulkImport';
import { NavTabs, StatusPill } from '@/components/ui';
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
  garmentReferenceUrl?: string;
  fabricNote?: string;
  badge?: string;
  newArrival: boolean;
  eligibleForVideo: boolean;
  active: boolean;
  sortOrder: number;
};

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
  const [section, setSection] = useState<'overview' | 'catalogue' | 'qr' | 'golive'>('overview');
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regeneratingQr, setRegeneratingQr] = useState(false);
  const [uploadingSample, setUploadingSample] = useState(false);
  const [sampleName, setSampleName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copiedKey, setCopiedKey] = useState('');

  // Visible QR codes on the client workspace page
  const [tryOnQrImage, setTryOnQrImage] = useState<string>('');
  const [videoQrImage, setVideoQrImage] = useState<string>('');

  // Managed Catalogue state (Task 8 & Task 10)
  const [catalogue, setCatalogue] = useState<ManagedCatalogueItem[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState<boolean>(true);
  const [catGender, setCatGender] = useState<CatalogueAudience>('women');
  const [catFilter, setCatFilter] = useState<'all' | 'new-arrivals' | CatalogueCategoryId>('sarees');
  const [cataloguePage, setCataloguePage] = useState(0);
  const [showAddGarment, setShowAddGarment] = useState<boolean>(false);
  const [savingGarment, setSavingGarment] = useState<boolean>(false);

  // New Garment Form state
  const [newSku, setNewSku] = useState<string>('');
  const [newTitle, setNewTitle] = useState<string>('');
  const [newPrice, setNewPrice] = useState<string>('18500');
  const [newCategory, setNewCategory] = useState<CatalogueCategoryId>('sarees');
  const [newFabricNote, setNewFabricNote] = useState<string>('');
  const [newSortOrder, setNewSortOrder] = useState<string>('1');
  const [newModelPhoto, setNewModelPhoto] = useState<string>('');
  const [newGarmentRefPhoto, setNewGarmentRefPhoto] = useState<string>('');
  const [newIsArrival, setNewIsArrival] = useState<boolean>(true);
  const [newEligibleVideo, setNewEligibleVideo] = useState<boolean>(true);
  const [newActive, setNewActive] = useState<boolean>(true);

  const sampleInputRef = useRef<HTMLInputElement | null>(null);

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

    if (workspace.links.openVideo) {
      QRCode.toDataURL(workspace.links.openVideo, {
        width: 260,
        margin: 1,
        color: { dark: '#161918', light: '#FAFBF8' },
      })
        .then(setVideoQrImage)
        .catch(() => setVideoQrImage(''));
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

  async function copyText(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(''), 1800);
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

  async function regenerateOpenVideoQr() {
    setRegeneratingQr(true);
    setNotice('');
    setError('');
    try {
      const response = await fetch('/api/maharaja/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerateOpenVideoCode: true, workspaceCode: activeWorkspaceCode }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to generate a fresh AI Video QR.');
      }
      setWorkspace(data.workspace);
      setNotice('Fresh 1-Day AI Video QR generated.');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to generate a fresh AI Video QR.'
      );
    } finally {
      setRegeneratingQr(false);
    }
  }

  async function uploadShowcaseSample() {
    const file = sampleInputRef.current?.files?.[0];
    if (!file) {
      setError('Select an MP4 or MOV video file up to 4 MB.');
      return;
    }
    setUploadingSample(true);
    setNotice('');
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      if (sampleName.trim()) form.append('displayName', sampleName.trim());
      const response = await fetch('/api/maharaja/showcase-samples', {
        method: 'POST',
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to upload showcase video.');
      }
      if (sampleInputRef.current) sampleInputRef.current.value = '';
      setSampleName('');
      setNotice('Retail clip added to the Go Live TV loop.');
      await loadWorkspace();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to upload showcase video.');
    } finally {
      setUploadingSample(false);
    }
  }

  function handleImageFileToDataUri(file: File | undefined, onLoaded: (uri: string) => void) {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        onLoaded(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleCreateGarment(e: React.FormEvent) {
    e.preventDefault();
    if (!newSku.trim() || !newTitle.trim()) {
      setError('Enter both SKU and Garment Title to publish to the catalogue.');
      return;
    }
    setSavingGarment(true);
    setError('');
    setNotice('');
    try {
      const catMeta =
        catalogueCategories.find((c) => c.id === newCategory) || catalogueCategories[0];
      const res = await fetch('/api/maharaja/catalogue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: newSku.trim().toUpperCase(),
          title: newTitle.trim(),
          price: Math.max(0, Number(newPrice || 0)),
          category: newCategory,
          gender: catMeta.gender,
          audience: catMeta.audience,
          garmentType: catMeta.garmentType,
          fabricNote: newFabricNote.trim() || `${catMeta.label} · Maharaja Collection`,
          sortOrder: Number(newSortOrder || 1),
          imageUrl:
            newModelPhoto || '/images/catalogue-demo/kanchivaram-purple-peacock-model.png',
          garmentReferenceUrl:
            newGarmentRefPhoto ||
            newModelPhoto ||
            '/images/catalogue-demo/saree-collage-1.jpg',
          newArrival: newIsArrival,
          badge: newIsArrival ? 'NEW ARRIVAL' : 'ROYAL SILK',
          eligibleForVideo: newEligibleVideo,
          active: newActive,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Could not save garment to catalogue.');
      }
      await loadCatalogue();
      setNewSku('');
      setNewTitle('');
      setNewFabricNote('');
      setNewModelPhoto('');
      setNewGarmentRefPhoto('');
      setShowAddGarment(false);
      setNotice(`Saved ${data.product.sku} (${data.product.title}) to the live TV catalogue.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save garment.');
    } finally {
      setSavingGarment(false);
    }
  }

  async function toggleCatalogueField(
    item: ManagedCatalogueItem,
    patch: Partial<Pick<ManagedCatalogueItem, 'active' | 'newArrival' | 'eligibleForVideo'>>
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

  const filteredCatalogue = useMemo(() => {
    const byGender = catalogue.filter((item) => item.gender === catGender);
    if (catFilter === 'all') return byGender;
    if (catFilter === 'new-arrivals') {
      return byGender.filter((item) => item.newArrival || item.badge === 'NEW ARRIVAL');
    }
    return byGender.filter((item) => item.category === catFilter);
  }, [catalogue, catGender, catFilter]);

  useEffect(() => setCataloguePage(0), [catGender, catFilter]);

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
  const totalScans = (workspace.usage.tryOnScans || 0) + (workspace.usage.videoPasses || 0);
  const currentEvent =
    EVENT_OPTIONS.find((item) => item.id === workspace.defaultEvent) || EVENT_OPTIONS[0];
  // WhatsApp is connected per client by TryFocus admin; the client workspace only shows its status.
  const whatsappConnected = workspace.whatsappEnabled === true;
  const goLiveList = Array.isArray(workspace.goLiveAudit) ? workspace.goLiveAudit : [];
  const showcaseList = Array.isArray(workspace.showcaseSamples) ? workspace.showcaseSamples : [];
  const credits = creditStatuses(workspace.usage, limits);
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
            options={[{ value: 'overview', label: 'Overview' }, { value: 'catalogue', label: 'Catalogue' }, { value: 'qr', label: 'QR codes' }, { value: 'golive', label: 'Go Live & videos' }]}
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
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['QR scans', totalScans],
            ['Try-On looks', workspace.usage.tryOnGenerated],
            ['Video passes', workspace.usage.videoPasses],
            ['Videos made', workspace.usage.videosGenerated],
            ['Go Live plays', workspace.usage.goLive],
            ['Downloads', workspace.usage.downloads],
          ].map(([label, value]) => (
            <div key={String(label)} className="tf-card p-4">
              <p className="text-[13px] font-medium text-muted">{label}</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{Number(value || 0).toLocaleString('en-IN')}</p>
            </div>
          ))}
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
            <p className="mt-1 text-sm text-muted">Open a screen on the device it runs on.</p>
            <ul className="mt-4 divide-y divide-line">
              {(
                [
                  ['tv', 'Portrait TV', '/maharaja/tv/experience', 'Try-On, Live Mirror and AI Video', Tv],
                  ['tablet', 'Counter tablet', '/maharaja/tablet/experience', 'Try-On for staff and AI Video QRs', Tablet],
                  ['mobile', 'Customer phone', workspace.links.tryOn, 'Try-On from the permanent QR', Smartphone],
                  ['led', 'Go Live player', workspace.links.tv, 'Plays customer videos on any screen', Monitor],
                ] as const
              )
                .filter(([key]) => devices[key])
                .map(([key, title, href, desc, Icon]) => (
                  <li key={key} className="flex items-center gap-3 py-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><Icon className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{title}</span>
                      <span className="block truncate text-sm text-muted">{desc}</span>
                    </span>
                    <Link href={href} target="_blank" rel="noopener noreferrer" className="tf-btn tf-btn-secondary !min-h-10 shrink-0 px-3 text-sm">
                      Open <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        </section>

        <section className="tf-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Festival theme</h2>
              <p className="mt-1 text-sm text-muted">Sets the scene for AI videos. Now showing: <b className="text-ink">{currentEvent.label}</b></p>
            </div>
          </div>
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
        </>}

        {section === 'qr' && (
          <section className="tf-card p-6">
            <h2 className="text-lg font-bold">QR rules</h2>
            <p className="mt-1 text-sm text-muted">Who gets a QR at the counter. You can change a minimum once it unlocks.</p>
            <div className="mt-4 space-y-3 text-sm">
              {limits.image > 0 && (
                <LockedAmountField
                  key={`tryon-${minGateDisabled ? 0 : workspace.tryOnMinPurchase ?? 500}`}
                  id="tryon-min-purchase"
                  label="Phone Try-On needs a price tag from (₹)"
                  hint="0 = no tag scan"
                  value={minGateDisabled ? 0 : workspace.tryOnMinPurchase ?? 500}
                  lockedUntil={workspace.minimumsLockedUntil?.tryOn}
                  disabled={saving}
                  onSave={(value) => savePatch({ tryOnMinPurchase: value })}
                />
              )}
              {limits.video > 0 && (
                <LockedAmountField
                  key={`video-${workspace.videoMinPurchase ?? 5000}`}
                  id="video-min-purchase"
                  label="AI Video QR for bills from (₹)"
                  hint="0 = every bill"
                  value={workspace.videoMinPurchase ?? 5000}
                  lockedUntil={workspace.minimumsLockedUntil?.video}
                  disabled={saving}
                  onSave={(value) => savePatch({ videoMinPurchase: value })}
                />
              )}
              {devices.tv && limits.video > 0 && <p className="text-muted">With a minimum set, the TV asks for the bill’s last 4 digits and a fresh photo.</p>}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <span className="text-muted">Send links on WhatsApp</span>
                {whatsappConnected
                  ? <StatusPill tone="success">Connected</StatusPill>
                  : <a href="tel:9994837342" className="inline-flex items-center gap-1.5 font-semibold text-brand underline underline-offset-4"><Phone className="h-4 w-4" /> Ask TryFocus: 9994837342</a>}
              </div>
            </div>
          </section>
        )}

        {section === 'catalogue' && <>
        {/* =========================================================
            TASK 8: RETAILER CATALOGUE MANAGEMENT (Upload Catalogue for Image Try-On & AI Video)
           ========================================================= */}
        <section className="rounded-2xl border border-line bg-white p-6">
          <div className="border-b border-line pb-4">
            <h2 className="mt-1 text-2xl font-bold text-ink">
              Store catalogue · {catalogue.filter((i) => i.active).length} of {catalogue.length} live
            </h2>
            <p className="mt-1 text-xs text-muted">
              Upload garments by category with instant thumbnail view. Uploads reflect live on both the 43&quot; TV Standee and the Counter Tablet.
            </p>
          </div>

          {/* Embedded 2-Button Catalogue Upload Manager */}
          <div className="mt-6">
            <CatalogueBulkImport onPublished={loadCatalogue} />
          </div>

          {/* Existing Catalogue Items Management Table */}
          <div className="mt-10 border-t border-line pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-ink">
                  Your garments ({filteredCatalogue.length})
                </h3>
                <p className="mt-0.5 text-xs text-muted">
                  Toggle active status, new arrival badges, or AI video eligibility for showroom kiosks.
                </p>
              </div>

              {/* Gender selector */}
              <div className="flex flex-wrap gap-1.5">
                {(['women', 'men', 'boys', 'girls'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      setCatGender(g);
                      setCatFilter(g === 'women' ? 'sarees' : g === 'men' ? 'veshti' : g === 'boys' ? 'boys-veshti' : 'girls-pavadai');
                    }}
                    className={`border px-3 py-1.5 text-xs font-bold ${
 catGender === g
 ? 'border-ink bg-ink text-white'
 : 'border-line bg-canvas text-ink hover:bg-white'
 }`}
                  >
                    {g === 'women' ? 'Women' : g === 'men' ? 'Men' : g === 'boys' ? 'Boys' : 'Girls'}
                  </button>
                ))}
              </div>
            </div>

            {/* Category tabs */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCatFilter('new-arrivals')}
                className={`border px-3 py-1 text-xs font-semibold ${
 catFilter === 'new-arrivals'
 ? 'border-brand bg-brand text-white'
 : 'border-line bg-canvas text-ink hover:bg-white'
 }`}
              >
                New Arrivals
              </button>
              {catalogueCategories
                .filter((c) => c.gender === catGender)
                .map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCatFilter(cat.id)}
                    className={`border px-3 py-1 text-xs font-semibold ${
 catFilter === cat.id
 ? 'border-brand bg-brand text-white'
 : 'border-line bg-canvas text-ink hover:bg-white'
 }`}
                  >
                    {cat.label}
                  </button>
                ))}
            </div>

            {/* Table */}
            {catalogueLoading ? (
              <div className="flex items-center justify-center py-10">
                <LoaderCircle className="h-6 w-6 animate-spin text-brand" />
                <span className="ml-2 text-xs text-muted">Loading catalogue…</span>
              </div>
            ) : filteredCatalogue.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted">No garments found in this category.</p>
            ) : (
              <>
                <div className="mt-4 overflow-x-auto border border-line">
                  <table className="w-full min-w-[680px] text-left text-xs">
                    <thead className="bg-canvas text-xs text-muted">
                      <tr>
                        <th className="p-3">SKU / Garment</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">Price</th>
                        <th className="p-3">Status & Eligibility</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCatalogue.slice(cataloguePage * 25, (cataloguePage + 1) * 25).map((item) => (
                        <tr key={item.sku} className="border-t border-line hover:bg-canvas">
                          <td className="p-3">
                            <span className="block tabular-nums font-bold text-ink">{item.sku}</span>
                            <span className="text-[#535A56]">{item.title}</span>
                          </td>
                          <td className="p-3 text-muted">
                            {item.audience} · {catalogueCategories.find((cat) => cat.id === item.category)?.label || item.category}
                          </td>
                          <td className="p-3 font-semibold text-ink">
                            {item.price > 0 ? formatINR(item.price) : <span className="text-[#8C938F]">No price</span>}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void toggleCatalogueField(item, { active: !item.active })}
                                className={`border px-2 py-1 text-xs font-bold ${
 item.active
 ? 'border-emerald-700 bg-emerald-50 text-emerald-800'
 : 'border-line bg-white text-subtle'
 }`}
                              >
                                {item.active ? 'Published' : 'Hidden'}
                              </button>
                              <button
                                type="button"
                                onClick={() => void toggleCatalogueField(item, { newArrival: !item.newArrival })}
                                className={`border px-2 py-1 text-xs font-bold ${
 item.newArrival
 ? 'border-amber-700 bg-amber-50 text-amber-800'
 : 'border-line bg-white text-subtle'
 }`}
                              >
                                {item.newArrival ? 'New arrival ✓' : 'Mark new'}
                              </button>
                              <button
                                type="button"
                                onClick={() => void toggleCatalogueField(item, { eligibleForVideo: !item.eligibleForVideo })}
                                className={`border px-2 py-1 text-xs font-bold ${
 item.eligibleForVideo
 ? 'border-brand bg-[#FAF6EE] text-brand'
 : 'border-line bg-white text-subtle'
 }`}
                              >
                                {item.eligibleForVideo ? 'Video ✓' : 'Video off'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="mt-3 flex items-center justify-between text-xs text-muted">
                  <button
                    type="button"
                    disabled={cataloguePage === 0}
                    onClick={() => setCataloguePage((v) => v - 1)}
                    className="border border-line bg-white px-3 py-1 tabular-nums disabled:opacity-40"
                  >
                    ← Previous
                  </button>
                  <span>
                    {filteredCatalogue.length} garments · Page {cataloguePage + 1} of {Math.max(1, Math.ceil(filteredCatalogue.length / 25))}
                  </span>
                  <button
                    type="button"
                    disabled={(cataloguePage + 1) * 25 >= filteredCatalogue.length}
                    onClick={() => setCataloguePage((v) => v + 1)}
                    className="border border-line bg-white px-3 py-1 tabular-nums disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        </>}

        {section === 'qr' && <>
        {/* =========================================================
            DIRECT QR CARDS:
            Image Try-On QR · Video Pass QR · Counter access
           ========================================================= */}
        <section className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          {/* Card 1: Permanent Direct QR for Try-On */}
          {limits.image > 0 && <div className="rounded-2xl flex flex-col justify-between border border-line bg-white p-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
                <div>
                  <h2 className="mt-1 text-2xl font-bold text-ink">
                    Permanent Try-On QR
                  </h2>
                </div>
                <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success">
                  {minGateDisabled
                    ? 'Open to everyone'
                    : 'Needs a price tag scan'}
                </span>
              </div>

              <div className="mt-4 grid gap-5 sm:grid-cols-[200px_1fr] sm:items-center">
                <div className="rounded-2xl flex flex-col items-center border border-line bg-canvas p-3">
                  {tryOnQrImage ? (
                    <img
                      src={tryOnQrImage}
                      alt="Direct Try-On QR"
                      className="h-44 w-44 object-contain"
                    />
                  ) : (
                    <div className="flex h-44 w-44 items-center justify-center">
                      <QrCode className="h-10 w-10 text-muted" />
                    </div>
                  )}
                  <span className="mt-1.5 text-xs font-semibold text-ink">
                    Direct Image Scan QR
                  </span>
                </div>

                <div className="space-y-3 text-sm text-muted">
                  <p className="leading-relaxed">
                    Place this QR at a mirror or counter. Customers continue their private try-on on their own phone.
                  </p>
                  <div className="rounded-2xl border border-line bg-canvas p-3 text-xs">
                    <p className="font-semibold text-ink">
                      Admin Rule:{' '}
                      {minGateDisabled
                        ? '₹500 Minimum Price-Tag Gate is Disabled'
                        : '₹500 Minimum Price-Tag Gate is Enabled'}
                    </p>
                    <p className="mt-0.5 text-muted">
                      {minGateDisabled
                        ? 'Customers go straight to photo upload without needing to scan a ₹500 barcode tag first.'
                        : 'Customers scan a ₹500+ Maharaja price tag before generating their try-on.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <button
                type="button"
                onClick={() =>
                  downloadBrandedQr(
                    'Maharaja-AI-Image-TryOn-QR.png',
                    'AI IMAGE TRY-ON',
                    'Scan to try any garment on your photo',
                    workspace.links.tryOn
                  )
                }
                className="flex items-center justify-center gap-1.5 bg-brand px-3 py-3 text-xs font-semibold text-[#FAF6EE]"
              >
                <Download className="h-4 w-4" />
                Download QR
              </button>
            </div>
          </div>}

          {/* Card 2: Customer AI Video QR & Bill Counter */}
          {limits.video > 0 && <div className="rounded-2xl flex flex-col justify-between border border-line bg-white p-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
                <div>
                  <h2 className="mt-1 text-2xl font-bold text-ink">
                    Video pass QR
                  </h2>
                </div>
                <span className="border border-brand bg-brand/10 px-3 py-1 text-xs font-bold text-brand">
                  {whatsappConnected
                    ? 'WhatsApp API Connected (1-Day Link)'
                    : 'Permanent poster · 24-hour sessions'}
                </span>
              </div>

              <div className="mt-4 grid gap-5 sm:grid-cols-[200px_1fr] sm:items-center">
                <div className="rounded-2xl flex flex-col items-center border border-line bg-canvas p-3">
                  {videoQrImage ? (
                    <img
                      src={videoQrImage}
                      alt="Direct AI Video QR"
                      className="h-44 w-44 object-contain"
                    />
                  ) : (
                    <div className="flex h-44 w-44 items-center justify-center">
                      <QrCode className="h-10 w-10 text-muted" />
                    </div>
                  )}
                  <span className="mt-1.5 text-xs font-semibold text-ink">
                    Customer video QR
                  </span>
                </div>

                <div className="space-y-3 text-sm text-muted">
                  <p className="leading-relaxed">
                    This poster QR stays the same. Each scan starts a separate private session valid for 24 hours.
                  </p>
                  <div className="rounded-2xl border border-line bg-canvas p-3 text-xs">
                    <p className="font-semibold text-ink">
                      Giveaway & Purchased Garment Support + Go Live
                    </p>
                    <p className="mt-0.5 text-muted">
                      Customers can take any garment (or select from the catalogue), generate their AI Video on mobile, and click{' '}
                      <strong>Download</strong> or <strong>Go Live</strong> (which plays on your Go Live player).
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <button
                type="button"
                onClick={() =>
                  downloadBrandedQr(
                    'Maharaja-AI-Video-Poster-QR.png',
                    'AI VIDEO POSTER QR',
                    'Scan to create your festive AI video & Go Live',
                    workspace.links.openVideo
                  )
                }
                className="flex items-center justify-center gap-1.5 bg-brand px-3 py-3 text-xs font-semibold text-[#FAF6EE]"
              >
                <Download className="h-4 w-4" />
                Download Poster QR
              </button>
            </div>
            {(workspace.videoMinPurchase ?? 5000) > 0 && (
              <p className="mt-3 border border-warn/40 bg-[#FFF8EB] p-3 text-xs text-warn">
                The poster QR is off while an AI Video minimum bill is set. Billers use <strong>Next customer</strong> on the counter
                (tablet or mobile) to show each qualifying customer a fresh QR. Set the minimum to ₹0 to use the poster.
              </p>
            )}
          </div>}
        </section>

        </>}

        {section === 'golive' && <>
        {/* =========================================================
            GO LIVE VIDEOS CARD (NO VIDEO PLAYER ON DASHBOARD — ONLY BUTTON TO DEDICATED PAGE)
            & TV WALL / SHOWCASE SAMPLE UPLOAD
           ========================================================= */}
        <section className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <div className="tf-card flex flex-col gap-6 self-start p-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
                <div>
                  <h2 className="mt-1 text-2xl font-bold text-ink">
                    Customer videos
                  </h2>
                </div>
                <span className="border border-line bg-white px-3 py-1 tabular-nums text-xs font-semibold text-ink">
                  {goLiveList.length} Recorded
                </span>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-muted">
                When a customer clicks <strong>Go Live</strong> after generating an AI video, their video is queued on your Go Live player and logged in the dedicated Go Live video library.
              </p>
              <p className="mt-2 text-xs text-muted">
                Videos are not played inline on this main workspace page — click the button below to open the dedicated video library page to list, play, and download approved Go Live videos.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={`/maharaja/${workspace.workspaceCode}/videos`}
                className="rounded-xl inline-flex items-center gap-2 bg-brand px-6 py-3.5 text-xs font-bold text-[#FAF6EE] transition hover:bg-[#610F20]"
              >
                <Video className="h-4 w-4" />
                See all videos
              </Link>
              {limits.video > 0 && (
                <a
                  href={workspace.links.goLive}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl inline-flex items-center gap-2 border border-ink bg-white px-5 py-3.5 text-xs font-bold text-ink"
                >
                  <Tv className="h-4 w-4" />
                  Open Go Live player
                </a>
              )}
            </div>
          </div>

          {/* Go Live TV: the workspace link, its promo videos and any older loop clips */}
          <div className="rounded-2xl flex flex-col justify-between border border-line bg-canvas p-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
                <div>
                  <h2 className="mt-1 text-2xl font-bold text-ink">
                    Go Live player, promos & Instagram
                  </h2>
                </div>
              </div>

              {limits.video > 0 ? (
                <div className="mt-4 space-y-5">
                  <form
                    className="rounded-2xl border border-line bg-white p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const value = new FormData(event.currentTarget).get('instagram');
                      void savePatch({ instagramUrl: typeof value === 'string' ? value : '' });
                    }}
                  >
                    <label htmlFor="store-instagram" className="text-xs font-bold text-muted">Your Instagram</label>
                    <p className="mt-1 text-xs text-muted">After their AI video, customers see &ldquo;Follow {workspace.clientName} on Instagram&rdquo;.</p>
                    <div className="mt-2 flex gap-2">
                      <input
                        id="store-instagram"
                        name="instagram"
                        key={workspace.instagramUrl || ''}
                        defaultValue={workspace.instagramUrl || ''}
                        placeholder="@yourstore or instagram.com/yourstore"
                        className="rounded-xl min-h-11 min-w-0 flex-1 border border-line px-3 text-sm outline-none focus:border-brand"
                      />
                      <button type="submit" disabled={saving} className="rounded-xl min-h-11 bg-ink px-4 text-xs font-bold text-white disabled:opacity-50">Save</button>
                    </div>
                  </form>
                  <GoLivePromoManager goLiveUrl={workspace.links.goLive} />
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted">Go Live TV comes with AI Video. To add it, contact TryFocus: <a href="tel:9994837342" className="font-bold text-brand underline underline-offset-4">9994837342</a></p>
              )}
              {limits.video > 0 && (
                <div className="mt-5 border-t border-line pt-4">
                  <p className="text-sm font-semibold text-ink">Retail clips ({showcaseList.length})</p>
                  <p className="mt-1 text-xs text-muted">Short store clips (MP4 or MOV, up to 4 MB) that play inside the customer video loop, so the TV is never empty. Promo videos above play after every 10 customer videos.</p>
              <div className="mt-4 grid gap-2.5 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  value={sampleName}
                  onChange={(event) => setSampleName(event.target.value)}
                  placeholder="Retail clip name (optional)"
                  className="h-11 border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand"
                />
                <input
                  ref={sampleInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime"
                  className="rounded-xl h-11 border border-line bg-white px-3 py-2 text-xs text-muted"
                />
                <button
                  type="button"
                  disabled={uploadingSample}
                  onClick={uploadShowcaseSample}
                  className="rounded-xl flex h-11 items-center justify-center gap-1.5 bg-ink px-4 text-xs font-bold text-[#FAF6EE] disabled:opacity-50"
                >
                  {uploadingSample ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload
                </button>
              </div>
                </div>
              )}
            </div>

            <div className="mt-5 border-t border-line pt-4 text-xs text-muted">
              <span className="min-w-0 break-all">Billing Counter Link: {workspace.links.billing}</span>
            </div>
          </div>
        </section>
        </>}
      </div>
    </main>
  );
}
