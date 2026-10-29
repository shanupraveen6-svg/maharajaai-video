'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Camera,
  Download,
  Film,
  LoaderCircle,
  Shirt,
  Sparkles,
  Upload,
} from 'lucide-react';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import {
  catalogueCategories,
  sampleCatalogue,
  type CatalogueCategoryId,
  type TryFocusProduct,
} from '@/lib/tryfocus/sample-data';

type MobileFlow = 'image-tryon' | 'ai-video';

export default function MaharajaMobileExperience() {
  const [flow, setFlow] = useState<MobileFlow>('image-tryon');
  const [sourceMode, setSourceMode] = useState<'catalogue' | 'own-garment'>('catalogue');
  const [genderFilter, setGenderFilter] = useState<'women' | 'men'>('women');
  const [activeCategory, setActiveCategory] = useState<CatalogueCategoryId>('sarees');
  const [selectedProduct, setSelectedProduct] = useState<TryFocusProduct>(sampleCatalogue[0]);

  // Image 1 = Customer Photo, Image 2 = Garment Photo
  const [personPhoto, setPersonPhoto] = useState<string>('');
  const [ownGarmentPhoto, setOwnGarmentPhoto] = useState<string>('');

  // Generation state
  const [generatingImage, setGeneratingImage] = useState<boolean>(false);
  const [resultImageUrl, setResultImageUrl] = useState<string>('');
  const [statusNote, setStatusNote] = useState<string>('');

  // Video + Go Live state
  const [videoPassCode, setVideoPassCode] = useState('');

  const filteredCategories = catalogueCategories.filter((cat) => cat.gender === genderFilter);
  const categoryProducts = sampleCatalogue.filter((item) => item.category === activeCategory && item.newArrivalOnly !== true);

  function handleFileRead(setter: (val: string) => void, file?: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setter(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function runMobileGeneration() {
    const garmentImg =
      sourceMode === 'own-garment'
        ? ownGarmentPhoto
        : selectedProduct.garmentReferenceUrl || selectedProduct.imageUrl;

    if (!personPhoto || !garmentImg) {
      setStatusNote('Add your photo and choose an outfit first.');
      return;
    }

    setGeneratingImage(true);
    setStatusNote('');
    const sessionId = `mobile_${flow}_${Date.now()}`;

    try {
      const res = await fetch('/api/ai/master-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          service: 'try-on',
          templateId: selectedProduct.gender,
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
      if (res.ok && data?.masterImageUrl) {
        setResultImageUrl(data.masterImageUrl);
        setStatusNote('Your look is ready.');
      } else {
        setResultImageUrl('');
        setStatusNote(data?.error || 'Image generation failed. Please try again.');
      }
    } catch {
      setResultImageUrl('');
      setStatusNote('Image generation could not connect. Please try again.');
    } finally {
      setGeneratingImage(false);
    }
  }

  return (
    <main className="mobile-workspace min-h-screen bg-[#F4F5F2] text-[#161918]">
      {/* Unified TryFocus Mobile Header */}
      <header className="sticky top-0 z-30 border-b border-[#D8DCD7] bg-[#F4F5F2]/95 px-4 py-3.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center border border-[#161918] bg-[#161918] font-mono text-xs font-bold tracking-widest text-[#FAF6EE]">
              TF
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A1428]">
                TryFocus × Majestic Maharaja
              </p>
              <h1 className="font-serif text-base font-semibold text-[#161918]">Your private style room</h1>
            </div>
          </div>

          <Link
            href="/maharaja/try-on"
            className="shrink-0 border border-[#161918] bg-white px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#161918]"
          >
            Help
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-5 px-4 py-5">
        {/* Flow Switcher: AI Image Try-On vs 1-Day AI Video Pass */}
        <div className="grid grid-cols-2 border border-[#D8DCD7] bg-white p-1">
          <button
            type="button"
            onClick={() => {
              setFlow('image-tryon');
            }}
            className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold uppercase tracking-[0.14em] ${
              flow === 'image-tryon' ? 'bg-[#7A1428] text-white' : 'text-[#161918]'
            }`}
          >
            <Shirt className="h-3.5 w-3.5" />
            Try a look
          </button>
          <button
            type="button"
            onClick={() => setFlow('ai-video')}
            className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold uppercase tracking-[0.14em] ${
              flow === 'ai-video' ? 'bg-[#7A1428] text-white' : 'text-[#161918]'
            }`}
          >
            <Film className="h-3.5 w-3.5" />
            Create video
          </button>
        </div>

        {/* Status Pill */}
        <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-3.5 text-xs text-[#535A56]">
          {flow === 'image-tryon' ? (
            <p>Choose a garment, add your photo, and keep the finished look on your phone.</p>
          ) : (
            <p>Scan the QR from the store or enter your 24-hour video pass code to continue.</p>
          )}
        </div>

        {flow === 'ai-video' && (
          <section className="space-y-4 border border-[#D8DCD7] bg-white p-4">
            <h2 className="font-serif text-xl font-semibold">Continue with your video pass</h2>
            <p className="text-sm text-[#535A56]">Your video is created on your phone after the store issues a QR or link. Download and Go Live appear only when your video is ready.</p>
            <label className="block text-sm font-semibold" htmlFor="video-pass-code">Video pass code</label>
            <input id="video-pass-code" value={videoPassCode} onChange={(event) => setVideoPassCode(event.target.value.trim())} className="min-h-12 w-full border border-[#D8DCD7] px-3 text-base" autoComplete="off" />
            <Link href={videoPassCode ? `/maharaja/video/${encodeURIComponent(videoPassCode)}` : '#'} aria-disabled={!videoPassCode} className={`flex min-h-12 items-center justify-center bg-[#7A1428] px-4 text-sm font-semibold text-white ${!videoPassCode ? 'pointer-events-none opacity-50' : ''}`}>Open my video experience</Link>
          </section>
        )}

        {flow === 'image-tryon' && <>

        {/* Step 1: Image 1 (Customer Photo) */}
        <section className="border border-[#D8DCD7] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A1428]">
                Step 1
              </span>
              <h2 className="font-serif text-lg font-semibold text-[#161918]">
                Add your photo
              </h2>
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 bg-[#161918] px-3.5 py-2 text-xs font-semibold text-white">
              <Camera className="h-3.5 w-3.5" />
              {personPhoto ? 'Change Photo' : 'Upload / Camera'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileRead(setPersonPhoto, e.target.files?.[0])}
              />
            </label>
          </div>
          {personPhoto && (
            <img
              src={personPhoto}
              alt="Customer"
              className="mt-3 h-40 w-32 border border-[#D8DCD7] object-cover"
            />
          )}
        </section>

        {/* Step 2: Image 2 (Store Catalogue or Own Garment) */}
        <section className="border border-[#D8DCD7] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D8DCD7] pb-3">
            <div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A1428]">
                Step 2
              </span>
              <h2 className="font-serif text-lg font-semibold text-[#161918]">
                Choose your outfit
              </h2>
            </div>
            <div className="flex border border-[#D8DCD7] bg-[#F4F5F2] p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setSourceMode('catalogue')}
                className={`px-2.5 py-1 ${
                  sourceMode === 'catalogue' ? 'bg-[#7A1428] text-white' : 'text-[#535A56]'
                }`}
              >
                Store styles
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('own-garment')}
                className={`px-2.5 py-1 ${
                  sourceMode === 'own-garment' ? 'bg-[#7A1428] text-white' : 'text-[#535A56]'
                }`}
              >
                My garment
              </button>
            </div>
          </div>

          {sourceMode === 'catalogue' ? (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex border border-[#D8DCD7] bg-[#FAFBF8] p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setGenderFilter('women');
                      setActiveCategory('sarees');
                    }}
                    className={`px-3 py-1 ${
                      genderFilter === 'women' ? 'bg-[#161918] text-white' : 'text-[#535A56]'
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
                    className={`px-3 py-1 ${
                      genderFilter === 'men' ? 'bg-[#161918] text-white' : 'text-[#535A56]'
                    }`}
                  >
                    Men
                  </button>
                </div>

                <div className="flex flex-wrap gap-1">
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
              </div>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {categoryProducts.map((item) => (
                  <button
                    key={item.sku}
                    type="button"
                    onClick={() => setSelectedProduct(item)}
                    className={`border p-1 text-left ${
                      selectedProduct.sku === item.sku
                        ? 'border-[#7A1428] bg-[#7A1428]/10 ring-1 ring-[#7A1428]'
                        : 'border-[#D8DCD7] bg-[#FAFBF8]'
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
              <p className="text-xs font-semibold text-[#161918]">
                Selected: {selectedProduct.title}
              </p>
            </div>
          ) : (
            <div className="mt-3">
              <label className="flex cursor-pointer items-center justify-center gap-2 border border-dashed border-[#161918] bg-[#FAFBF8] py-4 text-xs font-bold uppercase tracking-wider text-[#161918]">
                <Upload className="h-4 w-4" />
                {ownGarmentPhoto ? 'Replace Garment Photo' : 'Upload / Capture Garment Photo'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileRead(setOwnGarmentPhoto, e.target.files?.[0])}
                />
              </label>
              {ownGarmentPhoto && (
                <img
                  src={ownGarmentPhoto}
                  alt="Garment"
                  className="mt-3 h-40 w-32 border border-[#D8DCD7] object-cover"
                />
              )}
            </div>
          )}

          <button
            type="button"
            disabled={generatingImage}
            onClick={runMobileGeneration}
            className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 bg-[#7A1428] px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-[#FAF6EE] disabled:opacity-50"
          >
            {generatingImage ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Create my look
              </>
            )}
          </button>

          {statusNote && (
            <p className="mt-3 border border-[#D8DCD7] bg-[#FAFBF8] p-2.5 text-xs text-[#535A56]">
              {statusNote}
            </p>
          )}
        </section>

        {/* Result appears only after the customer creates a look. */}
        {resultImageUrl && <section className="space-y-4 border border-[#D8DCD7] bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A1428]">
              Your look
              </p>
              <h3 className="font-serif text-lg font-semibold text-[#161918]">
              Before and after
              </h3>
            </div>
            <a
              href={resultImageUrl || selectedProduct.imageUrl}
              download={`maharaja-tryon-${selectedProduct.sku.toLowerCase()}.jpg`}
              className="flex items-center gap-1.5 bg-[#161918] px-3 py-2 font-mono text-[10px] font-bold uppercase text-white"
            >
              <Download className="h-3.5 w-3.5" />
              Download Image
            </a>
          </div>

          <BeforeAfterSlider
            beforeImage={personPhoto || selectedProduct.imageUrl}
            afterImage={resultImageUrl || selectedProduct.imageUrl}
            beforeLabel="Old / Current Photo"
            afterLabel="New AI Try-On Dress"
          />

        </section>}
        </>}
      </div>
    </main>
  );
}
