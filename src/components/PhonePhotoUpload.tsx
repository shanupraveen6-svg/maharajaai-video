'use client';

import { useEffect, useState } from 'react';

export default function PhonePhotoUpload({ token }: { token: string }) {
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  async function select(file?: File) {
    if (!file) return;
    setMessage('');
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const canvas = document.createElement('canvas');
      const ratio = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to prepare photo.');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', .85));
      if (!blob || blob.size > 2 * 1024 * 1024) throw new Error('Choose a smaller photo.');
      setPhoto(blob); setPreview(URL.createObjectURL(blob));
    } catch { setMessage('This photo could not be opened. Please choose a JPEG, PNG or WebP photo.'); }
  }
  async function send() {
    if (!photo || busy) return;
    setBusy(true); setMessage('');
    try {
      const form = new FormData(); form.set('photo', photo, 'photo.jpg');
      const response = await fetch(`/api/tv/photo-transfer/${token}`, { method: 'PATCH', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to send your photo.');
      setSent(true); setPhoto(null); setPreview('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to send your photo.'); }
    finally { setBusy(false); }
  }
  return <main className="min-h-dvh bg-[#F7F4EE] px-5 py-8 text-[#202825]"><div className="mx-auto max-w-md space-y-5"><p className="text-sm font-bold tracking-widest">TRYFOCUS · MAHARAJA</p><h1 className="font-serif text-3xl font-semibold">{sent ? 'Photo sent to the display' : 'Send your photo to the display'}</h1>{sent ? <p>Continue on the store display. You can close this page.</p> : <><p>Your photo is private. Check the preview, then confirm. This upload QR expires in ten minutes.</p><label className="flex min-h-14 cursor-pointer items-center justify-center border border-[#394B42] bg-white px-5 font-semibold">{photo ? 'Choose another photo' : 'Choose a photo'}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void select(event.target.files?.[0])} /></label>{preview && <img src={preview} alt="Your selected photo, before sending" className="max-h-[50dvh] w-full object-contain" />}<button type="button" disabled={!photo || busy} onClick={() => void send()} className="min-h-14 w-full bg-[#7A1428] px-5 font-semibold text-white disabled:opacity-40">{busy ? 'Sending…' : 'Confirm & send to display'}</button></>}{message && <p role="alert">{message}</p>}</div></main>;
}
