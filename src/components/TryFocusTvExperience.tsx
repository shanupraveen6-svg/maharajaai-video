'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { fetchCatalogueSettings, fetchCompleteCatalogue } from '@/lib/maharaja/catalogue-client';
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  LoaderCircle,
  QrCode,
  RefreshCw,
  Shirt,
  Sparkles,
  Upload,
  User,
  Video,
  X,
} from 'lucide-react';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import LucyLiveMirror from '@/components/LucyLiveMirror';
import PhonePhotoTransfer from '@/components/PhonePhotoTransfer';
import {
  catalogueCategories,
  events,
  formatINR,
  sampleCatalogue,
  type CatalogueCategoryId,
  type CatalogueAudience,
  type TryFocusProduct,
} from '@/lib/tryfocus/sample-data';

type TvMode = 'image-tryon' | 'live-tryon' | 'catalogue-video';
type ImageTryOnSource = 'catalogue' | 'own-garment';
type CatalogueTryOnStage = 'browse' | 'camera' | 'generating' | 'result';
type CameraTarget = 'catalogue-person' | 'own-person' | 'own-garment' | 'video-person';
type VideoAudience = CatalogueAudience;

export default function TryFocusTvExperience() {
  const [mode, setMode] = useState<TvMode>('image-tryon');
  const [catalogueItems, setCatalogueItems] = useState<TryFocusProduct[]>(sampleCatalogue);

  // Catalogue filtering
  const [genderFilter, setGenderFilter] = useState<CatalogueAudience>('women');
  const [activeCategory, setActiveCategory] = useState<CatalogueCategoryId>('sarees');
  const [showNewArrivals, setShowNewArrivals] = useState(false);
  const [showClientCollection, setShowClientCollection] = useState(true);
  const [cataloguePage, setCataloguePage] = useState(0);
  const [videoAudience, setVideoAudience] = useState<VideoAudience>('women');
  const [videoGuardianConsent, setVideoGuardianConsent] = useState(false);
  const catalogueTopRef = useRef<HTMLDivElement | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<TryFocusProduct>(sampleCatalogue[0]);

  useEffect(() => {
    let active = true;
    fetchCompleteCatalogue()
      .then((products) => {
        if (!active || !products.length) return;
        const mapped: TryFocusProduct[] = products.map((item) => ({
          id: item.id || item.sku.toLowerCase(),
          sku: item.sku,
          title: item.title,
          price: Number(item.price || 0),
          category: item.category || 'sarees',
          audience: item.audience || (item.gender === 'men' ? 'Men' : item.gender === 'boys' ? 'Boys' : item.gender === 'girls' ? 'Girls' : 'Women'),
          gender: item.gender === 'men' || item.gender === 'boys' || item.gender === 'girls' ? item.gender : 'women',
          imageUrl: item.imageUrl,
          garmentReferenceUrl: item.garmentReferenceUrl || item.imageUrl,
          fabricNote: item.fabricNote || 'Maharaja Collection',
          badge: item.newArrival ? 'NEW ARRIVAL' : item.badge,
          accent: item.accent || 'from-[#FAF6F0] to-[#EFE8DC]',
          eligibleForVideo: item.eligibleForVideo !== false,
          eligibleForLive: item.eligibleForLive === true,
          newArrivalOnly: item.newArrivalOnly === true,
          garmentType: item.garmentType || 'saree',
        }));
        setCatalogueItems(mapped);
        setSelectedProduct((prev) => mapped.find((p) => p.sku === prev.sku) || mapped[0]);
      })
      .catch(() => undefined);
    fetchCatalogueSettings()
      .then((settings) => {
        if (!active) return;
        setTvBillSuffixRequired(settings.tvBillSuffixRequired);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // AI Image Try-On state
  const [imageSource, setImageSource] = useState<ImageTryOnSource>('catalogue');
  const [tryOnStage, setTryOnStage] = useState<CatalogueTryOnStage>('browse');

  // Photos (Image 1 = Customer identity, Image 2 = Garment reference)
  const [customerPhoto, setCustomerPhoto] = useState<string>('');
  const [ownGarmentPhoto, setOwnGarmentPhoto] = useState<string>('');
  const [tryOnResultUrl, setTryOnResultUrl] = useState<string>('');
  const [tryOnError, setTryOnError] = useState<string>('');
  const [tryOnStatusNote, setTryOnStatusNote] = useState<string>('');
  const [tryOnMobileQr, setTryOnMobileQr] = useState<string>('');
  const [selectedLooks, setSelectedLooks] = useState<TryFocusProduct[]>([]);
  const [generatedLooks, setGeneratedLooks] = useState<Array<{ product: TryFocusProduct; url: string; error?: string }>>([]);
  const [activeLookIndex, setActiveLookIndex] = useState(0);
  const [batchDone, setBatchDone] = useState(0);
  const [batchProgress, setBatchProgress] = useState<Record<string, 'generating' | 'ready' | 'failed'>>({});
  const [handoffStatus, setHandoffStatus] = useState('');
  const lastLookTouchRef = useRef<{ sku: string; at: number } | null>(null);
  const batchRunRef = useRef(0);
  const firstReadyRunRef = useRef(0);
  const idleResetRef = useRef<number | null>(null);
  const [tryOnGuardianConsent, setTryOnGuardianConsent] = useState(false);

  // Camera capture modal / full-screen stage
  const [cameraOpen, setCameraOpen] = useState<boolean>(false);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget>('catalogue-person');
  const [cameraError, setCameraError] = useState<string>('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureTimerRef = useRef<number | null>(null);
  const swipeStartX = useRef<number | null>(null);

  // AI Catalogue Video state
  const [selectedEventId, setSelectedEventId] = useState<string>(events[0].id);
  const [videoPersonPhoto, setVideoPersonPhoto] = useState<string>('');
  const [videoMasterUrl, setVideoMasterUrl] = useState<string>('');
  const [videoGeneratingMaster, setVideoGeneratingMaster] = useState<boolean>(false);
  const [videoPassCreating, setVideoPassCreating] = useState<boolean>(false);
  const [videoPassUrl, setVideoPassUrl] = useState<string>('');
  const [videoPassQr, setVideoPassQr] = useState<string>('');
  const [videoPassCode, setVideoPassCode] = useState<string>('');
  const [videoStatusNote, setVideoStatusNote] = useState<string>('');
  const [tvBillSuffixRequired, setTvBillSuffixRequired] = useState(true);
  const [tvBillLast4, setTvBillLast4] = useState('');
  const [tvBillEntered, setTvBillEntered] = useState(false);

  const filteredCategories = catalogueCategories.filter((cat) => cat.gender === genderFilter);
  const categoryProducts = catalogueItems.filter((item) => item.category === activeCategory);
  const browseProducts = catalogueItems.filter((item) => item.gender === genderFilter &&
    (showClientCollection ? item.sku.startsWith('MAH-')
      : showNewArrivals ? (genderFilter === 'women' || genderFilter === 'men') && item.badge === 'NEW ARRIVAL'
        : item.category === activeCategory));
  const cataloguePageCount = Math.max(1, Math.ceil(browseProducts.length / 6));
  const visibleBrowseProducts = browseProducts.slice(cataloguePage * 6, cataloguePage * 6 + 6);
  const videoBrowseProducts = catalogueItems.filter((item) => (item.eligibleForVideo === true || item.sku.startsWith('TF-')) && item.gender === videoAudience && (videoAudience !== 'women' || item.category === 'sarees'));
  const videoPageCount = Math.max(1, Math.ceil(videoBrowseProducts.length / 6));
  const safeVideoPage = Math.min(cataloguePage, videoPageCount - 1);
  const visibleVideoProducts = videoBrowseProducts.slice(safeVideoPage * 6, safeVideoPage * 6 + 6);

  function selectGender(gender: CatalogueAudience) {
    if (gender === genderFilter) return;
    setGenderFilter(gender);
    setActiveCategory(gender === 'women' ? 'sarees' : gender === 'men' ? 'veshti' : gender === 'boys' ? 'boys-veshti' : 'girls-pavadai');
    setShowNewArrivals(false);
    setShowClientCollection(gender === 'women' || gender === 'men');
    setCataloguePage(0);
    setSelectedLooks([]);
  }

  function selectCategory(category: CatalogueCategoryId) {
    setActiveCategory(category);
    setShowNewArrivals(false);
    setShowClientCollection(false);
    setCataloguePage(0);
  }

  function turnCataloguePage(nextPage: number) {
    setCataloguePage(Math.min(Math.max(0, nextPage), cataloguePageCount - 1));
    window.requestAnimationFrame(() => catalogueTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  // Stop camera helper
  function stopCamera() {
    if (captureTimerRef.current !== null) window.clearInterval(captureTimerRef.current);
    captureTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCountdown(null);
  }

  useEffect(() => () => stopCamera(), []);

  function navigateTo(next: TvMode) {
    batchRunRef.current += 1;
    stopCamera();
    setCameraOpen(false);
    setCameraError('');
    if (next === 'catalogue-video') {
      const saree = catalogueItems.find((item) => item.category === 'sarees' && item.eligibleForVideo && item.price >= 5000);
      if (saree) setSelectedProduct(saree);
      setCataloguePage(0);
    }
    setMode(next);
  }

  async function openCameraFor(target: CameraTarget) {
    setCameraTarget(target);
    setCameraError('');
    setCameraOpen(true);
    stopCamera();

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Webcam requires HTTPS or localhost. You can also use the Upload Photo button below.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch (err: unknown) {
      setCameraError(
        err instanceof Error
          ? err.message
          : 'Unable to access PC/TV camera. Use the Upload Photo option below.'
      );
    }
  }

  function triggerCountdownCapture() {
    if (!videoRef.current || !streamRef.current) {
      setCameraError('Camera stream is not active. Please upload a photo or retry camera.');
      return;
    }
    setCountdown(5);
    let current = 5;
    captureTimerRef.current = window.setInterval(() => {
      current -= 1;
      if (current <= 0) {
        if (captureTimerRef.current !== null) window.clearInterval(captureTimerRef.current);
        captureTimerRef.current = null;
        setCountdown(null);
        captureFrameNow();
      } else {
        setCountdown(current);
      }
    }, 1000);
  }

  function captureFrameNow() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 960;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    stopCamera();
    setCameraOpen(false);
    applyCapturedPhoto(cameraTarget, dataUrl);
  }

  function handleFileUpload(target: CameraTarget, file?: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      stopCamera();
      setCameraOpen(false);
      applyCapturedPhoto(target, dataUrl);
    };
    reader.readAsDataURL(file);
  }

  function applyCapturedPhoto(target: CameraTarget, dataUrl: string) {
    if (target === 'catalogue-person') {
      setCustomerPhoto(dataUrl);
      setTryOnStage('camera');
    } else if (target === 'own-person') {
      setCustomerPhoto(dataUrl);
    } else if (target === 'own-garment') {
      setOwnGarmentPhoto(dataUrl);
    } else if (target === 'video-person') {
      setVideoPersonPhoto(dataUrl);
      setVideoMasterUrl('');
      setVideoPassQr('');
      setVideoPassUrl('');
      setVideoStatusNote('');
    }
  }

  function toggleLook(product: TryFocusProduct) {
    const now = Date.now();
    if (lastLookTouchRef.current?.sku === product.sku && now - lastLookTouchRef.current.at < 500) return;
    lastLookTouchRef.current = { sku: product.sku, at: now };
    setSelectedLooks((current) => {
      if (current.some((item) => item.sku === product.sku)) return current.filter((item) => item.sku !== product.sku);
      if (current.length >= 5 || (current.length > 0 && current[0].category !== product.category)) return current;
      return [...current, product];
    });
  }

  async function runCatalogueBatch(personImg: string) {
    if ((genderFilter === 'boys' || genderFilter === 'girls') && !tryOnGuardianConsent) {
      setTryOnError('A parent or guardian must approve the child’s photo first.');
      return;
    }
    const looks = selectedLooks.length ? selectedLooks : [selectedProduct];
    const runId = ++batchRunRef.current;
    setTryOnError('');
    setGeneratedLooks([]);
    setBatchDone(0);
    setBatchProgress(Object.fromEntries(looks.map((look) => [look.sku, 'generating'])));
    setTryOnMobileQr('');
    setHandoffStatus('');
    setTryOnStage('generating');
    const completed = await Promise.allSettled(looks.map(async (product, index) => {
      try {
        const res = await fetch('/api/ai/master-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: `tv_batch_${Date.now()}_${index}`,
            service: 'try-on',
            templateId: product.gender === 'boys' ? 'boy' : product.gender === 'girls' ? 'girl' : product.gender,
            guardianProcessingConsent: tryOnGuardianConsent,
            catalogueProductId: product.sku,
            catalogueProductTitle: product.title,
            garmentType: product.garmentType,
            garmentTypeConfirmed: true,
            processingConsent: true,
            consentVersion: '2026-10-privacy-v2',
            personPhoto: personImg,
            garmentPhotos: [product.garmentReferenceUrl || product.imageUrl],
            garmentRoles: ['Primary Garment Reference'],
            garmentAnalysis: `${product.title} (${product.fabricNote || ''})`,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.masterImageUrl) throw new Error(data.error || 'Generation failed');
        if (runId === batchRunRef.current) {
          setBatchProgress((current) => ({ ...current, [product.sku]: 'ready' }));
          setGeneratedLooks((current) => {
            const next = [...current];
            next[index] = { product, url: data.masterImageUrl as string };
            return next;
          });
          setTryOnStage('result');
          if (!firstReadyRunRef.current || firstReadyRunRef.current !== runId) {
            firstReadyRunRef.current = runId;
            setActiveLookIndex(index);
            setSelectedProduct(product);
            setTryOnResultUrl(data.masterImageUrl as string);
          }
        }
        return { product, url: data.masterImageUrl as string };
      } catch (error) {
        if (runId === batchRunRef.current) setBatchProgress((current) => ({ ...current, [product.sku]: 'failed' }));
        return { product, url: '', error: error instanceof Error ? error.message : 'Generation failed' };
      } finally {
        if (runId === batchRunRef.current) setBatchDone((count) => count + 1);
      }
    }));
    if (runId !== batchRunRef.current) return;
    const results = completed.map((entry, index) => entry.status === 'fulfilled'
      ? entry.value
      : { product: looks[index], url: '', error: 'Generation failed' });
    setGeneratedLooks(results);
    const firstReady = results.findIndex((item) => item.url);
    if (firstReady >= 0) {
      setTryOnStage('result');
      void createImageHandoff(results.filter((item) => item.url));
    } else {
      setTryOnError('No looks could be created. Please try again.');
      setTryOnStage('browse');
    }
  }

  async function createImageHandoff(looks: Array<{ product: TryFocusProduct; url: string }>) {
    const runId = batchRunRef.current;
    setHandoffStatus('Preparing your private mobile QR…');
    try {
      const handoffLooks = await Promise.all(looks.map(async (look) => {
        const image = await new Promise<string>((resolve, reject) => {
          const source = new Image();
          source.onload = () => {
            const scale = Math.min(1, 1400 / Math.max(source.naturalWidth, source.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
            const context = canvas.getContext('2d');
            if (!context) return reject(new Error('Could not prepare this look for your phone.'));
            context.drawImage(source, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          };
          source.onerror = () => reject(new Error('Could not read a generated look for the mobile QR.'));
          source.src = look.url;
        });
        return { sku: look.product.sku, title: look.product.title, image };
      }));
      const response = await fetch('/api/tv/tryon-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ looks: handoffLooks }),
      });
      const data = await response.json();
      if (!response.ok || !data.token) throw new Error(data.error || 'Mobile handoff unavailable');
      const url = `${window.location.origin}/maharaja/looks/${data.token}`;
      const qr = await QRCode.toDataURL(url, { width: 260, margin: 1, color: { dark: '#161918', light: '#FAFBF8' } });
      if (runId !== batchRunRef.current) return;
      setTryOnMobileQr(qr);
      setHandoffStatus('Scan to view and download your generated looks. Link expires in 15 minutes.');
    } catch (error) {
      if (runId !== batchRunRef.current) return;
      setHandoffStatus(error instanceof Error ? error.message : 'Mobile handoff unavailable');
    }
  }

  function showGeneratedLook(index: number) {
    const look = generatedLooks[index];
    if (!look?.url) return;
    setActiveLookIndex(index);
    setSelectedProduct(look.product);
    setTryOnResultUrl(look.url);
  }

  function moveGeneratedLook(direction: -1 | 1) {
    if (generatedLooks.length < 2) return;
    for (let step = 1; step <= generatedLooks.length; step += 1) {
      const index = (activeLookIndex + direction * step + generatedLooks.length * 2) % generatedLooks.length;
      if (generatedLooks[index]?.url) {
        showGeneratedLook(index);
        return;
      }
    }
  }

  async function createCatalogueVideoPass(
    product: TryFocusProduct,
    eventId: string,
    masterUrl = '',
    referenceSessionId = ''
  ) {
    setVideoPassCreating(true);
    try {
      if (tvBillSuffixRequired && (!tvBillEntered || !/^\d{4}$/.test(tvBillLast4))) {
        throw new Error('Enter the last four digits of your bill first.');
      }
      const res = await fetch('/api/maharaja/video-pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'tv-kiosk',
          experienceType: 'catalogue-gift',
          billLast4: tvBillLast4,
          catalogueSku: product.sku,
          eventId,
          videoMasterUrl: masterUrl || undefined,
          videoReferenceSessionId: referenceSessionId || undefined,
          videoMasterCategory: product.gender === 'boys' ? 'boy' : product.gender === 'girls' ? 'girl' : product.gender,
          videoMasterConceptId: product.gender === 'boys' ? 'boy-heritage-entrance' : product.gender === 'girls' ? 'girl-garden-lights' : product.gender === 'men' ? 'men-heritage-passage' : 'women-golden-courtyard',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.pass?.link) throw new Error(data?.error || 'Unable to prepare mobile video pass.');
      const passLink = data.pass.link;
      setVideoPassUrl(passLink);
      setVideoPassCode(data.pass.code);
      const qr = await QRCode.toDataURL(passLink, {
        width: 280,
        margin: 1,
        color: { dark: '#161918', light: '#FAFBF8' },
      });
      setVideoPassQr(qr);
    } catch (error) {
      setVideoPassUrl('');
      setVideoPassQr('');
      setVideoPassCode('');
      setVideoStatusNote(error instanceof Error ? error.message : 'Unable to create mobile video pass.');
    } finally {
      setVideoPassCreating(false);
    }
  }

  async function runTryOnGeneration(
    personImg: string,
    garmentImg: string,
    product?: TryFocusProduct
  ) {
    if ((genderFilter === 'boys' || genderFilter === 'girls') && !tryOnGuardianConsent) {
      setTryOnError('A parent or guardian must approve the child’s photo first.');
      return;
    }
    if (!personImg || !garmentImg) {
      setTryOnError('Add your photo and your garment photo first.');
      return;
    }
    setTryOnError('');
    setTryOnStatusNote('');
    setTryOnStage('generating');

    const sessionId = `tv_tryon_${Date.now()}`;
    const runId = ++batchRunRef.current;
    const targetProduct = product || selectedProduct;

    try {
      const res = await fetch('/api/ai/master-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          service: 'try-on',
          templateId: genderFilter === 'boys' ? 'boy' : genderFilter === 'girls' ? 'girl' : genderFilter,
          guardianProcessingConsent: tryOnGuardianConsent,
          garmentType: targetProduct.garmentType,
          garmentTypeConfirmed: true,
          processingConsent: true,
          consentVersion: '2026-10-privacy-v2',
          // Strict reference order: Image 1 = Customer Identity, Image 2 = Garment Reference
          personPhoto: personImg,
          garmentPhotos: [garmentImg],
          garmentRoles: ['Primary Garment Reference'],
          garmentAnalysis: `${targetProduct.title} (${targetProduct.fabricNote})`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (runId !== batchRunRef.current) return;
      if (res.ok && data?.masterImageUrl) {
        setTryOnResultUrl(data.masterImageUrl);
        setTryOnStatusNote('Your look is ready.');
        setTryOnStage('result');
        setTryOnMobileQr('');
        void createImageHandoff([{ product: targetProduct, url: data.masterImageUrl }]);
        return;
      }
      throw new Error(data?.error || 'Try-on generation failed.');
    } catch (error) {
      if (runId !== batchRunRef.current) return;
      setTryOnError(error instanceof Error ? error.message : 'Try-on generation failed.');
      setTryOnStage('browse');
    }
  }

  async function generateCatalogueVideoMasterOnTv() {
    if (!videoPersonPhoto) return;
    if ((selectedProduct.gender === 'boys' || selectedProduct.gender === 'girls') && !videoGuardianConsent) {
      setVideoStatusNote('Parent or legal guardian consent is required for a child photo.');
      return;
    }
    setVideoGeneratingMaster(true);
    const runId = ++batchRunRef.current;
    setVideoStatusNote('Creating your Diwali portrait with the selected Maharaja garment...');
    const sessionId = `tv_vidmaster_${Date.now()}`;
    const conceptId = selectedProduct.gender === 'men' ? 'men-heritage-passage' : selectedProduct.gender === 'boys' ? 'boy-heritage-entrance' : selectedProduct.gender === 'girls' ? 'girl-garden-lights' : 'women-golden-courtyard';

    try {
      const res = await fetch('/api/ai/master-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          service: 'ai-video',
          eventId: selectedEventId,
          templateId: selectedProduct.gender === 'boys' ? 'boy' : selectedProduct.gender === 'girls' ? 'girl' : selectedProduct.gender,
          guardianProcessingConsent: selectedProduct.gender === 'boys' || selectedProduct.gender === 'girls' ? videoGuardianConsent : undefined,
          conceptId,
          garmentType: selectedProduct.garmentType,
          garmentTypeConfirmed: true,
          processingConsent: true,
          consentVersion: '2026-10-privacy-v2',
          personPhoto: videoPersonPhoto,
          garmentPhotos: [selectedProduct.garmentReferenceUrl || selectedProduct.imageUrl],
          garmentRoles: ['Catalogue Silk Garment'],
          garmentAnalysis: `${selectedProduct.title} (${selectedProduct.fabricNote})`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (runId !== batchRunRef.current) return;
      if (!res.ok || !data?.masterImageUrl) throw new Error(data?.error || 'Festival image generation failed.');
      const generatedUrl = data.masterImageUrl;
      setVideoMasterUrl(generatedUrl);
      setVideoStatusNote('Diwali image ready. Scan the QR on your phone to generate the video.');
      await createCatalogueVideoPass(selectedProduct, selectedEventId, generatedUrl, data.sessionId);
    } catch (error) {
      if (runId !== batchRunRef.current) return;
      setVideoStatusNote(error instanceof Error ? error.message : 'Festival image generation failed.');
    } finally {
      if (runId === batchRunRef.current) setVideoGeneratingMaster(false);
    }
  }

  function resetAllSession() {
    batchRunRef.current += 1;
    firstReadyRunRef.current = 0;
    stopCamera();
    setCameraOpen(false);
    setImageSource('catalogue');
    setGenderFilter('women');
    setActiveCategory('sarees');
    setShowNewArrivals(false);
    setShowClientCollection(true);
    setCataloguePage(0);
    setSelectedProduct(catalogueItems[0] || sampleCatalogue[0]);
    setCustomerPhoto('');
    setOwnGarmentPhoto('');
    setTryOnResultUrl('');
    setTryOnMobileQr('');
    setTryOnGuardianConsent(false);
    setHandoffStatus('');
    setSelectedLooks([]);
    setGeneratedLooks([]);
    setTryOnError('');
    setTryOnStatusNote('');
    setTryOnStage('browse');
    setVideoPersonPhoto('');
    setVideoMasterUrl('');
    setVideoPassQr('');
    setVideoPassUrl('');
    setVideoPassCode('');
    setVideoAudience('women');
    setVideoGuardianConsent(false);
    setTvBillLast4('');
    setTvBillEntered(false);
    setVideoStatusNote('');
    setMode('image-tryon');
  }

  useEffect(() => {
    const restart = () => {
      if (idleResetRef.current !== null) window.clearTimeout(idleResetRef.current);
      idleResetRef.current = window.setTimeout(() => resetAllSession(), 3 * 60 * 1000);
    };
    for (const event of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(event, restart, { passive: true });
    restart();
    return () => {
      for (const event of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(event, restart);
      if (idleResetRef.current !== null) window.clearTimeout(idleResetRef.current);
    };
  // The kiosk owns one reset timer for its lifetime.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="tv-kiosk min-h-screen bg-[#F4F5F2] text-[#161918]">
      <header className="tv-main-header sticky top-0 z-30 border-b border-[#E5DDD3] bg-[#FCFAF6]/95 backdrop-blur-md">
        <div className="tv-main-brand mx-auto flex max-w-[1080px] items-center justify-between gap-4 px-7 py-4">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center bg-[#1E2020] font-mono text-lg font-bold tracking-widest text-white">TF</span>
            <div className="min-w-0">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-[#7A1428]">The Majestic Maharaja</p>
              <h1 className="truncate font-serif text-3xl font-semibold text-[#161918]">Your style, on you</h1>
            </div>
          </div>
          <button type="button" onClick={resetAllSession} className="tv-end-session shrink-0 border border-[#BFC2BC] bg-white px-5 py-3 text-sm font-bold text-[#7A1428]">End session</button>
        </div>
        <nav className="tv-mode-nav mx-auto grid max-w-[1080px] grid-cols-3 gap-2 px-7 pb-4" aria-label="Choose an experience">
          <button type="button" aria-current={mode === 'image-tryon' ? 'page' : undefined} onClick={() => { navigateTo('image-tryon'); setTryOnStage('browse'); }} className={`tv-mode-button ${mode === 'image-tryon' ? 'is-active' : ''}`}>
            <Sparkles className="h-6 w-6" /><span>AI Image Try-On</span>
          </button>
          <button type="button" aria-current={mode === 'live-tryon' ? 'page' : undefined} onClick={() => navigateTo('live-tryon')} className={`tv-mode-button ${mode === 'live-tryon' ? 'is-active' : ''}`}>
            <Camera className="h-6 w-6" /><span>Live Mirror</span>
          </button>
          <button type="button" aria-current={mode === 'catalogue-video' ? 'page' : undefined} onClick={() => { navigateTo('catalogue-video'); const first = catalogueItems.find((item) => (item.eligibleForVideo || item.sku.startsWith('TF-')) && item.gender === 'women' && item.category === 'sarees'); if (first) setSelectedProduct(first); }} className={`tv-mode-button ${mode === 'catalogue-video' ? 'is-active' : ''}`}>
            <Video className="h-6 w-6" /><span>AI Video</span>
          </button>
        </nav>
      </header>

      <div className="tv-kiosk-content mx-auto max-w-[1920px] px-5 py-6 sm:px-8">
        {/* =========================================================
            MODE 1: AI IMAGE TRY-ON (Catalogue Grid + Camera + Result Slider + Own Garment)
           ========================================================= */}
        {mode === 'image-tryon' && (
          <div className="space-y-6">
            <div className="tv-discovery-intro">
              <p className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-[#7A1428]">01 · AI Image Try-On</p>
              <h2 className="mt-1 font-serif text-4xl font-semibold">Choose a look. See it on you.</h2>
              <p className="mt-2 text-lg text-[#535A56]">Select up to five garments, then take one photo.</p>
            </div>
            {tryOnStage === 'browse' && <div className="tv-audience-options grid grid-cols-4 gap-3" aria-label="Choose who is shopping">
              {(['women', 'men', 'boys', 'girls'] as const).map((audience) => <button key={audience} type="button" aria-pressed={genderFilter === audience} onClick={() => selectGender(audience)} className={`border px-4 py-3 text-lg font-bold uppercase tracking-[0.12em] transition ${genderFilter === audience ? 'border-[#161918] bg-[#161918] text-white' : 'border-[#D8DCD7] bg-white text-[#161918]'}`}>{audience}</button>)}
            </div>}
            {(genderFilter === 'boys' || genderFilter === 'girls') && <label className="flex min-h-16 items-center gap-3 border border-[#D8DCD7] bg-white p-4 text-lg"><input type="checkbox" checked={tryOnGuardianConsent} onChange={(event) => setTryOnGuardianConsent(event.target.checked)} className="h-6 w-6" />I am the parent or guardian and approve using this child’s photo for this experience.</label>}
            {/* Top Sub-bar: Switch between Store Catalogue & Own Garment */}
            <div className="tv-source-bar flex flex-wrap items-center justify-between gap-4 border border-[#D8DCD7] bg-[#FAFBF8] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={imageSource === 'catalogue'}
                  onClick={() => {
                    setImageSource('catalogue');
                    setTryOnStage('browse');
                  }}
                  className={`flex items-center gap-2 border px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.15em] transition ${
                    imageSource === 'catalogue'
                      ? 'border-[#7A1428] bg-[#7A1428] text-[#FAF6EE]'
                      : 'border-[#D8DCD7] bg-white text-[#161918]'
                  }`}
                >
                  <Shirt className="h-4 w-4" />
                  Store styles
                </button>
                <button
                  type="button"
                  aria-pressed={imageSource === 'own-garment'}
                  onClick={() => {
                    setImageSource('own-garment');
                    setTryOnStage('browse');
                  }}
                  className={`flex items-center gap-2 border px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.15em] transition ${
                    imageSource === 'own-garment'
                      ? 'border-[#7A1428] bg-[#7A1428] text-[#FAF6EE]'
                      : 'border-[#D8DCD7] bg-white text-[#161918]'
                  }`}
                >
                  <Upload className="h-4 w-4" />
                  My garment
                </button>
              </div>

              <p className="text-xs text-[#535A56]">Your photo stays private and is cleared when you finish.</p>
            </div>

            {/* ---------------------------------------------------------
                SUB-MODE A: STORE CATALOGUE TRY-ON
               --------------------------------------------------------- */}
            {imageSource === 'catalogue' && tryOnStage === 'browse' && (
              <div className="tv-catalogue-shell grid gap-5">
                <aside className="tv-category-sidebar border border-[#D8DCD7] bg-white p-4" aria-label="Garment categories">
                  <p className="mb-3 font-serif text-xl font-semibold">Browse styles</p>
                  <div className="tv-kiosk-filters flex flex-col gap-2">
                    {(genderFilter === 'women' || genderFilter === 'men') && <button type="button" aria-pressed={showClientCollection} onClick={() => { setShowClientCollection(true); setShowNewArrivals(false); setCataloguePage(0); }} className={`border px-5 py-2 text-xs font-bold uppercase tracking-[0.12em] ${showClientCollection ? 'border-[#7A1428] bg-[#7A1428] text-white' : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918]'}`}>Maharaja looks</button>}
                    {(genderFilter === 'women' || genderFilter === 'men') && <button type="button" aria-pressed={showNewArrivals} onClick={() => { setShowClientCollection(false); setShowNewArrivals(true); setCataloguePage(0); }} className={`border px-5 py-2 text-xs font-bold uppercase tracking-[0.12em] ${showNewArrivals ? 'border-[#7A1428] bg-[#7A1428] text-white' : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918]'}`}>New Arrivals</button>}
                    {filteredCategories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        aria-pressed={!showClientCollection && !showNewArrivals && activeCategory === cat.id}
                        onClick={() => selectCategory(cat.id)}
                        className={`min-h-12 border px-4 py-2 text-left text-sm font-bold transition ${
                          !showClientCollection && !showNewArrivals && activeCategory === cat.id
                            ? 'border-[#7A1428] bg-[#7A1428] text-[#FAF6EE]'
                            : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918] hover:border-[#161918]'
                        }`}
                      >
                        {cat.label} <span className="opacity-60">({catalogueItems.filter((item) => item.category === cat.id).length})</span>
                      </button>
                    ))}
                  </div>
                </aside>

                <div className="min-w-0 space-y-5">

                <div ref={catalogueTopRef} className="tv-catalogue-heading flex items-center justify-between gap-4 text-[#161918]">
                  <p className="font-serif text-2xl font-semibold">{showClientCollection ? 'Maharaja looks' : showNewArrivals ? 'New Arrivals' : filteredCategories.find((cat) => cat.id === activeCategory)?.label}</p>
                  <p className="text-sm font-semibold">{browseProducts.length} garments · Page {cataloguePage + 1} of {cataloguePageCount}</p>
                </div>
                <div className="tv-product-grid grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleBrowseProducts.map((item) => (
                    <div
                      key={item.sku}
                      className={`tv-product-card group flex flex-col justify-between overflow-hidden border bg-white transition hover:border-[#7A1428] ${selectedLooks.some((look) => look.sku === item.sku) ? 'border-[#7A1428] ring-2 ring-[#7A1428]' : 'border-[#D8DCD7]'}`}
                    >
                      <button type="button" aria-pressed={selectedLooks.some((look) => look.sku === item.sku)} aria-label={`${selectedLooks.some((look) => look.sku === item.sku) ? 'Remove' : 'Select'} ${item.title}`} disabled={selectedLooks.length >= 5 && !selectedLooks.some((look) => look.sku === item.sku)} onClick={() => toggleLook(item)} className="tv-product-image relative aspect-[3/4] w-full overflow-hidden bg-[#ECEEE9] text-left disabled:opacity-60">
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        />
                        {/* Top Badges */}
                        <div className="absolute inset-x-3 top-3 flex items-center justify-between">
                          <span className="bg-white/95 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#161918] shadow-sm">
                            {item.sku.startsWith('MAH-CLIENT-') ? 'MAHARAJA LOOK' : item.badge || 'MAHARAJA EDIT'}
                          </span>
                          <span className="bg-[#7A1428] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#FAF6EE] shadow-sm">
                            {selectedLooks.some((look) => look.sku === item.sku) ? 'SELECTED' : selectedLooks.length >= 5 ? 'MAX 5' : 'ADD LOOK'}
                          </span>
                        </div>

                      </button>

                      <div className="flex flex-1 items-center justify-between gap-3 p-4">
                        <h4 className="font-serif text-lg font-semibold text-[#161918]">{item.title}</h4>
                        <span className="shrink-0 font-mono text-sm font-bold text-[#7A1428]">{selectedLooks.some((look) => look.sku === item.sku) ? '✓ Selected' : '+ Select'}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {browseProducts.length === 0 && <div className="border border-[#D8DCD7] bg-white p-10 text-center"><p className="font-serif text-2xl">No garments here yet</p><p className="mt-2 text-[#535A56]">Choose another category or ask our staff for help.</p></div>}
                <div className="tv-catalogue-pagination flex items-center justify-between gap-4 border border-[#D8DCD7] bg-white p-4">
                  <button type="button" disabled={cataloguePage === 0} onClick={() => turnCataloguePage(cataloguePage - 1)} className="border border-[#161918] px-6 py-3 text-lg font-semibold disabled:opacity-35">← Previous</button>
                  <span className="text-lg font-semibold">{cataloguePage + 1} / {cataloguePageCount}</span>
                  <button type="button" disabled={cataloguePage >= cataloguePageCount - 1} onClick={() => turnCataloguePage(cataloguePage + 1)} className="border border-[#161918] px-6 py-3 text-lg font-semibold disabled:opacity-35">Next →</button>
                </div>
                </div>
                <div className="tv-selection-bar fixed bottom-0 left-1/2 z-30 flex w-full max-w-[1080px] -translate-x-1/2 flex-wrap items-center justify-between gap-4 border border-[#D8DCD7] bg-white/95 p-4 shadow-xl backdrop-blur">
                  <p className="text-lg font-semibold">{selectedLooks.length} of 5 looks selected{selectedLooks.length > 0 ? ` · ${filteredCategories.find((item) => item.id === selectedLooks[0].category)?.label || 'Same category'}` : ''}</p>
                  <button type="button" disabled={selectedLooks.length === 0} onClick={() => {
                    setSelectedProduct(selectedLooks[0]);
                    if (customerPhoto) setTryOnStage('camera');
                    else { setTryOnStage('camera'); void openCameraFor('catalogue-person'); }
                  }} className="min-h-16 bg-[#7A1428] px-8 text-lg font-bold text-white disabled:opacity-40">
                    {customerPhoto ? `Create ${selectedLooks.length} looks` : 'Take photo & create looks'}
                  </button>
                </div>
              </div>
            )}

            {imageSource === 'catalogue' && tryOnStage === 'camera' && customerPhoto && !cameraOpen && (
              <div className="mx-auto max-w-2xl border border-[#D8DCD7] bg-white p-7 text-center">
                <p className="font-mono text-sm font-bold uppercase tracking-[0.18em] text-[#7A1428]">Review your photo</p>
                <img src={customerPhoto} alt="Photo preview before try-on" className="mx-auto mt-5 h-[420px] max-w-full object-contain" />
                <p className="mt-4 text-lg font-semibold">{selectedLooks.length || 1} selected looks will be created from this photo.</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={() => void openCameraFor('catalogue-person')} className="min-h-16 border border-[#161918] px-5 text-lg font-bold">Retake photo</button>
                  <button type="button" onClick={() => void runCatalogueBatch(customerPhoto)} className="min-h-16 bg-[#7A1428] px-5 text-lg font-bold text-white">Confirm & create looks</button>
                </div>
              </div>
            )}

            {/* ---------------------------------------------------------
                CATALOGUE TRY-ON: GENERATING STATE
               --------------------------------------------------------- */}
            {tryOnStage === 'generating' && (
              <div className="flex min-h-[520px] flex-col items-center justify-center border border-[#D8DCD7] bg-white p-10 text-center">
                <LoaderCircle className="h-12 w-12 animate-spin text-[#7A1428]" />
                <p className="mt-4 font-mono text-xs font-semibold uppercase tracking-[0.22em] text-[#7A1428]">
                  Creating your looks…
                </p>
                <h3 className="mt-2 font-serif text-3xl font-semibold text-[#161918]">
                  Creating your looks
                </h3>
                <p className="mt-2 max-w-lg text-sm text-[#535A56]">
                    {batchDone} of {Object.keys(batchProgress).length} generations finished. Keep this screen open.
                </p>
                <div className="mt-6 grid w-full max-w-xl gap-2 text-left">
                  {(selectedLooks.length ? selectedLooks : [selectedProduct]).map((look) => <div key={look.sku} className="flex items-center justify-between border border-[#D8DCD7] bg-[#FAFBF8] px-4 py-3 text-base">
                    <span className="truncate pr-3 font-semibold">{look.title}</span>
                    <span className="shrink-0 text-sm font-bold text-[#7A1428]">{batchProgress[look.sku] === 'ready' ? 'Ready' : batchProgress[look.sku] === 'failed' ? 'Failed' : 'Creating…'}</span>
                  </div>)}
                </div>
              </div>
            )}

            {/* ---------------------------------------------------------
                CATALOGUE / OWN-GARMENT TRY-ON: RESULT STAGE
                (Matches screenshot 4 & 10 + QR + BeforeAfterSlider below!)
               --------------------------------------------------------- */}
            {tryOnStage === 'result' && (
              <section className="mx-auto max-w-[900px] space-y-4" aria-label="Your looks">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-serif text-3xl font-semibold">Your looks are ready.</h3>
                    {batchDone < selectedLooks.length && <p className="text-base text-[#535A56]">{batchDone} of {selectedLooks.length} finished. More looks are on their way.</p>}
                  </div>
                  {generatedLooks.length > 1 && <span className="text-lg font-semibold">Look {activeLookIndex + 1} of {selectedLooks.length}</span>}
                </div>
                <div className="relative overflow-hidden bg-[#161918]" onTouchStart={(event) => { swipeStartX.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => {
                  if (swipeStartX.current === null) return;
                  const distance = (event.changedTouches[0]?.clientX ?? swipeStartX.current) - swipeStartX.current;
                  swipeStartX.current = null;
                  if (Math.abs(distance) > 60) moveGeneratedLook(distance < 0 ? 1 : -1);
                }}>
                  <img src={tryOnResultUrl || selectedProduct.imageUrl} alt={selectedProduct.title} className="mx-auto max-h-[900px] w-full object-contain" />
                  <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-6 pt-16 font-serif text-2xl text-white">{imageSource === 'own-garment' ? 'Your garment' : selectedProduct.title}</p>
                </div>
                {selectedLooks.length > 1 && <div className="flex items-center justify-between gap-4">
                  <button type="button" onClick={() => moveGeneratedLook(-1)} className="min-h-14 min-w-40 border border-[#161918] bg-white px-5 text-lg font-semibold">← Previous</button>
                  <p className="text-center text-sm text-[#535A56]">Swipe the image to see your looks</p>
                  <button type="button" onClick={() => moveGeneratedLook(1)} className="min-h-14 min-w-40 border border-[#161918] bg-white px-5 text-lg font-semibold">Next →</button>
                </div>}
                <div className="flex flex-wrap items-center justify-between gap-5 border border-[#D8DCD7] bg-white p-5">
                  <div className="flex-1"><h4 className="font-serif text-2xl font-semibold">Save your looks on your phone</h4><p className="mt-1 text-base text-[#535A56]">Scan this private QR. It expires in 15 minutes.</p><p className="mt-2 text-sm text-[#535A56]">{handoffStatus || (batchDone < selectedLooks.length ? 'Your QR will appear when all looks finish.' : 'Preparing your QR…')}</p></div>
                  {tryOnMobileQr ? <img src={tryOnMobileQr} alt="Scan to save your looks" className="h-44 w-44 object-contain" /> : <div className="flex h-44 w-44 items-center justify-center bg-[#FAFBF8]"><QrCode className="h-12 w-12 text-[#7A1428]" /></div>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => { setTryOnStage('browse'); setTryOnMobileQr(''); }} className="min-h-16 border border-[#161918] bg-white px-5 text-lg font-bold">Try another</button>
                  <button type="button" onClick={resetAllSession} className="min-h-16 bg-[#161918] px-5 text-lg font-bold text-white">Finish</button>
                </div>
              </section>
            )}

            {/* ---------------------------------------------------------
                SUB-MODE B: UPLOAD / CAPTURE MY OWN GARMENT (2 Sets: Person + Dress)
               --------------------------------------------------------- */}
            {imageSource === 'own-garment' && tryOnStage === 'browse' && (
              <div className="grid gap-6 border border-[#D8DCD7] bg-white p-6 lg:grid-cols-2">
                {/* Set 1: Your Photo (Image 1 Identity Authority) */}
                <div className="flex flex-col justify-between border border-[#D8DCD7] bg-[#FAFBF8] p-5">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#7A1428]">
                        Your Photo
                      </span>
                      <span className="border border-[#D8DCD7] bg-white px-2.5 py-0.5 font-mono text-[10px] font-semibold">
                        REQUIRED
                      </span>
                    </div>
                    <h3 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                      Your Photo
                    </h3>
                    <p className="mt-1 text-xs text-[#535A56]">
                      Stand in front of the camera for a clear, full-length photo.
                    </p>

                    <div className="mt-4 flex aspect-[3/4] max-h-80 w-full items-center justify-center overflow-hidden border border-dashed border-[#D8DCD7] bg-white">
                      {customerPhoto ? (
                        <img
                          src={customerPhoto}
                          alt="Customer Identity"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="p-6 text-center text-[#535A56]">
                          <User className="mx-auto h-10 w-10 text-[#7A1428]" />
                          <p className="mt-2 text-sm font-semibold text-[#161918]">
                            Add your photo
                          </p>
                          <p className="mt-1 text-xs">
                            Use the camera or choose a photo.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => openCameraFor('own-person')}
                      className="flex items-center justify-center gap-2 bg-[#161918] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#FAF6EE]"
                    >
                      <Camera className="h-4 w-4" />
                      Take photo
                    </button>
                    <label className="flex cursor-pointer items-center justify-center gap-2 border border-[#161918] bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#161918]">
                      <Upload className="h-4 w-4" />
                      Choose photo
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload('own-person', e.target.files?.[0])}
                      />
                    </label>
                  </div>
                </div>

                {/* Set 2: Own Garment / Dress Photo (Image 2 Garment Reference) */}
                <div className="flex flex-col justify-between border border-[#D8DCD7] bg-[#FAFBF8] p-5">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#7A1428]">
                        Your Garment
                      </span>
                      <span className="border border-[#D8DCD7] bg-white px-2.5 py-0.5 font-mono text-[10px] font-semibold">
                        REQUIRED
                      </span>
                    </div>
                    <h3 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                      Your Garment
                    </h3>
                    <p className="mt-1 text-xs text-[#535A56]">
                      Take a clear photo of the garment you want to try, or choose one from your phone.
                    </p>

                    <div className="mt-4 flex aspect-[3/4] max-h-80 w-full items-center justify-center overflow-hidden border border-dashed border-[#D8DCD7] bg-white">
                      {ownGarmentPhoto ? (
                        <img
                          src={ownGarmentPhoto}
                          alt="Own Garment Reference"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="p-6 text-center text-[#535A56]">
                          <Shirt className="mx-auto h-10 w-10 text-[#7A1428]" />
                          <p className="mt-2 text-sm font-semibold text-[#161918]">
                            Add your garment
                          </p>
                          <p className="mt-1 text-xs">
                            Use the camera or choose a garment photo.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => openCameraFor('own-garment')}
                      className="flex items-center justify-center gap-2 bg-[#161918] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#FAF6EE]"
                    >
                      <Camera className="h-4 w-4" />
                      Photograph garment
                    </button>
                    <label className="flex cursor-pointer items-center justify-center gap-2 border border-[#161918] bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#161918]">
                      <Upload className="h-4 w-4" />
                      Choose garment photo
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload('own-garment', e.target.files?.[0])}
                      />
                    </label>
                  </div>
                </div>

                {/* Generate Button Across Both Columns */}
                <div className=" flex flex-wrap items-center justify-between gap-4 border-t border-[#D8DCD7] pt-4 lg:col-span-2">
                  <div>
                    {tryOnError && (
                      <p className="text-xs font-semibold text-[#B42318]">{tryOnError}</p>
                    )}
                    <p className="text-xs text-[#535A56]">
                      Once generated, you will get a mobile QR code to download and the Old vs. New Dress comparison slider below.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!customerPhoto || !ownGarmentPhoto}
                    onClick={() => runTryOnGeneration(customerPhoto, ownGarmentPhoto)}
                    className="flex items-center gap-2 bg-[#7A1428] px-8 py-4 text-xs font-bold uppercase tracking-[0.18em] text-[#FAF6EE] transition hover:bg-[#610F20] disabled:opacity-40"
                  >
                    <Sparkles className="h-4 w-4" />
                    Generate Own-Garment AI Try-On
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            MODE 2: 30s LIVE AI TRY-ON (Step 1 Dress -> Step 2 Camera -> Step 3 30s Live)
           ========================================================= */}
        {mode === 'live-tryon' && (
          <LucyLiveMirror
            catalogue={catalogueItems.filter((item) => item.price > 10000 && (item.eligibleForLive === true || item.sku.startsWith('TF-')))}
            garmentPrompt={`Person wearing ${selectedProduct.title}, ${selectedProduct.fabricNote}`}
            garmentTitle={selectedProduct.title}
            selectedProduct={selectedProduct.price > 0 && (selectedProduct.eligibleForLive || selectedProduct.sku.startsWith('TF-')) ? selectedProduct : catalogueItems.find((item) => item.eligibleForLive === true)}
            onSelectProduct={setSelectedProduct}
          />
        )}

        {/* =========================================================
            MODE 3: AI CATALOGUE VIDEO (Portrait Kiosk Sequence -> Diwali Master Image -> 1-Day Mobile QR)
           ========================================================= */}
        {mode === 'catalogue-video' && tvBillSuffixRequired && !tvBillEntered && (
          <section className="mx-auto max-w-2xl space-y-6 border-2 border-[#D8DCD7] bg-white p-8 text-center">
            <p className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-[#7A1428]">AI Fashion Video</p>
            <h2 className="font-serif text-4xl font-semibold">Enter the last four digits of your bill</h2>
            <p className="text-lg text-[#535A56]">Your biller will tell you which four digits to enter. We save them with this demo experience.</p>
            <input value={tvBillLast4} onChange={(event) => setTvBillLast4(event.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" autoComplete="off" maxLength={4} aria-label="Last four digits of bill number" className="mx-auto block min-h-20 w-full max-w-sm border-2 border-[#161918] bg-[#FAFBF8] text-center font-mono text-4xl tracking-[0.25em]" />
            <button type="button" disabled={tvBillLast4.length !== 4} onClick={() => setTvBillEntered(true)} className="min-h-16 w-full max-w-sm bg-[#7A1428] px-6 text-lg font-bold text-white disabled:opacity-45">Continue to AI Video</button>
          </section>
        )}
        {mode === 'catalogue-video' && (!tvBillSuffixRequired || tvBillEntered) && (
          <div className="space-y-5">
            <div className="border-2 border-[#D8DCD7] bg-white p-5">
              <p className="font-mono text-sm font-bold uppercase tracking-[0.16em] text-[#7A1428]">AI fashion video · Diwali collection</p>
              <h2 className="mt-1 font-serif text-4xl font-semibold">Choose a garment for your film</h2>
              <p className="mt-2 text-lg text-[#535A56]">We create your portrait here. Scan the QR to make your video privately on your phone.</p>
            </div>
            <div className="tv-video-audience grid grid-cols-4 gap-3" aria-label="AI Video audience">
              {(['women', 'men', 'boys', 'girls'] as const).map((audience) => <button key={audience} type="button" aria-pressed={videoAudience === audience} onClick={() => {
                setVideoAudience(audience);
                setCataloguePage(0);
                setVideoPersonPhoto(''); setVideoMasterUrl(''); setVideoPassQr(''); setVideoPassUrl(''); setVideoPassCode(''); setVideoGuardianConsent(false);
                const first = catalogueItems.find((item) => (item.eligibleForVideo || item.sku.startsWith('TF-')) && item.gender === audience && (audience !== 'women' || item.category === 'sarees'));
                if (first) setSelectedProduct(first);
              }} className={`min-h-16 border-2 px-4 text-xl font-bold capitalize ${videoAudience === audience ? 'border-[#161918] bg-[#161918] text-white' : 'border-[#D8DCD7] bg-white text-[#161918]'}`}>{audience}</button>)}
            </div>
            <div className="grid gap-4">
              <section className="min-w-0 border-2 border-[#D8DCD7] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D8DCD7] pb-4">
                  <h3 className="font-serif text-2xl font-semibold capitalize">{videoAudience} looks</h3>
                  <span className="text-sm font-semibold">{videoBrowseProducts.length} garments · Page {safeVideoPage + 1}/{videoPageCount}</span>
                </div>
                <div className="tv-video-garments mt-4 grid gap-3">
                  {visibleVideoProducts.map((item) => <button key={item.sku} type="button" aria-pressed={selectedProduct.sku === item.sku} onClick={() => {
                    setSelectedProduct(item); setVideoMasterUrl(''); setVideoPassQr(''); setVideoPassUrl(''); setVideoPassCode('');
                  }} className={`min-w-0 overflow-hidden border-2 text-left ${selectedProduct.sku === item.sku ? 'border-[#7A1428] ring-2 ring-[#7A1428]' : 'border-[#D8DCD7]'}`}>
                    <div className="relative aspect-[3/4] overflow-hidden bg-[#ECEEE9]"><img src={item.imageUrl} alt={item.title} className="h-full w-full object-contain" />{selectedProduct.sku === item.sku && <span className="absolute right-2 top-2 bg-[#7A1428] px-3 py-1 text-xs font-bold text-white">Selected</span>}</div>
                    <div className="p-3"><p className="line-clamp-2 font-serif text-lg font-semibold">{item.title}</p><p className="mt-1 text-sm font-bold text-[#7A1428]">{item.price > 0 ? formatINR(item.price) : 'Price at counter'}</p></div>
                  </button>)}
                </div>
                {videoBrowseProducts.length === 0 && <p className="p-8 text-center text-lg">No garments in this collection yet. Ask the store to add them.</p>}
                <div className="mt-4 flex items-center justify-between border-t border-[#D8DCD7] pt-4">
                  <button type="button" disabled={safeVideoPage <= 0} onClick={() => setCataloguePage(safeVideoPage - 1)} className="min-h-14 border border-[#161918] px-5 font-bold disabled:opacity-35">← Previous</button>
                  <span className="font-semibold">{safeVideoPage + 1} / {videoPageCount}</span>
                  <button type="button" disabled={safeVideoPage >= videoPageCount - 1} onClick={() => setCataloguePage(safeVideoPage + 1)} className="min-h-14 border border-[#161918] px-5 font-bold disabled:opacity-35">Next →</button>
                </div>
              </section>
            </div>

            {/* Step 2 & 3: Portrait Two-Slot Input + Diwali Master Preview & 1-Day Mobile QR */}
            <section className="grid gap-5 grid-cols-2">
              {/* Left Card: Two Image Slots (01 Your Photo + 02 Selected Garment) & Generate CTA */}
              <div className="flex flex-col justify-between border-2 border-[#D8DCD7] bg-white p-5">
                <div>
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#7A1428]">
                    Your Diwali portrait
                  </p>
                  <h3 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                    Add your photo
                  </h3>

                  <div className="mt-4 grid grid-cols-2 gap-3.5">
                    {/* Slot 01: Customer Photo */}
                    <div className="border-2 border-[#D8DCD7] bg-[#FAFBF8] p-3">
                      <div className="flex aspect-[3/4] items-center justify-center overflow-hidden bg-[#ECEEE9]">
                        {videoPersonPhoto ? (
                          <img
                            src={videoPersonPhoto}
                            alt="Customer photo for Diwali image"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="p-4 text-center text-[#535A56]">
                            <User className="mx-auto h-12 w-12" />
                            <span className="mt-2 block text-sm font-bold">
                              Tap Capture Below
                            </span>
                          </div>
                        )}
                      </div>
                      <p className="mt-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#161918]">
                        01 · Your Photo
                      </p>
                    </div>

                    {/* Slot 02: Selected Catalogue Garment */}
                    <div className="border-2 border-[#D8DCD7] bg-[#FAFBF8] p-3">
                      <div className="aspect-[3/4] overflow-hidden bg-[#ECEEE9]">
                        <img
                          src={selectedProduct.imageUrl}
                          alt={`Selected garment: ${selectedProduct.title}`}
                          className="h-full w-full object-cover object-top"
                        />
                      </div>
                      <p className="mt-2.5 truncate font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#7A1428]">
                        02 · {selectedProduct.title}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3 border-t border-[#D8DCD7] pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => openCameraFor('video-person')}
                      className="flex min-h-[64px] items-center justify-center gap-2 bg-[#161918] px-4 py-3.5 text-xs font-bold uppercase tracking-[0.14em] text-white"
                    >
                      <Camera className="h-5 w-5" />
                      {videoPersonPhoto ? 'Retake Photo (5s)' : 'Capture Photo (5s)'}
                    </button>
                    <label className="flex min-h-[64px] cursor-pointer items-center justify-center gap-2 border-2 border-[#161918] bg-white px-4 py-3.5 text-xs font-bold uppercase tracking-[0.14em] text-[#161918]">
                      <Upload className="h-5 w-5" />
                      Upload Photo
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload('video-person', e.target.files?.[0])}
                      />
                    </label>
                  </div>

                  {(selectedProduct.gender === 'boys' || selectedProduct.gender === 'girls') && <label className="flex items-start gap-3 border border-[#D8DCD7] bg-white p-3 text-sm"><input type="checkbox" checked={videoGuardianConsent} onChange={(event) => setVideoGuardianConsent(event.target.checked)} className="mt-1 h-5 w-5" /><span>I am the parent or legal guardian and consent to processing this child&apos;s photo for this video experience.</span></label>}
                  <button
                    type="button"
                    disabled={!videoPersonPhoto || videoGeneratingMaster || !videoBrowseProducts.some((item) => item.sku === selectedProduct.sku) || ((selectedProduct.gender === 'boys' || selectedProduct.gender === 'girls') && !videoGuardianConsent)}
                    onClick={generateCatalogueVideoMasterOnTv}
                    className="flex min-h-[68px] w-full items-center justify-center gap-2.5 bg-[#7A1428] px-5 py-4 text-sm font-bold uppercase tracking-[0.16em] text-[#FAF6EE] disabled:opacity-45"
                  >
                    {videoGeneratingMaster ? (
                      <>
                        <LoaderCircle className="h-5 w-5 animate-spin" />
                        Creating Diwali Portrait on Standee...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-5 w-5" />
                        Step 3: Create Diwali Portrait & Issue QR
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Right Card: Generation Waiting State OR Diwali Portrait + 1-Day Mobile QR */}
              <div className="flex flex-col justify-between border-2 border-[#D8DCD7] bg-[#FAFBF8] p-5">
                {videoGeneratingMaster ? (
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                    <LoaderCircle className="h-16 w-16 animate-spin text-[#7A1428]" />
                    <p className="mt-4 font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#7A1428]">
                      Generating Diwali Master Portrait
                    </p>
                    <h3 className="mt-2 font-serif text-3xl font-semibold text-[#161918]">
                      Dressing You in {selectedProduct.title}
                    </h3>
                    <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#535A56]">
                      Preserving your exact face and natural skin tone while draping{' '}
                      <strong>{selectedProduct.title}</strong> in the Maharaja Diwali courtyard. Your 1-day mobile QR will appear automatically once ready.
                    </p>
                  </div>
                ) : videoMasterUrl ? (
                  <div className="flex h-full flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-[#D8DCD7] pb-3">
                        <span className="bg-[#EBF5EE] px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#256B45]">
                          Step 4 · Diwali Portrait Ready
                        </span>
                        <span className="font-mono text-xs font-bold text-[#7A1428]">
                          Valid 24 Hours
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-[1fr_210px] gap-4 items-center">
                        <div className="aspect-[9/16] max-h-[380px] overflow-hidden border-2 border-[#161918] bg-[#161918]">
                          <img
                            src={videoMasterUrl}
                            alt="Generated Diwali portrait"
                            className="h-full w-full object-cover object-top"
                          />
                        </div>

                        <div className="flex flex-col items-center border-2 border-[#161918] bg-white p-3 text-center">
                          {videoPassCreating ? (
                            <div className="flex h-44 w-44 items-center justify-center">
                              <LoaderCircle className="h-8 w-8 animate-spin text-[#7A1428]" />
                            </div>
                          ) : videoPassQr ? (
                            <img
                              src={videoPassQr}
                              alt="Catalogue Video Mobile QR"
                              className="h-44 w-44 object-contain"
                            />
                          ) : (
                            <div className="flex h-44 w-44 items-center justify-center">
                              <QrCode className="h-10 w-10 text-[#535A56]" />
                            </div>
                          )}
                          <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A1428]">
                            Scan for 1-Day Video Pass
                          </p>
                          <p className="mt-1 text-[11px] leading-snug text-[#535A56]">
                            Continue on phone to render your 6s AI Video & choose{' '}
                            <strong>Download</strong> or <strong>Go Live</strong>.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#D8DCD7] pt-3">
                      <span className="font-mono text-xs text-[#535A56]">
                        Pass: <strong className="text-[#161918]">{videoPassCode}</strong>
                      </span>
                      {videoPassUrl && (
                        <a
                          href={videoPassUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-[48px] items-center gap-1.5 border border-[#161918] bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[#161918]"
                        >
                          Open Mobile Pass
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                    <QrCode className="h-14 w-14 text-[#535A56]" />
                    <p className="mt-4 font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#7A1428]">
                      Step 4 · 1-Day Mobile QR Unlocks After Portrait
                    </p>
                    <h3 className="mt-2 font-serif text-2xl font-semibold text-[#161918]">
                      Capture Your Photo & Generate Diwali Image First
                    </h3>
                    <p className="mt-2 max-w-sm text-sm leading-relaxed text-[#535A56]">
                      {videoStatusNote ||
                        'Once your Diwali portrait is created on the standee, your private 24-hour mobile QR will appear here so you can render the AI Video and Download or Go Live.'}
                    </p>
                  </div>
                )}
              </div>
            </section>
            <div className="border border-[#D8DCD7] bg-white p-5 text-sm leading-relaxed text-[#535A56]">
              <p className="font-bold text-[#161918]">Your photo, your choice</p>
              <p className="mt-1">We use your photo only to create this experience and deliver it to your phone. The private QR pass expires after 24 hours. Public Go Live playback needs a separate approval on your phone; an approved video can remain in the store loop for up to 2 days, and you can request removal. We do not create a permanent customer photo profile.</p>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================
          SMART MIRROR FULL-SCREEN CAMERA CAPTURE MODAL
          (Matches screenshot 3: "FULL BODY SHOT", "Move Back and Strike a Pose!",
           countdown, bottom circular X / CAPTURE / Retake buttons + Upload Photo)
         ========================================================= */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-between bg-black/95 p-4 text-white sm:p-6">
          {/* Top Kiosk Camera Bar */}
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-[#7A1428] px-3 py-1 font-mono text-xs font-bold uppercase tracking-widest">
                TryFocus Smart Mirror
              </span>
              <span className="font-mono text-xs text-white/80">
                {cameraTarget === 'own-garment'
                  ? 'YOUR GARMENT'
                  : 'YOUR PHOTO'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setCameraOpen(false);
                if (tryOnStage === 'camera') setTryOnStage('browse');
              }}
              className="flex items-center gap-1.5 border border-white/30 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
            >
              <X className="h-4 w-4" />
              Close Camera
            </button>
          </div>

          {/* Center Tall Mirror Camera Feed */}
          <div className="relative mx-auto my-3 flex h-[72vh] w-full max-w-xl items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-[#161918]">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-full w-full object-cover"
            />

            {/* Top Pill: FULL BODY SHOT (matching screenshot 3) */}
            <div className="pointer-events-none absolute inset-x-0 top-5 flex justify-center">
              <div className="rounded-full bg-black/70 px-6 py-2 text-center backdrop-blur-md">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-white">
                  {cameraTarget === 'own-garment' ? 'GARMENT REFERENCE SHOT' : 'FULL BODY SHOT'}
                </p>
                <p className="text-[11px] text-white/80">
                  Ensure good lighting for better results
                </p>
              </div>
            </div>

            {/* Center Prompt + Countdown (matching screenshot 3 "Move Back and Strike a Pose!" + "1") */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <p className="rounded-md bg-black/45 px-4 py-1.5 font-serif text-2xl font-semibold text-sky-200 drop-shadow">
                {cameraTarget === 'own-garment'
                  ? 'Hold Dress Clearly in Frame'
                  : 'Move Back and Strike a Pose!'}
              </p>
              {countdown !== null && (
                <span className="mt-2 font-mono text-8xl font-extrabold text-sky-300 drop-shadow-lg">
                  {countdown}
                </span>
              )}
            </div>

            {cameraError && (
              <div className="absolute inset-x-6 bottom-28 rounded-lg border border-amber-400/40 bg-black/85 p-4 text-center text-xs text-amber-200">
                <p>{cameraError}</p>
                <p className="mt-1 text-white/80">
                  You can upload a photo directly from your laptop using the button below.
                </p>
              </div>
            )}

            {/* Bottom Circular Smart Mirror Camera Controls (matching screenshot 3: X, big blue/cyan CAPTURE, Retake) */}
            <div className="absolute inset-x-0 bottom-5 flex items-center justify-center gap-8">
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setCameraOpen(false);
                  if (tryOnStage === 'camera') setTryOnStage('browse');
                }}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-black/70 text-white transition hover:bg-black"
                title="Cancel"
              >
                <X className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={triggerCountdownCapture}
                className="flex flex-col items-center"
              >
                <span className="flex h-18 w-18 items-center justify-center rounded-full border-4 border-white bg-sky-400 shadow-lg transition hover:scale-105" />
                <span className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                  CAPTURE
                </span>
              </button>

              <button
                type="button"
                onClick={() => openCameraFor(cameraTarget)}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-black/70 text-white transition hover:bg-black"
                title="Restart Camera"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Bottom Laptop File Upload Alternative */}
          <div className="mx-auto flex w-full max-w-xl flex-wrap items-center justify-between gap-3 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-xs">
            <span className="text-white/80">
              Use the camera, choose a photo, or send one from your phone.
            </span>
            <label className="flex cursor-pointer items-center gap-1.5 bg-white px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#161918] hover:bg-[#F4F5F2]">
              <Upload className="h-3.5 w-3.5" />
              Choose photo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileUpload(cameraTarget, e.target.files?.[0])}
              />
            </label>
            <PhonePhotoTransfer onPhoto={(photo) => { stopCamera(); setCameraOpen(false); applyCapturedPhoto(cameraTarget, photo); }} />
          </div>
        </div>
      )}
    </main>
  );
}
