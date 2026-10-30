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
} from 'lucide-react';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import TabletVideoHandoff from '@/components/TabletVideoHandoff';
import {
  catalogueCategories,
  formatINR,
  sampleCatalogue,
  type CatalogueCategoryId,
  type TryFocusProduct,
} from '@/lib/tryfocus/sample-data';

export type TabletTab = 'own-garment' | 'catalogue' | 'video-pass';

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
          const qr = await createImageHandoff(data.masterImageUrl, resolvedSku, resolvedTitle);
          if (runId !== generationRun.current) return;
          setTryOnMobileQr(qr);
          setTryOnStatusNote('Scan to save this look on your phone. Private link expires in 15 minutes.');
        } catch (error) {
          setTryOnStatusNote(error instanceof Error ? error.message : 'Phone QR unavailable.');
        }
      } else {
        setTryOnResultUrl('');
        setTryOnStatusNote(data?.error || 'Image generation failed. Please retry.');
      }
    } catch {
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
              onClick={() => setTab('own-garment')}
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
              onClick={() => setTab('catalogue')}
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
            TAB 1: OWN GARMENT TRY-ON (1st Place & Default)
           ========================================================= */}
        {tab === 'own-garment' && (
          <div className="space-y-6">
            <div className="grid gap-6 border border-[#D8DCD7] bg-white p-6 lg:grid-cols-2">
              <div className="col-span-full">
                {(genderFilter === 'boys' || genderFilter === 'girls') && (
                  <label className="my-2 flex min-h-14 items-center gap-3 border border-[#D8DCD7] bg-white p-4 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={guardianConsent}
                      onChange={(event) => setGuardianConsent(event.target.checked)}
                      className="h-6 w-6 accent-[#7A1428]"
                    />
                    I am the parent or legal guardian and approve using this child’s photo for this experience.
                  </label>
                )}
              </div>

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
                    Photograph customer and the outfit they brought for an instant transformation.
                  </p>
                </div>

                {/* Audience / Gender Filter */}
                <div>
                  <label className="block font-mono text-[11px] font-bold uppercase tracking-wider text-[#535A56]">
                    Target Audience
                  </label>
                  <div className="mt-1.5 grid grid-cols-4 gap-2 text-xs font-bold">
                    {(['women', 'men', 'boys', 'girls'] as const).map((audience) => (
                      <button
                        key={audience}
                        type="button"
                        aria-pressed={genderFilter === audience}
                        onClick={() => setGenderFilter(audience)}
                        className={`min-h-11 border px-2 capitalize transition ${
                          genderFilter === audience
                            ? 'border-[#7A1428] bg-[#7A1428] text-white'
                            : 'border-[#D8DCD7] bg-white text-[#161918] hover:border-[#161918]'
                        }`}
                      >
                        {audience}
                      </button>
                    ))}
                  </div>
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

                {/* Box 1: Customer Photo (Image 1) */}
                <div className="border-2 border-[#D8DCD7] bg-[#FAFBF8] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#7A1428]">
                        Image 1 · Customer Photo
                      </span>
                      <p className="text-[11px] text-[#535A56]">Full standing pose recommended</p>
                    </div>
                    <label className="flex cursor-pointer items-center gap-1.5 bg-[#161918] px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#2C3330]">
                      <Camera className="h-4 w-4" />
                      Take / Choose Photo
                      <input
                        type="file"
                        accept="image/*"
                        capture="user"
                        className="hidden"
                        onChange={(e) => handleFileRead(setPersonPhoto, e.target.files?.[0])}
                      />
                    </label>
                  </div>
                  {personPhoto ? (
                    <div className="mt-3 flex items-center gap-4">
                      <img
                        src={personPhoto}
                        alt="Customer portrait"
                        className="aspect-[9/16] h-40 border-2 border-[#161918] object-cover shadow-sm"
                      />
                      <div className="text-xs text-[#535A56]">
                        <p className="font-semibold text-[#161918]">Photo Loaded</p>
                        <p className="mt-1">Vertical 9:16 portrait format ready.</p>
                        <button
                          type="button"
                          onClick={() => setPersonPhoto('')}
                          className="mt-2 text-xs font-bold text-[#B42318] underline"
                        >
                          Clear & retake
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex aspect-[9/16] max-h-36 w-full items-center justify-center border border-dashed border-[#D8DCD7] bg-white text-xs text-[#535A56]">
                      <div className="text-center">
                        <User className="mx-auto h-8 w-8 text-[#7A1428]" />
                        <span className="mt-1 block font-semibold">No customer photo yet</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Box 2: Customer's Own Garment (Image 2) */}
                <div className="border-2 border-[#D8DCD7] bg-[#FAFBF8] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#7A1428]">
                        Image 2 · Customer&apos;s Own Garment
                      </span>
                      <p className="text-[11px] text-[#535A56]">Clear photo of the outfit / saree</p>
                    </div>
                    <label className="flex cursor-pointer items-center gap-1.5 bg-[#7A1428] px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#600F1F]">
                      <Upload className="h-4 w-4" />
                      Photograph Garment
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handleFileRead(setOwnGarmentPhoto, e.target.files?.[0])}
                      />
                    </label>
                  </div>
                  {ownGarmentPhoto ? (
                    <div className="mt-3 flex items-center gap-4">
                      <img
                        src={ownGarmentPhoto}
                        alt="Customer's own garment"
                        className="aspect-[9/16] h-40 border-2 border-[#7A1428] object-cover shadow-sm"
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

                {/* Primary Action Button */}
                <button
                  type="button"
                  disabled={tryOnGenerating || !personPhoto || !ownGarmentPhoto}
                  onClick={() => handleGenerateTryOn('own-garment')}
                  className="flex min-h-14 w-full items-center justify-center gap-2 bg-[#7A1428] px-6 py-3 text-sm font-bold uppercase tracking-[0.16em] text-white shadow-md transition hover:bg-[#600F1F] disabled:opacity-40"
                >
                  {tryOnGenerating ? (
                    <>
                      <LoaderCircle className="h-5 w-5 animate-spin" />
                      Generating Own-Garment AI Look...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5 text-[#F3E5AB]" />
                      Create Own-Garment Look
                    </>
                  )}
                </button>

                {tryOnStatusNote && (
                  <p className="border border-[#D8DCD7] bg-[#FAFBF8] p-3 text-xs text-[#535A56]">
                    {tryOnStatusNote}
                  </p>
                )}
              </div>

              {/* Right Column: Result + Before/After Slider + Mobile QR */}
              <div className="space-y-4 border border-[#D8DCD7] bg-[#FAFBF8] p-6">
                <div className="flex items-center justify-between border-b border-[#D8DCD7] pb-3">
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                      Result View
                    </p>
                    <h3 className="font-serif text-2xl font-semibold text-[#161918]">
                      Old vs. New Dress Slider
                    </h3>
                  </div>
                  {tryOnMobileQr && (
                    <div className="text-right">
                      <img
                        src={tryOnMobileQr}
                        alt="Mobile QR"
                        className="ml-auto h-18 w-18 border-2 border-[#161918] bg-white p-1"
                      />
                      <span className="mt-1 block font-mono text-[10px] font-bold text-[#7A1428]">
                        Scan to save
                      </span>
                    </div>
                  )}
                </div>

                <div className="mx-auto max-w-sm">
                  <BeforeAfterSlider
                    beforeImage={personPhoto || '/maharaja-logo.png'}
                    afterImage={tryOnResultUrl || ownGarmentPhoto || '/maharaja-logo.png'}
                    beforeLabel="Customer Original"
                    afterLabel="New AI Try-On"
                  />
                </div>

                <p className="text-center text-xs text-[#535A56]">
                  Slide horizontally to compare customer original look vs. generated AI try-on.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 2: STORE CATALOGUE TRY-ON (2nd Place)
           ========================================================= */}
        {tab === 'catalogue' && (
          <div className="space-y-6">
            <div className="grid gap-6 border border-[#D8DCD7] bg-white p-6 lg:grid-cols-2">
              <div className="col-span-full">
                {(genderFilter === 'boys' || genderFilter === 'girls') && (
                  <label className="my-2 flex min-h-14 items-center gap-3 border border-[#D8DCD7] bg-white p-4 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={guardianConsent}
                      onChange={(event) => setGuardianConsent(event.target.checked)}
                      className="h-6 w-6 accent-[#7A1428]"
                    />
                    I am the parent or legal guardian and approve using this child’s photo for this experience.
                  </label>
                )}
              </div>

              {/* Left Column: Store Catalogue Inputs */}
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

                {/* Audience filter */}
                <div className="grid grid-cols-4 gap-2 text-xs font-bold">
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
                      className={`min-h-11 border px-2 capitalize transition ${
                        genderFilter === audience
                          ? 'border-[#7A1428] bg-[#7A1428] text-white'
                          : 'border-[#D8DCD7] bg-white text-[#161918]'
                      }`}
                    >
                      {audience}
                    </button>
                  ))}
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

                {/* Box 1: Customer Photo */}
                <div className="border-2 border-[#D8DCD7] bg-[#FAFBF8] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#7A1428]">
                        Customer Photo
                      </span>
                      <p className="text-[11px] text-[#535A56]">Full standing pose recommended</p>
                    </div>
                    <label className="flex cursor-pointer items-center gap-1.5 bg-[#161918] px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#2C3330]">
                      <Camera className="h-4 w-4" />
                      Take / Choose Photo
                      <input
                        type="file"
                        accept="image/*"
                        capture="user"
                        className="hidden"
                        onChange={(e) => handleFileRead(setPersonPhoto, e.target.files?.[0])}
                      />
                    </label>
                  </div>
                  {personPhoto ? (
                    <div className="mt-3 flex items-center gap-4">
                      <img
                        src={personPhoto}
                        alt="Customer portrait"
                        className="aspect-[9/16] h-36 border-2 border-[#161918] object-cover shadow-sm"
                      />
                      <div className="text-xs text-[#535A56]">
                        <p className="font-semibold text-[#161918]">Photo Loaded</p>
                        <button
                          type="button"
                          onClick={() => setPersonPhoto('')}
                          className="mt-2 text-xs font-bold text-[#B42318] underline"
                        >
                          Clear & retake
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex aspect-[9/16] max-h-28 w-full items-center justify-center border border-dashed border-[#D8DCD7] bg-white text-xs text-[#535A56]">
                      <span>Upload customer photo</span>
                    </div>
                  )}
                </div>

                {/* Box 2: Store Garment Selection */}
                <div className="border-2 border-[#D8DCD7] bg-[#FAFBF8] p-4">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#7A1428]">
                    Selected Outfit: {selectedProduct.title} ({formatINR(selectedProduct.price)})
                  </span>
                  <div className="mt-3 grid grid-cols-5 gap-2">
                    {categoryProducts.map((item) => (
                      <button
                        key={item.sku}
                        type="button"
                        onClick={() => setSelectedProduct(item)}
                        className={`border p-1 text-left transition ${
                          selectedProduct.sku === item.sku
                            ? 'border-[#7A1428] bg-white ring-2 ring-[#7A1428] shadow'
                            : 'border-[#D8DCD7] bg-white hover:border-[#161918]'
                        }`}
                      >
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="aspect-[3/4] w-full object-cover"
                        />
                        <p className="mt-1 truncate font-mono text-[10px] font-bold text-[#161918]">
                          {item.title}
                        </p>
                        <p className="font-mono text-[10px] font-bold text-[#7A1428]">
                          {formatINR(item.price)}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Generate Button */}
                <button
                  type="button"
                  disabled={tryOnGenerating || !personPhoto}
                  onClick={() => handleGenerateTryOn('catalogue')}
                  className="flex min-h-14 w-full items-center justify-center gap-2 bg-[#7A1428] px-6 py-3 text-sm font-bold uppercase tracking-[0.16em] text-white shadow-md transition hover:bg-[#600F1F] disabled:opacity-40"
                >
                  {tryOnGenerating ? (
                    <>
                      <LoaderCircle className="h-5 w-5 animate-spin" />
                      Creating Catalogue Look...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5 text-[#F3E5AB]" />
                      Create Catalogue Look
                    </>
                  )}
                </button>

                {tryOnStatusNote && (
                  <p className="border border-[#D8DCD7] bg-[#FAFBF8] p-3 text-xs text-[#535A56]">
                    {tryOnStatusNote}
                  </p>
                )}
              </div>

              {/* Right Column: Result + Before/After Slider + Mobile QR */}
              <div className="space-y-4 border border-[#D8DCD7] bg-[#FAFBF8] p-6">
                <div className="flex items-center justify-between border-b border-[#D8DCD7] pb-3">
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                      Result View
                    </p>
                    <h3 className="font-serif text-2xl font-semibold text-[#161918]">
                      Old vs. New Dress Slider
                    </h3>
                  </div>
                  {tryOnMobileQr && (
                    <div className="text-right">
                      <img
                        src={tryOnMobileQr}
                        alt="Mobile QR"
                        className="ml-auto h-18 w-18 border-2 border-[#161918] bg-white p-1"
                      />
                      <span className="mt-1 block font-mono text-[10px] font-bold text-[#7A1428]">
                        Scan to save
                      </span>
                    </div>
                  )}
                </div>

                <div className="mx-auto max-w-sm">
                  <BeforeAfterSlider
                    beforeImage={personPhoto || selectedProduct.imageUrl}
                    afterImage={tryOnResultUrl || selectedProduct.imageUrl}
                    beforeLabel="Customer Photo"
                    afterLabel="Maharaja Look"
                  />
                </div>

                <p className="text-center text-xs text-[#535A56]">
                  Slide horizontally to compare customer original look vs. generated store look.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 3: AI VIDEO PASS & QR CODE (3rd Place · 1 Day Validity)
           ========================================================= */}
        {tab === 'video-pass' && <TabletVideoHandoff />}
      </div>
    </main>
  );
}
