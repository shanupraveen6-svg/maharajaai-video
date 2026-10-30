'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useStoreCatalogue } from '@/lib/maharaja/use-store-catalogue';
import { createImageHandoff } from '@/lib/maharaja/image-handoff-client';
import {
  Camera,
  Download,
  LoaderCircle,
  QrCode,
  Sparkles,
  Tablet,
  Upload,
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

type TabletTab = 'video-pass' | 'image-tryon';

export default function MaharajaTabletExperience() {
  const generationRun = useRef(0);
  const [tab, setTab] = useState<TabletTab>('video-pass');

  // Catalogue state
  const [genderFilter, setGenderFilter] = useState<TryFocusProduct['gender']>('women');
  const catalogueItems = useStoreCatalogue();
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CatalogueCategoryId>('sarees');
  const [selectedProduct, setSelectedProduct] = useState<TryFocusProduct>(sampleCatalogue.find((item) => item.category === 'sarees') || sampleCatalogue[0]);

  // Tab 2: Staff-Assisted AI Image Try-On state
  const [tryOnSource, setTryOnSource] = useState<'catalogue' | 'own-garment'>('catalogue');
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
  }, [activeCategory, genderFilter, catalogueItems]);

  function handleFileRead(setter: (val: string) => void, file?: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setter(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function handleGenerateImageTryOn() {
    if ((genderFilter === 'boys' || genderFilter === 'girls') && !guardianConsent) { setTryOnStatusNote('A parent or guardian must approve the child’s photo first.'); return; }
    const garmentImg =
      tryOnSource === 'own-garment'
        ? ownGarmentPhoto
        : selectedProduct.garmentReferenceUrl || selectedProduct.imageUrl;

    if (!personPhoto || !garmentImg) {
      setTryOnStatusNote('Add the customer photo and choose or photograph the garment.');
      return;
    }

    const runId = ++generationRun.current;
    setTryOnGenerating(true);
    setTryOnMobileQr('');
    setTryOnStatusNote('');
    const sessionId = `tablet_tryon_${Date.now()}`;

    try {
      const res = await fetch('/api/ai/master-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          service: 'try-on',
          templateId: genderFilter === 'boys' ? 'boy' : genderFilter === 'girls' ? 'girl' : genderFilter,
          guardianProcessingConsent: guardianConsent,
          catalogueProductId: tryOnSource === 'catalogue' ? selectedProduct.sku : undefined,
          catalogueProductTitle: tryOnSource === 'catalogue' ? selectedProduct.title : undefined,
          garmentType: selectedProduct.garmentType,
          garmentTypeConfirmed: true,
          processingConsent: true,
          consentVersion: '2026-10-privacy-v2',
          personPhoto,
          garmentPhotos: [garmentImg],
          garmentRoles: ['Primary Garment Reference'],
          garmentAnalysis: `${selectedProduct.title} (${selectedProduct.fabricNote})`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (runId !== generationRun.current) return;
      if (res.ok && data?.masterImageUrl) {
        setTryOnResultUrl(data.masterImageUrl);
        setTryOnStatusNote('Your look is ready. Preparing your private phone QR…');
        try {
          const qr = await createImageHandoff(data.masterImageUrl, selectedProduct.sku, selectedProduct.title);
          if (runId !== generationRun.current) return;
          setTryOnMobileQr(qr);
          setTryOnStatusNote('Scan to save this look on your phone. The private link expires in 15 minutes.');
        } catch (error) { setTryOnStatusNote(error instanceof Error ? error.message : 'Phone QR unavailable.'); }
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
      {/* Unified TryFocus Header */}
      <header className="sticky top-0 z-30 border-b border-[#D8DCD7] bg-[#F4F5F2]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
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

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { generationRun.current += 1; setPersonPhoto(''); setOwnGarmentPhoto(''); setTryOnResultUrl(''); setTryOnMobileQr(''); setTryOnStatusNote(''); setGuardianConsent(false); setTryOnGenerating(false); }} className="min-h-12 border border-[#D8DCD7] px-4 text-sm font-semibold">New customer</button>
            <button
              type="button"
              onClick={() => setTab('video-pass')}
              className={`flex items-center gap-1.5 border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                tab === 'video-pass'
                  ? 'border-[#7A1428] bg-[#7A1428] text-white'
                  : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918]'
              }`}
            >
              <Video className="h-3.5 w-3.5" />
              Create video pass
            </button>
            <button
              type="button"
              onClick={() => setTab('image-tryon')}
              className={`flex items-center gap-1.5 border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                tab === 'image-tryon'
                  ? 'border-[#7A1428] bg-[#7A1428] text-white'
                  : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918]'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Try-on assistant
            </button>
            <Link
              href="/maharaja/workspace"
              className="border border-[#D8DCD7] bg-white px-3.5 py-2 text-xs font-semibold text-[#161918]"
            >
              Workspace
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-6 sm:px-8">
        {/* =========================================================
            TAB 1: AI VIDEO PASS & GIVEAWAY (Direct QR when WhatsApp not connected)
           ========================================================= */}
        {tab === 'video-pass' && <TabletVideoHandoff />}

        {/* =========================================================
            TAB 2: STAFF-ASSISTED AI IMAGE TRY-ON (Catalogue + Own Garment + Slider)
           ========================================================= */}
        {tab === 'image-tryon' && (
          <div className="space-y-6">
            <div className="grid gap-6 border border-[#D8DCD7] bg-white p-6 lg:grid-cols-2">
              <div className="col-span-full">{(genderFilter === 'boys' || genderFilter === 'girls') && <label className="my-4 flex min-h-14 items-center gap-3 border border-[#D8DCD7] bg-white p-4 text-sm"><input type="checkbox" checked={guardianConsent} onChange={(event) => setGuardianConsent(event.target.checked)} className="h-6 w-6" />I am the parent or guardian and approve using this child’s photo for this experience.</label>}</div>
              {/* Left: Image 1 (Customer) + Image 2 (Catalogue or Own Garment) */}
              <div className="space-y-5">
                <div className="flex items-center justify-between border-b border-[#D8DCD7] pb-3">
                  <div>
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#7A1428]">
                      Staff-Assisted AI Image Try-On
                    </p>
                    <h3 className="font-serif text-xl font-semibold text-[#161918]">
                      Add customer photo and outfit
                    </h3>
                  </div>
                  <div className="flex border border-[#D8DCD7] bg-[#F4F5F2] p-0.5 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setTryOnSource('catalogue')}
                      className={`px-3 py-1.5 ${
                        tryOnSource === 'catalogue' ? 'bg-[#7A1428] text-white' : 'text-[#535A56]'
                      }`}
                    >
                      Store catalogue
                    </button>
                    <button
                      type="button"
                      onClick={() => setTryOnSource('own-garment')}
                      className={`px-3 py-1.5 ${
                        tryOnSource === 'own-garment' ? 'bg-[#7A1428] text-white' : 'text-[#535A56]'
                      }`}
                    >
                      Own Garment
                    </button>
                  </div>
                </div>

                {/* Upload Image 1: Customer Photo */}
                <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold uppercase text-[#7A1428]">
                      Customer photo
                    </span>
                    <label className="cursor-pointer bg-[#161918] px-3.5 py-1.5 text-xs font-semibold text-white">
                      Upload / Capture Person
                      <input
                        type="file"
                        accept="image/*"
                        capture="user"
                        className="hidden"
                        onChange={(e) => handleFileRead(setPersonPhoto, e.target.files?.[0])}
                      />
                    </label>
                  </div>
                  {personPhoto && (
                    <img
                      src={personPhoto}
                      alt="Customer"
                      className="mt-3 h-36 w-28 border border-[#D8DCD7] object-cover"
                    />
                  )}
                </div>

                {/* Image 2: Catalogue or Own Garment */}
                {tryOnSource === 'catalogue' ? (
                  <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold uppercase text-[#7A1428]">
                        Select store outfit
                      </span>
                      <div className="grid grid-cols-4 gap-2 text-xs font-semibold">{(['women', 'men', 'boys', 'girls'] as const).map((audience) => <button key={audience} type="button" aria-pressed={genderFilter === audience} onClick={() => { setGenderFilter(audience); setActiveCategory(catalogueCategories.find((cat) => cat.gender === audience)!.id); }} className={`min-h-12 px-2 capitalize ${genderFilter === audience ? 'bg-[#e6eee8] text-[#20352b]' : 'bg-white'}`}>{audience}</button>)}</div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {filteredCategories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setActiveCategory(cat.id)}
                          className={`border px-2.5 py-1 text-xs font-semibold ${
                            activeCategory === cat.id
                              ? 'border-[#7A1428] bg-[#7A1428] text-white'
                              : 'border-[#D8DCD7] bg-white text-[#161918]'
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3 grid grid-cols-5 gap-2">
                      {categoryProducts.map((item) => (
                        <button
                          key={item.sku}
                          type="button"
                          onClick={() => setSelectedProduct(item)}
                          className={`border p-1 text-left ${
                            selectedProduct.sku === item.sku
                              ? 'border-[#7A1428] bg-[#7A1428]/10 ring-1 ring-[#7A1428]'
                              : 'border-[#D8DCD7] bg-white'
                          }`}
                        >
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            className="aspect-[3/4] w-full object-cover"
                          />
                          <p className="mt-1 truncate font-mono text-[10px] font-bold">{item.title}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold uppercase text-[#7A1428]">
                        Add garment photo
                      </span>
                      <label className="cursor-pointer bg-[#161918] px-3.5 py-1.5 text-xs font-semibold text-white">
                        Upload / Capture Dress
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => handleFileRead(setOwnGarmentPhoto, e.target.files?.[0])}
                        />
                      </label>
                    </div>
                    {ownGarmentPhoto && (
                      <img
                        src={ownGarmentPhoto}
                        alt="Own Garment"
                        className="mt-3 h-36 w-28 border border-[#D8DCD7] object-cover"
                      />
                    )}
                  </div>
                )}

                <button
                  type="button"
                  disabled={tryOnGenerating}
                  onClick={handleGenerateImageTryOn}
                  className="flex min-h-12 w-full items-center justify-center gap-2 bg-[#7A1428] px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-[#FAF6EE] disabled:opacity-50"
                >
                  {tryOnGenerating ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Generating AI Try-On...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Create look
                    </>
                  )}
                </button>

                {tryOnStatusNote && (
                  <p className="border border-[#D8DCD7] bg-[#FAFBF8] p-3 text-xs text-[#535A56]">
                    {tryOnStatusNote}
                  </p>
                )}
              </div>

              {/* Right: Result + Mobile QR + Old vs New Dress Slider */}
              <div className="space-y-4 border border-[#D8DCD7] bg-[#FAFBF8] p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                      Customer result
                    </p>
                    <h4 className="font-serif text-xl font-semibold text-[#161918]">
                      Compare and save to phone
                    </h4>
                  </div>
                  {tryOnMobileQr && (
                    <img
                      src={tryOnMobileQr}
                      alt="Mobile QR"
                      className="h-16 w-16 border border-[#D8DCD7] bg-white p-1"
                    />
                  )}
                </div>

                <div className="mx-auto max-w-sm">
                  <BeforeAfterSlider
                    beforeImage={personPhoto || selectedProduct.imageUrl}
                    afterImage={tryOnResultUrl || selectedProduct.imageUrl}
                    beforeLabel="Old / Current Photo"
                    afterLabel="New AI Try-On Dress"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
