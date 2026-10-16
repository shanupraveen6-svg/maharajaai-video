'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  X,
} from 'lucide-react';
import { compressImage } from '@/lib/utils/image';
import SecureTryOnViewer from '@/components/SecureTryOnViewer';
import BarcodePriceScanner from '@/components/BarcodePriceScanner';
import {
  buildEventVideoPrompt,
  buildFailSafeVideoPrompt,
  buildMasterPrompt,
  EVENT_OPTIONS,
  getEventOption,
  type CustomerCategory,
  type EventId,
  type VideoPromptSet,
} from '@/lib/maharaja/config';

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
  const router = useRouter();
  const [access, setAccess] = useState<AccessResponse | null>(null);
  const [activeService, setActiveService] = useState<'try-on' | 'ai-video'>(service);
  const [eventId, setEventId] = useState<EventId>('diwali');
  const [category, setCategory] = useState<CustomerCategory>('women');
  const [videoPromptSet, setVideoPromptSet] = useState<VideoPromptSet>('set-1');
  const [videoProgressIndex, setVideoProgressIndex] = useState(0);
  const [purchaseConfirmed, setPurchaseConfirmed] = useState(service === 'ai-video');
  const [priceAmount, setPriceAmount] = useState<number | null>(null);
  const [scannerResetKey, setScannerResetKey] = useState(0);
  const [isFullCameraOpen, setIsFullCameraOpen] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [tryOnGrant, setTryOnGrant] = useState('');
  const [tryOnUsed, setTryOnUsed] = useState(false);
  const [personPhoto, setPersonPhoto] = useState<string | null>(null);
  const [garmentPhotos, setGarmentPhotos] = useState<string[]>([]);
  const [personAnalysis, setPersonAnalysis] = useState<Analysis | null>(null);
  const [garmentAnalysis, setGarmentAnalysis] = useState<Analysis | null>(null);
  const [tryOnImageUrl, setTryOnImageUrl] = useState<string | null>(null);
  const [videoMasterUrl, setVideoMasterUrl] = useState<string | null>(null);
  const [sessionId] = useState(() => `maharaja_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`);
  const [stage, setStage] = useState<'loading' | 'ready' | 'analyzing' | 'image' | 'video'>('loading');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  // Each tab shows its own image: plain Try-On vs. festival video master.
  const isTryOn = activeService === 'try-on';
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

  useEffect(() => {
    if (stage !== 'image' && stage !== 'video') return;
    const protectGeneration = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectGeneration);
    return () => window.removeEventListener('beforeunload', protectGeneration);
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

  const analyzeBarcode = useCallback(
    async (payload: { barcode: string; format: string; printedText: string; amount?: number; image?: string }) => {
      setStage('analyzing');
      setError('');
      setDuplicateWarning(null);
      try {
        setMessage('Checking the garment tag and verifying MRP...');
        const data = await readJson(
          await fetch('/api/ai/analyze-price-tag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              barcode: payload.barcode,
              format: payload.format,
              printedText: payload.printedText,
              amount: payload.amount,
              image: payload.image,
              accessCode,
              deviceId,
            }),
          })
        );
        setPriceAmount(data.analysis.amount || null);
        setPurchaseConfirmed(data.analysis.eligible === true);
        setTryOnGrant(data.grant?.token || '');
        setMessage(data.analysis.message);

        if (data.analysis.isDuplicate && data.analysis.duplicateType === 'different_device_used') {
          setDuplicateWarning(data.analysis.message);
          setError(data.analysis.message);
          setPurchaseConfirmed(false);
          return { success: false, eligible: false, isDuplicate: true, message: data.analysis.message };
        } else if (!data.analysis.eligible) {
          setError(data.analysis.message);
          setPurchaseConfirmed(false);
          return { success: false, eligible: false, isDuplicate: false, message: data.analysis.message };
        } else {
          setIsFullCameraOpen(false);
          return { success: true, eligible: true, isDuplicate: false, message: data.analysis.message };
        }
      } catch (caught) {
        setPurchaseConfirmed(false);
        const errMessage = customerError(
          caught,
          'The tag could not be verified. Keep the full tag, barcode and printed MRP inside the frame.'
        );
        setError(errMessage);
        return { success: false, eligible: false, message: errMessage };
      } finally {
        setStage('ready');
        setScannerResetKey((current) => current + 1);
      }
    },
    [accessCode, deviceId]
  );

  async function analyzePerson(file: File) {
    setStage('analyzing');
    setError('');
    clearActiveImage();
    try {
      const { dataUrl } = await compressImage(file, 1400, 0.84);
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
    const maxAllowed = isTryOn ? 1 : 3;
    const currentCount = append ? garmentPhotos.length : 0;
    if (currentCount + files.length > maxAllowed) {
      setError(isTryOn ? 'Upload one garment photo only for AI Try-On.' : `Upload up to 3 garment photos max for AI Video (${garmentPhotos.length} already uploaded).`);
      return;
    }
    setStage('analyzing');
    setError('');
    clearActiveImage();
    try {
      const compressed = await Promise.all(files.map((file) => compressImage(file, 1400, 0.84)));
      const newImages = compressed.map((item) => item.dataUrl);
      const combined = append ? [...garmentPhotos, ...newImages].slice(0, maxAllowed) : newImages.slice(0, maxAllowed);
      setGarmentPhotos(combined);
      setGarmentAnalysis({ valid: true, additionalPhotoRequired: false, garmentType: 'Uploaded garment', primaryColor: 'Original color' });
      setMessage(isTryOn ? 'Garment photo is ready.' : `${combined.length} garment photo${combined.length === 1 ? '' : 's'} ready (up to 3).`);
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
          garmentPhotos,
          personAnalysis,
          garmentAnalysis,
          deviceId,
          tryOnGrant,
          conceptPrompt: activeService === 'ai-video' ? buildMasterPrompt(category, eventId) : undefined,
        }),
      }));
      if (activeService === 'try-on') setTryOnImageUrl(data.masterImageUrl);
      else setVideoMasterUrl(data.masterImageUrl);
      if (activeService === 'try-on' && !access?.access.phoneMasked) {
        window.localStorage.setItem('tryfocus:maharaja:try-on-completed', new Date().toISOString());
      }
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
            : buildEventVideoPrompt(category, eventId, videoPromptSet),
        }),
      }));

      for (let attempt = 0; attempt < 180; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        const status = await readJson(await fetch(`/api/video/status?sessionId=${encodeURIComponent(sessionId)}&jobId=${encodeURIComponent(start.jobId)}&accessCode=${encodeURIComponent(accessCode)}`));
        if (status.status === 'ready' || status.status === 'succeeded') {
          router.push(`/result/${sessionId}?access=${encodeURIComponent(accessCode)}`);
          return;
        }
        if (status.status === 'failed') throw new Error(status.error || 'Video generation failed.');
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
          <div><p className="text-xs font-bold uppercase text-[#D4AF37]">Majestic Maharaja · powered by TryFocus</p><h1 className="mt-1 font-serif text-2xl font-bold">Maharaja AI Experience</h1></div>
          {activeService === 'try-on' ? <Shirt className="h-7 w-7 text-[#D4AF37]" /> : <Film className="h-7 w-7 text-[#D4AF37]" />}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6">
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
          </section>
        )}

        {activeService === 'try-on' && !tryOnUsed && !purchaseConfirmed && (
          <section className="mx-auto max-w-xl border border-[#D8C49B] bg-white p-6 text-center shadow-md">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#6E0D1F]/10 border border-[#D4AF37]/50 text-[#6E0D1F] mb-3">
              <ScanLine className="h-7 w-7 text-[#6E0D1F]" />
            </div>
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-[#2A060C]">
              Scan Garment Price Tag (₹500+)
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#5C4B43] max-w-md mx-auto">
              Open the full-size camera and point it at the garment price tag or barcode. Eligible for all dresses and garments above ₹500.
            </p>

            <div className="mt-6 flex flex-col gap-3 max-w-md mx-auto">
              <button
                type="button"
                id="open-full-size-camera-btn"
                onClick={() => setIsFullCameraOpen(true)}
                className="flex min-h-14 w-full items-center justify-center gap-3 bg-[#6E0D1F] px-6 text-xs font-black uppercase text-[#F3E5AB] shadow-lg hover:bg-[#8B142A] active:scale-[0.99] transition"
              >
                <Camera className="h-5 w-5 text-[#D4AF37]" /> Open Full Size Camera Scanner
              </button>

              <label className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 border border-[#6E0D1F] bg-white px-4 text-xs font-bold uppercase text-[#6E0D1F] hover:bg-[#FFF9EC] transition">
                <ImageIcon className="h-4 w-4" /> Upload Tag Photo from Gallery
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.currentTarget.value = '';
                    if (f) {
                      const reader = new FileReader();
                      reader.onload = () => {
                        void analyzeBarcode({
                          barcode: '',
                          format: 'GALLERY_UPLOAD',
                          printedText: '',
                          image: reader.result as string,
                        });
                      };
                      reader.readAsDataURL(f);
                    }
                  }}
                />
              </label>
            </div>

            {priceAmount !== null && (
              <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">
                Verified Price: ₹{priceAmount}
              </div>
            )}
            {duplicateWarning && (
              <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900">
                {duplicateWarning}
              </div>
            )}
            {message && !duplicateWarning && <p className="mt-3 text-xs font-semibold text-[#5C4B43]">{message}</p>}
            {error && <p className="mt-3 text-xs font-bold text-red-700">{error}</p>}

            {/* Full-Size Interactive Scanner Modal */}
            {isFullCameraOpen && (
              <BarcodePriceScanner
                active={isFullCameraOpen}
                resetKey={scannerResetKey}
                onDetected={analyzeBarcode}
                onClose={() => setIsFullCameraOpen(false)}
              />
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
                          {isTryOn ? 'Garment Photo (1 only)' : `Garment Photos (${garmentPhotos.length}/3 max)`}
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
                            {isTryOn ? 'One garment photo' : '1 to 3 garment photos'}
                          </span>
                          {!isTryOn && (
                            <span className="text-[11px] text-center text-slate-400">
                              Front view, border/detail, or back/pallu
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {garmentPhotos.map((photo, idx) => (
                            <div key={idx} className="relative aspect-[3/4] overflow-hidden bg-white border border-[#DDD2BD]">
                              <img src={photo} alt={`Garment ${idx + 1}`} className="h-full w-full object-cover" />
                              <span className="absolute bottom-1 left-1 bg-black/75 px-1 py-0.5 text-[9px] font-bold uppercase text-[#F3E5AB]">
                                {idx === 0 ? 'Main' : `#${idx + 1}`}
                              </span>
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
                          ))}
                          {garmentPhotos.length < (isTryOn ? 1 : 3) && (
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
                      <label className={`flex min-h-11 cursor-pointer items-center justify-center gap-1 bg-[#6E0D1F] text-xs font-bold uppercase text-[#F3E5AB] ${garmentPhotos.length >= (isTryOn ? 1 : 3) ? 'opacity-40 pointer-events-none' : ''}`}>
                        <Camera className="h-4 w-4" /> {garmentPhotos.length > 0 && garmentPhotos.length < (isTryOn ? 1 : 3) ? '+ Snap' : 'Camera'}
                        <input
                          id="garment-camera-input"
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          disabled={busy || imagesLocked || garmentPhotos.length >= (isTryOn ? 1 : 3)}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.currentTarget.value = '';
                            if (file) void analyzeGarments([file], !isTryOn && garmentPhotos.length > 0);
                          }}
                        />
                      </label>
                      <label className={`flex min-h-11 cursor-pointer items-center justify-center gap-1 border border-[#6E0D1F] bg-white text-xs font-bold uppercase text-[#6E0D1F] ${garmentPhotos.length >= (isTryOn ? 1 : 3) ? 'opacity-40 pointer-events-none' : ''}`}>
                        <ImageIcon className="h-4 w-4" /> {garmentPhotos.length > 0 && garmentPhotos.length < (isTryOn ? 1 : 3) ? '+ Add' : 'Gallery'}
                        <input
                          id="garment-file-input"
                          type="file"
                          accept="image/*"
                          multiple={!isTryOn}
                          className="hidden"
                          disabled={busy || imagesLocked || garmentPhotos.length >= (isTryOn ? 1 : 3)}
                          onChange={(event) => {
                            const files = Array.from(event.target.files || []);
                            event.currentTarget.value = '';
                            if (files.length) void analyzeGarments(files, !isTryOn && garmentPhotos.length > 0);
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
                <SecureTryOnViewer imageUrl={masterImageUrl} alt="Generated Maharaja AI fashion result" />
                {masterImageUrl && activeService === 'try-on' && (
                  <button type="button" id="download-tryon-btn" onClick={downloadImage} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 bg-[#D4AF37] text-xs font-bold uppercase text-black hover:brightness-105"><Download className="h-4 w-4" /> Download Try-On</button>
                )}
                {masterImageUrl && activeService === 'ai-video' && (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" disabled={busy} onClick={() => setVideoPromptSet('set-1')} className={`min-h-10 border text-xs font-bold uppercase ${videoPromptSet === 'set-1' ? 'border-[#D4AF37] bg-[#D4AF37] text-black' : 'border-[#D4AF37]/45 text-[#F3E5AB]'}`}>Festive Set</button>
                      <button type="button" disabled={busy} onClick={() => setVideoPromptSet('set-2')} className={`min-h-10 border text-xs font-bold uppercase ${videoPromptSet === 'set-2' ? 'border-[#D4AF37] bg-[#D4AF37] text-black' : 'border-[#D4AF37]/45 text-[#F3E5AB]'}`}>{category === 'men' || category === 'boy' ? 'Cracker Set' : 'Divine Set'}</button>
                    </div>
                    <button type="button" id="generate-video-btn" onClick={() => void generateVideo()} disabled={busy} className="flex min-h-14 w-full items-center justify-center gap-2 bg-[#D4AF37] text-xs font-bold uppercase text-black disabled:opacity-50">{stage === 'video' ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Film className="h-5 w-5" />} Generate 6-Sec AI Video <ArrowRight className="h-4 w-4" /></button>
                    {stage === 'video' && <div className="space-y-2 border border-[#D4AF37]/35 bg-black/30 p-3 text-left">{['Preparing festive lighting', 'Applying camera motion', 'Rendering your video'].map((step, index) => <div key={step} className={`flex items-center gap-2 text-xs font-semibold ${index <= videoProgressIndex ? 'text-[#F3E5AB]' : 'text-[#F3E5AB]/40'}`}><span className={`h-2 w-2 rounded-full ${index < videoProgressIndex ? 'bg-emerald-400' : index === videoProgressIndex ? 'animate-pulse bg-[#D4AF37]' : 'bg-white/20'}`} />{step}</div>)}</div>}
                  </div>
                )}
              </aside>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
