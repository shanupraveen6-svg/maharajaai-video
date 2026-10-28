'use client';

import { fal } from '@fal-ai/client';
import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, LoaderCircle, Play, RefreshCw, Square, Video } from 'lucide-react';
import {
  catalogueCategories,
  formatINR,
  sampleCatalogue,
  type CatalogueCategoryId,
  type TryFocusProduct,
} from '@/lib/tryfocus/sample-data';

const LUCY_VTON_APP = 'decart/lucy2-vton/realtime';
type Signal = { type?: string; sdp?: string; candidate?: RTCIceCandidateInit; iceServers?: RTCIceServer[] };
type RealtimeConnection = { send(input: Record<string, unknown>): void; close(): void };

type Props = {
  garmentPrompt?: string;
  garmentTitle?: string;
  selectedProduct?: TryFocusProduct;
  onSelectProduct?: (product: TryFocusProduct) => void;
};

type MirrorState = 'select_dress' | 'camera_ready' | 'connecting' | 'live' | 'completed' | 'error';

const LIVE_DURATION_SECONDS = 30;

export default function LucyLiveMirror({
  garmentPrompt,
  garmentTitle,
  selectedProduct,
  onSelectProduct,
}: Props) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const liveDeadlineRef = useRef(0);
  const connectionTimeoutRef = useRef<number | null>(null);

  const [genderFilter, setGenderFilter] = useState<'women' | 'men'>(selectedProduct?.gender || 'women');
  const [activeCategory, setActiveCategory] = useState<CatalogueCategoryId>(selectedProduct?.category || 'sarees');
  const [internalProduct, setInternalProduct] = useState<TryFocusProduct>(
    selectedProduct || sampleCatalogue[0]
  );

  const currentProduct = selectedProduct || internalProduct;

  const [state, setState] = useState<MirrorState>('select_dress');
  const [secondsLeft, setSecondsLeft] = useState(LIVE_DURATION_SECONDS);
  const [error, setError] = useState('');
  const [liveModeNote, setLiveModeNote] = useState('');

  useEffect(() => {
    if (selectedProduct) {
      setInternalProduct(selectedProduct);
      setGenderFilter(selectedProduct.gender);
      setActiveCategory(selectedProduct.category);
    }
  }, [selectedProduct]);

  useEffect(() => {
    if (state !== 'live') return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((liveDeadlineRef.current - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) stopLiveSession('completed');
    }, 250);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => { void turnOnCamera(); }, []);
  useEffect(() => () => stopAllMedia(), []);

  function stopAllMedia() {
    if (connectionTimeoutRef.current !== null) window.clearTimeout(connectionTimeoutRef.current);
    connectionTimeoutRef.current = null;
    try {
      connectionRef.current?.close();
    } catch {
      // Ignore close race
    }
    connectionRef.current = null;
    try {
      peerRef.current?.close();
    } catch {
      // Ignore peer close race
    }
    peerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function stopLiveSession(nextState: MirrorState = 'camera_ready') {
    if (connectionTimeoutRef.current !== null) window.clearTimeout(connectionTimeoutRef.current);
    connectionTimeoutRef.current = null;
    liveDeadlineRef.current = 0;
    try {
      connectionRef.current?.close();
    } catch {
      // Ignore close error
    }
    connectionRef.current = null;
    try {
      peerRef.current?.close();
    } catch {
      // Ignore peer error
    }
    peerRef.current = null;
    setState(nextState);
  }

  async function ensurePeer(iceServers?: RTCIceServer[]) {
    if (peerRef.current) return peerRef.current;
    const pc = new RTCPeerConnection(iceServers?.length ? { iceServers } : undefined);
    const stream = streamRef.current;
    stream?.getTracks().forEach((track) => pc.addTrack(track, stream));
    pc.ontrack = async (event) => {
      if (liveDeadlineRef.current > 0) return;
      const output = event.streams[0];
      if (!remoteVideoRef.current || !output?.getVideoTracks().length) return;
      remoteVideoRef.current.srcObject = output;
      try {
        await remoteVideoRef.current.play();
        if (connectionTimeoutRef.current !== null) window.clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
        liveDeadlineRef.current = Date.now() + LIVE_DURATION_SECONDS * 1000;
        setSecondsLeft(LIVE_DURATION_SECONDS);
        setState('live');
        setLiveModeNote('Lucy Live AI output active. Your 30-second session has started.');
      } catch {
        stopLiveSession('error');
        setError('The AI stream connected but could not play. Please retry.');
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        stopLiveSession('error');
        setError('The AI mirror stream disconnected. No further live time is running.');
      }
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        connectionRef.current?.send({ type: 'candidate', candidate: event.candidate.toJSON() });
      }
    };
    peerRef.current = pc;
    return pc;
  }

  async function handleSignal(signal: Signal) {
    const pc = await ensurePeer(signal.iceServers);
    if (signal.type === 'offer' && signal.sdp) {
      await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      connectionRef.current?.send({ type: 'answer', sdp: answer.sdp });
    } else if (signal.type === 'candidate' && signal.candidate) {
      await pc.addIceCandidate(signal.candidate);
    }
  }

  async function turnOnCamera() {
    setError('');
    setLiveModeNote('');
    stopAllMedia();

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access requires HTTPS or localhost on a camera-enabled PC/TV.');
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 25 },
        },
      });
      streamRef.current = mediaStream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = mediaStream;
        await localVideoRef.current.play().catch(() => undefined);
      }
      setLiveModeNote('Step 2 complete: Camera preview is active. Click Step 3 to start the 30s Live AI Try-On.');
      setState('camera_ready');
    } catch (err: unknown) {
      stopAllMedia();
      setError(err instanceof Error ? err.message : 'Unable to turn on PC/TV camera.');
      setState('error');
    }
  }

  async function start30sLiveTryOn() {
    if (state === 'connecting' || state === 'live') return;
    setError('');
    setLiveModeNote('');
    setSecondsLeft(LIVE_DURATION_SECONDS);

    if (!streamRef.current) {
      await turnOnCamera();
    }
    const activeStream = streamRef.current;
    if (!activeStream) return;

    setState('connecting');

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://tryfocus.in';
      const refImageUrl = currentProduct.imageUrl.startsWith('http')
        ? currentProduct.imageUrl
        : `${origin}${currentProduct.imageUrl}`;

      const realtime = fal.realtime.connect<Record<string, unknown>, Signal>(LUCY_VTON_APP, {
        clientOnly: true,
        connectionKey: 'tryfocus-lucy-live-mirror',
        tokenExpirationSeconds: 60,
        tokenProvider: async (app) => {
          const response = await fetch('/api/fal/realtime-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ app }),
          });
          if (!response.ok) throw new Error(await response.text());
          return response.text();
        },
        onResult: (result) => {
          void handleSignal(result);
        },
        onError: () => {
          if (!connectionRef.current) return;
          stopLiveSession('error');
          setError('Lucy AI mirror is unavailable. Camera preview is still separate from the AI result.');
        },
      });

      connectionRef.current = realtime;
      realtime.send({
        prompt:
          garmentPrompt ||
          `Replace the customer’s visible outfit with the garment in the reference image: ${currentProduct.title} (${currentProduct.fabricNote}). Preserve the customer’s identity, body proportions, natural motion, hands, background and lighting.`,
        reference_image_url: refImageUrl,
      });

      connectionTimeoutRef.current = window.setTimeout(() => {
        if (liveDeadlineRef.current === 0) {
          stopLiveSession('error');
          setError('AI output did not arrive in time. Please retry. No live session started.');
        }
      }, 20_000);
      setLiveModeNote('Connecting to Lucy AI. The 30-second timer starts when the AI image appears.');
    } catch (caught) {
      stopLiveSession('error');
      setError(caught instanceof Error ? caught.message : 'Unable to start Lucy Live AI Try-On.');
    }
  }

  const filteredCategories = catalogueCategories.filter((cat) => cat.gender === genderFilter);
  const categoryProducts = sampleCatalogue.filter((item) => item.category === activeCategory);

  function handleSelectDress(item: TryFocusProduct) {
    setInternalProduct(item);
    onSelectProduct?.(item);
    if (state === 'live' && connectionRef.current) {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://tryfocus.in';
      const refImageUrl = item.imageUrl.startsWith('http') ? item.imageUrl : `${origin}${item.imageUrl}`;
      connectionRef.current.send({
        prompt: `Replace the customer’s visible outfit with the garment in the reference image: ${item.title} (${item.fabricNote}). Preserve the customer’s identity, body proportions, natural motion, hands, background and lighting.`,
        reference_image_url: refImageUrl,
      });
    }
  }

  return (
    <div className="tv-live-layout grid gap-6 lg:grid-cols-[420px_1fr]">
      {/* Left Column: Step 1 - Select Dress from Catalogue */}
      <div className="flex flex-col justify-between border border-[#D8DCD7] bg-[#FAFBF8] p-5">
        <div>
          <div className="flex items-center justify-between border-b border-[#D8DCD7] pb-3">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7A1428]">
                Step 1 · Select Outfit
              </p>
              <h3 className="mt-1 font-serif text-xl font-semibold text-[#161918]">
                Smart Mirror Wardrobe
              </h3>
            </div>
            <div className="flex border border-[#D8DCD7] bg-white p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setGenderFilter('women');
                  setActiveCategory('sarees');
                }}
                className={`px-3 py-1.5 transition ${
                  genderFilter === 'women' ? 'bg-[#7A1428] text-[#FAF6EE]' : 'text-[#535A56]'
                }`}
              >
                Women
              </button>
              <button
                type="button"
                onClick={() => {
                  setGenderFilter('men');
                  setActiveCategory('kurta');
                }}
                className={`px-3 py-1.5 transition ${
                  genderFilter === 'men' ? 'bg-[#7A1428] text-[#FAF6EE]' : 'text-[#535A56]'
                }`}
              >
                Men
              </button>
            </div>
          </div>

          {/* Category Pill Tabs */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {filteredCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`border px-3 py-1.5 text-xs font-semibold transition ${
                  activeCategory === cat.id
                    ? 'border-[#161918] bg-[#161918] text-[#FAF6EE]'
                    : 'border-[#D8DCD7] bg-white text-[#535A56] hover:border-[#161918]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* 5 Dresses in Category */}
          <div className="mt-4 grid max-h-[420px] gap-2.5 overflow-y-auto pr-1">
            {categoryProducts.map((item) => {
              const selected = currentProduct.sku === item.sku;
              return (
                <button
                  key={item.sku}
                  type="button"
                  onClick={() => handleSelectDress(item)}
                  className={`flex items-center gap-3 border p-2.5 text-left transition ${
                    selected
                      ? 'border-[#7A1428] bg-[#7A1428]/5 ring-1 ring-[#7A1428]'
                      : 'border-[#D8DCD7] bg-white hover:border-[#161918]'
                  }`}
                >
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="h-16 w-14 shrink-0 border border-[#D8DCD7] object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7A1428]">
                        {item.badge || item.sku}
                      </span>
                      <span className="font-mono text-xs font-semibold text-[#161918]">
                        {formatINR(item.price)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm font-semibold text-[#161918]">{item.title}</p>
                    <p className="truncate text-xs text-[#535A56]">{item.fabricNote}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2 & Step 3 Action Controls */}
        <div className="mt-5 border-t border-[#D8DCD7] pt-4">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#535A56]">
            Step 2 & 3 · Camera & 30s Live Session
          </p>
          <div className="mt-3 grid gap-2.5">
            <button
              type="button"
              onClick={turnOnCamera}
              disabled={state === 'connecting'}
              className={`flex min-h-12 w-full items-center justify-center gap-2 border px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                state === 'camera_ready' || state === 'live'
                  ? 'border-[#256B45] bg-[#EBF5EE] text-[#256B45]'
                  : 'border-[#161918] bg-[#161918] text-[#FAF6EE] hover:bg-[#2B302E]'
              }`}
            >
              <Camera className="h-4 w-4" />
              {state === 'camera_ready' || state === 'live' ? 'Step 2: Camera Active (Restart)' : 'Step 2: Turn On Camera'}
            </button>

            {state !== 'live' ? (
              <button
                type="button"
                onClick={start30sLiveTryOn}
                disabled={state === 'connecting'}
                className="flex min-h-12 w-full items-center justify-center gap-2 bg-[#7A1428] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#FAF6EE] transition hover:bg-[#610F20] disabled:opacity-50"
              >
                {state === 'connecting' ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Connecting Live Mirror...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Step 3: Start 30s Live Try-On
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => stopLiveSession('completed')}
                className="flex min-h-12 w-full items-center justify-center gap-2 border border-[#B42318] bg-[#FEF3F2] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#B42318]"
              >
                <Square className="h-4 w-4" />
                Stop Live Session ({secondsLeft}s left)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Smart Mirror Live Viewport */}
      <div className="flex flex-col justify-between border border-[#D8DCD7] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D8DCD7] pb-3">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7A1428]">
              Smart Mirror · 30s Live AI Try-On
            </p>
            <h3 className="mt-0.5 font-serif text-xl font-semibold text-[#161918]">
              {currentProduct.title} · <span className="text-[#7A1428]">{formatINR(currentProduct.price)}</span>
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="border border-[#D8DCD7] bg-[#F4F5F2] px-3 py-1.5 font-mono text-xs font-semibold text-[#161918]">
              {state === 'live' ? `LIVE · 00:${String(secondsLeft).padStart(2, '0')}` : '30s SESSION CAP'}
            </span>
          </div>
        </div>

        {/* Mirror Stage */}
        <div className="relative mt-4 aspect-[16/10] w-full overflow-hidden border border-[#D8DCD7] bg-[#161918]">
          {/* Remote / Live Output Stream */}
          <video
            ref={remoteVideoRef}
            playsInline
            muted
            autoPlay
            className={`h-full w-full object-cover ${state === 'live' ? 'block' : 'hidden'}`}
          />

          {/* Local Camera Preview (shown when camera_ready or as PIP during live) */}
          <video
            ref={localVideoRef}
            playsInline
            muted
            autoPlay
            className={
              state === 'camera_ready' || state === 'connecting'
                ? 'h-full w-full object-cover'
                : state === 'live'
                ? 'absolute bottom-4 right-4 z-20 h-32 w-24 border-2 border-white/80 bg-black object-cover shadow-lg'
                : 'hidden'
            }
          />

          {/* Top Smart Mirror Pill Overlay */}
          {(state === 'camera_ready' || state === 'live') && (
            <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex flex-col items-center">
              <div className="rounded-full bg-black/75 px-5 py-1.5 text-center text-white backdrop-blur-md">
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em]">
                  {state === 'live' ? `LIVE AI TRY-ON · ${secondsLeft}s REMAINING` : 'CAMERA PREVIEW READY'}
                </p>
                <p className="text-[11px] text-white/80">
                  {state === 'live' ? 'Turn slowly to inspect garment drape & border' : 'Step back so your upper/full body is visible, then click Step 3'}
                </p>
              </div>
            </div>
          )}
          {state === 'live' && <div className="absolute inset-x-4 bottom-2 z-30 h-3 overflow-hidden rounded-full bg-white/40" role="progressbar" aria-label="Live session progress" aria-valuemin={0} aria-valuemax={30} aria-valuenow={30 - secondsLeft}><div className="h-full bg-[#F3E5AB] transition-all duration-200" style={{ width: `${((30 - secondsLeft) / 30) * 100}%` }} /></div>}

          {/* Selected Dress Floating Card inside Mirror */}
          <div className="absolute bottom-4 left-4 z-20 flex items-center gap-3 border border-[#D8DCD7] bg-white/95 p-2.5 shadow-md backdrop-blur-sm">
            <img
              src={currentProduct.imageUrl}
              alt={currentProduct.title}
              className="h-16 w-12 border border-[#D8DCD7] object-cover"
            />
            <div className="pr-2">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7A1428]">
                Selected Dress
              </p>
              <p className="text-xs font-semibold text-[#161918]">{currentProduct.title}</p>
              <p className="font-mono text-xs font-bold text-[#161918]">{formatINR(currentProduct.price)}</p>
            </div>
          </div>

          {/* Idle / Select Dress State */}
          {state === 'select_dress' && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/75 p-8 text-center text-[#FAF6EE]">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/10">
                <Video className="h-7 w-7 text-[#FAF6EE]" />
              </div>
              <p className="mt-4 font-mono text-xs uppercase tracking-[0.22em] text-white/70">
                3-Step Live AI Mirror
              </p>
              <h4 className="mt-2 max-w-md font-serif text-2xl font-semibold">
                1. Pick Dress · 2. Turn On Camera · 3. Start 30s Live Try-On
              </h4>
              <p className="mt-2 max-w-lg text-sm text-white/75">
                Selected outfit: <strong>{currentProduct.title}</strong> ({formatINR(currentProduct.price)}). Click <strong>Step 2: Turn On Camera</strong> to preview your PC/TV camera before starting the 30-second live session.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={turnOnCamera}
                  className="flex items-center gap-2 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#161918] transition hover:bg-[#F4F5F2]"
                >
                  <Camera className="h-4 w-4" />
                  Step 2: Turn On Camera
                </button>
              </div>
            </div>
          )}

          {/* Connecting State */}
          {state === 'connecting' && (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-[#FAF6EE]">
              <LoaderCircle className="h-10 w-10 animate-spin text-white" />
              <p className="mt-4 font-serif text-2xl font-semibold">Starting 30s Live AI Mirror...</p>
              <p className="mt-1 text-sm text-white/75">
                Applying {currentProduct.title} ({formatINR(currentProduct.price)})
              </p>
            </div>
          )}

          {/* Completed State */}
          {state === 'completed' && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#FAFBF8] p-8 text-center text-[#161918]">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EBF5EE] text-[#256B45]">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <p className="mt-3 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#256B45]">
                30-Second Session Complete
              </p>
              <h4 className="mt-1 font-serif text-2xl font-semibold">Ready to try another look?</h4>
              <p className="mt-2 max-w-md text-sm text-[#535A56]">
                Switch to any saree, lehenga, salwar, kurta, veshti, or shirt on the left and start another 30s live session.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={start30sLiveTryOn}
                  className="flex items-center gap-2 bg-[#7A1428] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#FAF6EE]"
                >
                  <RefreshCw className="h-4 w-4" />
                  Run Another 30s Live Try-On
                </button>
              </div>
            </div>
          )}

          {/* Error State */}
          {state === 'error' && (
            <div className="flex h-full flex-col items-center justify-center bg-[#FEF3F2] p-8 text-center text-[#B42318]">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em]">Camera / Stream Notice</p>
              <p className="mt-2 max-w-md text-sm font-medium">{error}</p>
              <button
                type="button"
                onClick={turnOnCamera}
                className="mt-5 border border-[#B42318] bg-white px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#B42318]"
              >
                Retry Camera
              </button>
            </div>
          )}
        </div>

        {/* Footer Status Bar */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#535A56]">
          <span>
            {liveModeNote || 'Select any outfit on the left even while the camera is active.'}
          </span>
          <span className="font-mono uppercase tracking-[0.14em] text-[#161918]">
            Identity Locked · {garmentTitle || currentProduct.title}
          </span>
        </div>
      </div>
    </div>
  );
}
