'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useStoreCatalogue } from '@/lib/maharaja/use-store-catalogue';
import { fetchCatalogueSettings } from '@/lib/maharaja/catalogue-client';
import { createImageHandoff } from '@/lib/maharaja/image-handoff-client';
import { compressImage } from '@/lib/utils/image';
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  LoaderCircle,
  QrCode,
  Shirt,
  Sparkles,
  Store,
  RotateCcw,
  MoreVertical,
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
import PhotoConsentNotice from '@/components/PhotoConsentNotice';
import { OWN_GARMENT_TYPES as GARMENT_TYPE_OPTIONS } from '@/lib/tryfocus/garment-types';
import { ActionBar, NavTabs, PageTitle, Segmented, StepProgress } from '@/components/ui';

export type TabletTab = 'own-garment' | 'catalogue';
export type TabletStep = 'source' | 'photo' | 'garment';


export default function MaharajaTabletExperience() {
  const generationRun = useRef(0);
  // Level 0: what the counter is doing. Level 1 (store collection or their own outfit) is the first try-on step.
  const [counterMode, setCounterMode] = useState<'tryon' | 'video'>('tryon');
  const [tab, setTab] = useState<TabletTab>('catalogue');
  const [tabletStep, setTabletStep] = useState<TabletStep>('source');

  // Audience & Catalogue state
  const [genderFilter, setGenderFilter] = useState<TryFocusProduct['gender']>('women');
  const catalogueItems = useStoreCatalogue();
  // The counter runs on the signed-in client's laptop or tablet; show that client's name.
  const [clientName, setClientName] = useState('');
  useEffect(() => {
    void fetchCatalogueSettings().then((settings) => setClientName(settings.clientName));
  }, []);
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
  const pendingHandoffRef = useRef<null | (() => Promise<string>)>(null);
  const [proceeding, setProceeding] = useState(false);
  const [showResultMenu, setShowResultMenu] = useState(false);

  const filteredCategories = catalogueCategories.filter((cat) => cat.gender === genderFilter);
  const categoryProducts = catalogueItems.filter((item) => item.category === activeCategory);

  useEffect(() => {
    const first = catalogueItems.find((item) => item.category === activeCategory && item.gender === genderFilter);
    if (first) setSelectedProduct(first);
    setGuardianConsent(false);
    const options = GARMENT_TYPE_OPTIONS[genderFilter] || [];
    if (options[0]) setOwnGarmentType(options[0].id);
  }, [activeCategory, genderFilter, catalogueItems]);

  function handleGarmentFileRead(file?: File | null) {
    if (!file) return;
    compressImage(file, 1280, 0.85)
      .then(({ dataUrl }) => setOwnGarmentPhoto(dataUrl))
      .catch((error) => setTryOnStatusNote(error instanceof Error ? error.message : 'This garment photo could not be read.'));
  }

  // Crop uploaded or tablet-captured person photos to vertical 9:16 format
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
    setTabletStep('source');
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

  async function proceedToPhone() {
    if (!pendingHandoffRef.current || proceeding) return;
    setProceeding(true);
    try {
      setTryOnMobileQr(await pendingHandoffRef.current());
      setTryOnStatusNote('Scan to save this look on your phone. Private link expires in 15 minutes.');
    } catch (error) {
      setTryOnStatusNote(error instanceof Error ? error.message : 'Phone QR unavailable.');
    } finally {
      setProceeding(false);
    }
  }

  async function handleGenerateTryOn(modeType: 'own-garment' | 'catalogue') {
    if ((genderFilter === 'boys' || genderFilter === 'girls') && !guardianConsent) {
      setTryOnStatusNote('A parent or guardian must approve the child’s photo first.');
      return;
    }

    if (modeType === 'catalogue' && !catalogueItems.some((item) => item.sku === selectedProduct.sku)) {
      setTryOnStatusNote('Choose a garment from this store’s catalogue.');
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
          surface: 'tablet',
          templateId: genderFilter === 'boys' ? 'boy' : genderFilter === 'girls' ? 'girl' : genderFilter,
          guardianProcessingConsent: guardianConsent,
          catalogueProductId: modeType === 'catalogue' ? selectedProduct.sku : resolvedSku,
          catalogueProductTitle: resolvedTitle,
          catalogueProductCategory: modeType === 'catalogue' ? selectedProduct.category : (ownGarmentType || 'own'),
          garmentType: resolvedGarmentType,
          garmentTypeConfirmed: true,
          processingConsent: true,
          consentVersion: '2026-10-privacy-v3',
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
        setTryOnStatusNote('Your look is ready. Tap Proceed to get it on your phone.');
        pendingHandoffRef.current = () => createImageHandoff(data.masterImageUrl, resolvedSku, resolvedTitle, {
          category: modeType === 'catalogue' ? selectedProduct.category : ownGarmentType,
          garmentType: resolvedGarmentType,
          gender: genderFilter,
          garmentReferenceUrl: modeType === 'catalogue' ? (selectedProduct.garmentReferenceUrl || selectedProduct.imageUrl) : garmentImg,
        });
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

  const resultPanel = (
    <div id="tablet-result" className="tf-card space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-bold">{tryOnResultUrl ? 'Customer’s new look' : 'The look appears here'}</h3>
        {tryOnResultUrl && (
          <div className="relative">
            <button type="button" aria-label="Look options" aria-expanded={showResultMenu} onClick={() => setShowResultMenu((open) => !open)} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line-strong bg-white">
              <MoreVertical className="h-5 w-5" />
            </button>
            {showResultMenu && (
              <div className="absolute right-0 top-12 z-40 w-60 overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
                <button type="button" onClick={() => { setShowResultMenu(false); pendingHandoffRef.current = null; tryAnotherGarment(); }} className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm font-semibold hover:bg-canvas">
                  <RotateCcw className="h-4 w-4" /> Try another outfit
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {tryOnResultUrl || tryOnGenerating ? (
        <div className="relative">
          <BeforeAfterSlider
            key={tryOnResultUrl.slice(-24)}
            beforeImage={personPhoto || '/maharaja-logo.png'}
            afterImage={tryOnResultUrl || personPhoto || '/maharaja-logo.png'}
            beforeLabel="Before"
            afterLabel="New look"
            frameClassName="mx-auto aspect-[9/16] w-full max-w-[320px] rounded-2xl overflow-hidden"
          />
          {tryOnGenerating && (
            <div className="absolute inset-0 mx-auto flex max-w-[320px] flex-col items-center justify-center gap-3 rounded-2xl bg-white/80 text-center backdrop-blur-sm">
              <LoaderCircle className="h-10 w-10 animate-spin text-brand" />
              <p className="font-semibold">Creating the look…</p>
              <p className="text-sm text-muted">About 20 seconds</p>
            </div>
          )}
        </div>
      ) : (
        <div className="mx-auto flex aspect-[9/16] w-full max-w-[320px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong bg-canvas p-6 text-center text-muted">
          <Sparkles className="h-8 w-8 text-subtle" />
          <p className="text-sm">Choose an outfit and tap <b className="text-ink">Create look</b></p>
        </div>
      )}
      {tryOnResultUrl && !tryOnMobileQr && (
        <button type="button" disabled={proceeding} onClick={() => void proceedToPhone()} className="tf-btn tf-btn-primary w-full !min-h-14">
          <QrCode className="h-5 w-5" /> {proceeding ? 'Preparing QR…' : 'Send to customer’s phone'}
        </button>
      )}
      {tryOnMobileQr && (
        <div className="flex items-center gap-4 rounded-2xl bg-canvas p-4">
          <img src={tryOnMobileQr} alt="Scan to save on phone" className="h-28 w-28 rounded-lg bg-white object-contain p-1" />
          <div>
            <p className="font-semibold">Ask the customer to scan</p>
            <p className="mt-1 text-sm text-muted">The look opens on their phone to save. The QR works for 15 minutes.</p>
          </div>
        </div>
      )}
    </div>
  );

  const canCreateOwn = Boolean(personPhoto && ownGarmentPhoto) && !tryOnGenerating;
  const canCreateCatalogue = Boolean(personPhoto) && !tryOnGenerating;

  return (
    <main className="tablet-workspace min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">{clientName.replace(/^The\s+/i, '').charAt(0) || 'T'}</span>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold">{clientName}</h1>
              <p className="text-sm text-muted">Counter</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/maharaja/workspace" className="flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-muted hover:text-ink">Workspace</Link>
            <button type="button" onClick={resetCustomerSession} className="tf-btn tf-btn-secondary !min-h-11 px-4 text-sm">
              <RotateCcw className="h-4 w-4" /> New customer
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-6">
          <NavTabs
            label="Counter modes"
            value={counterMode}
            onChange={setCounterMode}
            options={[
              { value: 'tryon', label: <><Sparkles className="h-4 w-4" /> Try-On</> },
              { value: 'video', label: <><QrCode className="h-4 w-4" /> AI Video QR</> },
            ]}
          />
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-6 pb-6 pt-5">
        {counterMode === 'tryon' && (
          <div className="space-y-6">
            <StepProgress
              steps={['Store or own', 'Customer photo', tab === 'own-garment' ? 'Their outfit' : 'Pick an outfit']}
              current={tabletStep === 'source' ? 0 : tabletStep === 'photo' ? 1 : 2}
              onSelect={(index) => { if (index === 0) setTabletStep('source'); if (index === 1) setTabletStep('photo'); }}
            />

            {tabletStep === 'source' && (
              <div className="space-y-5">
                <PageTitle title="What will the customer try?" subtitle="Pick one to start. You can switch later." />
                <div className="grid gap-4 sm:grid-cols-2">
                  {([
                    ['catalogue', 'Store collection', 'Outfits from this store’s catalogue'],
                    ['own-garment', 'Their own outfit', 'An outfit the customer brought or owns'],
                  ] as const).map(([value, title, text]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => { setTab(value); setTabletStep(personPhoto ? 'garment' : 'photo'); }}
                      className="group flex flex-col overflow-hidden rounded-3xl border border-line bg-white text-left shadow-sm transition hover:border-ink"
                    >
                      {value === 'catalogue' ? (
                        <span className="grid h-56 grid-cols-3 gap-1 bg-[#F1EEE9] p-1">
                          {catalogueItems.filter((item) => item.gender === 'women').slice(0, 3).map((item) => <img key={item.sku} src={item.imageUrl} alt="" className="h-full w-full rounded-2xl object-cover" />)}
                        </span>
                      ) : (
                        <span className="flex h-56 items-center justify-center bg-canvas"><span className="flex h-28 w-28 items-center justify-center rounded-full bg-white shadow-sm"><Shirt className="h-14 w-14" strokeWidth={1.4} /></span></span>
                      )}
                      <span className="flex items-center justify-between gap-3 p-5">
                        <span>
                          <span className="block text-2xl font-bold">{title}</span>
                          <span className="mt-1 block text-[15px] text-muted">{text}</span>
                        </span>
                        <ArrowRight className="h-6 w-6 shrink-0 transition group-hover:translate-x-1" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}


            {tabletStep === 'photo' && (
              <div className="space-y-5">
                <PageTitle
                  title={personPhoto ? 'Check the photo' : 'Customer photo'}
                  subtitle={personPhoto ? 'Face and full outfit should be clear and upright.' : 'Use the tablet camera, or let the customer send one from their phone.'}
                />
                <p className="tf-label">Who is it for?</p>
                <Segmented
                  label="Who is this look for"
                  value={genderFilter}
                  onChange={(audience) => { setGenderFilter(audience); const firstCat = catalogueCategories.find((cat) => cat.gender === audience); if (firstCat) setActiveCategory(firstCat.id); }}
                  options={([['women', 'Women'], ['men', 'Men'], ['boys', 'Boys'], ['girls', 'Girls']] as const).map(([value, label]) => ({ value, label }))}
                />
                {(genderFilter === 'boys' || genderFilter === 'girls') && (
                  <label className="flex items-start gap-3 rounded-2xl bg-warn-soft p-4 text-[15px]">
                    <input type="checkbox" checked={guardianConsent} onChange={(event) => setGuardianConsent(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
                    I am the parent or legal guardian and approve using this child’s photo.
                  </label>
                )}

                {!personPhoto ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="group flex min-h-[260px] cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl bg-ink p-6 text-center text-white shadow-lg transition hover:bg-black">
                        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10"><Camera className="h-8 w-8" /></span>
                        <span>
                          <span className="block text-2xl font-bold">Take a photo</span>
                          <span className="mt-1 block text-[15px] text-white/70">Tablet camera, portrait</span>
                        </span>
                        <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => handleFileRead(setPersonPhoto, e.target.files?.[0])} />
                      </label>
                      <PhonePhotoTransfer
                        onPhoto={(photo) => setPersonPhoto(photo)}
                        renderTrigger={(open, busy) => (
                          <button type="button" onClick={open} disabled={busy} className="flex h-full min-h-[260px] w-full flex-col items-center justify-center gap-4 rounded-3xl border border-line bg-white p-6 text-center shadow-sm transition hover:border-brand disabled:opacity-50">
                            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand">{busy ? <LoaderCircle className="h-8 w-8 animate-spin" /> : <QrCode className="h-8 w-8" />}</span>
                            <span>
                              <span className="block text-2xl font-bold">{busy ? 'Preparing QR…' : 'From their phone'}</span>
                              <span className="mt-1 block text-[15px] text-muted">Customer scans a QR and sends a photo</span>
                            </span>
                          </button>
                        )}
                      />
                    </div>
                    <PhotoConsentNotice kind="try-on" />
                    <label className="block cursor-pointer text-center text-sm font-semibold text-muted underline underline-offset-4 hover:text-ink">
                      Choose a photo file instead
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileRead(setPersonPhoto, e.target.files?.[0])} />
                    </label>
                  </>
                ) : (
                  <div className="tf-card mx-auto max-w-md p-5 text-center">
                    <img src={personPhoto} alt="Customer photo" className="mx-auto aspect-[9/16] h-[460px] max-w-full rounded-2xl object-cover" />
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => setPersonPhoto('')} className="tf-btn tf-btn-secondary !min-h-14">Retake</button>
                      <button type="button" onClick={() => setTabletStep('garment')} className="tf-btn tf-btn-primary !min-h-14">Continue <ArrowRight className="h-4 w-4" /></button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tabletStep === 'garment' && (
              <div className="space-y-5">
                <PageTitle
                  title={tab === 'own-garment' ? 'Photograph their outfit' : 'Pick an outfit'}
                  subtitle={tab === 'own-garment' ? 'The garment the customer brought: whole piece in frame, good light.' : 'From the store collection.'}
                  action={personPhoto && (
                    <button type="button" onClick={() => setTabletStep('photo')} className="group flex shrink-0 items-center gap-2 rounded-xl border border-line bg-white p-1.5 pr-3 text-left hover:border-ink">
                      <img src={personPhoto} alt="Customer photo" className="aspect-[9/16] h-12 rounded-md object-cover" />
                      <span className="text-sm font-semibold text-muted group-hover:text-ink">Change</span>
                    </button>
                  )}
                />

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="min-w-0 space-y-4">
                    {tab === 'own-garment' ? (
                      <div className="tf-card space-y-5 p-5">
                        <div>
                          <p className="tf-label mb-1">What is it?</p>
                          <div className="flex flex-wrap gap-2">
                            {(GARMENT_TYPE_OPTIONS[genderFilter] || []).map((opt) => (
                              <button key={opt.id} type="button" aria-pressed={ownGarmentType === opt.id} onClick={() => setOwnGarmentType(opt.id)} className={`min-h-10 rounded-none border-b-2 px-2 text-[15px] transition ${ownGarmentType === opt.id ? 'border-ink font-bold text-ink' : 'border-transparent font-medium text-muted hover:text-ink'}`}>
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 rounded-2xl border border-dashed border-line-strong bg-canvas p-4">
                          {ownGarmentPhoto
                            ? <img src={ownGarmentPhoto} alt="Customer's outfit" className="aspect-[9/16] h-36 shrink-0 rounded-xl object-cover" />
                            : <span className="flex aspect-[9/16] h-36 shrink-0 items-center justify-center rounded-xl bg-white text-subtle"><Shirt className="h-9 w-9" /></span>}
                          <div className="min-w-0 space-y-2">
                            <p className="font-semibold">{ownGarmentPhoto ? 'Outfit photo added' : 'Add the outfit photo'}</p>
                            <div className="flex flex-wrap gap-2">
                              <label className="tf-btn tf-btn-dark cursor-pointer !min-h-11 px-4 text-sm">
                                <Camera className="h-4 w-4" /> {ownGarmentPhoto ? 'Retake' : 'Tablet camera'}
                                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleGarmentFileRead(e.target.files?.[0])} />
                              </label>
                              <PhonePhotoTransfer
                                onPhoto={(photo) => setOwnGarmentPhoto(photo)}
                                buttonLabel="Phone QR"
                                renderTrigger={(open, busy) => (
                                  <button type="button" onClick={open} disabled={busy} className="tf-btn tf-btn-secondary !min-h-11 px-4 text-sm">
                                    <QrCode className="h-4 w-4" /> From phone
                                  </button>
                                )}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="tf-card space-y-4 p-5">
                        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
                          {filteredCategories.map((cat) => (
                            <button key={cat.id} type="button" aria-pressed={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} className={`min-h-10 shrink-0 rounded-none border-b-2 px-2 text-[15px] transition ${activeCategory === cat.id ? 'border-ink font-bold text-ink' : 'border-transparent font-medium text-muted hover:text-ink'}`}>
                              {cat.label}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                          {categoryProducts.map((prod) => {
                            const picked = selectedProduct.sku === prod.sku;
                            return (
                              <button key={prod.sku} type="button" aria-pressed={picked} onClick={() => setSelectedProduct(prod)} className={`relative flex flex-col overflow-hidden rounded-2xl border text-left transition ${picked ? 'border-brand ring-2 ring-brand' : 'border-line bg-white hover:border-line-strong'}`}>
                                <img src={prod.imageUrl} alt="" className="aspect-[3/4] w-full bg-[#F1EEE9] object-contain" />
                                {picked && <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white"><CheckCircle2 className="h-4 w-4" /></span>}
                                <span className="block p-2">
                                  <span className="line-clamp-2 block text-[13px] font-semibold leading-snug">{prod.title}</span>
                                  {prod.price > 0 && <span className="mt-0.5 block text-[13px] text-muted">{formatINR(prod.price)}</span>}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {categoryProducts.length === 0 && <p className="rounded-2xl bg-canvas p-6 text-center text-sm text-muted">No styles in this category yet.</p>}
                      </div>
                    )}
                  </div>
                  <div className={`lg:sticky lg:top-40 lg:self-start ${tryOnResultUrl || tryOnGenerating ? '' : 'hidden lg:block'}`}>{resultPanel}</div>
                </div>

                <ActionBar note={tryOnStatusNote || undefined}>
                  <button
                    type="button"
                    disabled={tab === 'own-garment' ? !canCreateOwn : !canCreateCatalogue}
                    onClick={() => { handleGenerateTryOn(tab === 'own-garment' ? 'own-garment' : 'catalogue'); document.getElementById('tablet-result')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
                    className="tf-btn tf-btn-primary !min-h-14 text-base"
                  >
                    {tryOnGenerating ? <><LoaderCircle className="h-5 w-5 animate-spin" /> Creating…</> : <><Sparkles className="h-5 w-5" /> {tab === 'own-garment' ? 'Create look' : `Create look · ${selectedProduct.title.length > 28 ? `${selectedProduct.title.slice(0, 28)}…` : selectedProduct.title}`}</>}
                  </button>
                </ActionBar>
              </div>
            )}
          </div>
        )}

        {counterMode === 'video' && <TabletVideoHandoff />}
      </div>
    </main>
  );
}
