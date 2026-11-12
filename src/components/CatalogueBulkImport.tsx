'use client';

import { useState } from 'react';
import { categoryEligibleForWesternTryOn } from '@/lib/tryfocus/live-categories';
import {
  catalogueCategories,
  type CatalogueAudience,
  type CatalogueCategoryId,
} from '@/lib/tryfocus/sample-data';
import {
  CheckCircle2,
  LoaderCircle,
  Upload,
  X,
  AlertCircle,
  ImageIcon,
} from 'lucide-react';

export const SIZE_OPTIONS = ['S', 'M', 'L', 'XL'] as const;
export type SizeOption = (typeof SIZE_OPTIONS)[number];

export type CatalogueImportRow = {
  id: string;
  sku: string;
  filename: string;
  title: string;
  previewUrl: string;
  storagePath: string;
  category: CatalogueCategoryId;
  price: string;
  sizes: SizeOption[];
  aiVideoOn: boolean;
  westernOn: boolean;
  status: 'uploading' | 'ready' | 'failed';
  error?: string;
};

const AUDIENCES: { id: CatalogueAudience; label: string }[] = [
  { id: 'women', label: 'Women' },
  { id: 'men', label: 'Men' },
  { id: 'boys', label: 'Boys' },
  { id: 'girls', label: 'Girls' },
];

/**
 * One upload for every garment: pick the audience and category once, drop in the photos, then review a
 * single table. Try-On is automatic for everything (no switch needed) — only AI Video (off by default,
 * the store opts in the pieces worth showing a price on) and Western Try-On (on by default wherever the
 * category is western-cut, off wherever it is not) need a decision. A garment missing a price it needs
 * shows a red mark instead of a pop-up; the full detail view behind each thumbnail is where sizes and
 * price are actually set.
 */
export default function CatalogueBulkImport({
  onPublished,
  workspaceCode,
  experiences = { video: true, live: true },
}: {
  onPublished?: () => Promise<void>;
  /** TryFocus admin viewing a client's workspace: which client this upload is for. */
  workspaceCode?: string;
  /** The priced experiences this store has; a store without one never sees its switch. */
  experiences?: { video: boolean; live: boolean };
} = {}) {
  const [audience, setAudience] = useState<CatalogueAudience>('women');
  const [category, setCategory] = useState<CatalogueCategoryId | ''>('');

  const [batchId, setBatchId] = useState('');
  const [rows, setRows] = useState<CatalogueImportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState('');
  const [newArrival, setNewArrival] = useState(false);

  // The garment open in the full detail view (name, category, price, sizes, both switches, larger photo).
  const [detailId, setDetailId] = useState<string | null>(null);

  const availableCategories = catalogueCategories
    .filter((item) => item.gender === audience)
    .map((item) => ({ id: item.id as CatalogueCategoryId, label: item.label }));
  const unresolved = rows.filter((row) => row.status !== 'ready').length;
  const needsPrice = rows.filter((row) => experiences.video && row.aiVideoOn && !(Number(row.price) > 0));
  const detail = rows.find((row) => row.id === detailId) || null;

  function update(id: string, patch: Partial<CatalogueImportRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  /** Changing a garment's category re-applies the Western Try-On default for the new category. */
  function setRowCategory(id: string, nextCategory: CatalogueCategoryId) {
    update(id, { category: nextCategory, westernOn: experiences.live && categoryEligibleForWesternTryOn(nextCategory) });
  }

  function toggleSize(id: string, size: SizeOption) {
    setRows((current) => current.map((row) => {
      if (row.id !== id) return row;
      const on = row.sizes.includes(size);
      const sizes = on ? row.sizes.filter((item) => item !== size) : [...row.sizes, size];
      return { ...row, sizes };
    }));
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
    if (detailId === id) setDetailId(null);
  }

  function redo() {
    setRows([]);
    setBatchId('');
    setMessage('');
    setDetailId(null);
  }

  async function begin(files: FileList | null) {
    if (!files?.length || busy || publishing) return;
    if (!category) {
      setMessage('Select a category before choosing photos.');
      return;
    }
    const chosen = Array.from(files).filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
    if (!chosen.length) {
      setMessage('Choose valid JPEG, PNG or WebP garment photos.');
      return;
    }

    const selectedCategory = category;
    const westernDefault = experiences.live && categoryEligibleForWesternTryOn(selectedCategory);
    const nextBatch = crypto.randomUUID();
    setBatchId(nextBatch);
    setMessage(`Uploading ${chosen.length} garment(s)…`);

    const catCode = (selectedCategory || 'GAR').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
    const batchPrefix = nextBatch.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
    const timeSegment = Date.now().toString(36).toUpperCase().slice(-4);

    const initial: CatalogueImportRow[] = chosen.map((file, index) => ({
      id: `${nextBatch}:${index}`,
      sku: `MAH-${catCode}-${timeSegment}${batchPrefix}-${String(index + 1).padStart(3, '0')}`,
      filename: file.name,
      title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || `Garment ${index + 1}`,
      previewUrl: URL.createObjectURL(file),
      storagePath: '',
      category: selectedCategory,
      price: '',
      sizes: [...SIZE_OPTIONS],
      aiVideoOn: false,
      westernOn: westernDefault,
      status: 'uploading',
    }));

    setRows((current) => [...current, ...initial]);
    setBusy(true);

    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, chosen.length) }, async () => {
        while (cursor < chosen.length) {
          const index = cursor++;
          const row = initial[index];
          const form = new FormData();
          form.set('batchId', nextBatch);
          form.set('category', selectedCategory);
          form.set('file', chosen[index]);
          if (workspaceCode) form.set('workspaceCode', workspaceCode);
          try {
            const response = await fetch('/api/maharaja/catalogue/import/analyze', { method: 'POST', body: form });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) throw new Error(data.error || 'Upload failed.');
            update(row.id, { storagePath: data.storagePath, status: 'ready' });
          } catch (error) {
            update(row.id, { status: 'failed', error: error instanceof Error ? error.message : 'Upload failed.' });
          }
        }
      })
    );

    setBusy(false);
    setMessage('Uploaded. Check the table, then publish.');
  }

  async function publish() {
    if (busy || publishing || !rows.length || unresolved > 0) {
      setMessage('Resolve failed uploads before publishing.');
      return;
    }
    if (needsPrice.length > 0) {
      setMessage(`AI Video needs a price before it shows to customers. ${needsPrice.length} garment(s) still need one — open them from the table.`);
      setDetailId(needsPrice[0].id);
      return;
    }

    setPublishing(true);
    const completed = new Set<string>();
    const errors: string[] = [];

    for (let start = 0; start < rows.length; start += 20) {
      const chunk = rows.slice(start, start + 20);
      try {
        const response = await fetch('/api/maharaja/catalogue/import/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchId,
            workspaceCode,
            items: chunk.map((row) => ({
              sku: row.sku,
              title: row.title,
              category: row.category,
              storagePath: row.storagePath,
              price: Number(row.price) || 0,
              sizes: row.sizes,
              eligibleForVideo: experiences.video && row.aiVideoOn,
              eligibleForLive: experiences.live && row.westernOn,
              newArrival,
            })),
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(data.results)) throw new Error(data.error || 'Batch publish failed.');
        for (const result of data.results) {
          if (result.success) completed.add(result.sku);
          else errors.push(`${result.sku}: ${result.error || 'Publish failed'}`);
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Batch publish failed.');
      }
      setMessage(`${Math.min(start + 20, rows.length)} of ${rows.length} submitted; ${completed.size} live.`);
    }

    setRows((current) => current.filter((row) => !completed.has(row.sku)));
    setPublishing(false);
    await onPublished?.();
    setMessage(errors.length
      ? `${completed.size} published. ${errors.length} need retry: ${errors.slice(0, 3).join(' · ')}`
      : `${completed.size} garment(s) published. They're live on the TV and tablet now.`);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-canvas p-6 text-ink">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
          <h3 className="text-xl font-bold">Add garments</h3>
          <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-line bg-white px-3 text-sm font-semibold">
            <input type="checkbox" disabled={publishing} checked={newArrival} onChange={(e) => setNewArrival(e.target.checked)} className="h-4 w-4 accent-ink" />
            <span>Mark as new arrival</span>
          </label>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-bold text-muted">1. Who is it for?</p>
            <div className="grid grid-cols-4 gap-2">
              {AUDIENCES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={busy}
                  onClick={() => { setAudience(item.id); setCategory(''); }}
                  className={`min-h-11 border px-2 text-xs font-bold capitalize transition ${audience === item.id ? 'border-brand bg-brand text-white shadow-sm' : 'border-line bg-white hover:border-ink'} disabled:opacity-50`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="bulk-category" className="mb-2 block text-xs font-bold text-muted">2. Category (add or edit these in Categories customers see)</label>
            <select
              id="bulk-category"
              disabled={busy}
              value={category}
              onChange={(e) => setCategory(e.target.value as CatalogueCategoryId | '')}
              className="min-h-11 w-full border border-line bg-white px-3 text-sm font-semibold text-ink disabled:opacity-50"
            >
              <option value="">Select a category…</option>
              {availableCategories.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs font-bold text-muted">3. Upload garment photos</p>
          <div className="flex flex-wrap items-center gap-3">
            <label className={`flex items-center gap-2 bg-ink px-5 py-3 text-xs font-bold text-white transition ${category && !busy ? 'cursor-pointer hover:bg-[#2F3733]' : 'cursor-not-allowed opacity-40'}`}>
              <Upload className="h-4 w-4" /> Choose photos
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={!category || busy || publishing} onChange={(event) => void begin(event.target.files)} className="sr-only" />
            </label>
            <label className={`rounded-2xl flex items-center gap-2 border border-ink bg-white px-5 py-3 text-xs font-bold text-ink transition ${category && !busy ? 'cursor-pointer hover:bg-[#FAF6EE]' : 'cursor-not-allowed opacity-40'}`}>
              Choose a folder
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple {...({ webkitdirectory: '' } as object)} disabled={!category || busy || publishing} onChange={(event) => void begin(event.target.files)} className="sr-only" />
            </label>
          </div>
        </div>

        {rows.length > 0 && (
          <div className="mt-8 space-y-4 border-t border-line pt-6">
            <div className="rounded-2xl overflow-x-auto border border-line bg-white">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="border-b border-line bg-canvas text-muted">
                  <tr>
                    <th className="p-3 w-16">Photo</th>
                    <th className="p-3">Garment</th>
                    <th className="p-3">Category</th>
                    {experiences.video && <th className="p-3 w-28 text-center">AI Video</th>}
                    {experiences.live && <th className="p-3 w-32 text-center">Western Try-On</th>}
                    <th className="p-3 w-24">Status</th>
                    <th className="p-3 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => {
                    const priceMissing = experiences.video && row.aiVideoOn && !(Number(row.price) > 0);
                    return (
                      <tr key={row.id} className="hover:bg-[#FAFBF8]">
                        <td className="p-3">
                          <button type="button" onClick={() => setDetailId(row.id)} className="group relative block aspect-[3/4] w-12 overflow-hidden rounded border border-line bg-line" title="Open full view">
                            <img src={row.previewUrl} alt={row.title} className="h-full w-full object-cover" />
                          </button>
                        </td>
                        <td className="p-3">
                          <button type="button" onClick={() => setDetailId(row.id)} className="text-left font-semibold text-ink hover:underline">
                            {row.title}
                          </button>
                          <span className="mt-0.5 block tabular-nums text-subtle">{row.sku}</span>
                        </td>
                        <td className="p-3">
                          <select
                            aria-label={`Category for ${row.filename}`}
                            value={row.category}
                            onChange={(e) => setRowCategory(row.id, e.target.value as CatalogueCategoryId)}
                            className="min-h-9 border border-line bg-white px-2 text-xs font-semibold text-ink"
                          >
                            {availableCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                          </select>
                        </td>
                        {experiences.video && (
                          <td className="p-3 text-center">
                            <label className="inline-flex flex-col items-center gap-1">
                              <input type="checkbox" checked={row.aiVideoOn} onChange={(e) => update(row.id, { aiVideoOn: e.target.checked })} className="h-5 w-5 accent-ink" aria-label={`AI Video for ${row.filename}`} />
                              {priceMissing && (
                                <button type="button" onClick={() => setDetailId(row.id)} className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold text-white">
                                  Add price
                                </button>
                              )}
                            </label>
                          </td>
                        )}
                        {experiences.live && (
                          <td className="p-3 text-center">
                            <input type="checkbox" checked={row.westernOn} onChange={(e) => update(row.id, { westernOn: e.target.checked })} className="h-5 w-5 accent-ink" aria-label={`Western Try-On for ${row.filename}`} />
                          </td>
                        )}
                        <td className="p-3">
                          {row.status === 'uploading' && <span className="inline-flex items-center gap-1 font-semibold text-brand"><LoaderCircle className="h-3 w-3 animate-spin" /> Uploading</span>}
                          {row.status === 'ready' && <span className="inline-flex items-center gap-1 font-semibold text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Ready</span>}
                          {row.status === 'failed' && <span className="font-semibold text-danger">Failed</span>}
                        </td>
                        <td className="p-3">
                          <button type="button" onClick={() => removeRow(row.id)} className="font-bold text-danger hover:underline">Remove</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl flex flex-wrap items-center justify-between gap-4 border border-line bg-white p-5">
              <div className="space-y-1">
                <p className="text-lg font-bold text-ink">{rows.length} garment(s) ready to review</p>
                <p className="text-xs text-muted">{needsPrice.length > 0 ? `${needsPrice.length} need a price for AI Video.` : 'Publishing reaches the TV, tablet and phones straight away.'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={redo} disabled={publishing} className="flex min-h-12 items-center gap-2 border border-line-strong bg-white px-5 text-xs font-bold text-ink hover:border-ink disabled:opacity-40">
                  Redo
                </button>
                <button
                  type="button"
                  disabled={busy || publishing || unresolved > 0}
                  onClick={() => void publish()}
                  className="flex min-h-12 items-center gap-2 bg-brand px-8 text-xs font-bold text-white shadow-md hover:bg-[#600F1F] disabled:opacity-40"
                >
                  {publishing ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Publishing…</> : <><Upload className="h-4 w-4" /> Upload {rows.length} garment(s)</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {message && (
          <div role="status" className="rounded-2xl mt-4 flex items-center gap-2 border border-line bg-white p-4 text-xs font-semibold text-ink">
            <AlertCircle className="h-4 w-4 text-brand" />
            <span>{message}</span>
          </div>
        )}
      </div>

      {/* The full view behind a thumbnail: everything about one garment in one place. */}
      {detail && (
        <div role="dialog" aria-modal="true" aria-label={`${detail.title} details`} className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm sm:p-8" onClick={() => setDetailId(null)}>
          <div className="relative grid max-h-[92vh] w-full max-w-3xl grid-cols-1 overflow-y-auto rounded-2xl bg-white shadow-2xl sm:grid-cols-2" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setDetailId(null)} aria-label="Close" className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black">
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-center justify-center bg-canvas p-4">
              {detail.previewUrl ? <img src={detail.previewUrl} alt={detail.title} className="max-h-[70vh] w-full object-contain" /> : <ImageIcon className="h-16 w-16 text-subtle" />}
            </div>
            <div className="space-y-4 p-6">
              <label className="block">
                <span className="text-xs font-bold text-muted">Garment name</span>
                <input value={detail.title} onChange={(e) => update(detail.id, { title: e.target.value })} className="mt-1 min-h-11 w-full border border-line bg-white px-3 text-sm font-semibold text-ink" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-muted">Category</span>
                <select value={detail.category} onChange={(e) => setRowCategory(detail.id, e.target.value as CatalogueCategoryId)} className="mt-1 min-h-11 w-full border border-line bg-white px-3 text-sm font-semibold text-ink">
                  {availableCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <div>
                <span className="text-xs font-bold text-muted">Sizes available</span>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {SIZE_OPTIONS.map((size) => {
                    const on = detail.sizes.includes(size);
                    return (
                      <button key={size} type="button" aria-pressed={on} onClick={() => toggleSize(detail.id, size)} className={`min-h-10 min-w-10 border px-3 text-sm font-bold ${on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white text-muted'}`}>
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
              {experiences.video && (
                <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-line bg-canvas px-3 text-sm font-semibold">
                  <input type="checkbox" checked={detail.aiVideoOn} onChange={(e) => update(detail.id, { aiVideoOn: e.target.checked })} className="h-5 w-5 accent-ink" />
                  <span>Offer on AI Video</span>
                </label>
              )}
              {experiences.video && detail.aiVideoOn && (
                <label className="block">
                  <span className="text-xs font-bold text-danger">Price (shown to customers on AI Video) *</span>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-subtle">₹</span>
                    <input type="number" min="0" value={detail.price} onChange={(e) => update(detail.id, { price: e.target.value })} placeholder="Required" className={`min-h-11 w-full border px-3 pl-7 text-sm font-bold ${Number(detail.price) > 0 ? 'border-line bg-white text-ink' : 'border-danger bg-danger-soft text-danger'}`} />
                  </div>
                </label>
              )}
              {experiences.live && (
                <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-line bg-canvas px-3 text-sm font-semibold">
                  <input type="checkbox" checked={detail.westernOn} onChange={(e) => update(detail.id, { westernOn: e.target.checked })} className="h-5 w-5 accent-ink" />
                  <span>Offer on Western Try-On</span>
                </label>
              )}
              <button type="button" onClick={() => setDetailId(null)} className="tf-btn tf-btn-primary !min-h-11 w-full text-sm">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
