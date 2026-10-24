'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, ExternalLink, Film, IndianRupee, LoaderCircle, LogOut, Play, Power, QrCode, RefreshCw, ScanLine, Shirt, Tv, X } from 'lucide-react';
import { createTryOnPosterDataUrl, downloadDataUrl } from '@/lib/maharaja/qr-poster';

export type GoLiveAuditItem = { id: string; createdAt: string; customerName: string; phone: string; phoneMasked: string; videoUrl: string; sessionId: string; queueNumber: number; promotionConsent: boolean };
type Workspace = {
  clientName: string; workspaceCode: string; campaignEnabled: boolean; tryOnUrl: string; billingUrl: string;
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
  const [posterLoading, setPosterLoading] = useState(false);
  const [playing, setPlaying] = useState<GoLiveAuditItem | null>(null);

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
  async function downloadPoster() {
    if (!workspace) return; setPosterLoading(true);
    try { const value = poster || await createTryOnPosterDataUrl(workspace.tryOnUrl); setPoster(value); downloadDataUrl(value, 'maharaja-ai-try-on-qr.png'); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Unable to prepare QR poster.'); }
    finally { setPosterLoading(false); }
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#F7F4EE]"><LoaderCircle className="h-8 w-8 animate-spin text-[#6E0D1F]" /></main>;
  if (!workspace || (expectedWorkspaceCode && expectedWorkspaceCode !== workspace.workspaceCode)) return <main className="flex min-h-screen items-center justify-center bg-[#F7F4EE] p-6 font-bold text-red-800">{message || 'Maharaja workspace not found.'}</main>;
  const analytics = workspace.analytics;
  const videos = (workspace.goLiveAudit || []).filter((item) => item.videoUrl).slice(0, 3);
  const kpis = [
    { label: 'Price tags scanned', value: analytics.totalGarments, icon: ScanLine },
    { label: 'Scanned merchandise value', value: `Rs ${new Intl.NumberFormat('en-IN').format(analytics.totalGmv || 0)}`, icon: IndianRupee },
    { label: 'AI Try-On completed', value: analytics.imagesSuccess || 0, icon: Shirt },
    { label: 'AI Videos completed', value: analytics.videosSuccess || 0, icon: Film },
    { label: 'Retries used', value: (analytics.imageRetries || 0) + (analytics.videoRetries || 0), icon: RefreshCw },
    { label: 'Failed generations', value: (analytics.imageFailures || 0) + (analytics.videoFailures || 0), icon: Film },
  ];

  return <main className="min-h-screen bg-[#F7F4EE] pb-16 text-[#211A17]">
    <header className="sticky top-0 z-20 border-b border-[#D4AF37]/35 bg-[#1C060B] text-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="text-[10px] font-bold uppercase text-[#D4AF37]">TryFocus client workspace</p><h1 className="font-serif text-2xl font-bold text-[#F3E5AB]">Majestic Maharaja</h1></div><div className="flex gap-2"><button onClick={() => void toggleCampaign()} disabled={saving} className={`flex min-h-10 items-center gap-2 border px-3 text-xs font-bold uppercase ${workspace.campaignEnabled ? 'border-emerald-600 bg-emerald-950 text-emerald-200' : 'border-red-700 bg-red-950 text-red-200'}`}><Power className="h-4 w-4" />{workspace.campaignEnabled ? 'Campaign Live' : 'Paused'}</button><Link href="/maharaja/tv" target="_blank" className="flex min-h-10 items-center gap-2 border border-[#D4AF37]/50 px-3 text-xs font-bold uppercase text-[#F3E5AB]"><Tv className="h-4 w-4" />Live Screen</Link><button onClick={() => void logout()} className="flex h-10 w-10 items-center justify-center border border-white/20" title="Sign out"><LogOut className="h-4 w-4" /></button></div></div></header>
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-7">
      {message && <div className="border border-[#D8C49B] bg-white p-3 text-sm font-bold text-[#6E0D1F]">{message}</div>}
      <section><div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase text-[#8A6A20]">Live operations</p><h2 className="font-serif text-2xl font-bold">Today at a glance</h2></div><button onClick={() => void load()} className="flex items-center gap-2 text-xs font-bold uppercase text-[#6E0D1F]"><RefreshCw className="h-4 w-4" />Refresh</button></div><div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">{kpis.map(({ label, value, icon: Icon }) => <article key={label} className="border border-[#DDD2BD] bg-white p-4"><Icon className="h-5 w-5 text-[#8A6A20]" /><p className="mt-4 text-2xl font-black text-[#2A060C]">{value}</p><p className="mt-1 text-xs font-bold uppercase text-[#6B625C]">{label}</p></article>)}</div></section>

      <section><p className="text-xs font-bold uppercase text-[#8A6A20]">Customer access</p><h2 className="font-serif text-2xl font-bold">Maharaja QR experiences</h2><div className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="flex flex-col justify-between border border-[#D8C49B] bg-white p-5"><div><QrCode className="h-7 w-7 text-[#6E0D1F]" /><h3 className="mt-3 font-serif text-xl font-bold">AI Image Try-On</h3><p className="mt-2 text-sm leading-6 text-[#5C4B43]">Permanent wall QR for the in-store Rs 500+ garment experience. Gemini generates the try-on image.</p>{poster && <img src={poster} alt="AI Try-On QR poster" className="mx-auto mt-4 max-h-64" />}</div><button onClick={() => void downloadPoster()} disabled={posterLoading} className="mt-5 flex min-h-12 items-center justify-center gap-2 bg-[#6E0D1F] text-xs font-bold uppercase text-[#F3E5AB]"><Download className="h-4 w-4" />{posterLoading ? 'Preparing PNG' : 'Download permanent QR'}</button></article>
        <article className="flex flex-col justify-between border border-[#D8C49B] bg-[#21090E] p-5 text-[#F3E5AB]"><div><Film className="h-7 w-7 text-[#D4AF37]" /><h3 className="mt-3 font-serif text-xl font-bold">Customer AI Video QR</h3><p className="mt-2 text-sm leading-6 text-[#F3E5AB]/75">At the counter, choose Own Garment AI Video or AI Video Gift Link, enter the customer&apos;s phone number, then show the generated QR. The customer continues on their own phone.</p><div className="mt-4 grid grid-cols-2 gap-2 text-center text-[11px] font-bold uppercase"><span className="border border-[#D4AF37]/40 p-3">Own garment AI video</span><span className="border border-[#D4AF37]/40 p-3">AI Video Gift Link</span></div></div><Link href={workspace.billingUrl} target="_blank" className="mt-5 flex min-h-12 items-center justify-center gap-2 bg-[#D4AF37] text-xs font-bold uppercase text-black"><ExternalLink className="h-4 w-4" />Open customer QR counter</Link></article>
      </div></section>

      <section><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase text-[#8A6A20]">Manager review</p><h2 className="font-serif text-2xl font-bold">Explore Go Live Videos</h2><p className="mt-1 text-sm text-[#5C4B43]">Only customer videos submitted to Maharaja TV appear here.</p></div><Link href={`/maharaja/${workspace.workspaceCode}/videos`} className="flex min-h-10 items-center gap-2 bg-[#6E0D1F] px-4 text-xs font-bold uppercase text-[#F3E5AB]">View all</Link></div>{videos.length ? <div className="mt-4 grid gap-4 sm:grid-cols-3">{videos.map((item) => <article key={item.id} className="border border-[#DDD2BD] bg-white p-3"><div className="flex aspect-[9/16] items-center justify-center bg-[#17080C]"><button onClick={() => setPlaying(item)} className="flex h-14 w-14 items-center justify-center rounded-full bg-[#D4AF37] text-black"><Play className="h-6 w-6 fill-current" /></button></div><p className="mt-3 font-bold">{item.customerName}</p><p className="text-xs text-[#6B625C]">Queue #{item.queueNumber} · {new Date(item.createdAt).toLocaleDateString('en-IN')}</p><p className={`mt-2 text-xs font-bold ${item.promotionConsent ? 'text-emerald-700' : 'text-[#6B625C]'}`}>{item.promotionConsent ? 'Social promotion approved' : 'Showroom playback only'}</p></article>)}</div> : <div className="mt-4 border border-dashed border-[#D8C49B] bg-white p-10 text-center text-sm text-[#6B625C]">No customer Go Live videos yet.</div>}</section>

      <section className="border border-[#DDD2BD] bg-white p-4 text-sm"><span className="font-bold">WhatsApp API:</span> {workspace.integrations.whatsapp.configured ? `Connected · ${workspace.integrations.whatsapp.templateName}` : 'Not connected. QR and Copy Link remain available.'}</section>
    </div>
    {playing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"><div className="relative w-full max-w-sm"><button onClick={() => setPlaying(null)} className="absolute -right-2 -top-12 flex h-10 w-10 items-center justify-center rounded-full bg-white text-black"><X className="h-5 w-5" /></button><video src={playing.videoUrl} controls autoPlay playsInline className="aspect-[9/16] w-full bg-black object-contain" /></div></div>}
  </main>;
}
