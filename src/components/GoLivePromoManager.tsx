'use client';

import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Trash2, Upload } from 'lucide-react';

type Promo = { id: string; title: string; durationSeconds: number; sizeBytes: number; createdAt: string };

const ACCEPTED = 'video/mp4,video/webm,video/quicktime';
const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Up to three promo videos that play on the workspace's Go Live player after every ten customer videos.
 * Files go straight to storage, then the server checks type, size, length and frame.
 */
/** Frame and length, read in the browser so a wrong video is refused before it uploads (the server checks again). */
function measureVideo(file: File): Promise<{ width: number; height: number; seconds: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => { resolve({ width: video.videoWidth, height: video.videoHeight, seconds: video.duration }); URL.revokeObjectURL(url); };
    video.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    video.src = url;
  });
}

export default function GoLivePromoManager({ clientId }: { clientId?: string } = {}) {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const codeQuery = clientId ? `?workspaceCode=${encodeURIComponent(clientId)}` : '';

  useEffect(() => {
    fetch(`/api/maharaja/promos${codeQuery}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => { if (data?.success) setPromos(data.promos || []); })
      .catch(() => setError('Promo videos could not be loaded. Reload the page.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    setMessage('');
    setError('');
    if (!file) return setError('Choose a video file first.');
    if (!ACCEPTED.split(',').includes(file.type)) return setError('Upload an MP4, WebM or MOV video.');
    if (file.size > MAX_BYTES) return setError(`This file is ${(file.size / 1048576).toFixed(1)} MB; the limit is 50 MB.`);
    const shape = await measureVideo(file);
    if (shape && shape.width > shape.height) return setError(`This video is ${shape.width} × ${shape.height} (landscape). The Go Live screen is vertical: upload a portrait 9:16 video, best 1080 × 1920.`);
    if (shape && (shape.seconds < 5 || shape.seconds > 60)) return setError(`This video is ${Math.round(shape.seconds)} seconds; promos must be 5 to 60 seconds.`);
    setBusy(true);
    try {
      const start = await (await fetch('/api/maharaja/promos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload-url', contentType: file.type, sizeBytes: file.size, workspaceCode: clientId }),
      })).json();
      if (!start?.success) throw new Error(start?.error || 'Upload could not start.');
      const put = await fetch(start.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!put.ok) throw new Error('The upload was interrupted. Check the connection and try again.');
      setMessage('Checking the video…');
      const done = await (await fetch('/api/maharaja/promos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', id: start.id, title, contentType: file.type, workspaceCode: clientId }),
      })).json();
      if (!done?.success) throw new Error(done?.error || 'The video could not be saved.');
      setPromos(done.promos || []);
      setTitle('');
      if (fileRef.current) fileRef.current.value = '';
      setMessage('Promo added. It plays on your Go Live player after every 10 customer videos.');
    } catch (caught) {
      setMessage('');
      setError(caught instanceof Error ? caught.message : 'The video could not be uploaded.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError('');
    setMessage('');
    const data = await (await fetch(`/api/maharaja/promos?id=${encodeURIComponent(id)}${clientId ? `&workspaceCode=${encodeURIComponent(clientId)}` : ''}`, { method: 'DELETE' })).json().catch(() => null);
    if (!data?.success) return setError(data?.error || 'The promo could not be deleted.');
    setPromos(data.promos || []);
  }

  const full = promos.length >= 3;

  return (
    <div>
      <div>
        <p className="text-sm text-ink">{promos.length} of 3 · MP4, WebM or MOV · portrait 9:16, best 1080 × 1920 · 5–60 seconds · up to 50 MB</p>
        <p className="mt-1 text-sm text-muted">Plays on your Go Live player after every 10 customer videos.</p>
        <ul className="mt-3 space-y-2">
          {promos.map((promo) => (
            <li key={promo.id} className="rounded-2xl flex items-center justify-between gap-3 border border-line bg-white px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-semibold">{promo.title}</span>
                <span className="text-xs text-muted"> · {Math.round(promo.durationSeconds)}s · {(promo.sizeBytes / 1048576).toFixed(1)} MB</span>
              </span>
              <button type="button" onClick={() => void remove(promo.id)} aria-label={`Delete ${promo.title}`} className="flex min-h-11 min-w-11 items-center justify-center text-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          {!promos.length && <li className="border border-dashed border-line px-3 py-3 text-xs text-muted">No promos yet.</li>}
        </ul>
        {!full && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Promo name (optional)"
              maxLength={60}
              className="min-h-11 border border-line bg-white px-3 text-sm outline-none focus:border-brand"
            />
            <input ref={fileRef} type="file" accept={ACCEPTED} aria-label="Promo video file" className="rounded-xl min-h-11 w-full min-w-0 border border-line bg-white px-3 py-2 text-xs" />
            <button type="button" disabled={busy} onClick={() => void upload()} className="flex min-h-11 items-center justify-center gap-1.5 bg-brand px-4 text-xs font-bold text-white disabled:opacity-50 sm:col-span-2">
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
            </button>
          </div>
        )}
        {full && <p className="mt-3 text-xs text-muted">You have 3 promos. Delete one to upload another.</p>}
        {message && <p role="status" className="mt-3 text-sm font-semibold text-success">{message}</p>}
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-danger">{error}</p>}
      </div>
    </div>
  );
}
