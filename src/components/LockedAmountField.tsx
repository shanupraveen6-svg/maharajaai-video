'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';

/**
 * A rupee amount the client sets for their store. Saving asks for confirmation because the
 * amount then stays fixed for 3 days.
 */
export default function LockedAmountField({
  id,
  label,
  hint,
  value,
  lockedUntil,
  disabled,
  onSave,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  lockedUntil?: number;
  disabled?: boolean;
  onSave: (value: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState(String(value));
  const locked = Boolean(lockedUntil && lockedUntil > Date.now());
  const amount = Math.max(0, Math.round(Number(draft) || 0));

  async function save() {
    if (amount === value) return;
    const text = amount === 0 ? hint : `₹${amount.toLocaleString('en-IN')}`;
    if (!window.confirm(`Save ${label}: ${text}?\n\nYou cannot change it again for 3 days.`)) return;
    await onSave(amount);
  }

  return (
    <div className="space-y-1">
      <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto]">
        <label htmlFor={id} className="min-w-0">
          <span className="block text-sm font-semibold text-ink">{label}</span>
          <span className="block text-sm text-muted">{hint}</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="number"
            min={0}
            step={100}
            inputMode="numeric"
            disabled={disabled || locked}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-11 w-32 rounded-xl border border-line-strong bg-white px-3 text-right tabular-nums font-bold text-ink outline-none focus:border-ink disabled:bg-canvas"
          />
          <button
            type="button"
            disabled={disabled || locked || amount === value}
            onClick={() => void save()}
            className="min-h-11 rounded-xl bg-ink px-4 text-sm font-bold text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
      {locked && (
        <p className="flex items-center justify-end gap-1 text-xs text-muted">
          <Lock className="h-3 w-3" />
          Locked until {new Date(lockedUntil!).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      )}
    </div>
  );
}
