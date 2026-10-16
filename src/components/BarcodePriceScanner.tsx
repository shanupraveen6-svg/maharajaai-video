'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, LoaderCircle, RotateCcw, ScanLine, Zap } from 'lucide-react';
import type { IScannerControls } from '@zxing/browser';
import type { Worker } from 'tesseract.js';

let ocrWorkerPromise: Promise<Worker> | null = null;

async function getOcrWorker() {
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
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return '';
  const scale = Math.min(1, 1600 / width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
}

export default function BarcodePriceScanner({
  active,
  resetKey,
  onDetected,
}: {
  active: boolean;
  resetKey: number;
  onDetected: (value: string, format: string, printedText: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const detectedRef = useRef(false);
  const [cameraError, setCameraError] = useState('');
  const [starting, setStarting] = useState(true);
  const [readingPrice, setReadingPrice] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const readCurrentFrame = useCallback(async (barcode = '', format = 'PRINTED_MRP', scannerControls?: IScannerControls) => {
    if (detectedRef.current || !videoRef.current) return;
    detectedRef.current = true;
    const frame = captureFrame(videoRef.current);
    scannerControls?.stop();
    controlsRef.current?.stop();
    navigator.vibrate?.(120);
    setStarting(false);
    setReadingPrice(true);
    let printedText = '';
    try {
      if (frame) {
        const worker = await getOcrWorker();
        const recognized = await worker.recognize(frame);
        printedText = recognized.data.text;
      }
    } catch (ocrError) {
      console.warn('Printed price OCR failed:', ocrError);
    } finally {
      setReadingPrice(false);
      onDetected(barcode, format, printedText);
    }
  }, [onDetected]);

  useEffect(() => {
    if (!active || !videoRef.current) return;
    let cancelled = false;
    detectedRef.current = false;
    setCameraError('');
    setStarting(true);
    setReadingPrice(false);
    setTorchOn(false);

    async function startScanner() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 100 });
        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' } } },
          videoRef.current || undefined,
          (result, error, scanControls) => {
            if (cancelled || detectedRef.current) return;
            if (result) {
              void readCurrentFrame(result.getText(), result.getBarcodeFormat().toString(), scanControls);
              return;
            }
            if (error && error.name !== 'NotFoundException') {
              console.warn('Barcode scan frame error:', error);
            }
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStarting(false);
      } catch (error) {
        if (cancelled) return;
        console.error('Barcode camera error:', error);
        setStarting(false);
        setCameraError('Camera could not start. Allow camera access and tap Try Camera Again.');
      }
    }

    void startScanner();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [active, readCurrentFrame, resetKey]);

  async function toggleTorch() {
    if (!controlsRef.current?.switchTorch) return;
    const next = !torchOn;
    try {
      await controlsRef.current.switchTorch(next);
      setTorchOn(next);
    } catch {
      setCameraError('Torch is not available on this device. Continue in good light.');
    }
  }

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-black">
      <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-[14%] border-2 border-[#F6D36A] shadow-[0_0_0_999px_rgba(0,0,0,0.38)]">
        <span className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse bg-[#F6D36A]" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 text-xs font-bold uppercase text-white">
        <ScanLine className="h-4 w-4 text-[#F6D36A]" /> Keep the full tag and MRP inside the frame
      </div>
      {starting && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/75 text-sm font-bold text-white">
          <LoaderCircle className="h-5 w-5 animate-spin text-[#F6D36A]" /> Starting camera
        </div>
      )}
      {readingPrice && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/75 text-sm font-bold text-white">
          <LoaderCircle className="h-5 w-5 animate-spin text-[#F6D36A]" /> Reading printed MRP
        </div>
      )}
      {cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-5 text-center text-white">
          <Camera className="h-8 w-8 text-[#F6D36A]" />
          <p className="mt-3 text-xs font-semibold leading-5">{cameraError}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 inline-flex items-center gap-2 border border-[#F6D36A] px-4 py-2 text-xs font-bold uppercase text-[#F6D36A]">
            <RotateCcw className="h-4 w-4" /> Try Camera Again
          </button>
        </div>
      )}
      {!starting && !cameraError && controlsRef.current?.switchTorch && (
        <button type="button" onClick={() => void toggleTorch()} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center bg-black/65 text-[#F6D36A]" aria-label="Toggle camera torch" title="Camera light">
          <Zap className={`h-5 w-5 ${torchOn ? 'fill-current' : ''}`} />
        </button>
      )}
      {!starting && !readingPrice && !cameraError && (
        <button type="button" onClick={() => void readCurrentFrame()} className="absolute bottom-10 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 bg-[#F6D36A] px-5 py-3 text-xs font-black uppercase text-[#3A070D] shadow-lg" aria-label="Read printed MRP">
          <Camera className="h-4 w-4" /> Read MRP
        </button>
      )}
    </div>
  );
}
