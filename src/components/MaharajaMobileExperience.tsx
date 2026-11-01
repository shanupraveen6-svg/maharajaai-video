'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useStoreCatalogue } from '@/lib/maharaja/use-store-catalogue';
import {
  ArrowRight,
  Camera,
  Check,
  Download,
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
import { ActionBar, PageTitle, Segmented, StepProgress } from '@/components/ui';
import { OWN_GARMENT_TYPES } from '@/lib/tryfocus/garment-types';
import { usePhoneLanguage } from '@/lib/tryfocus/phone-language';

/**
 * What the wall QR opens: Try-On on the customer's own phone. AI Video is not offered here; it comes only
 * from the biller's per-customer QR, so it stays tied to a bill.
 */
export default function MaharajaMobileExperience({ accessCode, clientName = 'The Majestic Maharaja' }: { accessCode: string; clientName?: string }) {
  const { language, setLanguage, t } = usePhoneLanguage();
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
      .catch((error) => setStatusNote(error instanceof Error ? error.message : t('photoUnreadable')));
  }

  async function runMobileGeneration() {
    if ((genderFilter === 'boys' || genderFilter === 'girls') && !guardianConsent) { setStatusNote(t('guardianFirst')); return; }
    if (sourceMode === 'catalogue' && !catalogueItems.some((item) => item.sku === selectedProduct.sku)) {
      setStatusNote(t('chooseFromCatalogue'));
      return;
    }
    const garmentImg =
      sourceMode === 'own-garment'
        ? ownGarmentPhoto
        : selectedProduct.garmentReferenceUrl || selectedProduct.imageUrl;

    if (!personPhoto || !garmentImg) {
      setStatusNote(t('photoAndOutfitFirst'));
      return;
    }

    setGeneratingImage(true);
    setStatusNote('');
    const sessionId = `mobile_image-tryon_${Date.now()}`;

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
        setStatusNote(data?.error || t('generationFailed'));
      }
    } catch {
      setResultImageUrl('');
      setStatusNote(t('generationOffline'));
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
              <p className="text-[13px] text-muted">{t('headerTag')}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <div role="group" aria-label="Language" className="flex rounded-xl bg-line/70 p-0.5 text-sm font-semibold">
              {([['en', 'English'], ['ta', 'தமிழ்']] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={language === value} onClick={() => setLanguage(value)} className={`min-h-10 rounded-[10px] px-2.5 ${language === value ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}>{label}</button>
              ))}
            </div>
            <Link href="/maharaja/try-on" className="flex min-h-10 items-center rounded-xl px-2 text-sm font-semibold text-muted hover:text-ink">{t('help')}</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-5 px-4 pt-4">
        <>
          <StepProgress
            steps={[t('stepSource'), t('stepPhoto'), sourceMode === 'own-garment' ? t('stepYourOutfit') : t('stepPickOutfit')]}
            current={stage === 'source' ? 0 : stage === 'photo' ? 1 : 2}
            onSelect={(index) => setStage(index === 0 ? 'source' : 'photo')}
          />

          {stage === 'source' && (
            <div className="space-y-4">
              <PageTitle title={t('whatToTry')} />
              {([
                ['catalogue', t('storeCollection'), t('storeCollectionText')],
                ['own-garment', t('myOwnOutfit'), t('myOwnOutfitText')],
              ] as const).map(([value, title, text]) => (
                <button key={value} type="button" onClick={() => { setSourceMode(value); setStage(personPhoto ? 'outfit' : 'photo'); }} className="tf-card group flex w-full items-center gap-4 overflow-hidden p-0 text-left transition hover:border-ink">
                  {value === 'catalogue'
                    ? <span className="grid h-28 w-28 shrink-0 grid-cols-2 gap-0.5 bg-[#F1EEE9]">{catalogueItems.filter((item) => item.gender === 'women').slice(0, 4).map((item) => <img key={item.sku} src={item.thumbnailUrl || item.imageUrl} alt="" className="h-full w-full object-cover" />)}</span>
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
              <PageTitle title={t('photoTitle')} subtitle={t('photoSubtitle')} />
              <div className="space-y-2">
                <p className="tf-label">{t('whoFor')}</p>
                <Segmented
                  size="sm"
                  label="Who is it for"
                  value={genderFilter}
                  onChange={(audience) => { setGenderFilter(audience); setActiveCategory(catalogueCategories.find((cat) => cat.gender === audience)!.id); }}
                  options={(['women', 'men', 'boys', 'girls'] as const).map((value) => ({ value, label: t(value) }))}
                />
              </div>
              {(genderFilter === 'boys' || genderFilter === 'girls') && (
                <label className="flex items-start gap-3 rounded-2xl bg-warn-soft p-3 text-[13px] text-ink">
                  <input type="checkbox" checked={guardianConsent} onChange={(event) => setGuardianConsent(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
                  {t('guardianAgree')}
                </label>
              )}
              <label className="tf-card flex cursor-pointer flex-col items-center gap-3 p-5 text-center transition hover:border-ink">
                {personPhoto
                  ? <img src={personPhoto} alt="Your photo" className="aspect-[9/16] h-72 rounded-xl object-cover" />
                  : <span className="flex aspect-[9/16] h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-canvas text-muted"><Camera className="h-9 w-9" /><span className="px-4 text-sm">{t('takePhoto')}</span></span>}
                <span className="text-[15px] font-semibold text-brand">{personPhoto ? t('changePhoto') : t('addPhoto')}</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileRead(setPersonPhoto, e.target.files?.[0])} />
              </label>
              {language === 'ta'
                ? <p className="text-[13px] leading-relaxed text-muted">{t('consentTryOn')} <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-brand underline underline-offset-2">{t('privacy')}</a></p>
                : <PhotoConsentNotice kind="try-on" />}
              <ActionBar note={!personPhoto ? t('needPhoto') : needsGuardian ? t('needGuardian') : undefined}>
                <button type="button" disabled={!personPhoto || needsGuardian} onClick={() => setStage('outfit')} className="tf-btn tf-btn-primary !min-h-14 text-base">
                  {sourceMode === 'own-garment' ? t('addMyOutfit') : t('pickAnOutfit')} <ArrowRight className="h-5 w-5" />
                </button>
              </ActionBar>
            </div>
          )}

          {stage === 'outfit' && (
            <div className="space-y-4">
              {resultImageUrl && (
                <section id="mobile-result" className="tf-card overflow-hidden">
                  <BeforeAfterSlider beforeImage={personPhoto || selectedProduct.imageUrl} afterImage={resultImageUrl} beforeLabel={t('you')} afterLabel={t('newLook')} />
                  <div className="flex gap-3 p-4">
                    <a href={resultImageUrl} download={`tryfocus-look-${selectedProduct.sku.toLowerCase()}.jpg`} className="tf-btn tf-btn-dark flex-1"><Download className="h-4 w-4" /> {t('savePhoto')}</a>
                    <button type="button" onClick={() => { setResultImageUrl(''); setStatusNote(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="tf-btn tf-btn-secondary flex-1">{t('tryAnother')}</button>
                  </div>
                </section>
              )}
              <PageTitle
                title={sourceMode === 'own-garment' ? t('yourOutfit') : t('pickAnOutfit')}
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
                          <img src={item.thumbnailUrl || item.imageUrl} alt="" loading="lazy" className="aspect-[3/4] w-full bg-[#F1EEE9] object-contain" />
                          {picked && <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white"><Check className="h-4 w-4" /></span>}
                          <span className="line-clamp-2 block p-2.5 text-[13px] font-semibold leading-snug">{item.title}</span>
                        </button>
                      );
                    })}
                  </div>
                  {categoryProducts.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm text-muted">{t('noStyles')}</p>}
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
                      : <span className="flex aspect-[3/4] h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-canvas text-muted"><Upload className="h-9 w-9" /><span className="px-4 text-sm">{t('layFlat')}</span></span>}
                    <span className="text-[15px] font-semibold text-brand">{ownGarmentPhoto ? t('changeOutfitPhoto') : t('addOutfitPhoto')}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileRead(setOwnGarmentPhoto, e.target.files?.[0])} />
                  </label>
                </>
              )}

              <ActionBar note={statusNote || (generatingImage ? t('creatingNote') : !garmentReady ? t('needOutfitPhoto') : undefined)}>
                <button type="button" disabled={!canCreate} onClick={() => void runMobileGeneration()} className="tf-btn tf-btn-primary !min-h-14 text-base">
                  {generatingImage ? <><LoaderCircle className="h-5 w-5 animate-spin" /> {t('creating')}</> : <><Sparkles className="h-5 w-5" /> {t('createMyLook')}</>}
                </button>
              </ActionBar>
            </div>
          )}
        </>
      </div>
    </main>
  );
}
