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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/maharaja/catalogue', { cache: 'no-store' }).then(readJson),
      fetch(`/api/maharaja/access/${encodeURIComponent(code)}?service=ai-video`, { cache: 'no-store' }).then(readJson),
    ]).then(([catalogue, access]) => {
      if (access.access.experienceType !== 'catalogue-gift') throw new Error('This is not a Maharaja Catalogue Gift link.');
      setProducts(catalogue.products || []);
      if (access.access.catalogueProduct?.sku) {
        setSelectedSku(access.access.catalogueProduct.sku);
        setConfirmed(true);
      }
    }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to open this gift.'))
      .finally(() => setLoading(false));
  }, [code]);

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
      setError(caught instanceof Error ? caught.message : 'Unable to select this saree.');
    } finally {
      setSaving(false);
    }
  }

  if (confirmed) return <MaharajaExperience service="ai-video" accessCode={code} />;
  return (
    <main className="min-h-screen bg-[#F7F4EE] text-[#211A17]">
      <header className="bg-[#21090E] px-5 py-6 text-[#F3E5AB]">
        <div className="mx-auto max-w-6xl"><p className="text-xs font-bold uppercase text-[#D4AF37]">A gift from Majestic Maharaja</p><h1 className="mt-1 font-serif text-3xl font-bold">Choose your silk saree</h1></div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <p className="max-w-2xl text-sm leading-6 text-[#5C4B43]">Select one saree for your private Maharaja AI image and six-second film. Your selection locks when you confirm it.</p>
        {error && <p className="mt-4 border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p>}
        {loading ? <div className="flex justify-center py-24"><LoaderCircle className="h-8 w-8 animate-spin text-[#6E0D1F]" /></div> : (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => {
              const selected = selectedSku === product.sku;
              return <button key={product.sku} type="button" onClick={() => setSelectedSku(product.sku)} className={`relative overflow-hidden border bg-white text-left transition ${selected ? 'border-[#6E0D1F] ring-2 ring-[#D4AF37]' : 'border-[#DDD2BD]'}`}>
                <img src={product.imageUrl} alt={product.title} className="aspect-[5/7] w-full object-cover" />
                <div className="p-3"><p className="line-clamp-2 min-h-10 text-sm font-bold text-[#2A060C]">{product.title}</p><p className="mt-2 font-black text-[#6E0D1F]">Rs {new Intl.NumberFormat('en-IN').format(product.price)}</p><p className="mt-1 text-[10px] font-bold uppercase text-[#8A6A20]">{product.sku}</p></div>
                {selected && <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#6E0D1F] text-white"><Check className="h-4 w-4" /></span>}
              </button>;
            })}
          </div>
        )}
        {!loading && <div className="sticky bottom-3 mt-6"><button type="button" onClick={() => void confirmSelection()} disabled={!selectedSku || saving} className="flex min-h-14 w-full items-center justify-center gap-2 bg-[#6E0D1F] px-5 text-sm font-bold uppercase text-[#F3E5AB] shadow-xl disabled:opacity-45"><ShoppingBag className="h-5 w-5" />{saving ? 'Securing selection' : 'Create my Maharaja gift'}</button></div>}
      </div>
    </main>
  );
}
