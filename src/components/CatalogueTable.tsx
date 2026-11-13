'use client';

import { useRef, useState } from 'react';
import { X } from 'lucide-react';

export type CatalogueTableRow = {
  key: string;
  sku: string;
  image: string;
  title: string;
  price: string;
  western: boolean;
  /** A note shown under the name (a duplicate photo, a failed upload…). */
  note?: string;
};

/**
 * The catalogue table, in two shapes. Try-On: photo · name · WW (Western Try-On) · ✕. AI Video: photo ·
 * name · price · ✕. Tick rows to remove several at once. On computers and tablets, so it may scroll sideways.
 */
export default function CatalogueTable({
  rows,
  kind,
  showWestern = true,
  removeLabel,
  onWestern,
  onPrice,
  onRemove,
  busy = false,
  emptyText,
}: {
  rows: CatalogueTableRow[];
  kind: 'tryon' | 'video';
  showWestern?: boolean;
  /** What ✕ does, in words: "Delete" or "Remove from AI Video". */
  removeLabel: string;
  onWestern?: (key: string, on: boolean) => void;
  onPrice?: (key: string, price: string) => void;
  onRemove: (keys: string[]) => void | Promise<void>;
  busy?: boolean;
  emptyText: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [confirmRow, setConfirmRow] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const picked = rows.filter((row) => selected.has(row.key)).map((row) => row.key);
  const allPicked = rows.length > 0 && picked.length === rows.length;

  function toggle(key: string) {
    setConfirming(false);
    setSelected((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }

  async function removeKeys(keys: string[]) {
    await onRemove(keys);
    setSelected((current) => new Set([...current].filter((key) => !keys.includes(key))));
    setConfirming(false);
  }

  if (!rows.length) return <p className="rounded-2xl border border-dashed border-line-strong bg-white p-10 text-center text-sm text-muted">{emptyText}</p>;

  return (
    <div ref={ref} className="space-y-3">
      {picked.length > 0 && (
        <div className="flex min-h-14 flex-wrap items-center gap-3 rounded-2xl border border-ink bg-white px-4 py-2">
          <span className="text-sm font-semibold text-ink">{picked.length} selected</span>
          {!confirming ? (
            <button type="button" disabled={busy} onClick={() => setConfirming(true)} className="min-h-10 rounded-full border border-danger px-4 text-sm font-semibold text-danger hover:bg-danger-soft">{removeLabel} {picked.length}</button>
          ) : (
            <>
              <span className="text-sm font-semibold text-danger">{removeLabel} {picked.length} garment(s)?</span>
              <button type="button" disabled={busy} onClick={() => void removeKeys(picked)} className="min-h-10 rounded-full bg-danger px-4 text-sm font-bold text-white">Yes</button>
              <button type="button" onClick={() => setConfirming(false)} className="min-h-10 px-2 text-sm font-semibold text-muted">Cancel</button>
            </>
          )}
          <button type="button" onClick={() => { setSelected(new Set()); setConfirming(false); }} className="ml-auto min-h-10 px-2 text-sm font-semibold text-muted hover:text-ink">Clear</button>
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line bg-canvas text-xs text-muted">
            <tr>
              <th className="w-12 p-3"><input type="checkbox" checked={allPicked} onChange={() => { setConfirming(false); setSelected(allPicked ? new Set() : new Set(rows.map((row) => row.key))); }} aria-label="Select all" className="h-5 w-5 accent-ink" /></th>
              <th className="w-20 p-3">Photo</th>
              <th className="p-3">Garment</th>
              {kind === 'video' && <th className="w-44 p-3">Price</th>}
              {kind === 'tryon' && showWestern && <th className="w-48 p-3">Western Try-On</th>}
              <th className="w-40 p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => {
              const missing = kind === 'video' && !(Number(row.price) > 0);
              return (
                <tr key={row.key} className={selected.has(row.key) ? 'bg-canvas' : ''}>
                  <td className="p-3"><input type="checkbox" checked={selected.has(row.key)} onChange={() => toggle(row.key)} aria-label={`Select ${row.title}`} className="h-5 w-5 accent-ink" /></td>
                  <td className="p-3">
                    <span className="block aspect-[3/4] w-14 overflow-hidden rounded-lg border border-line bg-canvas">
                      {row.image && <img src={row.image} alt="" loading="lazy" className="h-full w-full object-cover object-top" />}
                    </span>
                  </td>
                  <td className="p-3">
                    <p className="font-semibold text-ink">{row.title}</p>
                    <p className="text-xs tabular-nums text-subtle">{row.sku}</p>
                    {row.note && <p className="mt-1 text-xs font-semibold text-danger">{row.note}</p>}
                  </td>
                  {kind === 'video' && (
                    <td className="p-3">
                      <div className="relative">
                        <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold ${missing ? 'text-danger' : 'text-subtle'}`}>₹</span>
                        <input
                          key={`${row.key}-${row.price}`}
                          data-price
                          type="number"
                          min="1"
                          inputMode="numeric"
                          defaultValue={row.price}
                          placeholder="Price"
                          aria-label={`Price of ${row.title}`}
                          onBlur={(e) => { if (e.target.value !== row.price) onPrice?.(row.key, e.target.value); }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            const boxes = Array.from(ref.current?.querySelectorAll<HTMLInputElement>('input[data-price]') || []);
                            const next = boxes[boxes.indexOf(e.currentTarget) + 1];
                            e.currentTarget.blur();
                            next?.focus();
                          }}
                          className={`min-h-11 w-full rounded-lg border pl-8 pr-3 font-bold tabular-nums ${missing ? 'border-danger bg-danger-soft text-danger placeholder:text-danger' : 'border-line bg-white text-ink'}`}
                        />
                      </div>
                    </td>
                  )}
                  {kind === 'tryon' && showWestern && (
                    <td className="p-3">
                      <button type="button" aria-pressed={row.western} onClick={() => onWestern?.(row.key, !row.western)} className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${row.western ? 'bg-ink text-white' : 'border border-line-strong bg-white text-muted hover:border-ink hover:text-ink'}`}>
                        {row.western ? 'WW on' : 'WW off'}
                      </button>
                    </td>
                  )}
                  <td className="p-3 text-right">
                    {confirmRow === row.key ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <button type="button" disabled={busy} onClick={() => { setConfirmRow(null); void removeKeys([row.key]); }} className="min-h-10 rounded-full bg-danger px-3 text-xs font-bold text-white">{removeLabel}</button>
                        <button type="button" onClick={() => setConfirmRow(null)} className="min-h-10 px-1 text-xs font-semibold text-muted">No</button>
                      </span>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => setConfirmRow(row.key)} aria-label={`${removeLabel} ${row.title}`} title={removeLabel} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-danger-soft hover:text-danger">
                        <X className="h-5 w-5" />
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
