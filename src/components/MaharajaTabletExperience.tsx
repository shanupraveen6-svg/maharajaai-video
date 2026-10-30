'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useStoreCatalogue } from '@/lib/maharaja/use-store-catalogue';
import { createImageHandoff } from '@/lib/maharaja/image-handoff-client';
import {
  Camera,
  CheckCircle2,
  Clock,
  LoaderCircle,
  QrCode,
  Shirt,
  Sparkles,
  Store,
  Upload,
  User,
  Video,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
} from 'lucide-react';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import TabletVideoHandoff from '@/components/TabletVideoHandoff';
import PhonePhotoTransfer from '@/components/PhonePhotoTransfer';
import {
  catalogueCategories,
  formatINR,
  sampleCatalogue,
  type CatalogueCategoryId,
  type TryFocusProduct,
} from '@/lib/tryfocus/sample-data';

export type TabletTab = 'own-garment' | 'catalogue' | 'video-pass';
export type TabletStep = 'photo' | 'garment';

const GARMENT_TYPE_OPTIONS: Record<TryFocusProduct['gender'], Array<{ id: string; label: string }>> = {
  women: [
    { id: 'saree', label: 'Silk Saree / Saree' },
    { id: 'lehenga', label: 'Lehenga Choli' },
    { id: 'salwar', label: 'Salwar / Anarkali' },
    { id: 'one_piece', label: 'Gown / Dress' },
    { id: 'two_piece', label: 'Two-Piece Set' },
  ],
  men: [
    { id: 'kurta_dhoti', label: 'Kurta & Dhoti / Pyjama' },
    { id: 'dhoti_veshti', label: 'Traditional Veshti & Shirt' },
    { id: 'shirt_pant', label: 'Formal Shirt & Pant' },
  ],
  girls: [
    { id: 'pattu_pavadai', label: 'Pattu Pavadai' },
    { id: 'lehenga', label: 'Kids Lehenga' },
    { id: 'one_piece', label: 'Silk Frock / Dress' },
  ],
  boys: [
    { id: 'boy_ethnic', label: 'Kurta Pyjama / Dhoti Set' },
    { id: 'shirt_pant', label: 'Shirt & Trousers' },
  ],
};

export default function MaharajaTabletExperience() {
  const generationRun = useRef(0);
  // Default to 1. Own Garment Try-On
  const [tab, setTab] = useState<TabletTab>('own-garment');
  // Strict 2-Step Process: Step 1 Photo -> Step 2 Garment Selection
  const [tabletStep, setTabletStep] = useState<TabletStep>('photo');

  // Audience & Catalogue state
  const [genderFilter, setGenderFilter] = useState<TryFocusProduct['gender']>('women');
  const catalogueItems = useStoreCatalogue();
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CatalogueCategoryId>('sarees');
  const [selectedProduct, setSelectedProduct] = useState<TryFocusProduct>(
    sampleCatalogue.find((item) => item.category === 'sarees') || sampleCatalogue[0]
  );

  // Own Garment selection
  const [ownGarmentType, setOwnGarmentType] = useState<string>('saree');

  // Customer & Garment Photos (Image 1 = Person, Image 2 = Garment)
  const [personPhoto, setPersonPhoto] = useState<string>('');
  const [ownGarmentPhoto, setOwnGarmentPhoto] = useState<string>('');
  const [tryOnGenerating, setTryOnGenerating] = useState<boolean>(false);
  const [tryOnResultUrl, setTryOnResultUrl] = useState<string>('');
  const [tryOnStatusNote, setTryOnStatusNote] = useState<string>('');
  const [tryOnMobileQr, setTryOnMobileQr] = useState<string>('');

  const filteredCategories = catalogueCategories.filter((cat) => cat.gender === genderFilter);
  const categoryProducts = catalogueItems.filter((item) => item.category === activeCategory);

  useEffect(() => {
    const first = catalogueItems.find((item) => item.category === activeCategory && item.gender === genderFilter);
    if (first) setSelectedProduct(first);
    setGuardianConsent(false);
    const options = GARMENT_TYPE_OPTIONS[genderFilter] || [];
    if (options[0]) setOwnGarmentType(options[0].id);
  }, [activeCategory, genderFilter, catalogueItems]);

  // Crop uploaded or tablet-captured photos to vertical 9:16 format
  function handleFileRead(setter: (val: string) => void, file?: File | null) {
    if (!file) return;
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

        let sx = 0, sy = 0, sWidth = vWidth, sHeight = vHeight;
        if (currentAspect > targetAspect) {
          sHeight = vHeight;
          sWidth = Math.round(vHeight * targetAspect);
          sx = Math.round((vWidth - sWidth) / 2);
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
          setter(canvas.toDataURL('image/jpeg', 0.88));
        } else {
          setter(rawDataUrl);
        }
      };
      img.onerror = () => setter(rawDataUrl);
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  }

  function resetCustomerSession() {
    generationRun.current += 1;
    setPersonPhoto('');
    setOwnGarmentPhoto('');
    setTryOnResultUrl('');
    setTryOnMobileQr('');
    setTryOnStatusNote('');
    setGuardianConsent(false);
    setTryOnGenerating(false);
    setTabletStep('photo');
  }

  function tryAnotherGarment() {
    generationRun.current += 1;
    setOwnGarmentPhoto('');
    setTryOnResultUrl('');
    setTryOnMobileQr('');
    setTryOnStatusNote('');
    setTryOnGenerating(false);
    setTabletStep('garment');
  }

  async function handleGenerateTryOn(modeType: 'own-garment' | 'catalogue') {
    if ((genderFilter === 'boys' || genderFilter === 'girls') && !guardianConsent) {
      setTryOnStatusNote('A parent or guardian must approve the child’s photo first.');
      return;
    }

    const garmentImg =
      modeType === 'own-garment'
        ? ownGarmentPhoto
        : selectedProduct.garmentReferenceUrl || selectedProduct.imageUrl;

    if (!personPhoto || !garmentImg) {
      setTryOnStatusNote(
        modeType === 'own-garment'
          ? 'Add both customer photo and customer’s own garment photo first.'
          : 'Add customer photo and select a store garment first.'
      );
      return;
    }

    const runId = ++generationRun.current;
    setTryOnGenerating(true);
    setTryOnMobileQr('');
    setTryOnStatusNote('');
    const sessionId = `tablet_tryon_${Date.now()}`;

    const resolvedGarmentType =
      modeType === 'own-garment' ? ownGarmentType : selectedProduct.garmentType;
    const resolvedTitle =
      modeType === 'own-garment'
        ? `Customer ${GARMENT_TYPE_OPTIONS[genderFilter]?.find((g) => g.id === ownGarmentType)?.label || 'Own Garment'}`
        : selectedProduct.title;
    const resolvedSku =
      modeType === 'own-garment'
        ? `OWN-${Date.now().toString().slice(-6)}`
        : selectedProduct.sku;

    try {
      const res = await fetch('/api/ai/master-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          service: 'try-on',
          templateId: genderFilter === 'boys' ? 'boy' : genderFilter === 'girls' ? 'girl' : genderFilter,
          guardianProcessingConsent: guardianConsent,
          catalogueProductId: modeType === 'catalogue' ? selectedProduct.sku : resolvedSku,
          catalogueProductTitle: resolvedTitle,
          catalogueProductCategory: modeType === 'catalogue' ? selectedProduct.category : (ownGarmentType || 'own'),
          garmentType: resolvedGarmentType,
          garmentTypeConfirmed: true,
          processingConsent: true,
          consentVersion: '2026-10-privacy-v2',
          personPhoto,
          garmentPhotos: [garmentImg],
          garmentRoles: ['Primary Garment Reference'],
          garmentAnalysis:
            modeType === 'own-garment'
              ? `${resolvedTitle} (${resolvedGarmentType})`
              : `${selectedProduct.title} (${selectedProduct.fabricNote || ''})`,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (runId !== generationRun.current) return;

      if (res.ok && data?.masterImageUrl) {
        setTryOnResultUrl(data.masterImageUrl);
        setTryOnStatusNote('Your look is ready. Preparing your private phone QR…');
        try {
          const qr = await createImageHandoff(data.masterImageUrl, resolvedSku, resolvedTitle, {
            category: modeType === 'catalogue' ? selectedProduct.category : ownGarmentType,
            garmentType: resolvedGarmentType,
            gender: genderFilter,
          });
          if (runId !== generationRun.current) return;
          setTryOnMobileQr(qr);
          setTryOnStatusNote('Scan to save this look on your phone. Private link expires in 15 minutes.');
        } catch (error) {
          if (runId !== generationRun.current) return;
          setTryOnStatusNote(error instanceof Error ? error.message : 'Phone QR unavailable.');
        }
      } else {
        if (runId !== generationRun.current) return;
        setTryOnResultUrl('');
        setTryOnStatusNote(data?.error || 'Image generation failed. Please retry.');
      }
    } catch {
      if (runId !== generationRun.current) return;
      setTryOnResultUrl('');
      setTryOnStatusNote('Image generation could not connect. Please retry.');
    } finally {
      if (runId === generationRun.current) setTryOnGenerating(false);
    }
  }

  return (
    <main className="tablet-workspace min-h-screen bg-[#F4F5F2] text-[#161918]">
      {/* Unified Tablet Header with 3 Core Modes */}
      <header className="sticky top-0 z-30 border-b border-[#D8DCD7] bg-[#F4F5F2]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center border border-[#161918] bg-[#161918] font-mono text-xs font-bold tracking-widest text-[#FAF6EE]">
              TF
            </span>
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7A1428]">
                TryFocus × The Majestic Maharaja · Counter Tablet
              </p>
              <h1 className="font-serif text-lg font-semibold text-[#161918]">Counter assistant</h1>
            </div>
          </div>

          {/* 3 Main Modes Navigation: 1 Own Garment, 2 Store Catalogue, 3 AI Video Pass */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={resetCustomerSession}
              className="min-h-11 border border-[#D8DCD7] bg-white px-3.5 text-xs font-semibold hover:border-[#161918]"
            >
              New customer
            </button>

            {/* Mode 1: Own Garment Try-On (Default) */}
            <button
              type="button"
              onClick={() => {
                setTab('own-garment');
              }}
              className={`flex min-h-11 items-center gap-1.5 border px-3.5 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${
                tab === 'own-garment'
                  ? 'border-[#7A1428] bg-[#7A1428] text-white shadow-sm'
                  : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918] hover:border-[#161918]'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              1. Own Garment
            </button>

            {/* Mode 2: Store Catalogue Try-On */}
            <button
              type="button"
              onClick={() => {
                setTab('catalogue');
              }}
              className={`flex min-h-11 items-center gap-1.5 border px-3.5 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${
                tab === 'catalogue'
                  ? 'border-[#7A1428] bg-[#7A1428] text-white shadow-sm'
                  : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918] hover:border-[#161918]'
              }`}
            >
              <Store className="h-3.5 w-3.5" />
              2. Store Catalogue
            </button>

            {/* Mode 3: AI Video Pass (QR Code) */}
            <button
              type="button"
              onClick={() => setTab('video-pass')}
              className={`flex min-h-11 items-center gap-1.5 border px-3.5 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${
                tab === 'video-pass'
                  ? 'border-[#7A1428] bg-[#7A1428] text-white shadow-sm'
                  : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918] hover:border-[#161918]'
              }`}
            >
              <QrCode className="h-3.5 w-3.5" />
              3. AI Video Pass (QR)
            </button>

            <Link
              href="/maharaja/workspace"
              className="border border-[#D8DCD7] bg-white px-3 py-2 text-xs font-semibold text-[#161918] hover:border-[#161918]"
            >
              Workspace
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-6 sm:px-8">
        {/* =========================================================
            MODES 1 & 2: STRICT 2-STEP TRY-ON FLOW (STEP 1 PHOTO -> STEP 2 GARMENTS)
           ========================================================= */}
        {tab !== 'video-pass' && (
          <div className="space-y-6">
            {/* 2-Step Process Stepper Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 border border-[#D8DCD7] bg-white p-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setTabletStep('photo')}
                  className={`flex items-center gap-2 border px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
                    tabletStep === 'photo'
                      ? 'border-[#7A1428] bg-[#7A1428] text-white shadow-sm'
                      : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918] hover:border-[#7A1428]'
                  }`}
                >
                  <span>Step 1</span>
                  <span>· Customer Photo {personPhoto ? '✓' : ''}</span>
                </button>

                <span className="text-[#8C938F]">→</span>

                <button
                  type="button"
                  disabled={!personPhoto}
                  onClick={() => setTabletStep('garment')}
                  className={`flex items-center gap-2 border px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
                    tabletStep === 'garment'
                      ? 'border-[#7A1428] bg-[#7A1428] text-white shadow-sm'
                      : personPhoto
                      ? 'border-[#161918] bg-white text-[#161918] hover:border-[#7A1428]'
                      : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#8C938F] opacity-50'
                  }`}
                >
                  <span>Step 2</span>
                  <span>· Select Garments</span>
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs font-semibold text-[#535A56]">
                <span>Active Mode:</span>
                <span className="font-bold text-[#7A1428]">
                  {tab === 'own-garment' ? '1. Own Garment Try-On' : '2. Store Catalogue Try-On'}
                </span>
              </div>
            </div>

            {/* ---------------------------------------------------------
                STEP 1: CUSTOMER PHOTO (Take Photo or Upload Photo via QR)
               --------------------------------------------------------- */}
            {tabletStep === 'photo' && (
              <div className="space-y-6">
                {/* Child Guardian Consent */}
                {(genderFilter === 'boys' || genderFilter === 'girls') && (
                  <label className="flex min-h-14 items-center gap-3 border border-[#D8DCD7] bg-white p-4 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={guardianConsent}
                      onChange={(event) => setGuardianConsent(event.target.checked)}
                      className="h-6 w-6 accent-[#7A1428]"
                    />
                    I am the parent or legal guardian and approve using this child’s photo for this experience.
                  </label>
                )}

                {/* Audience Selection */}
                <div className="border border-[#D8DCD7] bg-white p-5">
                  <span className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#7A1428]">
                    Who is this look for?
                  </span>
                  <div className="mt-2 grid grid-cols-4 gap-2 text-xs font-bold">
                    {(['women', 'men', 'boys', 'girls'] as const).map((audience) => (
                      <button
                        key={audience}
                        type="button"
                        aria-pressed={genderFilter === audience}
                        onClick={() => {
                          setGenderFilter(audience);
                          const firstCat = catalogueCategories.find((cat) => cat.gender === audience);
                          if (firstCat) setActiveCategory(firstCat.id);
                        }}
                        className={`min-h-12 border px-3 capitalize font-bold transition ${
                          genderFilter === audience
                            ? 'border-[#7A1428] bg-[#7A1428] text-white shadow-sm'
                            : 'border-[#D8DCD7] bg-white text-[#161918] hover:border-[#161918]'
                        }`}
                      >
                        {audience}
                      </button>
                    ))}
                  </div>
                </div>

                {/* If NO photo captured yet: Show 2 Large Action Buttons */}
                {!personPhoto ? (
                  <div className="border border-[#D8DCD7] bg-white p-6 sm:p-8">
                    <div className="mx-auto max-w-xl text-center">
                      <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#7A1428]">
                        Step 1 · Customer Photo
                      </span>
                      <h2 className="mt-1 font-serif text-3xl font-semibold text-[#161918]">
                        Add Customer Photo
                      </h2>
                      <p className="mt-2 text-sm text-[#535A56]">
                        Take a portrait photo directly using the tablet camera, or let the customer scan a QR code to upload from their smartphone gallery.
                      </p>
                    </div>

                    <div className="mx-auto mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
                      {/* Button 1: Take Photo */}
                      <label className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3 border-2 border-[#161918] bg-[#FAFBF8] p-6 text-center transition hover:border-[#7A1428] hover:bg-[#FAF6EE]">
                        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#161918] text-white">
                          <Camera className="h-7 w-7" />
                        </span>
                        <div>
                          <span className="block font-serif text-xl font-semibold text-[#161918]">
                            Take Photo
                          </span>
                          <span className="mt-1 block text-xs text-[#535A56]">
                            Tablet camera (vertical 9:16 format)
                          </span>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          capture="user"
                          className="hidden"
                          onChange={(e) => handleFileRead(setPersonPhoto, e.target.files?.[0])}
                        />
                      </label>

                      {/* Button 2: Upload Photo (via Mobile QR) */}
                      <PhonePhotoTransfer
                        onPhoto={(photo) => setPersonPhoto(photo)}
                        renderTrigger={(open, busy) => (
                          <button
                            type="button"
                            onClick={open}
                            disabled={busy}
                            className="flex min-h-[160px] w-full flex-col items-center justify-center gap-3 border-2 border-[#161918] bg-[#FAFBF8] p-6 text-center transition hover:border-[#7A1428] hover:bg-[#FAF6EE] disabled:opacity-50"
                          >
                            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#7A1428] text-white">
                              {busy ? (
                                <LoaderCircle className="h-7 w-7 animate-spin" />
                              ) : (
                                <QrCode className="h-7 w-7" />
                              )}
                            </span>
                            <div>
                              <span className="block font-serif text-xl font-semibold text-[#161918]">
                                {busy ? 'Preparing QR…' : 'Upload Photo'}
                              </span>
                              <span className="mt-1 block text-xs text-[#535A56]">
                                Show QR code for customer phone
                              </span>
                            </div>
                          </button>
                        )}
                      />
                    </div>

                    <div className="mt-6 text-center">
                      <label className="cursor-pointer font-mono text-xs font-semibold text-[#535A56] hover:text-[#161918] underline">
                        Or choose photo file from tablet storage
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleFileRead(setPersonPhoto, e.target.files?.[0])}
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  /* If photo is present: 9:16 portrait review with Retake & Next buttons */
                  <div className="mx-auto max-w-2xl border border-[#D8DCD7] bg-white p-6 sm:p-8 text-center">
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#7A1428]">
                      <CheckCircle2 className="h-4 w-4" />
                      Customer Photo Confirmed
                    </span>
                    <h2 className="mt-1 font-serif text-3xl font-semibold text-[#161918]">
                      Review portrait photo
                    </h2>
                    <p className="mt-1 text-xs text-[#535A56]">
                      Ensure the person’s posture and face are clearly visible in 9:16 vertical portrait format.
                    </p>

                    <div className="mt-5 flex justify-center">
                      <img
                        src={personPhoto}
                        alt="Customer portrait preview"
                        className="aspect-[9/16] h-[440px] border-4 border-[#161918] object-cover shadow-xl"
                      />
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setPersonPhoto('')}
                        className="flex min-h-14 items-center justify-center gap-2 border-2 border-[#161918] bg-white px-5 text-sm font-bold text-[#161918] hover:bg-[#FAFBF8]"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Retake Photo
                      </button>
                      <button
                        type="button"
                        onClick={() => setTabletStep('garment')}
                        className="flex min-h-14 items-center justify-center gap-2 bg-[#7A1428] px-5 text-base font-bold text-white shadow-md hover:bg-[#601020]"
                      >
                        Next: Select Garments →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ---------------------------------------------------------
                STEP 2: SELECT GARMENTS & CREATE TRY-ON LOOKS
               --------------------------------------------------------- */}
            {tabletStep === 'garment' && (
              <div className="space-y-6">
                {/* Confirmed Customer Photo Card with Change Photo button */}
                <div className="flex flex-wrap items-center justify-between gap-4 border border-[#D8DCD7] bg-white p-4">
                  <div className="flex items-center gap-3">
                    {personPhoto && (
                      <img
                        src={personPhoto}
                        alt="Customer photo"
                        className="aspect-[9/16] h-12 border border-[#161918] object-cover shadow-sm"
                      />
                    )}
                    <div>
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7A1428]">
                        Step 1 · Customer Photo Confirmed ✓
                      </span>
                      <p className="text-sm font-semibold text-[#161918]">
                        Step 2: Choose outfit & create look
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setTabletStep('photo')}
                    className="flex min-h-10 items-center gap-1.5 border border-[#161918] bg-white px-3 py-1.5 text-xs font-bold hover:bg-[#FAFBF8]"
                  >
                    ← Change / Retake Photo
                  </button>
                </div>

                {/* Sub-Mode 1: Own Garment Try-On */}
                {tab === 'own-garment' && (
                  <div className="grid gap-6 border border-[#D8DCD7] bg-white p-6 lg:grid-cols-2">
                    {/* Left Column: Own Garment Inputs */}
                    <div className="space-y-5">
                      <div className="border-b border-[#D8DCD7] pb-3">
                        <span className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#7A1428]">
                          Mode 1 · Own Garment AI Try-On
                        </span>
                        <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                          Try customer’s own dress or saree
                        </h2>
                        <p className="mt-1 text-xs text-[#535A56]">
                          Photograph or upload the outfit they brought for an instant transformation.
                        </p>
                      </div>

                      {/* Garment Type Selector */}
                      <div>
                        <label className="block font-mono text-[11px] font-bold uppercase tracking-wider text-[#535A56]">
                          Select Garment Type
                        </label>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {(GARMENT_TYPE_OPTIONS[genderFilter] || []).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setOwnGarmentType(opt.id)}
                              className={`border px-3 py-1.5 text-xs font-semibold transition ${
                                ownGarmentType === opt.id
                                  ? 'border-[#161918] bg-[#161918] text-white'
                                  : 'border-[#D8DCD7] bg-white text-[#161918] hover:border-[#161918]'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Garment Photo Input (Image 2) */}
                      <div className="border-2 border-[#D8DCD7] bg-[#FAFBF8] p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#7A1428]">
                              Customer&apos;s Own Garment
                            </span>
                            <p className="text-[11px] text-[#535A56]">Clear photo of the outfit / saree</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="flex cursor-pointer items-center gap-1.5 bg-[#7A1428] px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#600F1F]">
                              <Camera className="h-4 w-4" />
                              Tablet Camera
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={(e) => handleFileRead(setOwnGarmentPhoto, e.target.files?.[0])}
                              />
                            </label>
                            <PhonePhotoTransfer
                              onPhoto={(photo) => setOwnGarmentPhoto(photo)}
                              buttonLabel="Phone QR"
                              renderTrigger={(open, busy) => (
                                <button
                                  type="button"
                                  onClick={open}
                                  disabled={busy}
                                  className="flex items-center gap-1.5 border border-[#161918] bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider hover:bg-[#FAFBF8]"
                                >
                                  <QrCode className="h-3.5 w-3.5 text-[#7A1428]" />
                                  Phone QR
                                </button>
                              )}
                            />
                          </div>
                        </div>

                        {ownGarmentPhoto ? (
                          <div className="mt-3 flex items-center gap-4">
                            <img
                              src={ownGarmentPhoto}
                              alt="Customer's own garment"
                              className="aspect-[9/16] h-44 border-2 border-[#7A1428] object-cover shadow-sm"
                            />
                            <div className="text-xs text-[#535A56]">
                              <p className="font-semibold text-[#161918]">Garment Loaded</p>
                              <p className="mt-1">Vertical 9:16 dress reference ready.</p>
                              <button
                                type="button"
                                onClick={() => setOwnGarmentPhoto('')}
                                className="mt-2 text-xs font-bold text-[#B42318] underline"
                              >
                                Clear & retake
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 flex aspect-[9/16] max-h-36 w-full items-center justify-center border border-dashed border-[#D8DCD7] bg-white text-xs text-[#535A56]">
                            <div className="text-center">
                              <Shirt className="mx-auto h-8 w-8 text-[#7A1428]" />
                              <span className="mt-1 block font-semibold">No garment photo yet</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Generate Button */}
                      <button
                        type="button"
                        disabled={!personPhoto || !ownGarmentPhoto || tryOnGenerating}
                        onClick={() => handleGenerateTryOn('own-garment')}
                        className="flex min-h-14 w-full items-center justify-center gap-2 bg-[#7A1428] px-5 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-md hover:bg-[#600F1F] disabled:opacity-40"
                      >
                        {tryOnGenerating ? (
                          <>
                            <LoaderCircle className="h-5 w-5 animate-spin" />
                            Creating Own-Garment AI Look…
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-5 w-5" />
                            Generate AI Try-On
                          </>
                        )}
                      </button>

                      {tryOnStatusNote && (
                        <p className="text-xs font-medium text-[#7A1428]">{tryOnStatusNote}</p>
                      )}
                    </div>

                    {/* Right Column: Customer Result & Comparison */}
                    <div className="space-y-4 border border-[#D8DCD7] bg-[#FAFBF8] p-5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#7A1428]">
                          Customer Result
                        </span>
                        {tryOnResultUrl && (
                          <button
                            type="button"
                            onClick={tryAnotherGarment}
                            className="text-xs font-bold text-[#7A1428] underline"
                          >
                            Try Another Garment
                          </button>
                        )}
                      </div>
                      <h3 className="font-serif text-2xl font-semibold text-[#161918]">
                        Compare and save to phone
                      </h3>

                      <div className="relative aspect-[9/16] max-h-[500px] w-full overflow-hidden border-2 border-[#161918] bg-[#161918]">
                        <BeforeAfterSlider
                          beforeImage={personPhoto || '/maharaja-logo.png'}
                          afterImage={tryOnResultUrl || ownGarmentPhoto || '/maharaja-logo.png'}
                          beforeLabel="Customer Original"
                          afterLabel="New AI Try-On"
                        />
                      </div>

                      {tryOnMobileQr && (
                        <div className="flex items-center justify-between gap-4 border border-[#D8DCD7] bg-white p-4">
                          <div>
                            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7A1428]">
                              Scan & Download
                            </span>
                            <p className="mt-0.5 text-xs text-[#535A56]">
                              Scan this QR on phone to save the high-res look.
                            </p>
                          </div>
                          <img
                            src={tryOnMobileQr}
                            alt="Scan to save on phone"
                            className="h-24 w-24 object-contain"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Sub-Mode 2: Store Catalogue Try-On */}
                {tab === 'catalogue' && (
                  <div className="grid gap-6 border border-[#D8DCD7] bg-white p-6 lg:grid-cols-2">
                    {/* Left Column: Catalogue Browser & Selection */}
                    <div className="space-y-5">
                      <div className="border-b border-[#D8DCD7] pb-3">
                        <span className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#7A1428]">
                          Mode 2 · Store Catalogue AI Try-On
                        </span>
                        <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                          Try Maharaja silk sarees & outfits
                        </h2>
                        <p className="mt-1 text-xs text-[#535A56]">
                          Select an authentic Maharaja garment from the store inventory.
                        </p>
                      </div>

                      {/* Subcategory Pills */}
                      <div className="flex flex-wrap gap-1.5">
                        {filteredCategories.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setActiveCategory(cat.id)}
                            className={`border px-3 py-1.5 text-xs font-semibold transition ${
                              activeCategory === cat.id
                                ? 'border-[#161918] bg-[#161918] text-white'
                                : 'border-[#D8DCD7] bg-white text-[#161918]'
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>

                      {/* Garment Grid */}
                      <div className="grid max-h-[380px] grid-cols-3 gap-2 overflow-y-auto border border-[#D8DCD7] p-2 sm:grid-cols-4">
                        {categoryProducts.map((prod) => (
                          <button
                            key={prod.sku}
                            type="button"
                            onClick={() => setSelectedProduct(prod)}
                            className={`group relative flex flex-col overflow-hidden border p-1 text-left transition ${
                              selectedProduct.sku === prod.sku
                                ? 'border-[#7A1428] ring-2 ring-[#7A1428]'
                                : 'border-[#D8DCD7] bg-white hover:border-[#161918]'
                            }`}
                          >
                            <div className="aspect-[3/4] w-full overflow-hidden bg-[#ECEEE9]">
                              <img
                                src={prod.imageUrl}
                                alt={prod.title}
                                className="h-full w-full object-cover transition group-hover:scale-105"
                              />
                            </div>
                            <p className="mt-1 truncate text-[11px] font-semibold text-[#161918]">
                              {prod.title}
                            </p>
                            <p className="font-mono text-[10px] text-[#7A1428]">
                              {formatINR(prod.price)}
                            </p>
                          </button>
                        ))}
                      </div>

                      {/* Selected Product Card */}
                      <div className="flex items-center gap-3 border border-[#D8DCD7] bg-[#FAFBF8] p-3">
                        <img
                          src={selectedProduct.imageUrl}
                          alt={selectedProduct.title}
                          className="aspect-[3/4] h-16 border border-[#161918] object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-[10px] font-bold text-[#7A1428]">
                            Selected Outfit
                          </span>
                          <p className="truncate text-xs font-bold text-[#161918]">
                            {selectedProduct.title}
                          </p>
                          <p className="font-mono text-xs font-semibold text-[#161918]">
                            {formatINR(selectedProduct.price)}
                          </p>
                        </div>
                      </div>

                      {/* Generate Button */}
                      <button
                        type="button"
                        disabled={!personPhoto || tryOnGenerating}
                        onClick={() => handleGenerateTryOn('catalogue')}
                        className="flex min-h-14 w-full items-center justify-center gap-2 bg-[#7A1428] px-5 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-md hover:bg-[#600F1F] disabled:opacity-40"
                      >
                        {tryOnGenerating ? (
                          <>
                            <LoaderCircle className="h-5 w-5 animate-spin" />
                            Creating Catalogue AI Look…
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-5 w-5" />
                            Generate AI Try-On
                          </>
                        )}
                      </button>

                      {tryOnStatusNote && (
                        <p className="text-xs font-medium text-[#7A1428]">{tryOnStatusNote}</p>
                      )}
                    </div>

                    {/* Right Column: Customer Result & Comparison */}
                    <div className="space-y-4 border border-[#D8DCD7] bg-[#FAFBF8] p-5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#7A1428]">
                          Customer Result
                        </span>
                        {tryOnResultUrl && (
                          <button
                            type="button"
                            onClick={tryAnotherGarment}
                            className="text-xs font-bold text-[#7A1428] underline"
                          >
                            Try Another Garment
                          </button>
                        )}
                      </div>
                      <h3 className="font-serif text-2xl font-semibold text-[#161918]">
                        Compare and save to phone
                      </h3>

                      <div className="relative aspect-[9/16] max-h-[500px] w-full overflow-hidden border-2 border-[#161918] bg-[#161918]">
                        <BeforeAfterSlider
                          beforeImage={personPhoto || '/maharaja-logo.png'}
                          afterImage={tryOnResultUrl || selectedProduct.imageUrl}
                          beforeLabel="Customer Original"
                          afterLabel="New AI Try-On"
                        />
                      </div>

                      {tryOnMobileQr && (
                        <div className="flex items-center justify-between gap-4 border border-[#D8DCD7] bg-white p-4">
                          <div>
                            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7A1428]">
                              Scan & Download
                            </span>
                            <p className="mt-0.5 text-xs text-[#535A56]">
                              Scan this QR on phone to save the high-res look.
                            </p>
                          </div>
                          <img
                            src={tryOnMobileQr}
                            alt="Scan to save on phone"
                            className="h-24 w-24 object-contain"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            TAB 3: AI VIDEO PASS (QR CODE / HANDOFF)
           ========================================================= */}
        {tab === 'video-pass' && (
          <div className="space-y-6">
            <TabletVideoHandoff />
          </div>
        )}
      </div>
    </main>
  );
}
