'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink, LoaderCircle, Trash2, Upload } from 'lucide-react';

type Promo = { id: string; title: string; durationSeconds: number; sizeBytes: number; createdAt: string };

const ACCEPTED = 'video/mp4,video/webm,video/quicktime';
const MAX_BYTES = 50 * 1024 * 1024;

/**
 * The workspace's Go Live TV: its permanent link and up to three promo videos that play after every
 * ten customer videos. Files go straight to storage, then the server checks type, size, length and frame.
 */
export default function GoLivePromoManager({ goLiveUrl }: { goLiveUrl: string }) {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/maharaja/promos', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => { if (data?.success) setPromos(data.promos || []); })
      .catch(() => setError('Promo videos could not be loaded. Reload the page.'));
  }, []);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    setMessage('');
    setError('');
    if (!file) return setError('Choose a video file first.');
    if (!ACCEPTED.split(',').includes(file.type)) return setError('Upload an MP4, WebM or MOV video.');
    if (file.size > MAX_BYTES) return setError(`This file is ${(file.size / 1048576).toFixed(1)} MB; the limit is 50 MB.`);
    setBusy(true);
    try {
      const start = await (await fetch('/api/maharaja/promos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload-url', contentType: file.type, sizeBytes: file.size }),
      })).json();
      if (!start?.success) throw new Error(start?.error || 'Upload could not start.');
      const put = await fetch(start.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!put.ok) throw new Error('The upload was interrupted. Check the connection and try again.');
      setMessage('Checking the video…');
      const done = await (await fetch('/api/maharaja/promos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', id: start.id, title, contentType: file.type }),
      })).json();
      if (!done?.success) throw new Error(done?.error || 'The video could not be saved.');
      setPromos(done.promos || []);
      setTitle('');
      if (fileRef.current) fileRef.current.value = '';
      setMessage('Promo added. It plays on your Go Live TV after every 10 customer videos.');
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
    const data = await (await fetch(`/api/maharaja/promos?id=${encodeURIComponent(id)}`, { method: 'DELETE' })).json().catch(() => null);
    if (!data?.success) return setError(data?.error || 'The promo could not be deleted.');
    setPromos(data.promos || []);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(goLiveUrl).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const full = promos.length >= 3;

  return (
    <div className="space-y-5">
      <div className="border border-[#D8DCD7] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-[#535A56]">Your Go Live TV link</p>
        <p className="mt-1 break-all font-mono text-xs text-[#161918]">{goLiveUrl}</p>
        <p className="mt-2 text-xs text-[#535A56]">
          Open it in any TV or computer browser and tap Start. It plays only your customers&apos; Go Live videos and your promos.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={copyLink} className="flex min-h-11 items-center gap-1.5 border border-[#161918] bg-white px-4 text-xs font-bold uppercase tracking-wider">
            <Copy className="h-4 w-4" /> {copied ? 'Copied' : 'Copy link'}
          </button>
          <a href={goLiveUrl} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-1.5 bg-[#161918] px-4 text-xs font-bold uppercase tracking-wider text-white">
            <ExternalLink className="h-4 w-4" /> Open TV screen
          </a>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-[#161918]">Promo videos ({promos.length}/3)</p>
        <p className="mt-1 text-xs text-[#535A56]">
          One promo plays after every 10 customer videos, in turn. Portrait (9:16) MP4, WebM or MOV, 5–60 seconds, up to 50 MB.
        </p>
        <ul className="mt-3 space-y-2">
          {promos.map((promo) => (
            <li key={promo.id} className="flex items-center justify-between gap-3 border border-[#D8DCD7] bg-white px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-semibold">{promo.title}</span>
                <span className="text-xs text-[#535A56]"> · {Math.round(promo.durationSeconds)}s · {(promo.sizeBytes / 1048576).toFixed(1)} MB</span>
              </span>
              <button type="button" onClick={() => void remove(promo.id)} aria-label={`Delete ${promo.title}`} className="flex min-h-11 min-w-11 items-center justify-center text-[#B42318]">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          {!promos.length && <li className="border border-dashed border-[#D8DCD7] px-3 py-3 text-xs text-[#535A56]">No promos yet.</li>}
        </ul>
        {!full && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Promo name (optional)"
              maxLength={60}
              className="min-h-11 border border-[#D8DCD7] bg-white px-3 text-sm outline-none focus:border-[#7A1428]"
            />
            <input ref={fileRef} type="file" accept={ACCEPTED} aria-label="Promo video file" className="min-h-11 w-full min-w-0 border border-[#D8DCD7] bg-white px-3 py-2 text-xs" />
            <button type="button" disabled={busy} onClick={() => void upload()} className="flex min-h-11 items-center justify-center gap-1.5 bg-[#7A1428] px-4 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50 sm:col-span-2">
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
            </button>
          </div>
        )}
        {full && <p className="mt-3 text-xs text-[#535A56]">You have 3 promos. Delete one to upload another.</p>}
        {message && <p role="status" className="mt-3 text-sm font-semibold text-[#256B45]">{message}</p>}
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-[#B42318]">{error}</p>}
      </div>
    </div>
  );
}
