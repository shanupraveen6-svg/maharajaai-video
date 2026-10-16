'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertCircle,
  ArrowRight,
  BadgeIndianRupee,
  Camera,
  CheckCircle2,
  Download,
  Film,
  Image as ImageIcon,
  LoaderCircle,
  Shirt,
  Sparkles,
  ScanLine,
  User,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { compressImage } from '@/lib/utils/image';
import {
  buildEventVideoPrompt,
  buildFailSafeVideoPrompt,
  buildMasterPrompt,
  EVENT_OPTIONS,
  getEventOption,
  type CustomerCategory,
  type EventId,
} from '@/lib/maharaja/config';

const BarcodePriceScanner = dynamic(() => import('@/components/BarcodePriceScanner'), { ssr: false });
const SecureTryOnViewer = dynamic(() => import('@/components/SecureTryOnViewer'), { ssr: false });
const ResultClient = dynamic(() => import('@/app/result/[sessionId]/ResultClient'), { ssr: false });

type AccessResponse = {
  workspace: { clientName: string; campaignEnabled: boolean; tryOnMinimum: number; aiVideoMinimum: number; activeEvents: EventId[]; defaultEvent: EventId };
  access: {
    service: 'try-on' | 'ai-video';
    eventId: EventId;
    eventLabel: string;
    phoneMasked: string | null;
    billLast4: string | null;
    tryOnUsed: boolean;
  };
};

type Analysis = Record<string, unknown> & {
  valid?: boolean;
  additionalPhotoRequired?: boolean;
  operatorMessage?: string;
  garmentType?: string;
  primaryColor?: string;
};

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'Request failed.');
  return data;
}

function customerError(caught: unknown, fallback: string) {
  const message = caught instanceof Error ? caught.message : fallback;
  if (/gemini|veo|fal\.ai|minimax|model|api key|quota|provider/i.test(message)) {
    return 'The AI service is temporarily unavailable. Please ask Maharaja staff for assistance and try again later.';
  }
  return message || fallback;
}

export default function MaharajaExperience({ service, accessCode, retrySessionId = '' }: { service: 'try-on' | 'ai-video'; accessCode: string; retrySessionId?: string }) {
  const [access, setAccess] = useState<AccessResponse | null>(null);
  const [activeService, setActiveService] = useState<'try-on' | 'ai-video'>(service);
  const [eventId, setEventId] = useState<EventId>('diwali');
  const [category, setCategory] = useState<CustomerCategory>('women');
  const [videoProgressIndex, setVideoProgressIndex] = useState(0);
  const [purchaseConfirmed, setPurchaseConfirmed] = useState(service === 'ai-video');
  const [isFullCameraOpen, setIsFullCameraOpen] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [tryOnGrant, setTryOnGrant] = useState('');
  const [tryOnUsed, setTryOnUsed] = useState(false);
  const [retryUsed, setRetryUsed] = useState(false);
  const [personPhoto, setPersonPhoto] = useState<string | null>(null);
  const [garmentPhotos, setGarmentPhotos] = useState<string[]>([]);
  const [garmentRoles, setGarmentRoles] = useState<string[]>(['Top / Shirt', 'Bottom / Pant', 'Extra / Layer']);
  const [personAnalysis, setPersonAnalysis] = useState<Analysis | null>(null);
  const [garmentAnalysis, setGarmentAnalysis] = useState<Analysis | null>(null);
  const [tryOnImageUrl, setTryOnImageUrl] = useState<string | null>(null);
  const [videoMasterUrl, setVideoMasterUrl] = useState<string | null>(null);
  const [sessionId] = useState(() => `maharaja_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`);
  const [stage, setStage] = useState<'loading' | 'ready' | 'analyzing' | 'image' | 'video' | 'result'>('loading');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  // Each tab shows its own image: plain Try-On vs. festival video master.
  const isTryOn = activeService === 'try-on';
  const maxGarmentPhotos = isTryOn ? 1 : 3;
  const visibleGarmentPhotos = garmentPhotos.slice(0, maxGarmentPhotos);
  const masterImageUrl = isTryOn ? tryOnImageUrl : videoMasterUrl;
  // A billing pass owns its two stored images; they are never cleared or regenerated client-side.
  const passOwnsImages = service === 'ai-video';
  // Each billing-pass tab owns a separate result. Completing Try-On must not
  // lock the source controls needed to prepare the AI Video master (or vice versa).
  const imagesLocked = passOwnsImages && (isTryOn ? !!tryOnImageUrl : !!videoMasterUrl);
  function clearActiveImage() {
    if (passOwnsImages) return;
    setTryOnImageUrl(null);
    setVideoMasterUrl(null);
  }

  async function handleRetryImage() {
    if (retryUsed) return;
    try {
      const res = await fetch('/api/maharaja/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'retry',
          label: activeService === 'try-on'
            ? 'Customer Try-On photo re-upload retry'
            : 'Customer AI Video photo re-upload retry',
          accessCode,
          target: 'image',
          service: activeService,
          deviceId,
          sessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Retry request could not be processed.');
      }
      setRetryUsed(true);
      if (activeService === 'try-on') {
        setTryOnImageUrl(null);
        setTryOnUsed(false);
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('tryfocus:maharaja:try-on-completed');
        }
      } else {
        setVideoMasterUrl(null);
      }
      setPersonPhoto(null);
      setPersonAnalysis(null);
      setGarmentPhotos([]);
      setGarmentAnalysis(null);
      setMessage('Retry granted. Please upload or capture fresh customer and garment photo(s).');
      setError('');
    } catch (err) {
      setError(customerError(err, 'Could not initiate retry.'));
    }
  }

  function resetTryOnForRetest() {
    setTryOnUsed(false);
    setPurchaseConfirmed(false);
    setTryOnImageUrl(null);
    setGarmentPhotos([]);
    setGarmentAnalysis(null);
    setTryOnGrant('');
    setMessage('');
    setError('');
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('tryfocus:maharaja:try-on-completed');
    }
  }

  useEffect(() => {
    const key = 'tryfocus:maharaja:device-id';
    const stored = window.localStorage.getItem(key);
    const next = stored || crypto.randomUUID().replace(/-/g, '');
    if (!stored) window.localStorage.setItem(key, next);
    setDeviceId(next);
  }, []);

  useEffect(() => {
    if (!deviceId) return;
    let active = true;
    async function loadAccess() {
      try {
        const data = await readJson(await fetch(`/api/maharaja/access/${encodeURIComponent(accessCode)}?service=${service}&deviceId=${encodeURIComponent(deviceId)}`, { cache: 'no-store' }));
        if (!active) return;
        setAccess(data);
        setEventId(data.access.eventId);
        setPurchaseConfirmed(data.access.service === 'ai-video');
        const used = data.access.service === 'try-on' && data.access.tryOnUsed === true;
        setTryOnUsed(used);
        if (data.access?.retryUsed) setRetryUsed(true);
        if (retrySessionId && data.access.service === 'ai-video') {
          const retryData = await readJson(await fetch(`/api/video/retry-source?sessionId=${encodeURIComponent(retrySessionId)}&accessCode=${encodeURIComponent(accessCode)}`, { cache: 'no-store' }));
          setVideoMasterUrl(retryData.source.masterImageUrl);
          if (data.access.tryOnImageUrl) setTryOnImageUrl(data.access.tryOnImageUrl);
          setEventId(retryData.source.eventId);
          setCategory(retryData.source.category);
          setGarmentAnalysis(retryData.source.garmentAnalysis);
          setMessage('Manager retry approved. Generate a new video from the same approved image.');
        } else if (data.access.service === 'ai-video' && (data.access.tryOnImageUrl || data.access.videoMasterUrl)) {
          if (data.access.tryOnImageUrl) setTryOnImageUrl(data.access.tryOnImageUrl);
          if (data.access.videoMasterUrl) setVideoMasterUrl(data.access.videoMasterUrl);
          setMessage(data.access.videoMasterUrl
            ? 'Your festival image is ready. Create your 6-second AI video below.'
            : 'Your Try-On image is ready. Switch to AI Video to create your festival image and video.');
        }
        if (!used) window.localStorage.removeItem('tryfocus:maharaja:try-on-completed');
        setStage('ready');
      } catch (caught) {
        if (!active) return;
        setError(customerError(caught, 'Unable to verify this Maharaja QR.'));
        setStage('ready');
      }
    }
    void loadAccess();
    return () => {
      active = false;
    };
  }, [accessCode, deviceId, retrySessionId, service]);

  useEffect(() => {
    if (stage !== 'video') return;
    const timer = window.setInterval(() => setVideoProgressIndex((current) => Math.min(current + 1, 2)), 7000);
    return () => window.clearInterval(timer);
  }, [stage]);

  const canGenerateImage = purchaseConfirmed
    && (activeService === 'ai-video' || !!access?.access.phoneMasked || !!tryOnGrant)
    && !!personPhoto
    && garmentPhotos.length > 0
    && personAnalysis?.valid === true
    && personAnalysis.additionalPhotoRequired !== true
    && garmentAnalysis?.valid === true
    && garmentAnalysis.additionalPhotoRequired !== true;
  const event = useMemo(() => getEventOption(eventId), [eventId]);

  // Scan → check ₹500+ → enter (open photo step) or reject (scanner stays open).
  const analyzeBarcode = useCallback(
    async (payload: { barcode: string; format: string; printedText: string }) => {
      setError('');
      try {
        const data = await readJson(await fetch('/api/ai/analyze-price-tag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, accessCode, deviceId }),
        }));
        if (data.analysis.eligible === true && data.grant?.token) {
          setTryOnGrant(data.grant.token);
          setMessage(data.analysis.message);
          setPurchaseConfirmed(true);
          setIsFullCameraOpen(false);
          return { eligible: true, message: data.analysis.message as string };
        }
        return { eligible: false, message: data.analysis.message as string };
      } catch (caught) {
        return { eligible: false, message: customerError(caught, 'Could not verify the tag. Please try again.') };
      }
    },
    [accessCode, deviceId]
  );

  async function analyzePerson(file: File) {
    setStage('analyzing');
    setError('');
    clearActiveImage();
    try {
      const { dataUrl } = await compressImage(file, 1280, 0.82);
      setPersonPhoto(dataUrl);
      setPersonAnalysis({ valid: true, additionalPhotoRequired: false, operatorMessage: 'Person photo added.' });
      setMessage('Person photo is ready.');
    } catch (caught) {
      setPersonAnalysis(null);
      setError(customerError(caught, 'The person photo could not be prepared. Please take the photo again.'));
    } finally {
      setStage('ready');
    }
  }

  async function analyzeGarments(files: File[], append = false) {
    if (!files.length) return;
    const maxAllowed = maxGarmentPhotos;
    const currentCount = append ? garmentPhotos.length : 0;
    if (currentCount + files.length > maxAllowed) {
      setError(isTryOn
        ? 'AI Try-On uses one garment photo.'
        : `Upload up to 3 garment photos max (${garmentPhotos.length} already uploaded).`);
      return;
    }
    setStage('analyzing');
    setError('');
    clearActiveImage();
    try {
      const compressed = await Promise.all(files.map((file) => compressImage(file, 1280, 0.82)));
      const newImages = compressed.map((item) => item.dataUrl);
      const combined = append ? [...garmentPhotos, ...newImages].slice(0, maxAllowed) : newImages.slice(0, maxAllowed);
      setGarmentPhotos(combined);
      setGarmentAnalysis({ valid: true, additionalPhotoRequired: false, garmentType: 'Uploaded garment', primaryColor: 'Original color' });
      setMessage(isTryOn
        ? 'Garment photo ready.'
        : `${combined.length} garment photo${combined.length === 1 ? '' : 's'} ready (up to 3).`);
    } catch (caught) {
      setGarmentAnalysis(null);
      setError(customerError(caught, 'The garment photo could not be prepared. Please take the photo again.'));
    } finally {
      setStage('ready');
    }
  }

  function removeGarmentPhoto(index: number) {
    if (imagesLocked) return;
    const updated = garmentPhotos.filter((_, i) => i !== index);
    setGarmentPhotos(updated);
    if (!updated.length) {
      setGarmentAnalysis(null);
      setMessage('');
    } else {
      setMessage(`${updated.length} garment photo${updated.length === 1 ? '' : 's'} remaining.`);
    }
  }

  async function generateImage() {
    if (!canGenerateImage || !personPhoto) return;
    setStage('image');
    setError('');
    setMessage(`Generating the ${event.label} AI fashion image...`);
    try {
      const data = await readJson(await fetch('/api/ai/master-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          accessCode,
          service: activeService,
          eventId,
          templateId: category,
          personPhoto,
          garmentPhotos: visibleGarmentPhotos,
          garmentRoles,
          personAnalysis,
          garmentAnalysis,
          deviceId,
          tryOnGrant,
          conceptPrompt: activeService === 'ai-video' ? buildMasterPrompt(category, eventId, sessionId) : undefined,
        }),
      }));
      if (activeService === 'try-on') setTryOnImageUrl(data.masterImageUrl);
      else setVideoMasterUrl(data.masterImageUrl);
      setMessage(activeService === 'try-on' ? 'Your Maharaja AI Try-On is ready.' : 'Festival image ready. Continue to create the video.');
    } catch (caught) {
      setError(customerError(caught, 'The AI image could not be generated. Please ask Maharaja staff for assistance.'));
    } finally {
      setStage('ready');
    }
  }

  async function generateVideo() {
    if (!videoMasterUrl || stage === 'video') return;
    setStage('video');
    setError('');
    setVideoProgressIndex(0);
    setMessage(`Preparing your ${event.label} film. Keep this page open.`);
    try {
      const start = await readJson(await fetch('/api/video/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          accessCode,
          eventId,
          garmentAnalysis,
          masterImageUrl: videoMasterUrl,
          conceptPrompt: retrySessionId
            ? buildFailSafeVideoPrompt(category, eventId)
            : buildEventVideoPrompt(category, eventId, sessionId),
        }),
      }));

      if (typeof start.queuePosition === 'number' && start.queuePosition > 0) {
        setMessage(`Your video is queued. Position ${start.queuePosition}. Keep this page open.`);
      } else {
        setMessage('Your video is rendering. Keep this page open.');
      }

      for (let attempt = 0; attempt < 180; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 1000 : 2000));
        const status = await readJson(await fetch(`/api/video/status?sessionId=${encodeURIComponent(sessionId)}&jobId=${encodeURIComponent(start.jobId)}&accessCode=${encodeURIComponent(accessCode)}`));
        if (status.status === 'ready' || status.status === 'succeeded') {
          setStage('result');
          return;
        }
        if (status.status === 'failed') throw new Error(status.error || 'Video generation failed.');
        if (status.queueState === 'IN_QUEUE') {
          setMessage(typeof status.queuePosition === 'number' && status.queuePosition > 0
            ? `Your video is queued. Position ${status.queuePosition}. Keep this page open.`
            : 'Your video is queued. Keep this page open.');
        } else if (status.queueState === 'SAVING') {
          setMessage('Video rendered. Saving your Maharaja film...');
        } else {
          setMessage('Your video is rendering. Keep this page open.');
        }
      }
      throw new Error('Video generation is taking longer than expected. Do not start another job; check this session again.');
    } catch (caught) {
      setError(customerError(caught, 'The AI video could not be generated. Please ask Maharaja staff for assistance.'));
      setStage('ready');
    }
  }

  async function downloadImage() {
    if (!masterImageUrl) return;
    setError('');
    try {
      let blob: Blob;
      if (masterImageUrl.startsWith('data:')) {
        const response = await fetch(masterImageUrl);
        if (!response.ok) throw new Error('Unable to prepare the image download.');
        blob = await response.blob();
      } else {
        const response = await fetch('/api/download/asset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: masterImageUrl }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || 'Unable to download the image.');
        }
        blob = await response.blob();
      }

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `maharaja-${eventId}-${activeService === 'try-on' ? 'ai-try-on' : 'festival-image'}.jpg`;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);

      setMessage(activeService === 'try-on'
        ? 'Thanks for experiencing Maharaja AI. Your Try-On image has been downloaded.'
        : 'Download completed. You can continue here in the Maharaja experience.');
      void fetch('/api/maharaja/activity', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'download', label: `${event.label} AI Try-On downloaded`, sessionId, accessCode }),
      }).catch(() => undefined);
    } catch (caught) {
      setError(customerError(caught, 'The image could not be downloaded. Please try again.'));
    }
  }

  if (stage === 'loading') {
    return <main className="flex min-h-screen items-center justify-center bg-[#F5F2EA] text-[#6E0D1F]"><LoaderCircle className="h-9 w-9 animate-spin" /></main>;
  }

  if (error && !access) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F5F2EA] p-6 text-center">
        <div className="mx-auto max-w-md border border-[#D8C49B] bg-white p-6 shadow-md">
          {error === 'This AI Video has been completed.' ? (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-700" />
              <h1 className="mt-4 font-serif text-2xl font-bold text-[#2A060C]">This AI Video has been completed</h1>
              <p className="mt-3 text-sm leading-6 text-[#5C4B43]">Each Maharaja bill QR provides one AI Video experience. Thank you for shopping with us!</p>
            </>
          ) : (
            <>
              <AlertCircle className="mx-auto h-10 w-10 text-red-700" />
              <p className="mt-4 font-bold text-red-800">{error}</p>
            </>
          )}
        </div>
      </main>
    );
  }

  const busy = stage === 'analyzing' || stage === 'image' || stage === 'video';

  return (
    <main className="min-h-screen bg-[#F5F2EA] pb-12 text-[#211A17]">
      {(stage === 'image' || stage === 'video') && (
        <div className="fixed inset-x-0 top-0 z-50 flex min-h-14 items-center justify-center gap-3 bg-[#21090E] px-4 py-3 text-center text-sm font-bold text-[#F3E5AB] shadow-lg" role="status" aria-live="polite">
          <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-[#D4AF37]" />
          <span>{stage === 'image' ? 'Generating your AI image.' : 'Generating your 6-second AI video.'} Please wait and do not reload or close this page.</span>
        </div>
      )}
      <header className="border-b border-[#D4AF37]/30 bg-[#21090E] px-5 py-5 text-[#F3E5AB]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div><p className="text-xs font-bold uppercase text-[#D4AF37]">Majestic Maharaja · powered by <a href="https://wefocus.in" target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition">wefocus.in</a></p><h1 className="mt-1 font-serif text-2xl font-bold">Maharaja AI Experience</h1></div>
          {activeService === 'try-on' ? <Shirt className="h-7 w-7 text-[#D4AF37]" /> : <Film className="h-7 w-7 text-[#D4AF37]" />}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6">
        {stage === 'result' ? (
          <ResultClient
            sessionId={sessionId}
            accessCode={accessCode}
            initialRetryUsed={retryUsed}
            onRetryUsed={() => setRetryUsed(true)}
            onBack={() => setStage('ready')}
          />
        ) : (
          <>
        {service === 'ai-video' && access?.access.phoneMasked && (
          <div className="mb-5 border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">Pass verified for {access.access.phoneMasked} · Bill ****{access.access.billLast4}</div>
        )}

        <div className="mb-5 grid grid-cols-2 border border-[#D8C49B] bg-white p-1">
          <button type="button" onClick={() => setActiveService('try-on')} className={`min-h-12 px-3 text-xs font-bold uppercase ${activeService === 'try-on' ? 'bg-[#6E0D1F] text-[#F3E5AB]' : 'text-[#6E0D1F]'}`}><Shirt className="mr-2 inline h-4 w-4" />AI Try-On</button>
          <button type="button" disabled={service !== 'ai-video'} onClick={() => { setActiveService('ai-video'); setPurchaseConfirmed(true); }} className={`min-h-12 px-3 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${activeService === 'ai-video' ? 'bg-[#21090E] text-[#F3E5AB]' : 'text-[#6E0D1F]'}`}><Film className="mr-2 inline h-4 w-4" />AI Video<span className="block text-[10px] normal-case">{service === 'ai-video' ? 'Unlocked' : 'Above Rs 5000 purchase'}</span></button>
        </div>

        {activeService === 'try-on' && tryOnUsed && (
          <section id="tryon-completed-banner" className="mx-auto max-w-xl border border-[#D8C49B] bg-white p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-700" />
            <h2 className="mt-3 font-serif text-3xl font-bold text-[#2A060C]">Try-On completed</h2>
            <p className="mt-3 text-sm leading-6 text-[#5C4B43]">This device has completed its Maharaja AI Try-On. Thank you for visiting Maharaja!</p>
            <button
              type="button"
              id="tryon-test-again-btn"
              onClick={resetTryOnForRetest}
              className="mx-auto mt-5 flex min-h-12 items-center justify-center gap-2 bg-[#6E0D1F] px-6 text-xs font-black uppercase text-[#F3E5AB] shadow"
            >
              <RotateCcw className="h-4 w-4 text-[#D4AF37]" /> Scan Another Garment / Test Again
            </button>
          </section>
        )}

        {activeService === 'try-on' && !tryOnUsed && !purchaseConfirmed && (
          <section className="mx-auto max-w-xl border border-[#D8C49B] bg-white p-6 text-center shadow-md">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#6E0D1F]/10 border border-[#D4AF37]/50 text-[#6E0D1F] mb-3">
              <ScanLine className="h-7 w-7 text-[#6E0D1F]" />
            </div>
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-[#2A060C]">
              Scan the price tag
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#5C4B43] max-w-md mx-auto">
              Garments ₹500 and above unlock AI Try-On.
            </p>

            <button
              type="button"
              id="open-full-size-camera-btn"
              onClick={() => { setError(''); setIsFullCameraOpen(true); }}
              className="mx-auto mt-6 flex min-h-14 w-full max-w-md items-center justify-center gap-3 bg-[#6E0D1F] px-6 text-sm font-black uppercase text-[#F3E5AB] shadow-lg active:scale-[0.99]"
            >
              <Camera className="h-5 w-5 text-[#D4AF37]" /> Scan Price Tag
            </button>

            {error && <p className="mt-3 text-xs font-bold text-red-700">{error}</p>}

            {isFullCameraOpen && (
              <BarcodePriceScanner onDetected={analyzeBarcode} onClose={() => setIsFullCameraOpen(false)} />
            )}
          </section>
        )}

        {purchaseConfirmed && !tryOnUsed && (
          <>
            <section className={retrySessionId ? 'mx-auto max-w-sm' : 'grid gap-5 lg:grid-cols-[1fr_360px]'}>
              {!retrySessionId && <div className="border border-[#D8C49B] bg-white p-5 md:p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <fieldset className="sm:col-span-2"><legend className="text-xs font-bold uppercase text-[#5C4B43]">Customer category</legend><div className="mt-2 grid grid-cols-4 gap-2">{(['women', 'men', 'girl', 'boy'] as CustomerCategory[]).map((option) => <button key={option} type="button" disabled={busy || imagesLocked} onClick={() => { setCategory(option); clearActiveImage(); }} className={`min-h-11 border px-2 text-xs font-bold uppercase ${category === option ? 'border-[#6E0D1F] bg-[#6E0D1F] text-[#F3E5AB]' : 'border-[#D8C49B] bg-[#FFFDF8] text-[#5C4B43]'}`}>{option}</button>)}</div></fieldset>
                  <label className="text-xs font-bold uppercase text-[#5C4B43]">Event
                    <select
                      id="event-select"
                      value={eventId}
                      onChange={(event) => { setEventId(event.target.value as EventId); clearActiveImage(); }}
                      disabled={busy || service === 'ai-video'}
                      className="mt-2 min-h-12 w-full border border-[#D8C49B] bg-[#FFFDF8] px-3 text-base font-bold disabled:opacity-70"
                    >
                      {EVENT_OPTIONS.filter((option) => access?.workspace.activeEvents.includes(option.id) ?? true).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="border border-dashed border-[#B99A55] bg-[#FFF9EC] p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase text-[#6E0D1F]">Person Photo (1 only)</span>
                        {personPhoto && !imagesLocked && (
                          <button
                            type="button"
                            onClick={() => { setPersonPhoto(null); setPersonAnalysis(null); }}
                            className="text-[11px] font-bold text-red-700 hover:underline"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="aspect-[3/4] overflow-hidden bg-white">
                        {personPhoto ? (
                          <img src={personPhoto} alt="Customer preview" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                            <User className="h-10 w-10 text-slate-300" />
                            <span className="text-xs font-bold uppercase">1 Person photo</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <label className="flex min-h-11 cursor-pointer items-center justify-center gap-1 bg-[#6E0D1F] text-xs font-bold uppercase text-[#F3E5AB]">
                        <Camera className="h-4 w-4" /> Camera
                        <input id="person-camera-input" type="file" accept="image/*" capture="user" className="hidden" disabled={busy || imagesLocked} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void analyzePerson(file); }} />
                      </label>
                      <label className="flex min-h-11 cursor-pointer items-center justify-center gap-1 border border-[#6E0D1F] bg-white text-xs font-bold uppercase text-[#6E0D1F]">
                        <ImageIcon className="h-4 w-4" /> Gallery
                        <input id="person-file-input" type="file" accept="image/*" className="hidden" disabled={busy || imagesLocked} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void analyzePerson(file); }} />
                      </label>
                    </div>
                  </div>

                  <div className="border border-dashed border-[#B99A55] bg-[#FFF9EC] p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase text-[#6E0D1F]">
                          Garment Photo{maxGarmentPhotos === 1 ? '' : 's'} ({visibleGarmentPhotos.length}/{maxGarmentPhotos} max)
                        </span>
                        {garmentPhotos.length > 0 && !imagesLocked && (
                          <button
                            type="button"
                            onClick={() => { setGarmentPhotos([]); setGarmentAnalysis(null); }}
                            className="text-[11px] font-bold text-red-700 hover:underline"
                          >
                            Clear all
                          </button>
                        )}
                      </div>

                      {garmentPhotos.length === 0 ? (
                        <div className="aspect-[3/4] overflow-hidden bg-white p-2 flex flex-col items-center justify-center gap-2 text-slate-400">
                          <Shirt className="h-10 w-10 text-slate-300" />
                          <span className="text-xs font-bold uppercase text-center">
                            {isTryOn ? '1 garment photo' : '1 to 3 garment photos'}
                          </span>
                          <span className="text-[11px] text-center text-slate-400">
                            Front view, border/detail, or back/pallu
                          </span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {visibleGarmentPhotos.map((photo, idx) => {
                            const defaultRole = idx === 0 ? 'Top / Shirt' : idx === 1 ? 'Bottom / Pant' : 'Extra / Layer';
                            const role = garmentRoles[idx] || defaultRole;
                            return (
                              <div key={idx} className="relative aspect-[3/4] overflow-hidden bg-white border border-[#DDD2BD] rounded-lg shadow-sm">
                                <img src={photo} alt={role} className="h-full w-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (imagesLocked) return;
                                    const nextRole = role.startsWith('Top') ? 'Bottom / Pant' : role.startsWith('Bottom') ? 'Extra / Layer' : 'Top / Shirt';
                                    const updated = [...garmentRoles];
                                    updated[idx] = nextRole;
                                    setGarmentRoles(updated);
                                  }}
                                  className="absolute bottom-1 left-1 max-w-[90%] truncate rounded bg-black/85 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#F3E5AB] border border-[#D4AF37]/50"
                                  title="Tap to toggle garment role (Top / Bottom / Extra)"
                                >
                                  {role}
                                </button>
                                {!imagesLocked && (
                                  <button
                                    type="button"
                                    onClick={() => removeGarmentPhoto(idx)}
                                    className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-700 text-white shadow"
                                    title="Remove photo"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          {garmentPhotos.length < maxGarmentPhotos && (
                            <label className="aspect-[3/4] flex flex-col items-center justify-center border-2 border-dashed border-[#B99A55] bg-white cursor-pointer text-slate-400 hover:text-[#6E0D1F] transition">
                              <Plus className="h-5 w-5 mb-1 text-[#6E0D1F]" />
                              <span className="text-[10px] font-bold uppercase text-center text-[#6E0D1F]">Add photo</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={busy || imagesLocked}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  event.currentTarget.value = '';
                                  if (file) void analyzeGarments([file], true);
                                }}
                              />
                            </label>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <label className={`flex min-h-11 cursor-pointer items-center justify-center gap-1 bg-[#6E0D1F] text-xs font-bold uppercase text-[#F3E5AB] ${garmentPhotos.length >= maxGarmentPhotos ? 'opacity-40 pointer-events-none' : ''}`}>
                        <Camera className="h-4 w-4" /> {garmentPhotos.length > 0 && garmentPhotos.length < maxGarmentPhotos ? '+ Snap' : 'Camera'}
                        <input
                          id="garment-camera-input"
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          disabled={busy || imagesLocked || garmentPhotos.length >= maxGarmentPhotos}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.currentTarget.value = '';
                            if (file) void analyzeGarments([file], garmentPhotos.length > 0);
                          }}
                        />
                      </label>
                      <label className={`flex min-h-11 cursor-pointer items-center justify-center gap-1 border border-[#6E0D1F] bg-white text-xs font-bold uppercase text-[#6E0D1F] ${garmentPhotos.length >= maxGarmentPhotos ? 'opacity-40 pointer-events-none' : ''}`}>
                        <ImageIcon className="h-4 w-4" /> {garmentPhotos.length > 0 && garmentPhotos.length < maxGarmentPhotos ? '+ Add' : 'Gallery'}
                        <input
                          id="garment-file-input"
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          disabled={busy || imagesLocked || garmentPhotos.length >= maxGarmentPhotos}
                          onChange={(event) => {
                            const files = Array.from(event.target.files || []);
                            event.currentTarget.value = '';
                            if (files.length) void analyzeGarments(files, garmentPhotos.length > 0);
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {message && <div className="mt-4 border border-[#E2D4B8] bg-[#FFF9EC] p-3 text-sm font-semibold text-[#6E0D1F]">{message}</div>}
                {error && <div className="mt-4 border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</div>}

                {!masterImageUrl && <button type="button" id="generate-master-image-btn" onClick={() => void generateImage()} disabled={!canGenerateImage || busy} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 bg-[#6E0D1F] px-5 text-xs font-bold uppercase text-[#F3E5AB] disabled:opacity-40">{stage === 'image' ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />} {activeService === 'try-on' ? 'Generate AI Try-On' : 'Generate Festival Image for Video'}</button>}
              </div>}

              <aside className="border border-[#D8C49B] bg-[#21090E] p-5 text-center text-[#F3E5AB]">
                <SecureTryOnViewer
                  imageUrl={masterImageUrl}
                  alt="Generated Maharaja AI fashion result"
                  onRetryRequested={handleRetryImage}
                  retryUsed={retryUsed}
                  serviceType={activeService}
                />
                {masterImageUrl && activeService === 'try-on' && (
                  <div className="mt-4 space-y-2">
                    <button type="button" id="download-tryon-btn" onClick={downloadImage} className="flex min-h-12 w-full items-center justify-center gap-2 bg-[#D4AF37] text-xs font-bold uppercase text-black hover:brightness-105"><Download className="h-4 w-4" /> Download Try-On</button>
                  </div>
                )}
                {masterImageUrl && activeService === 'ai-video' && (
                  <div className="mt-4 space-y-3">
                    <button type="button" id="generate-video-btn" onClick={() => void generateVideo()} disabled={busy} className="flex min-h-14 w-full items-center justify-center gap-2 bg-[#D4AF37] text-xs font-bold uppercase text-black disabled:opacity-50">{stage === 'video' ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Film className="h-5 w-5" />} Generate 6-Sec AI Video <ArrowRight className="h-4 w-4" /></button>
                    {stage === 'video' && <div className="space-y-2 border border-[#D4AF37]/35 bg-black/30 p-3 text-left">{['Preparing festive lighting', 'Applying camera motion', 'Rendering your video'].map((step, index) => <div key={step} className={`flex items-center gap-2 text-xs font-semibold ${index <= videoProgressIndex ? 'text-[#F3E5AB]' : 'text-[#F3E5AB]/40'}`}><span className={`h-2 w-2 rounded-full ${index < videoProgressIndex ? 'bg-emerald-400' : index === videoProgressIndex ? 'animate-pulse bg-[#D4AF37]' : 'bg-white/20'}`} />{step}</div>)}</div>}
                  </div>
                )}
              </aside>
            </section>
          </>
        )}
          </>
        )}
      </div>
    </main>
  );
}
