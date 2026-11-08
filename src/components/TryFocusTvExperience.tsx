'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { fetchCatalogueSettings, fetchCompleteCatalogue } from '@/lib/maharaja/catalogue-client';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  LoaderCircle,
  QrCode,
  RefreshCw,
  Shirt,
  Sparkles,
  Upload,
  Video,
  X,
  MoreVertical,
  RotateCcw,
} from 'lucide-react';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import DressLoader from '@/components/DressLoader';
import AudienceCards, { PhotoGuide } from '@/components/AudienceCards';
import { compressImage } from '@/lib/utils/image';
import LucyLiveMirror from '@/components/LucyLiveMirror';
import TvIdleLoop from '@/components/TvIdleLoop';
import TvOfflineNotice from '@/components/TvOfflineNotice';
import TabletVideoHandoff from '@/components/TabletVideoHandoff';
import Link from 'next/link';
import { isLiveMirrorReady } from '@/lib/tryfocus/live-categories';
import PhonePhotoTransfer from '@/components/PhonePhotoTransfer';
import {
  events,
  sampleCatalogue,
  type CatalogueCategoryId,
  type CatalogueAudience,
  type TryFocusProduct,
} from '@/lib/tryfocus/sample-data';
import PhotoConsentNotice from '@/components/PhotoConsentNotice';
import { PageTitle } from '@/components/ui';
import { OWN_GARMENT_TYPES } from '@/lib/tryfocus/garment-types';
import { categoriesFor, type StoreCategoryLists } from '@/lib/tryfocus/store-categories';

type TvMode = 'image-tryon' | 'live-tryon' | 'catalogue-video' | 'gift';
type ImageTryOnSource = 'catalogue' | 'own-garment';
type CatalogueTryOnStage = 'who' | 'source' | 'photo' | 'browse' | 'generating' | 'result';
type VideoStage = 'who' | 'photo' | 'pick' | 'portrait';
type CameraTarget = 'catalogue-person' | 'own-person' | 'own-garment' | 'video-person';
type VideoAudience = CatalogueAudience;

/** Looks a customer can create at once from the store collection. */
const MAX_LOOKS = 3;
const isPersonTarget = (target: CameraTarget) => target !== 'own-garment';
const AUDIENCE_LABELS = { women: 'Women', men: 'Men', boys: 'Boys', girls: 'Girls' } as const;
const PHOTO_GUIDE: [string, string] = ['Take a full-length photo, not a selfie.', 'Stand in good light and face the camera straight.'];
// TryFocus rule: one garment per Try-On, always one piece.
const OUTFIT_GUIDE: [string, string] = ['One garment at a time, not a full set.', 'Hold it up, lay it flat or hang it, the whole piece in the frame, in good light.'];

/**
 * The store screen: the portrait TV, or the tablet (`device="tablet"`), at a different scale.
 * TV, three tabs: Try-On (Store collection or My own outfit), AI Video (pick a piece, take a photo, then a
 * QR makes the video on the phone) and Live Mirror.
 * Tablet, three tabs: Store collection, My own outfit (both Try-On) and AI Video, which only shows the
 * customer's QR; the customer picks the piece and makes the video on their phone.
 */
export default function TryFocusTvExperience({ device = 'tv' }: { device?: 'tv' | 'tablet' }) {
  const isTablet = device === 'tablet';
  const [mode, setMode] = useState<TvMode>('image-tryon');
  const [showLookMenu, setShowLookMenu] = useState(false);
  const [clientName, setClientName] = useState('');
  // Live Mirror and AI Video show only while the store has them (module on and the devices they need on).
  const [liveOn, setLiveOn] = useState(!isTablet);
  const [videoOn, setVideoOn] = useState(true);
  // With Go Live, an idle TV plays recent Go Live videos until someone taps it.
  const [goLiveOn, setGoLiveOn] = useState(false);
  const [idleLoop, setIdleLoop] = useState(false);
  const [catalogueItems, setCatalogueItems] = useState<TryFocusProduct[]>([]);
  // The store's own categories per audience, from its workspace.
  const [categoryLists, setCategoryLists] = useState<StoreCategoryLists>({});

  // Catalogue filtering
  const [genderFilter, setGenderFilter] = useState<CatalogueAudience>('women');
  // Who starts empty for each customer, on Try-On and AI Video alike, until they tap one.
  const [whoChosen, setWhoChosen] = useState(false);
  const [videoWhoChosen, setVideoWhoChosen] = useState(false);
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
    if ((mode === 'live-tryon' && !liveOn) || ((mode === 'catalogue-video' || mode === 'gift') && !videoOn)) setMode('image-tryon');
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
          thumbnailUrl: item.thumbnailUrl,
          garmentReferenceUrl: item.garmentReferenceUrl || item.imageUrl,
          fabricNote: item.fabricNote || 'Store collection',
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
        setCategoryLists(settings.categoryLists);
        if (settings.access) {
          // Live Mirror needs the TV's camera stream; the tablet never runs it.
          setLiveOn(!isTablet && settings.access.modules.live);
          setVideoOn(settings.access.catalogueVideo);
          setGoLiveOn(settings.access.goLive);
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
  }, [isTablet]);

  // Try-On state
  const [imageSource, setImageSource] = useState<ImageTryOnSource>('catalogue');
  const [tryOnStage, setTryOnStage] = useState<CatalogueTryOnStage>('who');
  const [ownGarmentType, setOwnGarmentType] = useState(OWN_GARMENT_TYPES.women[0].id);

  // Photos (Image 1 = Customer identity, Image 2 = Garment reference)
  const [customerPhoto, setCustomerPhoto] = useState<string>('');
  const [ownGarmentPhoto, setOwnGarmentPhoto] = useState<string>('');
  const [tryOnResultUrl, setTryOnResultUrl] = useState<string>('');
  const [tryOnError, setTryOnError] = useState<string>('');
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
  const [selectedEventId] = useState<string>(events[0].id);
  const [videoPersonPhoto, setVideoPersonPhoto] = useState<string>('');
  const [videoMasterUrl, setVideoMasterUrl] = useState<string>('');
  const [videoMasterSessionId, setVideoMasterSessionId] = useState('');
  const [showPortraitMenu, setShowPortraitMenu] = useState(false);
  const [videoGeneratingMaster, setVideoGeneratingMaster] = useState<boolean>(false);
  const [videoPassCreating, setVideoPassCreating] = useState<boolean>(false);
  const generationBusyRef = useRef(false);
  useEffect(() => {
    generationBusyRef.current = tryOnStage === 'generating' || videoGeneratingMaster || videoPassCreating || Object.values(batchProgress).includes('generating');
  }, [tryOnStage, videoGeneratingMaster, videoPassCreating, batchProgress]);
  const [videoPassQr, setVideoPassQr] = useState<string>('');
  const [videoStatusNote, setVideoStatusNote] = useState<string>('');
  const [videoStage, setVideoStage] = useState<VideoStage>('who');
  const [videoCategory, setVideoCategory] = useState<CatalogueCategoryId | ''>('');
  const [portraitRetryUsed, setPortraitRetryUsed] = useState(false);
  const [tvBillSuffixRequired, setTvBillSuffixRequired] = useState(true);
  const [tvBillLast4, setTvBillLast4] = useState('');
  const [tvBillEntered, setTvBillEntered] = useState(false);

  const filteredCategories = categoriesFor(categoryLists, genderFilter);
  // A category the store removed (or one this audience lacks) moves to the store's first category with pieces.
  useEffect(() => {
    if (filteredCategories.some((cat) => cat.id === activeCategory)) return;
    const next = filteredCategories.find((cat) => catalogueItems.some((item) => item.category === cat.id)) || filteredCategories[0];
    if (next) setActiveCategory(next.id);
  }, [filteredCategories, activeCategory, catalogueItems]);
  const browseProducts = catalogueItems.filter((item) => item.gender === genderFilter &&
    (showClientCollection ? item.sku.startsWith('MAH-')
      : showNewArrivals ? (genderFilter === 'women' || genderFilter === 'men') && item.badge === 'NEW ARRIVAL'
        : item.category === activeCategory));
  const TV_PAGE_SIZE = 24;
  const cataloguePageCount = Math.max(1, Math.ceil(browseProducts.length / TV_PAGE_SIZE));
  const visibleBrowseProducts = browseProducts.slice(cataloguePage * TV_PAGE_SIZE, (cataloguePage + 1) * TV_PAGE_SIZE);
  // AI Video uses only the pieces the store switched on for it.
  const videoAudienceProducts = catalogueItems.filter((item) => item.price > 0 && (item.eligibleForVideo === true || item.sku.startsWith('TF-') || item.sku.startsWith('8IC') || item.sku.startsWith('silk-')) && item.gender === videoAudience);
  const videoCategories = categoriesFor(categoryLists, videoAudience).filter((cat) => videoAudienceProducts.some((item) => item.category === cat.id));
  const activeVideoCategory = videoCategories.some((cat) => cat.id === videoCategory) ? videoCategory : videoCategories[0]?.id || '';
  const videoBrowseProducts = videoAudienceProducts.filter((item) => !activeVideoCategory || item.category === activeVideoCategory);
  const videoPageCount = Math.max(1, Math.ceil(videoBrowseProducts.length / TV_PAGE_SIZE));
  const safeVideoPage = Math.min(cataloguePage, Math.max(0, videoPageCount - 1));
  const visibleVideoProducts = videoBrowseProducts.slice(safeVideoPage * TV_PAGE_SIZE, (safeVideoPage + 1) * TV_PAGE_SIZE);

  function selectGender(gender: CatalogueAudience) {
    if (gender === genderFilter) return;
    setGenderFilter(gender);
    // The first category, in the shared order, that has pieces in this store.
    const ordered = categoriesFor(categoryLists, gender);
    setActiveCategory((ordered.find((cat) => catalogueItems.some((item) => item.category === cat.id)) || ordered[0]).id);
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

  // Each audience has its own outfit types; keep the own-outfit choice valid when the audience changes.
  useEffect(() => { setOwnGarmentType(OWN_GARMENT_TYPES[genderFilter][0].id); }, [genderFilter]);

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
      setTryOnStage(customerPhoto ? 'browse' : 'who');
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
      if (!videoMasterUrl) setVideoStage('who');
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
      setVideoStatusNote('');
    }
  }

  function toggleLook(product: TryFocusProduct) {
    const now = Date.now();
    if (lastLookTouchRef.current?.sku === product.sku && now - lastLookTouchRef.current.at < 500) return;
    lastLookTouchRef.current = { sku: product.sku, at: now };
    setSelectedLooks((current) => {
      if (current.some((item) => item.sku === product.sku)) return current.filter((item) => item.sku !== product.sku);
      // Picks can come from any category of the chosen Who (shirt, veshti, kurta…); each is its own look.
      if (current.length >= MAX_LOOKS) return current;
      return [...current, product];
    });
  }

  /** Store collection or own outfit: the camera opens full screen straight away for the customer's photo. */
  function chooseTryOnSource(source: ImageTryOnSource) {
    setImageSource(source);
    setTryOnError('');
    if (customerPhoto) {
      setTryOnStage('browse');
      if (source === 'own-garment' && !ownGarmentPhoto) void openCameraFor('own-garment');
      return;
    }
    setTryOnStage('photo');
    void openCameraFor(source === 'own-garment' ? 'own-person' : 'catalogue-person');
  }

  /** Tablet: the Store collection and My own outfit tabs are both Try-On, with the source already chosen. */
  function openTabletTryOn(source: ImageTryOnSource) {
    navigateTo('image-tryon');
    setImageSource(source);
    setTryOnError('');
    if (customerPhoto) {
      setTryOnStage('browse');
      if (source === 'own-garment' && !ownGarmentPhoto) void openCameraFor('own-garment');
    } else {
      setTryOnStage('who');
    }
  }

  /**
   * After the photo. TV: Store collection or My own outfit comes next (Who → photo → source → outfits).
   * Tablet (the tab chose the source): the store collection opens, or the camera for the own outfit.
   */
  function continueFromPhoto() {
    if (!isTablet) { setTryOnStage('source'); return; }
    setTryOnStage('browse');
    if (imageSource === 'own-garment' && !ownGarmentPhoto) void openCameraFor('own-garment');
  }

  /** AI Video: who it is for, then the camera (a photo already taken here is reused). */
  function chooseVideoAudience(audience: VideoAudience) {
    batchRunRef.current += 1;
    if (audience !== videoAudience) {
      setVideoAudience(audience);
      setVideoCategory('');
      setVideoGuardianConsent(false);
    }
    setCataloguePage(0);
    setVideoMasterUrl('');
    setVideoMasterSessionId('');
    setVideoPassQr('');
    setVideoStatusNote('');
    setPortraitRetryUsed(false);
    const first = catalogueItems.find((item) => item.price > 0 && (item.eligibleForVideo || item.sku.startsWith('TF-') || item.sku.startsWith('8IC') || item.sku.startsWith('silk-')) && item.gender === audience);
    if (first) setSelectedProduct(first);
    setVideoStage('photo');
    if (!videoPersonPhoto) void openCameraFor('video-person');
  }

  function chooseVideoPiece(item: TryFocusProduct) {
    setSelectedProduct(item);
    setVideoMasterUrl('');
    setVideoMasterSessionId('');
    setVideoPassQr('');
    setPortraitRetryUsed(false);
  }

  async function runCatalogueBatch(personImg: string) {
    if (!personImg) {
      setTryOnError('Please add your photo first.');
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
            surface: device,
            templateId: product.gender === 'boys' ? 'boy' : product.gender === 'girls' ? 'girl' : product.gender,
            guardianProcessingConsent: tryOnGuardianConsent,
            catalogueProductId: product.sku,
            catalogueProductTitle: product.title,
            catalogueProductCategory: product.category,
            garmentType: product.garmentType,
            garmentTypeConfirmed: true,
            processingConsent: true,
            consentVersion: '2026-11-privacy-v4',
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
    setHandoffStatus('Preparing your QR…');
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
        body: JSON.stringify({ looks: handoffLooks, source: device }),
      });
      const data = await response.json();
      if (!response.ok || !data.token) throw new Error(data.error || 'Mobile handoff unavailable');
      const url = `${window.location.origin}/maharaja/looks/${data.token}`;
      const qr = await QRCode.toDataURL(url, { width: 260, margin: 1, color: { dark: '#161918', light: '#FAFBF8' } });
      if (runId !== batchRunRef.current) return;
      setTryOnMobileQr(qr);
      setHandoffStatus('Scan to save your looks on your phone. The link works for 1 hour.');
    } catch (error) {
      if (runId !== batchRunRef.current) return;
      setHandoffStatus(error instanceof Error ? error.message : 'Mobile handoff unavailable');
    }
  }

  // Two or more store looks: shown full size one at a time, swiped through.
  const multiLook = imageSource === 'catalogue' && selectedLooks.length > 1;

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
      const qr = await QRCode.toDataURL(passLink, {
        width: 280,
        margin: 1,
        color: { dark: '#161918', light: '#FAFBF8' },
      });
      if (runId !== batchRunRef.current) return;
      setVideoPassQr(qr);
    } catch (error) {
      if (runId !== batchRunRef.current) return;
      setVideoPassQr('');
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
    setTryOnStage('generating');

    const sessionId = `tv_tryon_${Date.now()}`;
    const runId = ++batchRunRef.current;
    const targetProduct = product || selectedProduct;
    const ownType = !product && imageSource === 'own-garment'
      ? OWN_GARMENT_TYPES[genderFilter].find((type) => type.id === ownGarmentType) || OWN_GARMENT_TYPES[genderFilter][0]
      : null;

    try {
      const res = await fetch('/api/ai/master-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          service: 'try-on',
          surface: device,
          templateId: genderFilter === 'boys' ? 'boy' : genderFilter === 'girls' ? 'girl' : genderFilter,
          guardianProcessingConsent: tryOnGuardianConsent,
          catalogueProductId: ownType ? `OWN-${Date.now().toString().slice(-6)}` : targetProduct.sku,
          catalogueProductTitle: ownType ? `Customer ${ownType.label}` : targetProduct.title,
          catalogueProductCategory: ownType ? undefined : targetProduct.category,
          garmentType: ownType ? ownType.id : targetProduct.garmentType,
          garmentTypeConfirmed: true,
          processingConsent: true,
          consentVersion: '2026-11-privacy-v4',
          // Strict reference order: Image 1 = Customer Identity, Image 2 = Garment Reference
          personPhoto: personImg,
          garmentPhotos: [garmentImg],
          garmentRoles: ['Primary Garment Reference'],
          garmentAnalysis: ownType ? `Customer's own ${ownType.label}` : `${targetProduct.title} (${targetProduct.fabricNote})`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (runId !== batchRunRef.current) return;
      if (res.ok && data?.masterImageUrl) {
        setTryOnResultUrl(data.masterImageUrl);
        setTryOnStage('result');
        setTryOnMobileQr('');
        setHandoffStatus('Your look is ready. Tap Show QR to get it on your phone.');
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
    setVideoStage('portrait');
    setVideoMasterUrl('');
    setVideoPassQr('');
    const runId = ++batchRunRef.current;
    setVideoStatusNote('Creating your portrait…');
    const sessionId = `tv_vidmaster_${Date.now()}`;
    const conceptId = selectedProduct.gender === 'men' ? 'men-heritage-passage' : selectedProduct.gender === 'boys' ? 'boy-heritage-entrance' : selectedProduct.gender === 'girls' ? 'girl-garden-lights' : 'women-golden-courtyard';

    try {
      const res = await fetch('/api/ai/master-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          service: 'ai-video',
          surface: device,
          eventId: selectedEventId,
          templateId: selectedProduct.gender === 'boys' ? 'boy' : selectedProduct.gender === 'girls' ? 'girl' : selectedProduct.gender,
          guardianProcessingConsent: selectedProduct.gender === 'boys' || selectedProduct.gender === 'girls' ? videoGuardianConsent : undefined,
          conceptId,
          garmentType: selectedProduct.garmentType,
          garmentTypeConfirmed: true,
          processingConsent: true,
          consentVersion: '2026-11-privacy-v4',
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
      setVideoStatusNote('Your portrait is ready. Scan the QR to make your video on your phone.');
      // The QR appears with the portrait; the video itself is made on the customer's phone.
      void createCatalogueVideoPass(selectedProduct, selectedEventId, generatedUrl, data.sessionId);
    } catch (error) {
      if (runId !== batchRunRef.current) return;
      setVideoStatusNote(error instanceof Error ? error.message : 'Your portrait could not be created. Please try again.');
    } finally {
      if (runId === batchRunRef.current) setVideoGeneratingMaster(false);
    }
  }

  /** The portrait's ⋯ menu: one more try with the same piece. */
  function retryPortrait() {
    if (portraitRetryUsed) return;
    setPortraitRetryUsed(true);
    void generateCatalogueVideoMasterOnTv();
  }

  /** Try-On from the very beginning for this customer; the tablet keeps its tab (store or own outfit). */
  function restartTryOn() {
    const source = imageSource;
    resetAllSession();
    setImageSource(source);
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
    setTryOnStage('who');
    setWhoChosen(false);
    setVideoWhoChosen(false);
    setOwnGarmentType(OWN_GARMENT_TYPES.women[0].id);
    setVideoStage('who');
    setVideoCategory('');
    setPortraitRetryUsed(false);
    setVideoPersonPhoto('');
    setVideoMasterUrl('');
    setVideoPassQr('');
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
        else { resetAllSession(); setIdleLoop(true); }
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

  // One step back, in place of a progress bar. The tablet's tab already chose the source, so its photo
  // step goes back to Who.
  const tryOnBack = tryOnStage === 'source' ? () => setTryOnStage('photo')
    : tryOnStage === 'photo' ? () => setTryOnStage('who')
    : tryOnStage === 'browse' ? () => setTryOnStage(isTablet ? 'photo' : 'source')
    : null;
  const videoBack = videoStage === 'photo' ? () => setVideoStage('who')
    : videoStage === 'pick' ? () => setVideoStage('photo')
    : null;

  return (
    <main className="tv-kiosk min-h-screen bg-[#F4F5F2] text-ink">
      {idleLoop && goLiveOn && !isTablet && <TvIdleLoop clientName={clientName} onWake={() => setIdleLoop(false)} />}
      <TvOfflineNotice />
      <header className="tv-main-header sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur-md">
        <div className="tv-main-brand mx-auto flex max-w-[1080px] items-center justify-between gap-4 px-8 pb-4 pt-5">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white">{clientName.replace(/^The\s+/i, '').charAt(0) || 'T'}</span>
            <div className="min-w-0">
              <h1 className="truncate text-[28px] font-bold text-ink">{clientName}</h1>
              <p className="text-base text-muted">See any outfit on you in seconds</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isTablet && <Link href="/maharaja/workspace" className="flex min-h-12 items-center rounded-xl px-3 text-base font-semibold text-muted hover:text-ink">Workspace</Link>}
            {/* On the tablet's AI Video tab, New customer sits under the QR and makes the next customer's QR. */}
            {!(isTablet && mode === 'gift') && <button type="button" onClick={resetAllSession} className="tv-end-session tf-btn tf-btn-secondary shrink-0 !min-h-14 px-6 text-base">{isTablet ? 'New customer' : 'Start over'}</button>}
          </div>
        </div>
        {isTablet ? (
          <nav className={`tv-mode-nav mx-auto grid max-w-[1080px] gap-2 px-8 ${videoOn ? 'grid-cols-3' : 'grid-cols-2'}`} aria-label="Choose an experience">
            <button type="button" aria-current={mode === 'image-tryon' && imageSource === 'catalogue' ? 'page' : undefined} onClick={() => openTabletTryOn('catalogue')} className={`tv-mode-button ${mode === 'image-tryon' && imageSource === 'catalogue' ? 'is-active' : ''}`}>
              <Sparkles className="h-6 w-6" /><span>Store collection</span>
            </button>
            <button type="button" aria-current={mode === 'image-tryon' && imageSource === 'own-garment' ? 'page' : undefined} onClick={() => openTabletTryOn('own-garment')} className={`tv-mode-button ${mode === 'image-tryon' && imageSource === 'own-garment' ? 'is-active' : ''}`}>
              <Shirt className="h-6 w-6" /><span>My own outfit</span>
            </button>
            {videoOn && <button type="button" aria-current={mode === 'gift' ? 'page' : undefined} onClick={() => navigateTo('gift')} className={`tv-mode-button ${mode === 'gift' ? 'is-active' : ''}`}>
              <QrCode className="h-6 w-6" /><span>AI Video</span>
            </button>}
          </nav>
        ) : (
          <nav className={`tv-mode-nav mx-auto grid max-w-[1080px] gap-2 px-8 ${['grid-cols-1', 'grid-cols-2', 'grid-cols-3'][[true, videoOn, liveOn].filter(Boolean).length - 1]}`} aria-label="Choose an experience">
            <button type="button" aria-current={mode === 'image-tryon' ? 'page' : undefined} onClick={() => navigateTo('image-tryon')} className={`tv-mode-button ${mode === 'image-tryon' ? 'is-active' : ''}`}>
              <Sparkles className="h-6 w-6" /><span>Try-On</span>
            </button>
            {videoOn && <button type="button" aria-current={mode === 'catalogue-video' ? 'page' : undefined} onClick={() => navigateTo('catalogue-video')} className={`tv-mode-button ${mode === 'catalogue-video' ? 'is-active' : ''}`}>
              <Video className="h-6 w-6" /><span>AI Video</span>
            </button>}
            {liveOn && <button type="button" aria-current={mode === 'live-tryon' ? 'page' : undefined} onClick={() => navigateTo('live-tryon')} className={`tv-mode-button ${mode === 'live-tryon' ? 'is-active' : ''}`}>
              <Camera className="h-6 w-6" /><span>Live Mirror</span>
            </button>}
          </nav>
        )}
      </header>

      <div className="tv-kiosk-content mx-auto max-w-[1920px] px-5 py-6 sm:px-8">
        {/* =========================================================
            MODE 1: TRY-ON (store collection or own outfit)
           ========================================================= */}
        {mode === 'image-tryon' && (
          <div className="space-y-6">
            {tryOnBack && <BackButton onClick={tryOnBack} />}
            {tryOnStage === 'who' && (
              <div className={`flex flex-col gap-6 ${isTablet ? '' : 'tv-who-screen min-h-[calc(100dvh-240px)]'}`}>
                <PageTitle size="lg" title="Who is it for?" subtitle="Tap one to start." />
                <AudienceCards
                  size="lg"
                  value={whoChosen ? genderFilter : null}
                  onChange={(audience) => { setWhoChosen(true); selectGender(audience); if (isTablet) chooseTryOnSource(imageSource); else if (customerPhoto) setTryOnStage('source'); else { setTryOnStage('photo'); void openCameraFor('catalogue-person'); } }}
                  labels={AUDIENCE_LABELS}
                />
                <PhotoGuide size="lg" lines={PHOTO_GUIDE} />
                {!isTablet && <StoreLogoBand clientName={clientName} />}
              </div>
            )}

            {tryOnStage === 'source' && (
              <div className="flex flex-col gap-6">
                <PageTitle size="lg" title="What would you like to try?" subtitle="A piece from our collection, or a garment you brought." />
                <div className="tv-source-cards grid gap-5 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => chooseTryOnSource('catalogue')}
                    className="tv-source-card group flex flex-col overflow-hidden rounded-3xl border border-line bg-white text-left shadow-sm transition hover:border-ink"
                  >
                    <span className="grid min-h-0 flex-1 grid-cols-3 gap-1 overflow-hidden bg-[#F1EEE9] p-1">
                      {(catalogueItems.length ? catalogueItems : sampleCatalogue).filter((item) => item.gender === genderFilter).slice(0, 3).map((item) => (
                        <img key={item.sku} src={item.thumbnailUrl || item.imageUrl} alt="" className="h-full w-full rounded-2xl object-cover" />
                      ))}
                    </span>
                    <span className="flex items-center justify-between gap-4 p-7">
                      <span>
                        <span className="block text-4xl font-bold text-ink">Store collection</span>
                        <span className="mt-2 block text-xl text-muted">Try up to {MAX_LOOKS} outfits from this store</span>
                      </span>
                      <ArrowRight className="h-9 w-9 shrink-0 text-ink transition group-hover:translate-x-1" />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseTryOnSource('own-garment')}
                    className="tv-source-card group flex flex-col overflow-hidden rounded-3xl border border-line bg-white text-left shadow-sm transition hover:border-ink"
                  >
                    <span className="flex flex-1 items-center justify-center bg-canvas">
                      <span className="flex h-40 w-40 items-center justify-center rounded-full bg-white text-ink shadow-sm"><Shirt className="h-20 w-20" strokeWidth={1.4} /></span>
                    </span>
                    <span className="flex items-center justify-between gap-4 p-7">
                      <span>
                        <span className="block text-4xl font-bold text-ink">My own outfit</span>
                        <span className="mt-2 block text-xl text-muted">Use a garment you already have</span>
                      </span>
                      <ArrowRight className="h-9 w-9 shrink-0 text-ink transition group-hover:translate-x-1" />
                    </span>
                  </button>
                </div>
              </div>
            )}

            {tryOnStage === 'photo' && (
              <div className="tv-photo-step flex flex-col gap-6">
                <PageTitle
                  size="lg"
                  title={customerPhoto ? 'Looking good?' : 'Your photo'}
                  subtitle={customerPhoto ? 'Check that your face and full outfit are clear.' : 'Stand in front of the screen, or send a photo from your phone.'}
                />

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
                        onClick={() => void openCameraFor(imageSource === 'own-garment' ? 'own-person' : 'catalogue-person')}
                        className="tv-photo-action group flex min-h-[220px] flex-col items-center justify-center gap-6 rounded-3xl bg-ink p-8 text-center text-white shadow-lg transition hover:bg-black"
                      >
                        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 transition group-hover:scale-105">
                          <Camera className="h-12 w-12" />
                        </span>
                        <span>
                          <span className="block text-4xl font-bold">Open the camera</span>
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
                    <PhotoConsentNotice kind="try-on" large />
                  </>
                ) : (
                  <div className="tf-card mx-auto w-full max-w-2xl p-7 text-center">
                    <img
                      src={customerPhoto}
                      alt="Your photo"
                      className="mx-auto aspect-[9/16] h-[820px] max-h-[60vh] max-w-full rounded-2xl object-cover"
                    />
                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      <button type="button" onClick={() => { setCustomerPhoto(''); void openCameraFor(imageSource === 'own-garment' ? 'own-person' : 'catalogue-person'); }} className="tf-btn tf-btn-secondary !min-h-16 text-lg">Retake</button>
                      <button
                        type="button"
                        disabled={(genderFilter === 'boys' || genderFilter === 'girls') && !tryOnGuardianConsent}
                        onClick={continueFromPhoto}
                        className="tf-btn tf-btn-primary !min-h-16 text-lg"
                      >
                        {!isTablet ? 'Continue' : imageSource === 'own-garment' ? 'Photograph my outfit' : 'Pick outfits'} <ArrowRight className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tryOnStage === 'browse' && imageSource === 'catalogue' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <PageTitle size="lg" title={`Pick up to ${MAX_LOOKS} outfits`} subtitle="From any category. We create a look for each one at the same time." />
                  {customerPhoto && (
                    <button type="button" onClick={() => setTryOnStage('photo')} className="group flex shrink-0 items-center gap-3 rounded-2xl border border-line bg-white p-2 pr-4 text-left hover:border-ink">
                      <img src={customerPhoto} alt="Your photo" className="aspect-[9/16] h-16 rounded-lg object-cover" />
                      <span className="text-sm font-semibold text-muted group-hover:text-ink">Change<br />photo</span>
                    </button>
                  )}
                </div>

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
                        const full = selectedLooks.length >= MAX_LOOKS && !picked;
                        return (
                          <button
                            key={item.sku}
                            type="button"
                            aria-pressed={picked}
                            aria-label={`${picked ? 'Remove' : 'Select'} ${item.title}`}
                            disabled={full}
                            onClick={() => toggleLook(item)}
                            className={`tv-product-card group relative flex flex-col overflow-hidden rounded-2xl border bg-white text-left transition disabled:opacity-50 ${picked ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-line-strong'}`}
                          >
                            <span className="tv-product-image relative block w-full overflow-hidden">
                              <img src={item.thumbnailUrl || item.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain" />
                              <span className={`absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold shadow ${picked ? 'bg-ink text-white' : 'bg-white/90 text-ink'}`}>
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
                    {browseProducts.length === 0 && <div className="tf-card p-10 text-center"><p className="text-2xl font-bold">No pieces here yet</p><p className="mt-2 text-muted">Choose another category or ask our staff.</p></div>}
                    {cataloguePageCount > 1 && (
                      <div className="tv-catalogue-pagination flex items-center justify-between gap-4">
                        <button type="button" disabled={cataloguePage === 0} onClick={() => turnCataloguePage(cataloguePage - 1)} className="tf-btn tf-btn-secondary !min-h-14 px-6 text-lg">← Previous</button>
                        <span className="text-lg font-semibold text-muted">Page {cataloguePage + 1} of {cataloguePageCount}</span>
                        <button type="button" disabled={cataloguePage >= cataloguePageCount - 1} onClick={() => turnCataloguePage(cataloguePage + 1)} className="tf-btn tf-btn-secondary !min-h-14 px-6 text-lg">Next →</button>
                      </div>
                    )}
                    {tryOnError && <p className="rounded-xl bg-danger-soft p-4 text-lg text-danger">{tryOnError}</p>}
                  </div>

                  <div className="tv-selection-bar fixed left-1/2 z-30 flex max-w-[1016px] -translate-x-1/2 items-center justify-between gap-4 backdrop-blur">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex -space-x-3">
                        {selectedLooks.map((look) => <img key={look.sku} src={look.thumbnailUrl || look.imageUrl} alt="" className="h-14 w-11 rounded-lg border-2 border-white bg-canvas object-cover" />)}
                      </div>
                      <p className="text-lg font-semibold">{selectedLooks.length ? `${selectedLooks.length} of ${MAX_LOOKS} selected` : 'Tap outfits to select'}</p>
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
              </div>
            )}

            {tryOnStage === 'browse' && imageSource === 'own-garment' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <PageTitle size="lg" title="Your outfit" subtitle="Photograph one garment with the camera, then tell us what it is." />
                  {customerPhoto && (
                    <button type="button" onClick={() => setTryOnStage('photo')} className="group flex shrink-0 items-center gap-3 rounded-2xl border border-line bg-white p-2 pr-4 text-left hover:border-ink">
                      <img src={customerPhoto} alt="Your photo" className="aspect-[9/16] h-16 rounded-lg object-cover" />
                      <span className="text-sm font-semibold text-muted group-hover:text-ink">Change<br />photo</span>
                    </button>
                  )}
                </div>
                <PhotoGuide size="lg" lines={OUTFIT_GUIDE} />
                <div className="tv-catalogue-shell grid gap-5">
                  <aside className="tv-category-sidebar tf-card p-3" aria-label="What is your outfit">
                    <p className="px-2 pb-2 text-base font-semibold text-muted">What is it?</p>
                    <div className="tv-kiosk-filters flex flex-col gap-1">
                      {OWN_GARMENT_TYPES[genderFilter].map((type) => (
                        <button key={type.id} type="button" aria-pressed={ownGarmentType === type.id} onClick={() => setOwnGarmentType(type.id)} className="rounded-xl border px-4 text-left font-semibold">
                          {type.label}
                        </button>
                      ))}
                    </div>
                  </aside>
                  <div className="min-w-0 space-y-4">
                    <div className="tf-card flex flex-col items-center gap-6 p-8 text-center">
                      {ownGarmentPhoto
                        ? <img src={ownGarmentPhoto} alt="Your outfit" className="aspect-[3/4] h-[560px] max-w-full rounded-2xl bg-canvas object-contain" />
                        : <span className="flex aspect-[3/4] h-[560px] max-w-full flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-line-strong bg-canvas p-8 text-muted"><Shirt className="h-16 w-16" strokeWidth={1.4} /><span className="text-xl">Hold one garment up to the camera, or lay it flat</span></span>}
                      <button type="button" onClick={() => void openCameraFor('own-garment')} className="tf-btn tf-btn-dark !min-h-16 w-full max-w-md text-lg"><Camera className="h-5 w-5" /> {ownGarmentPhoto ? 'Retake' : 'Open the camera'}</button>
                    </div>
                    {tryOnError && <p className="rounded-xl bg-danger-soft p-4 text-lg text-danger">{tryOnError}</p>}
                  </div>
                  <div className="tv-selection-bar fixed left-1/2 z-30 flex max-w-[1016px] -translate-x-1/2 items-center justify-between gap-4 backdrop-blur">
                    <p className="text-lg font-semibold">{ownGarmentPhoto ? OWN_GARMENT_TYPES[genderFilter].find((type) => type.id === ownGarmentType)?.label : 'Photograph your outfit'}</p>
                    <button type="button" disabled={!customerPhoto || !ownGarmentPhoto} onClick={() => void runTryOnGeneration(customerPhoto, ownGarmentPhoto)} className="tf-btn tf-btn-primary !min-h-16 shrink-0 px-8 text-lg">
                      <Sparkles className="h-5 w-5" /> Create my look
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tryOnStage === 'generating' && (
              <section className="space-y-6" aria-live="polite">
                <PageTitle size="lg" title={imageSource === 'own-garment' ? 'Creating your look' : 'Creating your looks'} subtitle="Each look appears as soon as it is ready. This takes about 20 seconds." />
                <div className="tv-generated-looks grid gap-4">
                  {(imageSource === 'own-garment' ? [] : selectedLooks.length ? selectedLooks : [selectedProduct]).map((look) => {
                    const state = batchProgress[look.sku];
                    return (
                      <div key={look.sku} className="tf-card overflow-hidden">
                        <div className="relative aspect-[9/16] bg-canvas">
                          <img src={look.imageUrl} alt="" className={`h-full w-full object-contain ${state === 'generating' ? 'opacity-40' : ''}`} />
                          <span className="absolute inset-0 flex items-center justify-center">
                            {state === 'failed' ? <span className="rounded-full bg-danger px-3 py-1 text-sm font-semibold text-white">Not created</span> : state === 'generating' ? <span className="rounded-2xl bg-white/85 p-3"><DressLoader size="sm" caption={false} /></span> : null}
                          </span>
                        </div>
                        <p className="truncate p-3 text-sm font-semibold">{look.title}</p>
                      </div>
                    );
                  })}
                </div>
                {imageSource === 'own-garment' && <div className="flex justify-center py-16"><DressLoader size="lg" /></div>}
              </section>
            )}

            {tryOnStage === 'result' && (
              <section className="mx-auto max-w-[900px] space-y-4" aria-label="Your looks">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-4xl font-bold">{imageSource === 'own-garment' ? 'Your look' : 'Your looks'}</h2>
                    {imageSource === 'catalogue' && batchDone < selectedLooks.length && <p className="text-base text-muted">{batchDone} of {selectedLooks.length} finished. More looks are on their way.</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    {imageSource === 'catalogue' && generatedLooks.length > 1 && <span className="text-lg font-semibold">Look {activeLookIndex + 1} of {selectedLooks.length}</span>}
                    {/* Retry lives in the header ⋯ menu of the screen where the looks were made. */}
                    <div className="relative">
                      <button type="button" aria-label="Look options" aria-expanded={showLookMenu} onClick={() => setShowLookMenu((open) => !open)} className="flex min-h-16 min-w-16 items-center justify-center rounded-xl border border-line-strong bg-white">
                        <MoreVertical className="h-7 w-7" />
                      </button>
                      {showLookMenu && (
                        <div className="absolute right-0 top-[4.5rem] z-40 w-80 overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
                          {/* A retry always starts fresh: new Who, outfit and photos, nothing kept from this try. */}
                          <button type="button" onClick={() => { setShowLookMenu(false); restartTryOn(); }} className="flex min-h-16 w-full items-center gap-3 px-5 text-left text-lg font-semibold">
                            <RotateCcw className="h-5 w-5" /> Start again
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl overflow-hidden border border-line bg-white" onTouchStart={(event) => { swipeStartX.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => {
                  // With several looks a swipe moves between them; a single look keeps the before/after slider,
                  // which uses horizontal drags itself.
                  if (swipeStartX.current === null || !multiLook) return;
                  const distance = (event.changedTouches[0]?.clientX ?? swipeStartX.current) - swipeStartX.current;
                  swipeStartX.current = null;
                  if (Math.abs(distance) > 60) moveGeneratedLook(distance < 0 ? 1 : -1);
                }}>
                  {customerPhoto && tryOnResultUrl && !multiLook ? (
                    <div className="bg-ink px-4 pb-4 pt-3">
                      <BeforeAfterSlider
                        key={`${activeLookIndex}-${tryOnResultUrl.slice(-24)}`}
                        before={customerPhoto}
                        after={tryOnResultUrl}
                        beforeLabel="Your photo"
                        afterLabel={imageSource === 'own-garment' ? 'Your outfit' : 'New look'}
                        frameClassName="mx-auto aspect-[9/16] w-full max-w-[506px]"
                        dark
                      />
                    </div>
                  ) : (
                    <div className="bg-[#161918]">
                      <img src={tryOnResultUrl || selectedProduct.imageUrl} alt={selectedProduct.title} draggable={false} className="mx-auto aspect-[9/16] max-h-[900px] w-full object-contain" />
                    </div>
                  )}
                  <p className="border-t border-line bg-white px-6 py-4 text-2xl font-bold text-ink">{imageSource === 'own-garment' ? 'Your outfit' : selectedProduct.title}</p>
                </div>
                {imageSource === 'catalogue' && selectedLooks.length > 1 && <div className="flex items-center justify-between gap-4">
                  <button type="button" onClick={() => moveGeneratedLook(-1)} className="tf-btn tf-btn-secondary !min-h-14 min-w-40 text-lg">← Previous</button>
                  <p className="text-center text-sm text-muted">Swipe to see your looks, or tap one below</p>
                  <button type="button" onClick={() => moveGeneratedLook(1)} className="tf-btn tf-btn-secondary !min-h-14 min-w-40 text-lg">Next →</button>
                </div>}
                {imageSource === 'catalogue' && selectedLooks.length > 1 && (
                  <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Your generated looks">
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
                          className={`relative aspect-[9/16] overflow-hidden rounded-xl border-2 bg-canvas ${index === activeLookIndex ? 'border-ink': 'border-transparent'} disabled:opacity-60`}
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
                  <div className="flex-1"><h3 className="text-2xl font-bold">Take your {imageSource === 'own-garment' ? 'look' : 'looks'} home</h3><p className="mt-1 text-base text-muted">Scan this private QR. It works for 1 hour.</p><p className="mt-2 text-sm text-muted">{handoffStatus || (imageSource === 'catalogue' && batchDone < selectedLooks.length ? 'Your QR will appear when all looks finish.' : 'Tap Show QR when you are ready.')}</p></div>
                  {tryOnMobileQr ? <img src={tryOnMobileQr} alt="Scan to save your looks" className="h-44 w-44 object-contain" /> : (
                    <button
                      type="button"
                      disabled={imageSource === 'own-garment' ? !tryOnResultUrl : (batchDone < selectedLooks.length && !generatedLooks.some((look) => look.url))}
                      onClick={() => void createImageHandoff(imageSource === 'own-garment'
                        ? [{ product: { ...selectedProduct, sku: `OWN-${Date.now().toString().slice(-6)}`, title: OWN_GARMENT_TYPES[genderFilter].find((type) => type.id === ownGarmentType)?.label || 'My outfit', gender: genderFilter, garmentType: ownGarmentType as TryFocusProduct['garmentType'], garmentReferenceUrl: ownGarmentPhoto, imageUrl: ownGarmentPhoto }, url: tryOnResultUrl }]
                        : generatedLooks.filter((look) => look.url))}
                      className="tf-btn tf-btn-primary !min-h-20 min-w-56 text-xl"
                    >
                      <QrCode className="h-6 w-6" /> Show QR
                    </button>
                  )}
                </div>
                <button type="button" onClick={resetAllSession} className="tf-btn tf-btn-secondary !min-h-16 w-full text-lg">Done · New customer</button>
              </section>
            )}
          </div>
        )}

        {/* =========================================================
            MODE 2: LIVE MIRROR (pick a catalogue piece -> Start live -> 5-second countdown -> 30 seconds live)
           ========================================================= */}
        {mode === 'live-tryon' && (
          <LucyLiveMirror
            catalogue={catalogueItems.filter(isLiveMirrorReady)}
            garmentPrompt={`Person wearing ${selectedProduct.title}, ${selectedProduct.fabricNote}`}
            garmentTitle={selectedProduct.title}
            selectedProduct={isLiveMirrorReady(selectedProduct) ? selectedProduct : catalogueItems.find(isLiveMirrorReady)}
            onSelectProduct={setSelectedProduct}
            onUsePhotoTryOn={(product) => {
              // Live Mirror could not connect: the same outfit continues as a photo Try-On.
              navigateTo('image-tryon');
              setImageSource('catalogue');
              setGenderFilter(product.gender);
              setActiveCategory(product.category);
              setSelectedProduct(product);
              setSelectedLooks([product]);
              setTryOnStage(customerPhoto ? 'browse' : 'photo');
            }}
          />
        )}

        {/* =========================================================
            MODE 3: AI VIDEO (store collection only): Who -> camera -> one piece -> portrait -> QR to the phone
           ========================================================= */}
        {/* A minimum bill is set: the customer enters the last 4 digits of their bill first (0 = a free gift). */}
        {mode === 'catalogue-video' && !isTablet && tvBillSuffixRequired && !tvBillEntered && (
          <BillDigitsGate value={tvBillLast4} onChange={setTvBillLast4} onContinue={() => setTvBillEntered(true)} action="Continue to AI Video" />
        )}
        {mode === 'catalogue-video' && !isTablet && (!tvBillSuffixRequired || tvBillEntered) && (
          <div className="space-y-6">
            {videoBack && <BackButton onClick={videoBack} />}
            {videoStage === 'who' && (
              <div className="tv-who-screen flex min-h-[calc(100dvh-240px)] flex-col gap-6">
                <PageTitle size="lg" title="Who is the video for?" subtitle="A short AI Video of you in a piece from our collection." />
                <AudienceCards size="lg" value={videoWhoChosen ? videoAudience : null} onChange={(audience) => { setVideoWhoChosen(true); chooseVideoAudience(audience); }} labels={AUDIENCE_LABELS} />
                <PhotoGuide size="lg" lines={PHOTO_GUIDE} />
                <StoreLogoBand clientName={clientName} />
              </div>
            )}

            {videoStage === 'photo' && (
              <div className="flex flex-col gap-6">
                <PageTitle size="lg" title={videoPersonPhoto ? 'Looking good?' : 'Your photo'} subtitle={videoPersonPhoto ? 'Face and full body clear, standing straight.' : 'Stand in front of the screen, or send a photo from your phone.'} />
                {(videoAudience === 'boys' || videoAudience === 'girls') && (
                  <label className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-white p-4 text-lg">
                    <input type="checkbox" checked={videoGuardianConsent} onChange={(event) => setVideoGuardianConsent(event.target.checked)} className="h-6 w-6" />
                    I am the parent or legal guardian and approve using this child’s photo for this video.
                  </label>
                )}
                {videoPersonPhoto ? (
                  <div className="tf-card mx-auto w-full max-w-2xl p-7 text-center">
                    <img src={videoPersonPhoto} alt="Your photo" className="mx-auto aspect-[9/16] h-[820px] max-h-[56vh] max-w-full rounded-2xl object-cover" />
                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      <button type="button" onClick={() => { setVideoPersonPhoto(''); void openCameraFor('video-person'); }} className="tf-btn tf-btn-secondary !min-h-16 text-lg">Retake</button>
                      <button
                        type="button"
                        disabled={(videoAudience === 'boys' || videoAudience === 'girls') && !videoGuardianConsent}
                        onClick={() => setVideoStage('pick')}
                        className="tf-btn tf-btn-primary !min-h-16 text-lg"
                      >
                        Pick a piece <ArrowRight className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="tv-photo-actions grid gap-5 md:grid-cols-2">
                    <button type="button" onClick={() => void openCameraFor('video-person')} className="tv-photo-action flex min-h-[220px] flex-col items-center justify-center gap-6 rounded-3xl bg-ink p-8 text-center text-white shadow-lg">
                      <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10"><Camera className="h-12 w-12" /></span>
                      <span className="block text-4xl font-bold">Open the camera</span>
                    </button>
                    <PhonePhotoTransfer
                      onPhoto={(photo) => applyCapturedPhoto('video-person', photo)}
                      renderTrigger={(open, busy) => (
                        <button type="button" onClick={open} disabled={busy} className="tv-photo-action flex h-full min-h-[220px] w-full flex-col items-center justify-center gap-6 rounded-3xl border border-line bg-white p-8 text-center shadow-sm disabled:opacity-50">
                          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-soft text-brand">{busy ? <LoaderCircle className="h-12 w-12 animate-spin" /> : <QrCode className="h-12 w-12" />}</span>
                          <span className="block text-4xl font-bold text-ink">{busy ? 'Preparing QR…' : 'Use my phone'}</span>
                        </button>
                      )}
                    />
                  </div>
                )}
                <PhotoConsentNotice kind="video" large />
              </div>
            )}

            {videoStage === 'pick' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <PageTitle size="lg" title="Pick a piece for your video" subtitle="From our collection. One piece per video." />
                  {videoPersonPhoto && (
                    <button type="button" onClick={() => setVideoStage('photo')} className="group flex shrink-0 items-center gap-3 rounded-2xl border border-line bg-white p-2 pr-4 text-left hover:border-ink">
                      <img src={videoPersonPhoto} alt="Your photo" className="aspect-[9/16] h-16 rounded-lg object-cover" />
                      <span className="text-sm font-semibold text-muted group-hover:text-ink">Change<br />photo</span>
                    </button>
                  )}
                </div>
                <div className="tv-catalogue-shell grid gap-5">
                  <aside className="tv-category-sidebar tf-card p-3" aria-label="AI Video categories">
                    <div className="tv-kiosk-filters flex flex-col gap-1">
                      {videoCategories.map((cat) => (
                        <button key={cat.id} type="button" aria-pressed={activeVideoCategory === cat.id} onClick={() => { setVideoCategory(cat.id); setCataloguePage(0); }} className="flex items-center justify-between gap-2 rounded-xl border px-4 text-left font-semibold">
                          <span className="truncate">{cat.label}</span>
                          <span className="shrink-0 text-sm font-medium opacity-60">{videoAudienceProducts.filter((item) => item.category === cat.id).length}</span>
                        </button>
                      ))}
                    </div>
                  </aside>
                  <div className="min-w-0 space-y-4">
                    <div className="tv-product-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {visibleVideoProducts.map((item) => {
                        const picked = selectedProduct.sku === item.sku;
                        return (
                          <button key={item.sku} type="button" aria-pressed={picked} onClick={() => chooseVideoPiece(item)} className={`tv-product-card relative flex flex-col overflow-hidden rounded-2xl border bg-white text-left transition ${picked ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-line-strong'}`}>
                            <span className="tv-product-image relative block w-full overflow-hidden">
                              <img src={item.thumbnailUrl || item.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain" />
                              {picked && <span className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink text-white"><CheckCircle2 className="h-6 w-6" /></span>}
                            </span>
                            <span className="block p-3"><span className="line-clamp-2 block text-base font-semibold leading-snug text-ink">{item.title}</span>{item.price > 0 && <span className="mt-1 block text-lg font-bold tabular-nums text-ink">₹{item.price.toLocaleString('en-IN')}</span>}</span>
                          </button>
                        );
                      })}
                    </div>
                    {videoBrowseProducts.length === 0 && <div className="tf-card p-10 text-center"><p className="text-2xl font-bold">No pieces here yet</p><p className="mt-2 text-muted">Ask our staff to switch pieces on for AI Video.</p></div>}
                    {videoPageCount > 1 && (
                      <div className="flex items-center justify-between gap-4">
                        <button type="button" disabled={safeVideoPage <= 0} onClick={() => setCataloguePage(safeVideoPage - 1)} className="tf-btn tf-btn-secondary !min-h-14 px-6 text-lg">← Previous</button>
                        <span className="text-lg font-semibold text-muted">Page {safeVideoPage + 1} of {videoPageCount}</span>
                        <button type="button" disabled={safeVideoPage >= videoPageCount - 1} onClick={() => setCataloguePage(safeVideoPage + 1)} className="tf-btn tf-btn-secondary !min-h-14 px-6 text-lg">Next →</button>
                      </div>
                    )}
                  </div>
                  <div className="tv-selection-bar fixed left-1/2 z-30 flex max-w-[1016px] -translate-x-1/2 items-center justify-between gap-4 backdrop-blur">
                    <div className="flex min-w-0 items-center gap-3">
                      <img src={selectedProduct.thumbnailUrl || selectedProduct.imageUrl} alt="" className="h-14 w-11 rounded-lg border-2 border-white bg-canvas object-cover" />
                      <p className="truncate text-lg font-semibold">{selectedProduct.title}{selectedProduct.price > 0 && <span className="ml-2 tabular-nums">· ₹{selectedProduct.price.toLocaleString('en-IN')}</span>}</p>
                    </div>
                    <button
                      type="button"
                      disabled={!videoPersonPhoto || videoGeneratingMaster || !videoBrowseProducts.some((item) => item.sku === selectedProduct.sku) || ((videoAudience === 'boys' || videoAudience === 'girls') && !videoGuardianConsent)}
                      onClick={() => { setPortraitRetryUsed(false); void generateCatalogueVideoMasterOnTv(); }}
                      className="tf-btn tf-btn-primary !min-h-16 shrink-0 px-8 text-lg"
                    >
                      <Sparkles className="h-5 w-5" /> Create my portrait
                    </button>
                  </div>
                </div>
              </div>
            )}

            {videoStage === 'portrait' && (
              <section className="mx-auto max-w-[900px] space-y-4" aria-live="polite">
                <div className="flex items-center justify-between gap-4">
                  <PageTitle size="lg" title={videoGeneratingMaster ? 'Creating your portrait' : videoMasterUrl ? 'Your portrait' : 'Your portrait'} subtitle={videoGeneratingMaster ? 'About 20 seconds.' : videoStatusNote} />
                  {videoMasterUrl && !videoGeneratingMaster && (
                    <div className="relative">
                      <button type="button" aria-label="Portrait options" aria-expanded={showPortraitMenu} onClick={() => setShowPortraitMenu((open) => !open)} className="flex min-h-16 min-w-16 items-center justify-center rounded-xl border border-line-strong bg-white">
                        <MoreVertical className="h-7 w-7" />
                      </button>
                      {showPortraitMenu && (
                        <div className="absolute right-0 top-[4.5rem] z-40 w-80 overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
                          {!portraitRetryUsed && (
                            <button type="button" onClick={() => { setShowPortraitMenu(false); retryPortrait(); }} className="flex min-h-16 w-full items-center gap-3 px-5 text-left text-lg font-semibold">
                              <RefreshCw className="h-5 w-5" /> Create it again
                            </button>
                          )}
                          <button type="button" onClick={() => { setShowPortraitMenu(false); chooseVideoPiece(selectedProduct); setVideoStage('pick'); }} className="flex min-h-16 w-full items-center gap-3 border-t border-line px-5 text-left text-lg font-semibold">
                            <RotateCcw className="h-5 w-5" /> Choose another piece
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {videoGeneratingMaster ? (
                  <div className="tf-card flex min-h-[420px] flex-col items-center justify-center gap-4 p-8 text-center">
                    <DressLoader size="lg" title={`Dressing you in ${selectedProduct.title}`} />
                  </div>
                ) : videoMasterUrl ? (
                  <div className="grid items-center gap-5 sm:grid-cols-[1fr_auto]">
                    <div className="overflow-hidden rounded-2xl border border-line bg-ink">
                      <img src={videoMasterUrl} alt="Your portrait" className="mx-auto aspect-[9/16] max-h-[60vh] w-full object-contain" />
                    </div>
                    <div className="tf-card flex flex-col items-center gap-3 p-5 text-center">
                      <div className="flex h-60 w-60 items-center justify-center rounded-xl border border-line bg-white p-2">
                        {videoPassQr ? <img src={videoPassQr} alt="Scan to make your AI Video on your phone" className="h-full w-full object-contain" /> : <LoaderCircle className="h-10 w-10 animate-spin text-muted" />}
                      </div>
                      <p className="max-w-[16rem] text-lg font-bold">Scan to make your video on your phone</p>
                      <p className="max-w-[16rem] text-sm text-muted">Then download it, send it on WhatsApp or show it on our Go Live screen. The QR works for 1 day.</p>
                      {!videoPassQr && !videoPassCreating && (
                        <button type="button" onClick={() => void createCatalogueVideoPass(selectedProduct, selectedEventId, videoMasterUrl, videoMasterSessionId)} className="tf-btn tf-btn-secondary !min-h-14 w-full text-base">
                          <QrCode className="h-5 w-5" /> Show the QR again
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="tf-card space-y-4 p-8 text-center">
                    <p className="text-xl">{videoStatusNote || 'Your portrait could not be created.'}</p>
                    <button type="button" onClick={() => void generateCatalogueVideoMasterOnTv()} className="tf-btn tf-btn-primary !min-h-16 px-8 text-lg"><RefreshCw className="h-5 w-5" /> Try again</button>
                  </div>
                )}
                {videoMasterUrl && <button type="button" onClick={resetAllSession} className="tf-btn tf-btn-secondary !min-h-16 w-full text-lg">Done · New customer</button>}
              </section>
            )}
          </div>
        )}

        {mode === 'gift' && isTablet && tvBillSuffixRequired && !tvBillEntered && (
          <BillDigitsGate value={tvBillLast4} onChange={setTvBillLast4} onContinue={() => setTvBillEntered(true)} action="Show my QR" />
        )}
        {mode === 'gift' && isTablet && (!tvBillSuffixRequired || tvBillEntered) && (
          <TabletVideoHandoff
            qrOnly
            autoShow
            billLast4={tvBillSuffixRequired ? tvBillLast4 : undefined}
            onNewCustomer={tvBillSuffixRequired ? () => { setTvBillLast4(''); setTvBillEntered(false); } : undefined}
          />
        )}
      </div>

      {/* =========================================================
          FULL-SCREEN CAMERA. The customer's photo has a QR beside it to send one from the phone instead;
          the outfit photo is taken with the camera only (no QR).
         ========================================================= */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black p-4 text-white sm:p-6" role="dialog" aria-modal="true" aria-label={cameraTarget === 'own-garment' ? 'Photograph your outfit' : 'Take your photo'}>
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">{clientName.replace(/^The\s+/i, '').charAt(0) || 'T'}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white/70">{clientName}</p>
                <p className="text-2xl font-bold">{cameraTarget === 'own-garment' ? 'Your outfit' : 'Your photo'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setCameraOpen(false);
              }}
              className="flex min-h-14 items-center gap-2 rounded-xl border border-white/40 bg-white/10 px-5 text-base font-semibold text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
              Close camera
            </button>
          </div>

          <div className="mx-auto my-4 flex min-h-0 w-full max-w-5xl flex-1 items-center justify-center gap-6">
            {/* The camera feed, locked to the 9:16 portrait the looks are made in. */}
            <div className={`relative flex aspect-[9/16] max-w-full items-center justify-center overflow-hidden rounded-2xl border border-white/30 bg-ink shadow-2xl ${isPersonTarget(cameraTarget) ? 'h-[66vh]' : 'h-[72vh]'}`}>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="h-full w-full object-cover [transform:scaleX(-1)]"
              />

              <div className="pointer-events-none absolute inset-6 rounded-xl border border-dashed border-white/40" />

              <div className="pointer-events-none absolute inset-x-0 top-5 flex justify-center">
                <p className="rounded-full bg-black/70 px-6 py-2 text-center text-lg font-semibold backdrop-blur-md">
                  {cameraTarget === 'own-garment' ? 'Hold the whole outfit in the frame' : 'Step back so your whole body is in the frame'}
                </p>
              </div>

              {countdown !== null && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="tabular-nums text-[160px] font-bold leading-none text-white drop-shadow-lg">{countdown}</span>
                </div>
              )}

              {cameraError && (
                <div className="absolute inset-x-6 bottom-32 rounded-xl bg-black/85 p-4 text-center text-base text-amber-200">
                  <p>{cameraError}</p>
                  <p className="mt-1 text-white/80">{isPersonTarget(cameraTarget) ? 'Use the QR beside the camera to send a photo from your phone.' : 'Choose a photo file below instead.'}</p>
                </div>
              )}

              <div className="absolute inset-x-0 bottom-5 flex items-center justify-center gap-8">
                <button
                  type="button"
                  onClick={triggerCountdownCapture}
                  disabled={countdown !== null}
                  className="flex flex-col items-center"
                  aria-label="Take the photo in 5 seconds"
                >
                  <span className="flex h-[88px] w-[88px] items-center justify-center rounded-full border-4 border-white bg-brand shadow-2xl">
                    <Camera className="h-9 w-9 text-white" />
                  </span>
                  <span className="mt-1.5 text-sm font-semibold text-white drop-shadow">Take photo · 5 s</span>
                </button>
                <button
                  type="button"
                  onClick={() => openCameraFor(cameraTarget)}
                  className="flex h-16 w-16 items-center justify-center rounded-full border border-white/40 bg-black/75 text-white shadow-lg"
                  aria-label="Restart the camera"
                >
                  <RefreshCw className="h-7 w-7" />
                </button>
              </div>
            </div>

            {isPersonTarget(cameraTarget) && (
              <div className="w-[260px] shrink-0">
                <PhonePhotoTransfer inline onPhoto={(photo) => { stopCamera(); setCameraOpen(false); applyCapturedPhoto(cameraTarget, photo); }} />
              </div>
            )}
          </div>

          <div className="mx-auto flex w-full max-w-xl items-center justify-center">
            <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl bg-white/10 px-5 text-base font-semibold text-white hover:bg-white/20">
              <Upload className="h-4 w-4" />
              Choose a photo file instead
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

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-ml-2 inline-flex min-h-14 items-center gap-2 rounded-xl px-2 text-lg font-semibold text-muted hover:text-ink">
      <ArrowLeft className="h-6 w-6" /> Back
    </button>
  );
}

/** AI Video gift above a minimum bill: the last four digits of the customer's bill (TV and tablet). */
function BillDigitsGate({ value, onChange, onContinue, action }: { value: string; onChange: (value: string) => void; onContinue: () => void; action: string }) {
  return (
    <section className="tf-card mx-auto max-w-2xl space-y-6 p-8 text-center">
      <h2 className="text-4xl font-bold">Enter the last four digits of your bill</h2>
      <p className="text-lg text-muted">Our staff will tell you which four digits to enter.</p>
      <input value={value} onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" autoComplete="off" maxLength={4} aria-label="Last four digits of bill number" className="mx-auto block min-h-20 w-full max-w-sm rounded-2xl border border-ink bg-canvas text-center tabular-nums text-4xl" />
      <button type="button" disabled={value.length !== 4} onClick={onContinue} className="tf-btn tf-btn-primary !min-h-16 w-full max-w-sm text-lg">{action}</button>
    </section>
  );
}

/** The bottom of the TV's first screen: the store's own logo (from its workspace), or its name. */
function StoreLogoBand({ clientName }: { clientName: string }) {
  const [logo, setLogo] = useState('');
  useEffect(() => {
    let url = '';
    fetch('/api/maharaja/logo', { cache: 'no-store' })
      .then(async (response) => { if (response.ok) { url = URL.createObjectURL(await response.blob()); setLogo(url); } })
      .catch(() => undefined);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, []);
  return (
    <div className="mt-auto flex min-h-[180px] items-center justify-center rounded-3xl border border-line bg-white p-8">
      {logo
        ? <img src={logo} alt={clientName} onError={() => setLogo('')} className="max-h-[160px] max-w-[70%] object-contain" />
        : <p className="text-4xl font-bold text-ink">{clientName}</p>}
    </div>
  );
}
