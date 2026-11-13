'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { fetchCatalogueSettings, fetchCompleteCatalogue } from '@/lib/maharaja/catalogue-client';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  LoaderCircle,
  MapPin,
  QrCode,
  RefreshCw,
  Shirt,
  Sparkles,
  Upload,
  Printer,
  Video,
  X,
} from 'lucide-react';
import HelpRetry, { HELP_TEXT } from '@/components/HelpRetry';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import DressLoader from '@/components/DressLoader';
import AudienceCards, { PhotoGuide } from '@/components/AudienceCards';
import { compressImage } from '@/lib/utils/image';
import SessionTimer, { sessionTimerShowing } from '@/components/SessionTimer';
import LucyLiveMirror from '@/components/LucyLiveMirror';
import WhoCards, { KidsSwitch, type WhoGroup } from '@/components/kiosk/WhoCards';
import PosterFill from '@/components/kiosk/PosterFill';
import TvIdleLoop from '@/components/TvIdleLoop';
import TvOfflineNotice from '@/components/TvOfflineNotice';
import { downloadBrandedQr } from '@/lib/maharaja/branded-qr';
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
import { PageTitle, AgreeButton } from '@/components/ui';
import { OWN_GARMENT_TYPES } from '@/lib/tryfocus/garment-types';
import { allCategoriesFor, categoriesFor, type CustomCategory, type StoreCategoryLists } from '@/lib/tryfocus/store-categories';
import { conceptsForCategory, type VideoConceptId } from '@/lib/maharaja/video-concepts';
import type { CustomerCategory } from '@/lib/maharaja/config';

const VIDEO_CATEGORY_OF: Record<CatalogueAudience, CustomerCategory> = { women: 'women', men: 'men', boys: 'boy', girls: 'girl' };

type TvMode = 'image-tryon' | 'catalogue-tryon' | 'own-tryon' | 'live-tryon' | 'catalogue-video' | 'wall-qr';
type ImageTryOnSource = 'catalogue' | 'own-garment';
type CatalogueTryOnStage = 'who' | 'studio' | 'generating' | 'result';
type VideoStage = 'who' | 'photo' | 'pick' | 'look' | 'portrait';
type CameraTarget = 'catalogue-person' | 'own-person' | 'own-garment' | 'video-person';
type VideoAudience = CatalogueAudience;

/** Looks a customer can create at once from the store collection. */
const MAX_LOOKS = 3;
const isPersonTarget = (target: CameraTarget) => target !== 'own-garment';
const AUDIENCE_LABELS = { women: 'Women', men: 'Men', boys: 'Boys', girls: 'Girls' } as const;
const PHOTO_GUIDE: [string, string] = ['Take a full-length photo, not a selfie.', 'Stand in good light and face the camera straight.'];
// TryFocus rule: one garment per Try-On, always one piece.
const OUTFIT_GUIDE: [string, string] = ['One garment at a time, not a full set.', 'Hold it up, lay it flat or hang it, the whole piece in the frame, in good light.'];

/** The store's own uploaded logo, fetched once; '' until loaded or if none was uploaded. */
function useStoreLogo() {
  const [logo, setLogo] = useState('');
  useEffect(() => {
    let url = '';
    fetch('/api/maharaja/logo?fallback=1', { cache: 'no-store' })
      .then(async (response) => { if (response.ok) { url = URL.createObjectURL(await response.blob()); setLogo(url); } })
      .catch(() => undefined);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, []);
  return logo;
}

/**
 * The store screen: the portrait TV, or the tablet (`device="tablet"`), at a different scale.
 * TV, three tabs: Try-On (Store collection or My own outfit), AI Video (pick a piece, take a photo, then a
 * QR makes the video on the phone) and Live Try-On. AI Video only starts here, never on the tablet.
 * Tablet, three tabs: Catalogue Try-On, Own-outfit Try-On (each tab is its own source, no in-flow
 * "What would you like to try?" step) and the Wall QR to print.
 */
export default function TryFocusTvExperience({ device = 'tv' }: { device?: 'tv' | 'tablet' }) {
  const isTablet = device === 'tablet';
  // Tablet starts on its catalogue-outfit Try-On tab; the TV keeps its single Try-On tab.
  const defaultMode: TvMode = isTablet ? 'catalogue-tryon' : 'image-tryon';
  const storeLogo = useStoreLogo();
  const [mode, setMode] = useState<TvMode>(defaultMode);
  const [clientName, setClientName] = useState('');
  // Live Try-On and AI Video show only while the store has them (module on and the devices they need on).
  const [liveOn, setLiveOn] = useState(!isTablet);
  const [videoOn, setVideoOn] = useState(true);
  // With Go Live, an idle TV plays recent Go Live videos until someone taps it.
  const [goLiveOn, setGoLiveOn] = useState(false);
  const [idleLoop, setIdleLoop] = useState(false);
  const [catalogueItems, setCatalogueItems] = useState<TryFocusProduct[]>([]);
  // The store's own categories per audience, from its workspace.
  const [categoryLists, setCategoryLists] = useState<StoreCategoryLists>({});
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [videoCategoryLists, setVideoCategoryLists] = useState<StoreCategoryLists>({});

  // Catalogue filtering
  const [genderFilter, setGenderFilter] = useState<CatalogueAudience>('women');
  // Who starts empty for each customer, on Try-On and AI Video alike, until they tap one.
  // Try-On starts with Women · Men · Kids; Kids then picks Boys or Girls under the camera.
  const [whoGroup, setWhoGroup] = useState<WhoGroup | null>(null);
  const catalogueGridRef = useRef<HTMLDivElement | null>(null);
  const [kidPick, setKidPick] = useState<'boys' | 'girls' | null>(null);
  const [videoWhoChosen, setVideoWhoChosen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CatalogueCategoryId>('sarees');
  const [showNewArrivals, setShowNewArrivals] = useState(false);
  const [showTrending, setShowTrending] = useState(false);
  const [, setCataloguePage] = useState(0);
  const [videoAudience, setVideoAudience] = useState<VideoAudience>('women');
  // The location/scene for the AI Video: one of the 3 for the chosen audience, picked before the portrait
  // is made (the phone's own AI Video flow already asks this; the TV was skipping straight to a fixed one).
  const [videoConceptId, setVideoConceptId] = useState<VideoConceptId | ''>('');
  const [videoGuardianConsent, setVideoGuardianConsent] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<TryFocusProduct>(sampleCatalogue[0]);

  // TryFocus switched the open experience off while the TV was running: go back to Image Try-On.
  useEffect(() => {
    if ((mode === 'live-tryon' && !liveOn) || (mode === 'catalogue-video' && !videoOn)) setMode(defaultMode);
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
          trending: item.trending === true,
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
        setCustomCategories(settings.customCategories);
        setVideoCategoryLists(settings.videoCategoryLists);
        if (settings.access) {
          // Live Try-On needs the TV's camera stream; the tablet never runs it.
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
  // The QR is made the moment the look(s) finish, with no button to tap first.
  const handoffTriggeredRef = useRef(false);
  const idleResetRef = useRef<number | null>(null);
  // Remounts Live Try-On on End session, so its camera and picks start fresh.
  const [liveMirrorKey, setLiveMirrorKey] = useState(0);
  const [tryOnGuardianConsent, setTryOnGuardianConsent] = useState(false);

  // Camera capture modal / full-screen stage
  const [cameraOpen, setCameraOpen] = useState<boolean>(false);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget>('catalogue-person');
  const [cameraError, setCameraError] = useState<string>('');
  const [countdown, setCountdown] = useState<number | null>(null);
  // The just-taken (or just-received, from a phone QR) photo: shown full screen in the same dialog,
  // with Retry and Use this photo, instead of a second preview screen elsewhere on the page.
  const [pendingPhoto, setPendingPhoto] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureTimerRef = useRef<number | null>(null);
  const swipeStartX = useRef<number | null>(null);

  // AI Catalogue Video state
  const [selectedEventId] = useState<string>(events[0].id);
  const [videoPersonPhoto, setVideoPersonPhoto] = useState<string>('');
  const [videoMasterUrl, setVideoMasterUrl] = useState<string>('');
  const [videoMasterSessionId, setVideoMasterSessionId] = useState('');
  const [videoGeneratingMaster, setVideoGeneratingMaster] = useState<boolean>(false);
  const [videoPassCreating, setVideoPassCreating] = useState<boolean>(false);
  const generationBusyRef = useRef(false);
  useEffect(() => {
    generationBusyRef.current = tryOnStage === 'generating' || videoGeneratingMaster || videoPassCreating || Object.values(batchProgress).includes('generating');
  }, [tryOnStage, videoGeneratingMaster, videoPassCreating, batchProgress]);
  const [videoPassQr, setVideoPassQr] = useState<string>('');
  // The pass is created as soon as the portrait is ready, but its QR stays hidden until the customer taps
  // Generate video: that tap also approves the portrait, so scanning the QR starts the video right away.
  const [videoPassCode, setVideoPassCode] = useState<string>('');
  const [videoPortraitApproved, setVideoPortraitApproved] = useState(false);
  const [videoApproving, setVideoApproving] = useState(false);
  const [videoStatusNote, setVideoStatusNote] = useState<string>('');
  const [videoStage, setVideoStage] = useState<VideoStage>('who');
  const [videoCategory, setVideoCategory] = useState<CatalogueCategoryId | ''>('');
  const [portraitRetryUsed, setPortraitRetryUsed] = useState(false);
  const [tvBillSuffixRequired, setTvBillSuffixRequired] = useState(true);
  const [tvBillLast4, setTvBillLast4] = useState('');
  const [tvBillEntered, setTvBillEntered] = useState(false);

  // Only categories that hold a garment for this audience: a customer never opens an empty one.
  const filteredCategories = categoriesFor(categoryLists, genderFilter, customCategories).filter((cat) => catalogueItems.some((item) => item.gender === genderFilter && item.category === cat.id));
  // A category the store removed (or one this audience lacks) moves to the store's first category with pieces.
  useEffect(() => {
    if (filteredCategories.some((cat) => cat.id === activeCategory)) return;
    const next = filteredCategories[0];
    if (next) setActiveCategory(next.id);
  }, [filteredCategories, activeCategory, catalogueItems]);
  const browseProducts = catalogueItems.filter((item) => item.gender === genderFilter &&
    (showTrending ? item.trending === true
      : showNewArrivals ? item.badge === 'NEW ARRIVAL'
        : item.category === activeCategory));
  // AI Video uses only the pieces the store switched on for it.
  const videoAudienceProducts = catalogueItems.filter((item) => item.price > 0 && item.eligibleForVideo === true && item.gender === videoAudience);
  const videoCategories = categoriesFor(videoCategoryLists, videoAudience, customCategories).filter((cat) => videoAudienceProducts.some((item) => item.category === cat.id));
  // The 3 locations for this audience, so the customer picks one before the portrait is made.
  const videoLooks = useMemo(() => conceptsForCategory(VIDEO_CATEGORY_OF[videoAudience]), [videoAudience]);
  const activeVideoCategory = videoCategories.some((cat) => cat.id === videoCategory) ? videoCategory : videoCategories[0]?.id || '';
  const videoBrowseProducts = videoAudienceProducts.filter((item) => !activeVideoCategory || item.category === activeVideoCategory);

  // Live Try-On names its categories in the store's order; it shows only those holding a switched-on garment.
  const liveCategories = useMemo(() => Object.fromEntries((['women', 'men', 'boys', 'girls'] as const).map((audience) => [
    audience,
    allCategoriesFor(audience, customCategories).map((cat) => ({ id: cat.id as CatalogueCategoryId, label: cat.label })),
  ])) as Record<CatalogueAudience, Array<{ id: CatalogueCategoryId; label: string }>>, [customCategories]);

  function selectGender(gender: CatalogueAudience) {
    if (gender === genderFilter) return;
    setGenderFilter(gender);
    // The first category, in the shared order, that has pieces in this store.
    const ordered = categoriesFor(categoryLists, gender, customCategories);
    setActiveCategory((ordered.find((cat) => catalogueItems.some((item) => item.gender === gender && item.category === cat.id)) || ordered[0]).id);
    setShowNewArrivals(false);
    // Opens on Trending only when the store has tagged pieces for this audience.
    setShowTrending(catalogueItems.some((item) => item.gender === gender && item.trending === true));
    setCataloguePage(0);
    setSelectedLooks([]);
  }

  function selectCategory(category: CatalogueCategoryId) {
    setActiveCategory(category);
    setShowNewArrivals(false);
    setShowTrending(false);
    setCataloguePage(0);
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

  // The whole audience's outfit photos load in the background as soon as Who is known, so the grid scrolls
  // without waiting.
  useEffect(() => {
    const urls = catalogueItems.filter((item) => item.gender === genderFilter).map((item) => item.thumbnailUrl || item.imageUrl);
    const images = urls.map((url) => { const img = new Image(); img.decoding = 'async'; img.src = url; return img; });
    return () => { images.length = 0; };
  }, [catalogueItems, genderFilter]);

  // Each audience has its own outfit types; keep the own-outfit choice valid when the audience changes.
  useEffect(() => { setOwnGarmentType(OWN_GARMENT_TYPES[genderFilter][0].id); }, [genderFilter]);


  function navigateTo(next: TvMode) {
    batchRunRef.current += 1;
    stopCamera();
    setCameraOpen(false);
    setCameraError('');
    if (next === 'image-tryon') {
      setTryOnStage(customerPhoto ? 'studio' : 'who');
    }
    if (next === 'catalogue-tryon' || next === 'own-tryon') {
      // The tablet's two Try-On tabs decide the source by which tab it is; the shared "What would you
      // like to try?" step (used only on the TV) never shows here.
      const source: ImageTryOnSource = next === 'own-tryon' ? 'own-garment' : 'catalogue';
      if (source !== imageSource) {
        setImageSource(source);
        setCustomerPhoto('');
        setOwnGarmentPhoto('');
        setWhoGroup(null);
        setKidPick(null);
        setTryOnStage('who');
      } else {
        setTryOnStage(customerPhoto ? 'studio' : 'who');
      }
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
    setPendingPhoto('');
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
    // Freeze on the still, in this same full-screen dialog, with Retry and Use this photo: no second
    // preview page elsewhere on the step.
    setPendingPhoto(dataUrl);
  }

  /** A photo sent from the customer's phone (the QR beside the camera): shown full screen here too, for the
      same Retry / Use this photo confirm, before it is ever applied. */
  function receivePhotoForConfirm(target: CameraTarget, dataUrl: string) {
    setCameraTarget(target);
    setCameraError('');
    setCameraOpen(true);
    setPendingPhoto(dataUrl);
  }

  /** Retry on the confirm still: back to the live feed if the camera is running, otherwise (a phone QR
      photo) back to this step so the customer can send another. */
  function retryPendingPhoto() {
    setPendingPhoto('');
    if (!streamRef.current) {
      stopCamera();
      setCameraOpen(false);
    }
  }

  // The <video> element unmounts while the still is shown; re-attach the live stream when back to it.
  useEffect(() => {
    if (!pendingPhoto && cameraOpen && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [pendingPhoto, cameraOpen]);

  function confirmPendingPhoto() {
    const target = cameraTarget;
    const dataUrl = pendingPhoto;
    stopCamera();
    setCameraOpen(false);
    setPendingPhoto('');
    applyCapturedPhoto(target, dataUrl);
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

  /**
   * Applied once the customer confirms "Use this photo" in the full-screen dialog (camera or phone QR).
   * The photo was already shown and confirmed there, so there is no second preview screen: an adult goes
   * straight on; a child's photo still waits on the guardian-consent tick, shown as a small thumbnail.
   */
  function applyCapturedPhoto(target: CameraTarget, dataUrl: string) {
    if (target === 'catalogue-person' || target === 'own-person') {
      // Same screen: the photo takes the camera's place, the outfits are picked under it.
      setCustomerPhoto(dataUrl);
      setTryOnStage('studio');
      if (imageSource === 'own-garment' && !ownGarmentPhoto) void openCameraFor('own-garment');
    } else if (target === 'own-garment') {
      setOwnGarmentPhoto(dataUrl);
    } else if (target === 'video-person') {
      setVideoPersonPhoto(dataUrl);
      setVideoMasterUrl('');
      setVideoMasterSessionId('');
      setVideoPassQr('');
      setVideoPassCode('');
      setVideoPortraitApproved(false);
      setVideoStatusNote('');
      setVideoStage(videoAudience === 'boys' || videoAudience === 'girls' ? 'photo' : 'pick');
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

  /**
   * Try-On on the TV and tablet is one screen: the camera (then the photo) on the top 60%, the choices under it.
   * The source is the catalogue unless the customer taps My own outfit (TV) or is on the tablet's own-outfit tab.
   */
  function chooseTryOnSource(source: ImageTryOnSource) {
    setImageSource(source);
    setTryOnError('');
    setTryOnStage('studio');
    if (!customerPhoto) { void openCameraFor(source === 'own-garment' ? 'own-person' : 'catalogue-person'); return; }
    if (source === 'own-garment' && !ownGarmentPhoto) void openCameraFor('own-garment');
  }

  /** Women · Men · Kids. Kids has no Boys or Girls yet: it is picked under the camera, before the photo. */
  function chooseWhoGroup(group: WhoGroup) {
    setWhoGroup(group);
    setKidPick(null);
    setTryOnGuardianConsent(false);
    // A new Who is a new person: their own photo, outfit and picks.
    setCustomerPhoto('');
    setOwnGarmentPhoto('');
    setSelectedLooks([]);
    if (group !== 'kids') selectGender(group);
    const source: ImageTryOnSource = isTablet ? imageSource : 'catalogue';
    setImageSource(source);
    setTryOnError('');
    setTryOnStage('studio');
    void openCameraFor(source === 'own-garment' ? 'own-person' : 'catalogue-person');
  }

  function chooseKid(kid: 'boys' | 'girls') {
    if (kid === kidPick) return;
    setKidPick(kid);
    selectGender(kid);
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
    setVideoPassCode('');
    setVideoPortraitApproved(false);
    setVideoStatusNote('');
    setPortraitRetryUsed(false);
    setVideoConceptId('');
    const first = catalogueItems.find((item) => item.price > 0 && item.eligibleForVideo === true && item.gender === audience);
    if (first) setSelectedProduct(first);
    setVideoStage('photo');
    if (!videoPersonPhoto) void openCameraFor('video-person');
  }

  function chooseVideoPiece(item: TryFocusProduct) {
    setSelectedProduct(item);
    setVideoMasterUrl('');
    setVideoMasterSessionId('');
    setVideoPassQr('');
    setVideoPassCode('');
    setVideoPortraitApproved(false);
    setPortraitRetryUsed(false);
    setVideoConceptId('');
  }

  async function runCatalogueBatch(personImg: string) {
    if (!personImg) {
      setTryOnError('Please add your photo first.');
      setTryOnStage('studio');
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
      setTryOnStage('studio');
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
      setTryOnStage('studio');
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

  // The QR is prepared as soon as the look(s) are ready, so it sits in its permanent spot at the bottom
  // the moment the customer gets there — nothing to tap first.
  useEffect(() => {
    if (tryOnStage !== 'result' || tryOnMobileQr || handoffTriggeredRef.current) return;
    const ready = imageSource === 'own-garment'
      ? Boolean(tryOnResultUrl)
      : selectedLooks.length > 0 && batchDone >= selectedLooks.length;
    if (!ready) return;
    handoffTriggeredRef.current = true;
    void createImageHandoff(imageSource === 'own-garment'
      ? [{
          product: {
            ...selectedProduct,
            sku: `OWN-${Date.now().toString().slice(-6)}`,
            title: OWN_GARMENT_TYPES[genderFilter].find((type) => type.id === ownGarmentType)?.label || 'My outfit',
            gender: genderFilter,
            garmentType: ownGarmentType as TryFocusProduct['garmentType'],
            garmentReferenceUrl: ownGarmentPhoto,
            imageUrl: ownGarmentPhoto,
          },
          url: tryOnResultUrl,
        }]
      : generatedLooks.filter((look) => look.url));
  }, [tryOnStage, imageSource, tryOnResultUrl, batchDone, selectedLooks.length, tryOnMobileQr]);

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
          // The location the customer actually picked, the same one the portrait was made in (not a
          // fixed default): the phone's video must animate the same scene the portrait already shows.
          videoMasterConceptId: videoConceptId || videoLooks[0]?.id,
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
      setVideoPassCode(data.pass.code || '');
    } catch (error) {
      if (runId !== batchRunRef.current) return;
      setVideoPassQr('');
      setVideoStatusNote(error instanceof Error ? error.message : 'Unable to create mobile video pass.');
    } finally {
      if (runId === batchRunRef.current) setVideoPassCreating(false);
    }
  }

  /** "Generate video": approves the portrait and reveals the QR. The phone then starts the video the
      instant it opens the pass, with no further tap there. */
  async function approveVideoPortrait() {
    if (!videoPassCode || !videoMasterSessionId || !videoMasterUrl || videoApproving) return;
    setVideoApproving(true);
    setVideoStatusNote('');
    try {
      const res = await fetch('/api/ai/master-image/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: videoPassCode, sessionId: videoMasterSessionId, masterImageUrl: videoMasterUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Unable to confirm the portrait.');
      setVideoPortraitApproved(true);
    } catch (error) {
      setVideoStatusNote(error instanceof Error ? error.message : 'Unable to confirm the portrait. Please try again.');
    } finally {
      setVideoApproving(false);
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
      setTryOnStage('studio');
    }
  }

  async function generateCatalogueVideoMasterOnTv() {
    if (!videoPersonPhoto) return;
    if ((selectedProduct.gender === 'boys' || selectedProduct.gender === 'girls') && !videoGuardianConsent) {
      setVideoStatusNote('Parent or legal guardian consent is required for a child photo.');
      return;
    }
    // The customer picked one of the 3 locations on the previous screen; fall back to the first only if
    // this portrait is somehow requested without that (a retry reuses the same one already set).
    const conceptId = videoConceptId || videoLooks[0]?.id;
    if (!conceptId) {
      setVideoStatusNote('Pick a location first.');
      setVideoStage('look');
      return;
    }
    setVideoGeneratingMaster(true);
    setVideoStage('portrait');
    setVideoMasterUrl('');
    setVideoPassQr('');
    setVideoPassCode('');
    setVideoPortraitApproved(false);
    const runId = ++batchRunRef.current;
    setVideoStatusNote('Creating your portrait…');
    const sessionId = `tv_vidmaster_${Date.now()}`;

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

  /** Help on the portrait: one more try with the same photo and piece. */
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

  /** End session: clears this customer and stays on the same tab, ready for the next one. */
  function endSession() {
    const tab = mode;
    resetAllSession();
    setMode(tab);
    setLiveMirrorKey((key) => key + 1);
  }

  function resetAllSession() {
    batchRunRef.current += 1;
    firstReadyRunRef.current = 0;
    handoffTriggeredRef.current = false;
    stopCamera();
    setCameraOpen(false);
    setImageSource('catalogue');
    setGenderFilter('women');
    setActiveCategory('sarees');
    setShowNewArrivals(false);
    setShowTrending(false);
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
    setWhoGroup(null);
    setKidPick(null);
    setVideoWhoChosen(false);
    setOwnGarmentType(OWN_GARMENT_TYPES.women[0].id);
    setVideoStage('who');
    setVideoCategory('');
    setPortraitRetryUsed(false);
    setVideoConceptId('');
    setVideoPersonPhoto('');
    setVideoMasterUrl('');
    setVideoPassQr('');
    setVideoPassCode('');
    setVideoPortraitApproved(false);
    setVideoAudience('women');
    setVideoGuardianConsent(false);
    setTvBillLast4('');
    setTvBillEntered(false);
    setVideoStatusNote('');
    setVideoGeneratingMaster(false);
    setVideoPassCreating(false);
    setMode(defaultMode);
  }

  useEffect(() => {
    const restart = () => {
      if (idleResetRef.current !== null) window.clearTimeout(idleResetRef.current);
      idleResetRef.current = window.setTimeout(() => {
        if (generationBusyRef.current || sessionTimerShowing()) restart();
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

  // One step back, in place of a progress bar. TV and tablet share one Try-On flow:
  // Who → photo → Store collection or My own outfit → outfits.
  const tryOnBack = tryOnStage === 'studio' ? () => { stopCamera(); setCameraOpen(false); setPendingPhoto(''); setTryOnStage('who'); } : null;
  const kidsPending = whoGroup === 'kids' && !kidPick;
  const kidsOnCamera = whoGroup === 'kids' && (cameraTarget === 'catalogue-person' || cameraTarget === 'own-person');
  const shutterLocked = kidsPending && kidsOnCamera;
  const consentMissing = (genderFilter === 'boys' || genderFilter === 'girls') && !tryOnGuardianConsent;
  const railTabs = [
    ...(catalogueItems.some((item) => item.gender === genderFilter && item.trending === true) ? [{ id: 'trending', label: 'Trending' }] : []),
    ...(catalogueItems.some((item) => item.gender === genderFilter && item.badge === 'NEW ARRIVAL') ? [{ id: 'new', label: 'New arrivals' }] : []),
    ...filteredCategories.map((cat) => ({ id: cat.id as string, label: cat.label })),
  ];
  const railActive = showTrending ? 'trending' : showNewArrivals ? 'new' : (activeCategory as string);
  const videoBack = videoStage === 'photo' ? () => setVideoStage('who')
    : videoStage === 'pick' ? () => setVideoStage('photo')
    : videoStage === 'look' ? () => setVideoStage('pick')
    : null;

  return (
    <main className="tv-kiosk min-h-screen bg-[#F4F5F2] text-ink">
      {idleLoop && goLiveOn && !isTablet && <TvIdleLoop clientName={clientName} onWake={() => setIdleLoop(false)} />}
      <TvOfflineNotice />
      <header className="tv-main-header sticky top-0 z-30 border-b-2 border-line bg-white shadow-sm">
        <div className="tv-main-brand mx-auto flex max-w-[1080px] items-center justify-between gap-4 px-8 pb-4 pt-5">
          <div className="flex min-w-0 items-center gap-4">
            {storeLogo
              ? <img src={storeLogo} alt="" className="h-14 max-w-[160px] shrink-0 rounded-2xl border border-line bg-white object-contain p-1.5" />
              : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white">{clientName.replace(/^The\s+/i, '').charAt(0) || 'T'}</span>}
            <div className="min-w-0">
              <h1 className="truncate text-[32px] font-bold leading-tight text-ink">{clientName}</h1>
              <p className="text-lg font-medium text-muted">See any outfit on you in seconds</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isTablet && <Link href="/maharaja/workspace" className="flex min-h-12 items-center rounded-xl px-3 text-base font-semibold text-muted hover:text-ink">Workspace</Link>}
            {/* Tablet: End session on Try-On only (Wall QR has none; there is no AI Video tab here). */}
            {isTablet
              ? (mode === 'catalogue-tryon' || mode === 'own-tryon') && <button type="button" onClick={endSession} className="tv-end-session tf-btn shrink-0 !min-h-16 border-2 border-ink bg-white px-6 text-lg font-bold text-ink">End session</button>
              : <button type="button" onClick={resetAllSession} className="tv-end-session tf-btn shrink-0 !min-h-16 border-2 border-ink bg-white px-6 text-lg font-bold text-ink">Start over</button>}
          </div>
        </div>
        {isTablet ? (
          // Tablet, three tabs, run by the store's team: catalogue Try-On, own-outfit Try-On (each tab
          // decides the source, so there is no separate "What would you like to try?" step here), and the
          // Wall QR to print. AI Video only starts on the TV.
          <nav className="tv-mode-nav mx-auto grid max-w-[1080px] grid-cols-3 gap-3 px-8 pb-5" aria-label="Choose an experience">
            <button type="button" aria-current={mode === 'catalogue-tryon' ? 'page' : undefined} onClick={() => navigateTo('catalogue-tryon')} className={`tv-mode-button ${mode === 'catalogue-tryon' ? 'is-active' : ''}`}>
              <Sparkles className="h-6 w-6" /><span>Catalogue Try-On</span>
            </button>
            <button type="button" aria-current={mode === 'own-tryon' ? 'page' : undefined} onClick={() => navigateTo('own-tryon')} className={`tv-mode-button ${mode === 'own-tryon' ? 'is-active' : ''}`}>
              <Shirt className="h-6 w-6" /><span>Own-outfit Try-On</span>
            </button>
            <button type="button" aria-current={mode === 'wall-qr' ? 'page' : undefined} onClick={() => navigateTo('wall-qr')} className={`tv-mode-button ${mode === 'wall-qr' ? 'is-active' : ''}`}>
              <Printer className="h-6 w-6" /><span>Wall QR</span>
            </button>
          </nav>
        ) : (
          <nav className={`tv-mode-nav mx-auto grid max-w-[1080px] gap-3 px-8 pb-5 ${['grid-cols-1', 'grid-cols-2', 'grid-cols-3'][[true, videoOn, liveOn].filter(Boolean).length - 1]}`} aria-label="Choose an experience">
            <button type="button" aria-current={mode === 'image-tryon' ? 'page' : undefined} onClick={() => navigateTo('image-tryon')} className={`tv-mode-button ${mode === 'image-tryon' ? 'is-active' : ''}`}>
              <Sparkles className="h-6 w-6" /><span>Try-On</span>
            </button>
            {videoOn && <button type="button" aria-current={mode === 'catalogue-video' ? 'page' : undefined} onClick={() => navigateTo('catalogue-video')} className={`tv-mode-button ${mode === 'catalogue-video' ? 'is-active' : ''}`}>
              <Video className="h-6 w-6" /><span>AI Video</span>
            </button>}
            {liveOn && <button type="button" aria-current={mode === 'live-tryon' ? 'page' : undefined} onClick={() => navigateTo('live-tryon')} className={`tv-mode-button ${mode === 'live-tryon' ? 'is-active' : ''}`}>
              <Camera className="h-6 w-6" /><span>Live Try-On</span>
            </button>}
          </nav>
        )}
      </header>

      <div className="tv-kiosk-content mx-auto max-w-[1920px] px-5 py-6 sm:px-8">
        {/* =========================================================
            MODE 1: TRY-ON (store collection or own outfit)
           ========================================================= */}
        {(mode === 'image-tryon' || mode === 'catalogue-tryon' || mode === 'own-tryon') && (
          <div className="space-y-6">
            {tryOnBack && <BackButton onClick={tryOnBack} />}
            {tryOnStage === 'who' && (
              <div className={`flex flex-col gap-6 ${isTablet ? '' : 'tv-who-screen min-h-[calc(100dvh-240px)]'}`}>
                <PageTitle size="lg" title="Who is it for?" subtitle="Tap one to start." />
                <WhoCards value={whoGroup} onChange={chooseWhoGroup} />
                <PhotoGuide size="lg" lines={PHOTO_GUIDE} />
                <PosterFill clientName={clientName} />
              </div>
            )}

            {/* Try-On: the camera opens full screen as soon as Who is tapped (Kids picks Boys or Girls on it).
                Then the outfits: the category side menu and a 3-column grid, about 15 on the first screen,
                scrolling for more; up to 3 picks, shown in a strip at the top; Generate in the bottom bar. */}
            {tryOnStage === 'studio' && !customerPhoto && (
              <div className="flex min-h-[calc(100dvh-260px)] flex-col gap-6">
                <PageTitle size="lg" title="Your photo" subtitle={kidsPending ? 'Tap Boys or Girls on the camera screen first.' : 'Stand in front of the screen, or send a photo from your phone.'} />
                <div className="tv-photo-actions grid gap-5 md:grid-cols-2">
                  <button type="button" onClick={() => void openCameraFor(imageSource === 'own-garment' ? 'own-person' : 'catalogue-person')} className="tv-photo-action group flex min-h-[220px] flex-col items-center justify-center gap-6 rounded-3xl bg-ink p-8 text-center text-white shadow-lg transition hover:bg-black">
                    <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 transition group-hover:scale-105"><Camera className="h-12 w-12" /></span>
                    <span><span className="block text-4xl font-bold">Open the camera</span><span className="mt-2 block text-xl text-white/70">Stand back · 5 second timer</span></span>
                  </button>
                  <PhonePhotoTransfer
                    onPhoto={(photo) => receivePhotoForConfirm('catalogue-person', photo)}
                    renderTrigger={(open, busy) => (
                      <button type="button" onClick={open} disabled={busy} className="tv-photo-action group flex h-full min-h-[220px] w-full flex-col items-center justify-center gap-6 rounded-3xl border border-line bg-white p-8 text-center shadow-sm transition hover:border-brand disabled:opacity-50">
                        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-soft text-brand transition group-hover:scale-105">{busy ? <LoaderCircle className="h-12 w-12 animate-spin" /> : <QrCode className="h-12 w-12" />}</span>
                        <span><span className="block text-4xl font-bold text-ink">{busy ? 'Preparing QR…' : 'Use my phone'}</span><span className="mt-2 block text-xl text-muted">Scan a QR and send a photo</span></span>
                      </button>
                    )}
                  />
                </div>
                <PhotoGuide size="lg" lines={PHOTO_GUIDE} />
                <PhotoConsentNotice kind="try-on" large />
                <PosterFill clientName={clientName} />
              </div>
            )}

            {tryOnStage === 'studio' && customerPhoto && imageSource === 'catalogue' && (
              <div className="space-y-5 pb-36">
                <div className="flex items-center justify-between gap-4">
                  <PageTitle size="lg" title={`Pick up to ${MAX_LOOKS} outfits`} subtitle="From any category. We create a look for each one at the same time." />
                  <button type="button" onClick={() => void openCameraFor('catalogue-person')} className="group flex shrink-0 items-center gap-3 rounded-2xl border border-line bg-white p-2 pr-4 text-left hover:border-ink">
                    <img src={customerPhoto} alt="Your photo" className="aspect-[9/16] h-16 rounded-lg object-cover" />
                    <span className="text-sm font-semibold text-muted group-hover:text-ink">Change<br />photo</span>
                  </button>
                </div>
                <div className="tv-catalogue-shell grid gap-5">
                  <aside className="tv-category-sidebar tf-card p-3" aria-label="Garment categories">
                    {/* My own outfit, set apart from the store's categories: a garment the customer brought. */}
                    {!isTablet && (
                      <button type="button" onClick={() => chooseTryOnSource('own-garment')} className="mb-4 flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-brand bg-brand-soft p-4 text-center shadow-[0_4px_0_0_var(--color-brand,#7A1428)] transition hover:bg-white">
                        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white"><Shirt className="h-7 w-7" /></span>
                        <span className="text-xl font-bold leading-tight text-brand">My own outfit</span>
                        <span className="text-sm font-medium leading-snug text-ink">Try a garment you brought</span>
                      </button>
                    )}
                    <p className="px-1 pb-2 text-base font-bold text-ink">Our collection</p>
                    <div className="tv-kiosk-filters flex flex-col gap-1">
                      {railTabs.map((tab) => {
                        const pickedHere = tab.id === 'trending' || tab.id === 'new' ? 0 : selectedLooks.filter((look) => look.category === tab.id).length;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            aria-pressed={railActive === tab.id}
                            onClick={() => {
                              if (tab.id === 'trending') { setShowTrending(true); setShowNewArrivals(false); }
                              else if (tab.id === 'new') { setShowNewArrivals(true); setShowTrending(false); }
                              else selectCategory(tab.id as CatalogueCategoryId);
                              catalogueGridRef.current?.scrollIntoView({ block: 'start' });
                            }}
                            className="flex items-center justify-between gap-2 rounded-xl border px-4 text-left font-semibold"
                          >
                            <span className="truncate">{tab.label}</span>
                            {pickedHere > 0 && <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full bg-ink px-2 text-base font-bold text-white">{pickedHere}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </aside>

                  <div ref={catalogueGridRef} className="min-w-0 scroll-mt-48 space-y-4">
                    {selectedLooks.length > 0 && (
                      <div className="tf-card flex items-center gap-3 p-3" aria-label="Your picks">
                        <p className="shrink-0 px-1 text-lg font-bold">Your picks</p>
                        <div className="flex min-w-0 flex-1 gap-3">
                          {selectedLooks.map((look, index) => (
                            <button key={look.sku} type="button" onClick={() => toggleLook(look)} aria-label={`Remove ${look.title}`} className="relative flex min-w-0 items-center gap-2 rounded-xl border border-ink bg-white p-1.5 pr-3">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-base font-bold text-white">{index + 1}</span>
                              <img src={look.thumbnailUrl || look.imageUrl} alt="" className="h-16 w-12 shrink-0 rounded-lg bg-canvas object-contain" />
                              <span className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug">{look.title}</span>
                              <X className="h-5 w-5 shrink-0 text-muted" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="text-2xl font-bold">{railTabs.find((tab) => tab.id === railActive)?.label}</p>
                      <p className="text-base text-muted">{browseProducts.length} styles</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {browseProducts.map((item, index) => {
                        const pickIndex = selectedLooks.findIndex((look) => look.sku === item.sku);
                        const picked = pickIndex >= 0;
                        const full = selectedLooks.length >= MAX_LOOKS && !picked;
                        return (
                          <button
                            key={item.sku}
                            type="button"
                            aria-pressed={picked}
                            aria-label={`${picked ? 'Remove' : 'Select'} ${item.title}`}
                            disabled={full}
                            onClick={() => toggleLook(item)}
                            className={`relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white text-left transition disabled:opacity-50 ${picked ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-line-strong'}`}
                          >
                            <span className="block h-[176px] w-full bg-canvas">
                              <img src={item.thumbnailUrl || item.imageUrl} alt="" loading={index < 15 ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-contain" />
                            </span>
                            <span className={`absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold shadow ${picked ? 'bg-ink text-white' : 'bg-white/90 text-ink'}`}>{picked ? pickIndex + 1 : '+'}</span>
                            <span className="truncate px-3 py-2 text-base font-semibold text-ink">{item.title}</span>
                          </button>
                        );
                      })}
                    </div>
                    {browseProducts.length === 0 && <div className="tf-card p-10 text-center"><p className="text-2xl font-bold">No pieces here yet</p><p className="mt-2 text-muted">Choose another category or ask our staff.</p></div>}
                    {tryOnError && <p className="rounded-xl bg-danger-soft p-4 text-lg text-danger">{tryOnError}</p>}
                  </div>

                  <div className="tv-selection-bar fixed left-1/2 z-30 flex max-w-[1016px] -translate-x-1/2 items-center justify-between gap-4 backdrop-blur">
                    <p className="text-lg font-semibold">{selectedLooks.length ? `${selectedLooks.length} of ${MAX_LOOKS} picked` : `Tap up to ${MAX_LOOKS} outfits`}</p>
                    <button type="button" disabled={selectedLooks.length === 0 || consentMissing} onClick={() => { setSelectedProduct(selectedLooks[0]); void runCatalogueBatch(customerPhoto); }} className="tf-btn tf-btn-primary !min-h-16 shrink-0 px-8 text-lg">
                      <Sparkles className="h-5 w-5" /> {selectedLooks.length > 1 ? `Generate ${selectedLooks.length} looks` : 'Generate my look'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tryOnStage === 'studio' && customerPhoto && imageSource === 'own-garment' && (
              <div className={`flex flex-col gap-5 pb-36 ${isTablet ? '' : 'min-h-[calc(100dvh-280px)]'}`}>
                <div className="flex items-center justify-between gap-4">
                  <PageTitle size="lg" title="Your outfit" subtitle="Photograph one garment with the camera, then tell us what it is." />
                  <button type="button" onClick={() => void openCameraFor('own-person')} className="group flex shrink-0 items-center gap-3 rounded-2xl border border-line bg-white p-2 pr-4 text-left hover:border-ink">
                    <img src={customerPhoto} alt="Your photo" className="aspect-[9/16] h-16 rounded-lg object-cover" />
                    <span className="text-sm font-semibold text-muted group-hover:text-ink">Change<br />photo</span>
                  </button>
                </div>
                <PhotoGuide size="lg" lines={OUTFIT_GUIDE} />
                <div className="tv-catalogue-shell grid gap-5">
                  <aside className="tv-category-sidebar tf-card p-3" aria-label="What is your outfit">
                    <p className="px-2 pb-2 text-base font-semibold text-muted">What is it?</p>
                    <div className="tv-kiosk-filters flex flex-col gap-1">
                      {OWN_GARMENT_TYPES[genderFilter].map((type) => (
                        <button key={type.id} type="button" aria-pressed={ownGarmentType === type.id} onClick={() => setOwnGarmentType(type.id)} className="rounded-xl border px-4 text-left font-semibold">{type.label}</button>
                      ))}
                      {!isTablet && (
                        <button type="button" aria-pressed={false} onClick={() => setImageSource('catalogue')} className="mt-2 flex items-center gap-2 rounded-xl border px-4 text-left font-semibold"><ArrowLeft className="h-5 w-5" /> Store collection</button>
                      )}
                    </div>
                  </aside>
                  <div className="min-w-0 space-y-4">
                    <div className="tf-card flex flex-col items-center gap-6 p-8 text-center">
                      {ownGarmentPhoto
                        ? <img src={ownGarmentPhoto} alt="Your outfit" className="aspect-[3/4] h-[560px] max-w-full rounded-2xl bg-canvas object-contain" />
                        : <span className="flex aspect-[3/4] h-[560px] max-w-full flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-line-strong bg-[#F1EEE9] p-8 text-muted"><OwnOutfitIllustration className="h-64 w-64" /><span className="max-w-xs text-xl">Hold one garment up to the camera, or lay it flat</span></span>}
                      <button type="button" onClick={() => void openCameraFor('own-garment')} className="tf-btn tf-btn-dark !min-h-16 w-full max-w-md text-lg"><Camera className="h-5 w-5" /> {ownGarmentPhoto ? 'Retake' : 'Open the camera'}</button>
                    </div>
                    {tryOnError && <p className="rounded-xl bg-danger-soft p-4 text-lg text-danger">{tryOnError}</p>}
                  </div>
                  <div className="tv-selection-bar fixed left-1/2 z-30 flex max-w-[1016px] -translate-x-1/2 items-center justify-between gap-4 backdrop-blur">
                    <p className="text-lg font-semibold">{ownGarmentPhoto ? OWN_GARMENT_TYPES[genderFilter].find((type) => type.id === ownGarmentType)?.label : 'Photograph your outfit'}</p>
                    <button type="button" disabled={!ownGarmentPhoto || consentMissing} onClick={() => void runTryOnGeneration(customerPhoto, ownGarmentPhoto)} className="tf-btn tf-btn-primary !min-h-16 shrink-0 px-8 text-lg"><Sparkles className="h-5 w-5" /> Generate my look</button>
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
              <section className="mx-auto max-w-[1180px] space-y-4" aria-label="Your looks">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-4xl font-bold">{imageSource === 'own-garment' ? 'Your look' : 'Your looks'}</h2>
                    {imageSource === 'catalogue' && batchDone < selectedLooks.length && <p className="text-base text-muted">{batchDone} of {selectedLooks.length} finished. More looks are on their way.</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    {imageSource === 'catalogue' && generatedLooks.length > 1 && <span className="text-lg font-semibold">Look {activeLookIndex + 1} of {selectedLooks.length}</span>}
                    {/* Help on the screen where the looks were made: a retry starts fresh (new Who, photo, outfits). */}
                    <HelpRetry size="tv" text={HELP_TEXT.looks} canRetry onRetry={restartTryOn} />
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
                        frameClassName="mx-auto aspect-[9/16] w-full max-w-[78vh]"
                        dark
                      />
                    </div>
                  ) : (
                    <div className="bg-[#161918]">
                      <img src={tryOnResultUrl || selectedProduct.imageUrl} alt={selectedProduct.title} draggable={false} className="mx-auto aspect-[9/16] max-h-[80vh] w-full object-contain" />
                    </div>
                  )}
                  <p className="border-t border-line bg-white px-6 py-4 text-2xl font-bold text-ink">{imageSource === 'own-garment' ? 'Your outfit' : selectedProduct.title}</p>
                </div>
                {imageSource === 'catalogue' && selectedLooks.length > 1 && <div className="flex items-center justify-between gap-4">
                  <button type="button" onClick={() => moveGeneratedLook(-1)} className="tf-btn tf-btn-secondary !min-h-16 min-w-40 text-lg">← Previous</button>
                  <p className="text-center text-sm text-muted">Swipe to see your looks, or tap one below</p>
                  <button type="button" onClick={() => moveGeneratedLook(1)} className="tf-btn tf-btn-secondary !min-h-16 min-w-40 text-lg">Next →</button>
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
                {/* The QR's permanent spot, pinned to the bottom of the screen however large the look is: it
                    appears the moment the look(s) are ready, nothing to tap first. */}
                <div className="tf-card sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-5 p-6 shadow-xl">
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold">Take your {imageSource === 'own-garment' ? 'look' : 'looks'} home</h3>
                    <p className="mt-1 text-base text-muted">Scan this private QR. It works for 1 hour.</p>
                    <p className="mt-2 text-sm text-muted">{tryOnMobileQr ? 'Scan, then add your WhatsApp number on your phone to download.' : (handoffStatus || (imageSource === 'catalogue' && batchDone < selectedLooks.length ? 'Your QR will appear when all looks finish.' : 'Preparing your QR…'))}</p>
                  </div>
                  <div className="flex h-44 w-44 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white">
                    {tryOnMobileQr
                      ? <img src={tryOnMobileQr} alt="Scan to save your looks" className="h-full w-full object-contain" />
                      : <LoaderCircle className="h-9 w-9 animate-spin text-muted" />}
                  </div>
                </div>
                {/* TV: a red, full-width End session under the download QR. The tablet's team ends it from the header. */}
                {!isTablet && <button type="button" onClick={endSession} className="tf-btn !min-h-20 w-full bg-danger text-xl font-bold text-white hover:bg-danger/90">End session</button>}
              </section>
            )}
          </div>
        )}

        {/* =========================================================
            MODE 2: LIVE MIRROR (pick a catalogue piece -> Start live -> 5-second countdown -> 30 seconds live)
           ========================================================= */}
        {mode === 'live-tryon' && (
          <LucyLiveMirror
            key={liveMirrorKey}
            onEndSession={endSession}
            categories={liveCategories}
            clientName={clientName}
            catalogue={catalogueItems.filter(isLiveMirrorReady)}
            onSelectProduct={setSelectedProduct}
            onUsePhotoTryOn={(product) => {
              // Live Try-On could not connect: the same outfit continues as a photo Try-On.
              navigateTo('image-tryon');
              setImageSource('catalogue');
              setGenderFilter(product.gender);
              setActiveCategory(product.category);
              setSelectedProduct(product);
              setSelectedLooks([product]);
              setWhoGroup(product.gender === 'boys' || product.gender === 'girls' ? 'kids' : product.gender);
              setKidPick(product.gender === 'boys' || product.gender === 'girls' ? product.gender : null);
              setTryOnStage('studio');
              if (!customerPhoto) void openCameraFor('catalogue-person');
            }}
          />
        )}

        {/* =========================================================
            MODE 3: AI VIDEO (store collection only): Who -> camera -> one piece -> portrait -> QR to the phone
           ========================================================= */}
        {/* A minimum bill is set: the customer enters the last 4 digits of their bill first (0 = a free gift). */}
        {mode === 'catalogue-video' && !isTablet && tvBillSuffixRequired && !tvBillEntered && (
          <div className="flex min-h-[calc(100dvh-260px)] flex-col gap-6"><BillDigitsGate value={tvBillLast4} onChange={setTvBillLast4} onContinue={() => setTvBillEntered(true)} action="Continue to AI Video" /><PosterFill clientName={clientName} /></div>
        )}
        {mode === 'catalogue-video' && !isTablet && (!tvBillSuffixRequired || tvBillEntered) && (
          <div className="space-y-6">
            {videoBack && <BackButton onClick={videoBack} />}
            {videoStage === 'who' && (
              <div className="tv-who-screen flex min-h-[calc(100dvh-240px)] flex-col gap-6">
                <PageTitle size="lg" title="Who is the video for?" subtitle="A short AI Video of you in a piece from our collection." />
                {/* An audience with no AI Video piece yet shows "Coming soon", so no one reaches an empty list. */}
                <AudienceCards size="lg" value={videoWhoChosen ? videoAudience : null} onChange={(audience) => { setVideoWhoChosen(true); chooseVideoAudience(audience); }} labels={AUDIENCE_LABELS} unavailable={catalogueItems.length ? (['women', 'men', 'boys', 'girls'] as const).filter((audience) => !catalogueItems.some((item) => item.gender === audience && item.price > 0 && item.eligibleForVideo === true)) : []} />
                <PhotoGuide size="lg" lines={PHOTO_GUIDE} />
                <PosterFill clientName={clientName} />
              </div>
            )}

            {videoStage === 'photo' && (
              <div className="flex flex-col gap-6">
                <PageTitle
                  size="lg"
                  title={videoPersonPhoto ? 'One more thing' : 'Your photo'}
                  subtitle={videoPersonPhoto
                    ? ((videoAudience === 'boys' || videoAudience === 'girls') ? 'A parent or legal guardian needs to approve before we continue.' : 'Ready to continue.')
                    : 'Stand in front of the screen, or send a photo from your phone.'}
                />
                {videoPersonPhoto ? (
                  // The photo was already shown and confirmed full screen; only the guardian consent (for a
                  // child) is left before continuing, with just a small thumbnail as a reminder.
                  <div className="tf-card mx-auto flex w-full max-w-2xl flex-col gap-5 p-7">
                    <div className="flex items-center gap-4">
                      <button type="button" onClick={() => { setVideoPersonPhoto(''); void openCameraFor('video-person'); }} className="shrink-0 overflow-hidden rounded-xl border border-line" aria-label="Retake the photo">
                        <img src={videoPersonPhoto} alt="Your photo" className="aspect-[9/16] h-24 object-cover" />
                      </button>
                      <p className="text-lg text-muted">Not clear? Tap the photo to retake it.</p>
                    </div>
                    {(videoAudience === 'boys' || videoAudience === 'girls') && (
                      <AgreeButton size="lg" checked={videoGuardianConsent} onChange={setVideoGuardianConsent}>I am the parent or legal guardian and approve using this child’s photo for this video.</AgreeButton>
                    )}
                    <button
                      type="button"
                      disabled={(videoAudience === 'boys' || videoAudience === 'girls') && !videoGuardianConsent}
                      onClick={() => setVideoStage('pick')}
                      className="tf-btn tf-btn-primary !min-h-16 w-full text-lg"
                    >
                      Pick a piece <ArrowRight className="h-5 w-5" />
                    </button>
                  </div>
                ) : (
                  <div className="tv-photo-actions grid gap-5 md:grid-cols-2">
                    <button type="button" onClick={() => void openCameraFor('video-person')} className="tv-photo-action flex min-h-[220px] flex-col items-center justify-center gap-6 rounded-3xl bg-ink p-8 text-center text-white shadow-lg">
                      <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10"><Camera className="h-12 w-12" /></span>
                      <span className="block text-4xl font-bold">Open the camera</span>
                    </button>
                    <PhonePhotoTransfer
                      onPhoto={(photo) => receivePhotoForConfirm('video-person', photo)}
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
                    <div className="grid grid-cols-3 gap-3 pb-36">
                      {videoBrowseProducts.map((item, index) => {
                        const picked = selectedProduct.sku === item.sku;
                        return (
                          <button key={item.sku} type="button" aria-pressed={picked} onClick={() => chooseVideoPiece(item)} className={`relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white text-left transition ${picked ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-line-strong'}`}>
                            <span className="relative block h-[176px] w-full bg-canvas">
                              <img src={item.thumbnailUrl || item.imageUrl} alt="" loading={index < 15 ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-contain" />
                              {picked && <span className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink text-white"><CheckCircle2 className="h-6 w-6" /></span>}
                            </span>
                            <span className="block px-3 py-2"><span className="block truncate text-base font-semibold text-ink">{item.title}</span>{item.price > 0 && <span className="block text-lg font-bold tabular-nums text-ink">₹{item.price.toLocaleString('en-IN')}</span>}</span>
                          </button>
                        );
                      })}
                    </div>
                    {videoBrowseProducts.length === 0 && <div className="tf-card p-10 text-center"><p className="text-2xl font-bold">No pieces here yet</p><p className="mt-2 text-muted">Ask our staff to switch pieces on for AI Video.</p></div>}
                  </div>
                  <div className="tv-selection-bar fixed left-1/2 z-30 flex max-w-[1016px] -translate-x-1/2 items-center justify-between gap-4 backdrop-blur">
                    <div className="flex min-w-0 items-center gap-3">
                      <img src={selectedProduct.thumbnailUrl || selectedProduct.imageUrl} alt="" className="h-14 w-11 rounded-lg border-2 border-white bg-canvas object-cover" />
                      <p className="truncate text-lg font-semibold">{selectedProduct.title}{selectedProduct.price > 0 && <span className="ml-2 tabular-nums">· ₹{selectedProduct.price.toLocaleString('en-IN')}</span>}</p>
                    </div>
                    <button
                      type="button"
                      disabled={!videoPersonPhoto || !videoBrowseProducts.some((item) => item.sku === selectedProduct.sku) || ((videoAudience === 'boys' || videoAudience === 'girls') && !videoGuardianConsent)}
                      onClick={() => setVideoStage('look')}
                      className="tf-btn tf-btn-primary !min-h-16 shrink-0 px-8 text-lg"
                    >
                      Pick a location <ArrowRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {videoStage === 'look' && (
              <section className="mx-auto flex min-h-[calc(100dvh-280px)] max-w-[760px] flex-col gap-6">
                <div className="flex items-center justify-between gap-4">
                  <PageTitle size="lg" title="Pick a location for your video" subtitle="Your portrait is made in this scene, then the video brings it to life." />
                  <button type="button" onClick={() => setVideoStage('pick')} className="group flex shrink-0 items-center gap-3 rounded-2xl border border-line bg-white p-2 pr-4 text-left hover:border-ink">
                    <img src={selectedProduct.thumbnailUrl || selectedProduct.imageUrl} alt="" className="h-16 w-13 rounded-lg object-cover" />
                    <span className="text-sm font-semibold text-muted group-hover:text-ink">Change<br />piece</span>
                  </button>
                </div>
                <div className="space-y-5">
                  {videoLooks.map((look) => {
                    const picked = videoConceptId === look.id;
                    return (
                      <button
                        key={look.id}
                        type="button"
                        aria-pressed={picked}
                        onClick={() => setVideoConceptId(look.id)}
                        className={`flex w-full items-center gap-5 rounded-3xl border bg-white p-7 text-left shadow-sm transition ${picked ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-line-strong'}`}
                      >
                        <span className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl ${picked ? 'bg-ink text-white' : 'bg-brand-soft text-brand'}`}>
                          <MapPin className="h-10 w-10" strokeWidth={1.5} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-3xl font-bold text-ink">{look.title}</span>
                          <span className="mt-1.5 block text-xl text-muted">{look.mood}</span>
                        </span>
                        {picked && <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-white"><CheckCircle2 className="h-7 w-7" /></span>}
                      </button>
                    );
                  })}
                  {videoLooks.length === 0 && <div className="tf-card p-10 text-center"><p className="text-xl font-bold">No locations set up yet</p><p className="mt-2 text-muted">Ask our staff to switch on AI Video locations.</p></div>}
                </div>
                <PosterFill clientName={clientName} />
                <div className="tv-selection-bar fixed left-1/2 z-30 flex max-w-[1016px] -translate-x-1/2 items-center justify-between gap-4 backdrop-blur">
                  <p className="truncate text-lg font-semibold">{selectedProduct.title}</p>
                  <button
                    type="button"
                    disabled={!videoConceptId || videoGeneratingMaster}
                    onClick={() => { setPortraitRetryUsed(false); void generateCatalogueVideoMasterOnTv(); }}
                    className="tf-btn tf-btn-primary !min-h-16 shrink-0 px-8 text-lg"
                  >
                    <Sparkles className="h-5 w-5" /> Generate image
                  </button>
                </div>
              </section>
            )}

            {videoStage === 'portrait' && (
              <section className="mx-auto max-w-[1180px] space-y-4" aria-live="polite">
                <div className="flex items-center justify-between gap-4">
                  <PageTitle size="lg" title={videoGeneratingMaster ? 'Creating your portrait' : 'Your portrait'} subtitle={videoGeneratingMaster ? 'About 20 seconds.' : videoStatusNote} />
                  {videoMasterUrl && !videoGeneratingMaster && (
                    <HelpRetry
                      size="tv"
                      text={{ ...HELP_TEXT.portrait, retryText: 'We make it once more with the same photo and piece.' }}
                      canRetry={!portraitRetryUsed}
                      onRetry={retryPortrait}
                      extra={{ label: 'Choose another piece', onClick: () => { chooseVideoPiece(selectedProduct); setVideoStage('pick'); } }}
                    />
                  )}
                </div>
                {videoGeneratingMaster ? (
                  <div className="tf-card flex min-h-[420px] flex-col items-center justify-center gap-4 p-8 text-center">
                    <DressLoader size="lg" title={`Dressing you in ${selectedProduct.title}`} />
                  </div>
                ) : videoMasterUrl ? (
                  <>
                    <div className="overflow-hidden rounded-2xl border border-line bg-ink">
                      <img src={videoMasterUrl} alt="Your portrait" className="mx-auto aspect-[9/16] max-h-[78vh] w-full object-contain" />
                    </div>
                    {!videoPortraitApproved ? (
                      // One look at the portrait before the QR appears: Generate video also approves it,
                      // so the phone can start the video itself the moment the QR is scanned.
                      !videoPassQr && !videoPassCreating ? (
                        <div className="tf-card space-y-3 p-6 text-center">
                          <p className="text-lg text-danger">{videoStatusNote || 'Could not prepare the video pass.'}</p>
                          <button type="button" onClick={() => void createCatalogueVideoPass(selectedProduct, selectedEventId, videoMasterUrl, videoMasterSessionId)} className="tf-btn tf-btn-primary !min-h-16 w-full text-lg">
                            <RefreshCw className="h-5 w-5" /> Try again
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={videoApproving || !videoPassQr}
                          onClick={() => void approveVideoPortrait()}
                          className="tf-btn tf-btn-primary !min-h-20 w-full text-xl"
                        >
                          {videoApproving ? <LoaderCircle className="h-6 w-6 animate-spin" /> : <Sparkles className="h-6 w-6" />}
                          {videoApproving ? 'Confirming…' : !videoPassQr ? 'Preparing…' : 'Generate video'}
                        </button>
                      )
                    ) : (
                      // The same pinned QR card as Try-On: made on its own, no button to tap first.
                      <div className="tf-card sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-5 p-6 shadow-xl">
                        <div className="flex-1">
                          <h3 className="text-2xl font-bold">Scan to see your AI Video</h3>
                          <p className="mt-1 text-base text-muted">The video starts the moment you scan. Then download it, send it on WhatsApp or show it on our Go Live screen. It works for 1 day.</p>
                        </div>
                        <div className="flex h-44 w-44 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white">
                          {videoPassQr ? <img src={videoPassQr} alt="Scan to make your AI Video on your phone" className="h-full w-full object-contain" /> : <LoaderCircle className="h-9 w-9 animate-spin text-muted" />}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="tf-card space-y-4 p-8 text-center">
                    <p className="text-xl">{videoStatusNote || 'Your portrait could not be created.'}</p>
                    <button type="button" onClick={() => void generateCatalogueVideoMasterOnTv()} className="tf-btn tf-btn-primary !min-h-16 px-8 text-lg"><RefreshCw className="h-5 w-5" /> Try again</button>
                  </div>
                )}
                {/* 2 minutes to scan, make the video and download or Go Live on the phone, the last minute in red,
                    then the session ends on its own. Starts once the QR actually shows. Retry makes the
                    portrait once more. */}
                {videoMasterUrl && videoPortraitApproved && !videoGeneratingMaster && (
                  <>
                    <SessionTimer key={videoPassQr} label="Download or Go Live within" onExpire={endSession} />
                    <div className={`grid gap-3 ${portraitRetryUsed ? '' : 'grid-cols-2'}`}>
                      {!portraitRetryUsed && <button type="button" onClick={retryPortrait} className="tf-btn tf-btn-secondary !min-h-20 w-full text-xl"><RefreshCw className="h-5 w-5" /> Retry</button>}
                      <button type="button" onClick={endSession} className="tf-btn !min-h-20 w-full bg-danger text-xl font-bold text-white hover:bg-danger/90">End session</button>
                    </div>
                  </>
                )}
              </section>
            )}
          </div>
        )}

        {/* The tablet is run by the store's team, who choose whom to give the gift: no bill digits here (the
            TV, used by customers on their own, still asks for them). New customer makes the next QR. */}
        {mode === 'wall-qr' && isTablet && <TabletWallQr clientName={clientName} />}
      </div>

      {/* =========================================================
          FULL-SCREEN CAMERA. The feed fills the whole screen, like a real camera; the header, the guide
          frame, the upload QR and the controls all float over it. The customer's photo has the QR, in the
          top-right corner, to send one from the phone instead; the outfit photo is taken with the camera
          only (no QR).
         ========================================================= */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black text-white" role="dialog" aria-modal="true" aria-label={cameraTarget === 'own-garment' ? 'Photograph your outfit' : 'Take your photo'}>
          {pendingPhoto ? (
            // The just-taken (or phone-sent) photo, full screen: confirmed right here, no second preview page.
            <img src={pendingPhoto} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="absolute inset-0 h-full w-full object-cover [transform:scaleX(-1)]"
            />
          )}

          {/* Header: the store's own logo (or its initial) over a soft gradient, so the feed stays full screen. */}
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-4 bg-gradient-to-b from-black/75 via-black/35 to-transparent p-4 sm:p-6">
            <div className="flex min-w-0 items-center gap-3">
              {storeLogo
                ? <img src={storeLogo} alt={clientName} className="h-11 max-w-[140px] shrink-0 rounded-lg bg-white/95 object-contain p-1.5" />
                : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">{clientName.replace(/^The\s+/i, '').charAt(0) || 'T'}</span>}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white/70">{clientName}</p>
                <p className="text-2xl font-bold">{pendingPhoto ? 'Looking good?' : cameraTarget === 'own-garment' ? 'Your outfit' : 'Your photo'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setCameraOpen(false);
                setPendingPhoto('');
              }}
              className="flex min-h-16 shrink-0 items-center gap-2 rounded-xl border-2 border-white bg-white px-5 text-base font-bold text-ink hover:bg-canvas"
            >
              <X className="h-5 w-5" />
              Close camera
            </button>
          </div>

          {!pendingPhoto && (
            <>
              {/* Kids: Boys or Girls on the camera screen, before the photo, so the right outfits follow. */}
              {kidsOnCamera && (
                <div className="absolute inset-x-6 top-24 z-20 mx-auto max-w-md sm:top-28">
                  <KidsSwitch value={kidPick} onChange={chooseKid} disabled={countdown !== null} />
                </div>
              )}

              {/* The upload-from-phone QR, a floating card in the corner, not a side column, so the camera reads full screen. */}
              {isPersonTarget(cameraTarget) && (
                <div className="absolute right-4 top-24 z-10 w-[200px] sm:right-6 sm:top-28 sm:w-[220px]">
                  <PhonePhotoTransfer inline onPhoto={(photo) => receivePhotoForConfirm(cameraTarget, photo)} />
                </div>
              )}

              <div className="pointer-events-none absolute inset-x-10 inset-y-28 rounded-2xl border border-dashed border-white/40 sm:inset-x-20" />

              <div className={`pointer-events-none absolute inset-x-0 flex justify-center px-4 ${kidsOnCamera ? 'top-48 sm:top-52' : 'top-24 sm:top-28'}`}>
                <p className="rounded-full bg-ink px-6 py-2 text-center text-lg font-semibold shadow-lg">
                  {cameraTarget === 'own-garment' ? 'Hold the whole outfit in the frame' : 'Step back so your whole body is in the frame'}
                </p>
              </div>

              {countdown !== null && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="tabular-nums text-[220px] font-bold leading-none text-white drop-shadow-lg">{countdown}</span>
                </div>
              )}

              {cameraError && (
                <div className="absolute inset-x-6 bottom-40 z-10 mx-auto max-w-xl rounded-xl bg-black/85 p-4 text-center text-base text-amber-200">
                  <p>{cameraError}</p>
                  <p className="mt-1 text-white/80">{isPersonTarget(cameraTarget) ? 'Use the QR in the corner to send a photo from your phone.' : 'Choose a photo file below instead.'}</p>
                </div>
              )}
            </>
          )}

          {/* Controls float over the bottom of the feed, with a soft gradient so they stay readable. */}
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-5 bg-gradient-to-t from-black/80 via-black/30 to-transparent pb-8 pt-16 sm:pb-10">
            {pendingPhoto ? (
              // Confirm right here: Retry sits where the capture button was, Use this photo is the one next step.
              // A child's photo also waits on the guardian's tick.
              <div className="w-full max-w-xl space-y-4 px-6">
              {kidsOnCamera && (
                <AgreeButton size="lg" checked={tryOnGuardianConsent} onChange={setTryOnGuardianConsent}>I am the parent or guardian and approve using this child’s photo.</AgreeButton>
              )}
              <div className="grid grid-cols-2 gap-4">
                <button type="button" onClick={retryPendingPhoto} className="tf-btn !min-h-20 w-full border-2 border-white bg-white text-xl font-bold text-ink hover:bg-canvas">
                  <RefreshCw className="h-6 w-6" /> Retry
                </button>
                <button type="button" disabled={kidsOnCamera && (!kidPick || !tryOnGuardianConsent)} onClick={confirmPendingPhoto} className="tf-btn tf-btn-primary !min-h-20 w-full text-xl font-bold disabled:opacity-50">
                  <Check className="h-6 w-6" /> Use this photo
                </button>
              </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-center gap-8">
                  <button
                    type="button"
                    onClick={triggerCountdownCapture}
                    disabled={countdown !== null || shutterLocked}
                    className="flex flex-col items-center disabled:opacity-50"
                    aria-label="Take the photo in 5 seconds"
                  >
                    <span className="flex h-[112px] w-[112px] items-center justify-center rounded-full border-4 border-white bg-brand shadow-2xl">
                      <Camera className="h-12 w-12 text-white" />
                    </span>
                    <span className="mt-1.5 text-sm font-semibold text-white drop-shadow">{shutterLocked ? 'Tap Boys or Girls first' : 'Take photo · 5 s'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openCameraFor(cameraTarget)}
                    className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white bg-white text-ink shadow-lg"
                    aria-label="Restart the camera"
                  >
                    <RefreshCw className="h-7 w-7" />
                  </button>
                </div>
                {/* A garment is photographed off the store rail with the camera only: no file upload here. */}
                {cameraTarget !== 'own-garment' && (
                  <label className="flex min-h-16 cursor-pointer items-center gap-2 rounded-xl border-2 border-white bg-white px-5 text-base font-bold text-ink hover:bg-canvas">
                    <Upload className="h-4 w-4" />
                    Choose a photo file instead
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileUpload(cameraTarget, e.target.files?.[0])}
                    />
                  </label>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-ml-2 inline-flex min-h-16 items-center gap-2.5 rounded-xl px-3 text-lg font-semibold text-muted hover:bg-line/60 hover:text-ink">
      <ArrowLeft className="h-6 w-6" /> Back
    </button>
  );
}

/**
 * AI Video above a minimum bill, on the TV: the last four digits of the customer's bill, typed on
 * a large on-screen number pad (showroom screens often have no keyboard).
 */
function BillDigitsGate({ value, onChange, onContinue, action }: { value: string; onChange: (value: string) => void; onContinue: () => void; action: string }) {
  const press = (key: string) => onChange(key === 'back' ? value.slice(0, -1) : (value + key).slice(0, 4));
  return (
    <section className="tf-card mx-auto max-w-2xl space-y-6 p-8 text-center">
      <h2 className="text-4xl font-bold">Enter the last four digits of your bill</h2>
      <p className="text-lg text-muted">Our staff will tell you which four digits to enter.</p>
      <div aria-label="Last four digits of bill number" aria-live="polite" className="mx-auto flex w-full max-w-sm justify-center gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} className={`flex h-20 w-16 items-center justify-center rounded-2xl border text-4xl font-bold tabular-nums ${value[index] ? 'border-ink bg-white' : 'border-line-strong bg-canvas text-subtle'}`}>{value[index] || ''}</span>
        ))}
      </div>
      <div className="mx-auto grid w-full max-w-sm grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'].map((key) => key === ''
          ? <span key="blank" />
          : (
            <button key={key} type="button" onClick={() => press(key)} disabled={key !== 'back' && value.length >= 4} className="flex min-h-16 items-center justify-center rounded-2xl border border-line bg-white text-3xl font-semibold tabular-nums active:bg-line disabled:opacity-40">
              {key === 'back' ? '⌫' : key}
            </button>
          ))}
      </div>
      <button type="button" disabled={value.length !== 4} onClick={onContinue} className="tf-btn tf-btn-primary !min-h-16 w-full max-w-sm text-lg">{action}</button>
    </section>
  );
}

/** The bottom of the TV's first screen: the store's own logo (from its workspace), or its name. */
/** The store's own banner, filling empty space at the bottom of a Who screen: its logo (or name) and a
    short line of welcome, so the screen never ends on bare canvas. */
/**
 * "My own outfit": a garment on a hanger inside a camera frame, in the project's line-art style (brand
 * stroke, brand-soft fill), sized to fill its box rather than sit as a small centred icon. Used on the
 * Store collection / My own outfit card and on the own-garment photo placeholder.
 */
function OwnOutfitIllustration({ className = 'h-40 w-40' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
      <rect x="10" y="10" width="180" height="180" rx="28" fill="var(--color-brand-soft, #F8EEF0)" />
      <path d="M26 30 h16 M26 30 v16 M174 30 h-16 M174 30 v16 M26 170 h16 M26 170 v-16 M174 170 h-16 M174 170 v-16"
        stroke="var(--color-ink, #1A1C1B)" strokeOpacity="0.25" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="100" cy="52" r="7" fill="none" stroke="var(--color-brand, #7A1428)" strokeWidth="3" />
      <path d="M100 59 V72" stroke="var(--color-brand, #7A1428)" strokeWidth="3" strokeLinecap="round" />
      <path d="M66 72 L100 72 L134 72 L156 96 L134 94 L134 158 Q134 164 128 164 L72 164 Q66 164 66 158 L66 94 L44 96 Z"
        fill="#FFFFFF" stroke="var(--color-brand, #7A1428)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M86 72 Q100 90 114 72" fill="none" stroke="var(--color-brand, #7A1428)" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="150" cy="150" r="24" fill="var(--color-ink, #1A1C1B)" />
      <rect x="138" y="141" width="24" height="18" rx="4" fill="none" stroke="#FFFFFF" strokeWidth="2.5" />
      <circle cx="150" cy="150" r="5.5" fill="none" stroke="#FFFFFF" strokeWidth="2.5" />
    </svg>
  );
}

/**
 * The tablet's Wall QR tab: the store's one permanent Try-On QR, shown large so a customer can scan it
 * from the counter, and as a printable poster to paste anywhere in the store. It opens Try-On on the
 * customer's own phone and never changes.
 */
function TabletWallQr({ clientName }: { clientName: string }) {
  const [link, setLink] = useState('');
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/api/maharaja/workspace', { cache: 'no-store' })
      .then((response) => response.json())
      .then(async (data) => {
        const url = data?.workspace?.links?.tryOn;
        if (!active) return;
        if (typeof url !== 'string' || !url) { setError('The Wall QR could not be loaded. Sign in again from the workspace.'); return; }
        setLink(url);
        setQr(await QRCode.toDataURL(url, { width: 520, margin: 1, color: { dark: '#161918', light: '#FFFFFF' } }));
      })
      .catch(() => { if (active) setError('The Wall QR could not be loaded. Check the connection.'); });
    return () => { active = false; };
  }, []);
  return (
    <section className="mx-auto max-w-[900px] space-y-5" aria-label="Wall QR">
      <PageTitle size="lg" title="Wall QR" subtitle="Customers scan it to try outfits on their own phone. It never changes." />
      <div className="tf-card flex flex-col items-center gap-6 p-8 text-center">
        <div className="flex aspect-square w-full max-w-[420px] items-center justify-center rounded-2xl border border-line bg-white p-4">
          {qr ? <img src={qr} alt={`${clientName} Try-On QR`} className="h-full w-full object-contain" /> : error ? <p className="text-lg text-danger">{error}</p> : <LoaderCircle className="h-10 w-10 animate-spin text-muted" />}
        </div>
        <p className="max-w-xl text-lg text-muted">Print it and paste it near the trial rooms, the mirrors or the billing counter. Each phone gets one free look.</p>
        <button
          type="button"
          disabled={!link}
          onClick={() => void downloadBrandedQr({ storeName: clientName, filename: `${clientName.replace(/[^a-z0-9]+/gi, '-') || 'Store'}-Try-On-wall-QR.png`, title: 'Try-On', subtitle: 'Scan to try our outfits on your phone', targetUrl: link })}
          className="tf-btn tf-btn-primary !min-h-16 px-10 text-lg"
        >
          <Printer className="h-5 w-5" /> Download the poster to print
        </button>
      </div>
    </section>
  );
}
