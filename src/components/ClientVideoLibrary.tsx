'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  ExternalLink,
  LoaderCircle,
  Search,
  Tv,
  Video,
} from 'lucide-react';
import type { GoLiveAuditItem } from '@/components/MaharajaAdminDashboard';


export default function ClientVideoLibrary({
  backHref = '/maharaja/workspace',
  backLabel = 'Back to Client Workspace',
}: {
  backHref?: string;
  backLabel?: string;
}) {
  const [videos, setVideos] = useState<GoLiveAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'promo'>('all');
  const [downloadingId, setDownloadingId] = useState('');
  const [removingId, setRemovingId] = useState('');

  useEffect(() => {
    fetch('/api/maharaja/workspace', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Go Live videos could not be loaded.');
        setVideos(Array.isArray(data?.workspace?.goLiveAudit) ? data.workspace.goLiveAudit : []);
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : 'Go Live videos could not be loaded.');
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredVideos = useMemo(() => {
    return videos.filter((item) => {
      if (filter === 'promo' && !item.promotionConsent) return false;
      if (!query.trim()) return true;
      const hay = `${item.customerName} ${item.customerLocality} ${item.eventId} ${item.sessionId}`.toLowerCase();
      return hay.includes(query.toLowerCase());
    });
  }, [videos, filter, query]);

  async function handleRemove(item: GoLiveAuditItem) {
    if (!item.sessionId || !window.confirm('Remove this video from the Go Live TV and delete it? This cannot be undone.')) return;
    setRemovingId(item.id);
    try {
      const response = await fetch('/api/live/replays', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionIds: [item.sessionId] }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) throw new Error(data?.error || 'The video could not be removed.');
      setVideos((current) => current.filter((video) => video.id !== item.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The video could not be removed.');
    } finally {
      setRemovingId('');
    }
  }

  async function handleDownload(item: GoLiveAuditItem) {
    if (!item.promotionConsent) return;
    setDownloadingId(item.id);
    setError('');
    try {
      if (item.videoUrl.startsWith('/')) {
        const anchor = document.createElement('a');
        anchor.href = item.videoUrl;
        anchor.download = `Maharaja-GoLive-${item.sessionId || item.id}.mp4`;
        anchor.click();
        return;
      }
      const response = await fetch('/api/download/asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.videoUrl }),
      });
      if (!response.ok) throw new Error('Unable to download this video.');
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `Maharaja-GoLive-${item.sessionId || item.id}.mp4`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to download video.');
    } finally {
      setDownloadingId('');
    }
  }

  return (
    <main className="min-h-screen bg-[#F4F5F2] text-[#161918]">
      <header className="border-b border-[#D8DCD7] bg-[#F4F5F2]/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div>
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#7A1428] hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {backLabel}
            </Link>
            <h1 className="mt-1 font-serif text-3xl font-semibold text-[#161918]">
              Go Live Video Library (List & Play)
            </h1>
            <p className="mt-0.5 text-sm text-[#535A56]">
              All customer AI videos submitted via <strong>Go Live</strong> (both purchased-garment and giveaway/catalogue passes) are listed and playable here and queued on the Maharaja TV screen.
            </p>
          </div>

          <Link
            href="/maharaja/tv"
            target="_blank"
            className="inline-flex items-center gap-2 bg-[#161918] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.15em] text-[#FAF6EE]"
          >
            <Tv className="h-4 w-4" />
            Open Maharaja TV Screen (/maharaja/tv)
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-6 sm:px-8">
        {error && (
          <div className="border border-[#B42318] bg-[#FEF3F2] p-4 text-sm font-medium text-[#B42318]">
            {error}
          </div>
        )}

        {/* Filter & Search Bar */}
        <section className="flex flex-wrap items-center justify-between gap-4 border border-[#D8DCD7] bg-[#FAFBF8] p-4">
          <div className="relative min-w-64 flex-1">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#535A56]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customer, dress, or festival..."
              className="h-10 w-full border border-[#D8DCD7] bg-white pl-10 pr-4 text-sm text-[#161918] outline-none focus:border-[#7A1428]"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                filter === 'all'
                  ? 'border-[#7A1428] bg-[#7A1428] text-white'
                  : 'border-[#D8DCD7] bg-white text-[#161918]'
              }`}
            >
              All Go Live Videos ({videos.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('promo')}
              className={`border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                filter === 'promo'
                  ? 'border-[#7A1428] bg-[#7A1428] text-white'
                  : 'border-[#D8DCD7] bg-white text-[#161918]'
              }`}
            >
              Social Promotion Approved
            </button>
          </div>
        </section>

        {/* Video List & Inline Players */}
        {loading ? (
          <div className="flex justify-center py-20">
            <LoaderCircle className="h-8 w-8 animate-spin text-[#7A1428]" />
          </div>
        ) : filteredVideos.length > 0 ? (
          <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredVideos.map((item) => (
              <article
                key={item.id}
                className="flex flex-col justify-between border border-[#D8DCD7] bg-white p-4"
              >
                <div>
                  <div className="relative aspect-[9/16] max-h-[440px] w-full overflow-hidden border border-[#D8DCD7] bg-[#161918]">
                    <video
                      src={item.videoUrl}
                      controls
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-contain"
                    />
                    <span className="absolute left-3 top-3 bg-black/75 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[#FAF6EE]">
                      Queue #{item.queueNumber || 1} · {item.eventId}
                    </span>
                  </div>

                  <div className="mt-3">
                    <p className="font-serif text-lg font-semibold text-[#161918]">
                      {item.customerName}
                    </p>
                    <p className="mt-0.5 text-xs text-[#535A56]">
                      {item.customerLocality} · {new Date(item.createdAt).toLocaleString('en-IN')}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="border border-[#256B45] bg-[#EBF5EE] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#256B45]">
                        Showroom Wall Approved
                      </span>
                      <span
                        className={`border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                          item.promotionConsent
                            ? 'border-[#7A1428] bg-[#7A1428]/10 text-[#7A1428]'
                            : 'border-[#D8DCD7] bg-[#F4F5F2] text-[#535A56]'
                        }`}
                      >
                        {item.promotionConsent ? 'Promo Download Allowed' : 'Showroom Loop Only'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!item.promotionConsent || downloadingId === item.id}
                  onClick={() => handleDownload(item)}
                  className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 bg-[#7A1428] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#FAF6EE] disabled:cursor-not-allowed disabled:bg-[#ECEEE9] disabled:text-[#535A56]"
                >
                  <Download className="h-4 w-4" />
                  {downloadingId === item.id
                    ? 'Preparing Download...'
                    : item.promotionConsent
                    ? 'Download Go Live Video'
                    : 'Showroom Playback Only'}
                </button>
                <button
                  type="button"
                  disabled={removingId === item.id}
                  onClick={() => void handleRemove(item)}
                  className="mt-2 flex min-h-11 w-full items-center justify-center border border-[#B42318] bg-white px-4 text-xs font-semibold uppercase tracking-[0.14em] text-[#B42318] disabled:opacity-50"
                >
                  {removingId === item.id ? 'Removing…' : 'Remove from TV'}
                </button>
              </article>
            ))}
          </section>
        ) : (
          <div className="border border-[#D8DCD7] bg-white p-14 text-center">
            <Video className="mx-auto h-10 w-10 text-[#7A1428]" />
            <p className="mt-3 font-serif text-xl font-semibold text-[#161918]">
              No matching Go Live videos found.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
