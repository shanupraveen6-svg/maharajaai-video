'use client';

import { useRef, useState } from 'react';
import { Upload, LoaderCircle, AlertCircle } from 'lucide-react';
import { Segmented } from '@/components/ui';
import CatalogueTable, { type CatalogueBulkAction, type CatalogueRowPatch, type CatalogueTableRow, type CategoryOption } from '@/components/CatalogueTable';
import { categoriesFor, isWesternCategory, type CustomCategory, type StoreCategoryLists, type WesternOverrides } from '@/lib/tryfocus/store-categories';
import type { CatalogueAudience } from '@/lib/tryfocus/sample-data';

const AUDIENCES: Array<{ value: CatalogueAudience; label: string }> = [
  { value: 'women', label: 'Women' },
  { value: 'men', label: 'Men' },
  { value: 'boys', label: 'Boys' },
  { value: 'girls', label: 'Girls' },
];

/**
 * Upload catalogue: Who → the category (the store's own list, Western wear marked WW) → photos or a whole
 * folder → the same table as the saved catalogue. Western Try-On starts on for a Western wear category;
 * a garment goes on AI Video when the store types its price and taps AI Video. Upload publishes every
 * ready row; Redo clears the batch.
 */
export default function CatalogueBulkImport({
  onPublished,
  workspaceCode,
  experiences = { video: true, live: true },
  categoryLists,
  customCategories = [],
  westernOverrides = {},
}: {
  onPublished?: (count: number) => Promise<void> | void;
  /** TryFocus admin working in a client's workspace: which client this upload is for. */
  workspaceCode?: string;
  experiences?: { video: boolean; live: boolean };
  categoryLists?: StoreCategoryLists;
  customCategories?: CustomCategory[];
  westernOverrides?: WesternOverrides;
}) {
  // Nothing picked until the store taps one — the same rule as every Who in TryFocus.
  const [audience, setAudience] = useState<CatalogueAudience | null>(null);
  const [category, setCategory] = useState('');
  const [batchId, setBatchId] = useState('');
  const [rows, setRows] = useState<CatalogueTableRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState('');
  // Where each uploaded photo sits in storage, by row; never shown, so it lives outside render state.
  const paths = useRef(new Map<string, string>());

  const categories = audience ? categoriesFor(categoryLists, audience, customCategories) : [];
  const western = (id: string) => isWesternCategory(id, customCategories, westernOverrides);
  const categoryOptions = (gender: CatalogueAudience): CategoryOption[] =>
    categoriesFor(categoryLists, gender, customCategories).map((cat) => ({ id: cat.id as string, label: cat.label, western: western(cat.id as string) }));

  const ready = rows.filter((row) => row.status === 'ready');
  const uploading = rows.some((row) => row.status === 'uploading');
  const failed = rows.filter((row) => row.status === 'failed');
  const needsPrice = ready.filter((row) => experiences.video && row.aiVideo && !(Number(row.price) > 0));

  function update(key: string, patch: Partial<CatalogueTableRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function change(key: string, patch: CatalogueRowPatch) {
    // A new category re-applies its Western wear setting, as the upload did.
    if (patch.category) update(key, { ...patch, western: experiences.live && western(patch.category) });
    else update(key, patch);
  }

  function bulk(action: CatalogueBulkAction, keys: string[], on: boolean) {
    const chosen = new Set(keys);
    if (action === 'delete') { setRows((current) => current.filter((row) => !chosen.has(row.key))); return; }
    const patch: Partial<CatalogueTableRow> = action === 'new-arrival' ? { newArrival: on } : action === 'trending' ? { trending: on } : {};
    setRows((current) => current.map((row) => (chosen.has(row.key) ? { ...row, ...patch } : row)));
  }

  function redo() {
    paths.current.clear();
    setRows([]);
    setBatchId('');
    setMessage('');
  }

  async function begin(files: FileList | null) {
    if (!files?.length || busy || publishing || !audience || !category) return;
    const chosen = Array.from(files).filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
    if (!chosen.length) { setMessage('Choose JPEG, PNG or WebP garment photos.'); return; }

    const nextBatch = batchId || crypto.randomUUID();
    setBatchId(nextBatch);
    setMessage(`Uploading ${chosen.length} photo(s)…`);
    const catCode = category.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'GAR';
    const batchPrefix = nextBatch.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
    const stamp = Date.now().toString(36).toUpperCase().slice(-4);
    const offset = rows.length;
    const startsWestern = experiences.live && western(category);

    const initial: CatalogueTableRow[] = chosen.map((file, index) => ({
      key: `${nextBatch}:${offset + index}`,
      sku: `MAH-${catCode}-${stamp}${batchPrefix}-${String(offset + index + 1).padStart(3, '0')}`,
      image: URL.createObjectURL(file),
      title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || `Garment ${offset + index + 1}`,
      category,
      gender: audience,
      price: '',
      aiVideo: false,
      western: startsWestern,
      newArrival: false,
      trending: false,
      active: true,
      status: 'uploading',
    }));
    setRows((current) => [...current, ...initial]);
    setBusy(true);

    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(3, chosen.length) }, async () => {
      while (cursor < chosen.length) {
        const index = cursor++;
        const row = initial[index];
        const form = new FormData();
        form.set('batchId', nextBatch);
        form.set('category', category);
        form.set('file', chosen[index]);
        if (workspaceCode) form.set('workspaceCode', workspaceCode);
        try {
          const response = await fetch('/api/maharaja/catalogue/import/analyze', { method: 'POST', body: form });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.success) throw new Error(data.error || 'Upload failed.');
          paths.current.set(row.key, data.storagePath);
          update(row.key, { status: 'ready' });
        } catch (error) {
          update(row.key, { status: 'failed', note: error instanceof Error ? error.message : 'Upload failed.' });
        }
      }
    }));
    setBusy(false);
    setMessage('Photos in. Type prices for AI Video pieces, check the switches, then Upload.');
  }

  async function publish() {
    if (busy || publishing || !ready.length) return;
    if (needsPrice.length) {
      setMessage(`${needsPrice.length} garment(s) are on AI Video without a price. Type the price in the red box, or tap AI Video to switch it off.`);
      return;
    }
    setPublishing(true);
    const done = new Set<string>();
    const errors: string[] = [];
    for (let start = 0; start < ready.length; start += 20) {
      const chunk = ready.slice(start, start + 20);
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
              storagePath: paths.current.get(row.key) || '',
              price: Number(row.price) || 0,
              eligibleForVideo: experiences.video && row.aiVideo,
              eligibleForLive: experiences.live && row.western,
              newArrival: row.newArrival,
              trending: row.trending,
            })),
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(data.results)) throw new Error(data.error || 'Upload failed.');
        for (const result of data.results) {
          const row = chunk.find((item) => item.sku === result.sku);
          if (result.success && row) done.add(row.key);
          else if (!result.success) errors.push(`${result.sku}: ${result.error || 'Upload failed'}`);
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Upload failed.');
      }
      setMessage(`${Math.min(start + 20, ready.length)} of ${ready.length} sent…`);
    }
    setRows((current) => current.filter((row) => !done.has(row.key)));
    setPublishing(false);
    await onPublished?.(done.size);
    setMessage(errors.length
      ? `${done.size} garment(s) are live. ${errors.length} could not be added: ${errors.slice(0, 2).join(' · ')}`
      : `${done.size} garment(s) are live on the TV, tablet and phones. They're in today's row in Upload history.`);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[auto_1fr]">
        <div>
          <p className="mb-2 text-xs font-bold text-muted">1. Who is it for?</p>
          <Segmented size="sm" label="Who is it for?" value={audience} onChange={(value) => { setAudience(value); setCategory(''); }} options={AUDIENCES} />
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-xs font-bold text-muted">2. Category <span className="font-normal">· WW = Western wear, starts on Western Try-On</span></p>
          {!audience ? (
            <p className="min-h-11 py-2.5 text-sm text-muted">Choose Women, Men, Boys or Girls first.</p>
          ) : (
            <div role="group" aria-label="Category" className="flex flex-wrap gap-x-1 border-b border-line">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  aria-pressed={category === cat.id}
                  onClick={() => setCategory(cat.id as string)}
                  className={`-mb-px min-h-11 border-b-2 px-2.5 text-sm transition ${category === cat.id ? 'border-ink font-bold text-ink' : 'border-transparent font-medium text-muted hover:text-ink'}`}
                >
                  {cat.label}{western(cat.id as string) && <span className="ml-1.5 rounded-full bg-ink px-1.5 py-px text-[10px] font-bold text-white">WW</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-bold text-muted">3. Photos <span className="font-normal">· one garment per photo; any number, or a whole folder</span></p>
        <div className="flex flex-wrap items-center gap-3">
          <label className={`tf-btn tf-btn-primary !min-h-11 px-5 text-sm ${category && !busy && !publishing ? 'cursor-pointer' : 'pointer-events-none opacity-40'}`}>
            <Upload className="h-4 w-4" /> Choose photos
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={!category || busy || publishing} onChange={(event) => { void begin(event.target.files); event.target.value = ''; }} className="sr-only" />
          </label>
          <label className={`tf-btn tf-btn-secondary !min-h-11 px-5 text-sm ${category && !busy && !publishing ? 'cursor-pointer' : 'pointer-events-none opacity-40'}`}>
            Choose a folder
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple {...({ webkitdirectory: '' } as object)} disabled={!category || busy || publishing} onChange={(event) => { void begin(event.target.files); event.target.value = ''; }} className="sr-only" />
          </label>
          {!category && audience && <span className="text-sm text-muted">Pick a category first.</span>}
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <CatalogueTable rows={rows} mode="upload" experiences={experiences} categoryOptions={categoryOptions} onChange={change} onBulk={bulk} busy={publishing} />
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-white p-4">
            <p className="text-sm text-ink">
              <b>{ready.length}</b> ready{uploading ? ' · uploading…' : ''}
              {needsPrice.length > 0 && <span className="text-danger"> · {needsPrice.length} on AI Video without a price</span>}
              {failed.length > 0 && <span className="text-danger"> · {failed.length} failed (not added)</span>}
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={redo} disabled={publishing || busy} className="tf-btn tf-btn-secondary !min-h-11 px-5 text-sm">Redo</button>
              <button type="button" onClick={() => void publish()} disabled={busy || publishing || !ready.length} className="tf-btn tf-btn-primary !min-h-11 px-6 text-sm">
                {publishing ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Uploading…</> : <><Upload className="h-4 w-4" /> Upload {ready.length} garment(s)</>}
              </button>
            </div>
          </div>
        </>
      )}

      {message && (
        <p role="status" className="flex items-center gap-2 rounded-2xl border border-line bg-white p-4 text-sm font-semibold text-ink">
          <AlertCircle className="h-4 w-4 shrink-0 text-brand" /> {message}
        </p>
      )}
    </div>
  );
}
