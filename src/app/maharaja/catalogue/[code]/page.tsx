'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Check, LoaderCircle, ShoppingBag } from 'lucide-react';
import MaharajaExperience from '@/components/MaharajaExperience';
import { usePhoneLanguage } from '@/lib/tryfocus/phone-language';
import type { PublicCatalogueProduct } from '@/lib/maharaja/catalogue-types';

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'Request failed.');
  return data;
}

export default function MaharajaCatalogueGiftPage() {
  const params = useParams<{ code: string }>();
  const code = params.code || '';
  const [products, setProducts] = useState<PublicCatalogueProduct[]>([]);
  const [selectedSku, setSelectedSku] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalProducts, setTotalProducts] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { language, setLanguage, t } = usePhoneLanguage();

  useEffect(() => {
    Promise.all([
      fetch(`/api/maharaja/catalogue?offset=0&limit=30&videoOnly=true&access=${encodeURIComponent(code)}`, { cache: 'no-store' }).then(readJson),
      fetch(`/api/maharaja/access/${encodeURIComponent(code)}?service=ai-video`, { cache: 'no-store' }).then(readJson),
    ])
      .then(([catalogue, access]) => {
        if (access.access.experienceType !== 'catalogue-gift') {
          throw new Error('This link is not valid. Please ask the store for a new one.');
        }
        setProducts(catalogue.products || []);
        setTotalProducts(Number(catalogue.total || 0));
        if (access.access.catalogueProduct?.sku) {
          setSelectedSku(access.access.catalogueProduct.sku);
          setConfirmed(true);
        }
      })
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : 'Unable to open this pass.')
      )
      .finally(() => setLoading(false));
  }, [code]);

  async function confirmSelection() {
    if (!selectedSku) return;
    setSaving(true);
    setError('');
    try {
      await readJson(
        await fetch('/api/maharaja/catalogue/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessCode: code, sku: selectedSku }),
        })
      );
      setConfirmed(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to select this garment.');
    } finally {
      setSaving(false);
    }
  }

  async function loadMore() {
    if (loadingMore || products.length >= totalProducts) return;
    setLoadingMore(true);
    try {
      const catalogue = await readJson(
        await fetch(`/api/maharaja/catalogue?offset=${products.length}&limit=12&videoOnly=true&access=${encodeURIComponent(code)}`, {
          cache: 'no-store',
        })
      );
      setProducts((current) => [...current, ...(catalogue.products || [])]);
      setTotalProducts(Number(catalogue.total || totalProducts));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load more outfits.');
    } finally {
      setLoadingMore(false);
    }
  }

  if (confirmed) return <MaharajaExperience service="ai-video" accessCode={code} />;

  return (
    <main className="min-h-screen bg-[#F4F5F2] text-ink">
      <header className="border-b border-line bg-[#F4F5F2] px-5 py-5">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center border border-ink bg-ink tabular-nums text-xs font-bold text-[#FAF6EE]">
            TF
          </span>
          <div>
            <h1 className="text-2xl font-bold text-ink">
              {t('chooseOutfit')}
            </h1>
          </div>
          <div role="group" aria-label="Language" className="ml-auto flex shrink-0 rounded-xl bg-line/70 p-0.5 text-sm font-semibold">
            {([['en', 'English'], ['ta', 'தமிழ்']] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={language === value} onClick={() => setLanguage(value)} className={`min-h-10 rounded-[10px] px-2.5 ${language === value ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}>{label}</button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <p className="max-w-2xl text-sm leading-6 text-muted">
          {t('chooseOutfitText')}
        </p>
        {error && (
          <p className="mt-4 border border-danger bg-[#FEF3F2] p-3 text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        {loading ? (
          <div className="flex justify-center py-24">
            <LoaderCircle className="h-8 w-8 animate-spin text-brand" />
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-5">
            {products.filter((product) => product.eligibleForVideo !== false).map((product) => {
              const selected = selectedSku === product.sku;
              return (
                <button
                  key={product.sku}
                  type="button"
                  onClick={() => setSelectedSku(product.sku)}
                  className={`relative overflow-hidden border bg-white text-left transition ${
 selected
 ? 'border-brand ring-2 ring-brand'
 : 'border-line hover:border-ink'
 }`}
                >
                  <img
                    src={product.thumbnailUrl || product.imageUrl}
                    alt={product.title}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[3/4] w-full object-cover"
                  />
                  <div className="p-3">
                    <p className="text-xs font-bold text-brand">
                      {product.sku}
                    </p>
                    <p className="mt-0.5 line-clamp-2 min-h-10 tracking-tight text-sm font-semibold text-ink">
                      {product.title}
                    </p>
                    <p className="mt-1.5 tabular-nums text-sm font-bold text-ink">
                      ₹{new Intl.NumberFormat('en-IN').format(product.price)}
                    </p>
                  </div>
                  {selected && (
                    <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center bg-brand text-white">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {!loading && products.length < totalProducts && (
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="mx-auto mt-6 flex min-h-11 items-center justify-center border border-ink bg-white px-6 text-xs font-bold text-ink disabled:opacity-50"
          >
            {loadingMore ? t('loadingOutfits') : t('moreOutfits')}
          </button>
        )}
        {!loading && (
          <div className="sticky bottom-3 mt-6">
            <button
              type="button"
              onClick={() => void confirmSelection()}
              disabled={!selectedSku || saving}
              className="flex min-h-14 w-full items-center justify-center gap-2 bg-brand px-5 text-xs font-bold text-[#FAF6EE] shadow-xl disabled:opacity-45"
            >
              <ShoppingBag className="h-4 w-5" />
              {saving ? t('saving') : t('continueWithOutfit')}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
