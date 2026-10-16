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
  XCircle,
  Zap,
} from 'lucide-react';
import type { IScannerControls } from '@zxing/browser';
import { parseBarcodePrice } from '@/lib/maharaja/barcode-price';
import { TRY_ON_MIN_PURCHASE } from '@/lib/maharaja/config';

interface BarcodePriceScannerProps {
  active: boolean;
  resetKey: number;
  onDetected: (payload: {
    barcode: string;
    format: string;
    printedText: string;
    amount?: number;
    image?: string;
  }) => Promise<{ success: boolean; eligible?: boolean; isDuplicate?: boolean; message?: string } | void>;
  onClose?: () => void;
}

// In-build high-pitch pleasant chime for ENTER / APPROVED
function playEnterChime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.16, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.08); // A5
    gain2.gain.setValueAtTime(0.2, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.32);
  } catch {
    // Ignore audio context errors
  }
}

// In-build low double buzz for REJECT
function playRejectBuzz() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.setValueAtTime(110, now + 0.12);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  } catch {
    // Ignore audio context errors
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
  const isEvaluatingRef = useRef(false);

  const [cameraError, setCameraError] = useState('');
  const [starting, setStarting] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // Live decision state: 'idle' | 'evaluating' | 'enter' | 'reject'
  const [decisionState, setDecisionState] = useState<'idle' | 'evaluating' | 'enter' | 'reject'>('idle');
  const [decisionMessage, setDecisionMessage] = useState('');
  const [detectedPrice, setDetectedPrice] = useState<number | null>(null);
  const [liveTagCode, setLiveTagCode] = useState<string | null>(null);

  // Quick price entry input
  const [showManualInput, setShowManualInput] = useState(false);
  const [customPriceVal, setCustomPriceVal] = useState('');

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

  const resetDecisionToIdle = useCallback(() => {
    isEvaluatingRef.current = false;
    setDecisionState('idle');
    setDecisionMessage('');
    setDetectedPrice(null);
    setShowManualInput(false);
  }, []);

  // Quick Catch & Evaluate (Enter vs Reject)
  const evaluatePriceAndSubmit = useCallback(
    async (price: number, codeStr = '', formatStr = 'RETAIL_TAG', frameImage?: string) => {
      if (isEvaluatingRef.current) return;
      isEvaluatingRef.current = true;
      setDetectedPrice(price);

      // Instant Client-Side Pre-Check: If price < 500, REJECT immediately!
      if (price < TRY_ON_MIN_PURCHASE) {
        playRejectBuzz();
        navigator.vibrate?.([200, 100, 200]);
        setDecisionState('reject');
        setDecisionMessage(
          `₹${price} is below ₹${TRY_ON_MIN_PURCHASE} minimum. AI Try-On requires garments above ₹${TRY_ON_MIN_PURCHASE}.`
        );

        // Auto-rearm in 2.5 seconds so shopper can point to another tag
        setTimeout(() => {
          resetDecisionToIdle();
        }, 2500);
        return;
      }

      // If price >= 500: Pre-approve ENTER!
      setDecisionState('evaluating');
      setDecisionMessage(`₹${price} detected · Verifying tag...`);

      try {
        const result = await onDetected({
          barcode: codeStr || liveTagCode || `TAG_${price}`,
          format: formatStr,
          printedText: String(price),
          amount: price,
          image: frameImage,
        });

        if (result && result.eligible === false) {
          // Server rejected (e.g. duplicate tag used by another shopper)
          playRejectBuzz();
          navigator.vibrate?.([200, 100, 200]);
          setDecisionState('reject');
          setDecisionMessage(result.message || 'Garment tag rejected. Please scan an unredeemed tag.');
          setTimeout(() => {
            resetDecisionToIdle();
          }, 2800);
          return;
        }

        // Successfully verified ENTER
        playEnterChime();
        navigator.vibrate?.([60, 40, 80]);
        setDecisionState('enter');
        setDecisionMessage(`Approved (₹${price}) · Entering Try-On`);

        setTimeout(() => {
          stopScanner();
          if (onClose) onClose();
        }, 650);
      } catch (err: unknown) {
        playRejectBuzz();
        setDecisionState('reject');
        setDecisionMessage(err instanceof Error ? err.message : 'Verification failed. Try again.');
        setTimeout(() => {
          resetDecisionToIdle();
        }, 2500);
      }
    },
    [liveTagCode, onDetected, onClose, resetDecisionToIdle, stopScanner]
  );

  const handleDetectedBarcode = useCallback(
    (code: string, formatName: string, frameDataUrl?: string) => {
      if (isEvaluatingRef.current) return;
      setLiveTagCode(code);

      const parsed = parseBarcodePrice(code);
      if (parsed.amount !== null && parsed.amount > 0) {
        // Price caught automatically from barcode!
        void evaluatePriceAndSubmit(parsed.amount, code, formatName, frameDataUrl);
      } else {
        // Barcode detected (e.g. standard store SKU): subtle tick to let shopper know it's caught
        navigator.vibrate?.(30);
      }
    },
    [evaluatePriceAndSubmit]
  );

  // Manual Shutter Press: Captures frame, decodes barcode if present, or prompts price
  const handleManualCapture = useCallback(async () => {
    if (!videoRef.current || isEvaluatingRef.current) return;
    const captured = captureVideoFrame(videoRef.current);
    if (!captured) return;

    // Try decoding barcode client-side
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      const result = reader.decodeFromCanvas(captured.canvas);
      if (result) {
        handleDetectedBarcode(result.getText(), result.getBarcodeFormat().toString(), captured.dataUrl);
        return;
      }
    } catch {
      // Barcode not decoded on canvas
    }

    // If no embedded price found, highlight quick price choices
    setShowManualInput(true);
  }, [handleDetectedBarcode]);

  // Gallery Upload
  const handleGalleryUpload = useCallback(
    async (file: File) => {
      if (isEvaluatingRef.current) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
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
        setShowManualInput(true);
      };
      reader.readAsDataURL(file);
    },
    [handleDetectedBarcode]
  );

  useEffect(() => {
    if (!active || !videoRef.current) return;
    let cancelled = false;
    isEvaluatingRef.current = false;
    setCameraError('');
    setStarting(true);
    setDecisionState('idle');
    setDecisionMessage('');
    setLiveTagCode(null);
    setShowManualInput(false);

    async function startScanner() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.CODE_128,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.CODE_39,
          BarcodeFormat.UPC_A,
          BarcodeFormat.EAN_8,
          BarcodeFormat.ITF,
          BarcodeFormat.DATA_MATRIX,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        // Scan interval 25ms (~40 checks/sec) for instantaneous catch
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 25 });

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
          (result) => {
            if (cancelled || isEvaluatingRef.current) return;
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
        setCameraError('Camera stream not accessible. Use photo upload below.');
      }
    }

    void startScanner();

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

  return (
    <div
      id="full-size-mrp-camera-modal"
      className="fixed inset-0 z-50 flex flex-col justify-between bg-black text-white select-none overflow-hidden"
      role="dialog"
      aria-label="Full Size MRP Scanner - Quick Enter and Reject"
    >
      {/* 1. Header Bar */}
      <header className="relative z-20 flex items-center justify-between bg-gradient-to-b from-black/95 via-black/70 to-transparent p-4 text-[#F3E5AB]">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-2.5 w-2.5 rounded-full ${
              decisionState === 'enter'
                ? 'bg-emerald-400'
                : decisionState === 'reject'
                ? 'bg-red-500'
                : 'bg-emerald-400 animate-pulse'
            }`}
          />
          <div>
            <h2 className="font-serif text-sm font-bold tracking-wider text-[#F3E5AB] uppercase">
              Maharaja MRP Scanner
            </h2>
            <p className="text-[10px] text-zinc-300">
              Min ₹{TRY_ON_MIN_PURCHASE} · Instant Enter & Reject
            </p>
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
            onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
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
        <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-cover" />

        {/* Viewfinder Target Frame */}
        <div
          className={`relative z-10 aspect-[3/4] w-[84%] max-w-sm rounded-xl overflow-hidden border-2 transition-all duration-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] ${
            decisionState === 'enter'
              ? 'border-emerald-400 ring-4 ring-emerald-500/50'
              : decisionState === 'reject'
              ? 'border-red-500 ring-4 ring-red-500/50'
              : 'border-[#D4AF37]/50'
          }`}
        >
          {/* Corner Brackets */}
          <div
            className={`absolute top-0 left-0 h-6 w-6 border-t-4 border-l-4 rounded-tl ${
              decisionState === 'enter'
                ? 'border-emerald-400'
                : decisionState === 'reject'
                ? 'border-red-500'
                : 'border-[#D4AF37]'
            }`}
          />
          <div
            className={`absolute top-0 right-0 h-6 w-6 border-t-4 border-r-4 rounded-tr ${
              decisionState === 'enter'
                ? 'border-emerald-400'
                : decisionState === 'reject'
                ? 'border-red-500'
                : 'border-[#D4AF37]'
            }`}
          />
          <div
            className={`absolute bottom-0 left-0 h-6 w-6 border-b-4 border-l-4 rounded-bl ${
              decisionState === 'enter'
                ? 'border-emerald-400'
                : decisionState === 'reject'
                ? 'border-red-500'
                : 'border-[#D4AF37]'
            }`}
          />
          <div
            className={`absolute bottom-0 right-0 h-6 w-6 border-b-4 border-r-4 rounded-br ${
              decisionState === 'enter'
                ? 'border-emerald-400'
                : decisionState === 'reject'
                ? 'border-red-500'
                : 'border-[#D4AF37]'
            }`}
          />

          {/* Animated Laser Scanning Line */}
          {decisionState === 'idle' && !starting && (
            <div
              className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-[#F3E5AB] to-transparent shadow-[0_0_12px_#D4AF37] animate-[pulse_1.6s_ease-in-out_infinite]"
              style={{ top: '48%' }}
            />
          )}

          {/* Tag Live Detected Pill */}
          {liveTagCode && decisionState === 'idle' && (
            <div className="absolute top-3 inset-x-3 flex items-center justify-center">
              <span className="rounded-full bg-black/85 border border-amber-400/60 px-3 py-1 text-[10px] font-mono font-bold text-amber-300 truncate max-w-[90%] shadow-lg">
                Tag: {liveTagCode}
              </span>
            </div>
          )}

          {/* DECISION OVERLAYS */}
          {/* A. ENTER APPROVED OVERLAY */}
          {decisionState === 'enter' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-950/90 backdrop-blur-md p-5 text-center text-white animate-in fade-in zoom-in-95 duration-200">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 border-2 border-emerald-400 text-emerald-300 mb-3 animate-bounce">
                <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              </div>
              <span className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-black uppercase tracking-wider text-black">
                ENTER APPROVED
              </span>
              <p className="mt-3 font-mono text-3xl font-black text-[#F3E5AB]">
                ₹{detectedPrice}
              </p>
              <p className="mt-2 text-xs font-semibold text-emerald-200">{decisionMessage}</p>
            </div>
          )}

          {/* B. REJECTED OVERLAY */}
          {decisionState === 'reject' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/95 backdrop-blur-md p-5 text-center text-white animate-in fade-in zoom-in-95 duration-200">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 border-2 border-red-500 text-red-400 mb-3 animate-pulse">
                <XCircle className="h-10 w-10 text-red-400" />
              </div>
              <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-black uppercase tracking-wider text-white">
                REJECTED
              </span>
              {detectedPrice !== null && (
                <p className="mt-2 font-mono text-2xl font-black text-red-300 line-through">
                  ₹{detectedPrice}
                </p>
              )}
              <p className="mt-2 text-xs font-semibold leading-5 text-red-200 max-w-xs">
                {decisionMessage}
              </p>
              <button
                type="button"
                onClick={resetDecisionToIdle}
                className="mt-4 rounded-lg border border-red-400 bg-red-900/60 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-red-800 transition"
              >
                Scan Another Tag
              </button>
            </div>
          )}

          {/* C. EVALUATING SPINNER OVERLAY */}
          {decisionState === 'evaluating' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm p-4 text-center text-[#F3E5AB]">
              <LoaderCircle className="h-10 w-10 animate-spin text-[#D4AF37] mb-2" />
              <p className="text-xs font-black uppercase tracking-wider">{decisionMessage}</p>
            </div>
          )}
        </div>

        {/* Loading Camera */}
        {starting && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/90 text-[#F3E5AB]">
            <LoaderCircle className="h-9 w-9 animate-spin text-[#D4AF37]" />
            <p className="text-xs font-bold uppercase tracking-wider">Starting Quick Scanner...</p>
          </div>
        )}

        {/* Camera Error / Permission Blocked */}
        {cameraError && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/95 p-6 text-center text-white">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-950/80 border border-amber-500/50 text-amber-300 mb-4">
              <Camera className="h-8 w-8" />
            </div>
            <h3 className="font-serif text-lg font-bold text-[#F3E5AB]">Camera Not Accessible</h3>
            <p className="mt-2 text-xs leading-5 text-zinc-300 max-w-xs">{cameraError}</p>

            <div className="mt-6 flex flex-col gap-3 w-full max-w-xs">
              <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-4 text-xs font-black uppercase text-black shadow-lg hover:brightness-105 transition">
                <ImageIcon className="h-4 w-4" /> Upload Tag Photo
                <input
                  type="file"
                  accept="image/*"
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
                <RotateCcw className="h-4 w-4" /> Retry Permission
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. ALWAYS-ON QUICK-CATCH ACTION STRIP (Bottom HUD) */}
      <footer className="relative z-20 flex flex-col gap-3 bg-gradient-to-t from-black via-black/95 to-black/50 px-4 py-4 text-white">
        {/* Quick Price Buttons: 1-Tap Enter or Reject */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center justify-between w-full max-w-md text-[11px] font-bold text-zinc-300 px-1">
            <span className="flex items-center gap-1 text-[#D4AF37]">
              <Sparkles className="h-3.5 w-3.5" /> Quick Catch Price:
            </span>
            <span className="text-[10px] text-zinc-400">Tap to instantly Enter/Reject</span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto w-full max-w-md py-1 no-scrollbar justify-center flex-wrap sm:flex-nowrap">
            {[599, 799, 999, 1499, 1999, 2999].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => void evaluatePriceAndSubmit(amt, liveTagCode || `TAG_${amt}`)}
                className="rounded-lg border border-[#D4AF37]/60 bg-black/60 px-3 py-2 text-xs font-black text-[#F3E5AB] hover:bg-[#D4AF37] hover:text-black active:scale-95 transition shadow"
              >
                ₹{amt}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setShowManualInput((prev) => !prev)}
              className="rounded-lg border border-amber-400/80 bg-[#D4AF37]/20 px-3 py-2 text-xs font-black uppercase text-amber-300 hover:bg-[#D4AF37] hover:text-black active:scale-95 transition"
            >
              + Other MRP
            </button>
          </div>
        </div>

        {/* Custom Price Keypad Drawer */}
        {showManualInput && (
          <div className="w-full max-w-md mx-auto rounded-xl border border-[#D4AF37] bg-[#1a0508] p-3 shadow-2xl animate-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#F3E5AB]">Enter Printed MRP Amount:</span>
              <button
                type="button"
                onClick={() => setShowManualInput(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-amber-300">₹</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="e.g. 1299"
                  value={customPriceVal}
                  onChange={(e) => setCustomPriceVal(e.target.value)}
                  className="w-full rounded-lg border border-[#D4AF37]/60 bg-black/80 py-2.5 pl-8 pr-3 font-mono text-base font-bold text-[#F3E5AB] focus:outline-none"
                  autoFocus
                />
              </div>
              <button
                type="button"
                disabled={!customPriceVal || Number(customPriceVal) < 1}
                onClick={() => {
                  const val = Number(customPriceVal.replace(/,/g, '').trim());
                  if (val > 0) {
                    void evaluatePriceAndSubmit(val, liveTagCode || `MANUAL_TAG_${val}`);
                  }
                }}
                className="rounded-lg bg-[#D4AF37] px-4 py-2.5 text-xs font-black uppercase text-black disabled:opacity-40 hover:brightness-105 transition"
              >
                Submit
              </button>
            </div>
          </div>
        )}

        {/* Bottom Bar Controls: Gallery / Shutter / Reset */}
        <div className="flex items-center justify-between w-full max-w-md mx-auto pt-1">
          {/* Gallery Upload */}
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

          {/* Shutter Button */}
          <button
            type="button"
            onClick={() => void handleManualCapture()}
            disabled={starting || decisionState !== 'idle'}
            aria-label="Snap Tag Photo"
            className="relative flex h-18 w-18 items-center justify-center rounded-full border-4 border-[#D4AF37] bg-white/10 p-1 shadow-[0_0_25px_rgba(212,175,55,0.4)] active:scale-95 transition disabled:opacity-50"
          >
            <div className="flex h-full w-full items-center justify-center rounded-full bg-[#D4AF37] text-black">
              <Camera className="h-7 w-7" />
            </div>
          </button>

          {/* Reset Rescan */}
          <button
            type="button"
            onClick={resetDecisionToIdle}
            aria-label="Reset scanner"
            title="Reset scanner"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-[#D4AF37]/40 bg-black/60 text-[#F3E5AB] backdrop-blur hover:bg-black/80 transition"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
        </div>
      </footer>
    </div>
  );
}
