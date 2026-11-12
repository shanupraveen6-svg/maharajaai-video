'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fal } from '@fal-ai/client';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Play,
  Sparkles,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  sampleCatalogue,
  type CatalogueCategoryId,
  type TryFocusProduct,
} from '@/lib/tryfocus/sample-data';
import PhotoConsentNotice from '@/components/PhotoConsentNotice';
import AudienceCards from '@/components/AudienceCards';
import { PageTitle } from '@/components/ui';
import { LIVE_CATEGORIES } from '@/lib/tryfocus/live-categories';

const LUCY_VTON_APP = 'decart/lucy2-vton/realtime';
const SESSION_SECONDS = 30;
const READY_COUNTDOWN_SECONDS = 5;
// MP4 first: phones play it everywhere; Chrome on older TVs falls back to WebM.
const RECORDING_TYPES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
const AUDIENCE_LABELS = { women: 'Women', men: 'Men', boys: 'Boys', girls: 'Girls' } as const;
const MAX_PAIR = 2;

/**
 * A full live session for one garment: 'ready' is the 5-second step-back countdown before it starts
 * (skipped for the first garment, since the customer is already in frame from picking it), 'connecting'
 * is the Lucy handshake, 'live' is the timed 30-second session, 'done' means its video is saved.
 */
type GarmentSessionState = 'pending' | 'ready' | 'connecting' | 'live' | 'done' | 'error';

type Phase = 'pick' | 'camera';

export default function LucyLiveMirror({
  catalogue: propCatalogue,
  selectedProduct: externalProduct,
  onSelectProduct,
  onUsePhotoTryOn,
  onEndSession,
}: {
  catalogue?: TryFocusProduct[];
  garmentPrompt?: string;
  garmentTitle?: string;
  selectedProduct?: TryFocusProduct;
  onSelectProduct?: (product: TryFocusProduct) => void;
  /** Offered when Western Try-On cannot run, so the customer can still see the outfit on a photo. */
  onUsePhotoTryOn?: (product: TryFocusProduct) => void;
  /** End session under the result: the kiosk clears this customer. */
  onEndSession?: () => void;
} = {}) {
  const activeCatalogue = propCatalogue && propCatalogue.length > 0 ? propCatalogue : sampleCatalogue;

  const [gender, setGender] = useState<TryFocusProduct['gender']>(externalProduct?.gender || 'women');
  const [genderChosen, setGenderChosen] = useState(false);
  const [category, setCategory] = useState<CatalogueCategoryId>(externalProduct?.category || LIVE_CATEGORIES.women[0].id);
  const [guardianConsent, setGuardianConsent] = useState(false);

  // Step 1: pick exactly two outfits from the grid, picture cards only, numbered as they're tapped.
  const [pair, setPair] = useState<TryFocusProduct[]>([]);

  // Step 2: the full-screen camera, one garment at a time.
  const [phase, setPhase] = useState<Phase>('pick');
  const [activeIndex, setActiveIndex] = useState<0 | 1>(0);
  const [sessionStates, setSessionStates] = useState<[GarmentSessionState, GarmentSessionState]>(['pending', 'pending']);
  const [readyCountdown, setReadyCountdown] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECONDS);
  const [error, setError] = useState('');
  const [cameraOn, setCameraOn] = useState(false);

  // Step 3: both sessions done — play each video, swipe between the two. No QR: this is a live-only experience.
  const [videoUrls, setVideoUrls] = useState<[string, string]>(['', '']);
  const [resultIndex, setResultIndex] = useState<0 | 1>(0);
  const [replaying, setReplaying] = useState(false);
  const replayRef = useRef<HTMLVideoElement>(null);
  const swipeStartX = useRef<number | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<{ send: (input: Record<string, unknown>) => void; close: () => void } | null>(null);
  const connectionDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const timerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const activeIndexRef = useRef<0 | 1>(0);
  const pairRef = useRef<TryFocusProduct[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const visibleCategories = useMemo(
    () => LIVE_CATEGORIES[gender].filter((cat) => activeCatalogue.some((item) => item.gender === gender && item.category === cat.id)),
    [activeCatalogue, gender]
  );
  const activeCategory = visibleCategories.some((cat) => cat.id === category) ? category : visibleCategories[0]?.id;

  const categoryProducts = useMemo(
    () => activeCatalogue.filter((item) => item.gender === gender && item.category === activeCategory),
    [activeCatalogue, gender, activeCategory]
  );

  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => { pairRef.current = pair; }, [pair]);

  useEffect(() => {
    const pause = () => { if (document.hidden) stopEverything(); };
    document.addEventListener('visibilitychange', pause);
    return () => {
      document.removeEventListener('visibilitychange', pause);
      stopEverything();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearSessionTimer() {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
  }

  function clearCountdownTimer() {
    if (countdownTimerRef.current) { window.clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
    setReadyCountdown(null);
  }

  function closeRealtimeConnections() {
    discardRecording();
    if (connectionDeadlineRef.current) clearTimeout(connectionDeadlineRef.current);
    connectionDeadlineRef.current = null;
    clearSessionTimer();
    clearCountdownTimer();
    if (pcRef.current) { try { pcRef.current.close(); } catch { /* ignore */ } pcRef.current = null; }
    if (wsRef.current) { try { wsRef.current.close(); } catch { /* ignore */ } wsRef.current = null; }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }

  function stopEverything() {
    closeRealtimeConnections();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  async function enableCamera(): Promise<boolean> {
    setError('');
    try {
      if (!streamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 }, aspectRatio: { ideal: 9 / 16 }, frameRate: { ideal: 24, max: 30 } },
          audio: false,
        });
        streamRef.current = stream;
      }
      if (localVideoRef.current && streamRef.current) {
        localVideoRef.current.srcObject = streamRef.current;
        await localVideoRef.current.play().catch(() => undefined);
      }
      setCameraOn(true);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Camera permission is required for Western Try-On.');
      setCameraOn(false);
      return false;
    }
  }

  async function garmentUrlToDataUri(imageUrl: string): Promise<string> {
    const response = await fetch(imageUrl, { cache: 'force-cache' });
    if (!response.ok) throw new Error('Unable to load selected garment reference image.');
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not encode garment image.')));
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

  function startRecording() {
    const stream = remoteVideoRef.current?.srcObject;
    if (!(stream instanceof MediaStream) || typeof MediaRecorder === 'undefined') return;
    const mimeType = RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) return;
    try {
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
      recordedChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) recordedChunksRef.current.push(event.data); };
      recorder.start(1000);
      recorderRef.current = recorder;
    } catch {
      recorderRef.current = null;
    }
  }

  /** Stops the recorder and hands back this garment's clip; detached first so closing the stream can't drop it. */
  function finishRecording(): Promise<Blob | null> {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder || recorder.state === 'inactive') return Promise.resolve(null);
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType });
        recordedChunksRef.current = [];
        resolve(blob.size ? blob : null);
      };
      recorder.stop();
    });
  }

  function discardRecording() {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    recordedChunksRef.current = [];
    if (recorder && recorder.state !== 'inactive') { recorder.onstop = null; recorder.stop(); }
  }

  function setSessionState(index: 0 | 1, next: GarmentSessionState) {
    setSessionStates((prev) => {
      const copy = [...prev] as [GarmentSessionState, GarmentSessionState];
      copy[index] = next;
      return copy;
    });
  }

  /** Begins one garment's 30-second live session; a 5-second step-back buffer first, except for the very first garment. */
  async function beginGarmentSession(index: 0 | 1, withCountdown: boolean) {
    const garment = pairRef.current[index];
    if (!garment) return;
    if ((gender === 'boys' || gender === 'girls') && !guardianConsent) {
      setError('A parent or guardian must approve the child’s photo first.');
      return;
    }
    setError('');
    setActiveIndex(index);
    activeIndexRef.current = index;
    onSelectProduct?.(garment);

    if (!withCountdown) { void startLucyLiveSession(index); return; }

    clearCountdownTimer();
    setSessionState(index, 'ready');
    setReadyCountdown(READY_COUNTDOWN_SECONDS);
    let remaining = READY_COUNTDOWN_SECONDS;
    countdownTimerRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) { clearCountdownTimer(); void startLucyLiveSession(index); }
      else setReadyCountdown(remaining);
    }, 1000);
  }

  function startPaidSessionWindow(index: 0 | 1) {
    void fetch('/api/fal/realtime-session', { method: 'POST' }).catch(() => undefined);
    setSessionState(index, 'live');
    startRecording();
    setSecondsLeft(SESSION_SECONDS);
    clearSessionTimer();
    timerRef.current = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) { void endGarmentSession(index); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function startLucyLiveSession(index: 0 | 1) {
    const garment = pairRef.current[index];
    if (!garment) return;
    setError('');
    closeRealtimeConnections();
    setSessionState(index, 'connecting');
    setSecondsLeft(SESSION_SECONDS);

    try {
      if (!streamRef.current) {
        const ok = await enableCamera();
        if (!ok) { setSessionState(index, 'error'); return; }
      }
      const stream = streamRef.current;
      if (!stream) throw new Error('Camera feed is not ready.');

      let stopped = false;
      const pendingCandidates: RTCIceCandidateInit[] = [];
      const fail = (message: string) => {
        if (stopped) return;
        stopped = true;
        closeRealtimeConnections();
        setSessionState(index, 'error');
        setError(message);
      };
      const connection = fal.realtime.connect<Record<string, unknown>, Record<string, any>>(LUCY_VTON_APP, {
        connectionKey: `maharaja-live-${Date.now()}`,
        throttleInterval: 0,
        tokenExpirationSeconds: 120,
        tokenProvider: async () => {
          const response = await fetch('/api/fal/realtime-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: LUCY_VTON_APP }) });
          if (!response.ok) throw new Error(await response.text());
          return (await response.text()).trim();
        },
        onError: (error) => fail(error.message || 'The live try-on could not connect. Please ask staff for help.'),
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
                  startPaidSessionWindow(index);
                };
                void video.play().catch(() => fail('Tap Start again to allow live video playback.'));
              };
              pc.onicecandidate = (event) => { if (event.candidate && wsRef.current === connection) connection.send({ type: 'icecandidate', candidate: event.candidate.toJSON() }); };
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
          } catch (error) { fail(error instanceof Error ? error.message : 'The live try-on could not connect.'); }
        },
      });
      wsRef.current = connection;
      connectionDeadlineRef.current = setTimeout(() => fail('The live try-on took too long to connect. Your session has stopped.'), 30_000);
      await sendGarmentReference(connection, garment);
    } catch (caught) {
      closeRealtimeConnections();
      setSessionState(index, 'error');
      setError(caught instanceof Error ? caught.message : 'Unable to start Western Try-On.');
    }
  }

  /** Ends the current garment's session (timer ran out, or it was cut short) and saves its clip locally. */
  async function endGarmentSession(index: 0 | 1) {
    closeRealtimeConnections();
    const blob = await finishRecording();
    setVideoUrls((prev) => {
      const copy = [...prev] as [string, string];
      if (blob) { if (copy[index]) URL.revokeObjectURL(copy[index]); copy[index] = URL.createObjectURL(blob); }
      return copy;
    });
    setSessionState(index, 'done');
    if (index === 1) setResultIndex(0);
  }

  function skipCurrentSession() {
    const index = activeIndexRef.current;
    const state = sessionStates[index];
    if (state === 'live') { void endGarmentSession(index); return; }
    closeRealtimeConnections();
    setSessionState(index, 'pending');
  }

  function toggleGarment(item: TryFocusProduct) {
    setPair((current) => {
      const already = current.findIndex((look) => look.sku === item.sku);
      if (already >= 0) return current.filter((look) => look.sku !== item.sku);
      if (current.length >= MAX_PAIR) return current;
      return [...current, item];
    });
  }

  /** Step 1 is done: open the full-screen camera, garment one auto-active, waiting for the center Start tap. */
  async function confirmPairAndOpenCamera() {
    if (pair.length !== MAX_PAIR) return;
    if ((gender === 'boys' || gender === 'girls') && !guardianConsent) {
      setError('A parent or guardian must approve the child’s photo first.');
      return;
    }
    pairRef.current = pair;
    setSessionStates(['pending', 'pending']);
    setVideoUrls((prev) => { prev.forEach((url) => url && URL.revokeObjectURL(url)); return ['', '']; });
    setActiveIndex(0);
    activeIndexRef.current = 0;
    setError('');
    setPhase('camera');
    onSelectProduct?.(pair[0]);
    await enableCamera();
  }

  function startOver() {
    stopEverything();
    setPair([]);
    setSessionStates(['pending', 'pending']);
    setVideoUrls((prev) => { prev.forEach((url) => url && URL.revokeObjectURL(url)); return ['', '']; });
    setPhase('pick');
    setError('');
  }

  function endSession() {
    if (onEndSession) { stopEverything(); onEndSession(); return; }
    startOver();
  }

  /** With exactly two results, either direction just flips between them. */
  function moveResult() {
    setResultIndex((current) => (current === 0 ? 1 : 0));
    setReplaying(false);
  }

  const bothDone = sessionStates[0] === 'done' && sessionStates[1] === 'done';
  const current = sessionStates[activeIndex];
  const running = current === 'ready' || current === 'connecting' || current === 'live';
  const progressPercent = Math.max(0, Math.min(100, (secondsLeft / SESSION_SECONDS) * 100));
  const stateLabel =
    current === 'live' ? `Live · ${secondsLeft}s left`
      : current === 'ready' ? `Get ready · ${readyCountdown}s`
        : current === 'connecting' ? 'Connecting…'
          : current === 'error' ? 'Camera only · Western Try-On unavailable'
            : cameraOn ? 'Camera preview · not live yet'
              : 'Camera off';

  return (
    <div className="space-y-5">
      {phase === 'pick' && (
        <>
          <div className="space-y-3">
            <PageTitle size="lg" title="Western Try-On" subtitle="Shirts, dresses and western wear only. Pick two outfits, then start live — 30 seconds each." />
            <PhotoConsentNotice kind="live" large />
          </div>

          <AudienceCards size="lg" value={genderChosen ? gender : null} labels={AUDIENCE_LABELS} onChange={(g) => {
            setGenderChosen(true);
            setGender(g);
            setPair([]);
            const first = LIVE_CATEGORIES[g].find((cat) => activeCatalogue.some((item) => item.gender === g && item.category === cat.id));
            if (first) setCategory(first.id);
          }} />

          {genderChosen && (gender === 'boys' || gender === 'girls') && (
            <label className="flex min-h-16 items-center gap-3 rounded-2xl bg-warn-soft p-4 text-lg text-ink">
              <input type="checkbox" checked={guardianConsent} onChange={(event) => setGuardianConsent(event.target.checked)} className="h-6 w-6 accent-brand" />
              I am the parent or guardian and approve this child’s Western Try-On session.
            </label>
          )}

          {!genderChosen && <p className="p-6 text-center text-xl text-muted">Tap Women, Men, Boys or Girls to see the outfits.</p>}

          {genderChosen && (
            <div className="grid min-w-0 gap-5 lg:grid-cols-[220px_1fr]">
              <div role="group" aria-label="Category" className="tv-live-category-list border-b border-line lg:border-b-0 lg:border-r lg:pr-4">
                {visibleCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    aria-pressed={activeCategory === cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={`-mb-px min-h-16 border-b-[3px] px-1 text-lg font-semibold leading-tight lg:mb-1 lg:block lg:w-full lg:rounded-xl lg:border lg:border-transparent lg:px-4 lg:text-left ${
                      activeCategory === cat.id ? 'border-ink text-ink lg:border-ink lg:bg-brand-soft' : 'border-transparent text-muted hover:text-ink'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="min-w-0 space-y-4 pb-28">
                {categoryProducts.length === 0 && <p className="p-3 text-lg text-muted">No outfits here yet. Ask the store to add some.</p>}
                <div className="tv-product-grid grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {categoryProducts.map((item) => {
                    const pickedIndex = pair.findIndex((look) => look.sku === item.sku);
                    const picked = pickedIndex >= 0;
                    const full = pair.length >= MAX_PAIR && !picked;
                    return (
                      <button
                        key={item.sku}
                        type="button"
                        aria-pressed={picked}
                        aria-label={`${picked ? 'Remove' : 'Select'} ${item.title}`}
                        disabled={full}
                        onClick={() => toggleGarment(item)}
                        className={`tv-product-card group relative flex flex-col overflow-hidden rounded-2xl border bg-white text-left transition disabled:opacity-50 ${picked ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-line-strong'}`}
                      >
                        <span className="tv-product-image relative block w-full overflow-hidden">
                          <img src={item.thumbnailUrl || item.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain" />
                          <span className={`absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold shadow ${picked ? 'bg-ink text-white' : 'bg-white/90 text-ink'}`}>
                            {picked ? pickedIndex + 1 : '+'}
                          </span>
                        </span>
                        <span className="block p-3">
                          <span className="line-clamp-2 block text-base font-semibold leading-snug text-ink">{item.title}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {error && <p className="rounded-xl bg-danger-soft p-4 text-lg text-danger">{error}</p>}
              </div>

              <div className="tv-selection-bar fixed left-1/2 z-30 flex max-w-[1016px] -translate-x-1/2 items-center justify-between gap-4 backdrop-blur">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex -space-x-3">
                    {pair.map((look) => <img key={look.sku} src={look.thumbnailUrl || look.imageUrl} alt="" className="h-14 w-11 rounded-lg border-2 border-white bg-canvas object-cover" />)}
                  </div>
                  <p className="text-lg font-semibold">{pair.length ? `${pair.length} of ${MAX_PAIR} selected` : 'Tap two outfits to select'}</p>
                </div>
                <button
                  type="button"
                  disabled={pair.length !== MAX_PAIR}
                  onClick={() => void confirmPairAndOpenCamera()}
                  className="tf-btn tf-btn-primary !min-h-20 shrink-0 px-8 text-xl disabled:opacity-40"
                >
                  <Sparkles className="h-6 w-6" /> Start
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {phase === 'camera' && (
        <div className="space-y-4">
          <PageTitle size="lg" title="Western Try-On — live" subtitle="Stand in full view. We'll try each outfit for 30 seconds." />

          <div className="tv-live-camera relative w-full overflow-hidden rounded-2xl bg-ink" style={{ height: '82vh', maxHeight: '920px' }}>
            <video ref={localVideoRef} playsInline muted autoPlay className={`h-full w-full object-cover [transform:scaleX(-1)] ${current === 'live' ? 'opacity-0' : 'opacity-100'}`} />
            <video ref={remoteVideoRef} playsInline muted autoPlay className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${current === 'live' ? 'opacity-100' : 'pointer-events-none opacity-0'}`} />

            <span className="absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-full bg-ink/80 px-4 py-2 text-base font-semibold text-white backdrop-blur">
              <span className={`h-2.5 w-2.5 rounded-full ${current === 'live' ? 'bg-success' : current === 'error' ? 'bg-danger' : 'bg-white/60'}`} />
              {stateLabel}
            </span>

            {running && (
              <button type="button" onClick={skipCurrentSession} aria-label="Skip this outfit" className="absolute right-4 top-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-ink/70 text-white backdrop-blur hover:bg-ink">
                <X className="h-6 w-6" />
              </button>
            )}

            {/* The two outfits, one below the other: which is live now, which is next, which is done. */}
            {!bothDone && (
              <div className="absolute right-4 top-16 z-10 flex w-40 flex-col gap-3">
                {pair.map((look, index) => {
                  const state = sessionStates[index];
                  const isActive = index === activeIndex && running;
                  const isNext = index === 1 && sessionStates[0] === 'done' && state === 'pending';
                  return (
                    <div key={look.sku} className={`overflow-hidden rounded-2xl border-[3px] bg-white/95 shadow-lg transition ${isActive ? 'border-success' : isNext ? 'border-brand' : 'border-white/70'}`}>
                      <div className="flex items-center gap-2 p-2">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${state === 'done' ? 'bg-success' : 'bg-ink'}`}>{index + 1}</span>
                        <img src={look.thumbnailUrl || look.imageUrl} alt="" className="h-14 w-11 shrink-0 rounded-lg bg-canvas object-contain" />
                        <p className="line-clamp-2 text-xs font-semibold leading-snug text-ink">{state === 'done' ? 'Done' : look.title}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* The one action on the camera: Start live for garment one, nothing to tap while connecting or live. */}
            {cameraOn && current !== 'error' && activeIndex === 0 && sessionStates[0] === 'pending' && (
              <button type="button" onClick={() => void beginGarmentSession(0, false)} className="tf-btn tf-btn-primary tv-live-action absolute inset-x-10 bottom-10 z-10 !w-auto !min-h-24 text-2xl shadow-2xl">
                <Sparkles className="h-8 w-8" /> Start live Try-On
              </button>
            )}

            {sessionStates[0] === 'done' && sessionStates[1] === 'pending' && current !== 'error' && (
              <div className="absolute inset-x-10 bottom-10 z-10 space-y-3">
                <p className="mx-auto w-fit rounded-full bg-ink/80 px-5 py-2 text-lg font-semibold text-white backdrop-blur">First outfit done</p>
                <button type="button" onClick={() => void beginGarmentSession(1, true)} className="tf-btn tf-btn-primary tv-live-action !w-full !min-h-24 text-2xl shadow-2xl">
                  <Sparkles className="h-8 w-8" /> Start outfit 2
                </button>
              </div>
            )}

            {current === 'live' && (
              <div className="absolute inset-x-0 bottom-0 h-2 bg-white/20">
                <div className="h-full bg-white transition-all duration-1000 ease-linear" style={{ width: `${progressPercent}%` }} />
              </div>
            )}

            {current === 'ready' && readyCountdown !== null && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/55 p-8 text-center text-white">
                <p className="text-2xl font-semibold">Step back so your whole outfit is in view</p>
                <p className="mt-6 text-[160px] font-bold leading-none tabular-nums">{readyCountdown}</p>
                <p className="mt-6 text-lg text-white/80">Starting {pair[activeIndex]?.title}</p>
              </div>
            )}

            {!cameraOn && current !== 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/85 p-8 text-center text-white">
                <Camera className="h-14 w-14" />
                <p className="mt-4 text-3xl font-bold">Opening the camera…</p>
                <button type="button" onClick={() => void enableCamera()} className="tf-btn tf-btn-primary tv-live-action mt-6 !w-auto"><Camera className="h-6 w-6" /> Open camera</button>
              </div>
            )}

            {current === 'connecting' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/70 p-8 text-center text-white">
                <LoaderCircle className="h-14 w-14 animate-spin" />
                <p className="mt-4 text-3xl font-bold">Dressing you in {pair[activeIndex]?.title}</p>
                <p className="mt-2 max-w-sm text-lg text-white/80">Your 30 seconds start when the live picture appears.</p>
              </div>
            )}

            {current === 'error' && error && (
              <div className="absolute inset-x-4 bottom-6 rounded-2xl bg-white p-5 shadow-xl">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 h-7 w-7 shrink-0 text-danger" />
                  <div>
                    <p className="text-lg font-bold text-ink">Western Try-On is not running. This is the plain camera.</p>
                    <p className="mt-1 text-base text-muted">{error}</p>
                    <button type="button" onClick={() => void beginGarmentSession(activeIndex, activeIndex === 1)} className="tf-btn tf-btn-primary mt-3 !min-h-16 text-lg">
                      Try again
                    </button>
                    {onUsePhotoTryOn && pair[activeIndex] && (
                      <button type="button" onClick={() => { stopEverything(); onUsePhotoTryOn(pair[activeIndex]); }} className="tf-btn tf-btn-secondary mt-3 !min-h-16 text-lg">
                        Try this outfit on a photo instead
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {bothDone && !videoUrls[resultIndex] && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-ink/85 p-8 text-center text-white">
                <p className="text-3xl font-bold">{pair[resultIndex]?.title}</p>
                <p className="mt-3 max-w-sm text-lg text-white/80">This TV could not record this outfit&apos;s video.</p>
                <button type="button" onClick={moveResult} className="tf-btn tf-btn-secondary mt-6 !min-h-16 px-6 text-lg">See the other outfit</button>
              </div>
            )}

            {bothDone && videoUrls[resultIndex] && (
              <>
                <video
                  key={`${resultIndex}-${videoUrls[resultIndex].slice(-24)}`}
                  ref={replayRef}
                  src={videoUrls[resultIndex]}
                  playsInline
                  controls={replaying}
                  onPlay={() => setReplaying(true)}
                  onEnded={() => setReplaying(false)}
                  onTouchStart={(event) => { swipeStartX.current = event.touches[0]?.clientX ?? null; }}
                  onTouchEnd={(event) => {
                    if (swipeStartX.current === null) return;
                    const distance = (event.changedTouches[0]?.clientX ?? swipeStartX.current) - swipeStartX.current;
                    swipeStartX.current = null;
                    if (Math.abs(distance) > 48) moveResult();
                  }}
                  className="absolute inset-0 z-20 h-full w-full bg-ink object-cover"
                />
                {!replaying && (
                  <button type="button" onClick={() => void replayRef.current?.play()} className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-ink/45 text-white" aria-label={`Play ${pair[resultIndex]?.title}`}>
                    <span className="flex h-28 w-28 items-center justify-center rounded-full bg-white/95 text-ink shadow-2xl"><Play className="ml-1.5 h-12 w-12 fill-current" /></span>
                    <span className="text-2xl font-bold drop-shadow">Play {pair[resultIndex]?.title}</span>
                  </button>
                )}
                <button type="button" onClick={moveResult} aria-label="Previous outfit" className="absolute left-3 top-1/2 z-30 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-xl">
                  <ChevronLeft className="h-8 w-8" />
                </button>
                <button type="button" onClick={moveResult} aria-label="Next outfit" className="absolute right-3 top-1/2 z-30 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-xl">
                  <ChevronRight className="h-8 w-8" />
                </button>
                <div className="absolute inset-x-0 top-4 z-30 flex justify-center gap-2">
                  {[0, 1].map((index) => (
                    <button key={index} type="button" aria-label={`Show outfit ${index + 1}`} aria-pressed={resultIndex === index} onClick={() => { setResultIndex(index as 0 | 1); setReplaying(false); }} className={`h-2.5 w-8 rounded-full transition ${resultIndex === index ? 'bg-white' : 'bg-white/40'}`} />
                  ))}
                </div>
              </>
            )}
          </div>

          {bothDone && (
            <button type="button" onClick={endSession} className="tf-btn !min-h-20 w-full bg-danger text-xl font-bold text-white hover:bg-danger/90">End session</button>
          )}
        </div>
      )}
    </div>
  );
}
