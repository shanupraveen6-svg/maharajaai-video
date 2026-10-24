'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, LoaderCircle, Video } from 'lucide-react';
import type { GoLiveAuditItem } from '@/components/MaharajaAdminDashboard';

export default function MaharajaGoLiveVideosPage() {
  const [videos, setVideos] = useState<GoLiveAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');
  useEffect(() => {
    fetch('/api/maharaja/workspace', { cache: 'no-store' }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load Go Live videos.');
      setVideos(data.workspace.goLiveAudit || []);
    }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load Go Live videos.')).finally(() => setLoading(false));
  }, []);
  async function downloadVideo(item: GoLiveAuditItem) {
    if (!item.promotionConsent) return;
    setDownloading(item.id);
    try {
      const response = await fetch('/api/download/asset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: item.videoUrl }) });
      if (!response.ok) throw new Error('Unable to download this video.');
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = objectUrl; anchor.download = `Maharaja-Go-Live-${item.sessionId || item.id}.mp4`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to download this video.'); }
    finally { setDownloading(''); }
  }
  return <main className="min-h-screen bg-[#F7F4EE] px-4 py-6 text-[#211A17]"><div className="mx-auto max-w-6xl">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#D8C49B] pb-5"><div><p className="text-xs font-bold uppercase text-[#8A6A20]">Maharaja manager workspace</p><h1 className="font-serif text-3xl font-bold text-[#2A060C]">Go Live Videos</h1><p className="mt-1 text-sm text-[#5C4B43]">Only customer videos submitted to the Maharaja TV queue appear here.</p></div><Link href=".." className="inline-flex min-h-11 items-center gap-2 border border-[#D8C49B] bg-white px-4 text-xs font-bold uppercase text-[#6E0D1F]"><ArrowLeft className="h-4 w-4" />Workspace</Link></header>
    {error && <p className="mt-5 border border-red-300 bg-red-50 p-4 font-bold text-red-800">{error}</p>}
    {loading ? <div className="flex justify-center py-24"><LoaderCircle className="h-8 w-8 animate-spin text-[#6E0D1F]" /></div> : videos.length ? <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{videos.map((item) => <article key={item.id} className="border border-[#DDD2BD] bg-white p-3"><div className="aspect-[9/16] overflow-hidden bg-black"><video src={item.videoUrl} controls playsInline preload="metadata" className="h-full w-full object-contain" /></div><div className="p-2"><p className="font-bold text-[#2A060C]">{item.customerName}</p><p className="mt-1 text-xs text-[#6B625C]">{new Date(item.createdAt).toLocaleString('en-IN')} · Queue #{item.queueNumber}</p><p className={`mt-2 text-xs font-bold ${item.promotionConsent ? 'text-emerald-700' : 'text-[#6B625C]'}`}>{item.promotionConsent ? 'Social promotion approved' : 'Showroom playback only'}</p><button type="button" onClick={() => void downloadVideo(item)} disabled={!item.promotionConsent || downloading === item.id} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 bg-[#6E0D1F] px-2 text-xs font-bold uppercase text-[#F3E5AB] disabled:cursor-not-allowed disabled:bg-[#E6E0D6] disabled:text-[#6B625C]"><Download className="h-4 w-4" />{downloading === item.id ? 'Preparing' : item.promotionConsent ? 'Download for promotion' : 'Promotion not approved'}</button></div></article>)}</div> : <div className="py-24 text-center"><Video className="mx-auto h-10 w-10 text-[#B9913A]" /><p className="mt-3 font-bold">No customer Go Live videos yet.</p></div>}
  </div></main>;
}
