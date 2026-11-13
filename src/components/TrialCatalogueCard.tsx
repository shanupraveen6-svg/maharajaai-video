'use client';

import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { TrialPlan } from '@/lib/maharaja/trial-catalogue';

const NAMES = { women: 'Women', men: 'Men', boys: 'Boys', girls: 'Girls' } as const;

/**
 * TryFocus admin → Plan: fills Live Try-On and AI Video from the store's existing garments for a trial.
 * Preview first (nothing written), then Apply.
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
      if (!data?.success) throw new Error(data?.error || 'Could not prepare the catalogue.');
      setPlan(null);
      setMessage(`Done: ${data.live} garments on Live Try-On, ${data.videoAdded} added to AI Video${data.moved ? `, ${data.moved} moved to their own audience` : ''}.`);
      onApplied?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not prepare the catalogue.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="tf-card p-5">
      <h2 className="text-lg font-bold">Trial catalogue</h2>
      <p className="mt-1 text-sm text-muted">Fills Live Try-On (up to 8 western pieces per audience) and AI Video (up to 8 more premium pieces per audience, priced ₹3,000+) from the garments already uploaded. Preview first; nothing changes until Apply.</p>
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
          <p className="text-muted">{plan.garments} garments showing · {plan.liveOn.length} go on Live Try-On, {plan.liveOff.length} come off · {plan.videoOff.length} come off AI Video (no price or outside its categories)</p>
          {plan.audiences.map((row) => (
            <div key={row.audience} className="rounded-xl border border-line p-3">
              <p className="font-bold">{NAMES[row.audience]}</p>
              <p className="mt-1"><span className="font-semibold">Live Try-On ({row.live.length}):</span> {row.live.map((p) => `${p.title} (${p.categoryLabel})`).join(' · ') || <span className="text-muted">none: no western-cut garments uploaded</span>}</p>
              <p className="mt-1"><span className="font-semibold">AI Video:</span> {row.videoKept.length} already priced{row.videoAdded.length ? ` + ${row.videoAdded.length} new: ` : ''}{row.videoAdded.map((p) => `${p.title} (${p.categoryLabel}) ₹${p.price.toLocaleString('en-IN')}`).join(' · ')}</p>
              <p className="mt-1 text-muted">AI Video categories: {row.videoCategories.map((cat) => cat.label).join(', ') || 'none'}</p>
            </div>
          ))}
          {plan.moves.length > 0 && (
            <div className="rounded-xl border border-line p-3">
              <p className="font-bold">Moved to their own audience</p>
              {plan.moves.map((move) => <p key={move.sku} className="mt-1">{move.title} ({NAMES[move.gender]}): {move.from} → {move.to || 'no matching category, left as is'}</p>)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
