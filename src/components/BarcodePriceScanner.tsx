'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, LoaderCircle, X, XCircle } from 'lucide-react';
import type { IScannerControls } from '@zxing/browser';
import { TRY_ON_MIN_PURCHASE } from '@/lib/maharaja/config';
import { prepareTagImage, readPriceOnDevice, warmUpDeviceOcr } from '@/lib/maharaja/device-ocr';

export type TagScanResult = { eligible: boolean; message?: string } | void;

function captureFrame(video: HTMLVideoElement) {
  const { videoWidth: width, videoHeight: height } = video;
  if (!width || !height) return '';
  const scale = Math.min(1, 1200 / width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.88);
}

/** Full-screen camera: take photo or scan → check ₹500+ → enter or reject. */
export default function BarcodePriceScanner({
  onDetected,
  onClose,
}: {
  onDetected: (payload: { barcode: string; format: string; printedText: string; image?: string }) => Promise<TagScanResult>;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const mountedRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastBarcodeRef = useRef<{ text: string; format: string; at: number } | null>(null);
  const [status, setStatus] = useState<'starting' | 'ready' | 'reading' | 'rejected' | 'error'>('starting');
  const [message, setMessage] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    // Load the on-device OCR engine while the camera starts.
    warmUpDeviceOcr().catch((error) => console.warn('On-device OCR unavailable:', error));

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 150 });
        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
          videoRef.current ?? undefined,
          (result) => {
            if (result) lastBarcodeRef.current = { text: result.getText(), format: String(result.getBarcodeFormat()), at: Date.now() };
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStatus('ready');
      } catch (error) {
        if (cancelled) return;
        console.error('Camera start failed:', error);
        setStatus('error');
        setMessage('Camera could not start. You can still tap "Take Photo" below or allow camera permissions.');
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, []);

  async function processImage(dataUrl: string) {
    if (!dataUrl) return;
    setStatus('reading');
    setMessage('');

    const seen = lastBarcodeRef.current;
    const barcode = seen && Date.now() - seen.at < 6000 ? seen : null;

    // 1. Read the printed MRP on the phone itself.
    let printedText = '';
    let localAmount: number | null = null;
    try {
      const local = await readPriceOnDevice(dataUrl);
      printedText = local.text;
      localAmount = local.amount;
    } catch (error) {
      console.warn('On-device OCR failed, falling back to server:', error);
    }
    if (!mountedRef.current) return;

    if (localAmount !== null && localAmount < TRY_ON_MIN_PURCHASE) {
      navigator.vibrate?.([150, 80, 150]);
      setStatus('rejected');
      setMessage(`₹${Math.round(localAmount)} — AI Try-On is for garments ₹${TRY_ON_MIN_PURCHASE} and above.`);
      return;
    }

    // 2. Server confirms the amount from the text (and issues the grant).
    //    A small image is sent only if the phone could not read a price.
    let result: TagScanResult;
    try {
      result = await onDetected({
        barcode: barcode?.text || '',
        format: barcode?.format || 'PRINTED_MRP',
        printedText,
        image: localAmount === null ? await prepareTagImage(dataUrl, 1024, 0.8) : undefined,
      });
    } catch {
      result = { eligible: false, message: 'Could not verify the tag. Please try again.' };
    }
    if (!mountedRef.current || result?.eligible) return;

    navigator.vibrate?.([150, 80, 150]);
    setStatus('rejected');
    setMessage(result?.message || 'Price not verified. Make sure the printed MRP (₹500+) is clearly visible and try again.');
  }

  async function scan() {
    const video = videoRef.current;
    if (!video || status === 'reading') return;
    const frame = captureFrame(video);
    if (!frame) return;
    await processImage(frame);
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        void processImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div id="mrp-scanner" role="dialog" aria-label="Scan price tag" className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-cover" />

      {/* Target frame */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="aspect-[3/4] w-[80%] max-w-sm rounded-xl border-4 border-[#F6D36A] shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close scanner"
        className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
      >
        <X className="h-6 w-6" />
      </button>

      <p className="relative z-10 mt-6 px-16 text-center text-sm font-bold drop-shadow">
        Keep the printed MRP tag inside the box
      </p>

      <div className="relative z-10 mt-auto flex flex-col items-center gap-3 p-6 pb-10">
        {status === 'rejected' && (
          <div className="flex w-full max-w-sm items-start gap-2 rounded-lg bg-red-700 p-3 text-sm font-bold shadow-lg">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0" /> <span>{message}</span>
          </div>
        )}
        {status === 'error' && (
          <div className="w-full max-w-sm rounded-lg bg-red-700 p-3 text-center text-sm font-bold shadow-lg">
            {message}
          </div>
        )}

        <div className="flex w-full max-w-sm flex-col gap-2">
          <button
            type="button"
            id="scan-mrp-btn"
            onClick={() => void scan()}
            disabled={status === 'reading'}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#F6D36A] text-sm font-black uppercase text-[#3A070D] shadow-lg active:scale-[0.98] disabled:opacity-60"
          >
            {status === 'starting' && <><LoaderCircle className="h-5 w-5 animate-spin" /> Camera Starting...</>}
            {status === 'reading' && <><LoaderCircle className="h-5 w-5 animate-spin" /> Analyzing MRP...</>}
            {(status === 'ready' || status === 'rejected' || status === 'error') && (
              <><Camera className="h-5 w-5" /> {status === 'rejected' ? 'Capture MRP Again' : 'Capture Price Tag'}</>
            )}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelected}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={status === 'reading'}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-white/40 bg-black/50 text-xs font-bold uppercase text-white hover:bg-black/70 disabled:opacity-60"
          >
            <ImageIcon className="h-4 w-4" /> Or Upload / Snap Photo
          </button>
        </div>
      </div>
    </div>
  );
}
