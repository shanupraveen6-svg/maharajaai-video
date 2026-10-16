'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, LoaderCircle, X, XCircle } from 'lucide-react';
import type { IScannerControls } from '@zxing/browser';
import type { Worker } from 'tesseract.js';

export type TagScanResult = { eligible: boolean; message?: string } | void;

let ocrWorkerPromise: Promise<Worker> | null = null;

function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = import('tesseract.js').then(async ({ createWorker, PSM }) => {
      const worker = await createWorker('eng');
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      return worker;
    }).catch((error) => {
      ocrWorkerPromise = null;
      throw error;
    });
  }
  return ocrWorkerPromise;
}

function captureFrame(video: HTMLVideoElement) {
  const { videoWidth: width, videoHeight: height } = video;
  if (!width || !height) return '';
  const scale = Math.min(1, 1600 / width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
}

/** Full-screen camera: scan → check ₹500+ → enter or reject. */
export default function BarcodePriceScanner({
  onDetected,
  onClose,
}: {
  onDetected: (payload: { barcode: string; format: string; printedText: string }) => Promise<TagScanResult>;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const mountedRef = useRef(true);
  // Most recent barcode seen by the live decoder (used for duplicate detection only).
  const lastBarcodeRef = useRef<{ text: string; format: string; at: number } | null>(null);
  const [status, setStatus] = useState<'starting' | 'ready' | 'reading' | 'rejected' | 'error'>('starting');
  const [message, setMessage] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    void getOcrWorker().catch(() => undefined); // warm up OCR while the camera opens

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
        setMessage('Camera could not start. Allow camera access, then close and open the scanner again.');
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, []);

  async function scan() {
    const video = videoRef.current;
    if (!video || status === 'reading' || status === 'starting' || status === 'error') return;
    const frame = captureFrame(video);
    if (!frame) return;
    setStatus('reading');
    setMessage('');

    let printedText = '';
    try {
      const worker = await getOcrWorker();
      printedText = (await worker.recognize(frame)).data.text;
    } catch (error) {
      console.warn('MRP OCR failed:', error);
    }

    const seen = lastBarcodeRef.current;
    const barcode = seen && Date.now() - seen.at < 4000 ? seen : null;
    lastBarcodeRef.current = null;

    let result: TagScanResult;
    try {
      result = await onDetected({ barcode: barcode?.text || '', format: barcode?.format || 'PRINTED_MRP', printedText });
    } catch {
      result = { eligible: false, message: 'Could not verify the tag. Please try again.' };
    }
    if (!mountedRef.current || result?.eligible) return; // approved → parent moves to the next step

    navigator.vibrate?.([150, 80, 150]);
    setStatus('rejected');
    setMessage(result?.message || 'Price not read. Keep the printed MRP clearly inside the box and tap Scan again.');
  }

  return (
    <div id="mrp-scanner" role="dialog" aria-label="Scan price tag" className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-cover" />

      {/* Target box */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="aspect-[3/4] w-[80%] max-w-sm rounded-xl border-4 border-[#F6D36A] shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close scanner"
        className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white"
      >
        <X className="h-6 w-6" />
      </button>

      <p className="relative z-10 mt-6 px-16 text-center text-sm font-bold">Keep the full tag and MRP inside the box</p>

      <div className="relative z-10 mt-auto flex flex-col items-center gap-3 p-6 pb-10">
        {status === 'rejected' && (
          <div className="flex w-full max-w-sm items-start gap-2 rounded-lg bg-red-700 p-3 text-sm font-bold">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0" /> <span>{message}</span>
          </div>
        )}
        {status === 'error' && <div className="w-full max-w-sm rounded-lg bg-red-700 p-3 text-center text-sm font-bold">{message}</div>}

        <button
          type="button"
          id="scan-mrp-btn"
          onClick={() => void scan()}
          disabled={status === 'starting' || status === 'reading' || status === 'error'}
          className="flex min-h-16 w-full max-w-sm items-center justify-center gap-3 rounded-full bg-[#F6D36A] text-base font-black uppercase text-[#3A070D] shadow-lg active:scale-[0.98] disabled:opacity-60"
        >
          {status === 'starting' && <><LoaderCircle className="h-6 w-6 animate-spin" /> Opening camera</>}
          {status === 'reading' && <><LoaderCircle className="h-6 w-6 animate-spin" /> Checking price</>}
          {(status === 'ready' || status === 'rejected' || status === 'error') && <><Camera className="h-6 w-6" /> {status === 'rejected' ? 'Scan again' : 'Scan'}</>}
        </button>
      </div>
    </div>
  );
}
