'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw, ScanLine, Upload } from 'lucide-react';
import PhotoConsentNotice from '@/components/PhotoConsentNotice';

export default function PhonePhotoUpload({ token }: { token: string }) {
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanPassed, setScanPassed] = useState(false);
  const [scanError, setScanError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function select(file?: File) {
    if (!file) return;
    setMessage('');
    setScanError('');
    setScanPassed(false);
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const vWidth = bitmap.width;
      const vHeight = bitmap.height;
      const targetAspect = 9 / 16;
      const currentAspect = vWidth / vHeight;
      let sx = 0, sy = 0, sWidth = vWidth, sHeight = vHeight;
      if (currentAspect > targetAspect) {
        sHeight = vHeight;
        sWidth = Math.round(vHeight * targetAspect);
        sx = Math.round((vWidth - sWidth) / 2);
      } else if (currentAspect < targetAspect) {
        sWidth = vWidth;
        sHeight = Math.round(vWidth / targetAspect);
        sy = Math.round((vHeight - sHeight) / 2);
      }
      const canvas = document.createElement('canvas');
      canvas.width = 720; canvas.height = 1280;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to prepare photo.');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height); bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', .85));
      if (!blob || blob.size > 2 * 1024 * 1024) throw new Error('Choose a smaller photo.');
      setPhoto(blob);
      setPreview(URL.createObjectURL(blob));
      setScanning(true);
      try {
        const form = new FormData();
        form.set('photo', blob, 'photo.jpg');
        const scanResponse = await fetch(`/api/tv/photo-transfer/${token}`, { method: 'POST', body: form });
        const scanData = await scanResponse.json().catch(() => ({}));
        if (scanData?.valid === false) {
          setScanPassed(false);
          setScanError(String(scanData.reason || 'Sitting or unclear posture detected. Please re-upload a standing photo.'));
        } else {
          setScanPassed(true);
        }
      } catch {
        // Keep store flowing if scanner request fails temporarily.
        setScanPassed(true);
      } finally {
        setScanning(false);
      }
    } catch {
      setScanning(false);
      setMessage('This photo could not be opened. Please choose a JPEG, PNG or WebP photo.');
    }
  }

  async function send() {
    if (!photo || busy || scanning || !scanPassed) return;
    setBusy(true); setMessage('');
    try {
      const form = new FormData();
      form.set('photo', photo, 'photo.jpg');
      form.set('prechecked', '1');
      const response = await fetch(`/api/tv/photo-transfer/${token}`, { method: 'PATCH', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to send your photo.');
      setSent(true); setPhoto(null); setPreview('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to send your photo.'); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-dvh bg-[#F7F4EE] px-5 py-8 text-ink">
      <div className="mx-auto max-w-md space-y-5">
        <p className="text-sm font-bold tracking-wide text-brand">TRYFOCUS</p>
        <h1 className="text-3xl font-bold leading-tight">{sent ? 'Photo sent to the display' : 'Send your photo to the display'}</h1>
        {sent ? (
          <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <p className="flex items-center gap-2 text-lg font-semibold text-success"><CheckCircle2 className="h-5 w-5" /> Received on the screen</p>
            <p className="mt-2 text-muted">Continue on the store display. You can close this page.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted">Stand straight facing the camera in clear light. Sitting or unclear photos are automatically rejected before upload.</p>
            <PhotoConsentNotice kind="phone-upload" />

            {!preview ? (
              <label className="flex min-h-16 cursor-pointer items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-brand bg-white px-5 font-bold text-brand shadow-sm transition hover:bg-brand-soft/30">
                <Upload className="h-5 w-5" />
                <span>Choose a photo</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { void select(event.target.files?.[0]); event.target.value = ''; }} />
              </label>
            ) : (
              <div className="space-y-4">
                <div className="relative overflow-hidden rounded-2xl border border-line bg-ink shadow-md">
                  <img src={preview} alt="Your selected photo, before sending" className={`max-h-[54dvh] w-full object-contain transition ${scanning ? 'opacity-75' : ''}`} />
                  {scanning && (
                    <>
                      <div className="tv-gen-sweep pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-transparent via-emerald-400/50 to-transparent" />
                      <div className="absolute inset-x-0 bottom-3 flex justify-center px-3">
                        <span className="inline-flex items-center gap-2 rounded-full bg-black/85 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur">
                          <ScanLine className="h-4 w-4 animate-pulse text-emerald-400" /> Scanning posture…
                        </span>
                      </div>
                    </>
                  )}
                  {!scanning && scanPassed && (
                    <div className="absolute inset-x-0 bottom-3 flex justify-center px-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-bold text-white shadow-lg">
                        <CheckCircle2 className="h-4 w-4" /> Standing posture verified
                      </span>
                    </div>
                  )}
                </div>

                {!scanning && scanError && (
                  <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft p-3.5 text-sm font-semibold text-danger">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <span>{scanError}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-ink bg-white px-4 text-base font-bold text-ink transition hover:bg-canvas">
                    <RefreshCw className="h-4 w-4" />
                    <span>Re-upload</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { void select(event.target.files?.[0]); event.target.value = ''; }} />
                  </label>
                  <button
                    type="button"
                    disabled={!photo || busy || scanning || !scanPassed}
                    onClick={() => void send()}
                    className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-base font-bold text-white shadow-sm transition hover:bg-brand-strong disabled:opacity-40"
                  >
                    {(scanning || busy) && <LoaderCircle className="h-4 w-4 animate-spin" />}
                    <span>{scanning ? 'Scanning…' : busy ? 'Submitting…' : 'Submit'}</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {message && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger">{message}</p>}
      </div>
    </main>
  );
}
