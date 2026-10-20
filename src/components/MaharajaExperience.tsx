'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  AlertCircle,
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
import {
  buildMasterPrompt,
  EVENT_OPTIONS,
  getEventOption,
  getSceneIndex,
  type CustomerCategory,
  type EventId,
  type VideoPromptSet,
} from '@/lib/maharaja/config';
import { VIDEO_TEST_MODELS } from '@/lib/maharaja/video-test';

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
    videoMasterApproved?: boolean;
    videoMasterCategory?: CustomerCategory | null;
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
  if (!response.ok || !data.success) {
    throw new Error(data.error || (response.status === 413
      ? 'Photo is too large. Please capture the tag again.'
      : `Request failed (${response.status}). Please try again.`));
  }
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
  const [sessionId] = useState(() => retrySessionId || `maharaja_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`);
  const [promptSet, setPromptSet] = useState<VideoPromptSet>(() => (getSceneIndex(sessionId) === 1 ? 'set-2' : 'set-1'));
  const [purchaseConfirmed, setPurchaseConfirmed] = useState(service === 'ai-video');
  const [isFullCameraOpen, setIsFullCameraOpen] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [tryOnGrant, setTryOnGrant] = useState('');
  const [tryOnUsed, setTryOnUsed] = useState(false);
  const [retryUsed, setRetryUsed] = useState(false);
  const [allowances, setAllowances] = useState<{
    enforceRepeatLimits?: boolean;
    tryOn: { used: number; max: number; remaining: number };
    masterImage: { used: number; max: number; remaining: number };
    video: { used: number; max: number; remaining: number };
  }>({
    enforceRepeatLimits: false,
    tryOn: { used: 0, max: 2, remaining: 2 },
    masterImage: { used: 0, max: 2, remaining: 2 },
    video: { used: 0, max: 2, remaining: 2 },
  });
  const [personPhoto, setPersonPhoto] = useState<string | null>(null);
  const [garmentPhotos, setGarmentPhotos] = useState<string[]>([]);
  const [garmentRoles, setGarmentRoles] = useState<string[]>(['Top / Shirt', 'Bottom / Pant', 'Extra / Layer']);
  const [personAnalysis, setPersonAnalysis] = useState<Analysis | null>(null);
  const [garmentAnalysis, setGarmentAnalysis] = useState<Analysis | null>(null);
  const [tryOnImageUrl, setTryOnImageUrl] = useState<string | null>(null);
  const [videoMasterUrl, setVideoMasterUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<'loading' | 'ready' | 'analyzing' | 'image' | 'video' | 'result'>('loading');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [processingConsent, setProcessingConsent] = useState(false);
  const [masterApproved, setMasterApproved] = useState(false);
  const [videoTestJobId, setVideoTestJobId] = useState('');
  const [videoTestUrl, setVideoTestUrl] = useState('');
  // Each tab shows its own image: plain Try-On vs. festival video master.
  const isTryOn = activeService === 'try-on';
  const maxGarmentPhotos = activeService === 'try-on' ? 1 : 3;
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
    setMasterApproved(false);
  }



  async function handleRetryImage() {
    const enforceLimits = allowances?.enforceRepeatLimits ?? false;
    if (enforceLimits && activeService === 'try-on' && allowances.tryOn.used >= 2) {
      setError('AI Try-On allowance exhausted (2/2 completed). Maximum 2 generations reached for this customer mobile number.');
      return;
    }
    if (enforceLimits && activeService === 'ai-video' && allowances.masterImage.used >= 2) {
      setError('Celebration Gemini Master Image allowance exhausted (2/2 completed). Maximum 2 generations reached for this customer mobile number.');
      return;
    }
    try {
      // Safely invalidate master image on server immediately
      await fetch('/api/ai/master-image/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessCode,
          sessionId,
          service: activeService,
          reason: 'customer_retry_requested',
        }),
      }).catch((e) => console.warn('Master image reject call failed:', e));

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
      setStage('ready');
      setTryOnImageUrl(null);
      setTryOnUsed(false);
      setVideoMasterUrl(null);
      setMasterApproved(false);
      setPersonPhoto(null);
      setPersonAnalysis(null);
      setGarmentPhotos([]);
      setGarmentAnalysis(null);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('tryfocus:maharaja:try-on-completed');
      }
      setMessage('Retry granted. Please upload or capture fresh customer and garment photo(s).');
      setError('');
    } catch (err) {
      setError(customerError(err, 'Could not initiate retry.'));
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
        if (data.allowances || data.access?.allowances) {
          setAllowances(data.allowances || data.access?.allowances);
        }
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
          setMessage('Video retry ready. The safe backup prompt will use the same approved image.');
        } else if (data.access.service === 'ai-video' && (data.access.tryOnImageUrl || data.access.videoMasterUrl)) {
          if (data.access.tryOnImageUrl) setTryOnImageUrl(data.access.tryOnImageUrl);
          if (data.access.videoMasterUrl) {
            setVideoMasterUrl(data.access.videoMasterUrl);
            setMasterApproved(Boolean(data.access.videoMasterApproved));
          }
          if (data.access.videoMasterCategory) {
            setCategory(data.access.videoMasterCategory);
          }
          if (data.access.videoMasterPromptSet) {
            setPromptSet(data.access.videoMasterPromptSet);
          }
          setMessage(data.access.videoMasterUrl
            ? 'Your festival portrait is ready. Create your 6-second AI video below.'
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
    if (stage !== 'image' && stage !== 'video') return;
    const warnBeforeExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeExit);
    return () => window.removeEventListener('beforeunload', warnBeforeExit);
  }, [stage]);

  const enforceLimits = allowances?.enforceRepeatLimits ?? false;
  const isImageExhausted = enforceLimits && (activeService === 'try-on'
    ? allowances.tryOn.used >= 2
    : allowances.masterImage.used >= 2);

  const canGenerateImage = !isImageExhausted
    && processingConsent
    && purchaseConfirmed
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
    async (payload: { barcode: string; format: string; printedText: string; image?: string; confirmed?: boolean }) => {
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
          return { eligible: true, amount: data.analysis.amount as number, message: data.analysis.message as string };
        }
        return { eligible: data.analysis.eligible === true, amount: data.analysis.amount as number | null, message: data.analysis.message as string };
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
      setError(activeService === 'try-on'
        ? 'AI Try-On accepts exactly one garment photo.'
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
      setMessage(activeService === 'try-on'
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

  async function uploadPhotoToStorage(dataUrl: string, folder: 'person' | 'garment'): Promise<string> {
    try {
      const res = await fetch('/api/storage/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          accessCode,
          deviceId,
          folder,
          contentType: 'image/jpeg',
        }),
      });
      const data = await res.json();
      if (!data.success || !data.uploadUrl) return '';

      const base64Data = dataUrl.split(',')[1] || dataUrl;
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });

      let directUploadSucceeded = false;
      try {
        const putRes = await fetch(data.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: blob,
        });
        directUploadSucceeded = putRes.ok;
      } catch {
        // A browser CORS/network failure is recovered through the same-origin route below.
      }
      if (!directUploadSucceeded) {
        const fallbackRes = await fetch('/api/storage/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            accessCode,
            deviceId,
            folder,
            storagePath: data.storagePath,
            dataUrl,
          }),
        });
        const fallback = await fallbackRes.json().catch(() => ({}));
        if (!fallbackRes.ok || !fallback.success) return '';
      }
      return data.storagePath;
    } catch {
      return '';
    }
  }

  async function generateImage() {
    if (!canGenerateImage || !personPhoto) return;
    setStage('image');
    setError('');
    setMessage(activeService === 'try-on' ? 'Uploading photos and preparing Try-On...' : `Uploading photos and preparing ${event.label} portrait...`);
    try {
      const personStoragePath = await uploadPhotoToStorage(personPhoto, 'person');
      const garmentStoragePaths = await Promise.all(
        visibleGarmentPhotos.map((photo) => uploadPhotoToStorage(photo, 'garment'))
      );
      const allUploaded = Boolean(personStoragePath && garmentStoragePaths.length === visibleGarmentPhotos.length && garmentStoragePaths.every(Boolean));
      if (!allUploaded) {
        throw new Error('Secure photo upload did not complete. Check the connection and try again. No AI credit was used.');
      }

      setMessage(activeService === 'try-on' ? 'Generating your Maharaja AI Try-On image...' : `Generating your ${event.label} festival portrait...`);

      const requestBody: Record<string, any> = {
        sessionId,
        accessCode,
        service: activeService,
        eventId,
        templateId: category,
        promptSet,
        garmentRoles,
        personAnalysis,
        garmentAnalysis,
        deviceId,
        tryOnGrant,
        processingConsent,
        guardianProcessingConsent: (category === 'girl' || category === 'boy') ? processingConsent : false,
        consentVersion: '2026-10-privacy-v1',
        conceptPrompt: activeService === 'ai-video' ? buildMasterPrompt(category, eventId, sessionId, undefined, promptSet) : undefined,
      };

      requestBody.personPhotoStoragePath = personStoragePath;
      requestBody.garmentPhotoStoragePaths = garmentStoragePaths;

      const data = await readJson(await fetch('/api/ai/master-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }));
      if (data.allowances) {
        setAllowances(data.allowances);
      }
      if (activeService === 'try-on') {
        setTryOnImageUrl(data.masterImageUrl);
      } else {
        setVideoMasterUrl(data.masterImageUrl);
        setMasterApproved(Boolean(data.approved));
      }
      setMessage(activeService === 'try-on'
        ? 'Your Maharaja AI Try-On is ready.'
        : 'Festival portrait ready. Continue to create your AI video.');
    } catch (caught) {
      setError(customerError(caught, 'The AI image could not be generated. Please ask Maharaja staff for assistance.'));
    } finally {
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

  async function pollVideoTest(jobId: string) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 12 * 60 * 1000) {
      await new Promise((resolve) => window.setTimeout(resolve, 3000));
      const response = await fetch(`/api/video/status?jobId=${encodeURIComponent(jobId)}&accessCode=${encodeURIComponent(accessCode)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (data.status === 'ready' && data.videoUrl) {
        setVideoTestUrl(data.videoUrl);
        setMessage('Your cinematic video is ready. Review, download or send it to Maharaja TV.');
        setStage('result');
        return;
      }
      if (!response.ok || data.status === 'failed') {
        throw new Error(data.error || `Video test failed (${response.status}).`);
      }
      setMessage('Fal is rendering the controlled test. Keep this page open.');
    }
    throw new Error('Video test timed out. The job remains recorded for staff review.');
  }

  async function startVideoTest() {
    if (!videoMasterUrl || stage === 'video') return;
    setStage('video');
    setError('');
    setVideoTestUrl('');
    setMessage('Locking this request and validating the exact image sent to Fal...');
    try {
      if (!masterApproved) {
        await readJson(await fetch('/api/ai/master-image/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessCode, sessionId, masterImageUrl: videoMasterUrl }),
        }));
        setMasterApproved(true);
      }
      const data = await readJson(await fetch('/api/video/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode, sessionId }),
      }));
      setVideoTestJobId(data.jobId);
      setMessage(`Submitted to ${VIDEO_TEST_MODELS[0].label}. Keep this page open.`);
      await pollVideoTest(data.jobId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The controlled video test failed.');
      setMessage('The test stopped. No fallback model or automatic retry was used.');
      setStage('ready');
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#21090E]/90 p-5 text-center text-white backdrop-blur-sm" role="alert" aria-live="assertive">
          <div className="w-full max-w-sm border border-[#D4AF37]/55 bg-[#2A060C] p-6 shadow-2xl">
            <div className="relative mx-auto mb-5 h-20 w-20">
              <span className="absolute inset-0 animate-ping rounded-full border-2 border-[#D4AF37]/45" />
              <span className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-t-[#D4AF37] border-r-[#D4AF37]" />
              <span className="absolute inset-0 flex items-center justify-center text-3xl">🪔</span>
            </div>
            <p className="font-serif text-xl font-bold text-[#F3E5AB]">{stage === 'image' ? 'Creating your Diwali portrait' : 'Rendering your Diwali film'}</p>
            <p className="mt-2 text-sm leading-6 text-[#F3E5AB]/85">{stage === 'image' ? 'Securing your photos and building the festive scene.' : 'Adding cinematic light, depth and motion to your approved portrait.'}</p>
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-[#D4AF37]">Please keep this page open</p>
          </div>
        </div>
      )}
      <header className="border-b border-[#D4AF37]/30 bg-[#21090E] px-5 py-5 text-[#F3E5AB]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div><p className="text-xs font-bold uppercase text-[#D4AF37]">Majestic Maharaja · powered by <a href="https://www.tryfocus.in" target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition">TryFocus</a></p><h1 className="mt-1 font-serif text-2xl font-bold">Maharaja AI Experience</h1></div>
          {activeService === 'try-on' ? <Shirt className="h-7 w-7 text-[#D4AF37]" /> : <Film className="h-7 w-7 text-[#D4AF37]" />}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6">
        {stage === 'result' ? (
          <ResultClient
            sessionId={sessionId}
            accessCode={accessCode}
            initialVideoJobId={videoTestJobId}
            initialVideoUrl={videoTestUrl}
            initialMasterImageUrl={videoMasterUrl || ''}
            initialEventId={eventId}
            initialAllowances={allowances}
            initialRetryUsed={retryUsed}
            onRetryUsed={() => { if (enforceLimits) setRetryUsed(true); }}
            onBack={() => setStage('ready')}
          />
        ) : (
          <>
        {service === 'ai-video' && access?.access.phoneMasked && (
          <div className="mb-4 border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">Pass verified for {access.access.phoneMasked} · Bill ****{access.access.billLast4}</div>
        )}


        {/* Exhaustion Notices */}
        {enforceLimits && activeService === 'try-on' && allowances.tryOn.used >= 2 && (
          <div className="mb-4 border border-red-300 bg-red-50 p-3 text-xs md:text-sm font-bold text-red-800 text-center rounded shadow-sm">
            AI Try-On allowance exhausted (2/2 completed). Limit reached for this customer.
          </div>
        )}
        {enforceLimits && activeService === 'ai-video' && !videoMasterUrl && allowances.masterImage.used >= 2 && (
          <div className="mb-4 border border-red-300 bg-red-50 p-3 text-xs md:text-sm font-bold text-red-800 text-center rounded shadow-sm">
            Celebration Image allowance exhausted (2/2 completed). Limit reached for this customer.
          </div>
        )}
        {enforceLimits && activeService === 'ai-video' && masterApproved && allowances.video.used >= 2 && (
          <div className="mb-4 border border-red-300 bg-red-50 p-3 text-xs md:text-sm font-bold text-red-800 text-center rounded shadow-sm">
            Cinematic Video allowance exhausted (2/2 completed). Limit reached for this customer.
          </div>
        )}

        <div className="mb-5 grid grid-cols-2 border border-[#D8C49B] bg-white p-1">
          <button type="button" onClick={() => setActiveService('try-on')} className={`min-h-12 px-3 text-xs font-bold uppercase ${activeService === 'try-on' ? 'bg-[#6E0D1F] text-[#F3E5AB]' : 'text-[#6E0D1F]'}`}><Shirt className="mr-2 inline h-4 w-4" />AI Try-On</button>
          <button type="button" disabled={service !== 'ai-video'} onClick={() => { setActiveService('ai-video'); setPurchaseConfirmed(true); }} className={`min-h-12 px-3 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${activeService === 'ai-video' ? 'bg-[#21090E] text-[#F3E5AB]' : 'text-[#6E0D1F]'}`}><Film className="mr-2 inline h-4 w-4" />AI Video<span className="block text-[10px] normal-case">{service === 'ai-video' ? 'Unlocked' : 'Above Rs 5000 purchase'}</span></button>
        </div>

        {enforceLimits && activeService === 'try-on' && tryOnUsed && (
          <section id="tryon-completed-banner" className="mx-auto max-w-xl border border-[#D8C49B] bg-white p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-700" />
            <h2 className="mt-3 font-serif text-3xl font-bold text-[#2A060C]">Try-On completed</h2>
            <p className="mt-3 text-sm leading-6 text-[#5C4B43]">This device has completed its Maharaja AI Try-On. Thank you for visiting Maharaja!</p>
          </section>
        )}

        {activeService === 'try-on' && (!enforceLimits || !tryOnUsed) && !purchaseConfirmed && (
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
                  <fieldset className="sm:col-span-2"><legend className="text-xs font-bold uppercase text-[#5C4B43]">Customer category</legend><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{(['women', 'men', 'girl', 'boy'] as CustomerCategory[]).map((option) => <button key={option} type="button" aria-pressed={category === option} disabled={busy || imagesLocked} onClick={() => { setCategory(option); setProcessingConsent(false); clearActiveImage(); }} className={`flex min-h-12 items-center justify-center gap-1.5 border px-2 text-xs font-bold uppercase transition ${category === option ? 'border-[#6E0D1F] bg-[#6E0D1F] text-[#F3E5AB] shadow-sm' : 'border-[#D8C49B] bg-[#FFFDF8] text-[#5C4B43] hover:border-[#6E0D1F]'}`}>{category === option && <CheckCircle2 className="h-4 w-4" />}{option}</button>)}</div></fieldset>

                  <label className="text-xs font-bold uppercase text-[#5C4B43] sm:col-span-2">Event
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
                          Garment Photos ({visibleGarmentPhotos.length}/{maxGarmentPhotos} max)
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
                            {activeService === 'try-on' ? '1 garment photo' : '1 to 3 garment photos'}
                          </span>
                          <span className="text-[11px] text-center text-slate-400">
                            Front view, bottom/pant, or border/detail
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
                        <Camera className="h-4 w-4" /> {garmentPhotos.length > 0 && garmentPhotos.length < maxGarmentPhotos ? '+ Add photo' : 'Add photo'}
                        <input
                          id="garment-camera-input"
                          type="file"
                          accept="image/*"
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

                {!masterImageUrl && (
                  <label className="mt-5 flex cursor-pointer items-start gap-3 border border-[#D8C49B] bg-[#FFF9EC] p-3.5 text-left">
                    <input
                      type="checkbox"
                      checked={processingConsent}
                      onChange={(event) => setProcessingConsent(event.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-[#6E0D1F]"
                    />
                    <span className="text-xs leading-5 text-[#5C4B43]">
                      {category === 'girl' || category === 'boy'
                        ? 'I confirm that I am the parent or legal guardian and agree to the temporary processing of these photos to create this Maharaja AI experience.'
                        : 'I agree to the temporary processing of the uploaded photos to create this Maharaja AI experience.'}{' '}
                      <Link href="/privacy" className="font-bold text-[#6E0D1F] underline underline-offset-2">Privacy &amp; Data Use</Link>
                      <span className="px-1">·</span>
                      <Link href="/terms" className="font-bold text-[#6E0D1F] underline underline-offset-2">Terms</Link>
                    </span>
                  </label>
                )}

                {!masterImageUrl && <button type="button" id="generate-master-image-btn" onClick={() => void generateImage()} disabled={!canGenerateImage || busy} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 bg-[#6E0D1F] px-5 text-xs font-bold uppercase text-[#F3E5AB] disabled:opacity-40">{stage === 'image' ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />} {activeService === 'try-on' ? 'Generate AI Try-On' : 'Generate Festival Image for Video'}</button>}
              </div>}

              <aside className="border border-[#D8C49B] bg-[#21090E] p-5 text-center text-[#F3E5AB]">
                <SecureTryOnViewer
                  imageUrl={masterImageUrl}
                  alt="Generated Maharaja AI fashion result"
                  onRetryRequested={handleRetryImage}
                  retryUsed={retryUsed}
                  serviceType={activeService}
                  allowanceUsed={activeService === 'try-on' ? allowances?.tryOn?.used : allowances?.masterImage?.used}
                  allowanceMax={2}
                />
                {masterImageUrl && activeService === 'try-on' && (
                  <div className="mt-4 space-y-2">
                    <button type="button" id="download-tryon-btn" onClick={downloadImage} className="flex min-h-12 w-full items-center justify-center gap-2 bg-[#D4AF37] text-xs font-bold uppercase text-black hover:brightness-105"><Download className="h-4 w-4" /> Download Try-On</button>
                  </div>
                )}
                {masterImageUrl && activeService === 'ai-video' && (
                  <div className="mt-4 space-y-3 border border-[#D4AF37]/40 bg-black/25 p-4 text-left text-xs leading-5 text-[#F3E5AB]">
                    <div className="font-bold uppercase tracking-wide">H3 Max cinematic video · about ${VIDEO_TEST_MODELS[0].estimatedUsd.toFixed(2)}</div>
                    <p className="text-[#F3E5AB]/80">One click submits one paid six-second H3 generation. The completed result is saved securely for download and optional nine-second showroom presentation.</p>
                    <button
                      type="button"
                      onClick={() => void startVideoTest()}
                      disabled={stage === 'video'}
                      className="flex min-h-12 w-full items-center justify-center gap-2 bg-[#D4AF37] px-4 font-bold uppercase text-[#21090E] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {stage === 'video' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                      {stage === 'video' ? 'Video in progress' : 'Generate AI video'}
                    </button>
                    {videoTestJobId && <p className="break-all text-[10px] text-[#F3E5AB]/60">Job: {videoTestJobId}</p>}
                    {videoTestUrl && (
                      <video src={videoTestUrl} controls muted playsInline preload="metadata" className="aspect-[9/16] w-full bg-black object-contain" />
                    )}
                  </div>
                )}
              </aside>
            </section>
          </>
        )}
          </>
        )}
      </div>
      <div className="mx-auto mt-6 max-w-5xl border-t border-[#D8C49B] px-4 py-5 text-center text-[11px] leading-5 text-[#5C4B43]">
        {activeService === 'try-on'
          ? 'Your photos are temporarily processed to create this Try-On and are removed from Maharaja storage after generation. The downloaded result remains on your device.'
          : 'AI Video media is temporarily retained for delivery and removed within 3 days unless an adult separately permits promotional use. Anonymous usage totals may be retained.'}{' '}
        <Link href="/privacy" className="font-bold text-[#6E0D1F] underline underline-offset-2">Privacy &amp; Data Use</Link>
        <span className="px-1.5">·</span>
        <Link href="/terms" className="font-bold text-[#6E0D1F] underline underline-offset-2">Terms</Link>
      </div>
    </main>
  );
}
