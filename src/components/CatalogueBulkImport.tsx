'use client';

import { useState } from 'react';
import { LIVE_CATEGORIES } from '@/lib/tryfocus/live-categories';
import {
  catalogueCategories,
  type CatalogueAudience,
  type CatalogueCategoryId,
} from '@/lib/tryfocus/sample-data';
import {
  CheckCircle2,
  Eye,
  Grid3X3,
  List,
  LoaderCircle,
  Upload,
  X,
  AlertCircle,
} from 'lucide-react';

export type UploadMode = 'image-tryon' | 'ai-video';

export type CatalogueImportRow = {
  id: string;
  sku: string;
  filename: string;
  title: string;
  previewUrl: string;
  storagePath: string;
  category: CatalogueCategoryId;
  price: string;
  status: 'uploading' | 'ready' | 'failed';
  error?: string;
};

const AUDIENCES: { id: CatalogueAudience; label: string }[] = [
  { id: 'women', label: 'Women' },
  { id: 'men', label: 'Men' },
  { id: 'boys', label: 'Boys' },
  { id: 'girls', label: 'Girls' },
];

export default function CatalogueBulkImport({
  onPublished,
  initialMode,
  experiences = { video: true, live: true },
}: {
  onPublished?: () => Promise<void>;
  initialMode?: UploadMode;
  /** The priced experiences this store has; only these can be chosen under "Use for". */
  experiences?: { video: boolean; live: boolean };
} = {}) {
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Audience & Category
  const [audience, setAudience] = useState<CatalogueAudience>('women');
  const [category, setCategory] = useState<CatalogueCategoryId | ''>('');

  // Batch & Rows
  const [batchId, setBatchId] = useState('');
  const [rows, setRows] = useState<CatalogueImportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState('');

  // Three upload tabs: Image Try-On (price optional, never shown), AI Video and Live Mirror (the price is shown
  // to customers, so it is asked for). "Use for all" also puts the pieces on every experience the store has.
  const [segment, setSegment] = useState<'tryon' | 'video' | 'live'>(initialMode === 'ai-video' && experiences.video ? 'video' : 'tryon');
  const [useForAll, setUseForAll] = useState(false);
  const videoEnabled = experiences.video && (segment === 'video' || useForAll);
  const liveEnabled = experiences.live && (segment === 'live' || useForAll);
  const [newArrival, setNewArrival] = useState(false);

  // Lightbox modal for thumbnail full-view
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const availableCategories: Array<{ id: CatalogueCategoryId; label: string }> = segment === 'live'
    ? LIVE_CATEGORIES[audience]
    : catalogueCategories.filter((item) => item.gender === audience).map((item) => ({ id: item.id as CatalogueCategoryId, label: item.label }));
  const unresolved = rows.filter((row) => row.status !== 'ready').length;

  // Price is asked for AI Video only (customers see it there); Try-On and Live Mirror tables have no price.
  const isPricingMandatory = videoEnabled;
  const missingPricesCount = rows.filter(
    (row) => !row.price || Number(row.price) <= 0 || Number.isNaN(Number(row.price))
  ).length;


  function update(id: string, patch: Partial<CatalogueImportRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function begin(files: FileList | null) {
    if (!files?.length || busy || publishing) return;
    if (!category) {
      setMessage('Select a category before choosing photos.');
      return;
    }
    const chosen = Array.from(files).filter((file) =>
      ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    );
    if (!chosen.length) {
      setMessage('Choose valid JPEG, PNG or WebP garment photos.');
      return;
    }

    const selectedCategory = category;
    const nextBatch = crypto.randomUUID();
    setBatchId(nextBatch);
    setMessage(
      `Uploading ${chosen.length} garments to ${availableCategories.find((item) => item.id === selectedCategory)?.label}. Check details and submit.`
    );

    // Build initial rows with client preview URLs immediately for the mini thumbnail
    // High-entropy unique SKU: Category code + timestamp + UUID segment + 3-digit sequence
    const catCode = (selectedCategory || 'GAR').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
    const batchPrefix = nextBatch.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
    const timeSegment = Date.now().toString(36).toUpperCase().slice(-4);

    const initial: CatalogueImportRow[] = chosen.map((file, index) => ({
      id: `${nextBatch}:${index}`,
      sku: `MAH-${catCode}-${timeSegment}${batchPrefix}-${String(index + 1).padStart(3, '0')}`,
      filename: file.name,
      title:
        file.name
          .replace(/\.[^.]+$/, '')
          .replace(/[-_]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120) || `Garment ${index + 1}`,
      previewUrl: URL.createObjectURL(file),
      storagePath: '',
      category: selectedCategory,
      price: '',
      status: 'uploading',
    }));

    setRows(initial);
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
          try {
            const response = await fetch('/api/maharaja/catalogue/import/analyze', {
              method: 'POST',
              body: form,
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) throw new Error(data.error || 'Upload failed.');
            update(row.id, { storagePath: data.storagePath, status: 'ready' });
          } catch (error) {
            update(row.id, {
              status: 'failed',
              error: error instanceof Error ? error.message : 'Upload failed.',
            });
          }
        }
      })
    );

    setBusy(false);
    setMessage(
      isPricingMandatory
        ? 'Upload complete. Enter a price for each AI Video garment, then submit.'
        : 'Upload complete. Check the names and categories, then submit.'
    );
  }

  async function publish() {
    if (busy || publishing || !rows.length || unresolved > 0) {
      setMessage('Resolve failed uploads before submitting.');
      return;
    }

    if (isPricingMandatory && missingPricesCount > 0) {
      setMessage(
        `AI Video shows the price to customers. Enter a price for all ${missingPricesCount} garment(s).`
      );
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
            items: chunk.map((row) => ({
              sku: row.sku,
              title: row.title,
              category: row.category,
              storagePath: row.storagePath,
              price: Number(row.price) || 0,
              eligibleForVideo: videoEnabled,
              eligibleForLive: liveEnabled,
              newArrival,
            })),
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(data.results)) {
          throw new Error(data.error || 'Batch publish failed.');
        }
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

    if (errors.length) {
      setMessage(`${completed.size} published. ${errors.length} need retry: ${errors.slice(0, 3).join(' · ')}`);
    } else {
      setMessage(`${completed.size} garments successfully published to store catalogue! Reflects on TV & Tablet.`);
    }
  }

  const selectedCategoryLabel =
    availableCategories.find((item) => item.id === category)?.label || 'Selected Category';

  return (
    <div className="space-y-6">
      {/* Three upload tabs, one per experience the store has. */}
      <div className="flex flex-wrap gap-1 border-b border-line" role="tablist" aria-label="Upload for">
        {([['tryon', 'Image Try-On', true], ['video', 'AI Video', experiences.video], ['live', 'Live Mirror', experiences.live]] as const).filter(([, , on]) => on).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={segment === value}
            disabled={busy || publishing}
            onClick={() => {
              if (value === segment) return;
              if (rows.length > 0 && !confirm('Switching will clear the garments not yet submitted. Continue?')) return;
              setSegment(value); setRows([]); setBatchId(''); setMessage(''); setCategory('');
            }}
            className={`-mb-px min-h-12 border-b-[3px] px-4 text-[15px] font-semibold ${segment === value ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {segment === 'video' && (
        <div className="rounded-2xl bg-brand-soft p-4 text-sm text-ink">
          <p className="font-semibold">Add your high-value garments here: they lift sales.</p>
          <p className="mt-1 text-muted">Customers see the price on AI Video, so enter it for every piece in the table after uploading.</p>
        </div>
      )}

      {/* Main Upload Box */}
      <div className="rounded-2xl border border-line bg-canvas p-6 text-ink">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
          <h3 className="text-xl font-bold">{segment === 'tryon' ? 'Upload Try-On garments' : segment === 'video' ? 'Upload AI Video garments' : 'Upload Live Mirror garments'}</h3>
          <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-line bg-white px-3 text-sm font-semibold">
            <input
              type="checkbox"
              disabled={publishing}
              checked={newArrival}
              onChange={(e) => setNewArrival(e.target.checked)}
              className="h-4 w-4 accent-ink"
            />
            <span>Mark as new arrival</span>
          </label>
          {segment !== 'tryon' && experiences.video && experiences.live && (
            <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-line bg-white px-3 text-sm font-semibold">
              <input type="checkbox" disabled={publishing} checked={useForAll} onChange={(e) => setUseForAll(e.target.checked)} className="h-4 w-4 accent-ink" />
              <span>Use for all (Try-On, AI Video and Live Mirror)</span>
            </label>
          )}
        </div>

        {/* Step 1 & 2: Audience and Category Selection */}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-bold text-muted">
              1. Audience (Men / Women / Boys / Girls)
            </p>
            <div className="grid grid-cols-4 gap-2">
              {AUDIENCES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={busy || rows.length > 0}
                  onClick={() => {
                    setAudience(item.id);
                    setCategory('');
                  }}
                  className={`min-h-11 border px-2 text-xs font-bold capitalize transition ${
 audience === item.id
 ? 'border-brand bg-brand text-white shadow-sm'
 : 'border-line bg-white hover:border-ink'
 } disabled:opacity-50`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="bulk-category"
              className="mb-2 block text-xs font-bold text-muted"
            >
              2. Choose Category (e.g. {audience}/pants, {audience}/sarees)
            </label>
            <select
              id="bulk-category"
              disabled={busy || rows.length > 0}
              value={category}
              onChange={(e) => setCategory(e.target.value as CatalogueCategoryId | '')}
              className="min-h-11 w-full border border-line bg-white px-3 text-sm font-semibold text-ink disabled:opacity-50"
            >
              <option value="">Select {audience} category…</option>
              {availableCategories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} ({audience}/{item.id})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Step 3: Choose Garment Photos */}
        <div className="mt-5">
          <p className="mb-2 text-xs font-bold text-muted">
            3. Upload garment photos
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label
              className={`flex items-center gap-2 bg-ink px-5 py-3 text-xs font-bold text-white transition ${
 category && !busy && !rows.length
 ? 'cursor-pointer hover:bg-[#2F3733]'
 : 'cursor-not-allowed opacity-40'
 }`}
            >
              <Upload className="h-4 w-4" />
              Choose Photos
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={!category || busy || publishing || rows.length > 0}
                onChange={(event) => void begin(event.target.files)}
                className="sr-only"
              />
            </label>

            <label
              className={`rounded-2xl flex items-center gap-2 border border-ink bg-white px-5 py-3 text-xs font-bold text-ink transition ${
 category && !busy && !rows.length
 ? 'cursor-pointer hover:bg-[#FAF6EE]'
 : 'cursor-not-allowed opacity-40'
 }`}
            >
              Choose Folder
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                {...({ webkitdirectory: '' } as object)}
                disabled={!category || busy || publishing || rows.length > 0}
                onChange={(event) => void begin(event.target.files)}
                className="sr-only"
              />
            </label>

            {rows.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Clear current batch to upload new photos?')) {
                    setRows([]);
                    setBatchId('');
                    setMessage('');
                  }
                }}
                className="border border-danger bg-white px-4 py-3 text-xs font-bold text-danger hover:bg-canvas"
              >
                Clear / New Batch
              </button>
            )}
          </div>
        </div>

        {/* =========================================================
            UPLOADED GARMENTS VIEW (TABLE vs 3x3 GRID)
           ========================================================= */}
        {rows.length > 0 && (
          <div className="mt-8 space-y-4 border-t border-line pt-6">
            {/* View Switcher Header & Action Summary */}
            <div className="rounded-2xl flex flex-wrap items-center justify-between gap-4 border border-line bg-white p-4">
              <div>
                <p className="text-lg font-bold text-ink">
                  {rows.length} garments in {audience} / {selectedCategoryLabel}
                </p>
                <p className="text-xs text-muted">
                  {isPricingMandatory
                    ? `Pricing is mandatory. ${missingPricesCount === 0 ? '✓ All prices set' : `${missingPricesCount} price(s) missing`}`
                    : 'Ready to submit'}
                </p>
              </div>

              {/* View Toggle: Table vs 3x3 Grid */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1.5 border px-3 py-1.5 text-xs font-bold transition ${
 viewMode === 'table'
 ? 'border-brand bg-brand text-white'
 : 'border-line bg-white text-ink'
 }`}
                >
                  <List className="h-3.5 w-3.5" />
                  Table View
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center gap-1.5 border px-3 py-1.5 text-xs font-bold transition ${
 viewMode === 'grid'
 ? 'border-brand bg-brand text-white'
 : 'border-line bg-white text-ink'
 }`}
                >
                  <Grid3X3 className="h-3.5 w-3.5" />
                  View Catalogue (3×3 Grid)
                </button>
              </div>
            </div>

            {/* VIEW A: TABLE WITH MINI-THUMBNAIL (CLICK TO OPEN FULL VIEW) */}
            {viewMode === 'table' && (
              <div className="rounded-2xl overflow-x-auto border border-line bg-white">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="bg-canvas border-b border-line text-muted">
                    <tr>
                      <th className="p-3 w-16">Thumbnail</th>
                      <th className="p-3">Name of Garment</th>
                      <th className="p-3">Category</th>
                      {isPricingMandatory && <th className="p-3 w-40">
                        Pricing (₹) <span className="text-[#B42318]">*</span>
                      </th>}
                      <th className="p-3 w-28">Status</th>
                      <th className="p-3 w-20">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D8DCD7]">
                    {rows.map((row) => {
                      const isPriceMissing =
                        isPricingMandatory && (!row.price || Number(row.price) <= 0);

                      return (
                        <tr key={row.id} className="hover:bg-[#FAFBF8]">
                          {/* 1. Mini Thumbnail: click to open full view */}
                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() => setLightboxUrl(row.previewUrl)}
                              className="group relative block aspect-[3/4] w-12 overflow-hidden rounded border border-line bg-line shadow-sm transition hover:scale-105"
                              title="Click to open full view"
                            >
                              <img
                                src={row.previewUrl}
                                alt={row.title}
                                className="h-full w-full object-cover"
                              />
                              <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                                <Eye className="h-4 w-4 text-white" />
                              </span>
                            </button>
                          </td>

                          {/* 2. Name of the garment */}
                          <td className="p-3">
                            <input
                              aria-label={`Name for ${row.filename}`}
                              value={row.title}
                              onChange={(e) => update(row.id, { title: e.target.value })}
                              className="w-full border border-line bg-white p-2 text-xs font-semibold text-ink"
                              placeholder="Garment title…"
                            />
                            <span className="mt-0.5 block tabular-nums text-xs text-subtle">
                              SKU: {row.sku}
                            </span>
                          </td>

                          {/* 3. Category (e.g. Men/Pants) */}
                          <td className="p-3 font-semibold text-ink">
                            <span className="inline-block rounded border border-line bg-canvas px-2 py-1 text-xs">
                              {audience} / {selectedCategoryLabel}
                            </span>
                          </td>

                          {/* 4. Pricing (AI Video only) */}
                          {isPricingMandatory && <td className="p-3">
                            <div className="relative">
                              <span className="absolute left-2.5 top-2 text-xs font-bold text-subtle">
                                ₹
                              </span>
                              <input
                                aria-label={`Price for ${row.filename}`}
                                type="number"
                                min="0"
                                value={row.price}
                                onChange={(e) => update(row.id, { price: e.target.value })}
                                placeholder="Mandatory"
                                className={`w-full border p-2 pl-6 text-xs font-bold ${
 isPriceMissing
 ? 'border-danger bg-[#FDF2F2] text-danger'
 : 'border-line bg-white text-ink'
 }`}
                              />
                            </div>
                            {isPriceMissing && (
                              <span className="mt-0.5 block text-xs font-semibold text-danger">
                                Price required for video
                              </span>
                            )}
                          </td>}

                          {/* 5. Status */}
                          <td className="p-3">
                            {row.status === 'uploading' && (
                              <span className="inline-flex items-center gap-1 font-semibold text-brand">
                                <LoaderCircle className="h-3 w-3 animate-spin" /> Uploading…
                              </span>
                            )}
                            {row.status === 'ready' && (
                              <span className="inline-flex items-center gap-1 font-semibold text-success">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Ready
                              </span>
                            )}
                            {row.status === 'failed' && (
                              <span className="block text-xs font-semibold text-danger">
                                Failed
                              </span>
                            )}
                          </td>

                          {/* Remove button */}
                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() =>
                                setRows((current) => current.filter((item) => item.id !== row.id))
                              }
                              className="text-xs font-bold text-danger hover:underline"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* VIEW B: 3x3 GRID VIEW (NO PAGINATION) */}
            {viewMode === 'grid' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                  {rows.map((row) => {
                    const isPriceMissing =
                      isPricingMandatory && (!row.price || Number(row.price) <= 0);

                    return (
                      <div
                        key={row.id}
                        className="rounded-2xl group flex flex-col justify-between overflow-hidden border border-line bg-white p-3 shadow-sm transition hover:border-brand"
                      >
                        <button
                          type="button"
                          onClick={() => setLightboxUrl(row.previewUrl)}
                          className="relative aspect-[3/4] w-full overflow-hidden bg-line text-left"
                          title="Click to open full view"
                        >
                          <img
                            src={row.previewUrl}
                            alt={row.title}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                          <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-1 tabular-nums text-xs text-white">
                            Zoom
                          </span>
                        </button>

                        <div className="mt-3 space-y-1.5">
                          <input
                            aria-label={`Title for ${row.filename}`}
                            value={row.title}
                            onChange={(e) => update(row.id, { title: e.target.value })}
                            className="w-full border border-line p-1.5 text-xs font-bold text-ink"
                            placeholder="Garment name"
                          />

                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-muted">
                              {audience} / {selectedCategoryLabel}
                            </span>
                            <span className="tabular-nums text-xs text-subtle">
                              {row.sku}
                            </span>
                          </div>

                          {isPricingMandatory && <div className="relative">
                            <span className="absolute left-2.5 top-1.5 text-xs font-bold text-subtle">
                              ₹
                            </span>
                            <input
                              aria-label={`Price for ${row.filename}`}
                              type="number"
                              min="0"
                              value={row.price}
                              onChange={(e) => update(row.id, { price: e.target.value })}
                              placeholder="Price required"
                              className={`w-full border p-1.5 pl-6 text-xs font-bold ${
 isPriceMissing
 ? 'border-danger bg-[#FDF2F2] text-danger'
 : 'border-line bg-white text-ink'
 }`}
                            />
                          </div>}

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs font-semibold text-success">
                              {row.status === 'ready' ? '✓ Ready' : row.status}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setRows((current) => current.filter((item) => item.id !== row.id))
                              }
                              className="text-xs font-bold text-danger hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bottom Two Post-Upload Buttons: Submit / Upload Batch + View Catalogue */}
            <div className="rounded-2xl flex flex-wrap items-center justify-between gap-4 border border-line bg-white p-5">
              <div className="space-y-1">
                <p className="text-lg font-bold text-ink">
                  Ready to publish {rows.length} garments to store catalogue
                </p>
                <p className="text-xs text-muted">
                  Uploads will immediately reflect in the TV and the tablet.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setViewMode((curr) => (curr === 'table' ? 'grid' : 'table'))}
                  className="flex min-h-12 items-center gap-2 border border-ink bg-white px-5 text-xs font-bold text-ink hover:bg-[#FAF6EE]"
                >
                  {viewMode === 'table' ? (
                    <>
                      <Grid3X3 className="h-4 w-4" /> View 3×3 Grid
                    </>
                  ) : (
                    <>
                      <List className="h-4 w-4" /> View Table
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={
                    busy ||
                    publishing ||
                    unresolved > 0 ||
                    (isPricingMandatory && missingPricesCount > 0)
                  }
                  onClick={() => void publish()}
                  className="flex min-h-12 items-center gap-2 bg-brand px-8 text-xs font-bold text-white shadow-md hover:bg-[#600F1F] disabled:opacity-40"
                >
                  {publishing ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Publishing Batch…
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Submit & Upload {rows.length} Garments
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {message && (
          <div
            role="status"
            className="rounded-2xl mt-4 flex items-center gap-2 border border-line bg-white p-4 text-xs font-semibold text-ink"
          >
            <AlertCircle className="h-4 w-4 text-brand" />
            <span>{message}</span>
          </div>
        )}
      </div>

      {/* =========================================================
          LIGHTBOX MODAL: MINI-THUMBNAIL CLICK TO OPEN FULL VIEW
         ========================================================= */}
      {lightboxUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Garment Full View"
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm sm:p-8"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-lg border border-white/20 bg-ink p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
              aria-label="Close full view"
            >
              <X className="h-5 w-5" />
            </button>

            <img
              src={lightboxUrl}
              alt="Garment High Resolution Full View"
              className="max-h-[85vh] w-auto object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
