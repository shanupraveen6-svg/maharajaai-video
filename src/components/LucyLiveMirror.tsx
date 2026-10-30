'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fal } from '@fal-ai/client';
import { createImageHandoff } from '@/lib/maharaja/image-handoff-client';
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
const READY_COUNTDOWN_SECONDS = 5;
const CARDS_PER_PAGE = 4;
const WEDDING_CATEGORIES: Record<TryFocusProduct['gender'], CatalogueCategoryId[]> = {
  women: ['sarees', 'half-sarees', 'lehengas', 'gowns', 'salwar-suits'],
  men: ['veshti', 'kurta', 'angavastram', 'sherwanis', 'blazers'],
  boys: ['boys-veshti', 'boys-kurta', 'boys-sherwani', 'boys-jacket', 'boys-festive'],
  girls: ['girls-pavadai', 'girls-lehenga', 'girls-half-saree', 'girls-gown', 'girls-anarkali'],
};

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

  const [gender, setGender] = useState<TryFocusProduct['gender']>(externalProduct?.gender || 'women');
  const [category, setCategory] = useState<'wedding-picks' | CatalogueCategoryId>('wedding-picks');
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedGarment, setSelectedGarment] = useState<TryFocusProduct>(
    externalProduct || activeCatalogue[0]
  );
  const [state, setState] = useState<LiveState>('idle');
  const [readyCountdown, setReadyCountdown] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECONDS);
  const [error, setError] = useState('');
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    'Step 1: Open the mirror camera, choose a catalogue outfit, and tap Start 30s Live Try-On.'
  );
  const [completionModalOpen, setCompletionModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [handoffMessage, setHandoffMessage] = useState('');

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<{ send: (input: Record<string, unknown>) => void; close: () => void } | null>(null);
  const connectionDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const timerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const selectedGarmentRef = useRef<TryFocusProduct>(activeCatalogue[0]);
  const paidTimerStartedRef = useRef(false);

  const visibleCategories = useMemo(
    () => WEDDING_CATEGORIES[gender].map((id) => catalogueCategories.find((cat) => cat.id === id)!).filter(Boolean),
    [gender]
  );

  const categoryProducts = useMemo(() => {
    const byGender = activeCatalogue.filter((item) => item.gender === gender);
    if (category === 'wedding-picks') return byGender;
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


  useEffect(() => {
    void enableCameraPreview();
    const pause = () => { if (document.hidden) stopSession('camera_ready'); };
    document.addEventListener('visibilitychange', pause);
    return () => {
      document.removeEventListener('visibilitychange', pause);
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
    if (connectionDeadlineRef.current) clearTimeout(connectionDeadlineRef.current);
    connectionDeadlineRef.current = null;
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

  async function sendGarmentReference(ws: { send: (input: Record<string, unknown>) => void }, garment: TryFocusProduct) {
    const referenceSource = garment.garmentReferenceUrl || garment.imageUrl;
    const imageDataUri = await garmentUrlToDataUri(referenceSource);
    const prompt = `Wear the exact ${garment.title} (${garment.fabricNote || garment.category}). Preserve exact garment color, border, zari and drape while keeping the customer's real face and skin tone natural.`;

    ws.send({ reference_image_url: imageDataUri, prompt, enhance_prompt: true });
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
    if ((gender === 'boys' || gender === 'girls') && !guardianConsent) {
      setError('A parent or guardian must approve the child’s photo first.');
      return;
    }
    if (selectedGarment.gender !== gender || !activeCatalogue.some((item) => item.sku === selectedGarment.sku)) {
      setError('Choose an available garment from this collection first.');
      return;
    }
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

      let stopped = false;
      const pendingCandidates: RTCIceCandidateInit[] = [];
      const fail = (message: string) => {
        if (stopped) return;
        stopped = true;
        closeRealtimeConnections(); setState('error'); setError(message);
      };
      const connection = fal.realtime.connect<Record<string, unknown>, Record<string, any>>(LUCY_VTON_APP, {
        connectionKey: `maharaja-live-${Date.now()}`,
        throttleInterval: 0,
        tokenExpirationSeconds: 60,
        tokenProvider: async () => {
          const response = await fetch('/api/fal/realtime-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: LUCY_VTON_APP }) });
          if (!response.ok) throw new Error(await response.text());
          return (await response.text()).trim();
        },
        onError: (error) => fail(error.message || 'The live mirror could not connect. Please ask staff for help.'),
        onResult: async (message) => {
          if (stopped || wsRef.current !== connection) return;
          try {
            if (message.type === 'iceservers' || message.type === 'iceServers') {
              if (pcRef.current) return;
              const servers = message.iceservers || message.iceServers || message.ice_servers || [];
              const pc = new RTCPeerConnection({ iceServers: servers.map((server: RTCIceServer) => ({ urls: server.urls, username: server.username, credential: server.credential })) });
              pcRef.current = pc;
              stream.getTracks().forEach((track) => pc.addTrack(track, stream));
              pc.ontrack = (event) => {
                const output = event.streams[0] || new MediaStream([event.track]);
                const video = remoteVideoRef.current;
                if (!video) return;
                video.srcObject = output;
                video.onplaying = () => {
                  if (connectionDeadlineRef.current) clearTimeout(connectionDeadlineRef.current);
                  startPaidThirtySecondWindow();
                };
                void video.play().catch(() => fail('Tap Start again to allow live video playback.'));
              };
              pc.onicecandidate = (event) => {
                if (event.candidate && wsRef.current === connection) connection.send({ type: 'icecandidate', candidate: event.candidate.toJSON() });
              };
              pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') fail('The live connection was interrupted. Please try again.'); };
              const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
              connection.send({ type: 'offer', sdp: offer.sdp });
            } else if (message.type === 'answer' && pcRef.current) {
              await pcRef.current.setRemoteDescription({ type: 'answer', sdp: message.sdp });
              for (const candidate of pendingCandidates.splice(0)) await pcRef.current.addIceCandidate(candidate);
            } else if (message.type === 'icecandidate' && message.candidate) {
              if (pcRef.current?.remoteDescription) await pcRef.current.addIceCandidate(message.candidate);
              else pendingCandidates.push(message.candidate);
            } else if (message.type === 'ice-restart' && pcRef.current && message.turn_config) {
              pcRef.current.setConfiguration({ iceServers: [{ urls: message.turn_config.server_url, username: message.turn_config.username, credential: message.turn_config.credential }] });
              const offer = await pcRef.current.createOffer({ iceRestart: true }); await pcRef.current.setLocalDescription(offer);
              connection.send({ type: 'offer', sdp: offer.sdp });
            } else if (message.type === 'error' || ((message.type === 'set_image_ack' || message.type === 'prompt_ack') && message.success === false)) {
              fail(String(message.error || 'This garment could not be loaded. Choose another look.'));
            }
          } catch (error) { fail(error instanceof Error ? error.message : 'The live mirror could not connect.'); }
        },
      });
      wsRef.current = connection;
      connectionDeadlineRef.current = setTimeout(() => fail('The live mirror took too long to connect. Your session has stopped.'), 30_000);
      await sendGarmentReference(connection, selectedGarmentRef.current);
    } catch (caught) {
      closeRealtimeConnections();
      setError(
        caught instanceof Error ? caught.message : 'Unable to start 30s Live AI Mirror.'
      );
      setState('error');
    }
  }

  function stopSession(nextState: LiveState = 'camera_ready') {
    if (nextState === 'complete') {
      setQrDataUrl(''); setHandoffMessage('Preparing your private phone QR…');
      const video = remoteVideoRef.current;
      if (video?.videoWidth && video.videoHeight) {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (context) {
          context.drawImage(video, 0, 0);
          void createImageHandoff(canvas.toDataURL('image/jpeg', .85), selectedGarmentRef.current.sku, selectedGarmentRef.current.title)
            .then((qr) => { setQrDataUrl(qr); setHandoffMessage('Scan to save your live mirror look. Private link valid for 15 minutes.'); })
            .catch(() => setHandoffMessage('The snapshot could not be saved. Ask a store assistant for help.'));
        }
      } else setHandoffMessage('A live mirror snapshot is not available for this session.');
    }
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
    if (wsRef.current) {
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
      <div className="tv-live-heading border-2 border-[#D8DCD7] bg-white p-5">
        <p className="font-mono text-sm font-bold uppercase tracking-[0.16em] text-[#7A1428]">Live AI Mirror · 30 seconds</p>
        <h2 className="mt-1 font-serif text-4xl font-semibold text-[#161918]">See your wedding look move with you</h2>
        <p className="mt-2 text-lg text-[#535A56]">Choose a look, open the camera, then start your 30-second session.</p>
      </div>

      <div className="tv-live-audience grid grid-cols-4 gap-3" aria-label="Live mirror audience">
        {(['women', 'men', 'boys', 'girls'] as const).map((g) => <button key={g} type="button" aria-pressed={gender === g} onClick={() => { setGender(g); setCategory('wedding-picks'); setPageIndex(0); const first = activeCatalogue.find((item) => item.gender === g); if (first) void selectGarment(first); }} className={`min-h-16 border-2 px-4 text-xl font-bold ${gender === g ? 'border-[#161918] bg-[#161918] text-white' : 'border-[#D8DCD7] bg-white text-[#161918]'}`}>{g.charAt(0).toUpperCase() + g.slice(1)}</button>)}
      </div>

      {(gender === 'boys' || gender === 'girls') && <label className="flex min-h-16 items-center gap-3 border border-[#D8DCD7] bg-white p-4 text-lg"><input type="checkbox" checked={guardianConsent} onChange={(event) => setGuardianConsent(event.target.checked)} className="h-6 w-6" />I am the parent or guardian and approve this child’s live mirror session.</label>}

      {/* Main 2-Column Row: Left Outfit Selector + Right Mirror Viewport */}
      <div className="tv-live-row grid min-w-0 gap-5 lg:grid-cols-[minmax(340px,400px)_1fr] items-start">
        {/* Left Column: Step 2 Outfit Selector */}
        <aside className="tv-live-menu flex min-w-0 flex-col justify-between border-2 border-[#D8DCD7] bg-[#FAFBF8] p-4 sm:p-5 shadow-sm">
          <div>
            <div className="border-b border-[#D8DCD7] pb-3">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#7A1428]">Wedding collection</p>
              <h3 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">Choose your look</h3>
            </div>
            <div className="tv-live-category-list mt-3.5 grid gap-2">
              <button type="button" aria-pressed={category === 'wedding-picks'} onClick={() => { setCategory('wedding-picks'); setPageIndex(0); }} className={`min-h-14 border px-4 py-2.5 text-left text-base font-bold ${category === 'wedding-picks' ? 'border-[#7A1428] bg-[#7A1428] text-white' : 'border-[#D8DCD7] bg-white text-[#161918] hover:border-[#161918]'}`}>Wedding Picks</button>
              {visibleCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  aria-pressed={category === cat.id}
                  onClick={() => {
                    setCategory(cat.id);
                    setPageIndex(0);
                    const first = activeCatalogue.find((item) => item.category === cat.id);
                    if (first) void selectGarment(first);
                  }}
                  className={`min-h-14 border px-4 py-2.5 text-left text-base font-bold ${
                    category === cat.id
                      ? 'border-[#7A1428] bg-[#7A1428] text-[#FAF6EE]'
                      : 'border-[#D8DCD7] bg-white text-[#161918] hover:border-[#161918]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="tv-live-garments mt-4 grid gap-2.5">
              {pagedProducts.length === 0 && <p className="p-3 text-sm text-[#535A56]">This collection is being prepared. Choose another wedding style.</p>}
              {pagedProducts.map((item) => {
                const active = selectedGarment.id === item.id || selectedGarment.sku === item.sku;
                return (
                  <button
                    key={item.sku}
                    type="button"
                    onClick={() => selectGarment(item)}
                    className={`flex min-w-0 items-center gap-3 overflow-hidden border-2 p-2.5 text-left transition ${
                      active
                        ? 'border-[#7A1428] bg-white shadow-md ring-2 ring-[#7A1428]'
                        : 'border-[#D8DCD7] bg-white hover:border-[#161918]'
                    }`}
                  >
                    <div className="relative h-20 w-16 shrink-0 overflow-hidden bg-[#ECEEE9]">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="h-full w-full object-contain object-top"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-serif text-sm font-semibold text-[#161918]">
                        {item.title}
                      </p>
                      <div className="mt-1 flex items-center justify-between font-mono text-xs">
                        <span className="font-bold text-[#7A1428]">
                          {formatINR(item.price)}
                        </span>
                        <span className="text-xs font-bold text-[#7A1428]">
                          {active ? '✓ Selected' : item.sku}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pager Controls */}
          <div className="mt-4 flex items-center justify-between border-t border-[#D8DCD7] pt-4">
            <button
              type="button"
              disabled={safePageIndex <= 0}
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              className="inline-flex min-h-[56px] items-center gap-2 border border-[#161918] bg-white px-5 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#161918] disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>
            <span className="font-mono text-sm font-bold text-[#535A56]">
              Page {safePageIndex + 1} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePageIndex >= totalPages - 1}
              onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
              className="inline-flex min-h-[56px] items-center gap-2 border border-[#161918] bg-white px-5 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#161918] disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </aside>

        {/* Right Column: Mirror Viewport */}
        <div className="tv-live-camera relative aspect-[9/16] w-full min-w-0 overflow-hidden border-2 border-[#D8DCD7] bg-[#161918] shadow-sm">
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
        </div>
      </div>

      {/* Row 2: Bottom Full-Width 30-Second Controls with Big Touch Area */}
      <section className="tv-live-controls border-2 border-[#D8DCD7] bg-white p-5 sm:p-6 shadow-sm" aria-label="Live session controls">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: 30-Second Status & Timer Progress */}
          <div className="flex-1 space-y-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <span className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-[#7A1428]">
                  Your Session · 30 Seconds Live
                </span>
                <h3 className="font-serif text-2xl sm:text-3xl font-bold text-[#161918]">
                  {state === 'live'
                    ? 'AI Live Mirror Active'
                    : state === 'ready_countdown'
                    ? 'Step Back & Get Ready...'
                    : state === 'connecting'
                    ? 'Connecting Live AI Stream...'
                    : '30 Seconds to See It Live'}
                </h3>
              </div>
              <div className="flex items-center gap-2.5 rounded border border-[#D8DCD7] bg-[#FAFBF8] px-4 py-2 font-mono text-lg font-bold text-[#161918]">
                <span className="text-xs uppercase text-[#535A56]">Time left</span>
                <span className="text-2xl font-black text-[#7A1428]">{secondsLeft}s</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-3.5 w-full overflow-hidden rounded bg-[#ECEEE9] border border-[#D8DCD7]">
              <div
                className={`h-full transition-all duration-500 ${
                  state === 'live' ? 'bg-[#256B45]' : 'bg-[#7A1428]'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#535A56]">
              <p className="font-medium">{statusMessage}</p>
              <p>You can change looks on the left during your live session.</p>
            </div>

            {error && (
              <p role="alert" className="border-2 border-[#B42318] bg-[#FEF3F2] p-3 text-sm font-semibold text-[#B42318]">
                {error}
              </p>
            )}
          </div>

          {/* Right: Big Touch Action Button for 43-inch TV */}
          <div className="shrink-0 lg:pl-6">
            {state === 'idle' ? (
              <button
                type="button"
                onClick={enableCameraPreview}
                className="tv-live-action flex min-h-[84px] w-full items-center justify-center gap-3.5 border-2 border-[#161918] bg-[#161918] px-8 text-xl font-bold uppercase tracking-wider text-white shadow-md transition hover:bg-[#2C3330] active:scale-[0.99] sm:min-w-[280px]"
              >
                <Camera className="h-6 w-6" />
                Open Camera
              </button>
            ) : state === 'live' || state === 'connecting' || state === 'ready_countdown' ? (
              <button
                type="button"
                onClick={() => stopSession('camera_ready')}
                className="tv-live-action flex min-h-[84px] w-full items-center justify-center gap-3.5 border-2 border-[#B42318] bg-[#FEF3F2] px-8 text-xl font-bold uppercase tracking-wider text-[#B42318] shadow-md transition hover:bg-[#FEE4E2] active:scale-[0.99] sm:min-w-[280px]"
              >
                <Square className="h-6 w-6 fill-current" />
                Stop Session
              </button>
            ) : (
              <button
                type="button"
                onClick={beginLiveCountdownAndConnect}
                className="tv-live-action flex min-h-[84px] w-full items-center justify-center gap-3.5 border-2 border-[#7A1428] bg-[#7A1428] px-10 text-xl font-bold uppercase tracking-wider text-white shadow-lg transition hover:bg-[#600F1F] active:scale-[0.99] sm:min-w-[320px]"
              >
                <Sparkles className="h-6 w-6 text-[#F3E5AB]" />
                Start 30s Live Mirror
              </button>
            )}
          </div>
        </div>
      </section>

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
                  Your live session has finished. Scan the QR to save{' '}
                  <strong>{selectedGarment.title}</strong> ({formatINR(selectedGarment.price)}) on your phone, or start another 30-second live session.
                </p>
                <p role="status" className="text-sm">{handoffMessage}</p>
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
