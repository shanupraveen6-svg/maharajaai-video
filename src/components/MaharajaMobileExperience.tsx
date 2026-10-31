'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useStoreCatalogue } from '@/lib/maharaja/use-store-catalogue';
import {
  Camera,
  Check,
  Download,
  Film,
  LoaderCircle,
  Shirt,
  Sparkles,
  Upload,
} from 'lucide-react';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import { compressImage } from '@/lib/utils/image';
import {
  catalogueCategories,
  sampleCatalogue,
  type CatalogueCategoryId,
  type TryFocusProduct,
} from '@/lib/tryfocus/sample-data';
import PhotoConsentNotice from '@/components/PhotoConsentNotice';
import { ActionBar, Segmented } from '@/components/ui';

type MobileFlow = 'image-tryon' | 'ai-video';

export default function MaharajaMobileExperience({ accessCode, videoEntryUrl, clientName = 'The Majestic Maharaja' }: { accessCode: string; videoEntryUrl: string; clientName?: string }) {
  const [flow, setFlow] = useState<MobileFlow>('image-tryon');
  const [sourceMode, setSourceMode] = useState<'catalogue' | 'own-garment'>('catalogue');
  const [genderFilter, setGenderFilter] = useState<TryFocusProduct['gender']>('women');
  const [activeCategory, setActiveCategory] = useState<CatalogueCategoryId>('sarees');
  const [selectedProduct, setSelectedProduct] = useState<TryFocusProduct>(sampleCatalogue.find((item) => item.category === 'sarees') || sampleCatalogue[0]);

  // Image 1 = Customer Photo, Image 2 = Garment Photo
  const [personPhoto, setPersonPhoto] = useState<string>('');
  const [ownGarmentPhoto, setOwnGarmentPhoto] = useState<string>('');

  // Generation state
  const [generatingImage, setGeneratingImage] = useState<boolean>(false);
  const [resultImageUrl, setResultImageUrl] = useState<string>('');
  const [statusNote, setStatusNote] = useState<string>('');

  // Video + Go Live state
  const [deviceId, setDeviceId] = useState('');
  useEffect(() => { const key = 'tryfocus:maharaja:device-id'; const value = localStorage.getItem(key) || crypto.randomUUID().replace(/-/g, ''); localStorage.setItem(key, value); setDeviceId(value); }, []);

  const catalogueItems = useStoreCatalogue(accessCode);
  const [guardianConsent, setGuardianConsent] = useState(false);
  const filteredCategories = catalogueCategories.filter((cat) => cat.gender === genderFilter);
  const categoryProducts = catalogueItems.filter((item) => item.category === activeCategory);

  useEffect(() => {
    const first = catalogueItems.find((item) => item.category === activeCategory && item.gender === genderFilter);
    if (first) setSelectedProduct(first);
    setGuardianConsent(false);
  }, [activeCategory, genderFilter, catalogueItems]);

  // Phone photos are often 4-8 MB; resizing keeps requests under the 4.5 MB serverless body limit.
  function handleFileRead(setter: (val: string) => void, file?: File | null) {
    if (!file) return;
    compressImage(file, 1280, 0.85)
      .then(({ dataUrl }) => setter(dataUrl))
      .catch((error) => setStatusNote(error instanceof Error ? error.message : 'This photo could not be read. Choose another photo.'));
  }

  async function runMobileGeneration() {
    if ((genderFilter === 'boys' || genderFilter === 'girls') && !guardianConsent) { setStatusNote('A parent or guardian must approve the child’s photo first.'); return; }
    if (sourceMode === 'catalogue' && !catalogueItems.some((item) => item.sku === selectedProduct.sku)) {
      setStatusNote('Choose a garment from this store’s catalogue.');
      return;
    }
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
          accessCode,
          deviceId,
          service: 'try-on',
          templateId: genderFilter === 'boys' ? 'boy' : genderFilter === 'girls' ? 'girl' : genderFilter,
          guardianProcessingConsent: guardianConsent,
          catalogueProductId: sourceMode === 'catalogue' ? selectedProduct.sku : undefined,
          catalogueProductTitle: sourceMode === 'catalogue' ? selectedProduct.title : undefined,
          garmentType: selectedProduct.garmentType,
          garmentTypeConfirmed: true,
          processingConsent: true,
          consentVersion: '2026-10-privacy-v3',
          personPhoto,
          garmentPhotos: [garmentImg],
          garmentRoles: ['Primary Garment Reference'],
          garmentAnalysis: `${selectedProduct.title} (${selectedProduct.fabricNote})`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.masterImageUrl) {
        setResultImageUrl(data.masterImageUrl);
        setStatusNote('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        // Best-effort automatic save of the finished look (an in-memory image, never stored on the server).
        const anchor = document.createElement('a');
        anchor.href = data.masterImageUrl;
        anchor.download = `tryfocus-look-${Date.now()}.jpg`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
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

  const garmentReady = sourceMode === 'own-garment' ? Boolean(ownGarmentPhoto) : Boolean(selectedProduct);
  const needsGuardian = (genderFilter === 'boys' || genderFilter === 'girls') && !guardianConsent;
  const canCreate = Boolean(personPhoto) && garmentReady && !needsGuardian && !generatingImage;

  return (
    <main className="mobile-workspace min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">{clientName.replace(/^The\s+/i, '').charAt(0) || 'T'}</span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-ink">{clientName}</h1>
              <p className="text-[13px] text-muted">Private try-on on your phone</p>
            </div>
          </div>
          <Link href="/maharaja/try-on" className="flex min-h-10 shrink-0 items-center rounded-xl px-3 text-sm font-semibold text-muted hover:text-ink">Help</Link>
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-4 px-4 pt-4">
        <Segmented
          label="What would you like to do"
          value={flow}
          onChange={setFlow}
          options={[
            { value: 'image-tryon', label: <><Shirt className="h-4 w-4" /> Try on</> },
            { value: 'ai-video', label: <><Film className="h-4 w-4" /> AI video</> },
          ]}
        />

        {flow === 'ai-video' && (
          <section className="tf-card space-y-3 p-5">
            <h2 className="text-xl font-bold">Your festival video</h2>
            <p className="text-[15px] text-muted">Add your photo and outfit to get a short festival film. Your private session lasts 24 hours, so you can download it or show it on the store screen.</p>
            <Link href={videoEntryUrl} className="tf-btn tf-btn-primary w-full">Start my video</Link>
          </section>
        )}

        {flow === 'image-tryon' && <>
          {resultImageUrl && (
            <section id="mobile-result" className="tf-card overflow-hidden">
              <BeforeAfterSlider
                beforeImage={personPhoto || selectedProduct.imageUrl}
                afterImage={resultImageUrl}
                beforeLabel="You"
                afterLabel="New look"
              />
              <div className="flex gap-3 p-4">
                <a href={resultImageUrl} download={`tryfocus-look-${selectedProduct.sku.toLowerCase()}.jpg`} className="tf-btn tf-btn-dark flex-1">
                  <Download className="h-4 w-4" /> Save photo
                </a>
                <button type="button" onClick={() => { setResultImageUrl(''); setStatusNote(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="tf-btn tf-btn-secondary flex-1">Try another</button>
              </div>
            </section>
          )}

          <section className="tf-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">1. Your photo</h2>
              {personPhoto && <span className="text-sm font-semibold text-success">Added</span>}
            </div>
            <label className="flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-line-strong bg-canvas p-3 transition hover:border-ink">
              {personPhoto
                ? <img src={personPhoto} alt="Your photo" className="h-24 w-16 shrink-0 rounded-lg object-cover" />
                : <span className="flex h-24 w-16 shrink-0 items-center justify-center rounded-lg bg-white text-muted"><Camera className="h-7 w-7" /></span>}
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">{personPhoto ? 'Change photo' : 'Take or choose a photo'}</span>
                <span className="mt-0.5 block text-[13px] text-muted">Full body, standing straight, good light</span>
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileRead(setPersonPhoto, e.target.files?.[0])} />
            </label>
            <div className="mt-3"><PhotoConsentNotice kind="try-on" /></div>
          </section>

          <section className="tf-card p-4">
            <h2 className="mb-3 text-lg font-bold">2. Your outfit</h2>
            <Segmented
              size="sm"
              label="Outfit source"
              value={sourceMode}
              onChange={setSourceMode}
              options={[{ value: 'catalogue', label: 'Store collection' }, { value: 'own-garment', label: 'My own outfit' }]}
            />

            {sourceMode === 'catalogue' ? (
              <div className="mt-4 space-y-3">
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                  {(['women', 'men', 'boys', 'girls'] as const).map((audience) => (
                    <button key={audience} type="button" aria-pressed={genderFilter === audience} onClick={() => { setGenderFilter(audience); setActiveCategory(catalogueCategories.find((cat) => cat.gender === audience)!.id); }} className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold capitalize ${genderFilter === audience ? 'bg-ink text-white' : 'border border-line bg-white text-ink'}`}>{audience}</button>
                  ))}
                </div>
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                  {filteredCategories.map((cat) => (
                    <button key={cat.id} type="button" aria-pressed={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} className={`min-h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold ${activeCategory === cat.id ? 'bg-brand-soft text-brand' : 'text-muted'}`}>{cat.label}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {categoryProducts.map((item) => {
                    const picked = selectedProduct.sku === item.sku;
                    return (
                      <button key={item.sku} type="button" aria-pressed={picked} onClick={() => setSelectedProduct(item)} className={`relative overflow-hidden rounded-2xl border text-left transition ${picked ? 'border-brand ring-2 ring-brand' : 'border-line'}`}>
                        <img src={item.imageUrl} alt="" className="aspect-[3/4] w-full bg-[#F1EEE9] object-contain" />
                        {picked && <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white"><Check className="h-4 w-4" /></span>}
                        <span className="line-clamp-2 block p-2.5 text-[13px] font-semibold leading-snug">{item.title}</span>
                      </button>
                    );
                  })}
                </div>
                {categoryProducts.length === 0 && <p className="rounded-2xl bg-canvas p-6 text-center text-sm text-muted">No styles in this category yet.</p>}
              </div>
            ) : (
              <label className="mt-4 flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-line-strong bg-canvas p-3 transition hover:border-ink">
                {ownGarmentPhoto
                  ? <img src={ownGarmentPhoto} alt="Your outfit" className="h-24 w-16 shrink-0 rounded-lg object-cover" />
                  : <span className="flex h-24 w-16 shrink-0 items-center justify-center rounded-lg bg-white text-muted"><Upload className="h-7 w-7" /></span>}
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold">{ownGarmentPhoto ? 'Change outfit photo' : 'Photo of the outfit'}</span>
                  <span className="mt-0.5 block text-[13px] text-muted">Lay it flat or hang it, the whole garment in frame</span>
                </span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileRead(setOwnGarmentPhoto, e.target.files?.[0])} />
              </label>
            )}

            {(genderFilter === 'boys' || genderFilter === 'girls') && (
              <label className="mt-4 flex items-start gap-3 rounded-2xl bg-warn-soft p-3 text-[13px] text-ink">
                <input type="checkbox" checked={guardianConsent} onChange={(event) => setGuardianConsent(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
                I am the parent or guardian and approve using this child’s photo.
              </label>
            )}
          </section>

          <ActionBar note={statusNote || (generatingImage ? 'Creating your look. This takes about 20 seconds.' : !personPhoto ? 'Add your photo to continue' : !garmentReady ? 'Choose an outfit to continue' : undefined)}>
            <button type="button" disabled={!canCreate} onClick={() => void runMobileGeneration()} className="tf-btn tf-btn-primary !min-h-14 text-base">
              {generatingImage ? <><LoaderCircle className="h-5 w-5 animate-spin" /> Creating…</> : <><Sparkles className="h-5 w-5" /> Create my look</>}
            </button>
          </ActionBar>
        </>}
        {flow === 'ai-video' && <div className="h-6" />}
      </div>
    </main>
  );
}
