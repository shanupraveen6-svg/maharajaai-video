'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { CREDIT_BAR_COLOURS, creditStatuses, creditWarningText } from '@/lib/maharaja/credits';
import GoLivePromoManager from '@/components/GoLivePromoManager';
import { fetchCompleteCatalogue } from '@/lib/maharaja/catalogue-client';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  LoaderCircle,
  Monitor,
  Plus,
  QrCode,
  RefreshCw,
  Smartphone,
  Sparkles,
  Tablet,
  Tv,
  Upload,
  Video,
} from 'lucide-react';
import CatalogueBulkImport from '@/components/CatalogueBulkImport';
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
    /** Permanent Go Live TV link for this workspace. */
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
      <main className="flex min-h-screen items-center justify-center bg-[#F4F5F2] text-[#161918]">
        <LoaderCircle className="h-8 w-8 animate-spin text-[#7A1428]" />
      </main>
    );
  }

  if (authRequired) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F4F5F2] px-6 text-[#161918]">
        <div className="max-w-md border border-[#D8DCD7] bg-[#FAFBF8] p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#7A1428]">
            Maharaja client area
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold">
            Sign in to manage your store
          </h1>
          <p className="mt-3 text-sm text-[#535A56]">
            Access devices, QR handoffs, catalogue publishing, campaigns and the video library from one private workspace.
          </p>
          <button
            type="button"
            onClick={() => router.push(`/login?next=/maharaja/${activeWorkspaceCode}`)}
            className="mt-6 bg-[#7A1428] px-5 py-3 text-xs font-bold uppercase tracking-[0.15em] text-[#FAF6EE]"
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
      <main className="flex min-h-screen items-center justify-center bg-[#F4F5F2] px-6 text-[#161918]">
        <div className="max-w-md border border-[#D8DCD7] bg-[#FAFBF8] p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#7A1428]">
            Invalid Link
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold">
            Workspace Not Found
          </h1>
          <p className="mt-3 text-sm text-[#535A56]">
            Check the workspace URL with your TryFocus administrator.
          </p>
        </div>
      </main>
    );
  }

  const devices = workspace.devices || { tv: true, tablet: true, mobile: true, led: true };
  const limits = workspace.limits || { image: 4000, live: 500, video: 500 };
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
    <main className="min-h-screen bg-[#F4F5F2] text-[#161918]">
      {creditAlerts.length > 0 && (
        <div role="alert" className="border-b border-[#B42318]/40 bg-[#FEF3F2] px-5 py-3 text-sm text-[#7A271A] sm:px-8">
          <div className="mx-auto max-w-7xl space-y-0.5">
            {creditAlerts.map((item) => <p key={item.label} className="font-semibold">{creditWarningText(item)}</p>)}
            <p className="text-xs">Contact TryFocus to add credits.</p>
          </div>
        </div>
      )}
      {/* Unified TryFocus Top Header — Shows ONLY Subscribed Surfaces */}
      <header className="border-b border-[#D8DCD7] bg-[#F4F5F2]/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center border border-[#161918] bg-[#161918] font-mono text-xs font-bold tracking-widest text-[#FAF6EE]">
              TF
            </span>
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7A1428]">
                TryFocus Client Workspace · {workspace.branch || 'Thanjavur'}
              </p>
              <h1 className="font-serif text-2xl font-semibold text-[#161918]">
                {workspace.clientName}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {devices.tv && (
              <Link
                href="/maharaja/tv/experience"
                target="_blank"
                rel="noopener noreferrer"
                className="border border-[#D8DCD7] bg-[#FAFBF8] px-3.5 py-2 text-xs font-semibold text-[#161918] hover:border-[#161918]"
              >
                Interactive TV Kiosk
              </Link>
            )}
            {devices.tablet && (
              <Link
                href="/maharaja/tablet/experience"
                target="_blank"
                rel="noopener noreferrer"
                className="border border-[#D8DCD7] bg-[#FAFBF8] px-3.5 py-2 text-xs font-semibold text-[#161918] hover:border-[#161918]"
              >
                Staff Tablet
              </Link>
            )}
            {devices.led && (
              <Link
                href={workspace.links.tv}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-[#D8DCD7] bg-[#FAFBF8] px-3.5 py-2 text-xs font-semibold text-[#161918] hover:border-[#161918]"
              >
                Showroom TV Wall
              </Link>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={() => savePatch({ campaignEnabled: !workspace.campaignEnabled })}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] transition ${
                workspace.campaignEnabled
                  ? 'bg-[#256B45] text-white'
                  : 'border border-[#D8DCD7] bg-white text-[#535A56]'
              }`}
            >
              {workspace.campaignEnabled ? 'Campaign Active' : 'Campaign Paused'}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-6 sm:px-8">
        {(error || notice) && (
          <div
            className={`border p-4 text-sm font-medium ${
              error
                ? 'border-[#B42318] bg-[#FEF3F2] text-[#B42318]'
                : 'border-[#256B45] bg-[#EBF5EE] text-[#256B45]'
            }`}
          >
            {error || notice}
          </div>
        )}

        {/* Subscribed Store Surfaces & Credit Usage Monitor (Task 10) */}
        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="border border-[#D8DCD7] bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D8DCD7] pb-4">
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                  Subscribed Store Surfaces
                </p>
                <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                  Active Hardware & Customer Touchpoints
                </h2>
              </div>
              <span className="border border-[#256B45] bg-[#EBF5EE] px-3 py-1 font-mono text-[11px] font-bold uppercase text-[#256B45]">
                {Object.values(devices).filter(Boolean).length} Surfaces Subscribed
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(
                [
                  [
                    'tv',
                    '43" Portrait TV Kiosk',
                    '/maharaja/tv/experience',
                    'AI Image Try-On, 60s Live Mirror & Diwali Catalogue Video',
                    Tv,
                  ],
                  [
                    'tablet',
                    'Counter Billing Tablet',
                    '/maharaja/tablet/experience',
                    'Staff-issued 1-day Purchased Garment & Giveaway passes',
                    Tablet,
                  ],
                  [
                    'mobile',
                    'Customer Mobile Continuation',
                    workspace.links.tryOn,
                    'Private Try-On scan, 1-day AI Video pass & Download',
                    Smartphone,
                  ],
                  [
                    'led',
                    'Showroom TV Wall Display',
                    workspace.links.tv,
                    'Plays customer-approved Go Live videos & showcase loop',
                    Monitor,
                  ],
                ] as const
              )
                .filter(([key]) => devices[key])
                .map(([key, title, href, desc, Icon]) => (
                  <div
                    key={key}
                    className="flex flex-col justify-between border border-[#D8DCD7] bg-[#FAFBF8] p-4"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-[#7A1428] text-white">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-serif text-base font-semibold text-[#161918]">
                          {title}
                        </p>
                        <p className="mt-1 text-xs text-[#535A56]">{desc}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-[#D8DCD7] pt-2.5 text-xs">
                      <span className="font-mono text-[10px] font-bold uppercase text-[#256B45]">
                        ● Online & Subscribed
                      </span>
                      <Link
                        href={href}
                        target="_blank"
                        className="inline-flex items-center gap-1 font-mono font-bold text-[#7A1428]"
                      >
                        Open
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Credit Usage & Store Policy Switches */}
          <div className="flex flex-col justify-between border border-[#D8DCD7] bg-[#FAFBF8] p-6">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                Plan Credits & Store Policy Controls
              </p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                Live Allowance & Rules
              </h2>

              <div className="mt-4 space-y-3">
                {credits.filter((item) => item.level !== 'none').map(({ label, used, limit, pct, level }) => (
                  <div key={label} className="border border-[#D8DCD7] bg-white p-3">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span>{label}</span>
                      <span className="font-mono text-[#535A56]">
                        {used.toLocaleString('en-IN')} / {limit.toLocaleString('en-IN')} ({pct}%)
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden bg-[#ECEEE9]">
                      <div className={`h-full ${CREDIT_BAR_COLOURS[level]}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-2 border-t border-[#D8DCD7] pt-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#535A56]">₹500 Minimum Price-Tag Gate:</span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => savePatch({ minPurchaseTryOnDisabled: !minGateDisabled })}
                  className="min-h-10 py-2 text-right font-mono font-bold text-[#7A1428] underline"
                >
                  {minGateDisabled ? 'DISABLED (Free Scan Active)' : 'ENABLED (₹500 Tag Required)'}
                </button>
              </div>
              {devices.tv && <div className="flex items-center justify-between">
                <span className="text-[#535A56]">TV Kiosk Bill Suffix:</span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    savePatch({
                      tvBillSuffixRequired: workspace?.tvBillSuffixRequired === false,
                    })
                  }
                  className="min-h-10 py-2 text-right font-mono font-bold text-[#7A1428] underline"
                >
                  {workspace?.tvBillSuffixRequired === false
                    ? 'DISABLED (Open TV Access)'
                    : 'ENABLED (Requires Last 4 Digits)'}
                </button>
              </div>}
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="video-min-purchase" className="text-[#535A56]">
                  AI Video QR from bill (₹) <span className="text-[#8A918D]">· 0 = every bill</span>
                </label>
                <input
                  key={workspace.videoMinPurchase ?? 5000}
                  id="video-min-purchase"
                  type="number"
                  min={0}
                  step={500}
                  inputMode="numeric"
                  disabled={saving}
                  defaultValue={workspace.videoMinPurchase ?? 5000}
                  onBlur={(event) => {
                    const value = Math.max(0, Math.round(Number(event.target.value) || 0));
                    if (value !== (workspace.videoMinPurchase ?? 5000)) void savePatch({ videoMinPurchase: value });
                  }}
                  className="w-28 border border-[#D8DCD7] bg-white px-2 py-1 text-right font-mono font-bold text-[#7A1428] outline-none focus:border-[#7A1428]"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#535A56]">WhatsApp Link Delivery:</span>
                <span className="font-mono font-bold text-[#161918]">
                  {whatsappConnected ? 'CONNECTED BY TRYFOCUS' : 'QR ONLY · Ask TryFocus to connect'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Metrics Row */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Total QR Scans', totalScans],
            ['AI Image Try-Ons', workspace.usage.tryOnGenerated],
            ['AI Video Passes', workspace.usage.videoPasses],
            ['AI Videos Rendered', workspace.usage.videosGenerated],
            ['Go Live Queued', workspace.usage.goLive],
            ['Downloads', workspace.usage.downloads],
          ].map(([label, value]) => (
            <div key={String(label)} className="border border-[#D8DCD7] bg-[#FAFBF8] p-4">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#535A56]">
                {label}
              </p>
              <p className="mt-2 font-serif text-3xl font-semibold text-[#161918]">{value}</p>
            </div>
          ))}
        </section>

        {/* Active Festival Selector */}
        <section className="border border-[#D8DCD7] bg-[#FAFBF8] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                Active Storefront Theme
              </p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                Festival Scene: {currentEvent.label}
              </h2>
            </div>
            <span className="border border-[#D8DCD7] bg-white px-3 py-1.5 font-mono text-xs text-[#535A56]">
              Diwali Production Ready · Other Themes Planned
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {EVENT_OPTIONS.map((ev) => {
              const selected = workspace.defaultEvent === ev.id;
              const isDiwali = ev.id === 'diwali';
              return (
                <button
                  key={ev.id}
                  type="button"
                  disabled={saving || !isDiwali}
                  onClick={() => selectDefaultEvent(ev.id)}
                  className={`border px-3 py-3 text-left transition ${
                    selected
                      ? 'border-[#7A1428] bg-[#7A1428] text-[#FAF6EE]'
                      : isDiwali
                        ? 'border-[#D8DCD7] bg-white text-[#161918] hover:border-[#161918]'
                        : 'border-[#D8DCD7] bg-white/60 text-[#535A56] opacity-55'
                  }`}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-80">
                    {selected ? 'Active' : isDiwali ? 'Select' : 'Soon'}
                  </p>
                  <p className="mt-0.5 font-serif text-base font-semibold">{ev.label}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* =========================================================
            TASK 8: RETAILER CATALOGUE MANAGEMENT (Upload Catalogue for Image Try-On & AI Video)
           ========================================================= */}
        <section className="border border-[#D8DCD7] bg-white p-6">
          <div className="border-b border-[#D8DCD7] pb-4">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
              Store Catalogue Management · Syncs Immediately With TV Standee & Counter Tablet
            </p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
              Manage & Upload Store Catalogue ({catalogue.filter((i) => i.active).length} Published / {catalogue.length} Total)
            </h2>
            <p className="mt-1 text-xs text-[#535A56]">
              Upload garments by category with instant thumbnail view. Uploads reflect live on both the 43&quot; TV Standee and the Counter Tablet.
            </p>
          </div>

          {/* Embedded 2-Button Catalogue Upload Manager */}
          <div className="mt-6">
            <CatalogueBulkImport onPublished={loadCatalogue} />
          </div>

          {/* Existing Catalogue Items Management Table */}
          <div className="mt-10 border-t border-[#D8DCD7] pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-serif text-xl font-semibold text-[#161918]">
                  Existing Store Catalogue ({filteredCatalogue.length} matching)
                </h3>
                <p className="mt-0.5 text-xs text-[#535A56]">
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
                    className={`border px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider ${
                      catGender === g
                        ? 'border-[#161918] bg-[#161918] text-white'
                        : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918] hover:bg-white'
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
                    ? 'border-[#7A1428] bg-[#7A1428] text-white'
                    : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918] hover:bg-white'
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
                        ? 'border-[#7A1428] bg-[#7A1428] text-white'
                        : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918] hover:bg-white'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
            </div>

            {/* Table */}
            {catalogueLoading ? (
              <div className="flex items-center justify-center py-10">
                <LoaderCircle className="h-6 w-6 animate-spin text-[#7A1428]" />
                <span className="ml-2 text-xs text-[#535A56]">Loading catalogue…</span>
              </div>
            ) : filteredCatalogue.length === 0 ? (
              <p className="py-8 text-center text-xs text-[#535A56]">No garments found in this category.</p>
            ) : (
              <>
                <div className="mt-4 overflow-x-auto border border-[#D8DCD7]">
                  <table className="w-full min-w-[680px] text-left text-xs">
                    <thead className="bg-[#FAFBF8] font-mono text-[11px] uppercase tracking-wider text-[#535A56]">
                      <tr>
                        <th className="p-3">SKU / Garment</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">Price</th>
                        <th className="p-3">Status & Eligibility</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCatalogue.slice(cataloguePage * 25, (cataloguePage + 1) * 25).map((item) => (
                        <tr key={item.sku} className="border-t border-[#D8DCD7] hover:bg-[#FAFBF8]">
                          <td className="p-3">
                            <span className="block font-mono font-bold text-[#161918]">{item.sku}</span>
                            <span className="text-[#535A56]">{item.title}</span>
                          </td>
                          <td className="p-3 text-[#535A56]">
                            {item.audience} · {catalogueCategories.find((cat) => cat.id === item.category)?.label || item.category}
                          </td>
                          <td className="p-3 font-semibold text-[#161918]">
                            {item.price > 0 ? formatINR(item.price) : <span className="text-[#8C938F]">No price</span>}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void toggleCatalogueField(item, { active: !item.active })}
                                className={`border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider ${
                                  item.active
                                    ? 'border-emerald-700 bg-emerald-50 text-emerald-800'
                                    : 'border-[#D8DCD7] bg-white text-[#8C938F]'
                                }`}
                              >
                                {item.active ? 'Published' : 'Hidden'}
                              </button>
                              <button
                                type="button"
                                onClick={() => void toggleCatalogueField(item, { newArrival: !item.newArrival })}
                                className={`border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider ${
                                  item.newArrival
                                    ? 'border-amber-700 bg-amber-50 text-amber-800'
                                    : 'border-[#D8DCD7] bg-white text-[#8C938F]'
                                }`}
                              >
                                {item.newArrival ? 'New arrival ✓' : 'Mark new'}
                              </button>
                              <button
                                type="button"
                                onClick={() => void toggleCatalogueField(item, { eligibleForVideo: !item.eligibleForVideo })}
                                className={`border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider ${
                                  item.eligibleForVideo
                                    ? 'border-[#7A1428] bg-[#FAF6EE] text-[#7A1428]'
                                    : 'border-[#D8DCD7] bg-white text-[#8C938F]'
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
                <div className="mt-3 flex items-center justify-between text-xs text-[#535A56]">
                  <button
                    type="button"
                    disabled={cataloguePage === 0}
                    onClick={() => setCataloguePage((v) => v - 1)}
                    className="border border-[#D8DCD7] bg-white px-3 py-1 font-mono disabled:opacity-40"
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
                    className="border border-[#D8DCD7] bg-white px-3 py-1 font-mono disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* =========================================================
            DIRECT QR CARDS:
            Image Try-On QR · Video Pass QR · Counter access
           ========================================================= */}
        <section className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          {/* Card 1: Permanent Direct QR for AI Image Try-On */}
          <div className="flex flex-col justify-between border border-[#D8DCD7] bg-white p-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D8DCD7] pb-4">
                <div>
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                    Image Try-On QR
                  </p>
                  <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                    Permanent AI Image Try-On QR
                  </h2>
                </div>
                <span className="border border-[#256B45] bg-[#EBF5EE] px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#256B45]">
                  {minGateDisabled
                    ? '₹500 Minimum: Disabled (Free Scan)'
                    : '₹500 Minimum: Enabled'}
                </span>
              </div>

              <div className="mt-4 grid gap-5 sm:grid-cols-[200px_1fr] sm:items-center">
                <div className="flex flex-col items-center border border-[#D8DCD7] bg-[#FAFBF8] p-3">
                  {tryOnQrImage ? (
                    <img
                      src={tryOnQrImage}
                      alt="Direct AI Image Try-On QR"
                      className="h-44 w-44 object-contain"
                    />
                  ) : (
                    <div className="flex h-44 w-44 items-center justify-center">
                      <QrCode className="h-10 w-10 text-[#535A56]" />
                    </div>
                  )}
                  <span className="mt-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#161918]">
                    Direct Image Scan QR
                  </span>
                </div>

                <div className="space-y-3 text-sm text-[#535A56]">
                  <p className="leading-relaxed">
                    Place this QR at a mirror or counter. Customers continue their private try-on on their own phone.
                  </p>
                  <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-3 text-xs">
                    <p className="font-semibold text-[#161918]">
                      Admin Rule:{' '}
                      {minGateDisabled
                        ? '₹500 Minimum Price-Tag Gate is Disabled'
                        : '₹500 Minimum Price-Tag Gate is Enabled'}
                    </p>
                    <p className="mt-0.5 text-[#535A56]">
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
                className="flex items-center justify-center gap-1.5 bg-[#7A1428] px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#FAF6EE]"
              >
                <Download className="h-4 w-4" />
                Download QR
              </button>
            </div>
          </div>

          {/* Card 2: Customer AI Video QR & Bill Counter */}
          <div className="flex flex-col justify-between border border-[#D8DCD7] bg-white p-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D8DCD7] pb-4">
                <div>
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                    02 · AI Video Delivery & Counter QR
                  </p>
                  <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                    Video pass QR
                  </h2>
                </div>
                <span className="border border-[#7A1428] bg-[#7A1428]/10 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A1428]">
                  {whatsappConnected
                    ? 'WhatsApp API Connected (1-Day Link)'
                    : 'Permanent Poster QR · Private 1-Day Sessions'}
                </span>
              </div>

              <div className="mt-4 grid gap-5 sm:grid-cols-[200px_1fr] sm:items-center">
                <div className="flex flex-col items-center border border-[#D8DCD7] bg-[#FAFBF8] p-3">
                  {videoQrImage ? (
                    <img
                      src={videoQrImage}
                      alt="Direct AI Video QR"
                      className="h-44 w-44 object-contain"
                    />
                  ) : (
                    <div className="flex h-44 w-44 items-center justify-center">
                      <QrCode className="h-10 w-10 text-[#535A56]" />
                    </div>
                  )}
                  <span className="mt-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#161918]">
                    Customer video QR
                  </span>
                </div>

                <div className="space-y-3 text-sm text-[#535A56]">
                  <p className="leading-relaxed">
                    This poster QR stays the same. Each scan starts a separate private session valid for 24 hours.
                  </p>
                  <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-3 text-xs">
                    <p className="font-semibold text-[#161918]">
                      Giveaway & Purchased Garment Support + Go Live
                    </p>
                    <p className="mt-0.5 text-[#535A56]">
                      Customers can take any garment (or select from the catalogue), generate their AI Video on mobile, and click{' '}
                      <strong>Download</strong> or <strong>Go Live</strong> (which plays on your Go Live TV).
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
                className="flex items-center justify-center gap-1.5 bg-[#7A1428] px-3 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#FAF6EE]"
              >
                <Download className="h-4 w-4" />
                Download Poster QR
              </button>
            </div>
          </div>
        </section>

        {/* =========================================================
            GO LIVE VIDEOS CARD (NO VIDEO PLAYER ON DASHBOARD — ONLY BUTTON TO DEDICATED PAGE)
            & TV WALL / SHOWCASE SAMPLE UPLOAD
           ========================================================= */}
        <section className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <div className="flex flex-col justify-between border border-[#D8DCD7] bg-[#FAFBF8] p-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D8DCD7] pb-4">
                <div>
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                    03 · Showroom Go Live Library
                  </p>
                  <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                    Customer Go Live Videos
                  </h2>
                </div>
                <span className="border border-[#D8DCD7] bg-white px-3 py-1 font-mono text-xs font-semibold text-[#161918]">
                  {goLiveList.length} Recorded
                </span>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-[#535A56]">
                When a customer clicks <strong>Go Live</strong> after generating an AI video, their video is queued on your Go Live TV and logged in the dedicated Go Live video library.
              </p>
              <p className="mt-2 text-xs text-[#535A56]">
                Videos are not played inline on this main workspace page — click the button below to open the dedicated video library page to list, play, and download approved Go Live videos.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={`/maharaja/${workspace.workspaceCode}/videos`}
                className="inline-flex items-center gap-2 bg-[#7A1428] px-6 py-3.5 text-xs font-bold uppercase tracking-[0.16em] text-[#FAF6EE] transition hover:bg-[#610F20]"
              >
                <Video className="h-4 w-4" />
                Explore All Videos (List & Play)
              </Link>
              {limits.video > 0 && (
                <a
                  href={workspace.links.goLive}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 border border-[#161918] bg-white px-5 py-3.5 text-xs font-bold uppercase tracking-[0.16em] text-[#161918]"
                >
                  <Tv className="h-4 w-4" />
                  Open Go Live TV
                </a>
              )}
            </div>
          </div>

          {/* Go Live TV: the workspace link, its promo videos and any older loop clips */}
          <div className="flex flex-col justify-between border border-[#D8DCD7] bg-[#FAFBF8] p-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D8DCD7] pb-4">
                <div>
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                    04 · Go Live TV
                  </p>
                  <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                    Customer videos & your promos
                  </h2>
                </div>
              </div>

              {limits.video > 0 ? (
                <div className="mt-4">
                  <GoLivePromoManager goLiveUrl={workspace.links.goLive} />
                </div>
              ) : (
                <p className="mt-4 text-sm text-[#535A56]">Go Live TV comes with AI Video. Contact TryFocus to add AI Video to your plan.</p>
              )}
              {limits.video > 0 && (
                <div className="mt-5 border-t border-[#D8DCD7] pt-4">
                  <p className="text-sm font-semibold text-[#161918]">Retail clips ({showcaseList.length})</p>
                  <p className="mt-1 text-xs text-[#535A56]">Short store clips (MP4 or MOV, up to 4 MB) that play inside the customer video loop, so the TV is never empty. Promo videos above play after every 10 customer videos.</p>
              <div className="mt-4 grid gap-2.5 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  value={sampleName}
                  onChange={(event) => setSampleName(event.target.value)}
                  placeholder="Retail clip name (optional)"
                  className="h-11 border border-[#D8DCD7] bg-white px-3 text-sm text-[#161918] outline-none focus:border-[#7A1428]"
                />
                <input
                  ref={sampleInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime"
                  className="h-11 border border-[#D8DCD7] bg-white px-3 py-2 text-xs text-[#535A56]"
                />
                <button
                  type="button"
                  disabled={uploadingSample}
                  onClick={uploadShowcaseSample}
                  className="flex h-11 items-center justify-center gap-1.5 bg-[#161918] px-4 text-xs font-bold uppercase tracking-[0.14em] text-[#FAF6EE] disabled:opacity-50"
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

            <div className="mt-5 border-t border-[#D8DCD7] pt-4 text-xs text-[#535A56]">
              <span className="min-w-0 break-all">Billing Counter Link: {workspace.links.billing}</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
