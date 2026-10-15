'use client';

import { useEffect, useMemo, useState } from 'react';
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
  ScanSearch,
  ScanLine,
  Shirt,
  Sparkles,
  RotateCcw,
  User,
} from 'lucide-react';
import { compressImage } from '@/lib/utils/image';
import SecureTryOnViewer from '@/components/SecureTryOnViewer';
import {
  buildEventVideoPrompt,
  buildMasterPrompt,
  EVENT_OPTIONS,
  getEventOption,
  type CustomerCategory,
  type EventId,
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
    tryOnStatus?: string;
    masterImageUrl?: string | null;
    retriesCount?: number;
    retriesLeft?: number;
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

export default function MaharajaExperience({ service, accessCode }: { service: 'try-on' | 'ai-video'; accessCode: string }) {
  const router = useRouter();
  const [access, setAccess] = useState<AccessResponse | null>(null);
  const [activeService, setActiveService] = useState<'try-on' | 'ai-video'>(service);
  const [eventId, setEventId] = useState<EventId>('diwali');
  const [category, setCategory] = useState<CustomerCategory>('women');
  const [purchaseConfirmed, setPurchaseConfirmed] = useState(service === 'ai-video');
  const [priceTagPhoto, setPriceTagPhoto] = useState<string | null>(null);
  const [priceAmount, setPriceAmount] = useState<number | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [tryOnGrant, setTryOnGrant] = useState('');
  const [tryOnUsed, setTryOnUsed] = useState(false);
  const [personPhoto, setPersonPhoto] = useState<string | null>(null);
  const [garmentPhotos, setGarmentPhotos] = useState<string[]>([]);
  const [personAnalysis, setPersonAnalysis] = useState<Analysis | null>(null);
  const [garmentAnalysis, setGarmentAnalysis] = useState<Analysis | null>(null);
  const [masterImageUrl, setMasterImageUrl] = useState<string | null>(null);
  const [sessionId] = useState(() => `maharaja_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`);
  const [stage, setStage] = useState<'loading' | 'ready' | 'analyzing' | 'image' | 'video'>('loading');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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
        setPurchaseConfirmed(data.access.service === 'ai-video' || data.access.tryOnStatus === 'generated');
        const used = data.access.service === 'try-on' && (data.access.tryOnUsed === true || data.access.tryOnStatus === 'used');
        setTryOnUsed(used);
        if (data.access.service === 'try-on' && data.access.tryOnStatus === 'generated' && data.access.masterImageUrl) {
          setMasterImageUrl(data.access.masterImageUrl);
          setMessage('Your Maharaja AI Try-On image is ready for download.');
        }
        if (!used) window.localStorage.removeItem('tryfocus:maharaja:try-on-completed');
        setStage('ready');
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'Unable to verify this Maharaja QR.');
        setStage('ready');
      }
    }
    void loadAccess();
    return () => {
      active = false;
    };
  }, [accessCode, deviceId, service]);

  async function loadTestPriceTag() {
    setStage('analyzing');
    setError('');
    try {
      const res = await fetch('/maharaja-test-price-tag-rs-799.png');
      const blob = await res.blob();
      const file = new File([blob], 'maharaja-test-price-tag-rs-799.png', { type: 'image/png' });
      await analyzePriceTag(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load test price tag.');
      setStage('ready');
    }
  }

  async function loadTestPerson() {
    setStage('analyzing');
    setError('');
    try {
      const res = await fetch('/test-master-women.jpg');
      const blob = await res.blob();
      const file = new File([blob], 'test-master-women.jpg', { type: 'image/jpeg' });
      await analyzePerson(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sample customer photo.');
      setStage('ready');
    }
  }

  async function loadTestGarment() {
    setStage('analyzing');
    setError('');
    try {
      const res = await fetch('/maharaja-logo.png');
      const blob = await res.blob();
      const file = new File([blob], 'maharaja-garment.png', { type: 'image/png' });
      await analyzeGarments([file]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sample garment photo.');
      setStage('ready');
    }
  }

  const canGenerateImage = purchaseConfirmed
    && (activeService === 'ai-video' || !!access?.access.phoneMasked || !!tryOnGrant)
    && !!personPhoto
    && garmentPhotos.length > 0
    && personAnalysis?.valid === true
    && personAnalysis.additionalPhotoRequired !== true
    && garmentAnalysis?.valid === true
    && garmentAnalysis.additionalPhotoRequired !== true;
  const event = useMemo(() => getEventOption(eventId), [eventId]);

  async function analyzePriceTag(file: File) {
    setStage('analyzing');
    setError('');
    try {
      const { dataUrl } = await compressImage(file, 1600, 0.88);
      setPriceTagPhoto(dataUrl);
      setMessage('Checking the price tag...');
      const data = await readJson(await fetch('/api/ai/analyze-price-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, accessCode, deviceId }),
      }));
      setPriceAmount(data.analysis.amount || null);
      setPurchaseConfirmed(data.analysis.eligible === true);
      setTryOnGrant(data.grant?.token || '');
      setMessage(data.analysis.message);
      if (!data.analysis.eligible) setError(data.analysis.message);
    } catch (caught) {
      setPurchaseConfirmed(false);
      setError(caught instanceof Error ? caught.message : 'Price tag verification failed.');
    } finally {
      setStage('ready');
    }
  }

  async function analyzePerson(file: File) {
    setStage('analyzing');
    setError('');
    setMasterImageUrl(null);
    try {
      const { dataUrl } = await compressImage(file, 1400, 0.84);
      setPersonPhoto(dataUrl);
      setMessage('Checking the person photo...');
      const data = await readJson(await fetch('/api/ai/analyze-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, accessCode, service: activeService }),
      }));
      setPersonAnalysis(data.analysis);
      setMessage(data.analysis.operatorMessage || 'Person photo verified.');
      if (!data.analysis.valid || data.analysis.additionalPhotoRequired) {
        setError(data.analysis.operatorMessage || 'A clearer person photo is needed.');
      }
    } catch (caught) {
      setPersonPhoto(null);
      setPersonAnalysis(null);
      setError(caught instanceof Error ? caught.message : 'Person photo analysis failed.');
    } finally {
      setStage('ready');
    }
  }

  async function analyzeGarments(files: File[]) {
    if (!files.length) return;
    if (files.length > 3) {
      setError('Upload no more than 3 garment images.');
      return;
    }
    setStage('analyzing');
    setError('');
    setMasterImageUrl(null);
    try {
      const compressed = await Promise.all(files.map((file) => compressImage(file, 1400, 0.84)));
      const images = compressed.map((item) => item.dataUrl);
      setGarmentPhotos(images);
      setMessage('Checking garment color, fabric and design...');
      const data = await readJson(await fetch('/api/ai/analyze-garment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images, accessCode, service: activeService }),
      }));
      setGarmentAnalysis(data.analysis);
      setMessage(data.analysis.operatorMessage || 'Garment images verified.');
      if (!data.analysis.valid || data.analysis.additionalPhotoRequired) {
        setError(data.analysis.operatorMessage || 'Clearer garment photos are needed.');
      }
    } catch (caught) {
      setGarmentPhotos([]);
      setGarmentAnalysis(null);
      setError(caught instanceof Error ? caught.message : 'Garment image analysis failed.');
    } finally {
      setStage('ready');
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
          conceptPrompt: buildMasterPrompt(category, eventId),
        }),
      }));
      setMasterImageUrl(data.masterImageUrl);
      if (activeService === 'try-on' && !access?.access.phoneMasked) {
        window.localStorage.setItem('tryfocus:maharaja:try-on-completed', new Date().toISOString());
      }
      setMessage(activeService === 'try-on' ? 'Your Maharaja AI Try-On is ready.' : 'AI image ready. Continue to create the video.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'AI image generation failed.');
    } finally {
      setStage('ready');
    }
  }

  async function generateVideo() {
    if (!masterImageUrl) return;
    setStage('video');
    setError('');
    setMessage(`Starting the ${event.label} AI video. Keep this page open...`);
    try {
      const start = await readJson(await fetch('/api/video/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          accessCode,
          eventId,
          garmentAnalysis,
          masterImageUrl,
          conceptPrompt: buildEventVideoPrompt(category, eventId),
        }),
      }));

      for (let attempt = 0; attempt < 180; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        const status = await readJson(await fetch(`/api/video/status?sessionId=${encodeURIComponent(sessionId)}&jobId=${encodeURIComponent(start.jobId)}`));
        if (status.status === 'ready' || status.status === 'succeeded') {
          router.push(`/result/${sessionId}?access=${encodeURIComponent(accessCode)}`);
          return;
        }
        if (status.status === 'failed') throw new Error(status.error || 'Video generation failed.');
      }
      throw new Error('Video generation is taking longer than expected. Do not start another job; check this session again.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'AI video generation failed.');
      setStage('ready');
    }
  }

  async function downloadImage() {
    if (!masterImageUrl) return;
    const anchor = document.createElement('a');
    anchor.href = masterImageUrl;
    anchor.download = `maharaja-${eventId}-ai-try-on.jpg`;
    anchor.target = '_blank';
    anchor.rel = 'noreferrer';
    anchor.click();
    if (activeService === 'try-on' && deviceId) {
      await fetch('/api/maharaja/try-on-grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, sessionId }),
      }).catch(() => undefined);
      setTryOnUsed(true);
      setMessage('Your Maharaja AI Try-On has been downloaded. Thank you for visiting!');
    }
    void fetch('/api/maharaja/activity', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'download', label: `${event.label} AI Try-On downloaded`, sessionId, accessCode }),
    }).catch(() => undefined);
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
          <button type="button" onClick={() => { setActiveService('try-on'); setMasterImageUrl(null); }} className={`min-h-12 px-3 text-xs font-bold uppercase ${activeService === 'try-on' ? 'bg-[#6E0D1F] text-[#F3E5AB]' : 'text-[#6E0D1F]'}`}><Shirt className="mr-2 inline h-4 w-4" />AI Try-On</button>
          <button type="button" disabled={service !== 'ai-video'} onClick={() => { setActiveService('ai-video'); setPurchaseConfirmed(true); setMasterImageUrl(null); }} className={`min-h-12 px-3 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${activeService === 'ai-video' ? 'bg-[#21090E] text-[#F3E5AB]' : 'text-[#6E0D1F]'}`}><Film className="mr-2 inline h-4 w-4" />AI Video<span className="block text-[10px] normal-case">{service === 'ai-video' ? 'Unlocked' : 'Above Rs 5000 purchase'}</span></button>
        </div>

        {activeService === 'try-on' && tryOnUsed && (
          <section id="tryon-completed-banner" className="mx-auto max-w-xl border border-[#D8C49B] bg-white p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-700" />
            <h2 className="mt-3 font-serif text-3xl font-bold text-[#2A060C]">Try-On completed</h2>
            <p className="mt-3 text-sm leading-6 text-[#5C4B43]">This device has completed its Maharaja AI Try-On. Thank you for visiting Maharaja!</p>
          </section>
        )}

        {activeService === 'try-on' && !tryOnUsed && !purchaseConfirmed && (
          <section className="mx-auto max-w-xl border border-[#D8C49B] bg-white p-6 text-center">
            <BadgeIndianRupee className="mx-auto h-10 w-10 text-[#6E0D1F]" />
            <h2 className="mt-3 font-serif text-3xl font-bold text-[#2A060C]">Scan a Rs 500+ price tag</h2>
            <p className="mt-3 text-sm leading-6 text-[#5C4B43]">Open the camera and keep the full Maharaja price tag and amount clearly visible.</p>
            {priceTagPhoto && <img src={priceTagPhoto} alt="Scanned Maharaja price tag" className="mx-auto mt-4 max-h-48 border border-[#D8C49B] object-contain" />}
            <div className="mt-5 space-y-3">
              <label className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 bg-[#6E0D1F] px-5 text-xs font-bold uppercase text-[#F3E5AB]">
                <ScanLine className="h-5 w-5" /> Scan price tag
                <input
                  id="scan-price-tag-file-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={busy}
                  onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void analyzePriceTag(file); }}
                />
              </label>
              <button
                type="button"
                id="use-test-price-tag-btn"
                onClick={() => void loadTestPriceTag()}
                disabled={busy}
                className="flex min-h-11 w-full items-center justify-center gap-2 border border-[#D8C49B] bg-[#FFF9EC] text-xs font-bold uppercase text-[#6E0D1F] hover:bg-[#F8F1E2]"
              >
                Use Rs 799 Test Tag
              </button>
            </div>
            {priceAmount !== null && <p className="mt-3 text-sm font-bold text-[#6E0D1F]">Detected price: Rs {priceAmount}</p>}
            {message && <p className="mt-3 text-xs font-semibold text-[#5C4B43]">{message}</p>}
            {error && <p className="mt-3 text-xs font-semibold text-red-700">{error}</p>}
          </section>
        )}

        {purchaseConfirmed && !tryOnUsed && (
          <>
            <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
              <div className="border border-[#D8C49B] bg-white p-5 md:p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-bold uppercase text-[#5C4B43]">Customer category
                    <select
                      id="customer-category-select"
                      value={category}
                      onChange={(event) => { setCategory(event.target.value as CustomerCategory); setMasterImageUrl(null); }}
                      disabled={busy}
                      className="mt-2 min-h-12 w-full border border-[#D8C49B] bg-[#FFFDF8] px-3 text-base font-bold"
                    >
                      <option value="women">Women</option><option value="men">Men</option><option value="girl">Girl</option><option value="boy">Boy</option>
                    </select>
                  </label>
                  <label className="text-xs font-bold uppercase text-[#5C4B43]">Event
                    <select
                      id="event-select"
                      value={eventId}
                      onChange={(event) => { setEventId(event.target.value as EventId); setMasterImageUrl(null); }}
                      disabled={busy || service === 'ai-video'}
                      className="mt-2 min-h-12 w-full border border-[#D8C49B] bg-[#FFFDF8] px-3 text-base font-bold disabled:opacity-70"
                    >
                      {EVENT_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id} disabled={option.id !== 'diwali'}>
                          {option.label} {option.id === 'diwali' ? '— Active Campaign' : '— (Coming Soon)'}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="border border-dashed border-[#B99A55] bg-[#FFF9EC] p-4">
                    <div className="aspect-[3/4] overflow-hidden bg-white">{personPhoto ? <img src={personPhoto} alt="Customer preview" className="h-full w-full object-cover" /> : <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400"><User className="h-10 w-10" /><span className="text-xs font-bold uppercase">Person photo</span></div>}</div>
                    <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-center gap-2 bg-[#6E0D1F] text-xs font-bold uppercase text-[#F3E5AB]">
                      <Camera className="h-4 w-4" /> Add person
                      <input id="person-file-input" type="file" accept="image/*" capture="environment" className="hidden" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void analyzePerson(file); }} />
                    </label>
                    <button
                      type="button"
                      id="use-test-person-btn"
                      onClick={() => void loadTestPerson()}
                      disabled={busy}
                      className="mt-2 flex min-h-9 w-full items-center justify-center border border-[#D8C49B] bg-white text-[11px] font-bold uppercase text-[#6E0D1F] hover:bg-[#F8F1E2]"
                    >
                      Use Test Customer
                    </button>
                  </div>

                  <div className="border border-dashed border-[#B99A55] bg-[#FFF9EC] p-4">
                    <div className="grid aspect-[3/4] grid-cols-2 gap-2 bg-white p-2">{garmentPhotos.length ? garmentPhotos.map((photo) => <img key={photo.slice(-30)} src={photo} alt="Garment preview" className="h-full min-h-0 w-full object-cover" />) : <div className="col-span-2 flex h-full flex-col items-center justify-center gap-2 text-slate-400"><Shirt className="h-10 w-10" /><span className="text-xs font-bold uppercase">1 to 3 garment photos</span></div>}</div>
                    <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-center gap-2 bg-[#6E0D1F] text-xs font-bold uppercase text-[#F3E5AB]">
                      <ImageIcon className="h-4 w-4" /> Add garment
                      <input id="garment-file-input" type="file" accept="image/*" multiple className="hidden" disabled={busy} onChange={(event) => { const files = Array.from(event.target.files || []); event.currentTarget.value = ''; void analyzeGarments(files); }} />
                    </label>
                    <button
                      type="button"
                      id="use-test-garment-btn"
                      onClick={() => void loadTestGarment()}
                      disabled={busy}
                      className="mt-2 flex min-h-9 w-full items-center justify-center border border-[#D8C49B] bg-white text-[11px] font-bold uppercase text-[#6E0D1F] hover:bg-[#F8F1E2]"
                    >
                      Use Test Garment
                    </button>
                  </div>
                </div>

                {(personAnalysis || garmentAnalysis) && <div className="mt-4 border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold leading-5 text-emerald-900"><div className="flex items-center gap-2 font-bold uppercase"><ScanSearch className="h-4 w-4" /> Photo quality checks</div>{personAnalysis && <p className="mt-2">Person: {String(personAnalysis.operatorMessage || 'Verified')}</p>}{garmentAnalysis && <p>Garment: {String(garmentAnalysis.garmentType || 'Verified')} · {String(garmentAnalysis.primaryColor || 'Color captured')}</p>}</div>}

                {message && <div className="mt-4 border border-[#E2D4B8] bg-[#FFF9EC] p-3 text-sm font-semibold text-[#6E0D1F]">{message}</div>}
                {error && <div className="mt-4 border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</div>}

                {!masterImageUrl && <button type="button" id="generate-master-image-btn" onClick={() => void generateImage()} disabled={!canGenerateImage || busy} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 bg-[#6E0D1F] px-5 text-xs font-bold uppercase text-[#F3E5AB] disabled:opacity-40">{stage === 'image' ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />} Generate AI Image</button>}
              </div>

              <aside className="border border-[#D8C49B] bg-[#21090E] p-5 text-center text-[#F3E5AB]">
                <SecureTryOnViewer imageUrl={masterImageUrl} alt="Generated Maharaja AI fashion result" />
                {masterImageUrl && activeService === 'try-on' && (
                  <div className="mt-4 space-y-2">
                    <button
                      type="button"
                      id="download-tryon-btn"
                      onClick={downloadImage}
                      className="flex min-h-12 w-full items-center justify-center gap-2 bg-[#D4AF37] text-xs font-bold uppercase text-black hover:brightness-105"
                    >
                      <Download className="h-4 w-4" /> Download Try-On
                    </button>
                    {(access?.access.retriesLeft ?? Math.max(0, 2 - (access?.access.retriesCount || 0))) > 0 ? (
                      <button
                        type="button"
                        id="retake-tryon-btn"
                        onClick={() => {
                          setMasterImageUrl(null);
                          const remaining = (access?.access.retriesLeft ?? 2) - 1;
                          setMessage(`Try another garment or photo (${Math.max(0, remaining)} retries left), then tap Generate AI Image.`);
                        }}
                        className="flex min-h-11 w-full items-center justify-center gap-2 border border-[#D4AF37]/50 text-xs font-bold uppercase text-[#F3E5AB] hover:bg-black/30"
                      >
                        <RotateCcw className="h-4 w-4" /> Try Another Outfit / Retake ({access?.access.retriesLeft ?? 2} left)
                      </button>
                    ) : (
                      <div className="rounded border border-[#D4AF37]/40 bg-black/50 p-2.5 text-center text-[11px] font-semibold text-[#F3E5AB]">
                        Maximum 2 retries reached. Tap Download Try-On to complete and save your photo.
                      </div>
                    )}
                  </div>
                )}
                {masterImageUrl && activeService === 'ai-video' && <button type="button" id="generate-video-btn" onClick={() => void generateVideo()} disabled={busy} className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 bg-[#D4AF37] text-xs font-bold uppercase text-black disabled:opacity-50">{stage === 'video' ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Film className="h-5 w-5" />} Generate {event.label} Video <ArrowRight className="h-4 w-4" /></button>}
              </aside>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
