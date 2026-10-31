'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { fetchCatalogueSettings, fetchCompleteCatalogue } from '@/lib/maharaja/catalogue-client';
import {
  ArrowRight,
  Camera,
  CheckCircle2,
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
  MoreVertical,
  RotateCcw,
} from 'lucide-react';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import { compressImage } from '@/lib/utils/image';
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
import PhotoConsentNotice from '@/components/PhotoConsentNotice';
import { PageTitle, Segmented, StepProgress } from '@/components/ui';

type TvMode = 'image-tryon' | 'live-tryon' | 'catalogue-video';
type ImageTryOnSource = 'catalogue' | 'own-garment';
type CatalogueTryOnStage = 'photo' | 'browse' | 'generating' | 'result';
type CameraTarget = 'catalogue-person' | 'own-person' | 'own-garment' | 'video-person';
type VideoAudience = CatalogueAudience;

export default function TryFocusTvExperience() {
  const [mode, setMode] = useState<TvMode>('image-tryon');
  const [showLookMenu, setShowLookMenu] = useState(false);
  const [clientName, setClientName] = useState('The Majestic Maharaja');
  // Live Mirror and AI Video show only while the store has them (module on and the devices they need on).
  const [liveOn, setLiveOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [catalogueItems, setCatalogueItems] = useState<TryFocusProduct[]>([]);

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

  // TryFocus switched the open experience off while the TV was running: go back to Image Try-On.
  useEffect(() => {
    if ((mode === 'live-tryon' && !liveOn) || (mode === 'catalogue-video' && !videoOn)) setMode('image-tryon');
  }, [mode, liveOn, videoOn]);

  // Signed-in staff pair this TV to their workspace once; it then runs without a login for 30 days.
  useEffect(() => {
    void fetch('/api/tv/pair', { method: 'POST' }).catch(() => undefined);
  }, []);

  // The TV stays open all day, so admin changes reach it without a reload: store settings every
  // 2 minutes (one small read) and the catalogue every 30 minutes.
  useEffect(() => {
    let active = true;
    const loadCatalogue = () => fetchCompleteCatalogue()
      .then((products) => {
        if (!active) return;
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
        setSelectedProduct((prev) => mapped.find((p) => p.sku === prev.sku) || mapped[0] || prev);
      })
      .catch(() => undefined);
    const loadSettings = () => fetchCatalogueSettings()
      .then((settings) => {
        if (!active) return;
        setTvBillSuffixRequired(settings.tvBillSuffixRequired);
        if (settings.clientName) setClientName(settings.clientName);
        if (settings.access) {
          setLiveOn(settings.access.modules.live);
          setVideoOn(settings.access.catalogueVideo);
        }
      })
      .catch(() => undefined);
    void loadCatalogue();
    void loadSettings();
    const catalogueTimer = window.setInterval(loadCatalogue, 30 * 60 * 1000);
    const settingsTimer = window.setInterval(loadSettings, 2 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(catalogueTimer);
      window.clearInterval(settingsTimer);
    };
  }, []);

  // AI Image Try-On state
  const [imageSource, setImageSource] = useState<ImageTryOnSource>('catalogue');
  const [tryOnStage, setTryOnStage] = useState<CatalogueTryOnStage>('photo');

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
  const [videoMasterSessionId, setVideoMasterSessionId] = useState('');
  const [showPortraitMenu, setShowPortraitMenu] = useState(false);
  const [videoGeneratingMaster, setVideoGeneratingMaster] = useState<boolean>(false);
  const [videoPassCreating, setVideoPassCreating] = useState<boolean>(false);
  const [videoPassUrl, setVideoPassUrl] = useState<string>('');
  const generationBusyRef = useRef(false);
  useEffect(() => {
    generationBusyRef.current = tryOnStage === 'generating' || videoGeneratingMaster || videoPassCreating || Object.values(batchProgress).includes('generating');
  }, [tryOnStage, videoGeneratingMaster, videoPassCreating, batchProgress]);
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
  const TV_PAGE_SIZE = 24;
  const cataloguePageCount = Math.max(1, Math.ceil(browseProducts.length / TV_PAGE_SIZE));
  const visibleBrowseProducts = browseProducts.slice(cataloguePage * TV_PAGE_SIZE, (cataloguePage + 1) * TV_PAGE_SIZE);
  const videoBrowseProducts = catalogueItems.filter((item) => item.price > 0 && (item.eligibleForVideo === true || item.sku.startsWith('TF-') || item.sku.startsWith('8IC') || item.sku.startsWith('silk-')) && item.gender === videoAudience && (videoAudience !== 'women' || item.category === 'sarees'));
  const videoPageCount = Math.max(1, Math.ceil(videoBrowseProducts.length / TV_PAGE_SIZE));
  const safeVideoPage = Math.min(cataloguePage, Math.max(0, videoPageCount - 1));
  const visibleVideoProducts = videoBrowseProducts.slice(safeVideoPage * TV_PAGE_SIZE, (safeVideoPage + 1) * TV_PAGE_SIZE);

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

  useEffect(() => {
    if (mode === 'image-tryon' && tryOnStage === 'browse' && !customerPhoto) {
      setTryOnStage('photo');
    }
  }, [mode, tryOnStage, customerPhoto]);

  function navigateTo(next: TvMode) {
    batchRunRef.current += 1;
    stopCamera();
    setCameraOpen(false);
    setCameraError('');
    if (next === 'image-tryon') {
      setTryOnStage(customerPhoto ? 'browse' : 'photo');
    }
    if (next === 'catalogue-video') {
      const saree = catalogueItems.find((item) => item.category === 'sarees' && item.eligibleForVideo && item.price >= 5000);
      if (saree) setSelectedProduct(saree);
      setCataloguePage(0);
      // No AI Video limit: reuse the try-on photo. With a limit, the bill digits and a fresh photo are required.
      if (tvBillSuffixRequired) {
        setVideoPersonPhoto('');
        setVideoMasterUrl('');
      } else if (customerPhoto && !videoPersonPhoto) {
        setVideoPersonPhoto(customerPhoto);
      }
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
          width: { ideal: 1080 },
          height: { ideal: 1920 },
          aspectRatio: { ideal: 9 / 16 },
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

    const vWidth = video.videoWidth || 720;
    const vHeight = video.videoHeight || 1280;
    const targetAspect = 9 / 16;
    const currentAspect = vWidth / vHeight;

    let sx = 0;
    let sy = 0;
    let sWidth = vWidth;
    let sHeight = vHeight;

    if (currentAspect > targetAspect) {
      // Source webcam is horizontal/landscape (or wider than 9:16)
      // Crop sides to center vertical column
      sHeight = vHeight;
      sWidth = Math.round(vHeight * targetAspect);
      sx = Math.round((vWidth - sWidth) / 2);
      sy = 0;
    } else if (currentAspect < targetAspect) {
      // Source is taller/narrower than 9:16
      sWidth = vWidth;
      sHeight = Math.round(vWidth / targetAspect);
      sx = 0;
      sy = Math.round((vHeight - sHeight) / 2);
    }

    // Strictly vertical format (9:16 portrait) matching the vertical TV
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 1280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    stopCamera();
    setCameraOpen(false);
    applyCapturedPhoto(cameraTarget, dataUrl);
  }

  function handleFileUpload(target: CameraTarget, file?: File | null) {
    if (!file) return;
    if (target === 'own-garment') {
      // Garments keep their full frame; only person photos are cropped to the 9:16 portrait.
      compressImage(file, 1280, 0.85)
        .then(({ dataUrl }) => {
          stopCamera();
          setCameraOpen(false);
          applyCapturedPhoto(target, dataUrl);
        })
        .catch((error) => setTryOnError(error instanceof Error ? error.message : 'This garment photo could not be read.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawDataUrl) return;

      const img = new Image();
      img.onload = () => {
        const vWidth = img.naturalWidth || img.width;
        const vHeight = img.naturalHeight || img.height;
        const targetAspect = 9 / 16;
        const currentAspect = vWidth / vHeight;

        let sx = 0;
        let sy = 0;
        let sWidth = vWidth;
        let sHeight = vHeight;

        if (currentAspect > targetAspect) {
          sHeight = vHeight;
          sWidth = Math.round(vHeight * targetAspect);
          sx = Math.round((vWidth - sWidth) / 2);
          sy = 0;
        } else if (currentAspect < targetAspect) {
          sWidth = vWidth;
          sHeight = Math.round(vWidth / targetAspect);
          sx = 0;
          sy = Math.round((vHeight - sHeight) / 2);
        }

        const canvas = document.createElement('canvas');
        canvas.width = 720;
        canvas.height = 1280;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
          const verticalDataUrl = canvas.toDataURL('image/jpeg', 0.88);
          stopCamera();
          setCameraOpen(false);
          applyCapturedPhoto(target, verticalDataUrl);
        } else {
          stopCamera();
          setCameraOpen(false);
          applyCapturedPhoto(target, rawDataUrl);
        }
      };
      img.onerror = () => {
        stopCamera();
        setCameraOpen(false);
        applyCapturedPhoto(target, rawDataUrl);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  }

  function applyCapturedPhoto(target: CameraTarget, dataUrl: string) {
    if (target === 'catalogue-person' || target === 'own-person') {
      setCustomerPhoto(dataUrl);
      setTryOnStage('photo');
    } else if (target === 'own-garment') {
      setOwnGarmentPhoto(dataUrl);
    } else if (target === 'video-person') {
      setVideoPersonPhoto(dataUrl);
      setVideoMasterUrl('');
      setVideoMasterSessionId('');
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
    if (!personImg) {
      setTryOnError('Please capture or upload a customer photo in Step 1 first.');
      setTryOnStage('photo');
      return;
    }
    if ((genderFilter === 'boys' || genderFilter === 'girls') && !tryOnGuardianConsent) {
      setTryOnError('A parent or guardian must approve the child’s photo first.');
      return;
    }
    const looks = (selectedLooks.length ? selectedLooks : [selectedProduct])
      .filter((look) => catalogueItems.some((item) => item.sku === look.sku));
    if (!looks.length) {
      setTryOnError('Choose a garment from this store’s catalogue.');
      setTryOnStage('browse');
      return;
    }
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
            catalogueProductCategory: product.category,
            garmentType: product.garmentType,
            garmentTypeConfirmed: true,
            processingConsent: true,
            consentVersion: '2026-10-privacy-v3',
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
      setHandoffStatus('Tap Show QR and scan it with your phone camera.');
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
        return {
          sku: look.product.sku,
          title: look.product.title,
          category: look.product.category,
          garmentType: look.product.garmentType,
          gender: look.product.gender,
          garmentReferenceUrl: look.product.garmentReferenceUrl || look.product.imageUrl,
          image,
        };
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
    const runId = batchRunRef.current;
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
      if (runId !== batchRunRef.current) return;
      if (!res.ok || !data?.pass?.link) throw new Error(data?.error || 'Unable to prepare mobile video pass.');
      const passLink = data.pass.link;
      setVideoPassUrl(passLink);
      setVideoPassCode(data.pass.code);
      const qr = await QRCode.toDataURL(passLink, {
        width: 280,
        margin: 1,
        color: { dark: '#161918', light: '#FAFBF8' },
      });
      if (runId !== batchRunRef.current) return;
      setVideoPassQr(qr);
    } catch (error) {
      if (runId !== batchRunRef.current) return;
      setVideoPassUrl('');
      setVideoPassQr('');
      setVideoPassCode('');
      setVideoStatusNote(error instanceof Error ? error.message : 'Unable to create mobile video pass.');
    } finally {
      if (runId === batchRunRef.current) setVideoPassCreating(false);
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
          catalogueProductId: targetProduct.sku,
          catalogueProductTitle: targetProduct.title,
          catalogueProductCategory: targetProduct.category,
          garmentType: targetProduct.garmentType,
          garmentTypeConfirmed: true,
          processingConsent: true,
          consentVersion: '2026-10-privacy-v3',
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
        setHandoffStatus('Your look is ready. Tap Proceed to get it on your phone.');
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
          consentVersion: '2026-10-privacy-v3',
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
      setVideoMasterSessionId(data.sessionId);
      setVideoStatusNote('Your festival portrait is ready. Tap Proceed to continue on your phone.');
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
    setTryOnStage('photo');
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
    setVideoGeneratingMaster(false);
    setVideoPassCreating(false);
    setMode('image-tryon');
  }

  useEffect(() => {
    const restart = () => {
      if (idleResetRef.current !== null) window.clearTimeout(idleResetRef.current);
      idleResetRef.current = window.setTimeout(() => {
        if (generationBusyRef.current) restart();
        else resetAllSession();
      }, 3 * 60 * 1000);
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
    <main className="tv-kiosk min-h-screen bg-[#F4F5F2] text-ink">
      <header className="tv-main-header sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur-md">
        <div className="tv-main-brand mx-auto flex max-w-[1080px] items-center justify-between gap-4 px-8 pb-4 pt-5">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white">{clientName.replace(/^The\s+/i, '').charAt(0) || 'T'}</span>
            <div className="min-w-0">
              <h1 className="truncate text-[28px] font-bold text-ink">{clientName}</h1>
              <p className="text-base text-muted">See any outfit on you in seconds</p>
            </div>
          </div>
          <button type="button" onClick={resetAllSession} className="tv-end-session tf-btn tf-btn-secondary shrink-0 !min-h-14 px-6 text-base">Start over</button>
        </div>
        <nav className={`tv-mode-nav mx-auto grid max-w-[1080px] gap-1 px-8 pb-5 ${[true, liveOn, videoOn].filter(Boolean).length === 3 ? 'grid-cols-3': [true, liveOn, videoOn].filter(Boolean).length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`} aria-label="Choose an experience">
          <button type="button" aria-current={mode === 'image-tryon' ? 'page' : undefined} onClick={() => navigateTo('image-tryon')} className={`tv-mode-button ${mode === 'image-tryon' ? 'is-active' : ''}`}>
            <Sparkles className="h-6 w-6" /><span>Try-On</span>
          </button>
          {liveOn && <button type="button" aria-current={mode === 'live-tryon' ? 'page' : undefined} onClick={() => navigateTo('live-tryon')} className={`tv-mode-button ${mode === 'live-tryon' ? 'is-active' : ''}`}>
            <Camera className="h-6 w-6" /><span>Live Mirror</span>
          </button>}
          {videoOn && <button type="button" aria-current={mode === 'catalogue-video' ? 'page' : undefined} onClick={() => { navigateTo('catalogue-video'); const first = catalogueItems.find((item) => (item.eligibleForVideo || item.sku.startsWith('TF-')) && item.gender === 'women' && item.category === 'sarees'); if (first) setSelectedProduct(first); }} className={`tv-mode-button ${mode === 'catalogue-video' ? 'is-active' : ''}`}>
            <Video className="h-6 w-6" /><span>AI Video</span>
          </button>}
        </nav>
      </header>

      <div className="tv-kiosk-content mx-auto max-w-[1920px] px-5 py-6 sm:px-8">
        {/* =========================================================
            MODE 1: AI IMAGE TRY-ON (Strict 2-Step Process: Step 1 Photo -> Step 2 Garments)
           ========================================================= */}
        {mode === 'image-tryon' && (
          <div className="space-y-6">
            <StepProgress
              size="lg"
              steps={['Your photo', 'Choose outfits', 'Your looks']}
              current={tryOnStage === 'photo' ? 0 : tryOnStage === 'browse' ? 1 : 2}
              onSelect={(index) => { if (index === 0) setTryOnStage('photo'); if (index === 1 && customerPhoto) setTryOnStage('browse'); }}
            />

            {tryOnStage === 'photo' && (
              <div className="tv-photo-step flex flex-col gap-6">
                <PageTitle
                  size="lg"
                  title={customerPhoto ? 'Looking good?' : 'Add your photo'}
                  subtitle={customerPhoto ? 'Check that your face and full outfit are clear.' : 'Stand in front of the screen, or send a photo from your phone.'}
                />

                <div className="tv-audience-options" aria-label="Who is shopping">
                  <Segmented
                    size="lg"
                    label="Who is shopping"
                    value={genderFilter}
                    onChange={(audience) => selectGender(audience)}
                    options={([['women', 'Women'], ['men', 'Men'], ['boys', 'Boys'], ['girls', 'Girls']] as const).map(([value, label]) => ({ value, label }))}
                  />
                </div>

                {(genderFilter === 'boys' || genderFilter === 'girls') && (
                  <label className="rounded-2xl flex min-h-16 items-center gap-3 border border-line bg-white p-4 text-lg">
                    <input
                      type="checkbox"
                      checked={tryOnGuardianConsent}
                      onChange={(event) => setTryOnGuardianConsent(event.target.checked)}
                      className="h-6 w-6"
                    />
                    I am the parent or guardian and approve using this child’s photo for this experience.
                  </label>
                )}

                {!customerPhoto ? (
                  <>
                    <div className="tv-photo-actions grid gap-5 md:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => void openCameraFor('catalogue-person')}
                        className="tv-photo-action group flex min-h-[220px] flex-col items-center justify-center gap-6 rounded-3xl bg-ink p-8 text-center text-white shadow-lg transition hover:bg-black"
                      >
                        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 transition group-hover:scale-105">
                          <Camera className="h-12 w-12" />
                        </span>
                        <span>
                          <span className="block text-4xl font-bold">Take a photo</span>
                          <span className="mt-2 block text-xl text-white/70">Stand back · 5 second timer</span>
                        </span>
                      </button>
                      <PhonePhotoTransfer
                        onPhoto={(photo) => applyCapturedPhoto('catalogue-person', photo)}
                        renderTrigger={(open, busy) => (
                          <button
                            type="button"
                            onClick={open}
                            disabled={busy}
                            className="tv-photo-action group flex h-full min-h-[220px] w-full flex-col items-center justify-center gap-6 rounded-3xl border border-line bg-white p-8 text-center shadow-sm transition hover:border-brand disabled:opacity-50"
                          >
                            <span className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-soft text-brand transition group-hover:scale-105">
                              {busy ? <LoaderCircle className="h-12 w-12 animate-spin" /> : <QrCode className="h-12 w-12" />}
                            </span>
                            <span>
                              <span className="block text-4xl font-bold text-ink">{busy ? 'Preparing QR…' : 'Use my phone'}</span>
                              <span className="mt-2 block text-xl text-muted">Scan a QR and send a photo</span>
                            </span>
                          </button>
                        )}
                      />
                    </div>
                    <ol className="grid grid-cols-3 gap-4" aria-label="How it works">
                      {[[Camera, 'Add your photo'], [Shirt, 'Pick up to 5 outfits'], [QrCode, 'Scan to take your looks home']].map(([Icon, text], index) => {
                        const StepIcon = Icon as typeof Camera;
                        return (
                          <li key={index} className="tf-card flex items-center gap-4 p-5">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"><StepIcon className="h-6 w-6" /></span>
                            <span className="text-lg font-semibold leading-snug">{text as string}</span>
                          </li>
                        );
                      })}
                    </ol>
                    <PhotoConsentNotice kind="try-on" large />
                    <label className="mx-auto cursor-pointer text-base font-semibold text-muted underline underline-offset-4 hover:text-ink">
                      Choose a photo file instead
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload('catalogue-person', e.target.files?.[0])} />
                    </label>
                  </>
                ) : (
                  <div className="tf-card mx-auto w-full max-w-2xl p-7 text-center">
                    <img
                      src={customerPhoto}
                      alt="Your photo"
                      className="mx-auto aspect-[9/16] h-[820px] max-h-[60vh] max-w-full rounded-2xl object-cover"
                    />
                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      <button type="button" onClick={() => setCustomerPhoto('')} className="tf-btn tf-btn-secondary !min-h-16 text-lg">Retake</button>
                      <button type="button" onClick={() => setTryOnStage('browse')} className="tf-btn tf-btn-primary !min-h-16 text-lg">Choose outfits <ArrowRight className="h-5 w-5" /></button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ---------------------------------------------------------
                STEP 2: SELECT GARMENTS & CREATE LOOKS
               --------------------------------------------------------- */}
            {tryOnStage === 'browse' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <PageTitle size="lg" title="Choose up to 5 outfits" subtitle="We create a look for each one at the same time." />
                  {customerPhoto && (
                    <button type="button" onClick={() => setTryOnStage('photo')} className="group flex shrink-0 items-center gap-3 rounded-2xl border border-line bg-white p-2 pr-4 text-left hover:border-ink">
                      <img src={customerPhoto} alt="Your photo" className="aspect-[9/16] h-16 rounded-lg object-cover" />
                      <span className="text-sm font-semibold text-muted group-hover:text-ink">Change<br />photo</span>
                    </button>
                  )}
                </div>

                <div className="tv-source-bar max-w-xl">
                  <Segmented
                    size="md"
                    label="Outfit source"
                    value={imageSource}
                    onChange={(value) => setImageSource(value)}
                    options={[
                      { value: 'catalogue', label: <><Shirt className="h-5 w-5" /> Store collection</> },
                      { value: 'own-garment', label: <><Upload className="h-5 w-5" /> My own outfit</> },
                    ]}
                  />
                </div>

                {/* ---------------------------------------------------------
                    SUB-MODE A: STORE CATALOGUE TRY-ON
                   --------------------------------------------------------- */}
                {imageSource === 'catalogue' && (
                  <div className="tv-catalogue-shell grid gap-5">
                    <aside className="tv-category-sidebar tf-card p-3" aria-label="Garment categories">
                      <div className="tv-kiosk-filters flex flex-col gap-1">
                        {(genderFilter === 'women' || genderFilter === 'men') && <button type="button" aria-pressed={showClientCollection} onClick={() => { setShowClientCollection(true); setShowNewArrivals(false); setCataloguePage(0); }} className="rounded-xl border px-4 text-left font-semibold">{clientName.replace(/^The\s+/i, '').split(' ').slice(-1)[0]} picks</button>}
                        {(genderFilter === 'women' || genderFilter === 'men') && <button type="button" aria-pressed={showNewArrivals} onClick={() => { setShowClientCollection(false); setShowNewArrivals(true); setCataloguePage(0); }} className="rounded-xl border px-4 text-left font-semibold">New arrivals</button>}
                        {filteredCategories.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            aria-pressed={!showClientCollection && !showNewArrivals && activeCategory === cat.id}
                            onClick={() => selectCategory(cat.id)}
                            className="flex items-center justify-between gap-2 rounded-xl border px-4 text-left font-semibold"
                          >
                            <span className="truncate">{cat.label}</span>
                            <span className="shrink-0 text-sm font-medium opacity-60">{catalogueItems.filter((item) => item.category === cat.id).length}</span>
                          </button>
                        ))}
                      </div>
                    </aside>

                    <div className="min-w-0 space-y-4">
                      <div ref={catalogueTopRef} className="tv-catalogue-heading flex items-baseline justify-between gap-4">
                        <p className="text-2xl font-bold">{showClientCollection ? `${clientName.replace(/^The\s+/i, '').split(' ').slice(-1)[0]} picks` : showNewArrivals ? 'New arrivals' : filteredCategories.find((cat) => cat.id === activeCategory)?.label}</p>
                        <p className="text-base text-muted">{browseProducts.length} styles</p>
                      </div>
                      <div className="tv-product-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {visibleBrowseProducts.map((item) => {
                          const picked = selectedLooks.some((look) => look.sku === item.sku);
                          const full = selectedLooks.length >= 5 && !picked;
                          return (
                            <button
                              key={item.sku}
                              type="button"
                              aria-pressed={picked}
                              aria-label={`${picked ? 'Remove' : 'Select'} ${item.title}`}
                              disabled={full}
                              onClick={() => toggleLook(item)}
                              className={`tv-product-card group relative flex flex-col overflow-hidden rounded-2xl border bg-white text-left transition disabled:opacity-50 ${picked ? 'border-brand ring-2 ring-brand' : 'border-line hover:border-line-strong'}`}
                            >
                              <span className="tv-product-image relative block w-full overflow-hidden">
                                <img src={item.imageUrl} alt="" className="h-full w-full object-contain" />
                                <span className={`absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold shadow ${picked ? 'bg-brand text-white' : 'bg-white/90 text-ink'}`}>
                                  {picked ? selectedLooks.findIndex((look) => look.sku === item.sku) + 1 : '+'}
                                </span>
                              </span>
                              <span className="block p-3">
                                <span className="line-clamp-2 block text-base font-semibold leading-snug text-ink">{item.title}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {browseProducts.length === 0 && <div className="tf-card p-10 text-center"><p className="text-2xl font-bold">No styles here yet</p><p className="mt-2 text-muted">Choose another category or ask our staff.</p></div>}
                      {cataloguePageCount > 1 && (
                        <div className="tv-catalogue-pagination flex items-center justify-between gap-4">
                          <button type="button" disabled={cataloguePage === 0} onClick={() => turnCataloguePage(cataloguePage - 1)} className="tf-btn tf-btn-secondary !min-h-14 px-6 text-lg">← Previous</button>
                          <span className="text-lg font-semibold text-muted">Page {cataloguePage + 1} of {cataloguePageCount}</span>
                          <button type="button" disabled={cataloguePage >= cataloguePageCount - 1} onClick={() => turnCataloguePage(cataloguePage + 1)} className="tf-btn tf-btn-secondary !min-h-14 px-6 text-lg">Next →</button>
                        </div>
                      )}
                    </div>

                    <div className="tv-selection-bar fixed left-1/2 z-30 flex max-w-[1016px] -translate-x-1/2 items-center justify-between gap-4 backdrop-blur">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex -space-x-3">
                          {selectedLooks.map((look) => <img key={look.sku} src={look.imageUrl} alt="" className="h-14 w-11 rounded-lg border-2 border-white bg-canvas object-cover" />)}
                        </div>
                        <p className="text-lg font-semibold">{selectedLooks.length ? `${selectedLooks.length} of 5 selected` : 'Tap outfits to select'}</p>
                      </div>
                      <button
                        type="button"
                        disabled={selectedLooks.length === 0}
                        onClick={() => {
                          setSelectedProduct(selectedLooks[0]);
                          void runCatalogueBatch(customerPhoto);
                        }}
                        className="tf-btn tf-btn-primary !min-h-16 shrink-0 px-8 text-lg"
                      >
                        <Sparkles className="h-5 w-5" /> Create {selectedLooks.length > 1 ? `${selectedLooks.length} looks` : 'my look'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tryOnStage === 'generating' && (
              <section className="space-y-6" aria-live="polite">
                <PageTitle size="lg" title="Creating your looks" subtitle="Each look appears as soon as it is ready. This takes about 20 seconds." />
                <div className="tv-generated-looks grid gap-4">
                  {(selectedLooks.length ? selectedLooks : [selectedProduct]).map((look) => {
                    const state = batchProgress[look.sku];
                    return (
                      <div key={look.sku} className="tf-card overflow-hidden">
                        <div className="relative aspect-[9/16] bg-canvas">
                          <img src={look.imageUrl} alt="" className={`h-full w-full object-contain ${state === 'generating' ? 'opacity-40' : ''}`} />
                          <span className="absolute inset-0 flex items-center justify-center">
                            {state === 'failed' ? <span className="rounded-full bg-danger px-3 py-1 text-sm font-semibold text-white">Not created</span> : <LoaderCircle className="h-10 w-10 animate-spin text-brand" />}
                          </span>
                        </div>
                        <p className="truncate p-3 text-sm font-semibold">{look.title}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ---------------------------------------------------------
                CATALOGUE / OWN-GARMENT TRY-ON: RESULT STAGE
                (Matches screenshot 4 & 10 + QR + BeforeAfterSlider below!)
               --------------------------------------------------------- */}
            {tryOnStage === 'result' && (
              <section className="mx-auto max-w-[900px] space-y-4" aria-label="Your looks">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-4xl font-bold">Your looks</h2>
                    {batchDone < selectedLooks.length && <p className="text-base text-muted">{batchDone} of {selectedLooks.length} finished. More looks are on their way.</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    {generatedLooks.length > 1 && <span className="text-lg font-semibold">Look {activeLookIndex + 1} of {selectedLooks.length}</span>}
                    {/* Retry lives in the header menu of the screen where the looks were made. */}
                    <div className="relative">
                      <button type="button" aria-label="Look options" aria-expanded={showLookMenu} onClick={() => setShowLookMenu((open) => !open)} className="flex min-h-16 min-w-16 items-center justify-center rounded-xl border border-line-strong bg-white">
                        <MoreVertical className="h-7 w-7" />
                      </button>
                      {showLookMenu && (
                        <div className="absolute right-0 top-[4.5rem] z-40 w-72 overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
                          <button type="button" onClick={() => { setShowLookMenu(false); setTryOnStage('browse'); setTryOnMobileQr(''); }} className="flex min-h-16 w-full items-center gap-3 px-5 text-left text-lg font-semibold">
                            <RotateCcw className="h-5 w-5" /> Retry with another dress
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl overflow-hidden border border-line bg-white" onTouchStart={(event) => { swipeStartX.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => {
                  // The before/after slider uses horizontal drags, so look switching stays on the buttons there.
                  if (swipeStartX.current === null || (customerPhoto && tryOnResultUrl)) return;
                  const distance = (event.changedTouches[0]?.clientX ?? swipeStartX.current) - swipeStartX.current;
                  swipeStartX.current = null;
                  if (Math.abs(distance) > 60) moveGeneratedLook(distance < 0 ? 1 : -1);
                }}>
                  {customerPhoto && tryOnResultUrl ? (
                    <div className="bg-ink px-4 pb-4 pt-3">
                      <BeforeAfterSlider
                        key={`${activeLookIndex}-${tryOnResultUrl.slice(-24)}`}
                        before={customerPhoto}
                        after={tryOnResultUrl}
                        beforeLabel="Your photo"
                        afterLabel={imageSource === 'own-garment' ? 'Your garment' : 'New look'}
                        frameClassName="mx-auto aspect-[9/16] w-full max-w-[506px]"
                        dark
                      />
                    </div>
                  ) : (
                    <div className="bg-[#161918]">
                      <img src={tryOnResultUrl || selectedProduct.imageUrl} alt={selectedProduct.title} className="mx-auto max-h-[900px] w-full object-contain" />
                    </div>
                  )}
                  <p className="border-t border-line bg-white px-6 py-4 text-2xl font-bold text-ink">{imageSource === 'own-garment' ? 'Your garment' : selectedProduct.title}</p>
                </div>
                {selectedLooks.length > 1 && <div className="flex items-center justify-between gap-4">
                  <button type="button" onClick={() => moveGeneratedLook(-1)} className="tf-btn tf-btn-secondary !min-h-14 min-w-40 text-lg">← Previous</button>
                  <p className="text-center text-sm text-muted">{customerPhoto ? 'Drag the line to compare · tap a look below' : 'Swipe the image to see your looks'}</p>
                  <button type="button" onClick={() => moveGeneratedLook(1)} className="tf-btn tf-btn-secondary !min-h-14 min-w-40 text-lg">Next →</button>
                </div>}
                {selectedLooks.length > 1 && (
                  <div className="grid grid-cols-5 gap-2" role="tablist" aria-label="Your generated looks">
                    {selectedLooks.map((look, index) => {
                      const generated = generatedLooks[index];
                      const status = batchProgress[look.sku];
                      return (
                        <button
                          key={look.sku}
                          type="button"
                          role="tab"
                          aria-selected={index === activeLookIndex}
                          disabled={!generated?.url}
                          onClick={() => showGeneratedLook(index)}
                          className={`relative aspect-[9/16] overflow-hidden rounded-xl border-2 bg-canvas ${index === activeLookIndex ? 'border-brand': 'border-transparent'} disabled:opacity-60`}
                        >
                          <img src={generated?.url || look.imageUrl} alt={look.title} className="h-full w-full object-cover" />
                          {!generated?.url && (
                            <span className="absolute inset-x-0 bottom-0 bg-ink/80 py-1 text-xs font-bold text-white">
                              {status === 'failed' ? 'Failed' : 'Creating…'}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="tf-card flex flex-wrap items-center justify-between gap-5 p-6">
                  <div className="flex-1"><h3 className="text-2xl font-bold">Take your looks home</h3><p className="mt-1 text-base text-muted">Scan this private QR. It expires in 15 minutes.</p><p className="mt-2 text-sm text-muted">{handoffStatus || (batchDone < selectedLooks.length ? 'Your QR will appear when all looks finish.' : 'Preparing your QR…')}</p></div>
                  {tryOnMobileQr ? <img src={tryOnMobileQr} alt="Scan to save your looks" className="h-44 w-44 object-contain" /> : (
                    <button type="button" disabled={batchDone < selectedLooks.length && !generatedLooks.some((look) => look.url)} onClick={() => void createImageHandoff(generatedLooks.filter((look) => look.url))} className="tf-btn tf-btn-primary !min-h-20 min-w-56 text-xl">
                      <QrCode className="h-6 w-6" /> Show QR
                    </button>
                  )}
                </div>
                <button type="button" onClick={resetAllSession} className="tf-btn tf-btn-secondary !min-h-16 w-full text-lg">Done · next customer</button>
              </section>
            )}

            {/* ---------------------------------------------------------
                SUB-MODE B: UPLOAD / CAPTURE MY OWN GARMENT (2 Sets: Person + Dress)
               --------------------------------------------------------- */}
            {imageSource === 'own-garment' && tryOnStage === 'browse' && (
              <div className="rounded-2xl grid gap-6 border border-line bg-white p-6 lg:grid-cols-2">
                {/* Set 1: Your Photo (Image 1 Identity Authority) */}
                <div className="rounded-2xl flex flex-col justify-between border border-line bg-canvas p-5">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-brand">
                        Your Photo
                      </span>
                      <span className="border border-line bg-white px-2.5 py-0.5 tabular-nums text-xs font-semibold">
                        REQUIRED
                      </span>
                    </div>
                    <h3 className="mt-1 text-2xl font-bold text-ink">
                      Your Photo
                    </h3>
                    <p className="mt-1 text-xs text-muted">
                      Stand in front of the camera for a clear, full-length photo.
                    </p>

                    <div className="rounded-2xl mt-4 flex aspect-[9/16] max-h-96 w-full items-center justify-center overflow-hidden border border-dashed border-line bg-white">
                      {customerPhoto ? (
                        <img
                          src={customerPhoto}
                          alt="Customer Identity"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="p-6 text-center text-muted">
                          <User className="mx-auto h-10 w-10 text-brand" />
                          <p className="mt-2 text-sm font-semibold text-ink">
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
                      className="flex min-h-14 items-center justify-center gap-2 bg-ink px-4 py-3 text-xs font-bold text-[#FAF6EE]"
                    >
                      <Camera className="h-4 w-4" />
                      Take photo
                    </button>
                    <label className="rounded-2xl flex min-h-14 cursor-pointer items-center justify-center gap-2 border border-ink bg-white px-4 py-3 text-xs font-bold text-ink">
                      <Upload className="h-4 w-4" />
                      Choose photo
                      <input
                        type="file"
                        accept="image/*"
                        className="rounded-xl hidden"
                        onChange={(e) => handleFileUpload('own-person', e.target.files?.[0])}
                      />
                    </label>
                  </div>
                </div>

                {/* Set 2: Own Garment / Dress Photo (Image 2 Garment Reference) */}
                <div className="rounded-2xl flex flex-col justify-between border border-line bg-canvas p-5">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-brand">
                        Your Garment
                      </span>
                      <span className="border border-line bg-white px-2.5 py-0.5 tabular-nums text-xs font-semibold">
                        REQUIRED
                      </span>
                    </div>
                    <h3 className="mt-1 text-2xl font-bold text-ink">
                      Your Garment
                    </h3>
                    <p className="mt-1 text-xs text-muted">
                      Take a clear photo of the garment you want to try, or choose one from your phone.
                    </p>

                    <div className="rounded-2xl mt-4 flex aspect-[9/16] max-h-96 w-full items-center justify-center overflow-hidden border border-dashed border-line bg-white">
                      {ownGarmentPhoto ? (
                        <img
                          src={ownGarmentPhoto}
                          alt="Own Garment Reference"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="p-6 text-center text-muted">
                          <Shirt className="mx-auto h-10 w-10 text-brand" />
                          <p className="mt-2 text-sm font-semibold text-ink">
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
                      className="flex min-h-14 items-center justify-center gap-2 bg-ink px-4 py-3 text-xs font-bold text-[#FAF6EE]"
                    >
                      <Camera className="h-4 w-4" />
                      Photograph garment
                    </button>
                    <label className="rounded-2xl flex min-h-14 cursor-pointer items-center justify-center gap-2 border border-ink bg-white px-4 py-3 text-xs font-bold text-ink">
                      <Upload className="h-4 w-4" />
                      Choose garment photo
                      <input
                        type="file"
                        accept="image/*"
                        className="rounded-xl hidden"
                        onChange={(e) => handleFileUpload('own-garment', e.target.files?.[0])}
                      />
                    </label>
                  </div>
                </div>

                {/* Generate Button Across Both Columns */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4 lg:col-span-2">
                  <div>
                    {tryOnError && (
                      <p className="text-xs font-semibold text-danger">{tryOnError}</p>
                    )}
                    <p className="text-xs text-muted">
                      Once generated, you will get a mobile QR code to download and the Old vs. New Dress comparison slider below.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!customerPhoto || !ownGarmentPhoto}
                    onClick={() => runTryOnGeneration(customerPhoto, ownGarmentPhoto)}
                    className="flex min-h-16 items-center gap-2 bg-brand px-8 py-4 text-sm font-bold text-[#FAF6EE] transition hover:bg-[#610F20] disabled:opacity-40"
                  >
                    <Sparkles className="h-5 w-5" />
                    Generate Own-Garment AI Try-On
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            MODE 2: 60s LIVE AI TRY-ON (Step 1 Dress -> Step 2 Camera -> Step 3 60s Live)
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
          <section className="rounded-2xl mx-auto max-w-2xl space-y-6 border border-line bg-white p-8 text-center">
            <p className="text-sm font-bold text-brand">AI Fashion Video</p>
            <h2 className="text-4xl font-bold">Enter the last four digits of your bill</h2>
            <p className="text-lg text-muted">Your biller will tell you which four digits to enter. We save them with this demo experience.</p>
            <input value={tvBillLast4} onChange={(event) => setTvBillLast4(event.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" autoComplete="off" maxLength={4} aria-label="Last four digits of bill number" className="mx-auto block min-h-20 w-full max-w-sm border border-ink bg-canvas text-center tabular-nums text-4xl" />
            <button type="button" disabled={tvBillLast4.length !== 4} onClick={() => setTvBillEntered(true)} className="min-h-16 w-full max-w-sm bg-brand px-6 text-lg font-bold text-white disabled:opacity-45">Continue to AI Video</button>
          </section>
        )}
        {mode === 'catalogue-video' && (!tvBillSuffixRequired || tvBillEntered) && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-line bg-white p-5">
              <p className="text-sm font-bold text-brand">AI fashion video · Diwali collection</p>
              <h2 className="mt-1 text-4xl font-bold">Choose a garment for your film</h2>
              <p className="mt-2 text-lg text-muted">We create your portrait here. Scan the QR to make your video privately on your phone.</p>
            </div>
            <div className="tv-video-audience grid grid-cols-4 gap-3" aria-label="AI Video audience">
              {(['women', 'men', 'boys', 'girls'] as const).map((audience) => <button key={audience} type="button" aria-pressed={videoAudience === audience} onClick={() => {
                setVideoAudience(audience);
                setCataloguePage(0);
                setVideoPersonPhoto(''); setVideoMasterUrl(''); setVideoPassQr(''); setVideoPassUrl(''); setVideoPassCode(''); setVideoGuardianConsent(false);
                const first = catalogueItems.find((item) => item.price > 0 && (item.eligibleForVideo || item.sku.startsWith('TF-') || item.sku.startsWith('8IC') || item.sku.startsWith('silk-')) && item.gender === audience && (audience !== 'women' || item.category === 'sarees'));
                if (first) setSelectedProduct(first);
              }} className={`min-h-16 border px-4 text-xl font-bold capitalize ${videoAudience === audience ? 'border-ink bg-ink text-white': 'border-line bg-white text-ink'}`}>{audience}</button>)}
            </div>
            <div className="grid gap-4">
              <section className="rounded-2xl min-w-0 border border-line bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
                  <h3 className="text-2xl font-bold capitalize">{videoAudience} looks</h3>
                  <span className="text-sm font-semibold">{videoBrowseProducts.length} garments · Page {safeVideoPage + 1}/{videoPageCount}</span>
                </div>
                <div className="tv-video-garments mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleVideoProducts.map((item) => (
                    <button
                      key={item.sku}
                      type="button"
                      aria-pressed={selectedProduct.sku === item.sku}
                      onClick={() => {
                        setSelectedProduct(item);
                        setVideoMasterUrl('');
                        setVideoPassQr('');
                        setVideoPassUrl('');
                        setVideoPassCode('');
                      }}
                      className={`group flex flex-col justify-between overflow-hidden border text-left bg-white transition hover:border-brand ${
 selectedProduct.sku === item.sku ? 'border-brand ring-2 ring-brand': 'border-line'
 }`}
                    >
                      <div className="tv-product-image relative aspect-[3/4] w-full overflow-hidden bg-line">
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="h-full w-full object-contain transition duration-300 group-hover:scale-105"
                        />
                      </div>
                      <div className="flex flex-1 flex-col justify-between gap-1.5 p-3">
                        <p className="line-clamp-2 tracking-tight text-sm font-semibold leading-tight text-ink">
                          {item.title}
                        </p>
                        <div className="mt-1 flex items-center justify-between border-t border-[#F0F2ED] pt-2">
                          <span className="tabular-nums text-sm font-bold text-brand">
                            {formatINR(item.price)}
                          </span>
                          <span className="tabular-nums text-xs font-bold text-brand">
                            {selectedProduct.sku === item.sku ? '✓ Selected' : '+ Select'}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                {videoBrowseProducts.length === 0 && <p className="p-8 text-center text-lg">No garments in this collection yet. Ask the store to add them.</p>}
                <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                  <button type="button" disabled={safeVideoPage <= 0} onClick={() => setCataloguePage(safeVideoPage - 1)} className="min-h-14 border border-ink px-5 font-bold disabled:opacity-35">← Previous</button>
                  <span className="font-semibold">{safeVideoPage + 1} / {videoPageCount}</span>
                  <button type="button" disabled={safeVideoPage >= videoPageCount - 1} onClick={() => setCataloguePage(safeVideoPage + 1)} className="min-h-14 border border-ink px-5 font-bold disabled:opacity-35">Next →</button>
                </div>
              </section>
            </div>

            {/* Step 2 & 3: Portrait Two-Slot Input + Diwali Master Preview & 1-Day Mobile QR */}
            <section className="grid gap-5 grid-cols-2">
              {/* Left Card: Two Image Slots (01 Your Photo + 02 Selected Garment) & Generate CTA */}
              <div className="rounded-2xl flex flex-col justify-between border border-line bg-white p-5">
                <div>
                  <h3 className="mt-1 text-2xl font-bold text-ink">
                    Add your photo
                  </h3>

                  <div className="mt-4 grid grid-cols-2 gap-3.5">
                    {/* Slot 01: Customer Photo */}
                    <div className="rounded-2xl border border-line bg-canvas p-3">
                      <div className="flex aspect-[9/16] items-center justify-center overflow-hidden bg-line">
                        {videoPersonPhoto ? (
                          <img
                            src={videoPersonPhoto}
                            alt="Customer photo for Diwali image"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="p-4 text-center text-muted">
                            <User className="mx-auto h-12 w-12" />
                            <span className="mt-2 block text-sm font-bold">
                              Tap Capture Below
                            </span>
                          </div>
                        )}
                      </div>
                      <p className="mt-2.5 text-xs font-bold text-ink">
                        01 · Your Photo
                      </p>
                    </div>

                    {/* Slot 02: Selected Catalogue Garment */}
                    <div className="rounded-2xl border border-line bg-canvas p-3">
                      <div className="aspect-[9/16] overflow-hidden bg-line">
                        <img
                          src={selectedProduct.imageUrl}
                          alt={`Selected garment: ${selectedProduct.title}`}
                          className="h-full w-full object-cover object-top"
                        />
                      </div>
                      <p className="mt-2.5 truncate text-xs font-bold text-brand">
                        02 · {selectedProduct.title}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3 border-t border-line pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => openCameraFor('video-person')}
                      className="flex min-h-[64px] items-center justify-center gap-2 bg-ink px-4 py-3.5 text-xs font-bold text-white"
                    >
                      <Camera className="h-5 w-5" />
                      {videoPersonPhoto ? 'Retake Photo (5s)' : 'Capture Photo (5s)'}
                    </button>
                    <label className="rounded-2xl flex min-h-[64px] cursor-pointer items-center justify-center gap-2 border border-ink bg-white px-4 py-3.5 text-xs font-bold text-ink">
                      <Upload className="h-5 w-5" />
                      Upload Photo
                      <input
                        type="file"
                        accept="image/*"
                        className="rounded-xl hidden"
                        onChange={(e) => handleFileUpload('video-person', e.target.files?.[0])}
                      />
                    </label>
                  </div>

                  <PhotoConsentNotice kind="video" large />
                  {(selectedProduct.gender === 'boys' || selectedProduct.gender === 'girls') && <label className="rounded-2xl flex items-start gap-3 border border-line bg-white p-3 text-sm"><input type="checkbox" checked={videoGuardianConsent} onChange={(event) => setVideoGuardianConsent(event.target.checked)} className="mt-1 h-5 w-5" /><span>I am the parent or legal guardian and consent to processing this child&apos;s photo for this video experience.</span></label>}
                  <button
                    type="button"
                    disabled={!videoPersonPhoto || videoGeneratingMaster || !videoBrowseProducts.some((item) => item.sku === selectedProduct.sku) || ((selectedProduct.gender === 'boys' || selectedProduct.gender === 'girls') && !videoGuardianConsent)}
                    onClick={generateCatalogueVideoMasterOnTv}
                    className="flex min-h-[68px] w-full items-center justify-center gap-2.5 bg-brand px-5 py-4 text-sm font-bold text-[#FAF6EE] disabled:opacity-45"
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
              <div className="rounded-2xl flex flex-col justify-between border border-line bg-canvas p-5">
                {videoGeneratingMaster ? (
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                    <LoaderCircle className="h-16 w-16 animate-spin text-brand" />
                    <p className="mt-4 text-xs font-bold text-brand">
                      Generating Diwali Master Portrait
                    </p>
                    <h3 className="mt-2 text-3xl font-bold text-ink">
                      Dressing You in {selectedProduct.title}
                    </h3>
                    <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
                      Preserving your exact face and natural skin tone while draping{' '}
                      <strong>{selectedProduct.title}</strong> in the Maharaja Diwali courtyard. Your 1-day mobile QR will appear automatically once ready.
                    </p>
                  </div>
                ) : videoMasterUrl ? (
                  <div className="flex h-full flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-line pb-3">
                        <span className="bg-[#EBF5EE] px-3 py-1 text-xs font-bold text-success">
                          Step 4 · Diwali Portrait Ready
                        </span>
                        <div className="relative">
                          <button type="button" aria-label="Portrait options" aria-expanded={showPortraitMenu} onClick={() => setShowPortraitMenu((open) => !open)} className="flex min-h-14 min-w-14 items-center justify-center border border-ink bg-white">
                            <MoreVertical className="h-6 w-6" />
                          </button>
                          {showPortraitMenu && (
                            <div className="rounded-2xl absolute right-0 top-16 z-40 w-72 border border-ink bg-white shadow-xl">
                              <button
                                type="button"
                                onClick={() => {
                                  // Retry starts again: choose another catalogue dress.
                                  setShowPortraitMenu(false);
                                  setVideoMasterUrl('');
                                  setVideoMasterSessionId('');
                                  setVideoPassQr('');
                                  setVideoPassUrl('');
                                  setVideoPassCode('');
                                  setVideoStatusNote('');
                                }}
                                className="flex min-h-16 w-full items-center gap-3 px-5 text-left text-lg font-semibold"
                              >
                                <RotateCcw className="h-5 w-5" /> Retry with another dress
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-[1fr_210px] gap-4 items-center">
                        <div className="aspect-[9/16] max-h-[380px] overflow-hidden border border-ink bg-ink">
                          <img
                            src={videoMasterUrl}
                            alt="Generated Diwali portrait"
                            className="h-full w-full object-cover object-top"
                          />
                        </div>

                        <div className="rounded-2xl flex flex-col items-center border border-ink bg-white p-3 text-center">
                          {videoPassCreating ? (
                            <div className="flex h-44 w-44 items-center justify-center">
                              <LoaderCircle className="h-8 w-8 animate-spin text-brand" />
                            </div>
                          ) : videoPassQr ? (
                            <img
                              src={videoPassQr}
                              alt="Catalogue Video Mobile QR"
                              className="h-44 w-44 object-contain"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => void createCatalogueVideoPass(selectedProduct, selectedEventId, videoMasterUrl, videoMasterSessionId)}
                              className="flex h-44 w-44 items-center justify-center bg-brand text-xl font-bold text-white"
                            >
                              Proceed
                            </button>
                          )}
                          <p className="mt-2 text-xs font-bold text-brand">
                            Scan for 1-Day Video Pass
                          </p>
                          <p className="mt-1 text-xs leading-snug text-muted">
                            Continue on phone to render your 6s AI Video & choose{' '}
                            <strong>Download</strong> or <strong>Go Live</strong>.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                      <span className="tabular-nums text-xs text-muted">
                        Pass: <strong className="text-[#161918]">{videoPassCode}</strong>
                      </span>
                      {videoPassUrl && (
                        <a
                          href={videoPassUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl inline-flex min-h-[48px] items-center gap-1.5 border border-ink bg-white px-4 py-2 text-xs font-bold text-ink"
                        >
                          Open Mobile Pass
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                    <QrCode className="h-14 w-14 text-muted" />
                    <p className="mt-4 text-xs font-bold text-brand">
                      Step 4 · 1-Day Mobile QR Unlocks After Portrait
                    </p>
                    <h3 className="mt-2 text-2xl font-bold text-ink">
                      Capture Your Photo & Generate Diwali Image First
                    </h3>
                    <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
                      {videoStatusNote ||
                        'Once your Diwali portrait is created on the standee, your private 24-hour mobile QR will appear here so you can render the AI Video and Download or Go Live.'}
                    </p>
                  </div>
                )}
              </div>
            </section>
            <div className="rounded-2xl border border-line bg-white p-5 text-sm leading-relaxed text-muted">
              <p className="font-bold text-ink">Your photo, your choice</p>
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
              <span className="bg-brand px-3 py-1 text-xs font-bold">
                TryFocus Smart Mirror
              </span>
              <span className="tabular-nums text-xs text-white/80">
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
              }}
              className="flex min-h-12 items-center gap-2 border border-white/40 bg-white/10 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
              Close Camera
            </button>
          </div>

          {/* Center Tall Mirror Camera Feed - Locked strictly to 9:16 vertical for 43" TV Kiosk */}
          <div className="relative mx-auto my-3 flex aspect-[9/16] h-[72vh] max-w-full items-center justify-center overflow-hidden rounded-2xl border border-white/30 bg-ink shadow-2xl">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-full w-full object-cover [transform:scaleX(-1)]"
            />

            {/* Vertical 9:16 Full Body Pose Framing Guide */}
            <div className="pointer-events-none absolute inset-6 flex flex-col justify-between rounded-xl border border-dashed border-white/40 p-4">
              <div className="flex justify-between text-xs text-white/70">
                <span>┌ Head Level</span>
                <span>Portrait 9:16 ┐</span>
              </div>
              <div className="flex justify-between text-xs text-white/70">
                <span>└ Full Standing Pose</span>
                <span>Ground ┘</span>
              </div>
            </div>

            {/* Top Pill: FULL BODY SHOT (matching screenshot 3) */}
            <div className="pointer-events-none absolute inset-x-0 top-5 flex justify-center">
              <div className="rounded-full bg-black/70 px-6 py-2 text-center backdrop-blur-md">
                <p className="text-xs font-bold text-white">
                  {cameraTarget === 'own-garment' ? 'GARMENT REFERENCE SHOT' : 'FULL BODY SHOT'}
                </p>
                <p className="text-xs text-white/80">
                  Ensure good lighting for better results
                </p>
              </div>
            </div>

            {/* Center Prompt + Countdown (matching screenshot 3 "Move Back and Strike a Pose!" + "1") */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <p className="rounded-md bg-black/45 px-4 py-1.5 text-2xl font-bold text-sky-200 drop-shadow">
                {cameraTarget === 'own-garment'
                  ? 'Hold Dress Clearly in Frame'
                  : 'Move Back and Strike a Pose!'}
              </p>
              {countdown !== null && (
                <span className="mt-2 tabular-nums text-8xl font-extrabold text-sky-300 drop-shadow-lg">
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
                }}
                className="flex h-16 w-16 items-center justify-center rounded-full border border-white/40 bg-black/75 text-white shadow-lg transition hover:bg-black active:scale-95"
                title="Cancel"
              >
                <X className="h-7 w-7" />
              </button>

              <button
                type="button"
                onClick={triggerCountdownCapture}
                className="flex flex-col items-center active:scale-95"
              >
                <span className="flex h-[88px] w-[88px] items-center justify-center rounded-full border-4 border-white bg-sky-400 shadow-2xl transition hover:scale-105">
                  <Camera className="h-9 w-9 text-ink" />
                </span>
                <span className="mt-1.5 text-xs font-extrabold text-white drop-shadow">
                  CAPTURE (5s)
                </span>
              </button>

              <button
                type="button"
                onClick={() => openCameraFor(cameraTarget)}
                className="flex h-16 w-16 items-center justify-center rounded-full border border-white/40 bg-black/75 text-white shadow-lg transition hover:bg-black active:scale-95"
                title="Restart Camera"
              >
                <RefreshCw className="h-7 w-7" />
              </button>
            </div>
          </div>

          {/* Bottom Laptop File Upload Alternative */}
          <div className="mx-auto flex w-full max-w-xl flex-wrap items-center justify-between gap-3 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-xs">
            <span className="text-white/80">
              Use the camera, choose a photo, or send one from your phone.
            </span>
            <label className="flex cursor-pointer items-center gap-1.5 bg-white px-4 py-2 text-xs font-bold text-ink hover:bg-[#F4F5F2]">
              <Upload className="h-3.5 w-3.5" />
              Choose photo
              <input
                type="file"
                accept="image/*"
                className="rounded-xl hidden"
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
