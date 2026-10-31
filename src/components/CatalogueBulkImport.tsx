'use client';

import { useEffect, useState } from 'react';
import {
  catalogueCategories,
  type CatalogueAudience,
  type CatalogueCategoryId,
} from '@/lib/tryfocus/sample-data';
import {
  Camera,
  CheckCircle2,
  Eye,
  Grid3X3,
  List,
  LoaderCircle,
  Upload,
  Video,
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
}: {
  onPublished?: () => Promise<void>;
  initialMode?: UploadMode;
} = {}) {
  // Two Main Upload Buttons: 'image-tryon' vs 'ai-video'
  const [uploadMode, setUploadMode] = useState<UploadMode>(initialMode || 'image-tryon');
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

  // Checkmark on top: "Use for AI Video"
  // If in 'ai-video' mode, videoEnabled is permanently true and pricing is mandatory
  const [videoEnabled, setVideoEnabled] = useState(initialMode === 'ai-video');
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [newArrival, setNewArrival] = useState(false);

  // Lightbox modal for thumbnail full-view
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const availableCategories = catalogueCategories.filter((item) => item.gender === audience);
  const unresolved = rows.filter((row) => row.status !== 'ready').length;

  // Pricing is mandatory if uploadMode === 'ai-video' OR videoEnabled is ticked
  const isPricingMandatory = uploadMode === 'ai-video' || videoEnabled;
  const missingPricesCount = rows.filter(
    (row) => !row.price || Number(row.price) <= 0 || Number.isNaN(Number(row.price))
  ).length;

  useEffect(() => {
    if (uploadMode === 'ai-video') {
      setVideoEnabled(true);
    }
  }, [uploadMode]);

  function switchUploadMode(mode: UploadMode) {
    if (mode === uploadMode) return;
    if (busy || publishing) return;
    if (rows.length > 0 && !confirm('Switching upload mode will clear current unsubmitted files. Proceed?')) {
      return;
    }
    setUploadMode(mode);
    setRows([]);
    setBatchId('');
    setMessage('');
    if (mode === 'ai-video') {
      setVideoEnabled(true);
    } else {
      setVideoEnabled(false);
    }
  }

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
        ? 'Upload complete. Pricing is mandatory for AI Video. Fill prices and submit.'
        : 'Upload complete. Review garment titles and pricing, then submit.'
    );
  }

  async function publish() {
    if (busy || publishing || !rows.length || unresolved > 0) {
      setMessage('Resolve failed uploads before submitting.');
      return;
    }

    if (isPricingMandatory && missingPricesCount > 0) {
      setMessage(
        `Pricing is mandatory for AI Video. Please enter prices for all ${missingPricesCount} garment(s).`
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
              eligibleForVideo: isPricingMandatory ? true : videoEnabled,
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
      {/* =========================================================
          THE TWO MAIN ACTION BUTTONS:
          1. Upload Catalogue for Image Try-On
          2. Upload Catalogue for AI Video
         ========================================================= */}
      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy || publishing}
          onClick={() => switchUploadMode('image-tryon')}
          className={`flex min-h-[96px] items-center gap-4 border-2 p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
            uploadMode === 'image-tryon'
              ? 'border-[#7A1428] bg-[#FAF6EE] shadow-md ring-2 ring-[#7A1428]/20'
              : 'border-[#D8DCD7] bg-white hover:border-[#161918]'
          }`}
        >
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
              uploadMode === 'image-tryon' ? 'bg-[#7A1428] text-white' : 'bg-[#FAFBF8] text-[#161918]'
            }`}
          >
            <Camera className="h-6 w-6" />
          </span>
          <div>
            <span className="block font-serif text-lg font-bold text-[#161918]">
              1. Upload Catalogue for Image Try-On
            </span>
            <span className="mt-0.5 block text-xs text-[#535A56]">
              Add dresses & sarees for virtual fitting · Optional pricing
            </span>
          </div>
        </button>

        <button
          type="button"
          disabled={busy || publishing}
          onClick={() => switchUploadMode('ai-video')}
          className={`flex min-h-[96px] items-center gap-4 border-2 p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
            uploadMode === 'ai-video'
              ? 'border-[#7A1428] bg-[#FAF6EE] shadow-md ring-2 ring-[#7A1428]/20'
              : 'border-[#D8DCD7] bg-white hover:border-[#161918]'
          }`}
        >
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
              uploadMode === 'ai-video' ? 'bg-[#7A1428] text-white' : 'bg-[#FAFBF8] text-[#161918]'
            }`}
          >
            <Video className="h-6 w-6" />
          </span>
          <div>
            <span className="block font-serif text-lg font-bold text-[#161918]">
              2. Upload Catalogue for AI Video
            </span>
            <span className="mt-0.5 block text-xs text-[#535A56]">
              Garments for cinematic AI video · Pricing strictly compulsory
            </span>
          </div>
        </button>
      </div>

      {/* Main Upload Box */}
      <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-6 text-[#161918]">
        {/* Top Control Bar with AI Video Checkmark */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#D8DCD7] pb-4">
          <div>
            <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#7A1428]">
              {uploadMode === 'ai-video'
                ? 'AI Video Mode (Pricing Mandatory)'
                : 'Image Try-On Mode'}
            </span>
            <h3 className="mt-1 font-serif text-2xl font-semibold">
              {uploadMode === 'ai-video'
                ? 'Upload AI Video Garments'
                : 'Upload Image Try-On Garments'}
            </h3>
          </div>

          {/* Checkmark: Use for AI Video */}
          <div className="flex items-center gap-3">
            <label
              className={`flex items-center gap-2 border px-3.5 py-2 text-xs font-bold transition ${
                isPricingMandatory
                  ? 'border-[#7A1428] bg-[#7A1428] text-white'
                  : 'border-[#D8DCD7] bg-white text-[#161918]'
              }`}
            >
              <input
                type="checkbox"
                disabled={uploadMode === 'ai-video' || publishing}
                checked={isPricingMandatory}
                onChange={(e) => setVideoEnabled(e.target.checked)}
                className="h-4 w-4 accent-[#161918]"
              />
              <span>Use for AI Video {isPricingMandatory ? '(Pricing Mandatory)' : ''}</span>
            </label>

            <label className="flex items-center gap-2 border border-[#D8DCD7] bg-white px-3 py-2 text-xs font-semibold">
              <input
                type="checkbox"
                disabled={publishing}
                checked={newArrival}
                onChange={(e) => setNewArrival(e.target.checked)}
                className="h-4 w-4 accent-[#7A1428]"
              />
              <span>Mark New Arrival</span>
            </label>
          </div>
        </div>

        {/* Step 1 & 2: Audience and Category Selection */}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-[#535A56]">
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
                      ? 'border-[#7A1428] bg-[#7A1428] text-white shadow-sm'
                      : 'border-[#D8DCD7] bg-white hover:border-[#161918]'
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
              className="mb-2 block font-mono text-xs font-bold uppercase tracking-wider text-[#535A56]"
            >
              2. Choose Category (e.g. {audience}/pants, {audience}/sarees)
            </label>
            <select
              id="bulk-category"
              disabled={busy || rows.length > 0}
              value={category}
              onChange={(e) => setCategory(e.target.value as CatalogueCategoryId | '')}
              className="min-h-11 w-full border border-[#D8DCD7] bg-white px-3 text-sm font-semibold text-[#161918] disabled:opacity-50"
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
          <p className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-[#535A56]">
            3. Upload garment photos
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label
              className={`flex items-center gap-2 bg-[#161918] px-5 py-3 text-xs font-bold uppercase tracking-wider text-white transition ${
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
              className={`flex items-center gap-2 border border-[#161918] bg-white px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#161918] transition ${
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
                className="border border-[#B42318] bg-white px-4 py-3 text-xs font-bold text-[#B42318] hover:bg-[#FAFBF8]"
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
          <div className="mt-8 space-y-4 border-t border-[#D8DCD7] pt-6">
            {/* View Switcher Header & Action Summary */}
            <div className="flex flex-wrap items-center justify-between gap-4 border border-[#D8DCD7] bg-white p-4">
              <div>
                <p className="font-serif text-lg font-semibold text-[#161918]">
                  {rows.length} garments in {audience} / {selectedCategoryLabel}
                </p>
                <p className="text-xs text-[#535A56]">
                  {isPricingMandatory
                    ? `Pricing is mandatory. ${missingPricesCount === 0 ? '✓ All prices set' : `${missingPricesCount} price(s) missing`}`
                    : 'Optional pricing · Ready for submission'}
                </p>
              </div>

              {/* View Toggle: Table vs 3x3 Grid */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1.5 border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                    viewMode === 'table'
                      ? 'border-[#7A1428] bg-[#7A1428] text-white'
                      : 'border-[#D8DCD7] bg-white text-[#161918]'
                  }`}
                >
                  <List className="h-3.5 w-3.5" />
                  Table View
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center gap-1.5 border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                    viewMode === 'grid'
                      ? 'border-[#7A1428] bg-[#7A1428] text-white'
                      : 'border-[#D8DCD7] bg-white text-[#161918]'
                  }`}
                >
                  <Grid3X3 className="h-3.5 w-3.5" />
                  View Catalogue (3×3 Grid)
                </button>
              </div>
            </div>

            {/* VIEW A: TABLE WITH MINI-THUMBNAIL (CLICK TO OPEN FULL VIEW) */}
            {viewMode === 'table' && (
              <div className="overflow-x-auto border border-[#D8DCD7] bg-white">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="bg-[#FAFBF8] border-b border-[#D8DCD7] font-mono uppercase tracking-wider text-[#535A56]">
                    <tr>
                      <th className="p-3 w-16">Thumbnail</th>
                      <th className="p-3">Name of Garment</th>
                      <th className="p-3">Category</th>
                      <th className="p-3 w-40">
                        Pricing (₹) {isPricingMandatory && <span className="text-[#B42318]">*</span>}
                      </th>
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
                              className="group relative block aspect-[3/4] w-12 overflow-hidden rounded border border-[#D8DCD7] bg-[#ECEEE9] shadow-sm transition hover:scale-105"
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
                              className="w-full border border-[#D8DCD7] bg-white p-2 text-xs font-semibold text-[#161918]"
                              placeholder="Garment title…"
                            />
                            <span className="mt-0.5 block font-mono text-[10px] text-[#8C938F]">
                              SKU: {row.sku}
                            </span>
                          </td>

                          {/* 3. Category (e.g. Men/Pants) */}
                          <td className="p-3 font-semibold text-[#161918]">
                            <span className="inline-block rounded border border-[#D8DCD7] bg-[#FAFBF8] px-2 py-1 text-[11px]">
                              {audience} / {selectedCategoryLabel}
                            </span>
                          </td>

                          {/* 4. Pricing (Mandatory if AI Video is ticked) */}
                          <td className="p-3">
                            <div className="relative">
                              <span className="absolute left-2.5 top-2 text-xs font-bold text-[#8C938F]">
                                ₹
                              </span>
                              <input
                                aria-label={`Price for ${row.filename}`}
                                type="number"
                                min="0"
                                value={row.price}
                                onChange={(e) => update(row.id, { price: e.target.value })}
                                placeholder={isPricingMandatory ? 'Mandatory' : 'Optional'}
                                className={`w-full border p-2 pl-6 text-xs font-bold ${
                                  isPriceMissing
                                    ? 'border-[#B42318] bg-[#FDF2F2] text-[#B42318]'
                                    : 'border-[#D8DCD7] bg-white text-[#161918]'
                                }`}
                              />
                            </div>
                            {isPriceMissing && (
                              <span className="mt-0.5 block text-[10px] font-semibold text-[#B42318]">
                                Price required for video
                              </span>
                            )}
                          </td>

                          {/* 5. Status */}
                          <td className="p-3">
                            {row.status === 'uploading' && (
                              <span className="inline-flex items-center gap-1 font-semibold text-[#7A1428]">
                                <LoaderCircle className="h-3 w-3 animate-spin" /> Uploading…
                              </span>
                            )}
                            {row.status === 'ready' && (
                              <span className="inline-flex items-center gap-1 font-semibold text-[#256B45]">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Ready
                              </span>
                            )}
                            {row.status === 'failed' && (
                              <span className="block text-[11px] font-semibold text-[#B42318]">
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
                              className="text-xs font-bold text-[#B42318] hover:underline"
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
                        className="group flex flex-col justify-between overflow-hidden border border-[#D8DCD7] bg-white p-3 shadow-sm transition hover:border-[#7A1428]"
                      >
                        <button
                          type="button"
                          onClick={() => setLightboxUrl(row.previewUrl)}
                          className="relative aspect-[3/4] w-full overflow-hidden bg-[#ECEEE9] text-left"
                          title="Click to open full view"
                        >
                          <img
                            src={row.previewUrl}
                            alt={row.title}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                          <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-white">
                            Zoom
                          </span>
                        </button>

                        <div className="mt-3 space-y-1.5">
                          <input
                            aria-label={`Title for ${row.filename}`}
                            value={row.title}
                            onChange={(e) => update(row.id, { title: e.target.value })}
                            className="w-full border border-[#D8DCD7] p-1.5 text-xs font-bold text-[#161918]"
                            placeholder="Garment name"
                          />

                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-[#535A56]">
                              {audience} / {selectedCategoryLabel}
                            </span>
                            <span className="font-mono text-[10px] text-[#8C938F]">
                              {row.sku}
                            </span>
                          </div>

                          <div className="relative">
                            <span className="absolute left-2.5 top-1.5 text-xs font-bold text-[#8C938F]">
                              ₹
                            </span>
                            <input
                              aria-label={`Price for ${row.filename}`}
                              type="number"
                              min="0"
                              value={row.price}
                              onChange={(e) => update(row.id, { price: e.target.value })}
                              placeholder={isPricingMandatory ? 'Price required' : 'Price (optional)'}
                              className={`w-full border p-1.5 pl-6 text-xs font-bold ${
                                isPriceMissing
                                  ? 'border-[#B42318] bg-[#FDF2F2] text-[#B42318]'
                                  : 'border-[#D8DCD7] bg-white text-[#161918]'
                              }`}
                            />
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[11px] font-semibold text-[#256B45]">
                              {row.status === 'ready' ? '✓ Ready' : row.status}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setRows((current) => current.filter((item) => item.id !== row.id))
                              }
                              className="text-[11px] font-bold text-[#B42318] hover:underline"
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
            <div className="flex flex-wrap items-center justify-between gap-4 border border-[#D8DCD7] bg-white p-5">
              <div className="space-y-1">
                <p className="font-serif text-lg font-semibold text-[#161918]">
                  Ready to publish {rows.length} garments to store catalogue
                </p>
                <p className="text-xs text-[#535A56]">
                  Uploads will immediately reflect in both the 43&quot; TV standee and counter tablet.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setViewMode((curr) => (curr === 'table' ? 'grid' : 'table'))}
                  className="flex min-h-12 items-center gap-2 border-2 border-[#161918] bg-white px-5 text-xs font-bold uppercase tracking-wider text-[#161918] hover:bg-[#FAF6EE]"
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
                  className="flex min-h-12 items-center gap-2 bg-[#7A1428] px-8 text-xs font-bold uppercase tracking-wider text-white shadow-md hover:bg-[#600F1F] disabled:opacity-40"
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
            className="mt-4 flex items-center gap-2 border border-[#D8DCD7] bg-white p-4 text-xs font-semibold text-[#161918]"
          >
            <AlertCircle className="h-4 w-4 text-[#7A1428]" />
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
            className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-lg border-2 border-white/20 bg-[#161918] p-2 shadow-2xl"
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
