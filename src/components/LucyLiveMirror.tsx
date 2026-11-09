'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fal } from '@fal-ai/client';
import QRCode from 'qrcode';
import { createImageHandoff } from '@/lib/maharaja/image-handoff-client';
import {
  Camera,
  Check,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Square,
} from 'lucide-react';
import {
  sampleCatalogue,
  type CatalogueCategoryId,
  type TryFocusProduct,
} from '@/lib/tryfocus/sample-data';
import PhotoConsentNotice from '@/components/PhotoConsentNotice';
import { PageTitle, Segmented } from '@/components/ui';
import { LIVE_CATEGORIES } from '@/lib/tryfocus/live-categories';

const LUCY_VTON_APP = 'decart/lucy2-vton/realtime';
const SESSION_SECONDS = 30;
const READY_COUNTDOWN_SECONDS = 5;
// MP4 first: phones play it everywhere; Chrome on older TVs falls back to WebM.
const RECORDING_TYPES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
const AUDIENCES = [
  { value: 'women', label: 'Women' },
  { value: 'men', label: 'Men' },
  { value: 'boys', label: 'Boys' },
  { value: 'girls', label: 'Girls' },
] as const;

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
  onUsePhotoTryOn,
}: {
  catalogue?: TryFocusProduct[];
  garmentPrompt?: string;
  garmentTitle?: string;
  selectedProduct?: TryFocusProduct;
  onSelectProduct?: (product: TryFocusProduct) => void;
  /** Offered when Live Mirror cannot run, so the customer can still see the outfit on a photo. */
  onUsePhotoTryOn?: (product: TryFocusProduct) => void;
} = {}) {
  const activeCatalogue = propCatalogue && propCatalogue.length > 0 ? propCatalogue : sampleCatalogue;

  const [gender, setGender] = useState<TryFocusProduct['gender']>(externalProduct?.gender || 'women');
  // Who starts empty until the customer taps one (unless a piece was already chosen for them).
  const [genderChosen, setGenderChosen] = useState(Boolean(externalProduct));
  const [category, setCategory] = useState<CatalogueCategoryId>(externalProduct?.category || LIVE_CATEGORIES.women[0].id);
  const [selectedGarment, setSelectedGarment] = useState<TryFocusProduct>(
    externalProduct || activeCatalogue[0]
  );
  const [state, setState] = useState<LiveState>('idle');
  const [readyCountdown, setReadyCountdown] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECONDS);
  const [error, setError] = useState('');
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    'Open the camera, pick an outfit, then tap Start.'
  );
  // The finished session: its recording plays back in the mirror, with the QR pinned under it.
  const [recordingUrl, setRecordingUrl] = useState('');
  const [replaying, setReplaying] = useState(false);
  const replayRef = useRef<HTMLVideoElement>(null);
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
  // The whole live session is recorded on the TV so the customer can take the video home.
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const wornTitlesRef = useRef<string[]>([]);
  // One still per outfit worn, shown side by side on the customer's phone.
  const lookShotsRef = useRef<Array<{ title: string; image: string }>>([]);

  const visibleCategories = useMemo(
    () => LIVE_CATEGORIES[gender].filter((cat) => activeCatalogue.some((item) => item.gender === gender && item.category === cat.id)),
    [activeCatalogue, gender]
  );
  const activeCategory = visibleCategories.some((cat) => cat.id === category) ? category : visibleCategories[0]?.id;

  const categoryProducts = useMemo(
    () => activeCatalogue.filter((item) => item.gender === gender && item.category === activeCategory),
    [activeCatalogue, gender, activeCategory]
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
    discardRecording();
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
            width: { ideal: 1080 },
            height: { ideal: 1920 },
            aspectRatio: { ideal: 9 / 16 },
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
        'Camera is on. Pick an outfit, then tap Start.'
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Camera permission is required for the Live Mirror.'
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

  /** Stops the recorder and hands back the session video; the recorder is detached first so closing the stream cannot drop it. */
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
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
  }

  /** Uploads the session video and returns the private link for the customer's QR. */
  async function saveRecording(blob: Blob) {
    const post = async (body: Record<string, unknown>) => {
      const response = await fetch('/api/tv/mirror-recording', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'The video could not be saved.');
      return data;
    };
    const start = await post({ action: 'upload-url', contentType: blob.type, sizeBytes: blob.size });
    const upload = await fetch(start.uploadUrl, { method: 'PUT', headers: { 'Content-Type': start.contentType }, body: blob });
    if (!upload.ok) throw new Error('The video upload was interrupted.');
    const done = await post({ action: 'confirm', id: start.id, contentType: start.contentType, garmentTitle: wornTitlesRef.current.join(' · '), looks: lookShotsRef.current });
    return String(done.link);
  }

  function startPaidSessionWindow() {
    if (paidTimerStartedRef.current) return;
    paidTimerStartedRef.current = true;
    void fetch('/api/fal/realtime-session', { method: 'POST' }).catch(() => undefined);
    setState('live');
    wornTitlesRef.current = [selectedGarmentRef.current.title];
    lookShotsRef.current = [];
    startRecording();
    setSecondsLeft(SESSION_SECONDS);
    setStatusMessage(
      'Turn and move. Tap another outfit to change it.'
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
    clearRecording();

    // Ensure camera preview is running first
    if (!streamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1080 },
            height: { ideal: 1920 },
            aspectRatio: { ideal: 9 / 16 },
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
            : 'Camera permission is required for the Live Mirror.'
        );
        setState('error');
        return;
      }
    }

    // 3-2-1 Ready Countdown before initiating connection so customer can step back
    clearCountdownTimer();
    setState('ready_countdown');
    setReadyCountdown(READY_COUNTDOWN_SECONDS);
    setStatusMessage('Step back into full view. Your Live Mirror starts in 5 seconds.');

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
    clearRecording();
    closeRealtimeConnections();
    setState('connecting');
    setSecondsLeft(SESSION_SECONDS);
    setStatusMessage('Connecting. Your 30 seconds start when the live picture appears.');

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
        tokenExpirationSeconds: 120,
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
                  startPaidSessionWindow();
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
        caught instanceof Error ? caught.message : 'Unable to start Live Mirror.'
      );
      setState('error');
    }
  }

  /** A still of the last frame, kept as the fallback when this TV browser cannot record video. */
  function captureSnapshot() {
    const video = remoteVideoRef.current?.videoWidth ? remoteVideoRef.current : localVideoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return '';
    const targetAspect = 9 / 16;
    const currentAspect = video.videoWidth / video.videoHeight;
    let sx = 0, sy = 0, sWidth = video.videoWidth, sHeight = video.videoHeight;
    if (currentAspect > targetAspect) {
      sWidth = Math.round(video.videoHeight * targetAspect);
      sx = Math.round((video.videoWidth - sWidth) / 2);
    } else if (currentAspect < targetAspect) {
      sHeight = Math.round(video.videoWidth / targetAspect);
      sy = Math.round((video.videoHeight - sHeight) / 2);
    }
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 1280;
    const context = canvas.getContext('2d');
    if (!context) return '';
    context.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  function stopSession(nextState: LiveState = 'camera_ready') {
    if (nextState === 'complete') {
      setQrDataUrl('');
      setHandoffMessage('Saving your video…');
      const snapshot = captureSnapshot();
      keepLookShot(selectedGarmentRef.current.title, snapshot);
      const garment = selectedGarmentRef.current;
      void finishRecording()
        .then(async (blob) => {
          if (!blob) throw new Error('no recording');
          setRecordingUrl(URL.createObjectURL(blob));
          const link = await saveRecording(blob);
          setQrDataUrl(await QRCode.toDataURL(link, { width: 360, margin: 2 }));
          setHandoffMessage('Scan to download your whole Live Mirror video. The link works for 1 hour.');
        })
        .catch(async () => {
          if (!snapshot) { setHandoffMessage('Your video could not be saved this time. Ask a store assistant for help.'); return; }
          try {
            setQrDataUrl(await createImageHandoff(snapshot, garment.sku, garment.title));
            setHandoffMessage('Your video could not be saved, so this QR saves a picture of your look instead.');
          } catch {
            setHandoffMessage('Your video could not be saved this time. Ask a store assistant for help.');
          }
        });
    }
    closeRealtimeConnections();
    setState(nextState);
    if (nextState === 'complete') {
      setStatusMessage('Your session is over.');
    } else {
      setStatusMessage('Stopped. Tap Start when you are ready.');
    }
  }

  /** Drops the last session's playback (a new session, or back to the mirror). */
  function clearRecording() {
    setRecordingUrl((old) => { if (old) URL.revokeObjectURL(old); return ''; });
    setReplaying(false);
  }

  /** After a session: back to the live camera preview, ready for another. */
  function backToMirror() {
    clearRecording();
    setQrDataUrl('');
    setState('camera_ready');
    setStatusMessage('Pick an outfit, then tap Start live.');
  }

  /** Keeps a still of the outfit on screen now; one per outfit, the latest frame wins. */
  function keepLookShot(title: string, image = captureSnapshot()) {
    if (!image) return;
    const others = lookShotsRef.current.filter((look) => look.title !== title);
    lookShotsRef.current = [...others, { title, image }].slice(-6);
  }

  async function selectGarment(item: TryFocusProduct) {
    // Before switching, keep a picture of the outfit the customer is wearing now.
    if (recorderRef.current && selectedGarmentRef.current.title !== item.title) keepLookShot(selectedGarmentRef.current.title);
    setSelectedGarment(item);
    selectedGarmentRef.current = item;
    if (recorderRef.current && !wornTitlesRef.current.includes(item.title)) wornTitlesRef.current.push(item.title);
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

  const progressPercent = Math.max(0, Math.min(100, (secondsLeft / SESSION_SECONDS) * 100));
  const running = state === 'live' || state === 'connecting' || state === 'ready_countdown';
  const stateLabel =
    state === 'live' ? `Live · ${secondsLeft}s left`
      : state === 'ready_countdown' ? `Get ready · ${readyCountdown}s`
        : state === 'connecting' ? 'Connecting…'
          : state === 'error' ? 'Camera only · Live Mirror unavailable'
            : state === 'camera_ready' ? 'Camera preview · not live yet'
              : 'Camera off';

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <PageTitle size="lg" title="Live Mirror" subtitle="See the outfit move with you. Pick one, tap Start live and step back. 30 seconds, change outfits any time." />
        <PhotoConsentNotice kind="live" large />
      </div>

      <Segmented
        label="Who is it for?"
        size="lg"
        options={[...AUDIENCES]}
        value={genderChosen ? gender : null}
        onChange={(g) => {
          setGenderChosen(true);
          setGender(g);
          const first = LIVE_CATEGORIES[g]
            .map((cat) => activeCatalogue.find((item) => item.gender === g && item.category === cat.id))
            .find(Boolean);
          if (first) { setCategory(first.category); void selectGarment(first); }
        }}
      />

      {!genderChosen && <p className="rounded-2xl bg-white p-6 text-center text-xl text-muted">Tap Women, Men, Boys or Girls to see the outfits.</p>}

      {genderChosen && (gender === 'boys' || gender === 'girls') && (
        <label className="flex min-h-16 items-center gap-3 rounded-2xl bg-warn-soft p-4 text-lg text-ink">
          <input type="checkbox" checked={guardianConsent} onChange={(event) => setGuardianConsent(event.target.checked)} className="h-6 w-6 accent-brand" />
          I am the parent or guardian and approve this child’s Live Mirror session.
        </label>
      )}

      <div className={`tv-live-row grid min-w-0 gap-5 lg:grid-cols-[minmax(380px,460px)_1fr] ${genderChosen ? '' : 'hidden'}`}>
        <aside className="tv-live-menu flex min-w-0 flex-col rounded-2xl border border-line bg-white p-4">
          <div role="group" aria-label="Category" className="tv-live-category-list border-b border-line">
            {visibleCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                aria-pressed={activeCategory === cat.id}
                onClick={() => {
                  setCategory(cat.id);
                          const first = activeCatalogue.find((item) => item.gender === gender && item.category === cat.id);
                  if (first) void selectGarment(first);
                }}
                className={`-mb-px min-h-16 border-b-[3px] px-1 text-lg font-semibold leading-tight ${
                  activeCategory === cat.id ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="tv-live-garments mt-4">
            {categoryProducts.length === 0 && <p className="p-3 text-lg text-muted">No outfits here yet. Ask the store to add some.</p>}
            {categoryProducts.map((item) => {
              const active = selectedGarment.sku === item.sku;
              return (
                <button
                  key={item.sku}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectGarment(item)}
                  className={`relative min-w-0 overflow-hidden rounded-xl border-2 bg-white text-left transition ${active ? 'border-ink shadow-md' : 'border-line hover:border-ink'}`}
                >
                  <div className="aspect-[3/4] w-full overflow-hidden bg-canvas">
                    <img src={item.thumbnailUrl || item.imageUrl} alt={item.title} loading="lazy" className="h-full w-full object-contain object-top" />
                  </div>
                  {active && <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white"><Check className="h-5 w-5" /></span>}
                  <div className="p-2.5">
                    <p className="line-clamp-1 text-base font-semibold text-ink">{item.title}</p>
                  </div>
                </button>
              );
            })}
          </div>

        </aside>

        <div className="tv-live-camera relative aspect-[9/16] w-full min-w-0 overflow-hidden rounded-2xl bg-ink">
          {/* The camera preview is never presented as the AI result. */}
          <video
            ref={localVideoRef}
            playsInline
            muted
            autoPlay
            className={`h-full w-full object-cover [transform:scaleX(-1)] ${state === 'live' ? 'opacity-0' : 'opacity-100'}`}
          />
          <video
            ref={remoteVideoRef}
            playsInline
            muted
            autoPlay
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${state === 'live' ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          />

          <span className="absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-full bg-ink/80 px-4 py-2 text-base font-semibold text-white backdrop-blur">
            <span className={`h-2.5 w-2.5 rounded-full ${state === 'live' ? 'bg-success' : state === 'error' ? 'bg-danger' : 'bg-white/60'}`} />
            {stateLabel}
          </span>

          {/* The outfit being worn, as in the reference mirror: a small card in the top-right corner. */}
          <div className="absolute right-4 top-4 z-10 flex max-w-[55%] items-center gap-3 rounded-2xl bg-white/95 p-2 pr-4 shadow-lg">
            <img src={selectedGarment.thumbnailUrl || selectedGarment.imageUrl} alt="" className="h-20 w-16 shrink-0 rounded-lg bg-canvas object-contain object-top" />
            <div className="min-w-0">
              <p className="line-clamp-2 text-base font-semibold leading-snug text-ink">{selectedGarment.title}</p>
            </div>
          </div>

          {state === 'live' && (
            <div className="absolute inset-x-0 bottom-0 h-2 bg-white/20">
              <div className="h-full bg-white transition-all duration-1000 ease-linear" style={{ width: `${progressPercent}%` }} />
            </div>
          )}

          {state === 'ready_countdown' && readyCountdown !== null && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/55 p-8 text-center text-white">
              <p className="text-2xl font-semibold">Step back so your whole outfit is in view</p>
              <p className="mt-6 text-[160px] font-bold leading-none tabular-nums">{readyCountdown}</p>
              <p className="mt-6 text-lg text-white/80">Starting {selectedGarment.title}</p>
            </div>
          )}

          {state === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/85 p-8 text-center text-white">
              <Camera className="h-14 w-14" />
              <p className="mt-4 text-3xl font-bold">Stand in front of the screen</p>
              <p className="mt-2 max-w-sm text-lg text-white/80">Open the camera to see yourself first. Nothing is live until you tap Start.</p>
            </div>
          )}

          {state === 'connecting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/70 p-8 text-center text-white">
              <LoaderCircle className="h-14 w-14 animate-spin" />
              <p className="mt-4 text-3xl font-bold">Dressing you in {selectedGarment.title}</p>
              <p className="mt-2 max-w-sm text-lg text-white/80">Your 30 seconds start when the live picture appears.</p>
            </div>
          )}

          {state === 'complete' && recordingUrl && (
            <>
              <video
                ref={replayRef}
                src={recordingUrl}
                playsInline
                controls={replaying}
                onPlay={() => setReplaying(true)}
                onEnded={() => setReplaying(false)}
                className="absolute inset-0 z-20 h-full w-full bg-ink object-cover"
              />
              {!replaying && (
                <button type="button" onClick={() => void replayRef.current?.play()} className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-ink/45 text-white" aria-label="Play your Live Mirror video">
                  <span className="flex h-28 w-28 items-center justify-center rounded-full bg-white/95 text-ink shadow-2xl"><Play className="ml-1.5 h-12 w-12 fill-current" /></span>
                  <span className="text-2xl font-bold drop-shadow">Play your Live Mirror</span>
                </button>
              )}
            </>
          )}

          {state === 'error' && error && (
            <div className="absolute inset-x-4 bottom-6 rounded-2xl bg-white p-5 shadow-xl">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-7 w-7 shrink-0 text-danger" />
                <div>
                  <p className="text-lg font-bold text-ink">Live Mirror is not running. This is the plain camera.</p>
                  <p className="mt-1 text-base text-muted">{error}</p>
                  {onUsePhotoTryOn && (
                    <button type="button" onClick={() => { stopEverything(); onUsePhotoTryOn(selectedGarment); }} className="tf-btn tf-btn-secondary mt-3 !min-h-16 text-lg">
                      Try this outfit on a photo instead
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* After a session: the QR in its permanent spot at the bottom, with the next step beside it. */}
      {state === 'complete' && (
        <section className="tf-card sticky bottom-4 z-20 flex flex-wrap items-center gap-5 p-5 shadow-xl" aria-label="Take your Live Mirror video home">
          <div className="flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white">
            {qrDataUrl ? <img src={qrDataUrl} alt="Scan to save your Live Mirror video" className="h-full w-full object-contain" /> : <LoaderCircle className="h-10 w-10 animate-spin text-muted" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-bold text-ink">Take your Live Mirror video home</p>
            <p className="mt-1 text-base text-muted">{handoffMessage || 'Scan with your phone camera.'}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <button type="button" onClick={beginLiveCountdownAndConnect} className="tf-btn tf-btn-primary !min-h-16 px-6 text-lg"><RefreshCw className="h-5 w-5" /> Another 30 seconds</button>
            <button type="button" onClick={backToMirror} className="tf-btn tf-btn-secondary !min-h-14 px-6 text-base">Back to mirror</button>
          </div>
        </section>
      )}

      {/* One primary action, in a floating bar on the TV. */}
      {state !== 'complete' && genderChosen && <section className="tv-live-controls tv-selection-bar sticky z-20 mx-auto flex items-center justify-between gap-5" aria-label="Live Mirror controls">
        <div className="min-w-0">
          <p className="truncate text-xl font-bold text-ink">{selectedGarment.title}</p>
          <p className="text-base text-muted">{statusMessage}</p>
        </div>
        {state === 'idle' ? (
          <button type="button" onClick={enableCameraPreview} className="tf-btn tf-btn-primary tv-live-action !w-auto shrink-0">
            <Camera className="h-6 w-6" /> Open camera
          </button>
        ) : running ? (
          <button type="button" onClick={() => stopSession(state === 'live' ? 'complete' : 'camera_ready')} className="tf-btn tf-btn-secondary tv-live-action !w-auto shrink-0">
            <Square className="h-6 w-6 fill-current" /> Stop
          </button>
        ) : (
          <button type="button" onClick={beginLiveCountdownAndConnect} className="tf-btn tf-btn-primary tv-live-action !w-auto shrink-0">
            {state === 'error' ? <RefreshCw className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
            {state === 'error' ? 'Try again' : 'Start live'}
          </button>
        )}
      </section>}

    </div>
  );
}
