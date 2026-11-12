'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, LoaderCircle, Sparkles } from 'lucide-react';
import HelpRetry from '@/components/HelpRetry';
import AudienceCards, { PhotoGuide } from '@/components/AudienceCards';
import PhotoConsentNotice from '@/components/PhotoConsentNotice';
import ResultClient from '@/app/result/[sessionId]/ResultClient';
import { CameraOrUpload, PhotoBox } from '@/components/MaharajaMobileExperience';
import { useExitGuard } from '@/components/ExitGuard';
import { ActionBar, PageTitle } from '@/components/ui';
import { compressImage } from '@/lib/utils/image';
import { usePhoneLanguage } from '@/lib/tryfocus/phone-language';
import { categoriesFor, type StoreCategoryLists } from '@/lib/tryfocus/store-categories';
import { conceptsForCategory, type VideoConceptId } from '@/lib/maharaja/video-concepts';
import type { CustomerCategory, EventId } from '@/lib/maharaja/config';
import type { CatalogueAudience } from '@/lib/tryfocus/sample-data';
import type { PublicCatalogueProduct } from '@/lib/maharaja/catalogue-types';

type Stage = 'loading' | 'error' | 'who' | 'photo' | 'type' | 'pick' | 'look' | 'creating-portrait' | 'portrait' | 'creating-video' | 'result';
type Piece = { sku: string; title?: string; price?: number };

const DEVICE_KEY = 'tryfocus:maharaja:device-id';
const CATEGORY_OF: Record<CatalogueAudience, CustomerCategory> = { women: 'women', men: 'men', boys: 'boy', girls: 'girl' };
const AUDIENCE_OF: Record<CustomerCategory, CatalogueAudience> = { women: 'women', men: 'men', boy: 'boys', girl: 'girls' };

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

/** Every garment the store switched on for AI Video, with the store's name and category lists. */
async function loadVideoGarments(code: string) {
  const page = (offset: number) => fetch(`/api/maharaja/catalogue?offset=${offset}&limit=100&videoOnly=true&access=${encodeURIComponent(code)}`, { cache: 'no-store' }).then(readJson);
  const first = await page(0);
  const total = Math.min(Number(first.total) || 0, 2000);
  const rest = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(total / 100) - 1) }, (_, index) => page((index + 1) * 100)));
  return {
    products: [...(first.products || []), ...rest.flatMap((data) => data.products || [])].filter((item: PublicCatalogueProduct) => item.eligibleForVideo !== false) as PublicCatalogueProduct[],
    clientName: typeof first.clientName === 'string' ? first.clientName : '',
    categoryLists: (first.categoryLists && typeof first.categoryLists === 'object' ? first.categoryLists : {}) as StoreCategoryLists,
  };
}

/**
 * The customer's phone finishes the AI Video a TV portrait QR started. The TV already picked the piece
 * and made the portrait, so the phone opens straight on Your portrait → Make my video (no portrait retry).
 * The earlier stages (Who → Your photo → What would you like to wear → pick a piece → Pick a look →
 * Make my portrait) exist only as a defensive path for a pass opened before it has those; a normal TV
 * pass never reaches them. A pass with a video already in progress opens at that step.
 */
export default function GiftVideoExperience({ accessCode }: { accessCode: string }) {
  const { language, setLanguage, t } = usePhoneLanguage();
  const [stage, setStage] = useState<Stage>('loading');
  const [error, setError] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [eventId, setEventId] = useState<EventId>('diwali');
  const [allowGoLive, setAllowGoLive] = useState(false);
  const [clientName, setClientName] = useState('');
  const [products, setProducts] = useState<PublicCatalogueProduct[]>([]);
  const [categoryLists, setCategoryLists] = useState<StoreCategoryLists>({});
  const [audience, setAudience] = useState<CatalogueAudience | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [selectedSku, setSelectedSku] = useState('');
  const [piece, setPiece] = useState<Piece | null>(null);
  const [personPhoto, setPersonPhoto] = useState('');
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [conceptId, setConceptId] = useState<VideoConceptId | ''>('');
  const [masterUrl, setMasterUrl] = useState('');
  const [masterApproved, setMasterApproved] = useState(false);
  const [videoJobId, setVideoJobId] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  // The one portrait retry: true once used (the server checks it too).
  const [portraitRetryUsed, setPortraitRetryUsed] = useState(false);
  const [portraitRetryBusy, setPortraitRetryBusy] = useState(false);
  // A TV portrait: the TV owns the portrait (and its retry); the phone makes the video only.
  const [portraitFromTv, setPortraitFromTv] = useState(false);
  const [note, setNote] = useState('');

  const category: CustomerCategory | null = audience ? CATEGORY_OF[audience] : null;
  const isChild = category === 'boy' || category === 'girl';
  const looks = useMemo(() => (category ? conceptsForCategory(category) : []), [category]);
  const categories = useMemo(
    () => (audience ? categoriesFor(categoryLists, audience).filter((cat) => products.some((item) => item.gender === audience && item.category === cat.id)) : []),
    [audience, categoryLists, products],
  );
  const pieces = products.filter((item) => item.gender === audience && item.category === categoryId);
  const busy = stage === 'creating-portrait' || stage === 'creating-video';
  const exitGuard = useExitGuard({ what: 'video', protect: Boolean(personPhoto || masterUrl) && stage !== 'result' });

  const pollVideo = useCallback(async (jobId: string) => {
    // Checks the same job every few seconds; a refresh resumes it without a second request.
    while (true) {
      await new Promise((resolve) => window.setTimeout(resolve, 3000));
      const response = await fetch(`/api/video/status?jobId=${encodeURIComponent(jobId)}&accessCode=${encodeURIComponent(accessCode)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (data.status === 'ready' && data.videoUrl) {
        setVideoUrl(data.videoUrl);
        setStage('result');
        return;
      }
      if (data.status === 'unknown') continue;
      if (!response.ok || data.status === 'failed') throw new Error(data.error || 'The video could not be made. Please try again.');
    }
  }, [accessCode]);

  useEffect(() => {
    let id = '';
    try { id = localStorage.getItem(DEVICE_KEY) || ''; } catch { /* private mode */ }
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, '');
      try { localStorage.setItem(DEVICE_KEY, id); } catch { /* private mode */ }
    }
    setDeviceId(id);
    setSessionId(`maharaja_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`);
  }, []);

  useEffect(() => {
    if (!deviceId) return;
    let active = true;
    Promise.all([
      loadVideoGarments(accessCode),
      fetch(`/api/maharaja/access/${encodeURIComponent(accessCode)}?service=ai-video&deviceId=${encodeURIComponent(deviceId)}`, { cache: 'no-store' }).then(readJson),
    ])
      .then(([catalogue, data]) => {
        if (!active) return;
        const pass = data.access || {};
        if (pass.experienceType !== 'catalogue-gift') throw new Error(t('linkInvalid'));
        setProducts(catalogue.products);
        setClientName(catalogue.clientName || data.workspace?.clientName || '');
        setCategoryLists(catalogue.categoryLists);
        if (pass.eventId) setEventId(pass.eventId);
        setAllowGoLive(pass.allowGoLive === true);
        setPortraitFromTv(pass.portraitMadeOnTv === true);
        setPortraitRetryUsed(pass.retryUsed === true);
        if (pass.videoMasterCategory) setAudience(AUDIENCE_OF[pass.videoMasterCategory as CustomerCategory] || null);
        if (pass.catalogueProduct?.sku) { setPiece(pass.catalogueProduct); setSelectedSku(pass.catalogueProduct.sku); }
        if (pass.videoMasterConceptId) setConceptId(pass.videoMasterConceptId);
        if (pass.videoReferenceSessionId) setSessionId(pass.videoReferenceSessionId);
        // Resume where the customer left off: a video being made, a portrait, or the start.
        if (pass.activeVideoJobId && pass.videoReferenceSessionId) {
          setVideoJobId(pass.activeVideoJobId);
          if (pass.videoMasterUrl) setMasterUrl(pass.videoMasterUrl);
          setStage('creating-video');
          void pollVideo(pass.activeVideoJobId).catch((caught) => { setNote(caught instanceof Error ? caught.message : ''); setStage('portrait'); });
          return;
        }
        if (pass.videoMasterUrl) {
          setMasterUrl(pass.videoMasterUrl);
          setMasterApproved(Boolean(pass.videoMasterApproved));
          setStage('portrait');
          return;
        }
        setStage(pass.videoMasterCategory && pass.catalogueProduct?.sku ? 'photo' : 'who');
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : t('linkInvalid'));
        setStage('error');
      });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessCode, deviceId, pollVideo]);

  function readPhoto(file?: File | null) {
    if (!file) return;
    setNote('');
    compressImage(file, 1024, 0.78)
      .then(({ dataUrl }) => setPersonPhoto(dataUrl))
      .catch((caught) => setNote(caught instanceof Error ? caught.message : t('photoUnreadable')));
  }

  /** Saves the chosen piece on the pass (it also records who the video is for and the garment type). */
  async function choosePiece() {
    if (!selectedSku) return;
    setNote('');
    try {
      const data = await readJson(await fetch('/api/maharaja/catalogue/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode, sku: selectedSku }),
      }));
      setPiece(data.product || { sku: selectedSku });
      setStage('look');
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : 'Unable to select this piece.');
    }
  }

  /** The customer's photo goes to private storage (direct upload, or through this site if that fails). */
  async function uploadPersonPhoto(dataUrl: string): Promise<string> {
    const prepared = await readJson(await fetch('/api/storage/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, accessCode, deviceId, folder: 'person', contentType: 'image/jpeg' }),
    }));
    if (!prepared.uploadUrl || !prepared.storagePath) throw new Error('The photo upload could not start. Check the connection and try again.');
    const binary = atob(dataUrl.split(',')[1] || dataUrl);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    let uploaded = false;
    try {
      uploaded = (await fetch(prepared.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: new Blob([bytes], { type: 'image/jpeg' }) })).ok;
    } catch { /* recovered below */ }
    if (!uploaded) {
      await readJson(await fetch('/api/storage/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, accessCode, deviceId, folder: 'person', storagePath: prepared.storagePath, dataUrl }),
      }));
    }
    return prepared.storagePath;
  }

  async function makePortrait() {
    if (!personPhoto || !category || !conceptId) return;
    if (isChild && !guardianConsent) { setNote(t('guardianFirst')); return; }
    setStage('creating-portrait');
    setNote('');
    try {
      const personPhotoStoragePath = await uploadPersonPhoto(personPhoto);
      const data = await readJson(await fetch('/api/ai/master-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          accessCode,
          deviceId,
          service: 'ai-video',
          eventId,
          templateId: category,
          conceptId,
          // The pass carries the piece's real garment type (saved when it was chosen); the server uses it.
          garmentType: 'generic',
          garmentTypeConfirmed: true,
          garmentRoles: ['Catalogue Garment Reference'],
          personAnalysis: { valid: true, additionalPhotoRequired: false },
          garmentAnalysis: { valid: true, additionalPhotoRequired: false, garmentType: 'generic', primaryColor: 'Original color' },
          processingConsent: true,
          guardianProcessingConsent: isChild ? guardianConsent : false,
          consentVersion: '2026-11-privacy-v4',
          personPhotoStoragePath,
          garmentPhotoStoragePaths: [],
        }),
      }));
      setMasterUrl(data.masterImageUrl);
      setMasterApproved(Boolean(data.approved));
      setStage('portrait');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : 'Your portrait could not be made. Please try again.');
      setStage('look');
    }
  }

  /** The one portrait retry, from Help: the same piece and look, a new photo. */
  async function retryPortrait() {
    // Help already asked "Do you need to retry this portrait?", so there is no second question.
    if (portraitRetryBusy || portraitRetryUsed) return;
    setPortraitRetryBusy(true);
    setNote('');
    try {
      await readJson(await fetch('/api/maharaja/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'retry', label: 'Customer AI Video portrait retry', accessCode, target: 'image', service: 'ai-video', deviceId, sessionId }),
      }));
      await readJson(await fetch('/api/ai/master-image/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode, sessionId, service: 'ai-video', reason: 'customer_retry_requested' }),
      }));
      setPortraitRetryUsed(true);
      setMasterUrl('');
      setMasterApproved(false);
      setPersonPhoto('');
      setStage('photo');
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : 'The retry could not start.');
    } finally {
      setPortraitRetryBusy(false);
    }
  }

  async function makeVideo() {
    if (!masterUrl || busy) return;
    setStage('creating-video');
    setNote('');
    try {
      if (!masterApproved) {
        await readJson(await fetch('/api/ai/master-image/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessCode, sessionId, masterImageUrl: masterUrl }),
        }));
        setMasterApproved(true);
      }
      const data = await readJson(await fetch('/api/video/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode, sessionId, videoModel: 'h3-max' }),
      }));
      setVideoJobId(data.jobId);
      await pollVideo(data.jobId);
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : 'The video could not be made. Please try again.');
      setStage('portrait');
    }
  }

  const pieceLocked = Boolean(piece) && stage !== 'pick';
  const back: Partial<Record<Stage, () => void>> = {
    photo: pieceLocked ? undefined : () => setStage('who'),
    type: () => setStage('photo'),
    pick: () => { setSelectedSku(''); setStage('type'); },
    look: () => setStage(piece ? 'photo' : 'pick'),
  };
  const goBack = back[stage];

  if (stage === 'result') {
    return (
      <ResultClient
        embedded
        sessionId={sessionId}
        accessCode={accessCode}
        initialVideoJobId={videoJobId}
        initialVideoUrl={videoUrl}
        initialMasterImageUrl={masterUrl}
        initialEventId={eventId}
        allowGoLive={allowGoLive}
        catalogueProduct={piece}
        storeName={clientName}
        onBack={() => { setVideoUrl(''); setVideoJobId(''); setStage('portrait'); }}
      />
    );
  }

  const storeInitial = clientName.replace(/^The\s+/i, '').charAt(0) || 'A';

  return (
    <main className="min-h-screen bg-canvas pb-32 text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-base font-bold text-white">{storeInitial}</span>
          <p className="min-w-0 flex-1 truncate font-bold">{clientName || 'AI Video'}</p>
          <div role="group" aria-label="Language" className="flex shrink-0 rounded-xl bg-line/70 p-0.5 text-sm font-semibold">
            {([['en', 'English'], ['ta', 'தமிழ்']] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={language === value} onClick={() => setLanguage(value)} className={`min-h-10 rounded-[10px] px-2.5 ${language === value ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}>{label}</button>
            ))}
          </div>
          {stage === 'portrait' && !portraitFromTv && (
            <HelpRetry
              canRetry={!portraitRetryUsed}
              busy={portraitRetryBusy}
              onRetry={() => void retryPortrait()}
              text={{
                help: t('help'), question: t('helpQuestionPortrait'), retryText: t('helpRetryPortraitText'),
                noRetryTitle: t('helpNoRetryTitle'), noRetryText: t('helpNoRetryPortrait'), tipsTitle: t('helpTipsTitle'),
                tips: [t('tipFullLength'), t('tipLight'), t('tipFace')], yes: t('yesRetry'), cancel: t('cancel'), close: t('close'),
              }}
            />
          )}
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-4 px-4 py-5">
        {goBack && (
          <button type="button" onClick={() => { setNote(''); goBack(); }} className="-ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold text-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" /> {t('back')}
          </button>
        )}

        {stage === 'loading' && <div className="flex justify-center py-24"><LoaderCircle className="h-8 w-8 animate-spin text-brand" /></div>}

        {stage === 'error' && <p className="rounded-2xl bg-white p-6 text-center text-base font-semibold">{error}</p>}

        {stage === 'who' && (
          <>
            <PageTitle title={t('whoFor')} subtitle={t('chooseOutfitText')} />
            <AudienceCards
              value={audience}
              labels={{ women: t('women'), men: t('men'), boys: t('boys'), girls: t('girls') }}
              onChange={(next) => { setAudience(next); setCategoryId(''); setSelectedSku(''); setConceptId(''); setGuardianConsent(false); setStage('photo'); }}
              // An audience with no AI Video piece yet shows "Coming soon", so no one reaches an empty list.
              unavailable={products.length ? (['women', 'men', 'boys', 'girls'] as const).filter((who) => !products.some((item) => item.gender === who)) : []}
              unavailableLabel={t('comingSoon')}
            />
            <PhotoGuide lines={[t('guideLine1'), t('guideLine2')]} />
          </>
        )}

        {stage === 'photo' && (
          <>
            <PageTitle title={t('photoTitle')} subtitle={t('giftPhotoText')} />
            <PhotoBox image={personPhoto} aspect="aspect-[9/16]" placeholder={<Camera className="h-9 w-9" />} />
            <CameraOrUpload cameraLabel={t('camera')} uploadLabel={t('upload')} onFile={readPhoto} />
            {isChild && (
              <label className="flex items-start gap-3 rounded-2xl bg-warn-soft p-3 text-[13px] text-ink">
                <input type="checkbox" checked={guardianConsent} onChange={(event) => setGuardianConsent(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
                {t('guardianAgree')}
              </label>
            )}
            <PhotoConsentNotice kind="video" />
            <ActionBar note={note || (!personPhoto ? t('needPhoto') : isChild && !guardianConsent ? t('needGuardian') : undefined)}>
              <button type="button" disabled={!personPhoto || (isChild && !guardianConsent)} onClick={() => setStage(piece ? 'look' : 'type')} className="tf-btn tf-btn-primary !min-h-14 w-full text-base">
                {t('continueBtn')} <ArrowRight className="h-5 w-5" />
              </button>
            </ActionBar>
          </>
        )}

        {stage === 'type' && (
          <>
            <PageTitle title={t('videoWhatType')} />
            {categories.length === 0 ? (
              <p className="rounded-2xl bg-white p-6 text-center text-sm text-muted">{t('noStyles')}</p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
                {categories.map((cat) => (
                  <li key={cat.id}>
                    <button type="button" onClick={() => { setCategoryId(cat.id); setSelectedSku(''); setStage('pick'); }} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-base font-semibold">
                      {cat.label} <ArrowRight className="h-4 w-4 text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {stage === 'pick' && (
          <>
            <PageTitle title={categories.find((cat) => cat.id === categoryId)?.label || t('pickAnOutfit')} subtitle={t('chooseOutfit')} />
            <div className="grid grid-cols-2 gap-3">
              {pieces.map((item) => {
                const picked = selectedSku === item.sku;
                return (
                  <button key={item.sku} type="button" aria-pressed={picked} onClick={() => setSelectedSku(item.sku)} className={`relative overflow-hidden rounded-2xl border bg-white text-left transition ${picked ? 'border-ink ring-2 ring-ink' : 'border-line'}`}>
                    <img src={item.thumbnailUrl || item.imageUrl} alt="" loading="lazy" decoding="async" className="aspect-[3/4] w-full bg-[#F1EEE9] object-contain" />
                    {picked && <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-white"><Check className="h-4 w-4" /></span>}
                    <span className="block p-2.5">
                      <span className="line-clamp-2 text-[13px] font-semibold leading-snug">{item.title}</span>
                      {item.price > 0 && <span className="mt-1 block text-[15px] font-bold tabular-nums">₹{new Intl.NumberFormat('en-IN').format(item.price)}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            {pieces.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm text-muted">{t('noStyles')}</p>}
            <ActionBar note={note || undefined}>
              <button type="button" disabled={!selectedSku} onClick={() => void choosePiece()} className="tf-btn tf-btn-primary !min-h-14 w-full text-base">
                {t('continueWithOutfit')} <ArrowRight className="h-5 w-5" />
              </button>
            </ActionBar>
          </>
        )}

        {stage === 'look' && (
          <>
            <PageTitle title={t('pickLook')} subtitle={t('pickLookText')} />
            {piece && (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-3 text-sm">
                <span className="min-w-0 truncate font-semibold">{piece.title}</span>
                {Number(piece.price || 0) > 0 && <span className="shrink-0 font-bold tabular-nums">₹{new Intl.NumberFormat('en-IN').format(Number(piece.price))}</span>}
              </div>
            )}
            <div className="space-y-3">
              {looks.map((look) => {
                const picked = conceptId === look.id;
                return (
                  <button key={look.id} type="button" aria-pressed={picked} onClick={() => setConceptId(look.id)} className={`flex w-full items-center justify-between gap-3 rounded-2xl border bg-white p-4 text-left transition ${picked ? 'border-ink ring-2 ring-ink' : 'border-line'}`}>
                    <span className="min-w-0">
                      <span className="block text-base font-bold">{look.title}</span>
                      <span className="mt-0.5 block text-sm text-muted">{look.mood}</span>
                    </span>
                    {picked && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-white"><Check className="h-4 w-4" /></span>}
                  </button>
                );
              })}
            </div>
            <ActionBar note={note || undefined}>
              <button type="button" disabled={!conceptId || !personPhoto} onClick={() => void makePortrait()} className="tf-btn tf-btn-primary !min-h-14 w-full text-base">
                <Sparkles className="h-5 w-5" /> {t('makePortrait')}
              </button>
            </ActionBar>
          </>
        )}

        {(stage === 'creating-portrait' || stage === 'creating-video') && (
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-white p-10 text-center">
            <LoaderCircle className="h-10 w-10 animate-spin text-brand" />
            <p className="text-base font-semibold">{stage === 'creating-portrait' ? t('creatingPortrait') : t('creatingVideo')}</p>
          </div>
        )}

        {stage === 'portrait' && (
          <>
            <PageTitle title={t('yourPortrait')} subtitle={t('portraitText')} />
            {masterUrl && <img src={masterUrl} alt={t('yourPortrait')} className="w-full rounded-2xl bg-white object-contain" />}
            <ActionBar note={note || undefined}>
              <button type="button" onClick={() => void makeVideo()} className="tf-btn tf-btn-primary !min-h-14 w-full text-base">
                <Sparkles className="h-5 w-5" /> {t('makeVideo')}
              </button>
            </ActionBar>
          </>
        )}
      </div>
      {exitGuard.dialog}
    </main>
  );
}
