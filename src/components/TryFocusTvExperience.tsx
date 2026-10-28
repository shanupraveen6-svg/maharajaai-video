'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  Home,
  LoaderCircle,
  QrCode,
  RefreshCw,
  RotateCcw,
  Shirt,
  Sparkles,
  Upload,
  User,
  Video,
  X,
} from 'lucide-react';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import LucyLiveMirror from '@/components/LucyLiveMirror';
import {
  catalogueCategories,
  events,
  formatINR,
  sampleCatalogue,
  type CatalogueCategoryId,
  type TryFocusProduct,
} from '@/lib/tryfocus/sample-data';

type TvMode = 'home' | 'image-tryon' | 'live-tryon' | 'catalogue-video';
type ImageTryOnSource = 'catalogue' | 'own-garment';
type CatalogueTryOnStage = 'browse' | 'camera' | 'generating' | 'result';
type CameraTarget = 'catalogue-person' | 'own-person' | 'own-garment' | 'video-person';

export default function TryFocusTvExperience() {
  const [mode, setMode] = useState<TvMode>('home');

  // Catalogue filtering
  const [genderFilter, setGenderFilter] = useState<'women' | 'men'>('women');
  const [activeCategory, setActiveCategory] = useState<CatalogueCategoryId>('sarees');
  const [showNewArrivals, setShowNewArrivals] = useState(false);
  const [cataloguePage, setCataloguePage] = useState(0);
  const catalogueTopRef = useRef<HTMLDivElement | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<TryFocusProduct>(sampleCatalogue[0]);

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

  const filteredCategories = catalogueCategories.filter((cat) => cat.gender === genderFilter);
  const categoryProducts = sampleCatalogue.filter((item) => item.category === activeCategory);
  const browseProducts = sampleCatalogue.filter((item) => item.gender === genderFilter &&
    (showNewArrivals ? item.badge === 'NEW ARRIVAL' : item.category === activeCategory));
  const cataloguePageCount = Math.max(1, Math.ceil(browseProducts.length / 4));
  const visibleBrowseProducts = browseProducts.slice(cataloguePage * 4, cataloguePage * 4 + 4);

  function selectGender(gender: 'women' | 'men') {
    if (gender === genderFilter) return;
    setGenderFilter(gender);
    setActiveCategory(gender === 'women' ? 'sarees' : 'kurta');
    setShowNewArrivals(false);
    setCataloguePage(0);
    setSelectedLooks([]);
  }

  function selectCategory(category: CatalogueCategoryId) {
    setActiveCategory(category);
    setShowNewArrivals(false);
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
    stopCamera();
    setCameraOpen(false);
    setCameraError('');
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
      if (current.length >= 5) return current;
      return [...current, product];
    });
  }

  async function runCatalogueBatch(personImg: string) {
    const looks = selectedLooks.length ? selectedLooks : [selectedProduct];
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
            templateId: product.gender,
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
        setBatchProgress((current) => ({ ...current, [product.sku]: 'ready' }));
        return { product, url: data.masterImageUrl as string };
      } catch (error) {
        setBatchProgress((current) => ({ ...current, [product.sku]: 'failed' }));
        return { product, url: '', error: error instanceof Error ? error.message : 'Generation failed' };
      } finally {
        setBatchDone((count) => count + 1);
      }
    }));
    const results = completed.map((entry, index) => entry.status === 'fulfilled'
      ? entry.value
      : { product: looks[index], url: '', error: 'Generation failed' });
    setGeneratedLooks(results);
    const firstReady = results.findIndex((item) => item.url);
    if (firstReady >= 0) {
      setActiveLookIndex(firstReady);
      setSelectedProduct(results[firstReady].product);
      setTryOnResultUrl(results[firstReady].url);
      setTryOnStage('result');
      void createImageHandoff(results.filter((item) => item.url));
    } else {
      setTryOnError('No looks could be created. Please try again.');
      setTryOnStage('browse');
    }
  }

  async function createImageHandoff(looks: Array<{ product: TryFocusProduct; url: string }>) {
    setHandoffStatus('Preparing your private mobile QR…');
    try {
      const response = await fetch('/api/tv/tryon-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ looks: looks.map((look) => ({ sku: look.product.sku, title: look.product.title, image: look.url })) }),
      });
      const data = await response.json();
      if (!response.ok || !data.token) throw new Error(data.error || 'Mobile handoff unavailable');
      const url = `${window.location.origin}/maharaja/looks/${data.token}`;
      const qr = await QRCode.toDataURL(url, { width: 260, margin: 1, color: { dark: '#161918', light: '#FAFBF8' } });
      setTryOnMobileQr(qr);
      setHandoffStatus('Scan to view and download your generated looks. Link expires in 15 minutes.');
    } catch (error) {
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
    masterUrl = ''
  ) {
    setVideoPassCreating(true);
    try {
      const res = await fetch('/api/maharaja/video-pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'tv-kiosk',
          experienceType: 'catalogue-gift',
          catalogueSku: product.sku,
          eventId,
          videoMasterUrl: masterUrl || undefined,
          videoMasterApproved: Boolean(masterUrl),
          videoMasterCategory: product.gender,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.pass?.link) throw new Error(data?.error || 'Unable to create mobile video pass.');
      const passLink = data.pass.link;
      setVideoPassUrl(passLink);
      setVideoPassCode(data?.pass?.code || 'TV-CATALOGUE-PASS');
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
    if (!personImg || !garmentImg) {
      setTryOnError('Both Image 1 (Customer Photo) and Image 2 (Garment Photo) are required.');
      return;
    }
    setTryOnError('');
    setTryOnStatusNote('');
    setTryOnStage('generating');

    const sessionId = `tv_tryon_${Date.now()}`;
    const targetProduct = product || selectedProduct;

    try {
      const res = await fetch('/api/ai/master-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          service: 'try-on',
          templateId: targetProduct.gender,
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
      if (res.ok && data?.masterImageUrl) {
        setTryOnResultUrl(data.masterImageUrl);
        setTryOnStatusNote('AI Virtual Try-On rendered with customer identity lock (Image 1 = Person, Image 2 = Garment).');
        setTryOnStage('result');
        setTryOnMobileQr('');
        void createImageHandoff([{ product: targetProduct, url: data.masterImageUrl }]);
        return;
      }
      throw new Error(data?.error || 'Try-on generation failed.');
    } catch (error) {
      setTryOnError(error instanceof Error ? error.message : 'Try-on generation failed.');
      setTryOnStage('browse');
    }
  }

  async function generateCatalogueVideoMasterOnTv() {
    if (!videoPersonPhoto) return;
    setVideoGeneratingMaster(true);
    setVideoStatusNote('');
    const sessionId = `tv_vidmaster_${Date.now()}`;
    const conceptId = selectedProduct.gender === 'men' ? 'men_festive_1' : 'women_saree_1';

    try {
      const res = await fetch('/api/ai/master-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          service: 'ai-video',
          eventId: selectedEventId,
          templateId: selectedProduct.gender,
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
      if (!res.ok || !data?.masterImageUrl) throw new Error(data?.error || 'Festival image generation failed.');
      const generatedUrl = data.masterImageUrl;
      setVideoMasterUrl(generatedUrl);
      setVideoStatusNote('Diwali image ready. Scan the QR on your phone to generate the video.');
      await createCatalogueVideoPass(selectedProduct, selectedEventId, generatedUrl);
    } catch (error) {
      setVideoStatusNote(error instanceof Error ? error.message : 'Festival image generation failed.');
    } finally {
      setVideoGeneratingMaster(false);
    }
  }

  function resetAllSession() {
    stopCamera();
    setCameraOpen(false);
    setCustomerPhoto('');
    setOwnGarmentPhoto('');
    setTryOnResultUrl('');
    setTryOnMobileQr('');
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
    setVideoStatusNote('');
    setMode('home');
  }

  function startCatalogueTryOnFor(item: TryFocusProduct) {
    setSelectedProduct(item);
    setSelectedLooks([item]);
    setImageSource('catalogue');
    setMode('image-tryon');
    if (customerPhoto) {
      // The chosen product must be in state before the batch reads it.
      setTryOnStage('browse');
    } else {
      setTryOnStage('camera');
      void openCameraFor('catalogue-person');
    }
  }

  return (
    <main className="tv-kiosk min-h-screen bg-[#F4F5F2] text-[#161918]">
      {/* Top Smart Mirror Kiosk Navigation Header */}
      <header className="sticky top-0 z-30 border-b border-[#D8DCD7] bg-[#F4F5F2]/95 backdrop-blur-md">
        <div className="tv-kiosk-header mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigateTo('home')}
              className="flex h-10 w-10 items-center justify-center border border-[#161918] bg-[#161918] font-mono text-xs font-bold tracking-widest text-[#FAF6EE]"
            >
              TF
            </button>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#7A1428]">
                  SMART MIRROR · AI KIOSK
                </p>
                <span className="border border-[#D8DCD7] bg-white px-2 py-0.5 font-mono text-[10px] text-[#535A56]">
                  PC / TV TOUCHSCREEN
                </span>
              </div>
              <h1 className="font-serif text-lg font-semibold tracking-tight text-[#161918]">
                TryFocus × The Majestic Maharaja
              </h1>
            </div>
          </div>

          {/* Kiosk Mode Tabs (matching reference screenshots top bar) */}
          <nav className="tv-kiosk-nav flex flex-wrap items-center gap-1.5" aria-label="Standee experiences">
            <button
              type="button"
              onClick={() => {
                navigateTo('home');
                setTryOnStage('browse');
              }}
              className={`flex items-center gap-1.5 border px-3.5 py-2 text-xs font-semibold transition ${
                mode === 'home'
                  ? 'border-[#161918] bg-[#161918] text-[#FAF6EE]'
                  : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918] hover:border-[#161918]'
              }`}
            >
              <Home className="h-3.5 w-3.5" />
              Home
            </button>
            <button
              type="button"
              onClick={() => {
                navigateTo('image-tryon');
                setTryOnStage('browse');
              }}
              className={`flex items-center gap-1.5 border px-3.5 py-2 text-xs font-semibold transition ${
                mode === 'image-tryon'
                  ? 'border-[#7A1428] bg-[#7A1428] text-[#FAF6EE]'
                  : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918] hover:border-[#161918]'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI Image Try-On
            </button>
            <button
              type="button"
              onClick={() => navigateTo('live-tryon')}
              className={`flex items-center gap-1.5 border px-3.5 py-2 text-xs font-semibold transition ${
                mode === 'live-tryon'
                  ? 'border-[#7A1428] bg-[#7A1428] text-[#FAF6EE]'
                  : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918] hover:border-[#161918]'
              }`}
            >
              <Camera className="h-3.5 w-3.5" />
              30s Live AI Mirror
            </button>
            <button
              type="button"
              onClick={() => navigateTo('catalogue-video')}
              className={`flex items-center gap-1.5 border px-3.5 py-2 text-xs font-semibold transition ${
                mode === 'catalogue-video'
                  ? 'border-[#7A1428] bg-[#7A1428] text-[#FAF6EE]'
                  : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918] hover:border-[#161918]'
              }`}
            >
              <Video className="h-3.5 w-3.5" />
              AI Catalogue Video
            </button>
            <button
              type="button"
              onClick={resetAllSession}
              className="flex items-center gap-1.5 border border-[#D8DCD7] bg-white px-3.5 py-2 text-xs font-semibold text-[#535A56] transition hover:border-[#B42318] hover:text-[#B42318]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              End Session
            </button>
          </nav>
        </div>
      </header>

      <div className="tv-kiosk-content mx-auto max-w-[1920px] px-5 py-6 sm:px-8">
        {/* =========================================================
            MODE 0: SMART MIRROR HOME (Storefront Banner + Quick Entry)
           ========================================================= */}
        {mode === 'home' && (
          <div className="tv-home space-y-6">
            {/* Smart Mirror Hero Banner (inspired by Mugdhaa / Ramraj Smart Mirror screenshots) */}
            <section className="tv-home-hero grid gap-6 border border-[#D8DCD7] bg-[#FAFBF8] p-6 lg:grid-cols-[1.15fr_0.85fr] lg:p-8">
              <div className="flex flex-col justify-between">
                <div>
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-[#7A1428]">
                    The Majestic Maharaja · Smart Mirror Experience
                  </p>
                  <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[#161918] sm:text-5xl">
                    What would you like to try today?
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#535A56] sm:text-base">
                    Explore Maharaja styles, see them on yourself, and save your favourite look privately to your phone.
                  </p>
                </div>

                {/* Primary Quick CTA Pill Buttons (Catalogue vs Upload My Saree/Garment) */}
                <div className="hidden mt-6 flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setImageSource('catalogue');
                      setTryOnStage('browse');
                      setMode('image-tryon');
                    }}
                    className="flex items-center gap-2 bg-[#7A1428] px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#FAF6EE] transition hover:bg-[#610F20]"
                  >
                    <Sparkles className="h-4 w-4" />
                    Browse styles
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImageSource('own-garment');
                      setTryOnStage('browse');
                      setMode('image-tryon');
                    }}
                    className="flex items-center gap-2 border border-[#161918] bg-white px-6 py-3.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#161918] transition hover:bg-[#161918] hover:text-[#FAF6EE]"
                  >
                    <Upload className="h-4 w-4" />
                    Try my garment
                  </button>
                </div>
              </div>

              {/* Right Preview Collage Card */}
              <div className="tv-home-feature grid grid-cols-3 gap-2.5 border border-[#D8DCD7] bg-white p-3">
                {sampleCatalogue.slice(0, 3).map((item) => (
                  <button
                    key={item.sku}
                    type="button"
                    onClick={() => startCatalogueTryOnFor(item)}
                    className="group relative overflow-hidden border border-[#D8DCD7] text-left"
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="aspect-[3/4] w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2.5 text-white">
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#F3E5AB]">
                        {formatINR(item.price)}
                      </p>
                      <p className="truncate text-xs font-semibold">{item.title}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* 3 Core TV Kiosk Modules */}
            <section className="tv-experience-grid grid gap-4 md:grid-cols-3">
              <div className="tv-experience-card flex flex-col justify-between border border-[#D8DCD7] bg-[#FAFBF8] p-6">
                <div>
                  <img src={sampleCatalogue[0].imageUrl} alt="Silk saree try-on preview" className="tv-experience-image mb-5 h-36 w-full object-cover object-top" />
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                    01 · AI Image Try-On
                  </span>
                  <h3 className="mt-2 font-serif text-2xl font-semibold text-[#161918]">
                    AI Image Try-On
                  </h3>
                  <p className="mt-2 text-sm text-[#535A56]">Choose a Maharaja look or bring your own garment to the mirror.</p>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setImageSource('catalogue');
                      setTryOnStage('browse');
                      setMode('image-tryon');
                    }}
                    className="bg-[#7A1428] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#FAF6EE]"
                  >
                    Browse styles
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImageSource('own-garment');
                      setTryOnStage('browse');
                      setMode('image-tryon');
                    }}
                    className="border border-[#161918] bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#161918]"
                  >
                    My garment
                  </button>
                </div>
              </div>

              <div className="tv-experience-card flex flex-col justify-between border border-[#D8DCD7] bg-[#FAFBF8] p-6">
                <div>
                  <img src={sampleCatalogue[15].imageUrl} alt="Live mirror fashion preview" className="tv-experience-image mb-5 h-36 w-full object-cover object-top" />
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                    02 · 30s Live AI Try-On
                  </span>
                  <h3 className="mt-2 font-serif text-2xl font-semibold text-[#161918]">
                    Live AI Mirror
                  </h3>
                  <p className="mt-2 text-sm text-[#535A56]">See a selected look move with you. Each session lasts 30 seconds.</p>
                </div>
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => setMode('live-tryon')}
                    className="bg-[#161918] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#FAF6EE]"
                  >
                    Start live mirror
                  </button>
                </div>
              </div>

              <div className="tv-experience-card flex flex-col justify-between border border-[#D8DCD7] bg-[#FAFBF8] p-6">
                <div>
                  <img src={sampleCatalogue[10].imageUrl} alt="AI fashion video preview" className="tv-experience-image mb-5 h-36 w-full object-cover object-top" />
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                    03 · AI Catalogue Video
                  </span>
                  <h3 className="mt-2 font-serif text-2xl font-semibold text-[#161918]">
                    AI Fashion Video
                  </h3>
                  <p className="mt-2 text-sm text-[#535A56]">Choose a featured look here, then create your private fashion video on your phone.</p>
                </div>
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => setMode('catalogue-video')}
                    className="bg-[#7A1428] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#FAF6EE]"
                  >
                    Create a video
                  </button>
                </div>
              </div>
            </section>

            {/* Shop by Category Grid (Women & Men — 6 Categories × 5 Models = 30 Items) */}
            <section className="hidden border border-[#D8DCD7] bg-[#FAFBF8] p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D8DCD7] pb-4">
                <div>
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                    Shop by Category · 30 Curated Models
                  </p>
                  <h3 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                    Select a Category to Try On Instantly
                  </h3>
                </div>
                <Link
                  href="/maharaja/tv"
                  className="flex items-center gap-1.5 border border-[#D8DCD7] bg-white px-3.5 py-2 text-xs font-semibold text-[#161918] hover:border-[#161918]"
                >
                  Open Showroom Wall Loop (/maharaja/tv)
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                {catalogueCategories.map((cat) => {
                  const previewItem = sampleCatalogue.find((item) => item.category === cat.id)!;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setGenderFilter(cat.gender);
                        setActiveCategory(cat.id);
                        setImageSource('catalogue');
                        setTryOnStage('browse');
                        setMode('image-tryon');
                      }}
                      className="group overflow-hidden border border-[#D8DCD7] bg-white text-left transition hover:border-[#7A1428]"
                    >
                      <div className="aspect-[3/4] overflow-hidden bg-[#ECEEE9]">
                        <img
                          src={previewItem.imageUrl}
                          alt={cat.label}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        />
                      </div>
                      <div className="p-3">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#7A1428]">
                          {cat.gender} · 5 Models
                        </span>
                        <p className="mt-0.5 font-serif text-base font-semibold text-[#161918]">
                          {cat.label}
                        </p>
                        <p className="mt-0.5 text-xs text-[#535A56]">{cat.subtitle}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* =========================================================
            MODE 1: AI IMAGE TRY-ON (Catalogue Grid + Camera + Result Slider + Own Garment)
           ========================================================= */}
        {mode === 'image-tryon' && (
          <div className="space-y-6">
            {/* Top Sub-bar: Switch between Store Catalogue (30 items) & Upload/Capture Own Garment */}
            <div className="flex flex-wrap items-center justify-between gap-4 border border-[#D8DCD7] bg-[#FAFBF8] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
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
              <div className="space-y-5">
                {/* Gender + Category Filter Bar (matching Smart Mirror screenshots 2, 6, 8) */}
                <div className="flex flex-wrap items-center justify-between gap-4 border border-[#D8DCD7] bg-white p-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#535A56]">
                      Shop for
                    </span>
                    <button
                      type="button"
                      aria-pressed={genderFilter === 'women'}
                      onClick={() => {
                        selectGender('women');
                      }}
                      className={`border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                        genderFilter === 'women'
                          ? 'border-[#161918] bg-[#161918] text-[#FAF6EE]'
                          : 'border-[#D8DCD7] bg-[#F4F5F2] text-[#161918]'
                      }`}
                    >
                      Women
                    </button>
                    <button
                      type="button"
                      aria-pressed={genderFilter === 'men'}
                      onClick={() => {
                        selectGender('men');
                      }}
                      className={`border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                        genderFilter === 'men'
                          ? 'border-[#161918] bg-[#161918] text-[#FAF6EE]'
                          : 'border-[#D8DCD7] bg-[#F4F5F2] text-[#161918]'
                      }`}
                    >
                      Men
                    </button>
                  </div>

                  {/* Category and New Arrivals remain visible as large touch targets. */}
                  <div className="tv-kiosk-filters flex flex-wrap gap-2">
                    <button type="button" aria-pressed={showNewArrivals} onClick={() => { setShowNewArrivals(true); setCataloguePage(0); }} className={`border px-5 py-2 text-xs font-bold uppercase tracking-[0.12em] ${showNewArrivals ? 'border-[#7A1428] bg-[#7A1428] text-white' : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918]'}`}>New Arrivals</button>
                    {filteredCategories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        aria-pressed={!showNewArrivals && activeCategory === cat.id}
                        onClick={() => selectCategory(cat.id)}
                        className={`rounded-full border px-5 py-2 text-xs font-bold uppercase tracking-[0.16em] transition ${
                          !showNewArrivals && activeCategory === cat.id
                            ? 'border-[#7A1428] bg-[#7A1428] text-[#FAF6EE]'
                            : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918] hover:border-[#161918]'
                        }`}
                      >
                        {cat.label} ({sampleCatalogue.filter((item) => item.category === cat.id).length})
                      </button>
                    ))}
                  </div>
                </div>

                <div ref={catalogueTopRef} className="tv-catalogue-heading flex items-center justify-between gap-4 text-[#161918]">
                  <p className="font-serif text-2xl font-semibold">{showNewArrivals ? 'New Arrivals' : filteredCategories.find((cat) => cat.id === activeCategory)?.label}</p>
                  <p className="text-sm font-semibold">{browseProducts.length} garments · Page {cataloguePage + 1} of {cataloguePageCount}</p>
                </div>
                <div className="tv-product-grid grid gap-5 sm:grid-cols-2 lg:grid-cols-2">
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
                            {item.badge || 'MAHARAJA EDIT'}
                          </span>
                          <span className="bg-[#7A1428] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#FAF6EE] shadow-sm">
                            {selectedLooks.some((look) => look.sku === item.sku) ? 'SELECTED' : selectedLooks.length >= 5 ? 'MAX 5' : 'ADD LOOK'}
                          </span>
                        </div>

                        <span className="absolute inset-x-4 bottom-4 mx-auto w-fit rounded-full border border-[#161918]/15 bg-white/95 px-5 py-3 text-base font-bold text-[#161918] shadow-lg">
                          {selectedLooks.some((look) => look.sku === item.sku) ? 'Selected · Tap to remove' : 'Tap to select look'}
                        </span>
                      </button>

                      <div className="flex flex-1 flex-col justify-between p-4">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] text-[#535A56]">{item.sku}</span>
                            <span className="font-mono text-base font-bold text-[#161918]">
                              {formatINR(item.price)}
                            </span>
                          </div>
                          <h4 className="mt-1 font-serif text-lg font-semibold text-[#161918]">
                            {item.title}
                          </h4>
                          <p className="mt-1 text-xs text-[#535A56]">{item.fabricNote}</p>
                        </div>

                        <p className="mt-3 border-t border-[#D8DCD7] pt-3 text-xs text-[#535A56]">Only the garment is used as the reference.</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="tv-catalogue-pagination flex items-center justify-between gap-4 border border-[#D8DCD7] bg-white p-4">
                  <button type="button" disabled={cataloguePage === 0} onClick={() => turnCataloguePage(cataloguePage - 1)} className="border border-[#161918] px-6 py-3 text-lg font-semibold disabled:opacity-35">← Previous</button>
                  <span className="text-lg font-semibold">{cataloguePage + 1} / {cataloguePageCount}</span>
                  <button type="button" disabled={cataloguePage >= cataloguePageCount - 1} onClick={() => turnCataloguePage(cataloguePage + 1)} className="border border-[#161918] px-6 py-3 text-lg font-semibold disabled:opacity-35">Next →</button>
                </div>
                <div className="tv-selection-bar sticky bottom-4 z-20 mt-5 flex flex-wrap items-center justify-between gap-4 border border-[#D8DCD7] bg-white/95 p-4 shadow-xl backdrop-blur">
                  <p className="text-lg font-semibold">{selectedLooks.length} of 5 looks selected</p>
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
                  Smart Mirror AI Drape in Progress
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
              <div className="space-y-6">
                {generatedLooks.length > 0 && <div className="flex items-center justify-between gap-4 border border-[#D8DCD7] bg-white p-4">
                  <button type="button" onClick={() => moveGeneratedLook(-1)} className="min-h-14 border border-[#D8DCD7] px-5 text-lg font-semibold">← Previous</button>
                  <span className="text-center text-lg font-semibold">Look {activeLookIndex + 1} of {generatedLooks.length}</span>
                  <button type="button" onClick={() => moveGeneratedLook(1)} className="min-h-14 border border-[#D8DCD7] px-5 text-lg font-semibold">Next →</button>
                </div>}
                {generatedLooks.length > 0 && <div className="flex gap-3 overflow-x-auto pb-2" aria-label="Generated looks">
                  {generatedLooks.map((look, index) => <button key={look.product.sku} type="button" disabled={!look.url} onClick={() => showGeneratedLook(index)} className={`w-28 shrink-0 border p-2 text-left ${activeLookIndex === index ? 'border-[#7A1428] ring-2 ring-[#7A1428]' : 'border-[#D8DCD7]'} disabled:opacity-50`}>
                    <img src={look.url || look.product.imageUrl} alt={look.product.title} className="h-32 w-full object-cover object-top" />
                    <span className="mt-1 block truncate text-xs font-semibold">{look.error ? 'Failed' : look.product.title}</span>
                  </button>)}
                </div>}
                {/* Top Result Section: Left Wardrobe Switcher + Center Full-Body Look + Right QR & Actions */}
                <div className="tv-result-layout grid gap-6 border border-[#D8DCD7] bg-white p-6 lg:grid-cols-[290px_1fr_320px]">
                  {/* Left: Floating Wardrobe Dock (matching screenshot 10 "The wardrobe") */}
                  <div className="flex flex-col justify-between border border-[#D8DCD7] bg-[#FAFBF8] p-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <h3 className="font-serif text-xl font-semibold text-[#161918]">
                          The wardrobe
                        </h3>
                        <span className="font-mono text-xs text-[#535A56]">30 pieces</span>
                      </div>
                      <p className="mt-0.5 text-xs text-[#535A56]">
                        Select another piece to try on your captured photo immediately.
                      </p>

                      <div className="mt-3 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setGenderFilter('women');
                            setActiveCategory('sarees');
                          }}
                          className={`flex-1 py-1.5 text-xs font-semibold ${
                            genderFilter === 'women'
                              ? 'bg-[#7A1428] text-white'
                              : 'border border-[#D8DCD7] bg-white text-[#535A56]'
                          }`}
                        >
                          Women
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setGenderFilter('men');
                            setActiveCategory('kurta');
                          }}
                          className={`flex-1 py-1.5 text-xs font-semibold ${
                            genderFilter === 'men'
                              ? 'bg-[#7A1428] text-white'
                              : 'border border-[#D8DCD7] bg-white text-[#535A56]'
                          }`}
                        >
                          Men
                        </button>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        {filteredCategories.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setActiveCategory(cat.id)}
                            className={`px-2.5 py-1 text-[11px] font-semibold ${
                              activeCategory === cat.id
                                ? 'bg-[#161918] text-white'
                                : 'border border-[#D8DCD7] bg-white text-[#535A56]'
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>

                      <div className="mt-3 grid max-h-[380px] gap-2 overflow-y-auto pr-1">
                        {categoryProducts.map((item) => (
                          <button
                            key={item.sku}
                            type="button"
                            onClick={() => {
                              setSelectedProduct(item);
                              if (customerPhoto) {
                                void runTryOnGeneration(
                                  customerPhoto,
                                  item.garmentReferenceUrl || item.imageUrl,
                                  item
                                );
                              }
                            }}
                            className={`flex items-center gap-2.5 border p-2 text-left transition ${
                              selectedProduct.sku === item.sku
                                ? 'border-[#7A1428] bg-[#7A1428]/5'
                                : 'border-[#D8DCD7] bg-white hover:border-[#161918]'
                            }`}
                          >
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="h-14 w-11 shrink-0 object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-mono text-xs font-bold text-[#161918]">
                                {formatINR(item.price)}
                              </p>
                              <p className="truncate text-xs font-medium text-[#535A56]">
                                {item.title}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setTryOnStage('browse')}
                      className="mt-4 flex w-full items-center justify-center gap-1.5 border border-[#161918] bg-white py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#161918]"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Back to Full Catalogue
                    </button>
                  </div>

                  {/* Center: Full-Screen Smart Mirror Result Portrait (matching screenshot 4) */}
                  <div className="relative overflow-hidden border border-[#D8DCD7] bg-[#161918]" onTouchStart={(event) => { swipeStartX.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => {
                    if (swipeStartX.current === null) return;
                    const distance = (event.changedTouches[0]?.clientX ?? swipeStartX.current) - swipeStartX.current;
                    swipeStartX.current = null;
                    if (Math.abs(distance) > 60) moveGeneratedLook(distance < 0 ? 1 : -1);
                  }}>
                    <img
                      src={tryOnResultUrl || selectedProduct.imageUrl}
                      alt={selectedProduct.title}
                      className="mx-auto max-h-[620px] w-full object-contain"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-5 text-white">
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#F3E5AB]">
                            A NEW LOOK · ENTIRELY YOU
                          </p>
                          <h3 className="mt-1 font-serif text-2xl font-semibold">
                            {imageSource === 'own-garment'
                              ? 'Custom Customer Garment Try-On'
                              : `${selectedProduct.title} (${selectedProduct.sku})`}
                          </h3>
                          <p className="mt-1 text-xs text-white/80">
                            {imageSource === 'own-garment'
                              ? 'Image 1: Customer Photo · Image 2: Uploaded Customer Garment'
                              : selectedProduct.fabricNote}
                          </p>
                        </div>
                        {imageSource === 'catalogue' && (
                          <span className="rounded-full bg-white/20 px-4 py-1.5 font-mono text-sm font-bold text-white backdrop-blur-sm">
                            {formatINR(selectedProduct.price)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Mobile QR Download + Retake Controls */}
                  <div className="flex flex-col justify-between border border-[#D8DCD7] bg-[#FAFBF8] p-5">
                    <div>
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                        Mobile Handoff · Private Download
                      </p>
                      <h4 className="mt-1 font-serif text-xl font-semibold text-[#161918]">
                        Scan QR to Save on Mobile
                      </h4>
                      <p className="mt-1 text-xs text-[#535A56]">
                        Scan with your phone camera to view and download your generated looks.
                      </p>

                      <div className="mt-4 flex flex-col items-center border border-[#D8DCD7] bg-white p-4">
                        {tryOnMobileQr ? (
                          <img
                            src={tryOnMobileQr}
                            alt="Mobile Download QR"
                            className="h-44 w-44 object-contain"
                          />
                        ) : (
                          <div className="flex h-44 w-44 items-center justify-center">
                            <QrCode className="h-10 w-10 text-[#535A56]" />
                          </div>
                        )}
                        <p className="mt-2 font-mono text-[11px] font-semibold text-[#161918]">
                          {selectedProduct.sku} · {formatINR(selectedProduct.price)}
                        </p>
                      </div>

                      {tryOnStatusNote && (
                        <p className="mt-3 border border-[#D8DCD7] bg-white p-2.5 text-xs text-[#535A56]">
                          {tryOnStatusNote}
                        </p>
                      )}
                      {handoffStatus && <p className="mt-3 border border-[#D8DCD7] bg-white p-2.5 text-xs text-[#535A56]">{handoffStatus}</p>}
                    </div>

                    <div className="mt-5 grid gap-2.5">
                      <a
                        href={tryOnResultUrl || selectedProduct.imageUrl}
                        download={`tryfocus-${selectedProduct.sku.toLowerCase()}.jpg`}
                        className="flex items-center justify-center gap-2 bg-[#7A1428] px-4 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-[#FAF6EE]"
                      >
                        <Download className="h-4 w-4" />
                        Download Image on Kiosk
                      </a>
                      <button
                        type="button"
                        onClick={() => openCameraFor(imageSource === 'own-garment' ? 'own-person' : 'catalogue-person')}
                        className="flex items-center justify-center gap-2 border border-[#161918] bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.15em] text-[#161918]"
                      >
                        <Camera className="h-4 w-4" />
                        Retake Customer Photo
                      </button>
                    </div>
                  </div>
                </div>

                {/* Bottom Section: Old vs New Dress Sliding Comparison (BeforeAfterSlider) */}
                <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                        Interactive Comparison Slider · Old vs. New Dress
                      </p>
                      <h3 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                        Slide to Compare Your Current Look vs. AI Try-On Dress
                      </h3>
                    </div>
                    <span className="border border-[#D8DCD7] bg-white px-3 py-1 font-mono text-xs text-[#535A56]">
                      Drag slider left / right
                    </span>
                  </div>
                  <div className="mx-auto max-w-md">
                    <BeforeAfterSlider
                      beforeImage={customerPhoto || selectedProduct.imageUrl}
                      afterImage={tryOnResultUrl || selectedProduct.imageUrl}
                      beforeLabel="Old / Current Photo"
                      afterLabel="New AI Try-On Dress"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ---------------------------------------------------------
                SUB-MODE B: UPLOAD / CAPTURE MY OWN GARMENT (2 Sets: Person + Dress)
               --------------------------------------------------------- */}
            {imageSource === 'own-garment' && tryOnStage === 'browse' && (
              <div className="grid gap-6 border border-[#D8DCD7] bg-white p-6 lg:grid-cols-2">
                {/* Set 1: Customer / Person Photo (Image 1 Identity Authority) */}
                <div className="flex flex-col justify-between border border-[#D8DCD7] bg-[#FAFBF8] p-5">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#7A1428]">
                        Image 1 · Customer Identity
                      </span>
                      <span className="border border-[#D8DCD7] bg-white px-2.5 py-0.5 font-mono text-[10px] font-semibold">
                        REQUIRED
                      </span>
                    </div>
                    <h3 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                      Customer / Person Photo
                    </h3>
                    <p className="mt-1 text-xs text-[#535A56]">
                      Capture the customer standing in front of the PC/TV camera or upload a photo from your device. Face, skin tone, and body proportions are locked from this photo.
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
                            No Customer Photo Yet
                          </p>
                          <p className="mt-1 text-xs">
                            Use the PC/TV camera or upload a person photo below.
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
                      Capture Person via Camera
                    </button>
                    <label className="flex cursor-pointer items-center justify-center gap-2 border border-[#161918] bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#161918]">
                      <Upload className="h-4 w-4" />
                      Upload Person Photo
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
                        Image 2 · Garment Reference
                      </span>
                      <span className="border border-[#D8DCD7] bg-white px-2.5 py-0.5 font-mono text-[10px] font-semibold">
                        REQUIRED
                      </span>
                    </div>
                    <h3 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                      Your Own Saree / Dress Photo
                    </h3>
                    <p className="mt-1 text-xs text-[#535A56]">
                      Hold the garment up to the camera or upload a photo of any saree, salwar, lehenga, kurta, veshti, or shirt (even if worn by a catalogue model — only the dress is extracted).
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
                            No Garment Photo Yet
                          </p>
                          <p className="mt-1 text-xs">
                            Capture the dress with camera or upload a garment photo below.
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
                      Capture Dress via Camera
                    </button>
                    <label className="flex cursor-pointer items-center justify-center gap-2 border border-[#161918] bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#161918]">
                      <Upload className="h-4 w-4" />
                      Upload Dress Photo
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
            garmentPrompt={`Person wearing ${selectedProduct.title}, ${selectedProduct.fabricNote}`}
            garmentTitle={selectedProduct.title}
            selectedProduct={selectedProduct}
            onSelectProduct={setSelectedProduct}
          />
        )}

        {/* =========================================================
            MODE 3: AI CATALOGUE VIDEO (Catalogue-Only on TV -> QR Handoff -> Mobile Video + Go Live)
           ========================================================= */}
        {mode === 'catalogue-video' && (
          <div className="space-y-6">
            {/* Policy Banner: Catalogue-Only on TV */}
            <div className="flex flex-wrap items-center justify-between gap-4 border border-[#D8DCD7] bg-[#FAFBF8] p-5">
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-[#7A1428]">
                  TV AI Catalogue Video · Luxury Showroom Collection
                </p>
                <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                  Select a catalogue look → Capture your photo → Create Diwali image
                </h2>
                <p className="mt-1 text-xs text-[#535A56]">
                  Choose a catalogue garment and capture your photo. Once the Diwali image is ready, scan its QR to create your video privately on your phone.
                </p>
              </div>
              <span className="border border-[#7A1428] bg-[#7A1428]/10 px-3.5 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#7A1428]">
                Diwali Available · 1-Day Mobile QR
              </span>
            </div>

            <div className="tv-video-layout grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              {/* Left: Costly Dress Catalogue Selector + Event Selector */}
              <div className="space-y-4 border border-[#D8DCD7] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D8DCD7] pb-3">
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                      Step 1 · Select Costly Catalogue Dress (With Price in Rs)
                    </p>
                    <h3 className="mt-0.5 font-serif text-xl font-semibold text-[#161918]">
                      Women & Men Luxury Catalogue
                    </h3>
                  </div>
                  <div className="flex border border-[#D8DCD7] bg-[#F4F5F2] p-0.5 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        setGenderFilter('women');
                        setActiveCategory('sarees');
                      }}
                      className={`px-3 py-1.5 ${
                        genderFilter === 'women' ? 'bg-[#7A1428] text-white' : 'text-[#535A56]'
                      }`}
                    >
                      Women
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGenderFilter('men');
                        setActiveCategory('kurta');
                      }}
                      className={`px-3 py-1.5 ${
                        genderFilter === 'men' ? 'bg-[#7A1428] text-white' : 'text-[#535A56]'
                      }`}
                    >
                      Men
                    </button>
                  </div>
                </div>

                {/* Category Tabs */}
                <div className="flex flex-wrap gap-1.5">
                  {filteredCategories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveCategory(cat.id)}
                      className={`border px-3.5 py-1.5 text-xs font-semibold ${
                        activeCategory === cat.id
                          ? 'border-[#161918] bg-[#161918] text-white'
                          : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918]'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* 5 Catalogue Items with Rs Price */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {categoryProducts.map((item) => {
                    const isSelected = selectedProduct.sku === item.sku;
                    return (
                      <button
                        key={item.sku}
                        type="button"
                        onClick={() => {
                          setSelectedProduct(item);
                          setVideoMasterUrl('');
                          setVideoPassQr('');
                          setVideoPassUrl('');
                        }}
                        className={`flex gap-3 border p-3 text-left transition ${
                          isSelected
                            ? 'border-[#7A1428] bg-[#7A1428]/5 ring-1 ring-[#7A1428]'
                            : 'border-[#D8DCD7] bg-[#FAFBF8] hover:border-[#161918]'
                        }`}
                      >
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="h-24 w-20 shrink-0 border border-[#D8DCD7] object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-[10px] font-bold uppercase text-[#7A1428]">
                              {item.sku}
                            </span>
                            <span className="bg-[#161918] px-2 py-0.5 font-mono text-xs font-bold text-[#FAF6EE]">
                              {formatINR(item.price)}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 font-serif text-sm font-semibold text-[#161918]">
                            {item.title}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-[#535A56]">
                            {item.fabricNote}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Festival Event Selector */}
                <div className="border-t border-[#D8DCD7] pt-4">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                    Step 2 · Choose Festival / Celebration Scene
                  </p>
                  <div className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {events.map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        disabled={ev.id !== 'diwali'}
                        onClick={() => setSelectedEventId(ev.id)}
                        className={`border px-2.5 py-2 text-center text-xs font-semibold transition ${
                          selectedEventId === ev.id
                            ? 'border-[#7A1428] bg-[#7A1428] text-white'
                            : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918] opacity-40'
                        }`}
                      >
                        {ev.label}{ev.id !== 'diwali' ? ' · Soon' : ''}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Optional TV Portrait Capture + Mobile QR Code Handoff */}
              <div className="flex flex-col justify-between border border-[#D8DCD7] bg-[#FAFBF8] p-6">
                <div>
                  <div className="flex items-center justify-between border-b border-[#D8DCD7] pb-3">
                    <div>
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                        Step 3 · TV Photo & Mobile QR Handoff
                      </p>
                      <h3 className="mt-0.5 font-serif text-xl font-semibold text-[#161918]">
                        {selectedProduct.title} · {formatINR(selectedProduct.price)}
                      </h3>
                    </div>
                  </div>

                  {/* Optional TV Customer Photo + Festival Master Generation */}
                  <div className="mt-4 border border-[#D8DCD7] bg-white p-4">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#535A56]">
                      Two images for your Diwali look
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="border border-dashed border-[#BFC6BE] bg-[#FAFBF8] p-3">
                        <div className="flex aspect-[3/4] items-center justify-center overflow-hidden bg-[#ECEEE9]">
                          {videoPersonPhoto ? <img src={videoPersonPhoto} alt="Your photo for the Diwali image" className="h-full w-full object-cover" /> : <div className="text-center text-[#535A56]"><User className="mx-auto h-10 w-10" /><span className="mt-2 block text-sm font-semibold">Your photo</span></div>}
                        </div>
                        <p className="mt-2 text-sm font-semibold">01 · Your photo</p>
                      </div>
                      <div className="border border-dashed border-[#BFC6BE] bg-[#FAFBF8] p-3">
                        <div className="aspect-[3/4] overflow-hidden bg-[#ECEEE9]"><img src={selectedProduct.imageUrl} alt={`Selected garment: ${selectedProduct.title}`} className="h-full w-full object-cover" /></div>
                        <p className="mt-2 truncate text-sm font-semibold">02 · {selectedProduct.title}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => openCameraFor('video-person')}
                        className="flex items-center gap-1.5 bg-[#161918] px-3.5 py-2 text-xs font-semibold text-white"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        Capture on TV
                      </button>
                      <label className="flex cursor-pointer items-center gap-1.5 border border-[#161918] bg-white px-3.5 py-2 text-xs font-semibold text-[#161918]">
                        <Upload className="h-3.5 w-3.5" />
                        Upload Photo
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleFileUpload('video-person', e.target.files?.[0])}
                        />
                      </label>
                      {videoPersonPhoto && (
                        <button
                          type="button"
                          disabled={videoGeneratingMaster}
                          onClick={generateCatalogueVideoMasterOnTv}
                          className="flex items-center gap-1.5 bg-[#7A1428] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {videoGeneratingMaster ? (
                            <>
                              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                              Generating Master...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3.5 w-3.5" />
                              Generate Festival Image on TV
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {(videoMasterUrl || videoStatusNote) && (
                      <div className="mt-3 flex items-center gap-3 border-t border-[#D8DCD7] pt-3">
                        {videoMasterUrl && <img src={videoMasterUrl} alt="Generated Diwali image" className="h-28 w-20 border border-[#D8DCD7] object-cover" />}
                        <div className="text-xs text-[#535A56]">
                          <p className="font-semibold text-[#161918]">
                            {videoMasterUrl ? 'Your Diwali image is ready' : 'Image not ready'}
                          </p>
                          <p className="mt-0.5">
                            {videoStatusNote}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* The QR is issued only after the Diwali image succeeds. */}
                  {videoMasterUrl && <div className="mt-4 flex flex-col items-center border border-[#D8DCD7] bg-white p-5 text-center">
                    <span className="bg-[#EBF5EE] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#256B45]">
                      1-Day Valid Mobile QR · Download + Go Live Enabled
                    </span>
                    <h4 className="mt-2 font-serif text-xl font-semibold text-[#161918]">
                      Scan on Mobile to Generate AI Video
                    </h4>
                    <p className="mt-1 max-w-sm text-xs text-[#535A56]">
                      Opens this exact dress (<strong>{selectedProduct.title} · {formatINR(selectedProduct.price)}</strong>) on the customer’s phone to generate the AI Video and choose <strong>Download</strong> or <strong>Go Live on Maharaja TV</strong>.
                    </p>

                    <div className="my-4 border border-[#D8DCD7] bg-[#FAFBF8] p-3">
                      {videoPassCreating ? (
                        <div className="flex h-48 w-48 items-center justify-center">
                          <LoaderCircle className="h-8 w-8 animate-spin text-[#7A1428]" />
                        </div>
                      ) : videoPassQr ? (
                        <img
                          src={videoPassQr}
                          alt="Catalogue Video Mobile QR"
                          className="h-48 w-48 object-contain"
                        />
                      ) : (
                        <div className="flex h-48 w-48 items-center justify-center">
                          <QrCode className="h-10 w-10 text-[#535A56]" />
                        </div>
                      )}
                    </div>

                    <p className="font-mono text-[11px] text-[#535A56]">
                      Pass Code: <strong className="text-[#161918]">{videoPassCode}</strong> · Valid 24 Hours
                    </p>

                    {videoPassUrl && (
                      <a
                        href={videoPassUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1.5 border border-[#161918] bg-[#FAFBF8] px-4 py-2 text-xs font-semibold text-[#161918] hover:bg-[#161918] hover:text-white"
                      >
                        Open Mobile Continuation Link Directly (Laptop Test)
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>}
                </div>
              </div>
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
                  ? 'IMAGE 2 · CAPTURE GARMENT'
                  : `IMAGE 1 · CUSTOMER PHOTO (${selectedProduct.title})`}
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
              Testing on a laptop? Upload a photo directly instead of using the webcam:
            </span>
            <label className="flex cursor-pointer items-center gap-1.5 bg-white px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#161918] hover:bg-[#F4F5F2]">
              <Upload className="h-3.5 w-3.5" />
              Upload Photo from Laptop
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileUpload(cameraTarget, e.target.files?.[0])}
              />
            </label>
          </div>
        </div>
      )}
    </main>
  );
}
