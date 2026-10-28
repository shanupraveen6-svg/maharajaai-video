'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  LoaderCircle,
  Play,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Tv,
  Upload,
  Video,
} from 'lucide-react';
import { EVENT_OPTIONS, type EventId } from '@/lib/maharaja/config';

type WorkspaceData = {
  clientId: string;
  clientName: string;
  workspaceCode: string;
  campaignEnabled: boolean;
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
  const [billingQrImage, setBillingQrImage] = useState<string>('');

  const sampleInputRef = useRef<HTMLInputElement | null>(null);

  const loadWorkspace = useCallback(async () => {
    try {
      const response = await fetch('/api/maharaja/workspace', { cache: 'no-store' });
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
  }, []);

  useEffect(() => {
    loadWorkspace();
    const timer = window.setInterval(loadWorkspace, 15000);
    return () => window.clearInterval(timer);
  }, [loadWorkspace]);

  // Generate visible QR images for Try-On, Direct AI Video, and Billing Counter
  useEffect(() => {
    if (!workspace) return;
    QRCode.toDataURL(workspace.links.tryOn, {
      width: 260,
      margin: 1,
      color: { dark: '#161918', light: '#FAFBF8' },
    })
      .then(setTryOnQrImage)
      .catch(() => setTryOnQrImage(''));

    QRCode.toDataURL(workspace.links.openVideo, {
      width: 260,
      margin: 1,
      color: { dark: '#161918', light: '#FAFBF8' },
    })
      .then(setVideoQrImage)
      .catch(() => setVideoQrImage(''));

    QRCode.toDataURL(workspace.links.billing, {
      width: 220,
      margin: 1,
      color: { dark: '#161918', light: '#FAFBF8' },
    })
      .then(setBillingQrImage)
      .catch(() => setBillingQrImage(''));
  }, [workspace]);

  async function savePatch(patch: Partial<Pick<WorkspaceData, 'campaignEnabled' | 'activeEvents' | 'defaultEvent'>>) {
    setSaving(true);
    setNotice('');
    setError('');
    try {
      const response = await fetch('/api/maharaja/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to update Maharaja settings.');
      }
      setWorkspace(data.workspace);
      setNotice('Settings saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update settings.');
    } finally {
      setSaving(false);
    }
  }

  function selectDefaultEvent(eventId: EventId) {
    if (!workspace) return;
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

  async function downloadBrandedQr(filename: string, title: string, subtitle: string, targetUrl: string) {
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
        body: JSON.stringify({ regenerateOpenVideoCode: true }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to generate a fresh AI Video QR.');
      }
      setWorkspace(data.workspace);
      setNotice('Fresh 1-Day AI Video QR generated.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to generate a fresh AI Video QR.');
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
      setNotice('Showcase video added to the Maharaja TV loop.');
      await loadWorkspace();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to upload showcase video.');
    } finally {
      setUploadingSample(false);
    }
  }

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
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#7A1428]">Maharaja client area</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold">Sign in to manage your store</h1>
          <p className="mt-3 text-sm text-[#535A56]">Access devices, QR handoffs, campaigns and the video library from one private workspace.</p>
          <button type="button" onClick={() => router.push(`/login?next=/maharaja/${activeWorkspaceCode}`)} className="mt-6 bg-[#7A1428] px-5 py-3 text-xs font-bold uppercase tracking-[0.15em] text-[#FAF6EE]">Sign in</button>
        </div>
      </main>
    );
  }

  if (!workspace || activeWorkspaceCode !== workspace.workspaceCode) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F4F5F2] px-6 text-[#161918]">
        <div className="max-w-md border border-[#D8DCD7] bg-[#FAFBF8] p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#7A1428]">Invalid Link</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold">Maharaja Workspace Not Found</h1>
          <p className="mt-3 text-sm text-[#535A56]">Check the workspace URL with your TryFocus administrator.</p>
        </div>
      </main>
    );
  }

  const totalScans = workspace.usage.tryOnScans + workspace.usage.videoPasses;
  const currentEvent = EVENT_OPTIONS.find((item) => item.id === workspace.defaultEvent) || EVENT_OPTIONS[0];
  const whatsappConnected = Boolean(workspace.whatsapp?.configured);

  return (
    <main className="min-h-screen bg-[#F4F5F2] text-[#161918]">
      {/* Unified TryFocus Top Header */}
      <header className="border-b border-[#D8DCD7] bg-[#F4F5F2]/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center border border-[#161918] bg-[#161918] font-mono text-xs font-bold tracking-widest text-[#FAF6EE]">
              TF
            </span>
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7A1428]">
                TryFocus Client Workspace · Thanjavur
              </p>
              <h1 className="font-serif text-2xl font-semibold text-[#161918]">
                {workspace.clientName}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/maharaja/tv/experience"
              className="border border-[#D8DCD7] bg-[#FAFBF8] px-3.5 py-2 text-xs font-semibold text-[#161918] hover:border-[#161918]"
            >
              Interactive TV Kiosk
            </Link>
            <Link
              href="/maharaja/tablet/experience"
              className="border border-[#D8DCD7] bg-[#FAFBF8] px-3.5 py-2 text-xs font-semibold text-[#161918] hover:border-[#161918]"
            >
              Staff Tablet
            </Link>
            <Link
              href={workspace.links.tv}
              target="_blank"
              className="border border-[#D8DCD7] bg-[#FAFBF8] px-3.5 py-2 text-xs font-semibold text-[#161918] hover:border-[#161918]"
            >
              Showroom TV Wall
            </Link>
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
              Applies to AI Video & TV Wall
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {EVENT_OPTIONS.map((ev) => {
              const selected = workspace.defaultEvent === ev.id;
              return (
                <button
                  key={ev.id}
                  type="button"
                  disabled={saving}
                  onClick={() => selectDefaultEvent(ev.id)}
                  className={`border px-3 py-3 text-left transition ${
                    selected
                      ? 'border-[#7A1428] bg-[#7A1428] text-[#FAF6EE]'
                      : 'border-[#D8DCD7] bg-white text-[#161918] hover:border-[#161918]'
                  }`}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-80">
                    {selected ? 'Active' : 'Select'}
                  </p>
                  <p className="mt-0.5 font-serif text-base font-semibold">{ev.label}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* =========================================================
            DIRECT QR CARDS:
            Image Try-On QR · Video Pass QR · Counter access
           ========================================================= */}
        <section className="grid gap-6 lg:grid-cols-2">
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
                  ₹500 Minimum: Disabled (Free Scan)
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
                      Admin Rule: ₹500 Minimum Price-Tag Gate is Disabled
                    </p>
                    <p className="mt-0.5 text-[#535A56]">
                      Customers go straight to photo upload without needing to scan a ₹500 barcode tag first.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
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
              <button
                type="button"
                onClick={() => copyText('tryOn', workspace.links.tryOn)}
                className="flex items-center justify-center gap-1.5 border border-[#161918] bg-white px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#161918]"
              >
                <Copy className="h-4 w-4" />
                {copiedKey === 'tryOn' ? 'Copied' : 'Copy Link'}
              </button>
              <Link
                href={workspace.links.tryOn}
                target="_blank"
                className="flex items-center justify-center gap-1.5 border border-[#D8DCD7] bg-[#FAFBF8] px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#161918]"
              >
                Open Flow
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Card 2: Customer AI Video QR & Bill Counter (WhatsApp API Not Integrated -> Direct QR 1-Day Validity) */}
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
                    : 'WhatsApp Not Integrated · Direct QR Active'}
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
                    This QR gives the customer 24 hours to complete their private video experience.
                  </p>
                  <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-3 text-xs">
                    <p className="font-semibold text-[#161918]">
                      Giveaway & Purchased Garment Support + Go Live
                    </p>
                    <p className="mt-0.5 text-[#535A56]">
                      Customers can take any garment (or select from the catalogue), generate their AI Video on mobile, and click <strong>Download</strong> or <strong>Go Live</strong> (which plays on the Maharaja TV screen).
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-2.5 sm:grid-cols-4">
              <button
                type="button"
                onClick={() =>
                  downloadBrandedQr(
                    'Maharaja-AI-Video-Direct-QR.png',
                    'AI VIDEO PASS (1-DAY)',
                    'Scan to create your festive AI video & Go Live',
                    workspace.links.openVideo
                  )
                }
                className="flex items-center justify-center gap-1.5 bg-[#7A1428] px-3 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#FAF6EE]"
              >
                <Download className="h-4 w-4" />
                Download QR
              </button>
              <button
                type="button"
                disabled={regeneratingQr}
                onClick={regenerateOpenVideoQr}
                className="flex items-center justify-center gap-1.5 border border-[#161918] bg-white px-3 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#161918]"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${regeneratingQr ? 'animate-spin' : ''}`} />
                Fresh QR
              </button>
              <Link
                href={workspace.links.billing}
                target="_blank"
                className="flex items-center justify-center gap-1.5 border border-[#161918] bg-[#161918] px-3 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#FAF6EE]"
              >
                Bill Counter
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              <Link
                href={workspace.links.openVideo}
                target="_blank"
                className="flex items-center justify-center gap-1.5 border border-[#D8DCD7] bg-[#FAFBF8] px-3 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#161918]"
              >
                Test Pass
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>

        {/* =========================================================
            GO LIVE VIDEOS CARD (NO VIDEO PLAYER ON DASHBOARD — ONLY BUTTON TO DEDICATED PAGE)
            & TV WALL / SHOWCASE SAMPLE UPLOAD
           ========================================================= */}
        <section className="grid gap-6 lg:grid-cols-2">
          {/* Go Live Videos Navigation Card (Strictly button-only on dashboard, per user instruction) */}
          <div className="flex flex-col justify-between border border-[#D8DCD7] bg-[#FAFBF8] p-6">
            <div>
              <div className="flex items-center justify-between border-b border-[#D8DCD7] pb-4">
                <div>
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                    03 · Showroom Go Live Library
                  </p>
                  <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                    Customer Go Live Videos
                  </h2>
                </div>
                <span className="border border-[#D8DCD7] bg-white px-3 py-1 font-mono text-xs font-semibold text-[#161918]">
                  {workspace.goLiveAudit.length} Recorded
                </span>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-[#535A56]">
                When a customer clicks <strong>Go Live</strong> after generating an AI video (from either a giveaway/catalogue pass or a purchased garment pass), their video is queued on the Maharaja TV screen and logged in the dedicated Go Live video library.
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
              <Link
                href={workspace.links.tv}
                target="_blank"
                className="inline-flex items-center gap-2 border border-[#161918] bg-white px-5 py-3.5 text-xs font-bold uppercase tracking-[0.16em] text-[#161918]"
              >
                <Tv className="h-4 w-4" />
                Open Maharaja TV Screen
              </Link>
            </div>
          </div>

          {/* Showroom TV Wall & Idle Showcase Upload */}
          <div className="flex flex-col justify-between border border-[#D8DCD7] bg-[#FAFBF8] p-6">
            <div>
              <div className="flex items-center justify-between border-b border-[#D8DCD7] pb-4">
                <div>
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                    04 · Showroom TV Loop (/maharaja/tv)
                  </p>
                  <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                    TV Wall Queue & Showcase Loop
                  </h2>
                </div>
                <span className="border border-[#D8DCD7] bg-white px-3 py-1 font-mono text-xs font-semibold text-[#161918]">
                  {workspace.showcaseSamples.length} Showcase Clips
                </span>
              </div>

              <p className="mt-4 text-sm text-[#535A56]">
                Upload MP4/MOV promotional clips for the idle showroom loop. Whenever a customer taps <strong>Go Live</strong> on their mobile, the Maharaja TV screen interrupts the idle loop to play their video.
              </p>

              <div className="mt-4 grid gap-2.5 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  value={sampleName}
                  onChange={(event) => setSampleName(event.target.value)}
                  placeholder="Clip title (optional)"
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

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#D8DCD7] pt-4 text-xs text-[#535A56]">
              <span>Billing Counter Link: {workspace.links.billing}</span>
              <button
                type="button"
                onClick={() => copyText('tv', workspace.links.tv)}
                className="font-mono font-bold uppercase tracking-[0.14em] text-[#7A1428]"
              >
                {copiedKey === 'tv' ? 'Copied TV URL' : 'Copy TV Wall URL'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
