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
  MoreVertical,
  RotateCcw,
  Film,
  LoaderCircle,
  Shirt,
  Sparkles,
  ScanLine,
  User,
  Plus,
  X,
} from 'lucide-react';
import { compressImage } from '@/lib/utils/image';
import { LOOK_PREFILL_KEY, type LookPrefill } from '@/lib/maharaja/look-prefill';
import {
  EVENT_OPTIONS,
  GARMENT_TYPE_VALUES,
  getEventOption,
  type CustomerCategory,
  type EventId,
  type GarmentType,
} from '@/lib/maharaja/config';
import { conceptsForCategory, getVideoConcept, type VideoConceptId } from '@/lib/maharaja/video-concepts';

const BarcodePriceScanner = dynamic(() => import('@/components/BarcodePriceScanner'), { ssr: false });
const SecureTryOnViewer = dynamic(() => import('@/components/SecureTryOnViewer'), { ssr: false });
const BeforeAfterSlider = dynamic(() => import('@/components/BeforeAfterSlider'), { ssr: false });
const ResultClient = dynamic(() => import('@/app/result/[sessionId]/ResultClient'), { ssr: false });

type AccessResponse = {
  workspace: { clientName: string; campaignEnabled: boolean; tryOnMinimum: number; aiVideoMinimum: number; activeEvents: EventId[]; defaultEvent: EventId };
  access: {
    service: 'try-on' | 'ai-video';
    eventId: EventId;
    eventLabel: string;
    phoneMasked: string | null;
    billLast4: string | null;
    experienceType?: 'purchased-garment' | 'catalogue-gift';
    catalogueProduct?: { sku: string; title?: string; price?: number } | null;
    tryOnUsed: boolean;
    videoMasterApproved?: boolean;
    videoMasterCategory?: CustomerCategory | null;
    videoMasterConceptId?: VideoConceptId | null;
    videoReferenceSessionId?: string | null;
    activeVideoJobId?: string | null;
  };
};

type Analysis = Record<string, unknown> & {
  valid?: boolean;
  additionalPhotoRequired?: boolean;
  operatorMessage?: string;
  garmentType?: string;
  primaryColor?: string;
};

const GARMENT_ROLE_OPTIONS: Record<GarmentType, string[]> = {
  unset: ['Garment piece 1', 'Garment piece 2', 'Garment detail'],
  saree: ['Saree body', 'Pallu / border', 'Blouse'],
  lehenga: ['Lehenga skirt', 'Choli / blouse', 'Dupatta / detail'],
  salwar: ['Kameez / top', 'Salwar / churidar', 'Dupatta / detail'],
  one_piece: ['Front view', 'Back / side view', 'Fabric detail'],
  two_piece: ['Top', 'Bottom', 'Detail / layer'],
  three_piece: ['Outer layer', 'Inner layer', 'Bottom'],
  shirt_pant: ['Shirt', 'Pant / trouser', 'Detail / layer'],
  tshirt_bottom: ['T-shirt / top', 'Bottom', 'Detail / layer'],
  kurta_dhoti: ['Kurta / shirt', 'Dhoti / trouser', 'Angavastram / detail'],
  dhoti_veshti: ['Shirt / kurta', 'Dhoti / veshti', 'Border / detail'],
  pattu_pavadai: ['Pavadai skirt', 'Blouse', 'Border / detail'],
  boy_ethnic: ['Top / shirt', 'Bottom / dhoti', 'Layer / detail'],
  generic: ['Garment front', 'Garment detail', 'Border / layer'],
};

const GARMENT_TYPE_OPTIONS: Record<CustomerCategory, Array<{ value: GarmentType; label: string }>> = {
  women: [
    { value: 'unset', label: 'Select garment type' },
    { value: 'saree', label: 'Saree' },
    { value: 'salwar', label: 'Salwar suit / churidar' },
    { value: 'lehenga', label: 'Lehenga set' },
    { value: 'one_piece', label: 'One-piece dress' },
    { value: 'two_piece', label: 'Two-piece set' },
    { value: 'three_piece', label: 'Three-piece set' },
  ],
  men: [
    { value: 'unset', label: 'Select garment type' },
    { value: 'shirt_pant', label: 'Shirt + pant' },
    { value: 'tshirt_bottom', label: 'T-shirt + bottom' },
    { value: 'kurta_dhoti', label: 'Kurta + bottom' },
    { value: 'dhoti_veshti', label: 'Dhoti / veshti set' },
    { value: 'one_piece', label: 'Single garment' },
    { value: 'three_piece', label: 'Three-piece set' },
  ],
  girl: [
    { value: 'unset', label: 'Select garment type' },
    { value: 'pattu_pavadai', label: 'Pattu pavadai set' },
    { value: 'lehenga', label: 'Lehenga set' },
    { value: 'salwar', label: 'Salwar suit / churidar' },
    { value: 'one_piece', label: 'One-piece dress' },
    { value: 'two_piece', label: 'Two-piece set' },
  ],
  boy: [
    { value: 'unset', label: 'Select garment type' },
    { value: 'boy_ethnic', label: 'Kurta + bottom' },
    { value: 'dhoti_veshti', label: 'Dhoti / veshti set' },
    { value: 'shirt_pant', label: 'Shirt + pant' },
    { value: 'tshirt_bottom', label: 'T-shirt + bottom' },
    { value: 'one_piece', label: 'Single garment' },
  ],
};

function rolesForGarment(garmentType: GarmentType) {
  return [...GARMENT_ROLE_OPTIONS[garmentType]];
}

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
  return (message || fallback)
    .replace(/AIza[\w-]{20,}/g, '[redacted]')
    .replace(/Key\s+[\w-]{20,}/gi, 'Key [redacted]');
}

const videoTestModelOptions = [
  { value: 'h3-max', label: 'H3 Max · 768p' },
  { value: 'pixverse-c1', label: 'PixVerse C1 · 720p' },
];

export default function MaharajaExperience({ service, accessCode, retrySessionId = '' }: { service: 'try-on' | 'ai-video'; accessCode: string; retrySessionId?: string }) {
  const [access, setAccess] = useState<AccessResponse | null>(null);
  const [activeService, setActiveService] = useState<'try-on' | 'ai-video'>(service);
  const [eventId, setEventId] = useState<EventId>('diwali');
  const [category, setCategory] = useState<CustomerCategory>('women');
  const [sessionId, setSessionId] = useState(() => retrySessionId || `maharaja_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`);
  const [conceptId, setConceptId] = useState<VideoConceptId>('women-golden-courtyard');
  // ₹500 minimum is disabled by default in client admin, so direct QR scans go straight to upload.
  const [purchaseConfirmed, setPurchaseConfirmed] = useState(true);
  const [isFullCameraOpen, setIsFullCameraOpen] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [tryOnGrant, setTryOnGrant] = useState('');
  const [tryOnUsed, setTryOnUsed] = useState(false);
  const [retryUsed, setRetryUsed] = useState(false);
  const [showImageRetryMenu, setShowImageRetryMenu] = useState(false);
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
  const [garmentType, setGarmentType] = useState<GarmentType>('unset');
  const [garmentTypeConfirmed, setGarmentTypeConfirmed] = useState(false);
  const [garmentRoles, setGarmentRoles] = useState<string[]>(() => rolesForGarment('unset'));
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
  const [videoTestModel, setVideoTestModel] = useState('h3-max');
  const [generationProgress, setGenerationProgress] = useState(0);
  const [photoInputError, setPhotoInputError] = useState('');
  const resumedVideoJobRef = useRef('');
  // Each tab shows its own image: plain Try-On vs. festival video master.
  const isTryOn = activeService === 'try-on';
  const maxGarmentPhotos = isTryOn ? (allowances.tryOn.used > 0 || (service === 'try-on' && retryUsed) ? 3 : 1) : 2;
  const visibleGarmentPhotos = garmentPhotos.slice(0, maxGarmentPhotos);
  const masterImageUrl = isTryOn ? tryOnImageUrl : videoMasterUrl;
  const isCatalogueGift = access?.access.experienceType === 'catalogue-gift';
  const selectableCategories: CustomerCategory[] = ['women', 'men', 'girl', 'boy'];
  const generationStatus = useMemo(() => {
    if (stage === 'image') {
      if (generationProgress < 25) return 'Securing your photos and garment details…';
      if (generationProgress < 55) return 'Building your festive portrait composition…';
      if (generationProgress < 82) return 'Refining identity, fabric and lighting…';
      return 'Finishing your full-quality portrait…';
    }
    return 'The video provider is rendering your film. This can take several minutes; your request remains saved.';
  }, [generationProgress, stage]);

  useEffect(() => {
    if (stage !== 'image') return;
    setGenerationProgress((current) => current > 0 ? current : 4);
    const timer = window.setInterval(() => {
      setGenerationProgress((current) => {
        if (current >= 95) return current;
        if (current < 35) return Math.min(95, current + 4);
        if (current < 70) return Math.min(95, current + 2);
        return Math.min(95, current + 1);
      });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [stage]);
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
      await readJson(await fetch('/api/ai/master-image/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode, sessionId, service: activeService, reason: 'customer_retry_requested' }),
      }));
      setStage('ready');
      setRetryUsed(true);
      setTryOnImageUrl(null);
      setTryOnUsed(false);
      setVideoMasterUrl(null);
      setMasterApproved(false);
      setPersonPhoto(null);
      setPersonAnalysis(null);
      setGarmentPhotos([]);
      setGarmentAnalysis(isCatalogueGift ? { valid: true, additionalPhotoRequired: false, garmentType: 'saree', primaryColor: 'Original color' } : null);
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

  // A pass started from a TV or tablet Try-On look arrives with that look (and the customer's own
  // garment photo) in session storage, so the customer goes straight to the festival portrait.
  function applyLookPrefill(catalogueGift: boolean) {
    let prefill: LookPrefill | null = null;
    try {
      const key = LOOK_PREFILL_KEY(accessCode);
      const raw = window.sessionStorage.getItem(key);
      window.sessionStorage.removeItem(key);
      prefill = raw ? JSON.parse(raw) as LookPrefill : null;
    } catch {
      prefill = null;
    }
    if (!prefill?.personPhoto?.startsWith('data:image/')) return;
    setPersonPhoto(prefill.personPhoto);
    setPersonAnalysis({ valid: true, additionalPhotoRequired: false, operatorMessage: 'Photo from your Try-On look.' });
    const garments = (prefill.garmentPhotos || []).filter((item) => item.startsWith('data:image/'));
    if (!catalogueGift && garments.length) {
      setGarmentPhotos(garments.slice(0, 2));
      const lookType = GARMENT_TYPE_VALUES.find((item) => item === prefill?.garmentType && item !== 'unset');
      if (lookType) {
        setGarmentType(lookType);
        setGarmentTypeConfirmed(true);
        setGarmentRoles(rolesForGarment(lookType));
      }
      setGarmentAnalysis({ valid: true, additionalPhotoRequired: false, garmentType: lookType || 'unset', primaryColor: 'Original color' });
    }
    setMessage('Your Try-On look is added. Choose your festival scene and create your portrait.');
  }

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
        // ₹500 minimum is disabled by default in admin, so keep purchaseConfirmed true.
        setPurchaseConfirmed(service !== 'try-on' || !!data.access.phoneMasked || Number(data.workspace?.tryOnMinimum || 0) === 0);
        if (data.access.experienceType === 'catalogue-gift') {
          setActiveService('ai-video');
          const giftCategory = (data.access.videoMasterCategory as CustomerCategory) || 'women';
          setCategory(giftCategory);
          setConceptId(conceptsForCategory(giftCategory)[0].id);
          setGarmentType(data.access.videoMasterGarmentType || (giftCategory === 'men' ? 'kurta_dhoti' : giftCategory === 'boy' ? 'boy_ethnic' : giftCategory === 'girl' ? 'girl_ethnic' : 'saree'));
          setGarmentTypeConfirmed(true);
          setGarmentRoles(['Catalogue Garment Reference']);
          setGarmentAnalysis({ valid: true, additionalPhotoRequired: false, garmentType: giftCategory === 'men' ? 'kurta_dhoti' : 'saree', primaryColor: 'Original color' });
        }
        const used = data.access.service === 'try-on' && data.access.tryOnUsed === true;
        setTryOnUsed(used);
        if (data.access?.retryUsed) setRetryUsed(true);
        if (data.access.service === 'ai-video' && (data.access.tryOnImageUrl || data.access.videoMasterUrl)) {
          if (data.access.tryOnImageUrl) setTryOnImageUrl(data.access.tryOnImageUrl);
          if (data.access.videoMasterUrl) {
            setVideoMasterUrl(data.access.videoMasterUrl);
            setMasterApproved(Boolean(data.access.videoMasterApproved));
          }
          if (data.access.videoMasterCategory) {
            setCategory(data.access.videoMasterCategory);
          }
          if (data.access.videoMasterConceptId) setConceptId(data.access.videoMasterConceptId);
          setMessage(data.access.videoMasterUrl
            ? retrySessionId
              ? 'Your approved festival portrait is ready for another video generation.'
              : 'Your festival portrait is ready. Create your 6-second AI video below.'
            : 'Your Try-On image is ready. Switch to AI Video to create your festival image and video.');
        }
        const recoveryJobId = data.access.activeVideoJobId;
        const recoverySessionId = data.access.videoReferenceSessionId;
        if (recoverySessionId) setSessionId(recoverySessionId);
        if (
          data.access.service === 'ai-video'
          && recoveryJobId
          && recoverySessionId
          && resumedVideoJobRef.current !== recoveryJobId
        ) {
          resumedVideoJobRef.current = recoveryJobId;
          setSessionId(recoverySessionId);
          setVideoTestJobId(recoveryJobId);
          setGenerationProgress(0);
          setMessage('Your completed film is being prepared for preview. No new video request has been sent.');
          setStage('video');
          void pollVideoTest(recoveryJobId).catch((error) => {
            setError(customerError(error, 'Your completed film is still being prepared. Please refresh once more.'));
            setMessage('Your completed film is still being prepared. No new video request has been sent.');
            setStage('ready');
          });
          return;
        }
        if (!used) window.localStorage.removeItem('tryfocus:maharaja:try-on-completed');
        if (service === 'ai-video' && !data.access.videoMasterUrl) applyLookPrefill(data.access.experienceType === 'catalogue-gift');
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
    && (activeService === 'ai-video' || !!access?.access.phoneMasked || !!tryOnGrant || Number(access?.workspace.tryOnMinimum || 0) === 0)
    && !!personPhoto
    && (isCatalogueGift || garmentPhotos.length > 0)
    && garmentTypeConfirmed
    && (activeService === 'try-on' || !!getVideoConcept(conceptId))
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
        const requestBody = JSON.stringify({ ...payload, accessCode, deviceId });
        let response: Response | null = null;
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const controller = new AbortController();
          const timeout = window.setTimeout(() => controller.abort(), 20_000);
          try {
            response = await fetch('/api/ai/analyze-price-tag', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: requestBody,
              signal: controller.signal,
            });
            break;
          } catch (caught) {
            lastError = caught;
            if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 500));
          } finally {
            window.clearTimeout(timeout);
          }
        }
        if (!response) throw lastError instanceof Error ? lastError : new Error('Connection failed while verifying the MRP.');
        const data = await readJson(response);
        if (data.analysis.eligible === true && data.grant?.token) {
          setTryOnGrant(data.grant.token);
          setMessage(data.analysis.message);
          setPurchaseConfirmed(true);
          setIsFullCameraOpen(false);
          return { eligible: true, amount: data.analysis.amount as number, message: data.analysis.message as string };
        }
        return { eligible: data.analysis.eligible === true, amount: data.analysis.amount as number | null, message: data.analysis.message as string };
      } catch (caught) {
        const message = caught instanceof DOMException && caught.name === 'AbortError'
          ? 'MRP verification timed out. Check the connection and retake the tag.'
          : customerError(caught, 'Could not verify the tag. Please try again.');
        return { eligible: false, message };
      }
    },
    [accessCode, deviceId]
  );

  async function analyzePerson(file: File) {
    setStage('analyzing');
    setError('');
    clearActiveImage();
    try {
      const { dataUrl } = await compressImage(file, 1024, 0.78);
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

  async function readImageDimensions(file: File) {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('This photo could not be read. Retake it with the camera.'));
      };
      image.src = objectUrl;
    });
  }

  async function analyzeGarments(files: File[], append = false) {
    if (!files.length) return;
    setPhotoInputError('');
    const maxAllowed = maxGarmentPhotos;
    const currentCount = append ? garmentPhotos.length : 0;
    const availableSlots = maxAllowed - currentCount;
    if (availableSlots <= 0) {
      setError(`Only ${maxGarmentPhotos} garment photos can be added.`);
      return;
    }
    const selectedFiles = files.slice(0, availableSlots);
    const trimmedSelection = selectedFiles.length !== files.length;
    setStage('analyzing');
    setError('');
    clearActiveImage();
    try {
      if (activeService === 'ai-video') {
        for (const file of selectedFiles) {
          const dimensions = await readImageDimensions(file);
          if (dimensions.width < 256 || dimensions.height < 256) {
            throw new Error(`Photo is ${dimensions.width}×${dimensions.height}px. Retake it so the complete garment fills the frame; minimum size is 256×256px.`);
          }
          const aspectRatio = dimensions.width / dimensions.height;
          if (aspectRatio < 0.4 || aspectRatio > 2.5) {
            throw new Error(`Photo shape is ${dimensions.width}×${dimensions.height}px. Retake it with the complete garment in frame; the image must not be an extremely narrow strip.`);
          }
        }
      }
      const compressed = await Promise.all(selectedFiles.map((file) => compressImage(file, 1024, 0.78)));
      const newImages = compressed.map((item) => item.dataUrl);
      const combined = append ? [...garmentPhotos, ...newImages].slice(0, maxAllowed) : newImages.slice(0, maxAllowed);
      setGarmentPhotos(combined);
      setGarmentAnalysis({ valid: true, additionalPhotoRequired: false, garmentType, primaryColor: 'Original color' });
      setMessage(trimmedSelection
        ? `Only ${availableSlots} garment photo${availableSlots === 1 ? '' : 's'} could be added. Maximum is ${maxGarmentPhotos}.`
        : `${combined.length} garment photo${combined.length === 1 ? '' : 's'} ready (up to ${maxGarmentPhotos}).`);
    } catch (caught) {
      setGarmentAnalysis(null);
      const message = customerError(caught, 'The garment photo could not be prepared. Please take the photo again.');
      setPhotoInputError(message);
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
      if (!res.ok || !data.success || !data.uploadUrl || !data.storagePath) {
        throw new Error(data.error || 'Secure photo upload could not be prepared. Check the connection and try again.');
      }

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
        if (!fallbackRes.ok || !fallback.success) {
          throw new Error(fallback.error || 'Secure photo upload failed. Check the connection and try again.');
        }
      }
      return data.storagePath;
    } catch (caught) {
      throw caught instanceof Error
        ? caught
        : new Error('Secure photo upload failed. Check the connection and try again.');
    }
  }

  async function generateImage() {
    if (!canGenerateImage || !personPhoto) return;
    setStage('image');
    setGenerationProgress(4);
    setError('');
    setMessage(activeService === 'try-on' ? 'Uploading photos and preparing Try-On...' : `Uploading photos and preparing ${event.label} portrait...`);
    const progressTimers = [
      window.setTimeout(() => setMessage(activeService === 'try-on' ? 'Creating your Try-On image...' : 'Creating your festival portrait with Gemini...'), 3500),
      window.setTimeout(() => setMessage('Synthesizing garment details and festival scene...'), 14000),
      window.setTimeout(() => setMessage('Applying lighting, depth and high-resolution polish...'), 24000),
    ];
    try {
      // Upload person and garment references concurrently via Promise.all
      // to eliminate sequential upload wait time on mobile networks.
      const [personStoragePath, ...garmentStoragePaths] = await Promise.all([
        uploadPhotoToStorage(personPhoto, 'person'),
        ...(isCatalogueGift ? [] : visibleGarmentPhotos.map((photo) => uploadPhotoToStorage(photo, 'garment'))),
      ]);
      const allUploaded = Boolean(personStoragePath && (isCatalogueGift || (garmentStoragePaths.length === visibleGarmentPhotos.length && garmentStoragePaths.every(Boolean))));
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
        conceptId: activeService === 'ai-video' ? conceptId : undefined,
        garmentType,
        garmentTypeConfirmed,
        garmentRoles,
        personAnalysis,
        garmentAnalysis,
        deviceId,
        tryOnGrant,
        processingConsent,
        guardianProcessingConsent: (category === 'girl' || category === 'boy') ? processingConsent : false,
        consentVersion: '2026-10-privacy-v2',
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
      const elapsedSeconds = typeof data.timing?.totalMs === 'number' ? Math.max(1, Math.round(data.timing.totalMs / 1000)) : null;
      setMessage(activeService === 'try-on'
        ? `Your Maharaja AI Try-On is ready${elapsedSeconds ? ` in ${elapsedSeconds}s` : ''}.`
        : `Festival portrait ready${elapsedSeconds ? ` in ${elapsedSeconds}s` : ''}. Continue to create your AI video.`);
      setGenerationProgress(100);
      await new Promise((resolve) => window.setTimeout(resolve, 450));
    } catch (caught) {
      setError(customerError(caught, 'The AI image could not be generated. Please ask Maharaja staff for assistance.'));
    } finally {
      progressTimers.forEach((timer) => window.clearTimeout(timer));
      setStage('ready');
    }
  }

  async function downloadImage() {
    if (!masterImageUrl) return;
    setError('');
    try {
      let blob: Blob;
      if (masterImageUrl.startsWith('data:')) {
        const parts = masterImageUrl.split(',');
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const binary = atob(parts[1]);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          array[i] = binary.charCodeAt(i);
        }
        blob = new Blob([array], { type: mime });
      } else {
        const response = await fetch('/api/download/asset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: masterImageUrl, sessionId, accessCode, kind: 'image' }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || 'Unable to download the image.');
        }
        blob = await response.blob();
      }

      const filename = `maharaja-${eventId}-${activeService === 'try-on' ? 'ai-try-on' : 'festival-image'}.jpg`;
      const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });

      // On mobile devices (iOS Safari, Android Chrome), use the native share sheet so users can directly "Save Image" to Photos
      if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Maharaja AI Try-On',
            text: 'Your Maharaja AI Try-On photo',
          });
          setMessage('Try-On photo saved successfully.');
          void fetch('/api/maharaja/activity', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'download', label: `${event.label} AI Try-On saved`, sessionId, accessCode }),
          }).catch(() => undefined);
          return;
        } catch (shareErr: any) {
          if (shareErr?.name === 'AbortError') return;
        }
      }

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.rel = 'noopener noreferrer';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      window.setTimeout(() => {
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
      }, 30000);

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
    while (true) {
      await new Promise((resolve) => window.setTimeout(resolve, 3000));
      const response = await fetch(`/api/video/status?jobId=${encodeURIComponent(jobId)}&accessCode=${encodeURIComponent(accessCode)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (data.status === 'ready' && data.videoUrl) {
        setVideoTestUrl(data.videoUrl);
        setGenerationProgress(100);
        setMessage('Your cinematic video is ready. Review, download or send it to Maharaja TV.');
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        setStage('result');
        return;
      }
      if (data.status === 'unknown') {
        setMessage('Checking the original film request after a connection interruption. No second request has been sent.');
        continue;
      }
      if (!response.ok || data.status === 'failed') {
        throw new Error(data.error || `Video test failed (${response.status}).`);
      }
      setMessage(data.providerStatus === 'FINALIZING'
        ? 'The video is ready and is being prepared for preview.'
        : 'The video provider is still rendering. This request is saved; refreshing will resume checking it.');
    }
  }

  async function startVideoTest(modelOverride?: string) {
    if (!videoMasterUrl || stage === 'video') return;
    const currentModel = modelOverride || videoTestModel;
    setStage('video');
    setGenerationProgress(4);
    setError('');
    setVideoTestUrl('');
    setMessage(currentModel === 'pixverse-c1'
      ? 'Preparing your approved portrait for PixVerse film generation…'
      : 'Preparing your approved portrait for film generation…');
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
        body: JSON.stringify({ accessCode, sessionId, videoModel: currentModel }),
      }));
      setVideoTestJobId(data.jobId);
      setGenerationProgress(0);
      setMessage(currentModel === 'pixverse-c1'
        ? 'Creating your film with PixVerse. Keep this page open.'
        : 'Your AI film is now being created. Keep this page open.');
      await pollVideoTest(data.jobId);
    } catch (caught) {
      setError(customerError(caught, 'Video generation interrupted. Please click Retry below to generate your video.'));
      setMessage('Generation interrupted. No second model was started. Review the message, then retry or choose the other video model.');
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
            <p className="mt-2 min-h-12 text-sm leading-6 text-[#F3E5AB]/85">{generationStatus}</p>
            {stage === 'image' ? <div className="mt-5" aria-label={`Generation progress ${generationProgress}%`}>
              <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-[#F3E5AB]/75">
                <span>Creating</span><span>{generationProgress}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/45">
                <div className="h-full rounded-full bg-[#D4AF37] transition-[width] duration-700 ease-out" style={{ width: `${generationProgress}%` }} />
              </div>
            </div> : <p className="mt-5 text-sm text-[#F3E5AB]" role="status">{message || 'Waiting for the video provider…'}</p>}
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-[#D4AF37]">You can refresh this page; the same job will resume</p>
          </div>
        </div>
      )}
      <header className="border-b border-[#D8DCD7] bg-[#F4F5F2] px-5 py-4 text-[#161918]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center border border-[#161918] bg-[#161918] font-mono text-xs font-bold tracking-widest text-[#FAF6EE]">
              TF
            </span>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#7A1428]">
                TryFocus × {access?.workspace.clientName || 'TryFocus'}
              </p>
              <h1 className="font-serif text-xl font-semibold text-[#161918]">
                {activeService === 'try-on' ? 'AI Image Try-On (Direct Scan · ₹500 Min Disabled)' : '1-Day AI Video Pass'}
              </h1>
            </div>
          </div>
          <div className="relative flex shrink-0 items-center gap-2">
            {masterImageUrl && stage !== 'result' && (
              <>
                <button type="button" aria-label="Image options" title="Image options" onClick={() => setShowImageRetryMenu((value) => !value)} className="flex h-10 w-10 items-center justify-center border border-[#D8DCD7] bg-white text-[#161918] hover:border-[#161918]"><MoreVertical className="h-5 w-5" /></button>
                {showImageRetryMenu && <div className="absolute right-0 top-11 z-40 w-40 border border-[#D8DCD7] bg-white p-1 text-[#161918] shadow-xl">
                  <button type="button" onClick={() => { setShowImageRetryMenu(false); if (window.confirm('Use your included image retry?')) void handleRetryImage(); }} className="flex min-h-10 w-full items-center gap-2 px-2 text-left text-xs font-bold hover:bg-[#F4F5F2]"><RotateCcw className="h-4 w-4" /> Retry image</button>
                </div>}
              </>
            )}
            {activeService === 'try-on' ? <Shirt className="h-6 w-6 text-[#7A1428]" /> : <Film className="h-6 w-6 text-[#7A1428]" />}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6">
        {stage === 'result' ? (
          <ResultClient
            embedded
            sessionId={sessionId}
            accessCode={accessCode}
            initialVideoJobId={videoTestJobId}
            initialVideoUrl={videoTestUrl}
            initialMasterImageUrl={videoMasterUrl || ''}
            initialEventId={eventId}
            allowGoLive={true}
            catalogueProduct={access?.access.catalogueProduct || null}
            onBack={() => { setVideoTestUrl(''); setVideoTestJobId(''); setStage('ready'); }}
          />
        ) : (
          <>
        {service === 'ai-video' && access?.access.phoneMasked && (
          <div className="mb-4 border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
            {isCatalogueGift ? `AI Video Gift Link verified for ${access.access.phoneMasked}` : `Purchased Garment Video verified for ${access.access.phoneMasked}`}
          </div>
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

        {!isCatalogueGift && <div className="mb-5 grid grid-cols-2 border border-[#D8C49B] bg-white p-1">
          <button type="button" onClick={() => setActiveService('try-on')} className={`min-h-12 px-3 text-xs font-bold uppercase ${activeService === 'try-on' ? 'bg-[#6E0D1F] text-[#F3E5AB]' : 'text-[#6E0D1F]'}`}><Shirt className="mr-2 inline h-4 w-4" />AI Try-On</button>
          <button type="button" disabled={service !== 'ai-video'} onClick={() => { setActiveService('ai-video'); setPurchaseConfirmed(true); }} className={`min-h-12 px-3 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${activeService === 'ai-video' ? 'bg-[#21090E] text-[#F3E5AB]' : 'text-[#6E0D1F]'}`}><Film className="mr-2 inline h-4 w-4" />AI Video<span className="block text-[10px] normal-case">{service === 'ai-video' ? 'Unlocked' : 'Above Rs 5000 purchase'}</span></button>
        </div>}

        {isCatalogueGift && access?.access.catalogueProduct && (
          <div className="mb-5 border border-[#D8C49B] bg-white p-4 text-center">
            <p className="text-xs font-bold uppercase text-[#8A6A20]">Your selected Maharaja saree</p>
            <p className="mt-1 font-serif text-xl font-bold text-[#2A060C]">{access.access.catalogueProduct.title}</p>
            <p className="mt-1 text-lg font-black text-[#6E0D1F]">Rs {new Intl.NumberFormat('en-IN').format(access.access.catalogueProduct.price || 0)}</p>
          </div>
        )}

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
                <div className={`${isCatalogueGift ? 'sm:grid-cols-1' : 'sm:grid-cols-2'} grid gap-4`}>
                  <fieldset className="sm:col-span-2"><legend className="text-xs font-bold uppercase text-[#5C4B43]">Customer category</legend><div className={`mt-2 grid grid-cols-2 gap-2 ${isCatalogueGift ? 'max-w-md' : 'sm:grid-cols-4'}`}>{selectableCategories.map((option) => <button key={option} type="button" aria-pressed={category === option} disabled={busy || imagesLocked} onClick={() => { setCategory(option); setConceptId(conceptsForCategory(option)[0].id); if (isCatalogueGift) { setGarmentType('saree'); setGarmentTypeConfirmed(true); setGarmentRoles(['Saree body, pallu, border and blouse reference']); setGarmentAnalysis({ valid: true, additionalPhotoRequired: false, garmentType: 'saree', primaryColor: 'Original color' }); } else { setGarmentType('unset'); setGarmentTypeConfirmed(false); setGarmentRoles(rolesForGarment('unset')); } setProcessingConsent(false); clearActiveImage(); }} className={`flex min-h-12 items-center justify-center gap-1.5 border px-2 text-xs font-bold uppercase transition ${category === option ? 'border-[#6E0D1F] bg-[#6E0D1F] text-[#F3E5AB] shadow-sm' : 'border-[#D8C49B] bg-[#FFFDF8] text-[#5C4B43] hover:border-[#6E0D1F]'}`}>{category === option && <CheckCircle2 className="h-4 w-4" />}{option}</button>)}</div>{isCatalogueGift && <p className="mt-2 text-xs leading-5 text-[#5C4B43]">Choose Women or Girl, then select one of three festive visual sets below. Your selected Maharaja saree stays unchanged.</p>}</fieldset>

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

                <div className={`${isCatalogueGift ? 'sm:grid-cols-1' : 'sm:grid-cols-2'} mt-6 grid gap-4`}>
                  <div className="border border-dashed border-[#B99A55] bg-[#FFF9EC] p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase text-[#6E0D1F]">Image 1 · Customer photo (identity source)</span>
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
                      <p className="mb-2 text-[11px] leading-4 text-[#5C4B43]">
                        Use the real customer only—never a catalogue model. Stand ~3 feet away in full stature; keep head, hands and legs/footwear clearly visible.
                      </p>

                      <div className="aspect-[3/4] overflow-hidden bg-white">
                        {personPhoto ? (
                          <img src={personPhoto} alt="Customer preview" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                            <User className="h-10 w-10 text-slate-300" />
                            <span className="text-xs font-bold uppercase">Customer identity photo</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2">
                      <label className="flex min-h-11 cursor-pointer items-center justify-center gap-1 bg-[#6E0D1F] text-xs font-bold uppercase text-[#F3E5AB]">
                        <Camera className="h-4 w-4" /> Add customer photo
                        <input id="person-photo-input" type="file" accept="image/*" className="hidden" disabled={busy || imagesLocked} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void analyzePerson(file); }} />
                      </label>
                    </div>
                  </div>

                  <div className={`${isCatalogueGift ? 'hidden' : 'flex'} border border-dashed border-[#B99A55] bg-[#FFF9EC] p-4 flex-col justify-between`}>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase text-[#6E0D1F]">
                          Image 2+ · Garment references ({visibleGarmentPhotos.length}/{maxGarmentPhotos} max)
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

                      <label className="mb-3 block text-xs font-bold uppercase text-[#5C4B43]">
                        Garment type
                        <select
                          value={garmentType}
                          disabled={busy || imagesLocked}
                          onChange={(event) => {
                            const nextType = event.target.value as GarmentType;
                            setGarmentType(nextType);
                            setGarmentTypeConfirmed(nextType !== 'unset');
                            setGarmentRoles(rolesForGarment(nextType));
                            setGarmentAnalysis((current) => current ? { ...current, garmentType: nextType } : current);
                          }}
                          className="mt-1 min-h-11 w-full border border-[#B99A55] bg-white px-3 text-sm font-semibold text-[#2A060C] outline-none focus:border-[#6E0D1F]"
                        >
                          {GARMENT_TYPE_OPTIONS[category].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                        <span className="mt-1 block normal-case font-medium text-[#6E0D1F]">Confirm the garment type first. The reference roles below are sent to AI.</span>
                        {garmentType === 'saree' && isTryOn && maxGarmentPhotos === 3 && <span className="mt-1 block normal-case font-medium text-[#6E0D1F]">On the Gemini retry, a blouse photo may be the third reference.</span>}
                      </label>

                      {garmentPhotos.length === 0 ? (
                        <div className="aspect-[3/4] overflow-hidden bg-white p-2 flex flex-col items-center justify-center gap-2 text-slate-400">
                          <Shirt className="h-10 w-10 text-slate-300" />
                          <span className="text-xs font-bold uppercase text-center">
                            {isTryOn ? `1 to ${maxGarmentPhotos} garment photo${maxGarmentPhotos === 1 ? '' : 's'}` : '1 to 2 garment photos'}
                          </span>
                          <span className="text-[11px] text-center text-slate-400">
                            {garmentType === 'saree' ? 'Saree body, pallu / border. Catalogue model faces are ignored.' : 'Front view, detail, or border / layer. Catalogue model faces are ignored.'}
                          </span>
                        </div>
                      ) : (
                        <div className={`grid gap-2 ${maxGarmentPhotos === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                          {visibleGarmentPhotos.map((photo, idx) => {
                            const defaultRole = GARMENT_ROLE_OPTIONS[garmentType][idx] || 'Garment detail';
                            const role = garmentRoles[idx] || defaultRole;
                            return (
                              <div key={idx} className="relative aspect-[3/4] overflow-hidden bg-white border border-[#DDD2BD] rounded-lg shadow-sm">
                                <img src={photo} alt={role} className="h-full w-full object-cover" />
                                <select
                                  value={role}
                                  disabled={imagesLocked}
                                  onChange={(event) => {
                                    const updated = [...garmentRoles];
                                    updated[idx] = event.target.value;
                                    setGarmentRoles(updated);
                                  }}
                                  className="absolute bottom-1 left-1 max-w-[92%] rounded border border-[#D4AF37]/50 bg-black/85 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#F3E5AB] outline-none"
                                  aria-label={`Garment photo ${idx + 1} role`}
                                >
                                  {GARMENT_ROLE_OPTIONS[garmentType].map((option) => <option key={option} value={option}>{option}</option>)}
                                </select>
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
                                multiple
                                className="hidden"
                                disabled={busy || imagesLocked}
                                onChange={(event) => {
                                  const files = Array.from(event.target.files || []);
                                  event.currentTarget.value = '';
                                  if (files.length) void analyzeGarments(files, true);
                                }}
                              />
                            </label>
                          )}
                        </div>
                      )}
                    </div>

                    {!isCatalogueGift && activeService === 'ai-video' && (
                      <fieldset className="mt-5 border-t border-[#D8C49B] pt-4">
                        <legend className="px-1 text-xs font-bold uppercase tracking-[0.16em] text-[#6E0D1F]">Choose your Diwali film</legend>
                        <p className="mt-1 text-xs leading-5 text-[#5C4B43]">Choose a title only. Your final portrait remains a surprise.</p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          {conceptsForCategory(category).map((concept, index) => (
                            <button
                              key={concept.id}
                              type="button"
                              disabled={busy || imagesLocked}
                              aria-pressed={conceptId === concept.id}
                              onClick={() => { setConceptId(concept.id); setProcessingConsent(false); clearActiveImage(); }}
                              className={`min-h-24 border p-3 text-left transition ${conceptId === concept.id ? 'border-[#D4AF37] bg-[#21090E] text-[#F3E5AB] shadow-sm' : 'border-[#D8C49B] bg-[#FFF9EC] text-[#2A060C] hover:border-[#6E0D1F]'}`}
                            >
                              <span className={`block text-[10px] font-bold tracking-[0.18em] ${conceptId === concept.id ? 'text-[#D4AF37]' : 'text-[#6E0D1F]'}`}>0{index + 1}</span>
                              <span className="mt-1 block font-serif text-base font-bold">{concept.title}</span>
                              <span className={`mt-1 block text-[11px] leading-4 ${conceptId === concept.id ? 'text-[#F3E5AB]/80' : 'text-[#5C4B43]'}`}>{concept.mood}</span>
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    )}

                    {photoInputError && <p className="mt-3 border border-red-300 bg-red-50 p-3 text-xs font-bold leading-5 text-red-700">{photoInputError}</p>}
                    <div className="mt-3 grid grid-cols-1 gap-2">
                      <label className={`flex min-h-11 cursor-pointer items-center justify-center gap-1 bg-[#6E0D1F] text-xs font-bold uppercase text-[#F3E5AB] ${garmentPhotos.length >= maxGarmentPhotos ? 'opacity-40 pointer-events-none' : ''}`}>
                        <Camera className="h-4 w-4" /> {garmentPhotos.length > 0 && garmentPhotos.length < maxGarmentPhotos ? '+ Add photo' : 'Add photo'}
                        <input
                          id="garment-photo-input"
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

                {isCatalogueGift && activeService === 'ai-video' && (
                  <fieldset className="mt-6 border-t border-[#D8C49B] pt-4">
                    <legend className="px-1 text-xs font-bold uppercase tracking-[0.16em] text-[#6E0D1F]">Choose your Diwali visual set</legend>
                    <p className="mt-1 text-xs leading-5 text-[#5C4B43]">Three approved settings are available for {category === 'girl' ? 'Girl' : 'Women'}. Your face and selected saree remain the visual authority.</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {conceptsForCategory(category).map((concept, index) => (
                        <button
                          key={concept.id}
                          type="button"
                          disabled={busy || imagesLocked}
                          aria-pressed={conceptId === concept.id}
                          onClick={() => { setConceptId(concept.id); setProcessingConsent(false); clearActiveImage(); }}
                          className={`min-h-24 border p-3 text-left transition ${conceptId === concept.id ? 'border-[#D4AF37] bg-[#21090E] text-[#F3E5AB] shadow-sm' : 'border-[#D8C49B] bg-[#FFF9EC] text-[#2A060C] hover:border-[#6E0D1F]'}`}
                        >
                          <span className={`block text-[10px] font-bold tracking-[0.18em] ${conceptId === concept.id ? 'text-[#D4AF37]' : 'text-[#6E0D1F]'}`}>0{index + 1}</span>
                          <span className="mt-1 block font-serif text-base font-bold">{concept.title}</span>
                          <span className={`mt-1 block text-[11px] leading-4 ${conceptId === concept.id ? 'text-[#F3E5AB]/80' : 'text-[#5C4B43]'}`}>{concept.mood}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}

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
                />
                {masterImageUrl && activeService === 'try-on' && (
                  <div className="mt-4 space-y-2">
                    <button type="button" id="download-tryon-btn" onClick={downloadImage} className="flex min-h-12 w-full items-center justify-center gap-2 bg-[#D4AF37] text-xs font-bold uppercase text-black hover:brightness-105"><Download className="h-4 w-4" /> Download Try-On</button>
                    {personPhoto && <BeforeAfterSlider before={personPhoto} after={masterImageUrl} />}
                  </div>
                )}
                {masterImageUrl && activeService === 'ai-video' && (
                  <div className="mt-4 space-y-3 border border-[#D4AF37]/40 bg-black/25 p-4 text-left text-xs leading-5 text-[#F3E5AB]">
                    <div className="font-bold uppercase tracking-wide">Create your cinematic AI film</div>
                    <p className="text-[#F3E5AB]/80">Your approved portrait becomes a premium six-second film, saved securely for download and optional showroom presentation.</p>
                    <label className="block space-y-1.5 text-[10px] font-bold uppercase tracking-wide text-[#F3E5AB]/85">
                        Video model
                        <select
                          value={videoTestModel}
                          onChange={(event) => setVideoTestModel(event.target.value)}
                          disabled={stage === 'video'}
                          className="min-h-11 w-full border border-[#D4AF37]/50 bg-[#21090E] px-3 text-sm font-semibold normal-case tracking-normal text-[#F3E5AB] disabled:opacity-50"
                        >
                          {videoTestModelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => void startVideoTest()}
                      disabled={stage === 'video'}
                      className="flex min-h-12 w-full items-center justify-center gap-2 bg-[#D4AF37] px-4 font-bold uppercase text-[#21090E] disabled:cursor-not-allowed disabled:opacity-45 hover:brightness-105"
                    >
                      {stage === 'video' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                      {stage === 'video' ? 'Generation in progress' : error ? 'Please Retry Video Generation' : 'Generate cinematic video'}
                    </button>
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
          : 'AI Video media is temporarily retained for delivery, expires after one day, and is cleared by scheduled cleanup unless an adult separately permits promotional use. Anonymous usage totals may be retained.'}{' '}
        <Link href="/privacy" className="inline-block py-3 font-bold text-[#6E0D1F] underline underline-offset-2">Privacy &amp; Data Use</Link>
        <span className="px-1.5">·</span>
        <Link href="/terms" className="inline-block py-3 font-bold text-[#6E0D1F] underline underline-offset-2">Terms</Link>
      </div>
    </main>
  );
}
