'use client';

import { useState } from 'react';
import { catalogueCategories, type CatalogueCategoryId } from '@/lib/tryfocus/sample-data';

type Row = {
  id: string;
  sku: string;
  filename: string;
  title: string;
  storagePath: string;
  category: CatalogueCategoryId | '';
  confidence: number;
  note: string;
  price: string;
  status: 'uploading' | 'ready' | 'review' | 'failed';
};

const PAGE_SIZE = 25;

export default function CatalogueBulkImport({ onPublished }: { onPublished: () => Promise<void> }) {
  const [batchId, setBatchId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState('');

  function update(id: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  async function analyze(row: Row, file?: File) {
    const request = file ? new FormData() : null;
    if (request && file) {
      request.set('batchId', batchId || row.id.split(':')[0]);
      request.set('file', file);
    }
    const response = await fetch('/api/maharaja/catalogue/import/analyze', {
      method: 'POST',
      ...(request ? { body: request } : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, storagePath: row.storagePath, filename: row.filename }),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || 'Analysis failed.');
    update(row.id, {
      storagePath: data.storagePath,
      category: data.category || '',
      confidence: Number(data.confidence) || 0,
      note: data.note || '',
      status: data.category ? 'ready' : 'review',
    });
  }

  async function begin(files: FileList | null) {
    if (!files?.length || busy || publishing) return;
    const chosen = Array.from(files).filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
    if (!chosen.length) { setMessage('Choose JPEG, PNG or WebP garment photos.'); return; }
    const nextBatch = crypto.randomUUID();
    setBatchId(nextBatch);
    setMessage(`Analyzing ${chosen.length} garments. You can review categories before publishing.`);
    setPage(0);
    const initial: Row[] = chosen.map((file, index) => ({
      id: `${nextBatch}:${index}`,
      sku: `MAH-${nextBatch.slice(0, 6).toUpperCase()}-${String(index + 1).padStart(4, '0')}`,
      filename: file.name,
      title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || `Garment ${index + 1}`,
      storagePath: '', category: '', confidence: 0, note: '', price: '', status: 'uploading',
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
        form.set('file', chosen[index]);
        try {
          const response = await fetch('/api/maharaja/catalogue/import/analyze', { method: 'POST', body: form });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.success) throw new Error(data.error || 'Upload failed.');
          update(row.id, { storagePath: data.storagePath, category: data.category || '', confidence: Number(data.confidence) || 0, note: data.note || '', status: data.category ? 'ready' : 'review' });
        } catch (error) {
          update(row.id, { status: 'failed', note: error instanceof Error ? error.message : 'Upload failed.' });
        }
      }
    }));
    setBusy(false);
    setMessage('Analysis complete. Cross-check the category and title list, then submit. No catalogue item is public yet.');
  }

  async function retry(row: Row) {
    if (!row.storagePath) return;
    update(row.id, { status: 'uploading', note: 'Retrying Gemini analysis…' });
    try { await analyze(row); }
    catch (error) { update(row.id, { status: 'review', note: error instanceof Error ? error.message : 'Retry failed.' }); }
  }

  async function publish() {
    if (busy || publishing || !rows.length || rows.some((row) => !row.storagePath || !row.category || row.status === 'uploading' || row.status === 'failed')) {
      setMessage('Resolve failed uploads and choose a category for every garment before submitting.');
      return;
    }
    setPublishing(true);
    setMessage('Publishing reviewed garments in batches of 20…');
    const completed = new Set<string>();
    const errors: string[] = [];
    for (let start = 0; start < rows.length; start += 20) {
      const chunk = rows.slice(start, start + 20);
      try {
        const response = await fetch('/api/maharaja/catalogue/import/publish', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId, items: chunk.map((row) => ({ sku: row.sku, title: row.title, category: row.category, storagePath: row.storagePath, price: Number(row.price) || 0 })) }),
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
    await onPublished();
    setMessage(errors.length ? `${completed.size} published. ${errors.length} need retry: ${errors.slice(0, 3).join(' · ')}` : `${completed.size} garments published to the catalogue.`);
  }

  const unresolved = rows.filter((row) => !row.category || row.status === 'failed' || row.status === 'uploading').length;
  const counts = catalogueCategories.map((category) => ({ ...category, count: rows.filter((row) => row.category === category.id).length })).filter((item) => item.count);
  const visible = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return <div className="mt-5 space-y-4 border border-[#D8DCD7] bg-[#FAFBF8] p-4 text-[#161918]">
    <div><h3 className="font-serif text-xl font-semibold">Bulk garment import</h3><p className="text-sm text-[#535A56]">Select hundreds of product images at once. Gemini suggests categories; you approve the text list before any item appears on TV. Bulk items start as image try-on only, with no price displayed.</p></div>
    <div className="flex flex-wrap gap-3">
      <label className="cursor-pointer bg-[#161918] px-4 py-3 text-sm font-semibold text-white">Choose photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || publishing} onChange={(event) => void begin(event.target.files)} className="sr-only" /></label>
      <label className="cursor-pointer border border-[#161918] bg-white px-4 py-3 text-sm font-semibold">Choose folder<input type="file" accept="image/jpeg,image/png,image/webp" multiple {...({ webkitdirectory: '' } as object)} disabled={busy || publishing} onChange={(event) => void begin(event.target.files)} className="sr-only" /></label>
    </div>
    {rows.length > 0 && <>
      <div className="flex flex-wrap gap-2 text-xs">{counts.map((item) => <span key={item.id} className="border border-[#D8DCD7] bg-white px-2 py-1">{item.audience} · {item.label}: {item.count}</span>)}<span className="border border-[#7A1428] px-2 py-1">Needs review: {unresolved}</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead><tr className="border-b border-[#D8DCD7]"><th className="p-2">File / SKU</th><th className="p-2">Title</th><th className="p-2">AI category / move to</th><th className="p-2">Price for later live use</th><th className="p-2">Status</th></tr></thead><tbody>{visible.map((row) => <tr key={row.id} className="border-b border-[#D8DCD7]"><td className="max-w-44 p-2"><span className="block truncate" title={row.filename}>{row.filename}</span><span className="font-mono text-[10px] text-[#535A56]">{row.sku}</span></td><td className="p-2"><input aria-label={`Title for ${row.filename}`} value={row.title} onChange={(event) => update(row.id, { title: event.target.value })} className="w-full min-w-36 border border-[#D8DCD7] bg-white p-2" /></td><td className="p-2"><select aria-label={`Category for ${row.filename}`} value={row.category} onChange={(event) => update(row.id, { category: event.target.value as CatalogueCategoryId, status: 'ready' })} className="w-full min-w-40 border border-[#D8DCD7] bg-white p-2"><option value="">Choose category</option>{catalogueCategories.map((item) => <option key={item.id} value={item.id}>{item.audience} · {item.label}</option>)}</select>{row.storagePath && <button type="button" onClick={() => void retry(row)} className="mt-1 text-[#7A1428] underline">Retry AI analysis</button>}</td><td className="p-2"><input aria-label={`Price for ${row.filename}`} type="number" min="0" value={row.price} onChange={(event) => update(row.id, { price: event.target.value })} placeholder="Optional" className="w-24 border border-[#D8DCD7] bg-white p-2" /></td><td className="max-w-48 p-2"><span className="font-semibold">{row.status}</span>{row.note && <span className="block text-[#535A56]" title={row.note}>{row.note}</span>}<button type="button" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} className="mt-1 text-[#7A1428] underline">Remove</button></td></tr>)}</tbody></table></div>
      <div className="flex items-center justify-between text-sm"><button type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)} className="disabled:opacity-40">← Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(rows.length / PAGE_SIZE))}</span><button type="button" disabled={(page + 1) * PAGE_SIZE >= rows.length} onClick={() => setPage((value) => value + 1)} className="disabled:opacity-40">Next →</button></div>
      <button type="button" disabled={busy || publishing || unresolved > 0} onClick={() => void publish()} className="min-h-12 bg-[#7A1428] px-6 py-3 text-sm font-bold text-white disabled:opacity-45">{publishing ? 'Publishing…' : `Cross-checked · Submit ${rows.length} garments`}</button>
    </>}
    {message && <p role="status" className="text-sm text-[#535A56]">{message}</p>}
  </div>;
}
