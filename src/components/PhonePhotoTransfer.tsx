'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

export default function PhonePhotoTransfer({ onPhoto }: { onPhoto: (photo: string) => void }) {
  const [transfer, setTransfer] = useState<{ token: string; receiver: string; expiresAtMs: number } | null>(null);
  const [qr, setQr] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const onPhotoRef = useRef(onPhoto);
  useEffect(() => { onPhotoRef.current = onPhoto; }, [onPhoto]);
  useEffect(() => {
    if (!transfer) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (!active) return;
      if (Date.now() >= transfer!.expiresAtMs) { setMessage('Upload QR expired. Create a new one.'); setTransfer(null); setQr(''); return; }
      try {
        const response = await fetch(`/api/tv/photo-transfer/${transfer!.token}`, { headers: { 'x-transfer-receiver': transfer!.receiver }, cache: 'no-store' });
        const data = await response.json();
        if (active && data.status === 'ready' && data.image) {
          onPhotoRef.current(data.image);
          await fetch(`/api/tv/photo-transfer/${transfer!.token}`, { method: 'DELETE', headers: { 'x-transfer-receiver': transfer!.receiver } });
          return;
        }
      } catch { /* A brief network interruption does not discard the transfer. */ }
      if (active) timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [transfer]);
  async function create() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/tv/photo-transfer', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload QR unavailable.');
      setQr(await QRCode.toDataURL(`${window.location.origin}/maharaja/photo-transfer/${data.token}`, { width: 280, margin: 2 }));
      setTransfer(data);
      setMessage('Scan, select your photo and confirm on your phone. This QR expires in 10 minutes.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Upload QR unavailable.'); }
    finally { setBusy(false); }
  }
  return <div className="text-center"><button type="button" onClick={create} disabled={busy} className="min-h-14 border border-current px-5 py-3 text-base font-semibold disabled:opacity-50">{busy ? 'Preparing QR…' : 'Upload from your phone'}</button>{qr ? <div role="dialog" aria-modal="true" aria-label="Send a photo from your phone" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6"><div className="w-full max-w-lg space-y-4 border border-[#D8DCD7] bg-[#F7F4EE] p-6 text-[#202825]"><h2 className="font-serif text-3xl font-semibold">Send your photo from your phone</h2><img src={qr} alt="Scan to send your photo to this display" className="mx-auto h-64 w-64 bg-white p-2" /><p role="status" className="text-base">{message}</p><button type="button" onClick={() => { setTransfer(null); setQr(''); }} className="min-h-14 w-full border border-[#394B42] px-5 font-semibold">Back to camera</button></div></div> : message && <p role="status" className="mt-2 text-sm">{message}</p>}</div>;
}
