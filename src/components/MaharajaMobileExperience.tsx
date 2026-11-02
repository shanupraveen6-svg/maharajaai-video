'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStoreCatalogue } from '@/lib/maharaja/use-store-catalogue';
import { fetchCatalogueSettings } from '@/lib/maharaja/catalogue-client';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Download,
  AtSign,
  LoaderCircle,
  MessageCircle,
  MoreVertical,
  RotateCcw,
  Shirt,
  Sparkles,
  Upload,
} from 'lucide-react';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import { compressImage } from '@/lib/utils/image';
import type { CatalogueAudience, TryFocusProduct } from '@/lib/tryfocus/sample-data';
import PhotoConsentNotice from '@/components/PhotoConsentNotice';
import { ActionBar, PageTitle, Segmented } from '@/components/ui';
import { usePhoneLanguage } from '@/lib/tryfocus/phone-language';
import { useLeadGate } from '@/components/LeadGate';
import { useExitGuard } from '@/components/ExitGuard';
import { categoriesFor, type StoreCategory, type StoreCategoryLists } from '@/lib/tryfocus/store-categories';

type Source = 'catalogue' | 'own-garment';
type Stage = 'source' | 'who' | 'type' | 'pick' | 'photo' | 'outfit' | 'result' | 'done';

const DEVICE_KEY = 'tryfocus:maharaja:device-id';
/** The "Other" choice for a customer's own outfit: the model copies the photo as it is. */
const OTHER_TYPE = 'other';

/**
 * What the store's Wall QR opens: Try-On on the customer's phone. Each phone gets one free look (and one
 * retry, kept in the ⋯ menu). Steps: Store collection or My own outfit → Who → What type → (pick a piece)
 * → your photo (camera or upload) → (your outfit, camera or upload) → your look. Nothing is stored: the
 * look comes back to the phone only. Download asks for WhatsApp, then offers Instagram and sharing.
 */
export default function MaharajaMobileExperience({ accessCode, clientName = 'The Majestic Maharaja' }: { accessCode: string; clientName?: string }) {
  const { language, setLanguage, t } = usePhoneLanguage();
  const leadGate = useLeadGate({ kind: 'pass', ref: accessCode, source: 'try-on' });
  const catalogueItems = useStoreCatalogue(accessCode);

  const [stage, setStage] = useState<Stage>('source');
  const [source, setSource] = useState<Source>('catalogue');
  const [audience, setAudience] = useState<CatalogueAudience>('women');
  const [category, setCategory] = useState<StoreCategory | null>(null);
  const [ownType, setOwnType] = useState<string>('');
  const [product, setProduct] = useState<TryFocusProduct | null>(null);
  const [personPhoto, setPersonPhoto] = useState('');
  const [outfitPhoto, setOutfitPhoto] = useState('');
  const [guardianConsent, setGuardianConsent] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState('');
  const [note, setNote] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [deviceId, setDeviceId] = useState('');
  // The phone's one hidden retry: false until used (the server checks it too).
  const [retryUsed, setRetryUsed] = useState(false);
  const [categoryLists, setCategoryLists] = useState<StoreCategoryLists>({});
  const [instagramUrl, setInstagramUrl] = useState('');

  // This phone's id, then the first-scan record and whether it already made its look.
  useEffect(() => {
    let id = '';
    try { id = localStorage.getItem(DEVICE_KEY) || ''; } catch { /* private mode */ }
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, '');
      try { localStorage.setItem(DEVICE_KEY, id); } catch { /* private mode */ }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the phone's stored id is only readable after mount
    setDeviceId(id);
    fetch(`/api/maharaja/access/${encodeURIComponent(accessCode)}?service=try-on&deviceId=${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (!data?.success) return;
        setRetryUsed(Boolean(data.access?.retryUsed));
        if (data.access?.tryOnUsed) setStage('done');
      })
      .catch(() => undefined);
    fetchCatalogueSettings(accessCode).then((settings) => {
      setCategoryLists(settings.categoryLists);
      setInstagramUrl(settings.instagramUrl);
    });
  }, [accessCode]);

  const isChild = audience === 'boys' || audience === 'girls';
  const storeCategories = categoriesFor(categoryLists, audience);
  // Store collection: only categories with pieces. My own outfit: every store category, plus Other.
  const typeChoices = source === 'catalogue'
    ? storeCategories.filter((cat) => catalogueItems.some((item) => item.category === cat.id && item.gender === audience))
    : storeCategories;
  const categoryProducts = category ? catalogueItems.filter((item) => item.category === category.id && item.gender === audience) : [];
  const garmentType = source === 'catalogue' ? product?.garmentType : ownType === OTHER_TYPE ? 'generic' : category?.garmentType;
  const garmentLabel = source === 'catalogue' ? product?.title : ownType === OTHER_TYPE ? t('otherType') : category?.label;

  function chooseSource(next: Source) {
    setSource(next);
    setCategory(null);
    setProduct(null);
    setStage('who');
  }

  function chooseType(next: StoreCategory | null) {
    setCategory(next);
    setOwnType(next ? next.id : OTHER_TYPE);
    setProduct(null);
    setStage(source === 'catalogue' ? 'pick' : 'photo');
  }

  // Phone photos are often 4-8 MB; resizing keeps requests under the 4.5 MB serverless body limit.
  function readPhoto(setter: (value: string) => void, file?: File | null) {
    if (!file) return;
    setNote('');
    compressImage(file, 1280, 0.85)
      .then(({ dataUrl }) => setter(dataUrl))
      .catch((error) => setNote(error instanceof Error ? error.message : t('photoUnreadable')));
  }

  async function createLook() {
    if (isChild && !guardianConsent) { setNote(t('guardianFirst')); return; }
    const garmentImage = source === 'own-garment' ? outfitPhoto : product?.garmentReferenceUrl || product?.imageUrl;
    if (!personPhoto || !garmentImage) { setNote(t('photoAndOutfitFirst')); return; }
    setGenerating(true);
    setNote('');
    try {
      const response = await fetch('/api/ai/master-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: `mobile_image-tryon_${Date.now()}`,
          accessCode,
          deviceId,
          service: 'try-on',
          templateId: audience === 'boys' ? 'boy' : audience === 'girls' ? 'girl' : audience,
          guardianProcessingConsent: guardianConsent,
          catalogueProductId: source === 'catalogue' ? product?.sku : undefined,
          catalogueProductTitle: source === 'catalogue' ? product?.title : undefined,
          catalogueProductCategory: category?.id,
          garmentType,
          garmentTypeConfirmed: true,
          processingConsent: true,
          consentVersion: '2026-11-privacy-v4',
          personPhoto,
          garmentPhotos: [garmentImage],
          garmentRoles: ['Primary Garment Reference'],
          garmentAnalysis: source === 'catalogue' ? `${product?.title} (${product?.fabricNote || ''})` : `Customer's own ${garmentLabel || 'outfit'}`,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.masterImageUrl) throw new Error(data?.error || t('generationFailed'));
      setResultUrl(data.masterImageUrl);
      setDownloaded(false);
      setStage('result');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setNote(error instanceof Error && error.message !== 'Failed to fetch' ? error.message : t('generationOffline'));
    } finally {
      setGenerating(false);
    }
  }

  /** The hidden second try: the server allows it once per phone, then the same choices run again. */
  async function tryOnceMore() {
    setMenuOpen(false);
    setNote('');
    try {
      const response = await fetch('/api/maharaja/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'retry', target: 'image', service: 'try-on', accessCode, deviceId, label: 'Phone Try-On retry' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) throw new Error(data?.error || t('generationFailed'));
      setRetryUsed(true);
      if (stage === 'done' || !personPhoto) {
        setStage('source');
        return;
      }
      setResultUrl('');
      await createLook();
    } catch (error) {
      setNote(error instanceof Error ? error.message : t('generationFailed'));
    }
  }

  const saveLook = () => leadGate.withLead(async () => {
    const link = document.createElement('a');
    link.href = resultUrl;
    link.download = `${clientName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-look.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setDownloaded(true);
    void fetch('/api/maharaja/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'download', accessCode, label: 'Phone Try-On download' }),
    }).catch(() => undefined);
  });

  async function shareLook() {
    const text = `${t('shareText')} ${clientName}`;
    try {
      const blob = await (await fetch(resultUrl)).blob();
      const file = new File([blob], 'my-look.jpg', { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  const back: Partial<Record<Stage, Stage>> = {
    who: 'source',
    type: 'who',
    pick: 'type',
    photo: source === 'catalogue' ? 'pick' : 'type',
    outfit: 'photo',
  };
  const backTo = back[stage];
  // The phone's back button always asks "Are you sure you want to exit?" (Continue keeps this step);
  // the on-screen Back link is how a customer steps back.
  const exitGuard = useExitGuard({ protect: Boolean(personPhoto || resultUrl) && stage !== 'done' });
  const needsOutfitStep = source === 'own-garment';
  const photoReady = Boolean(personPhoto) && !(isChild && !guardianConsent);

  return (
    <main className="mobile-workspace min-h-screen bg-canvas pb-28 text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur-md">
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
        {backTo && (
          <button type="button" onClick={() => { setNote(''); setStage(backTo); }} className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-1 text-sm font-semibold text-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" /> {t('back')}
          </button>
        )}

        {stage === 'source' && (
          <div className="space-y-4">
            <PageTitle title={t('whatToTry')} />
            {([
              ['catalogue', t('storeCollection'), t('storeCollectionText')],
              ['own-garment', t('myOwnOutfit'), t('myOwnOutfitText')],
            ] as const).map(([value, title, text]) => (
              <button key={value} type="button" onClick={() => chooseSource(value)} className="tf-card group flex w-full items-center gap-4 overflow-hidden p-0 text-left transition hover:border-ink">
                {value === 'catalogue'
                  ? <span className="grid h-28 w-28 shrink-0 grid-cols-2 gap-0.5 bg-[#F1EEE9]">{catalogueItems.slice(0, 4).map((item) => <img key={item.sku} src={item.thumbnailUrl || item.imageUrl} alt="" className="h-full w-full object-cover" />)}</span>
                  : <span className="flex h-28 w-28 shrink-0 items-center justify-center bg-white"><Shirt className="h-10 w-10" strokeWidth={1.4} /></span>}
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold">{title}</span>
                  <span className="mt-0.5 block text-sm text-muted">{text}</span>
                </span>
                <ArrowRight className="mr-4 h-5 w-5 shrink-0 transition group-hover:translate-x-1" />
              </button>
            ))}
          </div>
        )}

        {stage === 'who' && (
          <div className="space-y-4">
            <PageTitle title={t('whoFor')} />
            <Segmented
              label={t('whoFor')}
              value={audience}
              onChange={(next) => { setAudience(next); setGuardianConsent(false); setStage('type'); }}
              options={(['women', 'men', 'boys', 'girls'] as const).map((value) => ({ value, label: t(value) }))}
            />
          </div>
        )}

        {stage === 'type' && (
          <div className="space-y-4">
            <PageTitle title={t('whatType')} />
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
              {typeChoices.map((cat) => (
                <li key={cat.id}>
                  <button type="button" onClick={() => chooseType(cat)} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-base font-semibold">
                    {cat.label} <ArrowRight className="h-4 w-4 text-muted" />
                  </button>
                </li>
              ))}
              {source === 'own-garment' && (
                <li>
                  <button type="button" onClick={() => chooseType(null)} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-base font-semibold">
                    {t('otherType')} <ArrowRight className="h-4 w-4 text-muted" />
                  </button>
                </li>
              )}
            </ul>
            {typeChoices.length === 0 && source === 'catalogue' && <p className="rounded-2xl bg-white p-6 text-center text-sm text-muted">{t('noStyles')}</p>}
          </div>
        )}

        {stage === 'pick' && (
          <div className="space-y-4">
            <PageTitle title={category?.label || t('pickAnOutfit')} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {categoryProducts.map((item) => {
                const picked = product?.sku === item.sku;
                return (
                  <button key={item.sku} type="button" aria-pressed={picked} onClick={() => setProduct(item)} className={`relative overflow-hidden rounded-2xl border bg-white text-left transition ${picked ? 'border-ink ring-2 ring-ink' : 'border-line'}`}>
                    <img src={item.thumbnailUrl || item.imageUrl} alt="" loading="lazy" className="aspect-[3/4] w-full bg-[#F1EEE9] object-contain" />
                    {picked && <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-white"><Check className="h-4 w-4" /></span>}
                    <span className="line-clamp-2 block p-2.5 text-[13px] font-semibold leading-snug">{item.title}</span>
                  </button>
                );
              })}
            </div>
            {categoryProducts.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm text-muted">{t('noStyles')}</p>}
            <ActionBar>
              <button type="button" disabled={!product} onClick={() => setStage('photo')} className="tf-btn tf-btn-primary !min-h-14 text-base">
                {t('continueBtn')} <ArrowRight className="h-5 w-5" />
              </button>
            </ActionBar>
          </div>
        )}

        {stage === 'photo' && (
          <div className="space-y-4">
            <PageTitle title={t('photoTitle')} subtitle={t('photoSubtitle')} />
            <PhotoBox image={personPhoto} aspect="aspect-[9/16]" placeholder={<Camera className="h-9 w-9" />} />
            <CameraOrUpload cameraLabel={t('camera')} uploadLabel={t('upload')} onFile={(file) => readPhoto(setPersonPhoto, file)} />
            {isChild && (
              <label className="flex items-start gap-3 rounded-2xl bg-warn-soft p-3 text-[13px] text-ink">
                <input type="checkbox" checked={guardianConsent} onChange={(event) => setGuardianConsent(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
                {t('guardianAgree')}
              </label>
            )}
            {language === 'ta'
              ? <p className="text-[13px] leading-relaxed text-muted">{t('consentTryOn')} <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-brand underline underline-offset-2">{t('privacy')}</a></p>
              : <PhotoConsentNotice kind="try-on" />}
            <ActionBar note={note || (generating ? t('creatingNote') : !personPhoto ? t('needPhoto') : isChild && !guardianConsent ? t('needGuardian') : undefined)}>
              {needsOutfitStep ? (
                <button type="button" disabled={!photoReady} onClick={() => setStage('outfit')} className="tf-btn tf-btn-primary !min-h-14 text-base">
                  {t('continueBtn')} <ArrowRight className="h-5 w-5" />
                </button>
              ) : (
                <button type="button" disabled={!photoReady || generating} onClick={() => void createLook()} className="tf-btn tf-btn-primary !min-h-14 text-base">
                  {generating ? <><LoaderCircle className="h-5 w-5 animate-spin" /> {t('creating')}</> : <><Sparkles className="h-5 w-5" /> {t('createMyLook')}</>}
                </button>
              )}
            </ActionBar>
          </div>
        )}

        {stage === 'outfit' && (
          <div className="space-y-4">
            <PageTitle title={t('yourOutfit')} subtitle={t('layFlat')} />
            <PhotoBox image={outfitPhoto} aspect="aspect-[3/4]" placeholder={<Shirt className="h-9 w-9" />} contain />
            <CameraOrUpload cameraLabel={t('camera')} uploadLabel={t('upload')} onFile={(file) => readPhoto(setOutfitPhoto, file)} />
            <ActionBar note={note || (generating ? t('creatingNote') : !outfitPhoto ? t('needOutfitPhoto') : undefined)}>
              <button type="button" disabled={!outfitPhoto || !photoReady || generating} onClick={() => void createLook()} className="tf-btn tf-btn-primary !min-h-14 text-base">
                {generating ? <><LoaderCircle className="h-5 w-5 animate-spin" /> {t('creating')}</> : <><Sparkles className="h-5 w-5" /> {t('createMyLook')}</>}
              </button>
            </ActionBar>
          </div>
        )}

        {stage === 'result' && (
          <div className="space-y-4">
            <PageTitle
              title={t('yourLook')}
              action={!retryUsed ? (
                <div className="relative">
                  <button type="button" aria-label={t('moreOptions')} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-white">
                    <MoreVertical className="h-5 w-5" />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-12 z-20 w-56 overflow-hidden rounded-2xl border border-line bg-white shadow-lg">
                      <button type="button" disabled={generating} onClick={() => void tryOnceMore()} className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm font-semibold disabled:opacity-50">
                        <RotateCcw className="h-4 w-4" /> {t('tryOnceMore')}
                      </button>
                    </div>
                  )}
                </div>
              ) : undefined}
            />
            {generating ? (
              <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-3 rounded-2xl bg-white text-muted">
                <LoaderCircle className="h-8 w-8 animate-spin" /> {t('creatingNote')}
              </div>
            ) : (
              // The look can be saved only through Download (WhatsApp number first): no long-press save.
              <div className="select-none overflow-hidden rounded-2xl [-webkit-touch-callout:none] [&_img]:pointer-events-none" onContextMenu={(event) => event.preventDefault()}>
                <BeforeAfterSlider beforeImage={personPhoto} afterImage={resultUrl} beforeLabel={t('you')} afterLabel={t('newLook')} />
              </div>
            )}
            {note && <p role="alert" className="rounded-2xl bg-danger-soft p-3 text-sm font-semibold text-danger">{note}</p>}
            {!generating && (
              downloaded ? (
                <div className="space-y-3">
                  {instagramUrl && (
                    <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="tf-btn tf-btn-primary !min-h-14 w-full text-base">
                      <AtSign className="h-5 w-5" /> {t('followInstagram')}
                    </a>
                  )}
                  <button type="button" onClick={() => void shareLook()} className="tf-btn tf-btn-secondary !min-h-14 w-full text-base">
                    <MessageCircle className="h-5 w-5" /> {t('shareWhatsApp')}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => void saveLook()} className="tf-btn tf-btn-primary !min-h-14 w-full text-base">
                  <Download className="h-5 w-5" /> {t('savePhoto')}
                </button>
              )
            )}
          </div>
        )}

        {stage === 'done' && (
          <div className="space-y-4">
            <PageTitle
              title={t('doneTitle')}
              subtitle={t('doneText')}
              action={!retryUsed ? (
                <div className="relative">
                  <button type="button" aria-label={t('moreOptions')} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-white">
                    <MoreVertical className="h-5 w-5" />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-12 z-20 w-56 overflow-hidden rounded-2xl border border-line bg-white shadow-lg">
                      <button type="button" onClick={() => void tryOnceMore()} className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm font-semibold">
                        <RotateCcw className="h-4 w-4" /> {t('tryOnceMore')}
                      </button>
                    </div>
                  )}
                </div>
              ) : undefined}
            />
            {note && <p role="alert" className="rounded-2xl bg-danger-soft p-3 text-sm font-semibold text-danger">{note}</p>}
            {instagramUrl && (
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="tf-btn tf-btn-primary !min-h-14 w-full text-base">
                <AtSign className="h-5 w-5" /> {t('followInstagram')}
              </a>
            )}
          </div>
        )}
      </div>
      {leadGate.dialog}
      {exitGuard.dialog}
    </main>
  );
}

function PhotoBox({ image, aspect, placeholder, contain = false }: { image: string; aspect: string; placeholder: ReactNode; contain?: boolean }) {
  return (
    <div className="flex justify-center rounded-2xl border border-line bg-white p-4">
      {image
        ? <img src={image} alt="" className={`${aspect} h-72 rounded-xl bg-canvas ${contain ? 'object-contain' : 'object-cover'}`} />
        : <span className={`flex ${aspect} h-56 items-center justify-center rounded-xl border border-dashed border-line-strong bg-canvas text-muted`}>{placeholder}</span>}
    </div>
  );
}

/** Two clear choices: the camera opens straight away, or a photo comes from the gallery. */
function CameraOrUpload({ cameraLabel, uploadLabel, onFile }: { cameraLabel: string; uploadLabel: string; onFile: (file?: File | null) => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  return (
    <div className="grid grid-cols-2 gap-3">
      <button type="button" onClick={() => cameraRef.current?.click()} className="tf-btn tf-btn-secondary !min-h-14 text-base">
        <Camera className="h-5 w-5" /> {cameraLabel}
      </button>
      <button type="button" onClick={() => uploadRef.current?.click()} className="tf-btn tf-btn-secondary !min-h-14 text-base">
        <Upload className="h-5 w-5" /> {uploadLabel}
      </button>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = ''; }} />
      <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = ''; }} />
    </div>
  );
}
