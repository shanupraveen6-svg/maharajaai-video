'use client';

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
  Shirt,
  Sparkles,
  Upload,
} from 'lucide-react';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import DressLoader from '@/components/DressLoader';
import { PhotoGuide } from '@/components/AudienceCards';
import WhoCards, { KidsSwitch, type WhoGroup } from '@/components/kiosk/WhoCards';
import { compressImage } from '@/lib/utils/image';
import type { CatalogueAudience, TryFocusProduct } from '@/lib/tryfocus/sample-data';
import PhotoConsentNotice from '@/components/PhotoConsentNotice';
import { ActionBar, PageTitle } from '@/components/ui';
import { usePhoneLanguage } from '@/lib/tryfocus/phone-language';
import { useLeadGate } from '@/components/LeadGate';
import HelpRetry from '@/components/HelpRetry';
import { useExitGuard } from '@/components/ExitGuard';
import { categoriesFor, type CustomCategory, type StoreCategory, type StoreCategoryLists } from '@/lib/tryfocus/store-categories';

type Source = 'catalogue' | 'own-garment';
type Stage = 'bill' | 'who' | 'photo' | 'source' | 'type' | 'pick' | 'outfit' | 'result' | 'done';

const DEVICE_KEY = 'tryfocus:maharaja:device-id';
/** The "Other" choice for a customer's own outfit: the model copies the photo as it is. */
const OTHER_TYPE = 'other';

/**
 * What the store's Wall QR opens: Try-On on the customer's phone. Each phone gets one free look (and one
 * retry, asked from Help on the look). Steps: (a photo of the bill, when the store set a Try-On minimum) → Who → your
 * photo (camera or upload) → Store collection or My own outfit → What type → pick a piece, or photograph
 * your outfit → your look. Nothing is stored: the
 * look comes back to the phone only. Download asks for WhatsApp, then offers Instagram and sharing.
 */
export default function MaharajaMobileExperience({ accessCode, clientName = 'The Majestic Maharaja' }: { accessCode: string; clientName?: string }) {
  const { language, setLanguage, t } = usePhoneLanguage();
  const leadGate = useLeadGate({ kind: 'pass', ref: accessCode, source: 'try-on' });
  const catalogueItems = useStoreCatalogue(accessCode);

  const [stage, setStage] = useState<Stage>('who');
  const [source, setSource] = useState<Source>('catalogue');
  const [audience, setAudience] = useState<CatalogueAudience>('women');
  // Nothing is pre-selected: Who stays empty until the customer taps one.
  // Women · Men · Kids; Kids picks Boys or Girls under the camera.
  const [whoGroup, setWhoGroup] = useState<WhoGroup | null>(null);
  const [kidPicked, setKidPicked] = useState(false);
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

  const [deviceId, setDeviceId] = useState('');
  // The phone's one hidden retry: false until used (the server checks it too).
  const [retryUsed, setRetryUsed] = useState(false);
  // The retry was granted but not finished: Help → Yes, retry simply starts it again.
  const [retryPending, setRetryPending] = useState(false);
  const [categoryLists, setCategoryLists] = useState<StoreCategoryLists>({});
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  // The store's Try-On minimum: above 0, the phone asks for a photo of the bill first, then gets a grant.
  const [tryOnMinimum, setTryOnMinimum] = useState(0);
  const [tryOnGrant, setTryOnGrant] = useState('');
  const [billPhoto, setBillPhoto] = useState('');
  const [checkingBill, setCheckingBill] = useState(false);
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
        const minimum = Number(data.workspace?.tryOnMinimum || 0);
        setTryOnMinimum(minimum);
        if (minimum > 0) setStage((current) => (current === 'who' ? 'bill' : current));
        // Made a look within the last hour: that look is the only screen.
        setRetryPending(Boolean(data.access?.retryPending));
        // A phone that already made a look never starts over from a re-scan.
        if (typeof data.access?.phoneLookUrl === 'string') {
          setResultUrl(data.access.phoneLookUrl);
          setStage('result');
        } else if (data.access?.tryOnUsed || data.access?.lookMade) {
          setDownloaded(Boolean(data.access.lookDownloaded));
          setStage('done');
        }
      })
      .catch(() => undefined);
    fetchCatalogueSettings(accessCode).then((settings) => {
      setCategoryLists(settings.categoryLists);
      setCustomCategories(settings.customCategories);
      setInstagramUrl(settings.instagramUrl);
    });
  }, [accessCode]);

  const isChild = audience === 'boys' || audience === 'girls';
  const storeCategories = categoriesFor(categoryLists, audience, customCategories);
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
    setStage('type');
  }

  function chooseType(next: StoreCategory | null) {
    setCategory(next);
    setOwnType(next ? next.id : OTHER_TYPE);
    setProduct(null);
    setStage(source === 'catalogue' ? 'pick' : 'outfit');
  }

  /** The bill photo is read on the server: a total at or above the store's minimum unlocks Try-On. */
  async function checkBill(file?: File | null) {
    if (!file) return;
    setNote('');
    setCheckingBill(true);
    try {
      const { dataUrl } = await compressImage(file, 1600, 0.85);
      setBillPhoto(dataUrl);
      const response = await fetch('/api/ai/analyze-price-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode, deviceId, image: dataUrl, kind: 'bill', confirmed: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) throw new Error(data?.error || t('billUnreadable'));
      if (!data.grant?.token) throw new Error(data.analysis?.message || t('billUnreadable'));
      setTryOnGrant(data.grant.token);
      setStage('who');
    } catch (error) {
      setNote(error instanceof Error ? error.message : t('billUnreadable'));
    } finally {
      setCheckingBill(false);
    }
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
          tryOnGrant: tryOnGrant || undefined,
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
      setRetryPending(false);
      setStage('result');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setNote(error instanceof Error && error.message !== 'Failed to fetch' ? error.message : t('generationOffline'));
    } finally {
      setGenerating(false);
    }
  }

  /** A retry starts from the very beginning: new Who, category, piece and photos; nothing is kept. */
  function startFresh() {
    setSource('catalogue');
    setWhoGroup(null);
    setKidPicked(false);
    setCategory(null);
    setOwnType('');
    setProduct(null);
    setPersonPhoto('');
    setOutfitPhoto('');
    setGuardianConsent(false);
    setResultUrl('');
    setDownloaded(false);
    setNote('');
    setStage(tryOnMinimum > 0 && !tryOnGrant ? 'bill' : 'who');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** The hidden second try: the server allows it once per phone, then the same choices run again. */
  async function tryOnceMore() {
    setNote('');
    // The retry was already granted on an earlier visit: start it again without asking the server.
    if (retryPending) {
      startFresh();
      return;
    }
    try {
      const response = await fetch('/api/maharaja/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'retry', target: 'image', service: 'try-on', accessCode, deviceId, label: 'Phone Try-On retry' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) throw new Error(data?.error || t('generationFailed'));
      setRetryUsed(true);
      setRetryPending(true);
      startFresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : t('generationFailed'));
    }
  }

  const saveLook = () => leadGate.withLead(async () => {
    // The file is read fully first, so the stored copy can be wiped the moment it is on the phone.
    let blobUrl = '';
    try {
      blobUrl = URL.createObjectURL(await lookBlob(resultUrl));
    } catch {
      setNote(t('saveFailed'));
      return;
    }
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${clientName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-look.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setDownloaded(true);
    // Keep the downloaded image for Share on WhatsApp on this page; the server copy is deleted now.
    setResultUrl(blobUrl);
    void fetch(`/api/maharaja/phone-look?access=${encodeURIComponent(accessCode)}&deviceId=${encodeURIComponent(deviceId)}`, { method: 'DELETE' }).catch(() => undefined);
    void fetch('/api/maharaja/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'download', accessCode, label: 'Phone Try-On download' }),
    }).catch(() => undefined);
  });

  async function shareLook() {
    // Every share brings friends to this store's own Try-On (the Wall QR link).
    const link = `${window.location.origin}/maharaja/mobile/experience?access=${encodeURIComponent(accessCode)}`;
    const text = `${t('shareText')} ${clientName}. ${t('shareInvite')} ${link}`;
    try {
      if (!resultUrl) throw new Error('no image');
      const blob = await lookBlob(resultUrl);
      const file = new File([blob], 'my-look.jpg', { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
    // Without the image on this page (after a reload), the store's Try-On link goes instead.
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  const back: Partial<Record<Stage, Stage>> = {
    photo: 'who',
    source: 'photo',
    type: 'source',
    pick: 'type',
    outfit: 'type',
  };
  const backTo = back[stage];
  // The phone's back button always asks "Are you sure you want to exit?" (Continue keeps this step);
  // the on-screen Back link is how a customer steps back.
  const exitGuard = useExitGuard({ protect: Boolean(personPhoto || resultUrl) && stage !== 'done' });
  const kidsPending = whoGroup === 'kids' && !kidPicked;
  const photoReady = Boolean(personPhoto) && !kidsPending && !(isChild && !guardianConsent);

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
            {/* Help sits top right on the look: the one retry is asked there, never a button on the page. */}
            {(stage === 'result' || stage === 'done') && (
              <HelpRetry
                canRetry={!retryUsed || retryPending}
                busy={generating}
                onRetry={() => void tryOnceMore()}
                text={{
                  help: t('help'), question: t('helpQuestionImage'), retryText: t('helpRetryImageText'),
                  noRetryTitle: t('helpNoRetryTitle'), noRetryText: t('helpNoRetryImage'), tipsTitle: t('helpTipsTitle'),
                  tips: [t('tipFullLength'), t('tipLight'), t('tipOneGarment')], yes: t('yesRetry'), cancel: t('cancel'), close: t('close'),
                }}
              />
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-5 px-4 pt-4">
        {backTo && (
          <button type="button" onClick={() => { setNote(''); setStage(backTo); }} className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-1 text-sm font-semibold text-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" /> {t('back')}
          </button>
        )}

        {stage === 'bill' && (
          <div className="space-y-4">
            <PageTitle title={t('billTitle')} subtitle={`${t('billSubtitle')} ₹${tryOnMinimum.toLocaleString('en-IN')}.`} />
            <PhotoBox image={billPhoto} aspect="aspect-[3/4]" placeholder={<Camera className="h-9 w-9" />} contain />
            <CameraOrUpload cameraLabel={t('camera')} uploadLabel={t('upload')} onFile={(file) => void checkBill(file)} />
            {(note || checkingBill) && <p role="alert" className={`rounded-2xl p-3 text-sm font-semibold ${checkingBill ? 'bg-white text-muted' : 'bg-danger-soft text-danger'}`}>{checkingBill ? t('billChecking') : note}</p>}
          </div>
        )}

        {stage === 'who' && (
          <div className="space-y-4">
            <PageTitle title={t('whoFor')} />
            <WhoCards
              size="md"
              value={whoGroup}
              onChange={(next) => { setWhoGroup(next); setKidPicked(false); if (next !== 'kids') setAudience(next); setGuardianConsent(false); setStage('photo'); }}
              labels={{ women: t('women'), men: t('men'), kids: t('kids'), adultAge: t('ageAdult'), kidsAge: t('ageKids') }}
            />
            <PhotoGuide lines={[t('guideLine1'), t('guideLine2')]} />
          </div>
        )}

        {stage === 'photo' && (
          <div className="space-y-4">
            <PageTitle title={t('photoTitle')} subtitle={t('photoSubtitle')} />
            <PhotoBox image={personPhoto} aspect="aspect-[9/16]" placeholder={<Camera className="h-9 w-9" />} />
            <CameraOrUpload cameraLabel={t('camera')} uploadLabel={t('upload')} onFile={(file) => readPhoto(setPersonPhoto, file)} />
            {whoGroup === 'kids' && (
              <KidsSwitch size="md" value={kidPicked && isChild ? (audience as 'boys' | 'girls') : null} onChange={(kid) => { setAudience(kid); setKidPicked(true); }} labels={{ boys: t('boys'), girls: t('girls') }} />
            )}
            {isChild && kidPicked && (
              <label className="flex items-start gap-3 rounded-2xl bg-warn-soft p-3 text-[13px] text-ink">
                <input type="checkbox" checked={guardianConsent} onChange={(event) => setGuardianConsent(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
                {t('guardianAgree')}
              </label>
            )}
            {language === 'ta'
              ? <p className="text-[13px] leading-relaxed text-muted">{t('consentTryOn')} <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-brand underline underline-offset-2">{t('privacy')}</a></p>
              : <PhotoConsentNotice kind="try-on" />}
            <ActionBar note={note || (!personPhoto ? t('needPhoto') : kidsPending ? t('needBoysGirls') : isChild && !guardianConsent ? t('needGuardian') : undefined)}>
              <button type="button" disabled={!photoReady} onClick={() => setStage('source')} className="tf-btn tf-btn-primary !min-h-14 text-base">
                {t('continueBtn')} <ArrowRight className="h-5 w-5" />
              </button>
            </ActionBar>
          </div>
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
            <ActionBar note={note || (generating ? t('creatingNote') : undefined)}>
              <button type="button" disabled={!product || !photoReady || generating} onClick={() => void createLook()} className="tf-btn tf-btn-primary !min-h-14 text-base">
                {generating ? <><LoaderCircle className="h-5 w-5 animate-spin" /> {t('creating')}</> : <><Sparkles className="h-5 w-5" /> {t('createMyLook')}</>}
              </button>
            </ActionBar>
          </div>
        )}

        {stage === 'outfit' && (
          <div className="space-y-4">
            <PageTitle title={t('yourOutfit')} subtitle={t('layFlat')} />
            <PhotoGuide lines={[t('outfitGuide1'), t('outfitGuide2')]} />
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
            <PageTitle title={t('yourLook')} />
            {generating ? (
              <div className="flex aspect-[9/16] w-full items-center justify-center rounded-2xl bg-white" />
            ) : (
              // The look can be saved only through Download (WhatsApp number first): no long-press save.
              <div className="select-none overflow-hidden rounded-2xl [-webkit-touch-callout:none] [&_img]:pointer-events-none" onContextMenu={(event) => event.preventDefault()}>
                {personPhoto
                  ? <BeforeAfterSlider beforeImage={personPhoto} afterImage={resultUrl} beforeLabel={t('you')} afterLabel={t('newLook')} />
                  : <img src={resultUrl} alt={t('yourLook')} draggable={false} className="w-full rounded-2xl bg-white object-contain" />}
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
                <div className="space-y-3">
                  <button type="button" onClick={() => void saveLook()} className="tf-btn tf-btn-primary !min-h-14 w-full text-base">
                    <Download className="h-5 w-5" /> {t('savePhoto')}
                  </button>
                  {/* Sharing the look spreads the store; it asks for the WhatsApp number first, like Download. */}
                  <button type="button" onClick={() => void leadGate.withLead(() => shareLook())} className="tf-btn tf-btn-secondary !min-h-14 w-full text-base">
                    <MessageCircle className="h-5 w-5" /> {t('shareWhatsApp')}
                  </button>
                </div>
              )
            )}
          </div>
        )}

        {stage === 'done' && (
          <div className="space-y-4">
            <PageTitle title={downloaded ? t('savedTitle') : t('doneTitle')} subtitle={downloaded ? t('savedText') : t('doneText')} />
            {note && <p role="alert" className="rounded-2xl bg-danger-soft p-3 text-sm font-semibold text-danger">{note}</p>}
            {instagramUrl && (
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="tf-btn tf-btn-primary !min-h-14 w-full text-base">
                <AtSign className="h-5 w-5" /> {t('followInstagram')}
              </a>
            )}
            <button type="button" onClick={() => void shareLook()} className="tf-btn tf-btn-secondary !min-h-14 w-full text-base">
              <MessageCircle className="h-5 w-5" /> {t('shareWhatsApp')}
            </button>
          </div>
        )}
      </div>
      {generating && (
        // Under the store's header (z-30), which stays visible while the look is made.
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-canvas/95 p-6 backdrop-blur-sm">
          <DressLoader size="lg" title={t('creating')} />
        </div>
      )}
      {leadGate.dialog}
      {exitGuard.dialog}
    </main>
  );
}

export function PhotoBox({ image, aspect, placeholder, contain = false }: { image: string; aspect: string; placeholder: ReactNode; contain?: boolean }) {
  return (
    <div className="flex justify-center rounded-2xl border border-line bg-white p-4">
      {image
        ? <img src={image} alt="" className={`${aspect} h-72 rounded-xl bg-canvas ${contain ? 'object-contain' : 'object-cover'}`} />
        : <span className={`flex ${aspect} h-56 items-center justify-center rounded-xl border border-dashed border-line-strong bg-canvas text-muted`}>{placeholder}</span>}
    </div>
  );
}

/** Two clear choices: the camera opens straight away, or a photo comes from the gallery. */
export function CameraOrUpload({ cameraLabel, uploadLabel, onFile }: { cameraLabel: string; uploadLabel: string; onFile: (file?: File | null) => void }) {
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

/**
 * The look as a file. A fresh look is a data: address and is decoded here directly (no network fetch,
 * which the site's security policy would treat as a connection); a saved look is fetched from this site.
 */
async function lookBlob(url: string): Promise<Blob> {
  const match = url.match(/^data:([^;,]+);base64,(.*)$/);
  if (match) {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: match[1] });
  }
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('The look could not be read.');
  return response.blob();
}
