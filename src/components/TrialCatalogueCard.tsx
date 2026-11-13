'use client';

import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { TrialPlan } from '@/lib/maharaja/trial-catalogue';

const NAMES = { women: 'Women', men: 'Men', boys: 'Boys', girls: 'Girls' } as const;

/** "Shirts 9 · Kurta 6" from a list of pieces, in the order the categories first appear. */
function byCategory(pieces: Array<{ categoryLabel: string }>) {
  const counts = new Map<string, number>();
  for (const piece of pieces) counts.set(piece.categoryLabel, (counts.get(piece.categoryLabel) || 0) + 1);
  return [...counts].map(([name, count]) => `${name} ${count}`).join(' · ');
}

/**
 * TryFocus admin → Plan → Catalogue setup: gets the store's Image Try-On, Live Try-On and AI Video ready for
 * all four audiences. For Maharaja it also adds the missing garments, moves misfiled photos and hides the
 * gift-box flat lays. Preview first (nothing written), then Apply.
 */
export default function TrialCatalogueCard({ clientId, onApplied }: { clientId: string; onApplied?: () => void }) {
  const [plan, setPlan] = useState<TrialPlan | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function preview() {
    setBusy('preview');
    setError('');
    setMessage('');
    try {
      const data = await (await fetch(`/api/admin/trial-catalogue?clientId=${encodeURIComponent(clientId)}`, { cache: 'no-store' })).json();
      if (!data?.success) throw new Error(data?.error || 'Could not read the catalogue.');
      setPlan(data.plan);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read the catalogue.');
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    setBusy('apply');
    setError('');
    try {
      const data = await (await fetch('/api/admin/trial-catalogue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId }) })).json();
      if (!data?.success) throw new Error(data?.error || 'Could not set up the catalogue.');
      setPlan(null);
      setMessage(`Done: ${data.added} garments added, ${data.moved} moved, ${data.hidden} hidden · ${data.live} on Live Try-On.`);
      onApplied?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not set up the catalogue.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="tf-card p-5">
      <h2 className="text-lg font-bold">Catalogue setup</h2>
      <p className="mt-1 text-sm text-muted">Gets Image Try-On and Live Try-On ready for Women, Men, Boys and Girls: garments in the right categories and Live Try-On on every non-ethnic category. AI Video keeps only the pieces uploaded to AI Video; Image Try-On garments are never put on it. Preview first; nothing changes until Apply.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={busy !== null} onClick={() => void preview()} className="tf-btn tf-btn-secondary !min-h-11 px-5 text-sm">
          {busy === 'preview' && <LoaderCircle className="h-4 w-4 animate-spin" />} {plan ? 'Preview again' : 'Preview'}
        </button>
        {plan && (
          <button type="button" disabled={busy !== null} onClick={() => void apply()} className="tf-btn tf-btn-primary !min-h-11 px-5 text-sm">
            {busy === 'apply' && <LoaderCircle className="h-4 w-4 animate-spin" />} Apply
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger">{error}</p>}
      {message && <p role="status" className="mt-3 rounded-xl bg-success-soft p-3 text-sm font-semibold text-success">{message}</p>}
      {plan && (
        <div className="mt-4 space-y-4 text-sm">
          <p className="text-muted">
            {plan.garments} garments after setup · {plan.add.length} added · {plan.moves.length} moved · {plan.hide.length} hidden · {plan.rename.length} renamed · {plan.liveOn.length} switched on and {plan.liveOff.length} off for Live Try-On · {plan.videoOff.length} Image Try-On garments taken off AI Video
          </p>
          {plan.audiences.map((row) => (
            <div key={row.audience} className="space-y-1 rounded-xl border border-line p-3">
              <p className="font-bold">{NAMES[row.audience]}</p>
              <p><span className="font-semibold">Image Try-On:</span> {row.tryOn.map((cat) => `${cat.label} ${cat.count}`).join(' · ') || <span className="text-danger">no garments</span>}</p>
              <p><span className="font-semibold">Live Try-On ({row.live.length}):</span> {byCategory(row.live) || <span className="text-danger">none</span>}</p>
              <p><span className="font-semibold">AI Video, uploaded pieces ({row.videoKept.length + row.videoAdded.length}):</span> {byCategory([...row.videoKept, ...row.videoAdded]) || <span className="text-danger">none</span>}</p>
            </div>
          ))}
          {plan.add.length > 0 && (
            <details className="rounded-xl border border-line p-3">
              <summary className="cursor-pointer font-bold">Garments added ({plan.add.length})</summary>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {plan.add.map((garment) => (
                  <li key={garment.sku} className="flex items-center gap-2">
                    <img src={garment.image} alt="" className="h-12 w-9 shrink-0 rounded bg-canvas object-cover" />
                    <span className="min-w-0">{NAMES[garment.gender]} · {garment.categoryLabel}: {garment.title}{garment.price > 0 ? ` · ₹${garment.price.toLocaleString('en-IN')}` : ''}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {(plan.moves.length > 0 || plan.hide.length > 0) && (
            <div className="rounded-xl border border-line p-3">
              {plan.moves.map((move) => <p key={move.sku}>Moved: {move.title} → {NAMES[move.gender]} · {move.to || 'left as is'}{move.newTitle ? ` (as ${move.newTitle})` : ''}</p>)}
              {plan.hide.map((item) => <p key={item.sku}>Hidden: {item.title} (gift box, two garments in one photo)</p>)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
