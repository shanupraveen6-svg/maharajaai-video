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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-[#535A56]">
          {label} <span className="text-[#8A918D]">· {hint}</span>
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
            className="min-h-10 w-28 border border-[#D8DCD7] bg-white px-2 text-right font-mono font-bold text-[#7A1428] outline-none focus:border-[#7A1428] disabled:bg-[#F4F5F2]"
          />
          <button
            type="button"
            disabled={disabled || locked || amount === value}
            onClick={() => void save()}
            className="min-h-10 bg-[#161918] px-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
      {locked && (
        <p className="flex items-center justify-end gap-1 text-xs text-[#535A56]">
          <Lock className="h-3 w-3" />
          Locked until {new Date(lockedUntil!).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      )}
    </div>
  );
}
