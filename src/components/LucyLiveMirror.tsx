'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  LoaderCircle,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Square,
  Tv,
  Video,
  X,
} from 'lucide-react';
import {
  catalogueCategories,
  formatINR,
  sampleCatalogue,
  type CatalogueCategoryId,
  type TryFocusProduct,
} from '@/lib/tryfocus/sample-data';

const LUCY_VTON_APP = 'decart/lucy2-vton/realtime';
const SESSION_SECONDS = 30;
const READY_COUNTDOWN_SECONDS = 3;
const CARDS_PER_PAGE = 4;

type LiveState =
  | 'idle'
  | 'camera_ready'
  | 'ready_countdown'
  | 'connecting'
  | 'live'
  | 'complete'
  | 'error';

export default function LucyLiveMirror({
  catalogue: propCatalogue,
  selectedProduct: externalProduct,
  onSelectProduct,
}: {
  catalogue?: TryFocusProduct[];
  garmentPrompt?: string;
  garmentTitle?: string;
  selectedProduct?: TryFocusProduct;
  onSelectProduct?: (product: TryFocusProduct) => void;
} = {}) {
  const activeCatalogue = propCatalogue && propCatalogue.length > 0 ? propCatalogue : sampleCatalogue;

  const [gender, setGender] = useState<'women' | 'men'>(externalProduct?.gender || 'women');
  const [category, setCategory] = useState<'new-arrivals' | CatalogueCategoryId>(
    externalProduct?.category || 'sarees'
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedGarment, setSelectedGarment] = useState<TryFocusProduct>(
    externalProduct || activeCatalogue[0]
  );
  const [state, setState] = useState<LiveState>('idle');
  const [readyCountdown, setReadyCountdown] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECONDS);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState(
    'Step 1: Open the mirror camera, choose a catalogue outfit, and tap Start 30s Live Try-On.'
  );
  const [completionModalOpen, setCompletionModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const timerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const selectedGarmentRef = useRef<TryFocusProduct>(activeCatalogue[0]);
  const paidTimerStartedRef = useRef(false);

  const visibleCategories = useMemo(
    () => catalogueCategories.filter((cat) => cat.gender === gender),
    [gender]
  );

  const categoryProducts = useMemo(() => {
    const byGender = activeCatalogue.filter((item) => item.gender === gender);
    if (category === 'new-arrivals') {
      const arrivals = byGender.filter(
        (item) => (item as any).newArrival === true || item.badge === 'NEW ARRIVAL'
      );
      return arrivals.length > 0 ? arrivals : byGender;
    }
    return byGender.filter((item) => item.category === category);
  }, [activeCatalogue, gender, category]);

  const totalPages = Math.max(1, Math.ceil(categoryProducts.length / CARDS_PER_PAGE));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const pagedProducts = useMemo(
    () =>
      categoryProducts.slice(
        safePageIndex * CARDS_PER_PAGE,
        (safePageIndex + 1) * CARDS_PER_PAGE
      ),
    [categoryProducts, safePageIndex]
  );

  useEffect(() => {
    selectedGarmentRef.current = selectedGarment;
  }, [selectedGarment]);

  // Generate QR for selected garment on completion
  useEffect(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.tryfocus.in';
    const url = `${origin}/maharaja/try-on?sku=${encodeURIComponent(selectedGarment.sku)}&source=live-mirror`;
    QRCode.toDataURL(url, {
      width: 240,
      margin: 1,
      color: { dark: '#161918', light: '#FAFBF8' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [selectedGarment]);

  useEffect(() => {
    return () => {
      stopEverything();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearSessionTimer() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function clearCountdownTimer() {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setReadyCountdown(null);
  }

  function closeRealtimeConnections() {
    clearSessionTimer();
    clearCountdownTimer();
    paidTimerStartedRef.current = false;
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        // ignore close errors
      }
      pcRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore close errors
      }
      wsRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }

  function stopEverything() {
    closeRealtimeConnections();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function enableCameraPreview() {
    setError('');
    try {
      if (!streamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 720 },
            height: { ideal: 1280 },
            frameRate: { ideal: 24, max: 30 },
          },
          audio: false,
        });
        streamRef.current = stream;
      }
      if (localVideoRef.current && streamRef.current) {
        localVideoRef.current.srcObject = streamRef.current;
        await localVideoRef.current.play().catch(() => undefined);
      }
      setState('camera_ready');
      setStatusMessage(
        'Camera preview is active. Select any outfit on the right, then tap Start 30s Live Try-On.'
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Camera permission is required for the Live AI Mirror.'
      );
      setState('error');
    }
  }

  async function garmentUrlToDataUri(imageUrl: string): Promise<string> {
    const response = await fetch(imageUrl, { cache: 'force-cache' });
    if (!response.ok) throw new Error('Unable to load selected garment reference image.');
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('Could not encode garment image.'));
      reader.onerror = () => reject(new Error('Could not read garment image.'));
      reader.readAsDataURL(blob);
    });
  }

  async function sendGarmentReference(ws: WebSocket, garment: TryFocusProduct) {
    if (ws.readyState !== WebSocket.OPEN) return;
    const referenceSource = garment.garmentReferenceUrl || garment.imageUrl;
    const imageDataUri = await garmentUrlToDataUri(referenceSource);
    const prompt = `Wear the exact ${garment.title} (${garment.fabricNote || garment.category}). Preserve exact garment color, border, zari and drape while keeping the customer's real face and skin tone natural.`;

    ws.send(
      JSON.stringify({
        type: 'set_image',
        image: imageDataUri,
        prompt,
        enhance_prompt: true,
      })
    );
  }

  function startPaidThirtySecondWindow() {
    if (paidTimerStartedRef.current) return;
    paidTimerStartedRef.current = true;
    setState('live');
    setSecondsLeft(SESSION_SECONDS);
    setStatusMessage(
      'AI Live Mirror is active! Move naturally or tap another outfit to switch instantly during your 30-second session.'
    );
    clearSessionTimer();
    timerRef.current = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          stopSession('complete');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function beginLiveCountdownAndConnect() {
    if (
      state === 'ready_countdown' ||
      state === 'connecting' ||
      state === 'live'
    ) {
      return;
    }
    setError('');
    setCompletionModalOpen(false);

    // Ensure camera preview is running first
    if (!streamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 720 },
            height: { ideal: 1280 },
            frameRate: { ideal: 24, max: 30 },
          },
          audio: false,
        });
        streamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          await localVideoRef.current.play().catch(() => undefined);
        }
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Camera permission is required for the Live AI Mirror.'
        );
        setState('error');
        return;
      }
    }

    // 3-2-1 Ready Countdown before initiating connection so customer can step back
    clearCountdownTimer();
    setState('ready_countdown');
    setReadyCountdown(READY_COUNTDOWN_SECONDS);
    setStatusMessage('Step back into full view. Connecting Live AI Mirror after 3-second pose countdown...');

    let remaining = READY_COUNTDOWN_SECONDS;
    countdownTimerRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearCountdownTimer();
        void startLucyLiveSession();
      } else {
        setReadyCountdown(remaining);
      }
    }, 1000);
  }

  async function startLucyLiveSession() {
    setError('');
    setCompletionModalOpen(false);
    closeRealtimeConnections();
    setState('connecting');
    setSecondsLeft(SESSION_SECONDS);
    setStatusMessage('Connecting to Live AI Mirror... Your 30s timer starts ONLY after AI video appears.');

    try {
      if (!streamRef.current) {
        await enableCameraPreview();
      }
      const stream = streamRef.current;
      if (!stream) {
        throw new Error('Camera feed is not ready.');
      }

      const tokenRes = await fetch('/api/fal/realtime-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: LUCY_VTON_APP }),
      });

      if (!tokenRes.ok) {
        const msg = await tokenRes.text().catch(() => '');
        throw new Error(msg || 'Live AI Mirror token service is unavailable.');
      }

      const token = (await tokenRes.text()).trim();
      const wsUrl = `wss://fal.run/${LUCY_VTON_APP}?fal_jwt_token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = pc;

      // Start the paid 30-second countdown ONLY when the remote AI video track is confirmed playing!
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.onplaying = () => {
            startPaidThirtySecondWindow();
          };
          remoteVideoRef.current
            .play()
            .then(() => {
              startPaidThirtySecondWindow();
            })
            .catch(() => undefined);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ice-candidate', candidate: event.candidate }));
        }
      };

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      ws.onopen = async () => {
        try {
          await sendGarmentReference(ws, selectedGarmentRef.current);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }));
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Unable to initialize Live AI Mirror stream.'
          );
          closeRealtimeConnections();
          setState('error');
        }
      };

      ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(typeof event.data === 'string' ? event.data : '{}');
          if ((message.type === 'answer' || message.sdp) && pc.signalingState !== 'stable') {
            await pc.setRemoteDescription(
              new RTCSessionDescription({
                type: 'answer',
                sdp: message.sdp || message.answer?.sdp,
              })
            );
          } else if (message.type === 'ice-candidate' && message.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
          } else if (message.type === 'error' || message.error) {
            throw new Error(message.error || message.message || 'Live AI Mirror reported an error.');
          }
        } catch {
          // non-JSON or signaling status frame
        }
      };

      ws.onerror = () => {
        closeRealtimeConnections();
        setState('error');
        setError(
          'Live AI Mirror stream could not connect. Camera preview remains available, or switch to AI Image Try-On.'
        );
      };

      ws.onclose = () => {
        if (!paidTimerStartedRef.current) {
          setState((current) => (current === 'connecting' ? 'error' : current));
          setError((prev) =>
            prev || 'Live AI Mirror connection closed before AI video output started.'
          );
        }
      };
    } catch (caught) {
      closeRealtimeConnections();
      setError(
        caught instanceof Error ? caught.message : 'Unable to start 30s Live AI Mirror.'
      );
      setState('error');
    }
  }

  function stopSession(nextState: LiveState = 'camera_ready') {
    closeRealtimeConnections();
    setState(nextState);
    if (nextState === 'complete') {
      setCompletionModalOpen(true);
      setStatusMessage(
        '30-second Live AI Mirror session complete. Start a new 30s session or scan the QR to continue on mobile.'
      );
    } else {
      setStatusMessage(
        'Live session stopped. Camera preview is ready whenever you want to start another 30s session.'
      );
    }
  }

  async function selectGarment(item: TryFocusProduct) {
    setSelectedGarment(item);
    selectedGarmentRef.current = item;
    onSelectProduct?.(item);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        await sendGarmentReference(wsRef.current, item);
        setStatusMessage(`Switched live outfit to ${item.title}.`);
      } catch {
        // keep current stream alive
      }
    }
  }

  const progressPercent = Math.max(
    0,
    Math.min(100, (secondsLeft / SESSION_SECONDS) * 100)
  );

  return (
    <div className="space-y-4">
      {/* Top Portrait Step Banner + Prominent 30-Second Progress Bar */}
      <div className="border-2 border-[#D8DCD7] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#7A1428]">
              Live AI Mirror · 30-Second Interactive Session
            </p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
              {state === 'live'
                ? `AI Live Stream Active — ${secondsLeft}s Remaining`
                : state === 'ready_countdown'
                  ? `Get Ready — Starting in ${readyCountdown}s...`
                  : state === 'connecting'
                    ? 'Connecting AI Live Stream (Timer Not Started Yet)...'
                    : 'Step 1: Open Camera · Step 2: Pick Outfit · Step 3: Start 30s Live Try-On'}
            </h2>
            <p className="mt-1 text-sm text-[#535A56]">{statusMessage}</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 border-2 border-[#161918] bg-[#FAFBF8] px-4 py-2.5 font-mono text-base font-bold text-[#161918]">
              <Clock className="h-5 w-5 text-[#7A1428]" />
              <span>
                00:{String(secondsLeft).padStart(2, '0')} / 00:{SESSION_SECONDS}
              </span>
            </div>

            {state === 'idle' ? (
              <button
                type="button"
                onClick={enableCameraPreview}
                className="inline-flex min-h-[60px] items-center gap-2.5 bg-[#161918] px-6 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-[#FAF6EE]"
              >
                <Camera className="h-5 w-5" />
                Step 1: Open Camera
              </button>
            ) : state === 'live' || state === 'connecting' || state === 'ready_countdown' ? (
              <button
                type="button"
                onClick={() => stopSession('camera_ready')}
                className="inline-flex min-h-[60px] items-center gap-2.5 border-2 border-[#B42318] bg-[#FEF3F2] px-6 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-[#B42318]"
              >
                <Square className="h-4 w-4" />
                Stop Session
              </button>
            ) : (
              <button
                type="button"
                onClick={beginLiveCountdownAndConnect}
                className="inline-flex min-h-[60px] items-center gap-2.5 bg-[#7A1428] px-6 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-[#FAF6EE]"
              >
                <Sparkles className="h-5 w-5" />
                Step 3: Start 30s Live Try-On
              </button>
            )}
          </div>
        </div>

        {/* Large Visual 30-Second Progress Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between font-mono text-xs font-bold uppercase tracking-[0.14em]">
            <span className={state === 'live' ? 'text-[#256B45]' : 'text-[#535A56]'}>
              {state === 'live'
                ? '● Paid 30s AI Output Confirmed & Running'
                : state === 'ready_countdown'
                  ? `● Pose Countdown (${readyCountdown}s) — Step Back Into Frame`
                  : state === 'connecting'
                    ? '● Waiting for AI Output Stream Before Starting 30s Timer'
                    : '○ 30s Timer Starts Only After AI Stream Connects'}
            </span>
            <span className="text-[#161918]">{secondsLeft}s left</span>
          </div>
          <div className="mt-2 h-4 w-full overflow-hidden border border-[#D8DCD7] bg-[#ECEEE9]">
            <div
              className={`h-full transition-all duration-500 ${
                state === 'live'
                  ? secondsLeft <= 8
                    ? 'bg-[#B42318]'
                    : 'bg-[#256B45]'
                  : state === 'connecting' || state === 'ready_countdown'
                    ? 'w-full animate-pulse bg-[#8A6A20]'
                    : 'bg-[#7A1428]'
              }`}
              style={
                state === 'connecting' || state === 'ready_countdown'
                  ? undefined
                  : { width: `${progressPercent}%` }
              }
            />
          </div>
        </div>
      </div>

      {/* Portrait Kiosk Main Area: Left Dominant Mirror Viewport + Right Paged Outfit Selector */}
      <div className="grid gap-4 grid-cols-[1.15fr_0.85fr]">
        {/* Mirror Viewport */}
        <div className="relative aspect-[9/16] w-full overflow-hidden border-2 border-[#D8DCD7] bg-[#161918]">
          {/* Local Camera Feed (Never labeled as AI output!) */}
          <video
            ref={localVideoRef}
            playsInline
            muted
            autoPlay
            className={`h-full w-full object-cover [transform:scaleX(-1)] ${
              state === 'live' ? 'opacity-20' : 'opacity-100'
            }`}
          />

          {/* Remote AI Try-On Stream */}
          <video
            ref={remoteVideoRef}
            playsInline
            muted
            autoPlay
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
              state === 'live' ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          />

          {/* Honest Status Badge */}
          <div className="absolute left-4 top-4 right-4 flex items-center justify-between gap-2">
            <span
              className={`px-3.5 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] ${
                state === 'live'
                  ? 'bg-[#256B45] text-white'
                  : state === 'connecting' || state === 'ready_countdown'
                    ? 'bg-[#8A6A20] text-white'
                    : state === 'error'
                      ? 'bg-[#B42318] text-white'
                      : 'bg-[#161918]/90 text-[#FAF6EE]'
              }`}
            >
              {state === 'live'
                ? `AI LIVE MIRROR · ${secondsLeft}s`
                : state === 'ready_countdown'
                  ? `GET READY · ${readyCountdown}s`
                  : state === 'connecting'
                    ? 'CONNECTING AI STREAM...'
                    : state === 'camera_ready'
                      ? 'CAMERA PREVIEW ONLY (NOT AI YET)'
                      : state === 'error'
                        ? 'AI STREAM UNAVAILABLE · CAMERA ONLY'
                        : 'CAMERA STANDBY'}
            </span>
            <span className="bg-white/95 px-3.5 py-2 font-mono text-xs font-bold text-[#161918]">
              {selectedGarment.sku} · {formatINR(selectedGarment.price)}
            </span>
          </div>

          {/* 3-2-1 Ready Countdown Overlay */}
          {state === 'ready_countdown' && readyCountdown !== null && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#161918]/55 p-6 text-center text-[#FAF6EE]">
              <p className="font-mono text-sm font-bold uppercase tracking-[0.22em] text-[#F3E5AB]">
                Move Back & Stand Full-Length
              </p>
              <div className="mt-4 flex h-32 w-32 items-center justify-center border-4 border-[#FAF6EE] bg-[#7A1428] font-serif text-7xl font-bold text-[#FAF6EE]">
                {readyCountdown}
              </div>
              <p className="mt-4 max-w-xs text-sm text-[#FAF6EE]/90">
                Starting your 30-second Live AI Try-On with{' '}
                <strong>{selectedGarment.title}</strong>...
              </p>
            </div>
          )}

          {/* Idle Overlay */}
          {state === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#161918]/85 p-8 text-center text-[#FAF6EE]">
              <Tv className="h-14 w-14 text-[#FAF6EE]" />
              <p className="mt-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#D8DCD7]">
                Step 1 of 3 · Mirror Camera
              </p>
              <h3 className="mt-2 font-serif text-3xl font-semibold">
                Stand in Front of the Standee
              </h3>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#D8DCD7]">
                Tap below to open the live camera preview first. Your 30-second AI session only begins when you start Step 3 and the AI stream is confirmed playing.
              </p>
              <button
                type="button"
                onClick={enableCameraPreview}
                className="mt-6 inline-flex min-h-[64px] items-center gap-3 bg-[#7A1428] px-8 py-4 text-sm font-bold uppercase tracking-[0.16em] text-[#FAF6EE]"
              >
                <Camera className="h-5 w-5" />
                Open Mirror Camera
              </button>
            </div>
          )}

          {/* Connecting Overlay */}
          {state === 'connecting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#161918]/75 p-8 text-center text-[#FAF6EE]">
              <LoaderCircle className="h-14 w-14 animate-spin text-[#FAF6EE]" />
              <p className="mt-4 font-serif text-2xl font-semibold">
                Preparing Your Live AI Garment...
              </p>
              <p className="mt-2 max-w-xs text-sm text-[#D8DCD7]">
                Loading <strong>{selectedGarment.title}</strong>. Your 30-second countdown will begin automatically once the AI video track starts playing.
              </p>
            </div>
          )}

          {/* Honest Error Banner (Never pretends raw camera is AI mirror) */}
          {state === 'error' && error && (
            <div className="absolute inset-x-4 bottom-24 border-2 border-[#B42318] bg-[#FEF3F2] p-4 text-[#B42318] shadow-xl">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0" />
                <div>
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.14em]">
                    AI Live Stream Not Active — Showing Ordinary Camera Preview
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[#161918]">{error}</p>
                  <button
                    type="button"
                    onClick={beginLiveCountdownAndConnect}
                    className="mt-3 inline-flex min-h-[48px] items-center gap-2 bg-[#7A1428] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#FAF6EE]"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Retry 30s Live AI Stream
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Bar Inside Mirror */}
          <div className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-3 border border-[#D8DCD7] bg-white/95 p-3.5">
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#7A1428]">
                Selected Outfit ({selectedGarment.audience})
              </p>
              <p className="truncate font-serif text-lg font-semibold text-[#161918]">
                {selectedGarment.title}
              </p>
            </div>
            {state === 'camera_ready' && (
              <button
                type="button"
                onClick={beginLiveCountdownAndConnect}
                className="shrink-0 min-h-[54px] bg-[#7A1428] px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-[#FAF6EE]"
              >
                Start 30s AI Live
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Step 2 Outfit Selector (Paged 4 Cards — No Nested Scroll) */}
        <aside className="flex flex-col justify-between border-2 border-[#D8DCD7] bg-[#FAFBF8] p-4">
          <div>
            <div className="border-b border-[#D8DCD7] pb-3">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#7A1428]">
                Step 2 · Instant Outfit Switcher
              </p>
              <h3 className="mt-1 font-serif text-xl font-semibold text-[#161918]">
                Tap Any Outfit Before or During Live Stream
              </h3>
            </div>

            {/* Women / Men Switch */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(['women', 'men'] as const).map((g) => {
                const active = gender === g;
                const firstCat =
                  catalogueCategories.find((c) => c.gender === g)?.id || 'sarees';
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      setGender(g);
                      setCategory(firstCat);
                      setPageIndex(0);
                      const firstItem = activeCatalogue.find(
                        (item) => item.category === firstCat
                      );
                      if (firstItem) void selectGarment(firstItem);
                    }}
                    className={`min-h-[54px] border-2 px-3 py-2.5 font-serif text-base font-semibold capitalize ${
                      active
                        ? 'border-[#161918] bg-[#161918] text-[#FAF6EE]'
                        : 'border-[#D8DCD7] bg-white text-[#161918]'
                    }`}
                  >
                    {g === 'women' ? 'Women' : 'Men'}
                  </button>
                );
              })}
            </div>

            {/* New Arrivals + Category Pills */}
            <div className="mt-2.5 grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setCategory('new-arrivals');
                  setPageIndex(0);
                }}
                className={`min-h-[48px] border px-2 py-2 text-[11px] font-bold uppercase tracking-[0.1em] ${
                  category === 'new-arrivals'
                    ? 'border-[#7A1428] bg-[#7A1428] text-[#FAF6EE]'
                    : 'border-[#D8DCD7] bg-white text-[#161918]'
                }`}
              >
                New Arrivals
              </button>
              {visibleCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setCategory(cat.id);
                    setPageIndex(0);
                    const first = activeCatalogue.find((item) => item.category === cat.id);
                    if (first) void selectGarment(first);
                  }}
                  className={`min-h-[48px] border px-2 py-2 text-xs font-bold uppercase tracking-[0.12em] ${
                    category === cat.id
                      ? 'border-[#7A1428] bg-[#7A1428] text-[#FAF6EE]'
                      : 'border-[#D8DCD7] bg-white text-[#161918]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* 4-Card Paged Grid (No Nested Scrollbar) */}
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {pagedProducts.map((item) => {
                const active = selectedGarment.id === item.id || selectedGarment.sku === item.sku;
                return (
                  <button
                    key={item.sku}
                    type="button"
                    onClick={() => selectGarment(item)}
                    className={`flex flex-col overflow-hidden border-2 text-left transition ${
                      active
                        ? 'border-[#7A1428] bg-white shadow-sm'
                        : 'border-[#D8DCD7] bg-white hover:border-[#161918]'
                    }`}
                  >
                    <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#ECEEE9]">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="h-full w-full object-cover object-top"
                      />
                      {active && (
                        <span className="absolute left-2 top-2 bg-[#7A1428] px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-white">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="line-clamp-1 font-serif text-sm font-semibold text-[#161918]">
                        {item.title}
                      </p>
                      <div className="mt-1 flex items-center justify-between font-mono text-xs">
                        <span className="font-bold text-[#7A1428]">
                          {formatINR(item.price)}
                        </span>
                        <span className="text-[10px] text-[#535A56]">{item.sku}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pager Controls */}
          <div className="mt-3 flex items-center justify-between border-t border-[#D8DCD7] pt-3">
            <button
              type="button"
              disabled={safePageIndex <= 0}
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              className="inline-flex min-h-[52px] items-center gap-1.5 border border-[#161918] bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#161918] disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>
            <span className="font-mono text-xs font-bold text-[#535A56]">
              Page {safePageIndex + 1} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePageIndex >= totalPages - 1}
              onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
              className="inline-flex min-h-[52px] items-center gap-1.5 border border-[#161918] bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#161918] disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </aside>
      </div>

      {/* 30-Second Session Completion Popup Modal */}
      {completionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#161918]/80 p-6">
          <div className="w-full max-w-xl border-2 border-[#161918] bg-[#FAFBF8] p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#D8DCD7] pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center bg-[#256B45] text-white">
                  <CheckCircle2 className="h-6 w-6" />
                </span>
                <div>
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#256B45]">
                    30-Second Live Session Completed
                  </p>
                  <h3 className="mt-1 font-serif text-3xl font-semibold text-[#161918]">
                    Loved How {selectedGarment.title} Looked?
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCompletionModalOpen(false)}
                className="flex h-12 w-12 items-center justify-center border border-[#D8DCD7] bg-white text-[#161918]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-[200px_1fr] sm:items-center">
              <div className="flex flex-col items-center border border-[#D8DCD7] bg-white p-3">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Continue on Mobile QR"
                    className="h-40 w-40 object-contain"
                  />
                ) : (
                  <QrCode className="h-24 w-24 text-[#161918]" />
                )}
                <span className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#7A1428]">
                  Scan to Save Outfit
                </span>
              </div>

              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-[#535A56]">
                  Your 30-second Live AI Mirror window has finished and the stream has been safely closed. Scan the QR to save{' '}
                  <strong>{selectedGarment.title}</strong> ({formatINR(selectedGarment.price)}) on your phone, or start another 30-second live session.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={beginLiveCountdownAndConnect}
                    className="inline-flex min-h-[56px] items-center gap-2 bg-[#7A1428] px-6 py-3 text-xs font-bold uppercase tracking-[0.16em] text-[#FAF6EE]"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Start Another 30s Live Session
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompletionModalOpen(false)}
                    className="inline-flex min-h-[56px] items-center gap-2 border border-[#161918] bg-white px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-[#161918]"
                  >
                    Back to Mirror
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
