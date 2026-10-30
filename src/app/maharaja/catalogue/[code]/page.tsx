'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Check, LoaderCircle, ShoppingBag } from 'lucide-react';
import MaharajaExperience from '@/components/MaharajaExperience';
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

  useEffect(() => {
    Promise.all([
      fetch(`/api/maharaja/catalogue?offset=0&limit=30&access=${encodeURIComponent(code)}`, { cache: 'no-store' }).then(readJson),
      fetch(`/api/maharaja/access/${encodeURIComponent(code)}?service=ai-video`, { cache: 'no-store' }).then(readJson),
    ])
      .then(([catalogue, access]) => {
        if (access.access.experienceType !== 'catalogue-gift') {
          throw new Error('This is not a Maharaja Catalogue / Giveaway link.');
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
        await fetch(`/api/maharaja/catalogue?offset=${products.length}&limit=12&access=${encodeURIComponent(code)}`, {
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
    <main className="min-h-screen bg-[#F4F5F2] text-[#161918]">
      <header className="border-b border-[#D8DCD7] bg-[#F4F5F2] px-5 py-5">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center border border-[#161918] bg-[#161918] font-mono text-xs font-bold tracking-widest text-[#FAF6EE]">
            TF
          </span>
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#7A1428]">
              TryFocus · 1-Day Video Pass
            </p>
            <h1 className="font-serif text-2xl font-semibold text-[#161918]">
              Choose Your Store Catalogue Outfit (Women & Men)
            </h1>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <p className="max-w-2xl text-sm leading-6 text-[#535A56]">
          Select any outfit from our 30-item South Indian collection (Sarees, Salwars, Lehengas, Kurtas, Veshtis & Shirts) to create your AI portrait and 6-second AI Video with <strong>Download</strong> and <strong>Go Live</strong> on the Maharaja showroom screen.
        </p>
        {error && (
          <p className="mt-4 border border-[#B42318] bg-[#FEF3F2] p-3 text-sm font-semibold text-[#B42318]">
            {error}
          </p>
        )}
        {loading ? (
          <div className="flex justify-center py-24">
            <LoaderCircle className="h-8 w-8 animate-spin text-[#7A1428]" />
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-5">
            {products.map((product) => {
              const selected = selectedSku === product.sku;
              return (
                <button
                  key={product.sku}
                  type="button"
                  onClick={() => setSelectedSku(product.sku)}
                  className={`relative overflow-hidden border bg-white text-left transition ${
                    selected
                      ? 'border-[#7A1428] ring-2 ring-[#7A1428]'
                      : 'border-[#D8DCD7] hover:border-[#161918]'
                  }`}
                >
                  <img
                    src={product.imageUrl}
                    alt={product.title}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[3/4] w-full object-cover"
                  />
                  <div className="p-3">
                    <p className="font-mono text-[10px] font-bold uppercase text-[#7A1428]">
                      {product.sku}
                    </p>
                    <p className="mt-0.5 line-clamp-2 min-h-10 font-serif text-sm font-semibold text-[#161918]">
                      {product.title}
                    </p>
                    <p className="mt-1.5 font-mono text-sm font-bold text-[#161918]">
                      ₹{new Intl.NumberFormat('en-IN').format(product.price)}
                    </p>
                  </div>
                  {selected && (
                    <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center bg-[#7A1428] text-white">
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
            className="mx-auto mt-6 flex min-h-11 items-center justify-center border border-[#161918] bg-white px-6 text-xs font-bold uppercase text-[#161918] disabled:opacity-50"
          >
            {loadingMore ? 'Loading outfits...' : 'View More Outfits'}
          </button>
        )}
        {!loading && (
          <div className="sticky bottom-3 mt-6">
            <button
              type="button"
              onClick={() => void confirmSelection()}
              disabled={!selectedSku || saving}
              className="flex min-h-14 w-full items-center justify-center gap-2 bg-[#7A1428] px-5 text-xs font-bold uppercase tracking-[0.16em] text-[#FAF6EE] shadow-xl disabled:opacity-45"
            >
              <ShoppingBag className="h-4 w-5" />
              {saving ? 'Securing Selection...' : 'Confirm Outfit & Continue to AI Video'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
