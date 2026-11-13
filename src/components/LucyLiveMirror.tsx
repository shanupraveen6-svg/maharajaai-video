'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fal } from '@fal-ai/client';
import { Camera, ChevronLeft, LoaderCircle, Play, RotateCcw, ShieldAlert, Sparkles, X } from 'lucide-react';
import type { CatalogueCategoryId, TryFocusProduct } from '@/lib/tryfocus/sample-data';
import PhotoConsentNotice from '@/components/PhotoConsentNotice';
import WhoCards, { KidsSwitch, type WhoGroup } from '@/components/kiosk/WhoCards';
import GarmentRail from '@/components/kiosk/GarmentRail';
import PosterFill from '@/components/kiosk/PosterFill';
import { PageTitle, AgreeButton } from '@/components/ui';

const LUCY_VTON_APP = 'decart/lucy2-vton/realtime';
const SESSION_SECONDS = 30;
const READY_COUNTDOWN_SECONDS = 5;
// MP4 first: phones play it everywhere; Chrome on older TVs falls back to WebM.
const RECORDING_TYPES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
const AUDIENCE_LABELS = { women: 'Women', men: 'Men', boys: 'Boys', girls: 'Girls' } as const;

/** 'ready' is the 5-second step-back countdown, 'connecting' the Lucy handshake, 'live' the timed 30 seconds. */
type SessionState = 'idle' | 'ready' | 'connecting' | 'live' | 'error';
type Phase = 'who' | 'camera' | 'result';

/**
 * Live Try-On on the TV: Women · Men · Kids → the camera on the top 60% of the screen; underneath, Boys or
 * Girls (Kids only), the category tabs and one row of garments that scrolls sideways → tap a garment to pick
 * it → Start Live Try-On in the centre of the camera → 5 seconds to step back → 30 seconds live → the
 * recording plays back with Replay and End session, then the next customer starts from the first screen.
 * Nothing is uploaded or downloaded. Image Try-On uses the same screen (WhoCards, KidsSwitch, GarmentRail).
 */
export default function LucyLiveMirror({
  catalogue: propCatalogue,
  categories,
  onSelectProduct,
  onUsePhotoTryOn,
  onEndSession,
  clientName = '',
}: {
  /** Only the garments the store switched on for Live Try-On. */
  catalogue?: TryFocusProduct[];
  /** Category names, in the store's order, per audience; only those holding a garment are shown. */
  categories?: Record<TryFocusProduct['gender'], Array<{ id: CatalogueCategoryId; label: string }>>;
  onSelectProduct?: (product: TryFocusProduct) => void;
  /** Offered when Live Try-On cannot run, so the customer can still see the outfit on a photo. */
  onUsePhotoTryOn?: (product: TryFocusProduct) => void;
  /** End session under the result: the kiosk clears this customer. */
  onEndSession?: () => void;
  /** The store's name, for the space below the first screen (with no posters or logo). */
  clientName?: string;
} = {}) {
  // Only the store's own Live Try-On garments; with none, the screen says so (never demo garments).
  const activeCatalogue = propCatalogue || [];

  const [phase, setPhase] = useState<Phase>('who');
  const [group, setGroup] = useState<WhoGroup | null>(null);
  const [kidGender, setKidGender] = useState<'boys' | 'girls' | null>(null);
  const gender: TryFocusProduct['gender'] | null = group === 'kids' ? kidGender : group;
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [category, setCategory] = useState<string>('');
  const [garment, setGarment] = useState<TryFocusProduct | null>(null);
  const [session, setSession] = useState<SessionState>('idle');
  const [readyCountdown, setReadyCountdown] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECONDS);
  const [error, setError] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [replaying, setReplaying] = useState(false);

  const replayRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<{ send: (input: Record<string, unknown>) => void; close: () => void } | null>(null);
  const connectionDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const timerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const videoUrlRef = useRef('');

  const isChild = group === 'kids';
  const consentMissing = isChild && !guardianConsent;

  /** The categories that hold at least one Live Try-On garment for this audience, in the store's order. */
  const visibleCategories = useMemo(() => {
    if (!gender) return [];
    const inStock = new Set(activeCatalogue.filter((item) => item.gender === gender).map((item) => item.category as string));
    const named = (categories?.[gender] || []).filter((cat) => inStock.has(cat.id as string));
    const extra = [...inStock].filter((id) => !named.some((cat) => cat.id === id)).map((id) => ({ id: id as CatalogueCategoryId, label: activeCatalogue.find((item) => item.category === id)?.fabricNote?.split(' · ')[0] || id }));
    return [...named, ...extra];
  }, [activeCatalogue, categories, gender]);
  const activeCategory = visibleCategories.some((cat) => cat.id === category) ? category : (visibleCategories[0]?.id as string | undefined);
  const categoryProducts = useMemo(
    () => activeCatalogue.filter((item) => item.gender === gender && item.category === activeCategory),
    [activeCatalogue, gender, activeCategory]
  );

  useEffect(() => {
    const pause = () => { if (document.hidden) stopEverything(); };
    document.addEventListener('visibilitychange', pause);
    return () => {
      document.removeEventListener('visibilitychange', pause);
      stopEverything();
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The camera view mounts after the stream opens (Who → camera), so attach it once both exist.
  useEffect(() => {
    if (phase !== 'camera' || !cameraOn || !streamRef.current || !localVideoRef.current) return;
    if (localVideoRef.current.srcObject !== streamRef.current) {
      localVideoRef.current.srcObject = streamRef.current;
      void localVideoRef.current.play().catch(() => undefined);
    }
  }, [phase, cameraOn]);

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
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 }, aspectRatio: { ideal: 9 / 16 }, frameRate: { ideal: 24, max: 30 } },
          audio: false,
        });
      }
      if (localVideoRef.current && streamRef.current) {
        localVideoRef.current.srcObject = streamRef.current;
        await localVideoRef.current.play().catch(() => undefined);
      }
      setCameraOn(true);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Camera permission is required for Live Try-On.');
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

  async function sendGarmentReference(ws: { send: (input: Record<string, unknown>) => void }, piece: TryFocusProduct) {
    const imageDataUri = await garmentUrlToDataUri(piece.garmentReferenceUrl || piece.imageUrl);
    const person = piece.gender === 'boys' ? ' The person is a young boy; keep his child proportions and fit the garment to his size.'
      : piece.gender === 'girls' ? ' The person is a young girl; keep her child proportions and fit the garment to her size.'
        : '';
    const prompt = `Wear the exact ${piece.title} (${piece.fabricNote || piece.category}). Preserve exact garment color, pattern and fit while keeping the customer's real face and skin tone natural.${person}`;
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

  /** Stops the recorder and hands back the clip; detached first so closing the stream can't drop it. */
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

  /**
   * Tapping a garment picks it; Start Live Try-On on the camera begins the session. During the 30 seconds a
   * tap swaps the garment on the same live connection (Lucy takes a new reference image mid-session), and
   * the clock keeps running, so one session can show two or three outfits.
   */
  function pickGarment(piece: TryFocusProduct) {
    if (session === 'live') {
      if (piece.sku === garment?.sku || !wsRef.current) return;
      setGarment(piece);
      onSelectProduct?.(piece);
      void sendGarmentReference(wsRef.current, piece).catch(() => setError('That outfit could not be loaded. Try another.'));
      return;
    }
    if (session === 'ready' || session === 'connecting') return;
    setGarment(piece);
    onSelectProduct?.(piece);
    setError('');
    if (session === 'error') { closeRealtimeConnections(); setSession('idle'); }
  }

  /** Start Live Try-On: 5 seconds to step back from the TV, then the live session. */
  function startSession(piece: TryFocusProduct) {
    if (consentMissing) { setError('A parent or guardian must approve first.'); return; }
    setError('');
    clearCountdownTimer();
    setSession('ready');
    setReadyCountdown(READY_COUNTDOWN_SECONDS);
    let remaining = READY_COUNTDOWN_SECONDS;
    countdownTimerRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) { clearCountdownTimer(); void startLucyLiveSession(piece); }
      else setReadyCountdown(remaining);
    }, 1000);
  }

  function startPaidSessionWindow() {
    void fetch('/api/fal/realtime-session', { method: 'POST' }).catch(() => undefined);
    setSession('live');
    startRecording();
    setSecondsLeft(SESSION_SECONDS);
    clearSessionTimer();
    timerRef.current = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) { void endLiveSession(); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function startLucyLiveSession(piece: TryFocusProduct) {
    setError('');
    closeRealtimeConnections();
    setSession('connecting');
    setSecondsLeft(SESSION_SECONDS);

    try {
      if (!streamRef.current) {
        const ok = await enableCamera();
        if (!ok) { setSession('error'); return; }
      }
      const stream = streamRef.current;
      if (!stream) throw new Error('Camera feed is not ready.');

      let stopped = false;
      const pendingCandidates: RTCIceCandidateInit[] = [];
      const fail = (message: string) => {
        if (stopped) return;
        stopped = true;
        closeRealtimeConnections();
        setSession('error');
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
        onError: (caught) => fail(caught.message || 'Live Try-On could not connect. Please ask staff for help.'),
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
                  startPaidSessionWindow();
                };
                void video.play().catch(() => fail('Tap the outfit again to allow live video playback.'));
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
              fail(String(message.error || 'This garment could not be loaded. Choose another one.'));
            }
          } catch (caught) { fail(caught instanceof Error ? caught.message : 'Live Try-On could not connect.'); }
        },
      });
      wsRef.current = connection;
      connectionDeadlineRef.current = setTimeout(() => fail('Live Try-On took too long to connect. Please try again.'), 30_000);
      await sendGarmentReference(connection, piece);
    } catch (caught) {
      closeRealtimeConnections();
      setSession('error');
      setError(caught instanceof Error ? caught.message : 'Unable to start Live Try-On.');
    }
  }

  /** The 30 seconds are up (or cut short): keep the clip on this TV only and play it back. */
  async function endLiveSession() {
    const blob = await finishRecording();
    stopEverything();
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    videoUrlRef.current = blob ? URL.createObjectURL(blob) : '';
    setVideoUrl(videoUrlRef.current);
    setSession('idle');
    setReplaying(false);
    setPhase('result');
  }

  function cancelCurrent() {
    if (session === 'live') { void endLiveSession(); return; }
    closeRealtimeConnections();
    setSession('idle');
  }

  async function openCamera() {
    setCategory('');
    setPhase('camera');
    await enableCamera();
  }

  function chooseWho(next: WhoGroup) {
    setGroup(next);
    setKidGender(null);
    setGuardianConsent(false);
    setGarment(null);
    setError('');
    void openCamera();
  }

  function chooseKid(next: 'boys' | 'girls') {
    if (next === kidGender) return;
    setKidGender(next);
    setCategory('');
    setGarment(null);
  }

  function backToWho() {
    stopEverything();
    setSession('idle');
    setGarment(null);
    setPhase('who');
  }

  function endSession() {
    stopEverything();
    if (onEndSession) { onEndSession(); return; }
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    videoUrlRef.current = '';
    setVideoUrl('');
    setGroup(null);
    setKidGender(null);
    setGuardianConsent(false);
    setGarment(null);
    setPhase('who');
  }

  const running = session === 'ready' || session === 'connecting' || session === 'live';
  const progressPercent = Math.max(0, Math.min(100, (secondsLeft / SESSION_SECONDS) * 100));

  if (phase === 'who') {
    return (
      <div className="flex min-h-[calc(100dvh-260px)] flex-col gap-7">
        <div className="space-y-3">
          <PageTitle size="lg" title="Live Try-On" subtitle="See an outfit on you, live on camera, for 30 seconds." />
          <PhotoConsentNotice kind="live" large />
        </div>
        <WhoCards value={group} onChange={chooseWho} />
        {error && <p className="rounded-xl bg-danger-soft p-4 text-lg text-danger">{error}</p>}
        <PosterFill clientName={clientName} />
      </div>
    );
  }

  if (phase === 'result') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <PageTitle size="lg" title="Your Live Try-On" subtitle={garment ? garment.title : undefined} />
        </div>
        <div className="relative w-full overflow-hidden rounded-2xl bg-ink" style={{ height: '72vh', maxHeight: '1100px' }}>
          {videoUrl ? (
            <>
              <video
                ref={replayRef}
                src={videoUrl}
                autoPlay
                playsInline
                onPlay={() => setReplaying(true)}
                onEnded={() => setReplaying(false)}
                className="absolute inset-0 h-full w-full bg-ink object-cover"
              />
              {!replaying && (
                <button type="button" onClick={() => { if (replayRef.current) { replayRef.current.currentTime = 0; void replayRef.current.play(); } }} className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink/45 text-white" aria-label="Replay">
                  <span className="flex h-28 w-28 items-center justify-center rounded-full bg-white/95 text-ink shadow-2xl"><Play className="ml-1.5 h-12 w-12 fill-current" /></span>
                  <span className="text-2xl font-bold drop-shadow">Replay</span>
                </button>
              )}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-white">
              <p className="text-3xl font-bold">This TV could not record the video.</p>
              <p className="mt-3 text-lg text-white/80">You saw it live; nothing else is kept.</p>
            </div>
          )}
        </div>
        {videoUrl && (
          <button type="button" onClick={() => { if (replayRef.current) { replayRef.current.currentTime = 0; void replayRef.current.play(); } }} className="tf-btn tf-btn-secondary !min-h-16 w-full text-lg">
            <RotateCcw className="h-6 w-6" /> Replay
          </button>
        )}
        <button type="button" onClick={endSession} className="tf-btn !min-h-24 w-full bg-danger text-2xl font-bold text-white hover:bg-danger/90">End session</button>
      </div>
    );
  }

  // A clear, spaced column: Back and the title, then (Kids) Boys or Girls, the camera, and the outfits.
  return (
    <div className="space-y-7">
      <div className="space-y-4">
        <button type="button" onClick={backToWho} disabled={running} className="tf-btn !min-h-16 border-2 border-ink bg-white px-6 text-lg font-bold text-ink disabled:opacity-40">
          <ChevronLeft className="h-6 w-6" /> Back
        </button>
        <PageTitle size="lg" title="Live Try-On" subtitle={isChild && !kidGender ? 'Tap Boys or Girls, then pick an outfit.' : 'Pick an outfit, step back, and see it on you for 30 seconds.'} />
      </div>

      {/* Kids: Boys or Girls on top of the camera, so the outfits and Lucy's instructions follow. */}
      {isChild && (
        <div className="space-y-4">
          <KidsSwitch value={kidGender} onChange={chooseKid} disabled={running} />
          {kidGender && (
            <AgreeButton size="lg" checked={guardianConsent} onChange={setGuardianConsent}>I am the parent or guardian and approve this child’s Live Try-On.</AgreeButton>
          )}
        </div>
      )}

      <div className="relative w-full overflow-hidden rounded-3xl bg-ink shadow-md" style={{ height: isChild ? '42vh' : '50vh' }}>
        <video ref={localVideoRef} playsInline muted autoPlay className={`h-full w-full object-cover [transform:scaleX(-1)] ${session === 'live' ? 'opacity-0' : 'opacity-100'}`} />
        <video ref={remoteVideoRef} playsInline muted autoPlay className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${session === 'live' ? 'opacity-100' : 'pointer-events-none opacity-0'}`} />

        {session === 'live' && (
          <>
            <span className="absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-xl font-bold tabular-nums text-white shadow-lg">
              <span className="h-3 w-3 rounded-full bg-success" /> {secondsLeft}s
            </span>
            <div className="absolute inset-x-0 bottom-0 h-2 bg-white/20">
              <div className="h-full bg-white transition-all duration-1000 ease-linear" style={{ width: `${progressPercent}%` }} />
            </div>
          </>
        )}

        {running && (
          <button type="button" onClick={cancelCurrent} aria-label="Stop" className="absolute right-4 top-4 z-40 flex h-16 w-16 items-center justify-center rounded-full border-2 border-ink bg-white text-ink shadow-lg hover:bg-canvas">
            <X className="h-8 w-8" />
          </button>
        )}

        {cameraOn && session === 'idle' && !garment && (
          <p className="absolute inset-x-6 bottom-6 z-10 mx-auto w-fit rounded-full bg-ink px-6 py-3 text-xl font-semibold text-white shadow-lg">
            {isChild && !kidGender ? 'Tap Boys or Girls below' : 'Pick an outfit below'}
          </p>
        )}

        {/* The one action on the camera, in its centre, once an outfit is picked. */}
        {cameraOn && session === 'idle' && garment && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 p-8">
            <button type="button" disabled={consentMissing} onClick={() => startSession(garment)} className="tf-btn tf-btn-primary !min-h-24 !w-auto px-12 text-3xl shadow-2xl disabled:opacity-60">
              <Sparkles className="h-9 w-9" /> Start Live Try-On
            </button>
            <p className="rounded-full bg-ink px-5 py-2 text-lg font-semibold text-white shadow-lg">{garment.title}</p>
          </div>
        )}

        {session === 'ready' && readyCountdown !== null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/55 p-8 text-center text-white">
            <p className="text-3xl font-semibold">Step back so your whole outfit is in view</p>
            <p className="mt-6 text-[180px] font-bold leading-none tabular-nums">{readyCountdown}</p>
            {garment && <p className="mt-6 text-xl text-white/85">{garment.title}</p>}
          </div>
        )}

        {session === 'connecting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/70 p-8 text-center text-white">
            <LoaderCircle className="h-16 w-16 animate-spin" />
            <p className="mt-4 text-3xl font-bold">Dressing you in {garment?.title}</p>
            <p className="mt-2 max-w-md text-lg text-white/80">Your 30 seconds start when the live picture appears.</p>
          </div>
        )}

        {!cameraOn && session !== 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/85 p-8 text-center text-white">
            <Camera className="h-14 w-14" />
            <p className="mt-4 text-3xl font-bold">Opening the camera…</p>
            <button type="button" onClick={() => void enableCamera()} className="tf-btn tf-btn-primary mt-6 !min-h-16 !w-auto px-8 text-lg"><Camera className="h-6 w-6" /> Open camera</button>
          </div>
        )}

        {session === 'error' && error && (
          <div className="absolute inset-x-4 bottom-6 z-20 rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-7 w-7 shrink-0 text-danger" />
              <div className="min-w-0">
                <p className="text-lg font-bold text-ink">Live Try-On is not running.</p>
                <p className="mt-1 text-base text-muted">{error}</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {garment && <button type="button" onClick={() => startSession(garment)} className="tf-btn tf-btn-primary !min-h-16 px-6 text-lg">Try again</button>}
                  {onUsePhotoTryOn && garment && (
                    <button type="button" onClick={() => { stopEverything(); onUsePhotoTryOn(garment); }} className="tf-btn tf-btn-secondary !min-h-16 px-6 text-lg">Try it on a photo instead</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {gender && (visibleCategories.length === 0 ? (
        <p className="p-6 text-center text-xl text-muted">No Live Try-On outfits for {AUDIENCE_LABELS[gender]} yet. Ask the store team.</p>
      ) : (
        <GarmentRail
          tabs={visibleCategories.map((cat) => ({ id: cat.id as string, label: cat.label }))}
          activeTab={activeCategory}
          onTab={(id) => setCategory(id)}
          items={categoryProducts}
          selected={garment ? [garment.sku] : []}
          max={1}
          onToggle={pickGarment}
          disabled={session === 'ready' || session === 'connecting'}
        />
      ))}
    </div>
  );
}
