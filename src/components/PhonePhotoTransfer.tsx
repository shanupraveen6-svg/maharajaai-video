'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, X, LoaderCircle } from 'lucide-react';

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
  const activeTransferRef = useRef<{ token: string; receiver: string } | null>(null);

  useEffect(() => {
    onPhotoRef.current = onPhoto;
  }, [onPhoto]);

  useEffect(() => {
    activeTransferRef.current = transfer ? { token: transfer.token, receiver: transfer.receiver } : null;
  }, [transfer]);

  // Clean up active transfer upon component unmount to protect customer privacy
  useEffect(() => {
    return () => {
      const current = activeTransferRef.current;
      if (current?.token && current?.receiver) {
        void fetch(`/api/tv/photo-transfer/${encodeURIComponent(current.token)}`, {
          method: 'DELETE',
          headers: { 'x-transfer-receiver': current.receiver },
        }).catch(() => undefined);
      }
    };
  }, []);

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
    if (transfer?.token && transfer?.receiver) {
      void fetch(`/api/tv/photo-transfer/${encodeURIComponent(transfer.token)}`, {
        method: 'DELETE',
        headers: { 'x-transfer-receiver': transfer.receiver },
      }).catch(() => undefined);
    }
    setTransfer(null);
    setQr('');
    setMessage('');
  }

  return (
    <div className="h-full">
      {renderTrigger ? (
        renderTrigger(create, busy)
      ) : (
        <button
          type="button"
          onClick={create}
          disabled={busy}
          className={
            buttonClassName ||
            'flex min-h-16 w-full items-center justify-center gap-3 border border-ink bg-canvas px-6 py-4 text-base font-bold text-ink transition hover:border-brand hover:bg-[#FAF6EE] disabled:opacity-50'
          }
        >
          {busy ? (
            <LoaderCircle className="h-5 w-5 animate-spin text-brand" />
          ) : (
            <QrCode className="h-5 w-5 text-brand" />
          )}
          <div className="text-left">
            <span className="block text-lg font-bold">{busy ? 'Preparing QR…' : buttonLabel}</span>
            {buttonSubLabel && <span className="block text-xs font-normal text-muted">{buttonSubLabel}</span>}
          </div>
        </button>
      )}

      {message && !qr && (
        <p role="status" className="mt-2 text-center text-xs font-semibold text-danger">
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
          <div className="rounded-2xl relative w-full max-w-lg overflow-hidden border border-line bg-[#FAF6EE] p-6 text-ink shadow-2xl sm:p-8">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl absolute right-4 top-4 flex h-10 w-10 items-center justify-center border border-line bg-white text-ink hover:bg-canvas"
              aria-label="Close upload dialog"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center">
              <h2 className="mt-1 text-3xl font-bold">Upload from your phone</h2>
              <p className="mt-2 text-sm text-muted">
                No app needed. Use your smartphone camera to scan.
              </p>
            </div>

            <div className="my-6 flex justify-center">
              <div className="border-4 border-ink bg-white p-3 shadow-lg">
                <img
                  src={qr}
                  alt="Scan this QR code with your smartphone"
                  className="h-64 w-64 object-contain sm:h-72 sm:w-72"
                />
              </div>
            </div>

            <div className="rounded-2xl space-y-2 border border-line bg-white p-4 text-left text-xs sm:text-sm">
              <div className="flex items-center gap-2 font-semibold text-ink">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                  1
                </span>
                <span>Open your smartphone camera & scan the QR</span>
              </div>
              <div className="flex items-center gap-2 font-semibold text-ink">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                  2
                </span>
                <span>Select a portrait photo from your gallery</span>
              </div>
              <div className="flex items-center gap-2 font-semibold text-ink">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                  3
                </span>
                <span>Tap confirm — it instantly appears on this screen!</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-brand">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              <span>Waiting for photo from phone… (expires in 10 minutes)</span>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl mt-6 min-h-12 w-full border border-ink bg-white px-5 text-sm font-bold text-ink hover:bg-canvas"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
