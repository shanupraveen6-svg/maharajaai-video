'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, ExternalLink, Film, IndianRupee, LoaderCircle, LogOut, Power, QrCode, RefreshCw, ScanLine, Shirt, Tv } from 'lucide-react';
import { createTryOnPosterDataUrl, downloadDataUrl } from '@/lib/maharaja/qr-poster';

export type GoLiveAuditItem = { id: string; createdAt: string; customerName: string; phone: string; phoneMasked: string; videoUrl: string; sessionId: string; queueNumber: number; promotionConsent: boolean };
type Workspace = {
  clientName: string; workspaceCode: string; campaignEnabled: boolean; tryOnUrl: string; billingUrl: string; openVideoUrl: string;
  usage: { tryOnScans: number; tryOnGenerated: number; videoPasses: number; videosGenerated: number; goLive: number; retries: number; downloads: number };
  goLiveAudit?: GoLiveAuditItem[];
  integrations: { whatsapp: { configured: boolean; missing: string[]; templateName: string } };
  analytics: { totalGmv: number; totalGarments: number; imagesSuccess: number; imageRetries: number; videosSuccess: number; videoRetries: number; imageFailures?: number; videoFailures?: number; videosRendering?: number };
};

async function readJson(response: Response) { const data = await response.json().catch(() => ({})); if (!response.ok || !data.success) throw new Error(data.error || 'Request failed.'); return data; }

export default function MaharajaAdminDashboard({ expectedWorkspaceCode }: { expectedWorkspaceCode?: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [poster, setPoster] = useState('');
  const [videoPoster, setVideoPoster] = useState('');
  const [posterLoading, setPosterLoading] = useState(false);

  async function load() {
    try { const data = await readJson(await fetch('/api/maharaja/workspace', { cache: 'no-store' })); setWorkspace(data.workspace); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Unable to load workspace.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function toggleCampaign() {
    if (!workspace) return; setSaving(true);
    try { const data = await readJson(await fetch('/api/maharaja/workspace', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignEnabled: !workspace.campaignEnabled }) })); setWorkspace({ ...workspace, campaignEnabled: data.workspace.campaignEnabled }); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Unable to update campaign.'); }
    finally { setSaving(false); }
  }
  async function logout() { await fetch('/api/operator/logout', { method: 'POST' }).catch(() => undefined); window.location.assign('/login?store=maharaja'); }
  async function disconnectDisplays() {
    try {
      await readJson(await fetch('/api/tv/pair', { method: 'DELETE' }));
      setMessage('Paired displays disconnected. Sign in on each TV to pair it again.');
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Unable to disconnect displays.'); }
  }
  async function downloadPoster() {
    if (!workspace) return; setPosterLoading(true);
    try { const value = poster || await createTryOnPosterDataUrl(workspace.tryOnUrl); setPoster(value); downloadDataUrl(value, 'maharaja-ai-try-on-qr.png'); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Unable to prepare QR poster.'); }
    finally { setPosterLoading(false); }
  }
  async function downloadOpenVideoPoster() {
    if (!workspace) return; setPosterLoading(true);
    try {
      const value = videoPoster || await createTryOnPosterDataUrl(workspace.openVideoUrl, {
        title: 'AI VIDEO', subtitle: 'SCAN TO CREATE YOUR FILM', footer: 'TEMPORARY OPEN VIDEO · STAFF SUPERVISED',
      });
      setVideoPoster(value); downloadDataUrl(value, 'maharaja-temporary-open-ai-video-qr.png');
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Unable to prepare QR poster.'); }
    finally { setPosterLoading(false); }
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#F7F4EE]"><LoaderCircle className="h-8 w-8 animate-spin text-[#6E0D1F]" /></main>;
  if (!workspace || (expectedWorkspaceCode && expectedWorkspaceCode !== workspace.workspaceCode)) return <main className="flex min-h-screen items-center justify-center bg-[#F7F4EE] p-6 font-bold text-red-800">{message || 'Maharaja workspace not found.'}</main>;
  const analytics = workspace.analytics;
  const kpis = [
    { label: 'Price tags scanned', value: analytics.totalGarments, icon: ScanLine },
    { label: 'Scanned merchandise value', value: `Rs ${new Intl.NumberFormat('en-IN').format(analytics.totalGmv || 0)}`, icon: IndianRupee },
    { label: 'AI Try-On completed', value: analytics.imagesSuccess || 0, icon: Shirt },
    { label: 'AI Videos completed', value: analytics.videosSuccess || 0, icon: Film },
    { label: 'Retries used', value: (analytics.imageRetries || 0) + (analytics.videoRetries || 0), icon: RefreshCw },
    { label: 'Failed generations', value: (analytics.imageFailures || 0) + (analytics.videoFailures || 0), icon: Film },
  ];

  return <main className="min-h-screen bg-[#F7F4EE] pb-16 text-[#211A17]">
    <header className="sticky top-0 z-20 border-b border-[#D4AF37]/35 bg-[#1C060B] text-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="text-[10px] font-bold uppercase text-[#D4AF37]">TryFocus client workspace</p><h1 className="font-serif text-2xl font-bold text-[#F3E5AB]">Majestic Maharaja</h1></div><div className="flex flex-wrap gap-2"><button onClick={() => void toggleCampaign()} disabled={saving} className={`flex min-h-10 items-center gap-2 border px-3 text-xs font-bold uppercase ${workspace.campaignEnabled ? 'border-emerald-600 bg-emerald-950 text-emerald-200' : 'border-red-700 bg-red-950 text-red-200'}`}><Power className="h-4 w-4" />{workspace.campaignEnabled ? 'Campaign Live' : 'Paused'}</button><Link href="/maharaja/tv/experience" target="_blank" className="flex min-h-10 items-center gap-2 border border-[#D4AF37]/50 px-3 text-xs font-bold uppercase text-[#F3E5AB]"><Tv className="h-4 w-4" />Open TV</Link><Link href="/maharaja/tablet/experience" target="_blank" className="flex min-h-10 items-center gap-2 border border-[#D4AF37]/50 px-3 text-xs font-bold uppercase text-[#F3E5AB]"><ScanLine className="h-4 w-4" />Open Tablet</Link><Link href="/maharaja/tv" target="_blank" className="flex min-h-10 items-center gap-2 border border-[#D4AF37]/50 px-3 text-xs font-bold uppercase text-[#F3E5AB]"><Tv className="h-4 w-4" />Wall Player</Link><button onClick={() => void logout()} className="flex h-10 w-10 items-center justify-center border border-white/20" title="Sign out"><LogOut className="h-4 w-4" /></button></div></div></header>
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-7">
      {message && <div className="border border-[#D8C49B] bg-white p-3 text-sm font-bold text-[#6E0D1F]">{message}</div>}

      <section className="border border-[#D4AF37]/40 bg-[#1C060B] p-5 text-[#F3E5AB]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D4AF37]/30 pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#D4AF37]">TryFocus Client Contract</p>
            <h2 className="font-serif text-xl font-bold text-white">1,000 Videos + 1,000 Try-Ons Package Accounting</h2>
          </div>
          <div className="flex items-center gap-2 rounded border border-[#D4AF37]/30 bg-black/40 px-3 py-1.5 text-xs font-semibold text-[#D4AF37]">
            <span>15% Retries Included Free</span>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="border border-[#D4AF37]/30 bg-black/30 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-[#D4AF37]">AI Try-On Quota</span>
              <span className="text-[11px] font-semibold text-emerald-400">1,000 Total Pool</span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{analytics.imagesSuccess || 0}</span>
              <span className="text-xs text-[#F3E5AB]/70">/ 1,000 debited</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-[#D4AF37]"
                style={{ width: `${Math.min(100, Math.round(((analytics.imagesSuccess || 0) / 1000) * 100))}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-[#F3E5AB]/80">
              <span>Remaining: <strong>{Math.max(0, 1000 - (analytics.imagesSuccess || 0))}</strong></span>
              <span>Retries used: <strong>{analytics.imageRetries || 0}</strong></span>
            </div>
          </div>

          <div className="border border-[#D4AF37]/30 bg-black/30 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-[#D4AF37]">AI Video Quota</span>
              <span className="text-[11px] font-semibold text-emerald-400">1,000 Total Pool</span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{analytics.videosSuccess || 0}</span>
              <span className="text-xs text-[#F3E5AB]/70">/ 1,000 debited</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${Math.min(100, Math.round(((analytics.videosSuccess || 0) / 1000) * 100))}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-[#F3E5AB]/80">
              <span>Remaining: <strong>{Math.max(0, 1000 - (analytics.videosSuccess || 0))}</strong></span>
              <span>Retries used: <strong>{analytics.videoRetries || 0}</strong></span>
            </div>
          </div>
        </div>
      </section>

      <section><div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase text-[#8A6A20]">Live operations</p><h2 className="font-serif text-2xl font-bold">Today at a glance</h2></div><button onClick={() => void load()} className="flex items-center gap-2 text-xs font-bold uppercase text-[#6E0D1F]"><RefreshCw className="h-4 w-4" />Refresh</button></div><div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">{kpis.map(({ label, value, icon: Icon }) => <article key={label} className="border border-[#DDD2BD] bg-white p-4"><Icon className="h-5 w-5 text-[#8A6A20]" /><p className="mt-4 text-2xl font-black text-[#2A060C]">{value}</p><p className="mt-1 text-xs font-bold uppercase text-[#6B625C]">{label}</p></article>)}</div></section>

      <section><p className="text-xs font-bold uppercase text-[#8A6A20]">Customer access</p><h2 className="font-serif text-2xl font-bold">Maharaja QR experiences</h2><div className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="flex flex-col justify-between border border-[#D8C49B] bg-white p-5"><div><QrCode className="h-7 w-7 text-[#6E0D1F]" /><h3 className="mt-3 font-serif text-xl font-bold">AI Image Try-On</h3><p className="mt-2 text-sm leading-6 text-[#5C4B43]">Permanent wall QR for the in-store Rs 500+ garment experience. Gemini generates the try-on image.</p>{poster && <img src={poster} alt="AI Try-On QR poster" className="mx-auto mt-4 max-h-64" />}</div><button onClick={() => void downloadPoster()} disabled={posterLoading} className="mt-5 flex min-h-12 items-center justify-center gap-2 bg-[#6E0D1F] text-xs font-bold uppercase text-[#F3E5AB]"><Download className="h-4 w-4" />{posterLoading ? 'Preparing PNG' : 'Download permanent QR'}</button></article>
        <article className="flex flex-col justify-between border border-[#D8C49B] bg-[#21090E] p-5 text-[#F3E5AB]"><div><Film className="h-7 w-7 text-[#D4AF37]" /><h3 className="mt-3 font-serif text-xl font-bold">Customer AI Video QR</h3><p className="mt-2 text-sm leading-6 text-[#F3E5AB]/75">Use the billing counter for the normal purchased-garment and catalogue-video journey. Each customer gets a one-time QR and 24-hour link; WhatsApp sends the link when connected.</p><div className="mt-4 grid grid-cols-2 gap-2 text-center text-[11px] font-bold uppercase"><span className="border border-[#D4AF37]/40 p-3">Own garment AI video</span><span className="border border-[#D4AF37]/40 p-3">Catalogue AI video</span></div></div><Link href={workspace.billingUrl} target="_blank" className="mt-5 flex min-h-12 items-center justify-center gap-2 bg-[#D4AF37] text-xs font-bold uppercase text-black"><ExternalLink className="h-4 w-4" />Open customer QR counter</Link></article>
      </div></section>

      <section className="border border-dashed border-[#B99A55] bg-[#FFF9EC] p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase text-[#8A6A20]">Pre-WhatsApp testing</p><h2 className="mt-1 font-serif text-xl font-bold text-[#2A060C]">Temporary permanent AI Video QR</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C4B43]">Use this only while staff are supervising the no-limit video test. It is available only when the deployment has <code>ALLOW_OPEN_VIDEO_QR=true</code>. Turn it off before public launch, then use billing QR and WhatsApp/OTP only.</p></div><button onClick={() => void downloadOpenVideoPoster()} disabled={posterLoading} className="flex min-h-12 items-center justify-center gap-2 border border-[#6E0D1F] bg-white px-4 text-xs font-bold uppercase text-[#6E0D1F] disabled:opacity-45"><Download className="h-4 w-4" />{posterLoading ? 'Preparing QR' : 'Download temporary video QR'}</button></div></section>

      <section className="flex flex-wrap items-center justify-between gap-4 border border-[#DDD2BD] bg-white p-5"><div><p className="text-xs font-bold uppercase text-[#8A6A20]">Manager review</p><h2 className="mt-1 font-serif text-2xl font-bold">Go Live video library</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C4B43]">Videos are intentionally not displayed on this dashboard. Open the library to list, review and play approved Go Live content.</p></div><Link href={`/maharaja/${workspace.workspaceCode}/videos`} className="flex min-h-12 items-center gap-2 bg-[#6E0D1F] px-5 text-xs font-bold uppercase text-[#F3E5AB]">Explore all videos <ExternalLink className="h-4 w-4" /></Link></section>

      <section className="flex flex-wrap items-center justify-between gap-4 border border-[#DDD2BD] bg-white p-4 text-sm"><p><span className="font-bold">WhatsApp API:</span> {workspace.integrations.whatsapp.configured ? `Connected · ${workspace.integrations.whatsapp.templateName}` : 'Not connected. QR and Copy Link remain available.'}</p><button type="button" onClick={() => void disconnectDisplays()} className="flex min-h-10 items-center gap-2 border border-[#D8C49B] px-3 text-xs font-bold"><Tv className="h-4 w-4" />Disconnect paired TVs</button></section>
    </div>
  </main>;
}
