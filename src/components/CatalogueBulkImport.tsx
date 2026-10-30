'use client';

import { useState } from 'react';
import { catalogueCategories, type CatalogueAudience, type CatalogueCategoryId } from '@/lib/tryfocus/sample-data';

type Row = {
  id: string;
  sku: string;
  filename: string;
  title: string;
  storagePath: string;
  category: CatalogueCategoryId;
  price: string;
  status: 'uploading' | 'ready' | 'failed';
  error?: string;
};

const PAGE_SIZE = 25;
const AUDIENCES: { id: CatalogueAudience; label: string }[] = [
  { id: 'women', label: 'Women' }, { id: 'men', label: 'Men' },
  { id: 'boys', label: 'Boys' }, { id: 'girls', label: 'Girls' },
];

export default function CatalogueBulkImport({ onPublished }: { onPublished?: () => Promise<void> } = {}) {
  const [audience, setAudience] = useState<CatalogueAudience>('women');
  const [category, setCategory] = useState<CatalogueCategoryId | ''>('');
  const [batchId, setBatchId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState('');
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [newArrival, setNewArrival] = useState(false);
  const availableCategories = catalogueCategories.filter((item) => item.gender === audience);
  const visible = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const unresolved = rows.filter((row) => row.status !== 'ready').length;

  function update(id: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  async function begin(files: FileList | null) {
    if (!files?.length || busy || publishing) return;
    if (!category) { setMessage('Select a category before choosing photos.'); return; }
    const chosen = Array.from(files).filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
    if (!chosen.length) { setMessage('Choose JPEG, PNG or WebP garment photos.'); return; }
    const selectedCategory = category;
    const nextBatch = crypto.randomUUID();
    setBatchId(nextBatch);
    setPage(0);
    setMessage(`Uploading ${chosen.length} garments to ${availableCategories.find((item) => item.id === selectedCategory)?.label}. Nothing is public until you submit.`);
    const initial: Row[] = chosen.map((file, index) => ({
      id: `${nextBatch}:${index}`,
      sku: `MAH-${nextBatch.slice(0, 6).toUpperCase()}-${String(index + 1).padStart(4, '0')}`,
      filename: file.name,
      title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || `Garment ${index + 1}`,
      storagePath: '', category: selectedCategory, price: '', status: 'uploading',
    }));
    setRows(initial);
    setBusy(true);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(3, chosen.length) }, async () => {
      while (cursor < chosen.length) {
        const index = cursor++;
        const row = initial[index];
        const form = new FormData();
        form.set('batchId', nextBatch);
        form.set('category', selectedCategory);
        form.set('file', chosen[index]);
        try {
          const response = await fetch('/api/maharaja/catalogue/import/analyze', { method: 'POST', body: form });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.success) throw new Error(data.error || 'Upload failed.');
          update(row.id, { storagePath: data.storagePath, status: 'ready' });
        } catch (error) {
          update(row.id, { status: 'failed', error: error instanceof Error ? error.message : 'Upload failed.' });
        }
      }
    }));
    setBusy(false);
    setMessage('Review titles and category, then submit the batch.');
  }

  async function publish() {
    if (busy || publishing || !rows.length || unresolved) { setMessage('Resolve failed uploads before submitting.'); return; }
    setPublishing(true);
    const completed = new Set<string>();
    const errors: string[] = [];
    for (let start = 0; start < rows.length; start += 20) {
      const chunk = rows.slice(start, start + 20);
      try {
        const response = await fetch('/api/maharaja/catalogue/import/publish', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId, items: chunk.map((row) => ({ sku: row.sku, title: row.title, category: row.category, storagePath: row.storagePath, price: Number(row.price) || 0, eligibleForVideo: videoEnabled, eligibleForLive: liveEnabled, newArrival })) }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(data.results)) throw new Error(data.error || 'Batch publish failed.');
        for (const result of data.results) {
          if (result.success) completed.add(result.sku);
          else errors.push(`${result.sku}: ${result.error || 'Publish failed'}`);
        }
      } catch (error) { errors.push(error instanceof Error ? error.message : 'Batch publish failed.'); }
      setMessage(`${Math.min(start + 20, rows.length)} of ${rows.length} reviewed; ${completed.size} published.`);
    }
    setRows((current) => current.filter((row) => !completed.has(row.sku)));
    setPage(0);
    setPublishing(false);
    await onPublished?.();
    setMessage(errors.length ? `${completed.size} published. ${errors.length} need retry: ${errors.slice(0, 3).join(' · ')}` : `${completed.size} garments published to the catalogue.`);
  }

  return <div className="mt-5 space-y-5 border border-[#D8DCD7] bg-[#FAFBF8] p-5 text-[#161918]">
    <div><h3 className="font-serif text-2xl font-semibold">Upload a collection</h3><p className="mt-1 text-sm text-[#535A56]">Choose who the garments are for and their category, then upload all photos together. Every image stays in your chosen category. Review the batch before publishing.</p></div>
    <div className="grid gap-4 md:grid-cols-2">
      <div><p className="mb-2 text-sm font-bold">1. Who is this for?</p><div className="grid grid-cols-2 gap-2">{AUDIENCES.map((item) => <button key={item.id} type="button" disabled={busy || rows.length > 0} onClick={() => { setAudience(item.id); setCategory(''); }} className={`min-h-12 border px-3 font-bold ${audience === item.id ? 'border-[#7A1428] bg-[#7A1428] text-white' : 'border-[#D8DCD7] bg-white'} disabled:opacity-60`}>{item.label}</button>)}</div></div>
      <div><label htmlFor="bulk-category" className="mb-2 block text-sm font-bold">2. Choose category</label><select id="bulk-category" disabled={busy || rows.length > 0} value={category} onChange={(event) => setCategory(event.target.value as CatalogueCategoryId | '')} className="min-h-12 w-full border border-[#D8DCD7] bg-white px-3 text-sm"><option value="">Select {audience} category</option>{availableCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
    </div>
    <div><p className="mb-2 text-sm font-bold">3. Upload garment photos</p><div className="flex flex-wrap gap-3"><label className={`bg-[#161918] px-5 py-3 text-sm font-semibold text-white ${category && !busy && !rows.length ? 'cursor-pointer' : 'cursor-not-allowed opacity-45'}`}>Choose photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={!category || busy || publishing || rows.length > 0} onChange={(event) => void begin(event.target.files)} className="sr-only" /></label><label className={`border border-[#161918] bg-white px-5 py-3 text-sm font-semibold ${category && !busy && !rows.length ? 'cursor-pointer' : 'cursor-not-allowed opacity-45'}`}>Choose folder<input type="file" accept="image/jpeg,image/png,image/webp" multiple {...({ webkitdirectory: '' } as object)} disabled={!category || busy || publishing || rows.length > 0} onChange={(event) => void begin(event.target.files)} className="sr-only" /></label></div></div>
    <fieldset className="flex flex-wrap gap-4 border border-[#D8DCD7] p-4"><legend className="px-2 text-sm font-bold">Show this collection in</legend><span className="text-sm">Image try-on · included</span>{[{ label: 'AI Video', value: videoEnabled, set: setVideoEnabled }, { label: 'Live Mirror', value: liveEnabled, set: setLiveEnabled }, { label: 'New Arrivals', value: newArrival, set: setNewArrival }].map((option) => <label key={option.label} className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" disabled={publishing} checked={option.value} onChange={(event) => option.set(event.target.checked)} className="h-5 w-5 accent-[#394b42]" />{option.label}</label>)}</fieldset>
    {rows.length > 0 && <><div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#D8DCD7] pt-4"><p className="text-sm font-semibold">{rows.length} garments · {availableCategories.find((item) => item.id === category)?.label} · {unresolved} need attention</p><p className="text-xs text-[#535A56]">Publish this batch before starting another.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[660px] text-left text-sm"><thead><tr className="border-b border-[#D8DCD7]"><th className="p-2">File</th><th className="p-2">Title</th><th className="p-2">Category</th><th className="p-2">Price (optional)</th><th className="p-2">Status</th></tr></thead><tbody>{visible.map((row) => <tr key={row.id} className="border-b border-[#D8DCD7]"><td className="max-w-44 p-2"><span className="block truncate" title={row.filename}>{row.filename}</span></td><td className="p-2"><input aria-label={`Title for ${row.filename}`} value={row.title} onChange={(event) => update(row.id, { title: event.target.value })} className="w-full min-w-36 border border-[#D8DCD7] bg-white p-2" /></td><td className="p-2 font-semibold">{catalogueCategories.find((item) => item.id === row.category)?.label}</td><td className="p-2"><input aria-label={`Price for ${row.filename}`} type="number" min="0" value={row.price} onChange={(event) => update(row.id, { price: event.target.value })} placeholder="Optional" className="w-24 border border-[#D8DCD7] bg-white p-2" /></td><td className="p-2">{row.status}{row.error && <span className="block text-[#B42318]">{row.error}</span>}{row.status === 'failed' && <button type="button" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} className="mt-1 block text-[#7A1428] underline">Remove failed file</button>}</td></tr>)}</tbody></table></div>
      <div className="flex items-center justify-between text-sm"><button type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)} className="disabled:opacity-40">← Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(rows.length / PAGE_SIZE))}</span><button type="button" disabled={(page + 1) * PAGE_SIZE >= rows.length} onClick={() => setPage((value) => value + 1)} className="disabled:opacity-40">Next →</button></div>
      <button type="button" disabled={busy || publishing || unresolved > 0} onClick={() => void publish()} className="min-h-12 bg-[#7A1428] px-6 py-3 text-sm font-bold text-white disabled:opacity-45">{publishing ? 'Publishing…' : `Confirm category & publish ${rows.length} garments`}</button>
    </>}
    {message && <p role="status" className="text-sm text-[#535A56]">{message}</p>}
  </div>;
}
