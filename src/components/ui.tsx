'use client';

import type { ReactNode } from 'react';

/**
 * Shared building blocks for every TryFocus surface. They keep one type scale, one colour set and
 * one way of showing choices and the next action, whether the screen is a TV, a tablet,
 * a phone or the admin.
 */

export function NavTabs<T extends string>({ options, value, onChange, label, size = 'md', wrap = false }: {
  options: Array<{ value: T; label: ReactNode }>;
  /** null until the person picks one: nothing is pre-selected for them. */
  value: T | null;
  onChange: (value: T) => void;
  label: string;
  size?: 'md' | 'lg';
  /** Admin and workspace screens wrap the tabs onto a second line instead of scrolling sideways. */
  wrap?: boolean;
}) {
  return (
    <nav aria-label={label} className={`flex gap-2 ${wrap ? 'flex-wrap' : 'overflow-x-auto [scrollbar-width:none]'}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-current={value === option.value ? 'page' : undefined}
          onClick={() => onChange(option.value)}
          className={`flex shrink-0 items-center gap-2 rounded-xl border-2 font-semibold transition ${size === 'lg' ? 'min-h-16 px-5 text-xl' : 'min-h-11 px-4 text-[15px]'} ${value === option.value ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white text-ink hover:border-ink'}`}
        >
          {option.label}
        </button>
      ))}
    </nav>
  );
}

export function Segmented<T extends string>({ options, value, onChange, size = 'md', label }: {
  options: Array<{ value: T; label: ReactNode }>;
  /** null until the person picks one: nothing is pre-selected for them. */
  value: T | null;
  onChange: (value: T) => void;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}) {
  const height = size === 'lg' ? 'min-h-16 text-lg' : size === 'sm' ? 'min-h-10 text-sm' : 'min-h-12 text-[15px]';
  return (
    <div role="group" aria-label={label} className="grid gap-1.5 rounded-2xl border border-line-strong bg-white p-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`flex min-w-0 items-center justify-center gap-2 rounded-xl px-3 font-semibold transition ${height} ${value === option.value ? 'bg-ink text-white shadow-sm' : 'bg-canvas text-ink hover:bg-line'}`}
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
        <h2 className={`font-bold leading-tight text-ink ${size === 'lg' ? 'text-[44px]' : 'text-2xl'}`}>{title}</h2>
        {subtitle && <p className={`text-ink/75 ${size === 'lg' ? 'mt-2 text-2xl' : 'mt-1.5 text-[15px]'}`}>{subtitle}</p>}
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

/**
 * A yes/agree choice on customer screens, as one large solid button (never a checkbox): white with a dark
 * outline and an empty circle until tapped, then filled ink with a tick. `size` follows the surface.
 */
export function AgreeButton({ checked, onChange, children, size = 'lg', tone = 'ink' }: { checked: boolean; onChange: (next: boolean) => void; children: ReactNode; size?: 'md' | 'lg'; tone?: 'ink' | 'light' }) {
  const lg = size === 'lg';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center gap-4 rounded-2xl border-2 text-left font-semibold shadow-sm transition ${lg ? 'min-h-20 p-5 text-xl' : 'min-h-14 p-3.5 text-[15px]'} ${checked ? 'border-ink bg-ink text-white' : tone === 'light' ? 'border-white bg-white text-ink' : 'border-ink bg-white text-ink'}`}
    >
      <span className={`flex shrink-0 items-center justify-center rounded-full border-2 ${lg ? 'h-10 w-10' : 'h-7 w-7'} ${checked ? 'border-white bg-white text-ink' : 'border-ink bg-white'}`}>
        {checked && <svg viewBox="0 0 24 24" className={lg ? 'h-6 w-6' : 'h-4 w-4'} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>}
      </span>
      <span className="min-w-0">{children}</span>
    </button>
  );
}

/** An on/off switch (selected = ink). `label` is read out; `children` is shown beside it. */
export function Switch({ checked, onChange, label, disabled, children }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean; children?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className="inline-flex min-h-10 items-center gap-2.5 text-sm font-semibold text-ink disabled:opacity-50">
      <span className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${checked ? 'bg-ink' : 'bg-line-strong'}`}>
        <span className={`absolute h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-6' : 'left-1'}`} />
      </span>
      {children}
    </button>
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
