'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, LoaderCircle, Trash2, Video } from 'lucide-react';
import type { GoLiveAuditItem } from '@/components/MaharajaAdminDashboard';


/** The videos customers sent to Go Live: watch, download (when the customer allowed it) or remove. */
export default function ClientVideoLibrary({
  backHref = '/maharaja/workspace',
  backLabel = 'Back to workspace',
  embedded = false,
}: {
  backHref?: string;
  backLabel?: string;
  /** Inside the workspace's Go Live tab: the gallery only. */
  embedded?: boolean;
}) {
  const [videos, setVideos] = useState<GoLiveAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

  const gallery = loading ? (
    <div className="flex justify-center py-12"><LoaderCircle className="h-6 w-6 animate-spin text-muted" /></div>
  ) : videos.length === 0 ? (
    <div className="rounded-2xl border border-dashed border-line-strong p-10 text-center">
      <Video className="mx-auto h-8 w-8 text-subtle" />
      <p className="mt-2 text-sm text-muted">No videos have gone live yet.</p>
    </div>
  ) : (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {videos.map((item) => (
        <li key={item.id} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-white">
          <video src={item.videoUrl} controls playsInline preload="metadata" className="aspect-[9/16] w-full bg-ink object-contain" />
          <div className="flex flex-1 flex-col p-3">
            <p className="truncate text-sm font-semibold text-ink">{item.customerName}</p>
            <p className="text-xs text-muted">{new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
            <div className="mt-auto flex gap-2 pt-3">
              {item.promotionConsent && (
                <button type="button" disabled={downloadingId === item.id} onClick={() => handleDownload(item)} aria-label="Download" className="tf-btn tf-btn-secondary !min-h-9 flex-1 px-2 text-xs">
                  {downloadingId === item.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                </button>
              )}
              <button type="button" disabled={removingId === item.id} onClick={() => void handleRemove(item)} aria-label="Remove" className="flex min-h-9 flex-1 items-center justify-center rounded-xl border border-line-strong text-danger disabled:opacity-50">
                {removingId === item.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );

  const errorBox = error && <p role="alert" className="rounded-2xl bg-danger-soft p-3 text-sm font-semibold text-danger">{error}</p>;

  if (embedded) return <div className="space-y-3">{errorBox}{gallery}</div>;

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto max-w-6xl space-y-5 px-5 py-6 sm:px-8">
        <Link href={backHref} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Link>
        <h1 className="text-2xl font-bold">Went live ({videos.length})</h1>
        {errorBox}
        {gallery}
      </div>
    </main>
  );
}
