'use client';

import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Upload } from 'lucide-react';

/** The store logo printed on every look customers download (Try-On on the TV, tablet and phone). */
export default function StoreLogoCard({ onStatus }: { onStatus?: (hasLogo: boolean) => void } = {}) {
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    fetch(`/api/maharaja/logo?t=${Date.now()}`, { cache: 'no-store' })
      .then(async (response) => (response.ok ? URL.createObjectURL(await response.blob()) : ''))
      .then((url) => { onStatus?.(Boolean(url)); setPreview((old) => { if (old) URL.revokeObjectURL(old); return url; }); })
      .catch(() => undefined);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loads once; onStatus only reports the result
  useEffect(load, []);

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setMessage('');
    try {
      const form = new FormData();
      form.set('logo', file);
      const response = await fetch('/api/maharaja/logo', { method: 'POST', body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'The logo could not be saved.');
      setMessage('Saved. New looks carry this logo.');
      load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The logo could not be saved.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <section className="tf-card p-6">
      <h2 className="text-lg font-bold">Store logo</h2>
      <p className="mt-1 text-sm text-muted">Printed on every look customers download. PNG, JPG or WebP, under 3 MB. A wide logo (roughly 3:1, transparent background) fits best.</p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-40 items-center justify-center rounded-xl border border-line bg-white p-2">
          {preview ? <img src={preview} alt="Your store logo" className="max-h-full max-w-full object-contain" /> : <span className="text-sm text-subtle">No logo yet</span>}
        </div>
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="tf-btn tf-btn-secondary !min-h-11 px-4 text-sm">
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {preview ? 'Change logo' : 'Upload logo'}
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} />
      </div>
      {message && <p role="status" className="mt-3 text-sm font-semibold text-ink">{message}</p>}
    </section>
  );
}
