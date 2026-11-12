'use client';

import { useRef, useState } from 'react';
import { LoaderCircle, Upload, X } from 'lucide-react';
import { Segmented } from '@/components/ui';
import CatalogueTable from '@/components/CatalogueTable';
import { categoriesFor, findCategory, isWesternCategory, type CustomCategory, type StoreCategoryLists, type WesternOverrides } from '@/lib/tryfocus/store-categories';
import type { CatalogueAudience } from '@/lib/tryfocus/sample-data';

const AUDIENCES: Array<{ value: CatalogueAudience; label: string }> = [
  { value: 'women', label: 'Women' },
  { value: 'men', label: 'Men' },
  { value: 'boys', label: 'Boys' },
  { value: 'girls', label: 'Girls' },
];
const AUDIENCE_NAMES: Record<CatalogueAudience, string> = { women: 'Women', men: 'Men', boys: 'Boys', girls: 'Girls' };

type Staged = {
  key: string;
  sku: string;
  gender: CatalogueAudience;
  category: string;
  image: string;
  title: string;
  price: string;
  status: 'uploading' | 'ready' | 'failed' | 'duplicate';
  note?: string;
  storagePath?: string;
  photoHash?: string;
};

/**
 * Upload garments. Try-On: pick who and a category, add photos, switch to another who or category and add
 * more, then Submit once — no prices; a WW (Western wear) category goes on Western Try-On by itself. AI Video:
 * pick who and a category, add photos, type a price on every row, then Save. A photo already in the catalogue
 * is skipped and named, never saved twice.
 */
export default function CatalogueBulkImport({
  kind,
  workspaceCode,
  liveOn,
  categoryLists,
  customCategories = [],
  westernOverrides = {},
  onDone,
}: {
  kind: 'tryon' | 'video';
  workspaceCode?: string;
  /** The store has Western Try-On, so WW categories switch it on. */
  liveOn: boolean;
  /** The list to pick categories from: Try-On's or AI Video's own. */
  categoryLists?: StoreCategoryLists;
  customCategories?: CustomCategory[];
  westernOverrides?: WesternOverrides;
  onDone: (result: { count: number; gender: CatalogueAudience; category: string }) => Promise<void> | void;
}) {
  const [audience, setAudience] = useState<CatalogueAudience | null>(null);
  const [category, setCategory] = useState('');
  const [rows, setRows] = useState<Staged[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const batchId = useRef('');

  const categories = audience ? categoriesFor(categoryLists, audience, customCategories) : [];
  const western = (id: string) => liveOn && isWesternCategory(id, customCategories, westernOverrides);
  const label = (gender: CatalogueAudience, id: string) => `${AUDIENCE_NAMES[gender]} · ${findCategory(id, customCategories)?.label || id}`;
  const ready = rows.filter((row) => row.status === 'ready');
  const missingPrice = kind === 'video' ? ready.filter((row) => !(Number(row.price) > 0)) : [];

  function update(key: string, patch: Partial<Staged>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length || !audience || !category || busy || saving) return;
    const chosen = Array.from(files).filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
    if (!chosen.length) { setMessage('Choose JPEG, PNG or WebP photos.'); return; }
    if (!batchId.current) batchId.current = crypto.randomUUID();
    const batch = batchId.current;
    const code = category.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'GAR';
    const stamp = Date.now().toString(36).toUpperCase().slice(-5);
    const start = rows.length;
    const added: Staged[] = chosen.map((file, index) => ({
      key: `${batch}:${start + index}`,
      sku: `${kind === 'video' ? 'AIV' : 'MAH'}-${code}-${stamp}-${String(start + index + 1).padStart(3, '0')}`,
      gender: audience,
      category,
      image: URL.createObjectURL(file),
      title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || `Garment ${start + index + 1}`,
      price: '',
      status: 'uploading',
    }));
    setRows((current) => [...current, ...added]);
    setBusy(true);
    setMessage('');
    const seen = new Set(rows.map((row) => row.photoHash).filter(Boolean));
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(3, chosen.length) }, async () => {
      while (cursor < chosen.length) {
        const index = cursor++;
        const row = added[index];
        const form = new FormData();
        form.set('batchId', batch);
        form.set('category', row.category);
        form.set('file', chosen[index]);
        if (workspaceCode) form.set('workspaceCode', workspaceCode);
        try {
          const response = await fetch('/api/maharaja/catalogue/import/analyze', { method: 'POST', body: form });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.success) throw new Error(data.error || 'Upload failed.');
          if (data.duplicate) { update(row.key, { status: 'duplicate', note: `Already in your catalogue as ${data.duplicate.title}`, photoHash: data.photoHash }); continue; }
          if (data.photoHash && seen.has(data.photoHash)) { update(row.key, { status: 'duplicate', note: 'Added twice in this upload', photoHash: data.photoHash }); continue; }
          if (data.photoHash) seen.add(data.photoHash);
          update(row.key, { status: 'ready', storagePath: data.storagePath, photoHash: data.photoHash });
        } catch (error) {
          update(row.key, { status: 'failed', note: error instanceof Error ? error.message : 'Upload failed.' });
        }
      }
    }));
    setBusy(false);
  }

  async function save() {
    if (busy || saving || !ready.length) return;
    if (missingPrice.length) { setMessage(`Type a price for ${missingPrice.length} garment(s) before saving.`); return; }
    setSaving(true);
    setMessage('');
    const done = new Set<string>();
    const errors: string[] = [];
    for (let i = 0; i < ready.length; i += 20) {
      const chunk = ready.slice(i, i + 20);
      try {
        const response = await fetch('/api/maharaja/catalogue/import/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchId: batchId.current,
            workspaceCode,
            items: chunk.map((row) => ({
              sku: row.sku,
              title: row.title,
              category: row.category,
              storagePath: row.storagePath,
              photoHash: row.photoHash,
              price: kind === 'video' ? Number(row.price) : 0,
              eligibleForVideo: kind === 'video',
              eligibleForLive: western(row.category),
            })),
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(data.results)) throw new Error(data.error || 'Saving failed.');
        for (const result of data.results) {
          const row = chunk.find((item) => item.sku === result.sku);
          if (result.success && row) done.add(row.key);
          else if (!result.success) errors.push(result.error || 'Saving failed');
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Saving failed.');
      }
    }
    const last = ready[ready.length - 1];
    setRows((current) => current.filter((row) => !done.has(row.key)));
    setSaving(false);
    if (!errors.length) batchId.current = '';
    setMessage(errors.length ? `${done.size} saved. ${errors.length} could not be saved: ${errors[0]}` : '');
    if (done.size) await onDone({ count: done.size, gender: last.gender, category: last.category });
  }

  const groups = Array.from(new Set(rows.map((row) => `${row.gender}|${row.category}`)));

  return (
    <div className="space-y-5 rounded-2xl border border-line bg-canvas p-5">
      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Who is it for?</p>
          <Segmented size="sm" label="Who is it for?" value={audience} onChange={(value) => { setAudience(value); setCategory(''); }} options={AUDIENCES} />
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-sm font-semibold text-ink">Category</p>
          {!audience ? <p className="py-2.5 text-sm text-muted">Pick Women, Men, Boys or Girls first.</p> : (
            <div role="group" aria-label="Category" className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button key={cat.id} type="button" aria-pressed={category === cat.id} onClick={() => setCategory(cat.id as string)} className={`min-h-11 rounded-full px-4 text-sm font-semibold transition ${category === cat.id ? 'bg-ink text-white' : 'border border-line-strong bg-white text-ink hover:border-ink'}`}>
                  {cat.label}{kind === 'tryon' && western(cat.id as string) ? ' · WW' : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className={`tf-btn tf-btn-secondary !min-h-12 px-5 ${category && !busy && !saving ? 'cursor-pointer' : 'pointer-events-none opacity-40'}`}>
          <Upload className="h-4 w-4" /> Add photos
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={!category || busy || saving} onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }} className="sr-only" />
        </label>
        <label className={`tf-btn tf-btn-secondary !min-h-12 px-5 ${category && !busy && !saving ? 'cursor-pointer' : 'pointer-events-none opacity-40'}`}>
          Add a folder
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple {...({ webkitdirectory: '' } as object)} disabled={!category || busy || saving} onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }} className="sr-only" />
        </label>
        {busy && <span className="inline-flex items-center gap-2 text-sm text-muted"><LoaderCircle className="h-4 w-4 animate-spin" /> Uploading…</span>}
        {kind === 'tryon' && rows.length > 0 && !busy && <span className="text-sm text-muted">Switch who or category above to add more.</span>}
      </div>

      {kind === 'tryon' && groups.map((group) => {
        const [gender, cat] = group.split('|') as [CatalogueAudience, string];
        const inGroup = rows.filter((row) => row.gender === gender && row.category === cat);
        return (
          <div key={group}>
            <p className="mb-2 text-sm font-semibold text-ink">{label(gender, cat)} · {inGroup.length}{western(cat) ? ' · goes on Western Try-On too' : ''}</p>
            <ul className="flex flex-wrap gap-3">
              {inGroup.map((row) => (
                <li key={row.key} className="relative w-24">
                  <span className={`block aspect-[3/4] overflow-hidden rounded-lg border bg-white ${row.status === 'ready' ? 'border-line' : row.status === 'uploading' ? 'border-line opacity-60' : 'border-danger opacity-60'}`}>
                    <img src={row.image} alt="" className="h-full w-full object-cover object-top" />
                  </span>
                  {row.status === 'uploading' && <LoaderCircle className="absolute left-1/2 top-10 h-5 w-5 -translate-x-1/2 animate-spin text-ink" />}
                  <button type="button" onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))} aria-label={`Remove ${row.title}`} className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-white"><X className="h-4 w-4" /></button>
                  {row.note && <p className="mt-1 text-[11px] font-semibold leading-tight text-danger">{row.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {kind === 'video' && rows.length > 0 && (
        <CatalogueTable
          kind="video"
          rows={rows.map((row) => ({ key: row.key, sku: label(row.gender, row.category), image: row.image, title: row.title, price: row.price, western: false, note: row.status === 'uploading' ? 'Uploading…' : row.note }))}
          removeLabel="Remove"
          onPrice={(key, price) => update(key, { price })}
          onRemove={(keys) => setRows((current) => current.filter((row) => !keys.includes(row.key)))}
          emptyText=""
        />
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-sm text-ink">
            <b>{ready.length}</b> ready to save
            {missingPrice.length > 0 && <span className="text-danger"> · {missingPrice.length} need a price</span>}
            {rows.some((row) => row.status === 'duplicate') && <span className="text-muted"> · duplicates are skipped</span>}
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={() => { setRows([]); batchId.current = ''; setMessage(''); }} disabled={saving} className="tf-btn tf-btn-secondary !min-h-12 px-5">Clear</button>
            <button type="button" onClick={() => void save()} disabled={busy || saving || !ready.length || missingPrice.length > 0} className="tf-btn tf-btn-primary !min-h-12 px-6">
              {saving ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Saving…</> : kind === 'video' ? `Save ${ready.length} to AI Video` : `Submit ${ready.length} garment(s)`}
            </button>
          </div>
        </div>
      )}
      {message && <p role="status" className="text-sm font-semibold text-danger">{message}</p>}
    </div>
  );
}
