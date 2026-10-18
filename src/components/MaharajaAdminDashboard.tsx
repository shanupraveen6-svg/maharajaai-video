'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Film,
  LoaderCircle,
  Power,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  CalendarRange,
  Trash2,
  LogOut,
  BarChart3,
  IndianRupee,
  Users,
  MessageCircle,
  Phone,
  Play,
  Tv,
  X,
} from 'lucide-react';
import { createTryOnPosterDataUrl, downloadDataUrl } from '@/lib/maharaja/qr-poster';
import { EVENT_OPTIONS, getEventOption, type EventId } from '@/lib/maharaja/config';

export type GoLiveAuditItem = {
  id: string;
  createdAt: string;
  customerName: string;
  phone: string;
  phoneMasked: string;
  videoUrl: string;
  sessionId: string;
  queueNumber: number;
};

type StoredVideoItem = {
  videoId: string;
  sessionId?: string | null;
  storagePath: string;
  customerName: string;
  customerLocality: string;
  createdAt?: string | null;
  durationSeconds: number;
  format: string;
};

export type Workspace = {
  clientName: string;
  workspaceCode: string;
  campaignEnabled: boolean;
  activeEvents: EventId[];
  defaultEvent: EventId;
  tryOnUrl: string;
  billingUrl: string;
  usage: {
    tryOnScans: number;
    tryOnGenerated: number;
    videoPasses: number;
    videosGenerated: number;
    goLive: number;
    retries: number;
    downloads: number;
  };
  activity: Array<{ id: string; type: string; label: string; createdAt: string; metadata?: Record<string, any> }>;
  goLiveAudit?: GoLiveAuditItem[];
  integrations: { whatsapp: { configured: boolean; missing: string[]; templateName: string } };
  analytics: {
    totalGmv: number;
    totalGarments: number;
    tryOnsCount?: number;
    shoppersAbove5000?: number;
    imagesSuccess?: number;
    imageRetries?: number;
    videosSuccess?: number;
    videoRetries?: number;
    tier5kPlus?: number;
    tier7kPlus?: number;
    tier10kPlus?: number;
    tiers?: {
      tier5kTo7k: number;
      tier7kTo10k: number;
      tier10kPlus: number;
      total: number;
    };
    brandedReach: number;
    luxuryCount: number;
    festiveCount: number;
    luxuryThreshold?: number;
    festiveThreshold?: number;
    days: Array<{ date: string; scans: number; tryOns: number; gmv: number; averagePrice: number; downloads: number; conversion: number }>;
    weeks?: Array<{ week: string; scans: number; tryOns: number; gmv: number; conversion: number }>;
  };
};

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'Request failed.');
  return data;
}

export default function MaharajaAdminDashboard({ expectedWorkspaceCode }: { expectedWorkspaceCode?: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [posterDataUrl, setPosterDataUrl] = useState('');
  const [posterVisible, setPosterVisible] = useState(false);
  const [posterBuilding, setPosterBuilding] = useState(false);
  const [billingCopied, setBillingCopied] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<{ url: string; customerName: string; phoneMasked: string; sessionId?: string } | null>(null);
  const [storedVideos, setStoredVideos] = useState<StoredVideoItem[]>([]);
  const [storedVideosLoading, setStoredVideosLoading] = useState(true);
  const [openingStoragePath, setOpeningStoragePath] = useState('');
  const [logViewMode, setLogViewMode] = useState<'daily' | 'weekly'>('daily');

  async function loadWorkspace() {
    setLoading(true);
    try {
      const data = await readJson(await fetch('/api/maharaja/workspace', { cache: 'no-store' }));
      setWorkspace(data.workspace);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load Maharaja workspace.');
    } finally {
      setLoading(false);
    }
  }

  async function loadStoredVideos() {
    setStoredVideosLoading(true);
    try {
      const items: StoredVideoItem[] = [];
      let offset = 0;
      do {
        const data = await readJson(await fetch(`/api/live/replays?limit=200&offset=${offset}`, { cache: 'no-store' }));
        if (Array.isArray(data.items)) items.push(...data.items);
        offset = typeof data.nextOffset === 'number' ? data.nextOffset : -1;
      } while (offset >= 0);
      setStoredVideos(items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load stored videos.');
    } finally {
      setStoredVideosLoading(false);
    }
  }

  async function playStoredVideo(item: StoredVideoItem) {
    setOpeningStoragePath(item.storagePath);
    setMessage('');
    try {
      const data = await readJson(await fetch('/api/live/replays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: item.storagePath }),
      }));
      setPlayingVideo({
        url: data.videoUrl,
        customerName: item.customerName,
        phoneMasked: `${item.durationSeconds}s ${item.format.toUpperCase()}`,
        sessionId: item.sessionId || undefined,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to play stored video.');
    } finally {
      setOpeningStoragePath('');
    }
  }

  useEffect(() => {
    let active = true;
    fetch('/api/maharaja/workspace', { cache: 'no-store' })
      .then(readJson)
      .then((data) => {
        if (!active) return;
        setWorkspace(data.workspace);
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : 'Unable to load Maharaja workspace.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const storedVideosTimer = window.setTimeout(() => void loadStoredVideos(), 0);
    return () => {
      active = false;
      window.clearTimeout(storedVideosTimer);
    };
  }, []);

  async function ensurePoster(): Promise<string> {
    if (posterDataUrl) return posterDataUrl;
    if (!workspace?.tryOnUrl) return '';
    setPosterBuilding(true);
    try {
      const url = await createTryOnPosterDataUrl(workspace.tryOnUrl);
      setPosterDataUrl(url);
      return url;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to build Try-On poster.');
      return '';
    } finally {
      setPosterBuilding(false);
    }
  }

  const formatMoney = (value: number) => `Rs ${new Intl.NumberFormat('en-IN').format(value || 0)}`;

  async function toggleCampaign() {
    if (!workspace) return;
    setSaving(true);
    setMessage('');
    try {
      const data = await readJson(await fetch('/api/maharaja/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignEnabled: !workspace.campaignEnabled }),
      }));
      setWorkspace((current) => current ? { ...current, campaignEnabled: data.workspace.campaignEnabled } : current);
      setMessage(`Campaign turned ${data.workspace.campaignEnabled ? 'on' : 'off'}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update campaign.');
    } finally {
      setSaving(false);
    }
  }

  async function selectActiveEvent(eventId: EventId) {
    if (!workspace) return;
    setSaving(true);
    setMessage('');
    try {
      const data = await readJson(await fetch('/api/maharaja/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeEvents: [eventId], defaultEvent: eventId }),
      }));
      setWorkspace((current) => current ? { ...current, activeEvents: [eventId], defaultEvent: eventId } : current);
      setMessage(`${getEventOption(eventId).label} set as active festival theme.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save active festival theme.');
    } finally {
      setSaving(false);
    }
  }

  async function downloadPoster() {
    const url = await ensurePoster();
    if (!url) return;
    downloadDataUrl(url, 'maharaja-ai-try-on-rs-500.png');
    await fetch('/api/maharaja/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'qr-download', label: 'Permanent AI Try-On wall QR downloaded' }),
    });
  }

  async function resetLiveQueue() {
    if (!window.confirm('Reset TV broadcast queue? Stale queue entries will be cleared so the TV screen loops through ready videos.')) return;
    setSaving(true);
    try {
      const data = await readJson(await fetch('/api/live/reset-queue', { method: 'POST' }));
      setMessage(data.message || 'TV queue reset successfully.');
      await loadWorkspace();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to reset TV queue.');
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    setSaving(true);
    try {
      await fetch('/api/operator/logout', { method: 'POST' });
    } finally {
      window.location.assign('/login?store=maharaja');
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F5F2EA] text-[#6E0D1F]">
        <LoaderCircle className="h-8 w-8 animate-spin" />
      </main>
    );
  }

  if (!workspace) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#F5F2EA] p-6 text-center">
        <p className="font-bold text-red-800">{message || 'Maharaja workspace not found.'}</p>
        <Link
          href="/login?store=maharaja"
          className="mt-4 px-4 py-2 bg-[#6E0D1F] text-[#F3E5AB] text-xs font-bold uppercase rounded-lg"
        >
          Go to Operator Login
        </Link>
      </main>
    );
  }

  const analytics = workspace.analytics;
  const totalGmv = analytics.totalGmv ?? 0;
  const totalGarments = analytics.totalGarments ?? 0;

  const imagesSuccess = analytics.imagesSuccess ?? workspace.usage.tryOnGenerated ?? 0;
  const imageRetries = analytics.imageRetries ?? 0;

  const videosSuccess = analytics.videosSuccess ?? workspace.usage.videosGenerated ?? 0;
  const videoRetries = analytics.videoRetries ?? 0;

  const tier5kPlus = analytics.tier5kPlus ?? analytics.shoppersAbove5000 ?? workspace.usage.videoPasses ?? 0;
  const tier7kPlus = analytics.tier7kPlus ?? 0;
  const tier10kPlus = analytics.tier10kPlus ?? 0;

  // Compile Go Live Audit list
  const goLiveAuditList: GoLiveAuditItem[] = (workspace.goLiveAudit?.length
    ? workspace.goLiveAudit
    : workspace.activity
        .filter((item) => item.type === 'go-live')
        .map((item) => ({
          id: item.id,
          createdAt: item.createdAt,
          customerName: String(item.metadata?.customerName || 'Maharaja Customer'),
          phone: String(item.metadata?.phone || ''),
          phoneMasked: String(item.metadata?.phoneMasked || (item.metadata?.phone ? `${String(item.metadata.phone).slice(0, 2)}******${String(item.metadata.phone).slice(-2)}` : 'Customer')),
          videoUrl: String(item.metadata?.videoUrl || ''),
          sessionId: String(item.metadata?.sessionId || ''),
          queueNumber: Number(item.metadata?.queueNumber || 1),
        }))
  ).filter((item) => typeof item.videoUrl === 'string' && item.videoUrl.trim().length > 10);

  const activeEventId = workspace.activeEvents?.[0] || workspace.defaultEvent || 'diwali';

  return (
    <main className="min-h-screen bg-[#F7F4EE] text-[#211A17] pb-16 font-sans">
      {/* HEADER */}
      <header className="border-b border-[#D4AF37]/35 bg-[#1C060B] text-white sticky top-0 z-20 shadow-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-3.5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#D4AF37]" />
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#D4AF37]">STORE OPERATIONS MANAGEMENT</p>
              <span className="text-[#D4AF37]/40">·</span>
              <a
                href="https://wefocus.in"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#D4AF37] hover:text-white transition"
              >
                <span>wefocus.in</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <h1 className="mt-0.5 font-serif text-2xl md:text-3xl font-bold text-[#F3E5AB] tracking-wide">
              MAHARAJA THANJAVUR
            </h1>
          </div>
          
          {/* TOP 3 EXECUTIVE ACTION BUTTONS */}
          <div className="grid w-full grid-cols-3 gap-2 md:w-auto">
            {/* 1. Campaign Live / Paused Status Toggle */}
            <button
              type="button"
              onClick={toggleCampaign}
              disabled={saving}
              className={`inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 text-[10px] font-bold uppercase transition shadow-sm active:scale-[0.98] sm:px-3 sm:text-xs ${
                workspace.campaignEnabled
                  ? 'border-emerald-600/70 bg-[#0E3523] text-emerald-200 hover:bg-[#13442D]'
                  : 'border-rose-700/70 bg-[#380E15] text-rose-200 hover:bg-[#48121B]'
              }`}
            >
              {saving ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <span className={`h-2 w-2 rounded-full ${workspace.campaignEnabled ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              )}
              <span>{workspace.campaignEnabled ? 'Campaign Live' : 'Campaign Paused'}</span>
            </button>

            {/* 2. Live TV Screen Link */}
            <a
              href="/tv"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-[#D4AF37]/60 bg-[#280C12] px-2 text-[10px] font-bold uppercase text-[#F3E5AB] shadow-sm transition hover:border-[#D4AF37] hover:bg-[#381019] active:scale-[0.98] sm:px-3 sm:text-xs"
              title="Open Maharaja TV Screen display in new tab"
            >
              <Tv className="h-3.5 w-3.5 text-[#D4AF37]" />
              <span>Live Screen</span>
            </a>

            {/* 3. Sign Out Button */}
            <button
              type="button"
              onClick={() => void logout()}
              disabled={saving}
              className="inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-2 text-[10px] font-bold uppercase text-[#E8DFD8] shadow-sm transition hover:bg-white/10 hover:text-white active:scale-[0.98] sm:px-3 sm:text-xs"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-6 space-y-6">
        {message && (
          <div className="border border-[#D4AF37]/50 bg-white px-4 py-3 rounded-xl shadow-sm text-sm font-semibold text-[#6E0D1F] flex items-center justify-between">
            <span>{message}</span>
            <button onClick={() => setMessage('')} className="text-gray-400 hover:text-black">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* 1. TOP METRICS — LIVE SHOWROOM OPERATIONAL KPIS */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Card 1: Value Scanned (Total Scanned Retail GMV) */}
          <div className="rounded-2xl border border-[#D8C49B]/60 bg-white p-6 shadow-sm transition hover:shadow-md hover:border-[#6E0D1F]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#8A6A20]">Total Showroom GMV</span>
              <div className="p-2.5 rounded-xl bg-[#FFF8E8] text-[#6E0D1F]">
                <IndianRupee className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-4 font-serif text-4xl font-bold text-[#2A060C]">
              {formatMoney(totalGmv)}
            </p>
            <div className="mt-2 text-xs text-[#5C4B43]">
              <span>Verified showroom merchandise value scanned in store.</span>
            </div>
            <p className="mt-1 text-xs font-medium text-[#765E27]">
              {totalGarments} garment tag{totalGarments === 1 ? '' : 's'} recorded.
            </p>
          </div>

          {/* Card 2: Virtual Dressing Room Photos */}
          <div className="rounded-2xl border border-[#D8C49B]/60 bg-white p-6 shadow-sm transition hover:shadow-md hover:border-[#6E0D1F]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#8A6A20]">Virtual Dressing Room Photos</span>
              <div className="p-2.5 rounded-xl bg-[#FFF8E8] text-[#6E0D1F]">
                <Sparkles className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-4 font-serif text-4xl font-bold text-[#6E0D1F]">
              {new Intl.NumberFormat('en-IN').format(imagesSuccess)}
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs font-medium text-[#5C4B43]">
              <span>Completed: <strong className="text-[#2A060C]">{imagesSuccess}</strong></span>
              <span>·</span>
              <span>Floor Retries: <strong className="text-[#6E0D1F]">{imageRetries}</strong></span>
            </div>
            <p className="mt-1 text-xs leading-5 text-[#765E27]">
              Festive fashion portraits generated for shoppers on floor.
            </p>
          </div>

          {/* Card 3: Customer Festive Video Reels */}
          <div className="rounded-2xl border border-[#D8C49B]/60 bg-white p-6 shadow-sm transition hover:shadow-md hover:border-[#6E0D1F]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#8A6A20]">Completed Festive Video Reels</span>
              <div className="p-2.5 rounded-xl bg-[#21090E] text-[#F3E5AB]">
                <Film className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-4 font-serif text-4xl font-bold text-[#6E0D1F]">
              {new Intl.NumberFormat('en-IN').format(videosSuccess)}
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs font-medium text-[#5C4B43]">
              <span>Ready MP4s: <strong className="text-[#2A060C]">{videosSuccess}</strong></span>
              <span>·</span>
              <span>Floor Retries: <strong className="text-[#6E0D1F]">{videoRetries}</strong></span>
            </div>
            <p className="mt-1 text-xs leading-5 text-[#765E27]">
              Cinematic customer video reels rendered and ready for playback.
            </p>
          </div>
        </section>

        {/* 2. SPEND CLASSIFICATION · ₹5,000+ / ₹7,000+ / ₹10,000+ (AUTHENTIC REAL DATA) */}
        <section className="rounded-2xl border border-[#DDD2BD] bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#FFF8E8] text-[#6E0D1F]">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#8A6A20]">
                Customer Spend Classification
              </p>
              <h2 className="font-serif text-xl md:text-2xl font-bold text-[#2A060C]">
                Purchase Tier Distribution
              </h2>
            </div>
          </div>

          {/* Authentic 3 Tier Cards: 5000+, 7000+, 10000+ */}
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {/* Tier 1: ₹5,000+ */}
            <div className="rounded-xl border border-[#D4AF37]/40 bg-[#FFFDF8] p-5 transition hover:shadow-sm">
              <div className="flex items-baseline justify-between border-b border-[#F0EAE1] pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#8A6A20]">
                  Tier 1 · ₹5,000+
                </span>
                <span className="text-xs font-semibold text-[#5C4B43]">Video Qualifier</span>
              </div>
              <p className="mt-3 font-serif text-3xl font-bold text-[#6E0D1F]">
                {new Intl.NumberFormat('en-IN').format(tier5kPlus)}
              </p>
              <p className="mt-1.5 text-xs text-[#5C4B43]">
                Qualifying shoppers eligible for personalized cinematic AI festive video reels.
              </p>
            </div>

            {/* Tier 2: ₹7,000+ */}
            <div className="rounded-xl border border-[#D4AF37]/40 bg-[#FFFDF8] p-5 transition hover:shadow-sm">
              <div className="flex items-baseline justify-between border-b border-[#F0EAE1] pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#8A6A20]">
                  Tier 2 · ₹7,000+
                </span>
                <span className="text-xs font-semibold text-[#5C4B43]">Silk & Festive</span>
              </div>
              <p className="mt-3 font-serif text-3xl font-bold text-[#6E0D1F]">
                {new Intl.NumberFormat('en-IN').format(tier7kPlus)}
              </p>
              <p className="mt-1.5 text-xs text-[#5C4B43]">
                Premium silk sarees, festive designer outfits, and celebratory collections.
              </p>
            </div>

            {/* Tier 3: ₹10,000+ */}
            <div className="rounded-xl border border-[#D4AF37]/40 bg-[#FFFDF8] p-5 transition hover:shadow-sm">
              <div className="flex items-baseline justify-between border-b border-[#F0EAE1] pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#8A6A20]">
                  Tier 3 · ₹10,000+
                </span>
                <span className="text-xs font-semibold text-[#5C4B43]">Royal Bridal VIP</span>
              </div>
              <p className="mt-3 font-serif text-3xl font-bold text-[#6E0D1F]">
                {new Intl.NumberFormat('en-IN').format(tier10kPlus)}
              </p>
              <p className="mt-1.5 text-xs text-[#5C4B43]">
                Heritage bridal silks, pure zari ensembles, and high-value VIP patrons.
              </p>
            </div>
          </div>
        </section>

        {/* 3. SIMPLE DESIGN FOR SELECTING EVENT THEN STATUS */}
        <section className="rounded-2xl border border-[#DDD2BD] bg-white p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EEE7DA]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-[#FFF8E8] text-[#6E0D1F]">
                <CalendarRange className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#8A6A20]">Active Theme</p>
                <h3 className="font-serif text-xl font-bold text-[#2A060C]">Select Festival Event</h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#5C4B43]">Current Status:</span>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                workspace.campaignEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
              }`}>
                <span className={`h-2 w-2 rounded-full ${workspace.campaignEnabled ? 'bg-emerald-600' : 'bg-red-600'}`} />
                {workspace.campaignEnabled ? 'Live In-Store' : 'Paused'}
              </span>
            </div>
          </div>

          {/* Simple Event Selector Tabs / Buttons */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {EVENT_OPTIONS.map((option) => {
              const isActive = activeEventId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={saving}
                  onClick={() => void selectActiveEvent(option.id)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 text-center transition ${
                    isActive
                      ? 'border-[#D4AF37] bg-[#FFF8E8] shadow-sm ring-2 ring-[#D4AF37]/30'
                      : 'border-[#DDD2BD] bg-white hover:border-[#8A6A20] text-[#5C4B43]'
                  }`}
                >
                  <span className={`font-serif text-sm font-bold ${isActive ? 'text-[#6E0D1F]' : 'text-[#2A060C]'}`}>
                    {option.label}
                  </span>
                  <span className={`mt-1 text-[10px] font-bold uppercase tracking-wider ${
                    isActive ? 'text-[#8A6A20]' : 'text-gray-400'
                  }`}>
                    {isActive ? 'Active Theme' : 'Click to Set'}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 4. PERFORMANCE TABLE · DAILY DATE LOGS & WEEKLY SUMMARY */}
        <section className="rounded-2xl border border-[#DDD2BD] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-[#EEE7DA]">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#8A6A20]">Store Performance Telemetry</p>
              <h3 className="font-serif text-xl font-bold text-[#2A060C]">
                {logViewMode === 'daily' ? 'Daily Analytics Date Logs' : 'Weekly Summary Logs'}
              </h3>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-xl border border-[#D4AF37]/40 bg-[#FFFDF7] p-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setLogViewMode('daily')}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    logViewMode === 'daily'
                      ? 'bg-[#6E0D1F] text-[#F3E5AB] shadow-sm'
                      : 'text-[#5C4B43] hover:text-black'
                  }`}
                >
                  Daily Logs
                </button>
                <button
                  type="button"
                  onClick={() => setLogViewMode('weekly')}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    logViewMode === 'weekly'
                      ? 'bg-[#6E0D1F] text-[#F3E5AB] shadow-sm'
                      : 'text-[#5C4B43] hover:text-black'
                  }`}
                >
                  Weekly Logs
                </button>
              </div>

              <div className="hidden sm:block text-xs text-[#5C4B43] pl-2 border-l border-[#EEE7DA]">
                Downloads: <strong className="text-[#6E0D1F]">{workspace.analytics.brandedReach}</strong>
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            {logViewMode === 'daily' ? (
              <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[#DDD2BD] text-xs uppercase text-[#765E27]">
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Garments Scanned</th>
                    <th className="py-3 px-3">Total Scanned GMV</th>
                    <th className="py-3 px-3">Try-Ons Done</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEE7DA]">
                  {workspace.analytics.days.length ? (
                    workspace.analytics.days.map((day) => (
                      <tr key={day.date} className="hover:bg-[#FFFDF7] transition">
                        <td className="py-3.5 px-3 font-mono font-bold text-[#2A060C]">{day.date}</td>
                        <td className="py-3.5 px-3 text-[#5C4B43]">{day.scans}</td>
                        <td className="py-3.5 px-3 font-semibold text-[#6E0D1F]">{formatMoney(day.gmv)}</td>
                        <td className="py-3.5 px-3 text-[#5C4B43]">{day.tryOns}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500">
                        No price scans recorded yet. In-store garment scans will log daily figures here.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[#DDD2BD] text-xs uppercase text-[#765E27]">
                    <th className="py-3 px-3">Weekly Period</th>
                    <th className="py-3 px-3">Garments Scanned</th>
                    <th className="py-3 px-3">Total Scanned GMV</th>
                    <th className="py-3 px-3">Try-Ons Done</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEE7DA]">
                  {workspace.analytics.weeks?.length ? (
                    workspace.analytics.weeks.map((week) => (
                      <tr key={week.week} className="hover:bg-[#FFFDF7] transition">
                        <td className="py-3.5 px-3 font-mono font-bold text-[#2A060C]">{week.week}</td>
                        <td className="py-3.5 px-3 text-[#5C4B43]">{week.scans}</td>
                        <td className="py-3.5 px-3 font-semibold text-[#6E0D1F]">{formatMoney(week.gmv)}</td>
                        <td className="py-3.5 px-3 text-[#5C4B43]">{week.tryOns}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500">
                        No weekly aggregates recorded yet. Weekly figures will summarize in-store performance here.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* 5. AUDIT LOG ONLY FOR GO LIVE WITH CUSTOMER NAME, PH NUMBER - PLAY VIDEO */}
        <section className="rounded-2xl border border-[#DDD2BD] bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-[#21090E] p-2 text-[#F3E5AB]"><Film className="h-5 w-5" /></div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#8A6A20]">Firebase Storage</p>
                <h3 className="font-serif text-xl font-bold text-[#2A060C]">Stored Video Library</h3>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadStoredVideos()}
              disabled={storedVideosLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8C49B] px-3 py-1.5 text-xs font-bold uppercase text-[#6E0D1F] transition hover:bg-[#FFF8E8] disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${storedVideosLoading ? 'animate-spin' : ''}`} /> Refresh Videos
            </button>
          </div>
          <p className="mt-2 text-xs text-[#5C4B43]">Every playable video found in Firebase Storage. Play always requests a fresh secure URL.</p>

          {storedVideosLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-[#6E0D1F]">
              <LoaderCircle className="h-5 w-5 animate-spin" /> Loading stored videos
            </div>
          ) : storedVideos.length ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {storedVideos.map((item) => (
                <article key={`${item.videoId}-${item.storagePath}`} className="flex min-w-0 flex-col justify-between rounded-xl border border-[#E4DCCB] bg-[#FFFCF6] p-4">
                  <div>
                    <p className="truncate font-bold text-[#2A060C]">{item.customerName}</p>
                    <p className="mt-1 truncate text-xs text-[#6B625C]">{item.customerLocality}</p>
                    <p className="mt-2 text-[11px] font-semibold uppercase text-[#8A6A20]">{item.durationSeconds}s · {item.format}</p>
                    <p className="mt-1 truncate text-[10px] text-[#8A817B]" title={item.storagePath}>{item.storagePath}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void playStoredVideo(item)}
                    disabled={openingStoragePath === item.storagePath}
                    className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#6E0D1F] px-4 text-xs font-bold uppercase text-[#F3E5AB] transition hover:bg-[#8A1127] disabled:opacity-50"
                  >
                    {openingStoragePath === item.storagePath ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                    Play
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">No playable videos were found in Firebase Storage.</p>
          )}
        </section>

        <section className="rounded-2xl border border-[#DDD2BD] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-[#21090E] text-[#F3E5AB]">
                <Tv className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#8A6A20]">Display Broadcasts</p>
                <h3 className="font-serif text-xl font-bold text-[#2A060C]">Live Screen Audit Log</h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void resetLiveQueue()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-xs font-bold uppercase text-red-700 hover:bg-red-50 transition disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear TV Queue
              </button>
              <button
                type="button"
                onClick={() => void loadWorkspace()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D8C49B] text-xs font-bold uppercase text-[#6E0D1F] hover:bg-[#FFF8E8] transition"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh Log
              </button>
            </div>
          </div>

          <p className="mt-2 text-xs text-[#5C4B43]">
            Completed Go-Live moments sent to the store TV screen. Review customer details and play the rendered videos.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#DDD2BD] text-xs uppercase text-[#765E27]">
                  <th className="py-3 px-3">Broadcast Time</th>
                  <th className="py-3 px-3">Customer Name</th>
                  <th className="py-3 px-3">Phone Number</th>
                  <th className="py-3 px-3">Screen Queue</th>
                  <th className="py-3 px-3 text-right">Video Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEE7DA]">
                {goLiveAuditList.length ? (
                  goLiveAuditList.map((item) => (
                    <tr key={item.id} className="hover:bg-[#FFFDF7] transition">
                      <td className="py-3.5 px-3 text-xs text-[#5C4B43]">
                        {new Date(item.createdAt).toLocaleString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3.5 px-3 font-semibold text-[#2A060C]">{item.customerName}</td>
                      <td className="py-3.5 px-3 font-mono font-bold text-[#6E0D1F]">
                        {item.phoneMasked || item.phone || 'Customer'}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                          Queue #{item.queueNumber || 1}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setPlayingVideo({
                              url: item.videoUrl,
                              customerName: item.customerName,
                              phoneMasked: item.phoneMasked || item.phone,
                              sessionId: item.sessionId,
                            });
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6E0D1F] text-[#F3E5AB] text-xs font-bold uppercase hover:bg-[#8A1127] transition shadow-sm"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" /> Play Video
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      No live screen videos pushed yet. Once customers tap "Go Live" on their completed festive video, they will appear here with video playback.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 6. PERMANENT WALL & BILLING COUNTER — TAKEN TO BOTTOM */}
        <section className="grid gap-6 lg:grid-cols-2 pt-4 border-t border-[#DDD2BD]">
          {/* Card 1: Permanent wall QR */}
          <div className="rounded-2xl border border-[#D8C49B] bg-white p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#8A6A20]">Permanent Wall QR</p>
                  <h2 className="mt-1 font-serif text-2xl font-bold text-[#2A060C]">Maharaja AI Try-On</h2>
                  <p className="mt-2 text-sm leading-6 text-[#5C4B43]">
                    In-store poster for customers to scan ₹500+ garment price tags and preview festival outfits in the virtual dressing room.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-[#FFF8E8] text-[#6E0D1F] shrink-0">
                  <QrCode className="h-7 w-7" />
                </div>
              </div>

              {posterVisible && (
                <div className="mt-5 grid gap-5 sm:grid-cols-[180px_1fr] sm:items-center">
                  <div className="aspect-[8/11] overflow-hidden rounded-xl border border-[#D8C49B] bg-[#F8F5EE]">
                    {posterDataUrl ? (
                      <img src={posterDataUrl} alt="Maharaja AI Try-On printable QR poster" className="h-full w-full object-contain" />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-slate-400">
                        <LoaderCircle className="h-8 w-8 animate-spin text-[#6E0D1F]" />
                        <span className="text-xs font-bold uppercase text-[#6E0D1F]">Generating High-Res Artwork...</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <button
                      type="button"
                      id="download-tryon-png-btn"
                      disabled={posterBuilding}
                      onClick={() => void downloadPoster()}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#6E0D1F] px-4 py-3 text-xs font-bold uppercase text-[#F3E5AB] disabled:opacity-40 hover:bg-[#8A1127] transition shadow-sm"
                    >
                      {posterBuilding ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download Try-On PNG
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!posterVisible && (
              <button
                type="button"
                id="generate-tryon-qr-btn"
                disabled={posterBuilding}
                onClick={async () => {
                  setPosterVisible(true);
                  await ensurePoster();
                }}
                className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#6E0D1F] px-5 text-xs font-bold uppercase text-[#F3E5AB] disabled:opacity-40 hover:bg-[#8A1127] transition shadow-sm"
              >
                {posterBuilding ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <QrCode className="h-5 w-5" />} Generate Wall Poster QR
              </button>
            )}
          </div>

          {/* Card 2: Billing counter link */}
          <div className="rounded-2xl border border-[#D8C49B] bg-[#21090E] p-6 text-[#F3E5AB] flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#D4AF37]">POS Terminal Link</p>
                  <h2 className="mt-1 font-serif text-2xl font-bold">Billing Counter Link</h2>
                  <p className="mt-2 text-sm leading-6 text-[#F3E5AB]/80">
                    Open or copy this counter link for billing terminals. Cashiers generate customer AI Video QRs for qualifying ₹5,000+ purchases. Retries automatically expire old codes.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-black/40 text-[#D4AF37] shrink-0">
                  <Film className="h-7 w-7" />
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                id="copy-billing-link-btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(workspace.billingUrl);
                    setBillingCopied(true);
                    setMessage('Billing link copied.');
                    window.setTimeout(() => setBillingCopied(false), 2500);
                  } catch {
                    setMessage('Copy failed.');
                  }
                }}
                className="flex-1 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-5 py-3 text-xs font-bold uppercase text-black transition hover:brightness-105 shadow-sm"
              >
                {billingCopied ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-emerald-900" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-5 w-5" /> Copy Billing Link
                  </>
                )}
              </button>

              <Link
                href={workspace.billingUrl}
                target="_blank"
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#D4AF37]/50 bg-black/40 px-5 py-3 text-xs font-bold uppercase text-[#F3E5AB] hover:bg-black/60 transition"
              >
                <ExternalLink className="h-4 w-4" /> Open Counter
              </Link>
            </div>
          </div>
        </section>

        {/* 7. WHATSAPP DELIVERY CHANNEL STATUS */}
        <section className="rounded-2xl border border-[#DDD2BD] bg-white p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#8A6A20]">Optional Channel</p>
                <h4 className="font-serif text-lg font-bold text-[#2A060C]">WhatsApp AI Video Delivery</h4>
              </div>
            </div>

            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
              workspace.integrations.whatsapp.configured
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-amber-100 text-amber-800 border border-amber-300'
            }`}>
              {workspace.integrations.whatsapp.configured ? 'Connected' : 'QR Fallback Active'}
            </span>
          </div>

          <p className="mt-2 text-xs text-[#5C4B43]">
            {workspace.integrations.whatsapp.configured
              ? `Approved template: ${workspace.integrations.whatsapp.templateName}`
              : 'WhatsApp secrets can be added in Vercel environment variables. In-store customer QR serves as the seamless primary flow.'}
          </p>
        </section>

        {/* WEFOCUS OPERATIONS & BRANDING PARTNER */}
        <section className="rounded-2xl border border-[#D4AF37]/40 bg-[#1D090E] p-6 text-white shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#D4AF37]">
                Brand Marketing, Digital Growth & Technology Partner
              </p>
              <h3 className="font-serif text-2xl font-bold text-[#F3E5AB]">
                wefocus
              </h3>
              <p className="text-xs leading-relaxed text-[#F3E5AB]/80 max-w-xl">
                Strategic brand marketing, digital customer acquisition, custom UI/UX design, and AI retail software engineering crafted for Maharaja Thanjavur.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href="https://wefocus.in"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-5 text-xs font-bold uppercase tracking-wider text-black transition hover:bg-[#E5C158] shadow-sm"
              >
                <span>wefocus.in</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a
                href="tel:9994837342"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#D4AF37]/50 bg-white/10 px-4 text-xs font-bold uppercase tracking-wider text-[#F3E5AB] hover:bg-white/20 transition"
              >
                <Phone className="h-3.5 w-3.5 text-[#D4AF37]" />
                <span>Call 9994837342</span>
              </a>
            </div>
          </div>
        </section>

        <footer className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-1.5 font-semibold">
            <ShieldCheck className="h-4 w-4 text-emerald-700" /> All passes, usage and retail telemetry belong to Maharaja Thanjavur.
          </div>
          <div className="text-right">
            Partnered with <a href="https://wefocus.in" target="_blank" rel="noopener noreferrer" className="font-bold text-[#6E0D1F] underline hover:text-[#851025]">wefocus.in</a> — Brand Marketing, Digital Growth & Software.
          </div>
        </footer>
      </div>

      {/* VIDEO PREVIEW MODAL */}
      {playingVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in"
          onClick={() => setPlayingVideo(null)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-[#D4AF37]/50 bg-[#160509] p-5 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#D4AF37]">Live TV Video</span>
                <h4 className="font-serif text-lg font-bold text-[#F3E5AB]">
                  {playingVideo.customerName} ({playingVideo.phoneMasked})
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setPlayingVideo(null)}
                className="p-1.5 rounded-lg bg-white/10 text-gray-300 hover:text-white hover:bg-white/20 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex flex-col items-center justify-center">
              {playingVideo.url ? (
                <video
                  controls
                  autoPlay
                  playsInline
                  src={playingVideo.url}
                  className="max-h-[60vh] w-auto rounded-xl border border-white/10 shadow-lg object-contain bg-black"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center text-gray-400">
                  <Film className="h-10 w-10 text-[#D4AF37] mb-2" />
                  <p className="text-sm font-semibold text-white">This video was rendered for the customer session.</p>
                  {playingVideo.sessionId && (
                    <Link
                      href={`/result/${playingVideo.sessionId}`}
                      className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#D4AF37] text-black text-xs font-bold uppercase"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> View Session Result
                    </Link>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex justify-end">
              <button
                type="button"
                onClick={() => setPlayingVideo(null)}
                className="px-4 py-2 rounded-lg bg-white/10 text-xs font-bold uppercase text-gray-200 hover:bg-white/20 transition"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
