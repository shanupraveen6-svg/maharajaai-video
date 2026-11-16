'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react';

type Check = { id: string; name: string; ok: boolean; ms: number; note: string };

/**
 * TryFocus admin home: the live server's own check of everything a customer's look depends on. Runs when the
 * page opens; anything not working (fal out of balance, GenLook low, a key refused) shows in red at the top.
 */
export default function LiveCheckCard() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const runCheck = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await (await fetch('/api/admin/live-check', { cache: 'no-store' })).json();
      if (!data?.success) throw new Error(data?.error || 'The live check could not run.');
      setChecks(data.checks);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The live check could not run.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void runCheck(); }, [runCheck]);

  const failing = (checks || []).filter((check) => !check.ok);
  return (
    <section className={`tf-card p-5 ${failing.length ? 'border-2 border-danger' : ''}`} aria-label="Live check">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold">
            {busy && !checks ? <LoaderCircle className="h-5 w-5 animate-spin" /> : failing.length ? <TriangleAlert className="h-5 w-5 text-danger" /> : <Check className="h-5 w-5 text-success" />}
            {busy && !checks ? 'Checking the live site…' : failing.length ? `${failing.length} ${failing.length === 1 ? 'service needs' : 'services need'} attention` : 'Everything a look needs is working'}
          </h2>
          <p className="mt-1 text-sm text-muted">The live server checks the database, storage, a garment photo, Gemini, GenLook and fal.</p>
        </div>
        <button type="button" onClick={() => void runCheck()} disabled={busy} className="tf-btn tf-btn-secondary !min-h-10 shrink-0 px-4 text-sm">
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check again
        </button>
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger">{error}</p>}
      {checks && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {checks.map((check) => (
            <li key={check.id} className={`flex items-start gap-2 rounded-xl p-3 text-sm ${check.ok ? 'bg-canvas' : 'bg-danger-soft'}`}>
              {check.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
              <span className="min-w-0">
                <span className="font-semibold">{check.name}</span>
                <span className={`block ${check.ok ? 'text-muted' : 'font-semibold text-danger'}`}>{check.note} · {check.ms} ms</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
