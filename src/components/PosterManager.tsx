'use client';

import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Trash2, Upload } from 'lucide-react';

const MAX = 8;

/**
 * Settings → Posters: the store's own brand and offer artwork. The TV and tablet show them, rotating, in
 * the space a screen's content leaves empty, so the portrait screen always looks full.
 */
export default function PosterManager({ clientId }: { clientId?: string }) {
  const [posters, setPosters] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const code = clientId ? `workspaceCode=${encodeURIComponent(clientId)}` : '';

  useEffect(() => {
    fetch(`/api/maharaja/posters?${code}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => { if (data?.success) setPosters(data.posters || []); })
      .catch(() => setError('Posters could not be loaded. Reload the page.'));
  }, [code]);

  function measure(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = () => { resolve({ width: 0, height: 0 }); URL.revokeObjectURL(url); };
      img.src = url;
    });
  }

  async function upload(file?: File) {
    setMessage('');
    setError('');
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Use a JPG, PNG or WebP poster.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError(`This poster is ${(file.size / 1048576).toFixed(1)} MB; the limit is 5 MB.`); return; }
    const { width, height } = await measure(file);
    if (width < 720 || height < 720) { setError(`This poster is ${width} × ${height} px; it needs to be at least 720 × 720 px.`); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.set('poster', file);
      if (clientId) form.set('workspaceCode', clientId);
      const data = await (await fetch('/api/maharaja/posters', { method: 'POST', body: form })).json();
      if (!data?.success) throw new Error(data?.error || 'The poster could not be saved.');
      setPosters(data.posters || []);
      setMessage('Poster added. It shows on the TV within a few minutes.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The poster could not be saved.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(id: string) {
    setConfirmId(null);
    setError('');
    const data = await (await fetch(`/api/maharaja/posters?id=${encodeURIComponent(id)}${code ? `&${code}` : ''}`, { method: 'DELETE' })).json().catch(() => null);
    if (!data?.success) { setError('The poster could not be deleted.'); return; }
    setPosters(data.posters || []);
  }

  return (
    <section className="tf-card p-6">
      <h2 className="text-lg font-bold">Posters</h2>
      <p className="mt-1 text-sm text-muted">Your own brand and offer artwork. The TV shows them in turn in any space a screen leaves empty, so it always looks full.</p>
      <p className="mt-1 text-sm text-ink">{posters.length} of {MAX} · JPG, PNG or WebP · up to 5 MB · at least 720 × 720 px · best portrait 1080 × 1920</p>
      <ul className="mt-4 flex flex-wrap gap-3">
        {posters.map((id) => (
          <li key={id} className="w-32">
            <img src={`/api/maharaja/posters?id=${id}${code ? `&${code}` : ''}`} alt="" className="aspect-[9/16] w-32 rounded-xl border border-line bg-canvas object-cover" />
            {confirmId === id ? (
              <div className="mt-1 grid grid-cols-2 gap-1">
                <button type="button" onClick={() => void remove(id)} className="min-h-9 rounded-lg bg-danger text-xs font-bold text-white">Delete</button>
                <button type="button" onClick={() => setConfirmId(null)} className="min-h-9 rounded-lg border border-line-strong bg-white text-xs font-bold text-ink">Keep</button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmId(id)} className="mt-1 flex min-h-9 w-full items-center justify-center gap-1 rounded-lg border border-line-strong bg-white text-xs font-bold text-danger"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
            )}
          </li>
        ))}
      </ul>
      {posters.length < MAX && (
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="tf-btn tf-btn-secondary mt-4 !min-h-11 px-5 text-sm">
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload poster
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} />
      {message && <p role="status" className="mt-3 text-sm font-semibold text-success">{message}</p>}
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-danger">{error}</p>}
    </section>
  );
}
