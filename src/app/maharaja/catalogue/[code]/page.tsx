'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from 'lucide-react';
import MaharajaExperience from '@/components/MaharajaExperience';
import AudienceCards from '@/components/AudienceCards';
import { ActionBar, PageTitle } from '@/components/ui';
import { usePhoneLanguage } from '@/lib/tryfocus/phone-language';
import { categoriesFor, type StoreCategoryLists } from '@/lib/tryfocus/store-categories';
import type { CatalogueAudience } from '@/lib/tryfocus/sample-data';
import type { PublicCatalogueProduct } from '@/lib/maharaja/catalogue-types';

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'Request failed.');
  return data;
}

/** Every garment the store switched on for AI Video, all pages. */
async function loadVideoGarments(code: string): Promise<{ products: PublicCatalogueProduct[]; clientName: string; categoryLists: StoreCategoryLists }> {
  const page = (offset: number) => fetch(`/api/maharaja/catalogue?offset=${offset}&limit=100&videoOnly=true&access=${encodeURIComponent(code)}`, { cache: 'no-store' }).then(readJson);
  const first = await page(0);
  const total = Math.min(Number(first.total) || 0, 2000);
  const rest = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(total / 100) - 1) }, (_, index) => page((index + 1) * 100)));
  return {
    products: [...(first.products || []), ...rest.flatMap((data) => data.products || [])].filter((item: PublicCatalogueProduct) => item.eligibleForVideo !== false),
    clientName: typeof first.clientName === 'string' ? first.clientName : '',
    categoryLists: first.categoryLists && typeof first.categoryLists === 'object' ? first.categoryLists : {},
  };
}

type Stage = 'who' | 'type' | 'pick';

/**
 * AI Video gift (phone): Who is it for → What would you like to wear (the store's categories that have
 * AI Video garments) → pick one piece → Continue into the photo, portrait and video steps.
 */
export default function MaharajaCatalogueGiftPage() {
  const params = useParams<{ code: string }>();
  const code = params.code || '';
  const [products, setProducts] = useState<PublicCatalogueProduct[]>([]);
  const [clientName, setClientName] = useState('');
  const [categoryLists, setCategoryLists] = useState<StoreCategoryLists>({});
  const [stage, setStage] = useState<Stage>('who');
  const [audience, setAudience] = useState<CatalogueAudience | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [selectedSku, setSelectedSku] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { language, setLanguage, t } = usePhoneLanguage();

  useEffect(() => {
    Promise.all([
      loadVideoGarments(code),
      fetch(`/api/maharaja/access/${encodeURIComponent(code)}?service=ai-video`, { cache: 'no-store' }).then(readJson),
    ])
      .then(([catalogue, access]) => {
        if (access.access.experienceType !== 'catalogue-gift') {
          throw new Error('This link is not valid. Please ask the store for a new one.');
        }
        setProducts(catalogue.products);
        setClientName(catalogue.clientName);
        setCategoryLists(catalogue.categoryLists);
        // A piece already chosen on this pass goes straight on to the video steps.
        if (access.access.catalogueProduct?.sku) {
          setSelectedSku(access.access.catalogueProduct.sku);
          setConfirmed(true);
        }
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to open this pass.'))
      .finally(() => setLoading(false));
  }, [code]);

  // Only the store's categories for this audience that have at least one AI Video garment.
  const categories = useMemo(
    () => (audience ? categoriesFor(categoryLists, audience).filter((cat) => products.some((item) => item.gender === audience && item.category === cat.id)) : []),
    [audience, categoryLists, products],
  );
  const category = categories.find((cat) => cat.id === categoryId);
  const pieces = products.filter((item) => item.gender === audience && item.category === categoryId);

  async function confirmSelection() {
    if (!selectedSku) return;
    setSaving(true);
    setError('');
    try {
      await readJson(await fetch('/api/maharaja/catalogue/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: code, sku: selectedSku }),
      }));
      setConfirmed(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to select this garment.');
    } finally {
      setSaving(false);
    }
  }

  function back() {
    setError('');
    if (stage === 'pick') { setSelectedSku(''); setStage('type'); }
    else if (stage === 'type') setStage('who');
  }

  if (confirmed) return <MaharajaExperience service="ai-video" accessCode={code} />;

  const storeName = clientName.replace(/^The\s+/i, '') || 'Store';

  return (
    <main className="min-h-screen bg-canvas pb-32 text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-base font-bold text-white">{storeName.charAt(0)}</span>
          <p className="min-w-0 flex-1 truncate font-bold">{clientName || 'AI Video'}</p>
          <div role="group" aria-label="Language" className="flex shrink-0 rounded-xl bg-line/70 p-0.5 text-sm font-semibold">
            {([['en', 'English'], ['ta', 'தமிழ்']] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={language === value} onClick={() => setLanguage(value)} className={`min-h-10 rounded-[10px] px-2.5 ${language === value ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}>{label}</button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {stage !== 'who' && (
          <button type="button" onClick={back} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted">
            <ArrowLeft className="h-4 w-4" /> {t('back')}
          </button>
        )}
        {error && <p className="rounded-2xl bg-danger-soft p-3 text-sm font-semibold text-danger">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-24"><LoaderCircle className="h-8 w-8 animate-spin text-brand" /></div>
        ) : stage === 'who' ? (
          <>
            <PageTitle title={t('whoFor')} subtitle={t('chooseOutfitText')} />
            <AudienceCards
              value={audience}
              labels={{ women: t('women'), men: t('men'), boys: t('boys'), girls: t('girls') }}
              onChange={(next) => { setAudience(next); setCategoryId(''); setSelectedSku(''); setStage('type'); }}
            />
          </>
        ) : stage === 'type' ? (
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
        ) : (
          <>
            <PageTitle title={category?.label || t('pickAnOutfit')} subtitle={t('chooseOutfit')} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {pieces.map((item) => {
                const picked = selectedSku === item.sku;
                return (
                  <button key={item.sku} type="button" aria-pressed={picked} onClick={() => setSelectedSku(item.sku)} className={`relative overflow-hidden rounded-2xl border bg-white text-left transition ${picked ? 'border-ink ring-2 ring-ink' : 'border-line'}`}>
                    <img src={item.thumbnailUrl || item.imageUrl} alt="" loading="lazy" decoding="async" className="aspect-[3/4] w-full bg-[#F1EEE9] object-contain" />
                    {picked && <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-white"><Check className="h-4 w-4" /></span>}
                    <span className="block p-2.5">
                      <span className="line-clamp-2 text-[13px] font-semibold leading-snug">{item.title}</span>
                      {item.price > 0 && <span className="mt-1 block text-[13px] tabular-nums text-muted">₹{new Intl.NumberFormat('en-IN').format(item.price)}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            {pieces.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm text-muted">{t('noStyles')}</p>}
            <ActionBar>
              <button type="button" disabled={!selectedSku || saving} onClick={() => void confirmSelection()} className="tf-btn tf-btn-primary !min-h-14 w-full text-base">
                {saving ? t('saving') : t('continueWithOutfit')} <ArrowRight className="h-5 w-5" />
              </button>
            </ActionBar>
          </>
        )}
      </div>
    </main>
  );
}
