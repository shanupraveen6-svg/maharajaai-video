'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useStoreCatalogue } from '@/lib/maharaja/use-store-catalogue';
import {
  ArrowRight,
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
import { ActionBar, NavTabs, PageTitle, Segmented, StepProgress } from '@/components/ui';
import { OWN_GARMENT_TYPES } from '@/lib/tryfocus/garment-types';

type MobileFlow = 'image-tryon' | 'ai-video';

export default function MaharajaMobileExperience({ accessCode, videoEntryUrl, clientName = 'The Majestic Maharaja' }: { accessCode: string; videoEntryUrl: string; clientName?: string }) {
  const [flow, setFlow] = useState<MobileFlow>('image-tryon');
  const [sourceMode, setSourceMode] = useState<'catalogue' | 'own-garment'>('catalogue');
  const [stage, setStage] = useState<'source' | 'photo' | 'outfit'>('source');
  const [genderFilter, setGenderFilter] = useState<TryFocusProduct['gender']>('women');
  const [activeCategory, setActiveCategory] = useState<CatalogueCategoryId>('sarees');
  const [selectedProduct, setSelectedProduct] = useState<TryFocusProduct>(sampleCatalogue.find((item) => item.category === 'sarees') || sampleCatalogue[0]);

  // Image 1 = Customer Photo, Image 2 = Garment Photo
  const [personPhoto, setPersonPhoto] = useState<string>('');
  const [ownGarmentPhoto, setOwnGarmentPhoto] = useState<string>('');
  const [ownGarmentType, setOwnGarmentType] = useState(OWN_GARMENT_TYPES.women[0].id);

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

  useEffect(() => { setOwnGarmentType(OWN_GARMENT_TYPES[genderFilter][0].id); }, [genderFilter]);

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
          catalogueProductTitle: sourceMode === 'catalogue' ? selectedProduct.title : `Customer ${OWN_GARMENT_TYPES[genderFilter].find((type) => type.id === ownGarmentType)?.label || 'outfit'}`,
          garmentType: sourceMode === 'catalogue' ? selectedProduct.garmentType : ownGarmentType,
          garmentTypeConfirmed: true,
          processingConsent: true,
          consentVersion: '2026-10-privacy-v3',
          personPhoto,
          garmentPhotos: [garmentImg],
          garmentRoles: ['Primary Garment Reference'],
          garmentAnalysis: sourceMode === 'catalogue' ? `${selectedProduct.title} (${selectedProduct.fabricNote})` : `Customer's own ${OWN_GARMENT_TYPES[genderFilter].find((type) => type.id === ownGarmentType)?.label || 'outfit'}`,
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
  const ownTypes = OWN_GARMENT_TYPES[genderFilter];

  return (
    <main className="mobile-workspace min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 px-4 pt-3 backdrop-blur-md">
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
        <div className="mx-auto mt-1 max-w-xl">
          <NavTabs
            label="What would you like to do"
            value={flow}
            onChange={setFlow}
            options={[
              { value: 'image-tryon', label: <><Shirt className="h-4 w-4" /> Try-On</> },
              { value: 'ai-video', label: <><Film className="h-4 w-4" /> AI Video</> },
            ]}
          />
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-5 px-4 pt-4">
        {flow === 'ai-video' && (
          <section className="tf-card space-y-3 p-5">
            <h2 className="text-xl font-bold">Your festival video</h2>
            <p className="text-[15px] text-muted">Add your photo and outfit to get a short festival film. Your private session lasts 24 hours, so you can download it or show it on the store screen.</p>
            <Link href={videoEntryUrl} className="tf-btn tf-btn-primary w-full">Start my video</Link>
          </section>
        )}

        {flow === 'image-tryon' && <>
          <StepProgress
            steps={['Store or own', 'Your photo', sourceMode === 'own-garment' ? 'Your outfit' : 'Pick outfit']}
            current={stage === 'source' ? 0 : stage === 'photo' ? 1 : 2}
            onSelect={(index) => setStage(index === 0 ? 'source' : 'photo')}
          />

          {stage === 'source' && (
            <div className="space-y-4">
              <PageTitle title="What would you like to try?" />
              {([
                ['catalogue', 'Store collection', 'Outfits from this store'],
                ['own-garment', 'My own outfit', 'Photograph an outfit you have'],
              ] as const).map(([value, title, text]) => (
                <button key={value} type="button" onClick={() => { setSourceMode(value); setStage(personPhoto ? 'outfit' : 'photo'); }} className="tf-card group flex w-full items-center gap-4 overflow-hidden p-0 text-left transition hover:border-ink">
                  {value === 'catalogue'
                    ? <span className="grid h-28 w-28 shrink-0 grid-cols-2 gap-0.5 bg-[#F1EEE9]">{catalogueItems.filter((item) => item.gender === 'women').slice(0, 4).map((item) => <img key={item.sku} src={item.imageUrl} alt="" className="h-full w-full object-cover" />)}</span>
                    : <span className="flex h-28 w-28 shrink-0 items-center justify-center bg-canvas"><Shirt className="h-10 w-10" strokeWidth={1.4} /></span>}
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-bold">{title}</span>
                    <span className="mt-0.5 block text-sm text-muted">{text}</span>
                  </span>
                  <ArrowRight className="mr-4 h-5 w-5 shrink-0 transition group-hover:translate-x-1" />
                </button>
              ))}
            </div>
          )}

          {stage === 'photo' && (
            <div className="space-y-4">
              <PageTitle title="Your photo" subtitle="Full body, standing straight, good light." />
              <div className="space-y-2">
                <p className="tf-label">Who is it for?</p>
                <Segmented
                  size="sm"
                  label="Who is it for"
                  value={genderFilter}
                  onChange={(audience) => { setGenderFilter(audience); setActiveCategory(catalogueCategories.find((cat) => cat.gender === audience)!.id); }}
                  options={([['women', 'Women'], ['men', 'Men'], ['boys', 'Boys'], ['girls', 'Girls']] as const).map(([value, label]) => ({ value, label }))}
                />
              </div>
              {(genderFilter === 'boys' || genderFilter === 'girls') && (
                <label className="flex items-start gap-3 rounded-2xl bg-warn-soft p-3 text-[13px] text-ink">
                  <input type="checkbox" checked={guardianConsent} onChange={(event) => setGuardianConsent(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
                  I am the parent or guardian and approve using this child’s photo.
                </label>
              )}
              <label className="tf-card flex cursor-pointer flex-col items-center gap-3 p-5 text-center transition hover:border-ink">
                {personPhoto
                  ? <img src={personPhoto} alt="Your photo" className="aspect-[9/16] h-72 rounded-xl object-cover" />
                  : <span className="flex aspect-[9/16] h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-canvas text-muted"><Camera className="h-9 w-9" /><span className="px-4 text-sm">Take or choose a photo</span></span>}
                <span className="text-[15px] font-semibold text-brand">{personPhoto ? 'Change photo' : 'Add photo'}</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileRead(setPersonPhoto, e.target.files?.[0])} />
              </label>
              <PhotoConsentNotice kind="try-on" />
              <ActionBar note={!personPhoto ? 'Add your photo to continue' : needsGuardian ? 'A parent or guardian must agree first' : undefined}>
                <button type="button" disabled={!personPhoto || needsGuardian} onClick={() => setStage('outfit')} className="tf-btn tf-btn-primary !min-h-14 text-base">
                  {sourceMode === 'own-garment' ? 'Add my outfit' : 'Pick an outfit'} <ArrowRight className="h-5 w-5" />
                </button>
              </ActionBar>
            </div>
          )}

          {stage === 'outfit' && (
            <div className="space-y-4">
              {resultImageUrl && (
                <section id="mobile-result" className="tf-card overflow-hidden">
                  <BeforeAfterSlider beforeImage={personPhoto || selectedProduct.imageUrl} afterImage={resultImageUrl} beforeLabel="You" afterLabel="New look" />
                  <div className="flex gap-3 p-4">
                    <a href={resultImageUrl} download={`tryfocus-look-${selectedProduct.sku.toLowerCase()}.jpg`} className="tf-btn tf-btn-dark flex-1"><Download className="h-4 w-4" /> Save photo</a>
                    <button type="button" onClick={() => { setResultImageUrl(''); setStatusNote(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="tf-btn tf-btn-secondary flex-1">Try another</button>
                  </div>
                </section>
              )}
              <PageTitle
                title={sourceMode === 'own-garment' ? 'Your outfit' : 'Pick an outfit'}
                action={personPhoto && <button type="button" onClick={() => setStage('photo')} className="shrink-0"><img src={personPhoto} alt="Change your photo" className="aspect-[9/16] h-12 rounded-lg object-cover" /></button>}
              />

              {sourceMode === 'catalogue' ? (
                <>
                  <div className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 [scrollbar-width:none]">
                    {filteredCategories.map((cat) => (
                      <button key={cat.id} type="button" aria-pressed={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} className={`min-h-11 shrink-0 rounded-none border-b-2 px-2 text-sm transition ${activeCategory === cat.id ? 'border-ink font-bold text-ink' : 'border-transparent font-medium text-muted'}`}>{cat.label}</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {categoryProducts.map((item) => {
                      const picked = selectedProduct.sku === item.sku;
                      return (
                        <button key={item.sku} type="button" aria-pressed={picked} onClick={() => setSelectedProduct(item)} className={`relative overflow-hidden rounded-2xl border bg-white text-left transition ${picked ? 'border-brand ring-2 ring-brand' : 'border-line'}`}>
                          <img src={item.imageUrl} alt="" className="aspect-[3/4] w-full bg-[#F1EEE9] object-contain" />
                          {picked && <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white"><Check className="h-4 w-4" /></span>}
                          <span className="line-clamp-2 block p-2.5 text-[13px] font-semibold leading-snug">{item.title}</span>
                        </button>
                      );
                    })}
                  </div>
                  {categoryProducts.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm text-muted">No styles in this category yet.</p>}
                </>
              ) : (
                <>
                  <div className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 [scrollbar-width:none]">
                    {ownTypes.map((type) => (
                      <button key={type.id} type="button" aria-pressed={ownGarmentType === type.id} onClick={() => setOwnGarmentType(type.id)} className={`min-h-11 shrink-0 rounded-none border-b-2 px-2 text-sm transition ${ownGarmentType === type.id ? 'border-ink font-bold text-ink' : 'border-transparent font-medium text-muted'}`}>{type.label}</button>
                    ))}
                  </div>
                  <label className="tf-card flex cursor-pointer flex-col items-center gap-3 p-5 text-center transition hover:border-ink">
                    {ownGarmentPhoto
                      ? <img src={ownGarmentPhoto} alt="Your outfit" className="aspect-[3/4] h-72 rounded-xl bg-canvas object-contain" />
                      : <span className="flex aspect-[3/4] h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-canvas text-muted"><Upload className="h-9 w-9" /><span className="px-4 text-sm">Lay it flat or hang it, whole piece in frame</span></span>}
                    <span className="text-[15px] font-semibold text-brand">{ownGarmentPhoto ? 'Change outfit photo' : 'Add outfit photo'}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileRead(setOwnGarmentPhoto, e.target.files?.[0])} />
                  </label>
                </>
              )}

              <ActionBar note={statusNote || (generatingImage ? 'Creating your look. This takes about 20 seconds.' : !garmentReady ? 'Add a photo of your outfit to continue' : undefined)}>
                <button type="button" disabled={!canCreate} onClick={() => void runMobileGeneration()} className="tf-btn tf-btn-primary !min-h-14 text-base">
                  {generatingImage ? <><LoaderCircle className="h-5 w-5 animate-spin" /> Creating…</> : <><Sparkles className="h-5 w-5" /> Create my look</>}
                </button>
              </ActionBar>
            </div>
          )}
        </>}
        {flow === 'ai-video' && <div className="h-6" />}
      </div>
    </main>
  );
}
