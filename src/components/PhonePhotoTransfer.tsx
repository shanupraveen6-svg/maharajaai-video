'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Smartphone, QrCode, X, LoaderCircle, CheckCircle2 } from 'lucide-react';

interface PhonePhotoTransferProps {
  onPhoto: (photo: string) => void;
  buttonLabel?: string;
  buttonSubLabel?: string;
  buttonClassName?: string;
  renderTrigger?: (onClick: () => void, busy: boolean) => React.ReactNode;
}

export default function PhonePhotoTransfer({
  onPhoto,
  buttonLabel = 'Upload Photo (Scan QR)',
  buttonSubLabel = 'Scan QR on phone to upload from gallery',
  buttonClassName,
  renderTrigger,
}: PhonePhotoTransferProps) {
  const [transfer, setTransfer] = useState<{ token: string; receiver: string; expiresAtMs: number } | null>(null);
  const [qr, setQr] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const onPhotoRef = useRef(onPhoto);

  useEffect(() => {
    onPhotoRef.current = onPhoto;
  }, [onPhoto]);

  useEffect(() => {
    if (!transfer) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      if (!active) return;
      if (Date.now() >= transfer!.expiresAtMs) {
        setMessage('Upload QR expired. Please create a new one.');
        setTransfer(null);
        setQr('');
        return;
      }
      try {
        const response = await fetch(`/api/tv/photo-transfer/${transfer!.token}`, {
          headers: { 'x-transfer-receiver': transfer!.receiver },
          cache: 'no-store',
        });
        const data = await response.json();
        if (active && data.status === 'ready' && data.image) {
          onPhotoRef.current(data.image);
          await fetch(`/api/tv/photo-transfer/${transfer!.token}`, {
            method: 'DELETE',
            headers: { 'x-transfer-receiver': transfer!.receiver },
          });
          setTransfer(null);
          setQr('');
          return;
        }
      } catch {
        /* A brief network interruption does not discard the transfer. */
      }
      if (active) timer = setTimeout(poll, 2000);
    }

    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [transfer]);

  async function create() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/tv/photo-transfer', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload QR unavailable.');
      const qrDataUrl = await QRCode.toDataURL(
        `${window.location.origin}/maharaja/photo-transfer/${data.token}`,
        { width: 320, margin: 2 }
      );
      setQr(qrDataUrl);
      setTransfer(data);
      setMessage('Point your phone camera at this QR code. Pick a portrait photo and tap Confirm.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload QR unavailable.');
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    setTransfer(null);
    setQr('');
    setMessage('');
  }

  return (
    <div>
      {renderTrigger ? (
        renderTrigger(create, busy)
      ) : (
        <button
          type="button"
          onClick={create}
          disabled={busy}
          className={
            buttonClassName ||
            'flex min-h-16 w-full items-center justify-center gap-3 border-2 border-[#161918] bg-[#FAFBF8] px-6 py-4 text-base font-bold text-[#161918] transition hover:border-[#7A1428] hover:bg-[#FAF6EE] disabled:opacity-50'
          }
        >
          {busy ? (
            <LoaderCircle className="h-5 w-5 animate-spin text-[#7A1428]" />
          ) : (
            <QrCode className="h-5 w-5 text-[#7A1428]" />
          )}
          <div className="text-left">
            <span className="block font-serif text-lg font-semibold">{busy ? 'Preparing QR…' : buttonLabel}</span>
            {buttonSubLabel && <span className="block text-xs font-normal text-[#535A56]">{buttonSubLabel}</span>}
          </div>
        </button>
      )}

      {message && !qr && (
        <p role="status" className="mt-2 text-center text-xs font-semibold text-[#B42318]">
          {message}
        </p>
      )}

      {qr && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Upload photo from smartphone"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 sm:p-6 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-lg overflow-hidden border-2 border-[#D8DCD7] bg-[#FAF6EE] p-6 text-[#161918] shadow-2xl sm:p-8">
            <button
              type="button"
              onClick={handleClose}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center border border-[#D8DCD7] bg-white text-[#161918] hover:bg-[#FAFBF8]"
              aria-label="Close upload dialog"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center">
              <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#7A1428]">
                Instant Mobile Transfer
              </span>
              <h2 className="mt-1 font-serif text-3xl font-semibold">Upload from your phone</h2>
              <p className="mt-2 text-sm text-[#535A56]">
                No app needed. Use your smartphone camera to scan.
              </p>
            </div>

            <div className="my-6 flex justify-center">
              <div className="border-4 border-[#161918] bg-white p-3 shadow-lg">
                <img
                  src={qr}
                  alt="Scan this QR code with your smartphone"
                  className="h-64 w-64 object-contain sm:h-72 sm:w-72"
                />
              </div>
            </div>

            <div className="space-y-2 border border-[#D8DCD7] bg-white p-4 text-left text-xs sm:text-sm">
              <div className="flex items-center gap-2 font-semibold text-[#161918]">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#7A1428] text-[11px] font-bold text-white">
                  1
                </span>
                <span>Open your smartphone camera & scan the QR</span>
              </div>
              <div className="flex items-center gap-2 font-semibold text-[#161918]">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#7A1428] text-[11px] font-bold text-white">
                  2
                </span>
                <span>Select a portrait photo from your gallery</span>
              </div>
              <div className="flex items-center gap-2 font-semibold text-[#161918]">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#7A1428] text-[11px] font-bold text-white">
                  3
                </span>
                <span>Tap confirm — it instantly appears on this screen!</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-[#7A1428]">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              <span>Waiting for photo from phone… (expires in 10 minutes)</span>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="mt-6 min-h-12 w-full border border-[#161918] bg-white px-5 text-sm font-bold text-[#161918] hover:bg-[#FAFBF8]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
