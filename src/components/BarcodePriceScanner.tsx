'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  FlipHorizontal,
  ImageIcon,
  LoaderCircle,
  RotateCcw,
  ScanLine,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import type { IScannerControls } from '@zxing/browser';
import { parseBarcodePrice } from '@/lib/maharaja/barcode-price';

interface BarcodePriceScannerProps {
  active: boolean;
  resetKey: number;
  onDetected: (payload: { barcode: string; format: string; printedText: string; amount?: number; image?: string }) => void;
  onClose?: () => void;
}

// In-build pleasant audio chime synthesized locally via Web Audio API (zero external assets needed)
function playSuccessBeep() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.08); // A5
    gain2.gain.setValueAtTime(0.16, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.28);
  } catch {
    // Ignore audio context errors if blocked by browser policy
  }
}

function captureVideoFrame(video: HTMLVideoElement): { dataUrl: string; canvas: HTMLCanvasElement } | null {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;
  const scale = Math.min(1, 1920 / width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.9),
    canvas,
  };
}

export default function BarcodePriceScanner({
  active,
  resetKey,
  onDetected,
  onClose,
}: BarcodePriceScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const detectedRef = useRef(false);

  const [cameraError, setCameraError] = useState('');
  const [starting, setStarting] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [recognizedCode, setRecognizedCode] = useState<string | null>(null);
  const [recognizedPrice, setRecognizedPrice] = useState<number | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [manualPriceInput, setManualPriceInput] = useState('');
  const [showPriceConfirm, setShowPriceConfirm] = useState(false);

  const stopScanner = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      // Ignore
    }
    controlsRef.current = null;
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleDetectedBarcode = useCallback(
    (code: string, formatName: string, frameDataUrl?: string) => {
      if (detectedRef.current) return;
      detectedRef.current = true;
      playSuccessBeep();
      navigator.vibrate?.([60, 40, 80]);

      const parsed = parseBarcodePrice(code);
      setRecognizedCode(code);
      if (frameDataUrl) setCapturedPhoto(frameDataUrl);

      // If price was successfully caught in the barcode/tag string
      if (parsed.amount !== null && parsed.amount >= 50) {
        setRecognizedPrice(parsed.amount);
        setAnalyzing(true);
        setTimeout(() => {
          stopScanner();
          onDetected({
            barcode: code,
            format: formatName,
            printedText: code,
            amount: parsed.amount ?? undefined,
            image: frameDataUrl,
          });
        }, 500);
      } else {
        // Tag SKU recognized without explicit price: prompt quick confirmation overlay
        setShowPriceConfirm(true);
      }
    },
    [onDetected, stopScanner]
  );

  const handleManualCapture = useCallback(async () => {
    if (!videoRef.current || detectedRef.current) return;
    const captured = captureVideoFrame(videoRef.current);
    if (!captured) return;

    setAnalyzing(true);
    setCapturedPhoto(captured.dataUrl);

    // Try decoding barcode client-side from the captured canvas
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      const result = reader.decodeFromCanvas(captured.canvas);
      if (result) {
        handleDetectedBarcode(result.getText(), result.getBarcodeFormat().toString(), captured.dataUrl);
        setAnalyzing(false);
        return;
      }
    } catch {
      // Barcode not detected on frame, proceed to quick price confirm or direct submission
    }

    setAnalyzing(false);
    detectedRef.current = true;
    setShowPriceConfirm(true);
  }, [handleDetectedBarcode]);

  const handleConfirmPrice = useCallback(() => {
    const val = Number(manualPriceInput.replace(/,/g, '').trim());
    if (!val || Number.isNaN(val) || val < 1) return;

    stopScanner();
    onDetected({
      barcode: recognizedCode || 'MANUAL_TAG_SCAN',
      format: 'RETAIL_TAG',
      printedText: manualPriceInput,
      amount: val,
      image: capturedPhoto || undefined,
    });
  }, [manualPriceInput, recognizedCode, capturedPhoto, onDetected, stopScanner]);

  const handleGalleryUpload = useCallback(
    async (file: File) => {
      stopScanner();
      setAnalyzing(true);
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        setCapturedPhoto(dataUrl);

        // Try decoding barcode client-side
        try {
          const img = new Image();
          img.src = dataUrl;
          await new Promise((res) => {
            img.onload = res;
          });
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || 800;
          canvas.height = img.naturalHeight || 800;
          canvas.getContext('2d')?.drawImage(img, 0, 0);

          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const zxReader = new BrowserMultiFormatReader();
          const result = zxReader.decodeFromCanvas(canvas);
          if (result) {
            handleDetectedBarcode(result.getText(), result.getBarcodeFormat().toString(), dataUrl);
            return;
          }
        } catch {
          // Fall through
        }

        setAnalyzing(false);
        detectedRef.current = true;
        setShowPriceConfirm(true);
      };
      reader.readAsDataURL(file);
    },
    [handleDetectedBarcode, stopScanner]
  );

  useEffect(() => {
    if (!active || !videoRef.current) return;
    let cancelled = false;
    detectedRef.current = false;
    setCameraError('');
    setStarting(true);
    setAnalyzing(false);
    setTorchOn(false);
    setHasTorch(false);
    setShowPriceConfirm(false);
    setRecognizedCode(null);
    setRecognizedPrice(null);
    setCapturedPhoto(null);

    async function startFullSizeCamera() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 80 });

        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          },
          videoRef.current || undefined,
          (result, error, scanControls) => {
            if (cancelled || detectedRef.current) return;
            if (result) {
              const codeText = result.getText();
              const formatStr = result.getBarcodeFormat().toString();
              const snap = videoRef.current ? captureVideoFrame(videoRef.current) : null;
              handleDetectedBarcode(codeText, formatStr, snap?.dataUrl);
            }
          }
        );

        if (cancelled) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;

        // Check torch capability
        if (videoRef.current?.srcObject instanceof MediaStream) {
          activeStreamRef.current = videoRef.current.srcObject;
          const track = activeStreamRef.current.getVideoTracks()[0];
          const caps = (track?.getCapabilities?.() as { torch?: boolean }) || {};
          setHasTorch(!!caps.torch);
        }

        setStarting(false);
      } catch (err: unknown) {
        if (cancelled) return;
        console.error('Full size camera start failed:', err);
        setStarting(false);
        setCameraError(
          'Live camera stream is unavailable. You can use the photo upload below to select or snap the garment tag.'
        );
      }
    }

    void startFullSizeCamera();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [active, facingMode, resetKey, handleDetectedBarcode, stopScanner]);

  async function toggleTorch() {
    if (!controlsRef.current?.switchTorch || !hasTorch) return;
    const next = !torchOn;
    try {
      await controlsRef.current.switchTorch(next);
      setTorchOn(next);
    } catch {
      setHasTorch(false);
    }
  }

  function toggleCameraFlip() {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  }

  return (
    <div
      id="full-size-mrp-camera-modal"
      className="fixed inset-0 z-50 flex flex-col justify-between bg-black text-white select-none overflow-hidden"
      role="dialog"
      aria-label="Full Size MRP and Barcode Scanner"
    >
      {/* 1. Header Bar */}
      <header className="relative z-20 flex items-center justify-between bg-gradient-to-b from-black/90 via-black/60 to-transparent p-4 text-[#F3E5AB]">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <div>
            <h2 className="font-serif text-sm font-bold tracking-wider text-[#F3E5AB] uppercase">
              Maharaja MRP Scanner
            </h2>
            <p className="text-[10px] text-zinc-300">Point at price tag (Min ₹500)</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasTorch && (
            <button
              type="button"
              onClick={() => void toggleTorch()}
              aria-label="Toggle flashlight"
              className={`flex h-10 w-10 items-center justify-center rounded-full border border-[#D4AF37]/40 bg-black/60 backdrop-blur transition ${
                torchOn ? 'text-amber-300 bg-[#D4AF37]/30' : 'text-[#F3E5AB]'
              }`}
            >
              <Zap className={`h-4 w-4 ${torchOn ? 'fill-current' : ''}`} />
            </button>
          )}

          <button
            type="button"
            onClick={toggleCameraFlip}
            aria-label="Switch camera"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D4AF37]/40 bg-black/60 text-[#F3E5AB] backdrop-blur hover:bg-black/80 transition"
          >
            <FlipHorizontal className="h-4 w-4" />
          </button>

          {onClose && (
            <button
              type="button"
              onClick={() => {
                stopScanner();
                onClose();
              }}
              aria-label="Close scanner"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D4AF37]/40 bg-black/60 text-[#F3E5AB] backdrop-blur hover:bg-red-950/70 hover:border-red-500 transition"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      {/* 2. Full-Size Viewfinder Area */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Viewfinder Reticle with Luxury Golden Corner Accents */}
        <div className="relative z-10 aspect-[3/4] w-[82%] max-w-sm rounded-xl overflow-hidden border border-[#D4AF37]/40 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]">
          {/* Golden Corner Accents */}
          <div className="absolute top-0 left-0 h-6 w-6 border-t-4 border-l-4 border-[#D4AF37] rounded-tl" />
          <div className="absolute top-0 right-0 h-6 w-6 border-t-4 border-r-4 border-[#D4AF37] rounded-tr" />
          <div className="absolute bottom-0 left-0 h-6 w-6 border-b-4 border-l-4 border-[#D4AF37] rounded-bl" />
          <div className="absolute bottom-0 right-0 h-6 w-6 border-b-4 border-r-4 border-[#D4AF37] rounded-br" />

          {/* Animated Scanning Laser Line */}
          {!starting && !analyzing && !showPriceConfirm && (
            <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-[#F3E5AB] to-transparent shadow-[0_0_12px_#D4AF37] animate-[pulse_1.8s_ease-in-out_infinite]"
                 style={{ top: '48%' }} />
          )}

          {/* Success Recognition Overlay */}
          {recognizedPrice !== null && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-950/80 backdrop-blur-sm text-center p-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-400 mb-2 animate-bounce" />
              <p className="font-serif text-lg font-bold text-white">Price Verified</p>
              <p className="mt-1 font-mono text-2xl font-black text-amber-300">₹{recognizedPrice}</p>
              <p className="mt-2 text-[11px] text-emerald-200">Starting Try-On experience...</p>
            </div>
          )}
        </div>

        {/* Instruction Banner */}
        <div className="pointer-events-none absolute bottom-5 inset-x-0 z-10 flex flex-col items-center gap-1.5 px-4 text-center">
          <div className="flex items-center gap-2 rounded-full border border-[#D4AF37]/40 bg-black/75 px-4 py-1.5 backdrop-blur-md">
            <ScanLine className="h-4 w-4 text-[#D4AF37] animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#F3E5AB]">
              Align Tag & Barcode inside Frame
            </span>
          </div>
          <span className="text-[11px] font-medium text-zinc-300">
            Auto-detects retail barcodes or tap Shutter to snap
          </span>
        </div>

        {/* Starting / Loading Spinner */}
        {starting && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/85 text-[#F3E5AB]">
            <LoaderCircle className="h-9 w-9 animate-spin text-[#D4AF37]" />
            <p className="text-xs font-bold uppercase tracking-wider">Opening Full Size Camera...</p>
          </div>
        )}

        {/* Analyzing Spinner */}
        {analyzing && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/85 text-[#F3E5AB]">
            <LoaderCircle className="h-9 w-9 animate-spin text-[#D4AF37]" />
            <p className="text-xs font-bold uppercase tracking-wider">Analyzing MRP & Tag...</p>
          </div>
        )}

        {/* Camera Permission Error Overlay */}
        {cameraError && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/95 p-6 text-center text-white">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-950/80 border border-amber-500/50 text-amber-300 mb-4">
              <Camera className="h-8 w-8" />
            </div>
            <h3 className="font-serif text-lg font-bold text-[#F3E5AB]">Camera Not Accessible</h3>
            <p className="mt-2 text-xs leading-5 text-zinc-300 max-w-xs">{cameraError}</p>

            <div className="mt-6 flex flex-col gap-3 w-full max-w-xs">
              <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-4 text-xs font-black uppercase text-black shadow-lg hover:brightness-105 transition">
                <ImageIcon className="h-4 w-4" /> Snap or Upload Tag Photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleGalleryUpload(f);
                  }}
                />
              </label>

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#D4AF37]/50 bg-black/40 text-xs font-bold uppercase text-[#F3E5AB] hover:bg-black/60 transition"
              >
                <RotateCcw className="h-4 w-4" /> Retry Camera Permission
              </button>
            </div>
          </div>
        )}

        {/* Quick Price Confirmation Overlay (When Tag SKU is detected but needs printed MRP input) */}
        {showPriceConfirm && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-6 text-center text-white">
            <div className="w-full max-w-sm rounded-xl border border-[#D4AF37] bg-[#1a0508] p-5 shadow-2xl">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[#D4AF37] mb-3">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="font-serif text-base font-bold text-[#F3E5AB] uppercase">
                Garment Tag Recognized
              </h3>
              {recognizedCode && (
                <p className="mt-1 font-mono text-xs text-amber-200 truncate">
                  Code: {recognizedCode}
                </p>
              )}
              <p className="mt-2 text-xs text-zinc-300">
                Confirm the printed MRP on this garment tag (Min ₹500):
              </p>

              <div className="mt-4 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-amber-300">₹</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="e.g. 1499"
                  value={manualPriceInput}
                  onChange={(e) => setManualPriceInput(e.target.value)}
                  className="w-full rounded-lg border border-[#D4AF37]/60 bg-black/60 py-3 pl-8 pr-4 text-center font-mono text-xl font-bold text-[#F3E5AB] placeholder-zinc-500 focus:border-[#D4AF37] focus:outline-none"
                  autoFocus
                />
              </div>

              {/* Quick Suggestion Chips */}
              <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
                {[599, 799, 999, 1499, 1999].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setManualPriceInput(String(amt))}
                    className="rounded border border-[#D4AF37]/40 bg-black/40 px-2.5 py-1 text-[11px] font-bold text-[#F3E5AB] hover:bg-[#D4AF37]/20 transition"
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPriceConfirm(false);
                    detectedRef.current = false;
                  }}
                  className="rounded-lg border border-[#D4AF37]/40 bg-black/40 py-2.5 text-xs font-bold uppercase text-zinc-300 hover:bg-black/60"
                >
                  Scan Again
                </button>
                <button
                  type="button"
                  disabled={!manualPriceInput || Number(manualPriceInput) < 50}
                  onClick={handleConfirmPrice}
                  className="rounded-lg bg-[#D4AF37] py-2.5 text-xs font-black uppercase text-black disabled:opacity-40 hover:brightness-105"
                >
                  Confirm MRP
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Bottom Control Bar */}
      <footer className="relative z-20 flex items-center justify-between bg-gradient-to-t from-black via-black/80 to-transparent px-6 py-6 text-white">
        {/* Gallery / File Picker Fallback */}
        <label
          className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-[#D4AF37]/40 bg-black/60 text-[#F3E5AB] backdrop-blur hover:bg-black/80 transition"
          aria-label="Upload from gallery"
          title="Upload from gallery"
        >
          <ImageIcon className="h-5 w-5" />
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.currentTarget.value = '';
              if (f) void handleGalleryUpload(f);
            }}
          />
        </label>

        {/* Large Luxury Gold Shutter Button */}
        <button
          type="button"
          onClick={() => void handleManualCapture()}
          disabled={starting || analyzing}
          aria-label="Capture and Read MRP"
          className="relative flex h-18 w-18 items-center justify-center rounded-full border-4 border-[#D4AF37] bg-white/10 p-1 shadow-[0_0_25px_rgba(212,175,55,0.4)] active:scale-95 transition disabled:opacity-50"
        >
          <div className="flex h-full w-full items-center justify-center rounded-full bg-[#D4AF37] text-black">
            <Camera className="h-7 w-7" />
          </div>
        </button>

        {/* Reset / Rescan Button */}
        <button
          type="button"
          onClick={() => {
            detectedRef.current = false;
            setShowPriceConfirm(false);
            setRecognizedCode(null);
            setRecognizedPrice(null);
          }}
          aria-label="Reset scanner"
          title="Reset scanner"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-[#D4AF37]/40 bg-black/60 text-[#F3E5AB] backdrop-blur hover:bg-black/80 transition"
        >
          <RotateCcw className="h-5 w-5" />
        </button>
      </footer>
    </div>
  );
}
