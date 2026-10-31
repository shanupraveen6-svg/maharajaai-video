'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

/**
 * Shared building blocks for every TryFocus surface. They keep one type scale, one colour set and
 * one way of showing progress, choices and the next action, whether the screen is a TV, a tablet,
 * a phone or the admin.
 */

export function StepProgress({ steps, current, onSelect, size = 'md' }: {
  steps: string[];
  current: number;
  onSelect?: (index: number) => void;
  size?: 'md' | 'lg';
}) {
  return (
    <ol className={`flex items-center gap-2 ${size === 'lg' ? 'text-lg' : 'text-sm'}`} aria-label="Progress">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        const clickable = Boolean(onSelect) && done;
        return (
          <li key={label} className="flex min-w-0 items-center gap-2">
            {index > 0 && <span className={`h-px w-6 shrink-0 ${done || active ? 'bg-brand' : 'bg-line-strong'}`} aria-hidden="true" />}
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onSelect?.(index)}
              aria-current={active ? 'step' : undefined}
              className={`flex min-w-0 items-center gap-2 rounded-full font-semibold disabled:cursor-default ${active ? 'text-ink' : done ? 'text-brand' : 'text-subtle'}`}
            >
              <span className={`flex shrink-0 items-center justify-center rounded-full ${size === 'lg' ? 'h-9 w-9 text-base' : 'h-7 w-7 text-xs'} ${active ? 'bg-brand text-white' : done ? 'bg-brand-soft text-brand' : 'bg-line text-muted'}`}>
                {done ? <Check className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} /> : index + 1}
              </span>
              <span className="truncate">{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function Segmented<T extends string>({ options, value, onChange, size = 'md', label }: {
  options: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}) {
  const height = size === 'lg' ? 'min-h-16 text-lg' : size === 'sm' ? 'min-h-10 text-sm' : 'min-h-12 text-[15px]';
  return (
    <div role="group" aria-label={label} className="grid gap-1 rounded-2xl bg-line/70 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`flex min-w-0 items-center justify-center gap-2 rounded-xl px-3 font-semibold transition ${height} ${value === option.value ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function PageTitle({ title, subtitle, size = 'md', action }: { title: ReactNode; subtitle?: ReactNode; size?: 'md' | 'lg'; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className={`font-bold text-ink ${size === 'lg' ? 'text-4xl' : 'text-2xl'}`}>{title}</h2>
        {subtitle && <p className={`mt-1.5 text-muted ${size === 'lg' ? 'text-xl' : 'text-[15px]'}`}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionCard({ title, description, action, children, className = '' }: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`tf-card p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-bold text-ink">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatusPill({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'warn' | 'danger' | 'brand'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-line text-muted',
    success: 'bg-success-soft text-success',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
    brand: 'bg-brand-soft text-brand',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

/** Keeps the step's main action pinned to the bottom of the screen on phone and tablet. */
export function ActionBar({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="tf-action-bar">
      {note && <p className="mb-2 text-center text-sm text-muted">{note}</p>}
      <div className="flex gap-3 [&>*]:flex-1">{children}</div>
    </div>
  );
}
