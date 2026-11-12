'use client';

import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, LoaderCircle, Trash2 } from 'lucide-react';
import type { CatalogueAudience } from '@/lib/tryfocus/sample-data';

export type CatalogueTableRow = {
  /** The SKU for a saved garment; a local id for one still being uploaded. */
  key: string;
  sku: string;
  image: string;
  title: string;
  category: string;
  gender: CatalogueAudience;
  price: string;
  aiVideo: boolean;
  western: boolean;
  newArrival: boolean;
  trending: boolean;
  active: boolean;
  status?: 'uploading' | 'ready' | 'failed';
  /** Why an upload failed, shown under its status. */
  note?: string;
  /** Problems the store should see on the row (a hidden category, a category for another audience…). */
  flags?: string[];
};

export type CatalogueRowPatch = Partial<Pick<CatalogueTableRow, 'title' | 'category' | 'price' | 'aiVideo' | 'western'>>;
export type CatalogueBulkAction = 'new-arrival' | 'trending' | 'hide' | 'show' | 'delete';
export type CategoryOption = { id: string; label: string; western: boolean };

const AUDIENCE_WORD: Record<CatalogueAudience, string> = { women: "Women's", men: "Men's", boys: "Boys'", girls: "Girls'" };

function pill(on: boolean) {
  return `min-h-9 whitespace-nowrap rounded-full px-3 text-xs font-semibold transition ${on ? 'bg-ink text-white' : 'border border-line-strong bg-white text-muted hover:border-ink hover:text-ink'}`;
}

/**
 * One table for the catalogue everywhere — a fresh upload, the whole collection, a day in the upload history.
 * Each row: name, category, price, and two tap-on / tap-off buttons (AI Video, Western Try-On). Ticking rows
 * brings up one action bar for tags, hide/show and delete. Desktop and tablet only, so it may scroll sideways.
 */
export default function CatalogueTable({
  rows,
  mode,
  experiences,
  categoryOptions,
  onChange,
  onBulk,
  busy = false,
  emptyText = 'No garments here yet.',
}: {
  rows: CatalogueTableRow[];
  /** 'upload' rows are not saved yet (no hide/show); 'saved' rows change as soon as they're edited. */
  mode: 'upload' | 'saved';
  experiences: { video: boolean; live: boolean };
  categoryOptions: (gender: CatalogueAudience) => CategoryOption[];
  onChange: (key: string, patch: CatalogueRowPatch) => void;
  onBulk: (action: CatalogueBulkAction, keys: string[], on: boolean) => void | Promise<void>;
  busy?: boolean;
  emptyText?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmRowDelete, setConfirmRowDelete] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // A row that left the table (deleted, filtered out) drops out of the selection.
  const keys = useMemo(() => new Set(rows.map((row) => row.key)), [rows]);
  const picked = rows.filter((row) => selected.has(row.key));
  const allPicked = rows.length > 0 && picked.length === rows.length;

  function toggleRow(key: string) {
    setConfirmBulkDelete(false);
    setSelected((current) => {
      const next = new Set([...current].filter((item) => keys.has(item)));
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setConfirmBulkDelete(false);
    setSelected(allPicked ? new Set() : new Set(rows.map((row) => row.key)));
  }

  async function bulk(action: CatalogueBulkAction) {
    const chosen = picked.map((row) => row.key);
    if (!chosen.length) return;
    // A tag already on every chosen garment comes off; otherwise it goes on.
    const on = action === 'new-arrival' ? !picked.every((row) => row.newArrival)
      : action === 'trending' ? !picked.every((row) => row.trending)
        : action === 'show';
    await onBulk(action, chosen, on);
    setConfirmBulkDelete(false);
    if (action === 'delete') setSelected(new Set());
  }

  /** Enter in a price box moves to the next row's price, so a long batch is typed straight down. */
  function nextPrice(current: HTMLInputElement) {
    const boxes = Array.from(tableRef.current?.querySelectorAll<HTMLInputElement>('input[data-price]') || []);
    const index = boxes.indexOf(current);
    current.blur();
    boxes[index + 1]?.focus();
  }

  if (!rows.length) return <p className="rounded-2xl border border-dashed border-line-strong bg-white p-8 text-center text-sm text-muted">{emptyText}</p>;

  const allNew = picked.length > 0 && picked.every((row) => row.newArrival);
  const allTrending = picked.length > 0 && picked.every((row) => row.trending);

  return (
    <div ref={tableRef} className="space-y-3">
      <div className={`flex min-h-14 flex-wrap items-center gap-2 rounded-2xl border px-4 py-2 ${picked.length ? 'border-ink bg-white' : 'border-line bg-canvas'}`}>
        <span className="mr-2 text-sm font-semibold text-ink">{picked.length ? `${picked.length} selected` : 'Tick garments to tag, hide or delete them together'}</span>
        {picked.length > 0 && !confirmBulkDelete && (
          <>
            <button type="button" disabled={busy} onClick={() => void bulk('new-arrival')} className={pill(allNew)}>New arrival</button>
            <button type="button" disabled={busy} onClick={() => void bulk('trending')} className={pill(allTrending)}>Trending</button>
            {mode === 'saved' && <button type="button" disabled={busy} onClick={() => void bulk('hide')} className={pill(false)}>Hide</button>}
            {mode === 'saved' && <button type="button" disabled={busy} onClick={() => void bulk('show')} className={pill(false)}>Show</button>}
            <button type="button" disabled={busy} onClick={() => setConfirmBulkDelete(true)} className="min-h-9 rounded-full border border-danger px-3 text-xs font-semibold text-danger hover:bg-danger-soft">
              {mode === 'upload' ? 'Remove' : 'Delete'}
            </button>
            <button type="button" onClick={() => setSelected(new Set())} className="ml-auto min-h-9 px-2 text-xs font-semibold text-muted hover:text-ink">Clear</button>
          </>
        )}
        {picked.length > 0 && confirmBulkDelete && (
          <>
            <span className="text-sm font-semibold text-danger">{mode === 'upload' ? `Remove ${picked.length} from this upload?` : `Delete ${picked.length} garment(s) for good? Their photos are removed too.`}</span>
            <button type="button" disabled={busy} onClick={() => void bulk('delete')} className="min-h-9 rounded-full bg-danger px-4 text-xs font-bold text-white">{mode === 'upload' ? 'Remove' : 'Yes, delete'}</button>
            <button type="button" onClick={() => setConfirmBulkDelete(false)} className="min-h-9 px-2 text-xs font-semibold text-muted hover:text-ink">Cancel</button>
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead className="border-b border-line bg-canvas text-xs text-muted">
            <tr>
              <th className="w-12 p-3"><input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label="Select every garment in this table" className="h-5 w-5 accent-ink" /></th>
              <th className="w-16 p-3">Photo</th>
              <th className="min-w-[260px] p-3">Garment</th>
              <th className="w-48 p-3">Category</th>
              <th className="w-32 p-3">Price</th>
              {experiences.video && <th className="w-40 p-3">AI Video</th>}
              {experiences.live && <th className="w-40 p-3">Western Try-On</th>}
              {mode === 'upload' && <th className="w-28 p-3">Status</th>}
              <th className="w-24 p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => {
              const options = categoryOptions(row.gender);
              const known = options.some((option) => option.id === row.category);
              const priceMissing = experiences.video && row.aiVideo && !(Number(row.price) > 0);
              return (
                <tr key={row.key} className={`${selected.has(row.key) ? 'bg-brand-soft/40' : 'hover:bg-[#FAFBF8]'} ${row.active ? '' : 'opacity-60'}`}>
                  <td className="p-3"><input type="checkbox" checked={selected.has(row.key)} onChange={() => toggleRow(row.key)} aria-label={`Select ${row.title}`} className="h-5 w-5 accent-ink" /></td>
                  <td className="p-3">
                    <span className="block aspect-[3/4] w-12 overflow-hidden rounded-lg border border-line bg-canvas">
                      {row.image && <img src={row.image} alt="" loading="lazy" className="h-full w-full object-cover object-top" />}
                    </span>
                  </td>
                  <td className="p-3">
                    <input
                      key={`${row.key}-title-${row.title}`}
                      defaultValue={row.title}
                      onBlur={(e) => { const next = e.target.value.trim(); if (next && next !== row.title) onChange(row.key, { title: next }); }}
                      aria-label={`Name of ${row.title}`}
                      className="min-h-9 w-full rounded-lg border border-transparent bg-transparent px-2 font-semibold text-ink hover:border-line focus:border-ink focus:bg-white"
                    />
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 px-2">
                      <span className="text-xs tabular-nums text-subtle">{row.sku}</span>
                      {row.newArrival && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-white">New arrival</span>}
                      {row.trending && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-white">Trending</span>}
                      {!row.active && <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] font-semibold text-muted">Hidden</span>}
                      {row.flags?.map((flag) => <span key={flag} className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-ink">{flag}</span>)}
                    </div>
                  </td>
                  <td className="p-3">
                    <select
                      value={row.category}
                      onChange={(e) => onChange(row.key, { category: e.target.value })}
                      aria-label={`Category of ${row.title}`}
                      className={`min-h-10 w-full rounded-lg border bg-white px-2 text-sm font-semibold text-ink ${known ? 'border-line' : 'border-danger'}`}
                    >
                      {!known && <option value={row.category}>Not a {AUDIENCE_WORD[row.gender]} category — choose one</option>}
                      {options.map((option) => <option key={option.id} value={option.id}>{option.label}{option.western ? ' · WW' : ''}</option>)}
                    </select>
                  </td>
                  <td className="p-3">
                    <div className="relative">
                      <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-bold ${priceMissing ? 'text-danger' : 'text-subtle'}`}>₹</span>
                      <input
                        key={`${row.key}-price-${row.price}`}
                        data-price
                        type="number"
                        min="0"
                        inputMode="numeric"
                        defaultValue={row.price}
                        onBlur={(e) => { if (e.target.value !== row.price) onChange(row.key, { price: e.target.value }); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); nextPrice(e.currentTarget); } }}
                        placeholder={priceMissing ? 'Needed' : '—'}
                        aria-label={`Price of ${row.title}`}
                        className={`min-h-10 w-full rounded-lg border pl-7 pr-2 text-sm font-bold tabular-nums ${priceMissing ? 'border-danger bg-danger-soft text-danger placeholder:text-danger' : 'border-line bg-white text-ink'}`}
                      />
                    </div>
                  </td>
                  {experiences.video && (
                    <td className="p-3">
                      <button type="button" aria-pressed={row.aiVideo} onClick={() => onChange(row.key, { aiVideo: !row.aiVideo })} className={priceMissing ? 'min-h-9 whitespace-nowrap rounded-full border border-danger bg-danger-soft px-3 text-xs font-semibold text-danger' : pill(row.aiVideo)}>
                        {priceMissing ? 'AI Video · add price' : 'AI Video'}
                      </button>
                    </td>
                  )}
                  {experiences.live && (
                    <td className="p-3">
                      <button type="button" aria-pressed={row.western} onClick={() => onChange(row.key, { western: !row.western })} className={pill(row.western)}>Western Try-On</button>
                    </td>
                  )}
                  {mode === 'upload' && (
                    <td className="p-3 text-xs">
                      {row.status === 'uploading' && <span className="inline-flex items-center gap-1 font-semibold text-brand"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Uploading</span>}
                      {row.status === 'ready' && <span className="inline-flex items-center gap-1 font-semibold text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Ready</span>}
                      {row.status === 'failed' && <span className="font-semibold text-danger">Failed{row.note ? ` — ${row.note}` : ''}</span>}
                    </td>
                  )}
                  <td className="p-3 text-right">
                    {confirmRowDelete === row.key ? (
                      <span className="inline-flex items-center gap-1">
                        <button type="button" disabled={busy} onClick={() => { setConfirmRowDelete(null); void onBulk('delete', [row.key], false); }} className="min-h-9 rounded-full bg-danger px-3 text-xs font-bold text-white">{mode === 'upload' ? 'Remove' : 'Delete'}</button>
                        <button type="button" onClick={() => setConfirmRowDelete(null)} className="min-h-9 px-1 text-xs font-semibold text-muted">No</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirmRowDelete(row.key)} aria-label={`${mode === 'upload' ? 'Remove' : 'Delete'} ${row.title}`} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-danger-soft hover:text-danger">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
