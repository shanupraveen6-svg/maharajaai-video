'use client';

import type { CatalogueAudience } from '@/lib/tryfocus/sample-data';

type Size = 'md' | 'lg';

/**
 * Who is it for: four illustrated cards in a 2 x 2 grid (phone, tablet and TV). Nothing is selected until
 * the customer taps one. The illustrations are simple figures in the brand colours, drawn on 120 x 140.
 */
export default function AudienceCards({ value, onChange, labels, size = 'md', unavailable = [], unavailableLabel = 'Coming soon' }: {
  value: CatalogueAudience | null;
  onChange: (audience: CatalogueAudience) => void;
  labels: Record<CatalogueAudience, string>;
  size?: Size;
  /** Audiences with nothing to offer here yet (no AI Video pieces, say): shown, dimmed, and not tappable. */
  unavailable?: CatalogueAudience[];
  unavailableLabel?: string;
}) {
  const order: CatalogueAudience[] = ['women', 'men', 'boys', 'girls'];
  return (
    <div role="group" aria-label="Who is it for" className={`grid grid-cols-2 ${size === 'lg' ? 'gap-5' : 'gap-3'}`}>
      {order.map((audience) => {
        const selected = value === audience;
        const off = unavailable.includes(audience);
        return (
          <button
            key={audience}
            type="button"
            aria-pressed={selected}
            disabled={off}
            onClick={() => onChange(audience)}
            className={`group relative flex flex-col items-center overflow-hidden rounded-3xl border bg-white text-center transition ${off ? 'cursor-not-allowed opacity-50' : 'hover:border-ink'} ${selected ? 'border-ink ring-2 ring-ink' : 'border-line'} ${size === 'lg' ? 'p-6' : 'p-4'}`}
          >
            {off && <span className={`absolute right-3 top-3 z-10 rounded-full bg-ink px-3 py-1 font-semibold text-white ${size === 'lg' ? 'text-base' : 'text-xs'}`}>{unavailableLabel}</span>}
            <span className={`flex w-full items-center justify-center rounded-2xl bg-brand-soft ${size === 'lg' ? 'h-56' : 'h-28'}`}>
              <Figure audience={audience} className={`${size === 'lg' ? 'h-48' : 'h-24'} transition group-hover:-translate-y-0.5`} />
            </span>
            <span className={`mt-3 font-bold text-ink ${size === 'lg' ? 'text-3xl' : 'text-lg'}`}>{labels[audience]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Two short lines on how to take the photo, in a box under the cards. */
export function PhotoGuide({ lines, size = 'md' }: { lines: [string, string]; size?: Size }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border border-line bg-white ${size === 'lg' ? 'p-6' : 'p-4'}`}>
      <svg viewBox="0 0 48 48" className={`${size === 'lg' ? 'h-14 w-14' : 'h-10 w-10'} shrink-0`} aria-hidden="true">
        <rect x="6" y="12" width="36" height="26" rx="5" fill="none" stroke="var(--color-brand, #7A1428)" strokeWidth="2.5" />
        <path d="M17 12 L20 7 H28 L31 12" fill="none" stroke="var(--color-brand, #7A1428)" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="24" cy="25" r="7" fill="none" stroke="var(--color-brand, #7A1428)" strokeWidth="2.5" />
      </svg>
      <div className={size === 'lg' ? 'text-xl' : 'text-[15px]'}>
        <p className="font-semibold text-ink">{lines[0]}</p>
        <p className="mt-1 text-muted">{lines[1]}</p>
      </div>
    </div>
  );
}

const INK = 'var(--color-ink, #161918)';
const BRAND = 'var(--color-brand, #7A1428)';
const SKIN = '#E7B98F';
const HAIR = '#2B1D17';

function Figure({ audience, className }: { audience: CatalogueAudience; className?: string }) {
  const common = { viewBox: '0 0 120 140', className, 'aria-hidden': true as const };
  if (audience === 'women') {
    // Saree with pallu over the shoulder, hair in a bun.
    return (
      <svg {...common}>
        <circle cx="66" cy="18" r="8" fill={HAIR} />
        <circle cx="60" cy="26" r="11" fill={SKIN} />
        <path d="M49 24 Q50 12 60 12 Q71 12 71 24 Q66 18 60 18 Q53 18 49 24 Z" fill={HAIR} />
        <path d="M46 46 Q60 38 74 46 L78 72 L42 72 Z" fill={BRAND} />
        <path d="M42 70 L78 70 L88 134 L32 134 Z" fill={BRAND} opacity="0.85" />
        <path d="M70 42 Q86 60 80 96 L72 96 Q76 64 64 48 Z" fill="#D4AF37" opacity="0.9" />
        <path d="M34 126 L86 126" stroke="#D4AF37" strokeWidth="4" />
        <path d="M46 48 L38 84" stroke={SKIN} strokeWidth="6" strokeLinecap="round" />
      </svg>
    );
  }
  if (audience === 'men') {
    // Shirt and pant.
    return (
      <svg {...common}>
        <circle cx="60" cy="24" r="12" fill={SKIN} />
        <path d="M48 20 Q49 9 60 9 Q72 9 72 20 Q66 14 60 14 Q54 14 48 20 Z" fill={HAIR} />
        <path d="M40 44 Q60 36 80 44 L84 84 L36 84 Z" fill={BRAND} />
        <path d="M60 40 L60 84" stroke="#fff" strokeWidth="1.5" opacity="0.7" />
        <path d="M40 46 L32 86 M80 46 L88 86" stroke={SKIN} strokeWidth="7" strokeLinecap="round" />
        <path d="M38 84 L82 84 L78 134 L63 134 L60 98 L57 134 L42 134 Z" fill={INK} />
      </svg>
    );
  }
  if (audience === 'boys') {
    // Kurta and pyjama, smaller figure.
    return (
      <svg {...common}>
        <circle cx="60" cy="40" r="11" fill={SKIN} />
        <path d="M49 37 Q50 27 60 27 Q71 27 71 37 Q65 32 60 32 Q55 32 49 37 Z" fill={HAIR} />
        <path d="M44 58 Q60 51 76 58 L80 104 L40 104 Z" fill={BRAND} />
        <path d="M44 60 L37 94 M76 60 L83 94" stroke={SKIN} strokeWidth="6" strokeLinecap="round" />
        <path d="M46 104 L74 104 L72 134 L62 134 L60 114 L58 134 L48 134 Z" fill="#E9E1D3" stroke={INK} strokeWidth="1.5" />
      </svg>
    );
  }
  // Girls: frock with two plaits.
  return (
    <svg {...common}>
      <path d="M48 40 Q44 58 47 64 M72 40 Q76 58 73 64" stroke={HAIR} strokeWidth="5" strokeLinecap="round" />
      <circle cx="60" cy="40" r="11" fill={SKIN} />
      <path d="M49 38 Q50 27 60 27 Q71 27 71 38 Q65 32 60 32 Q55 32 49 38 Z" fill={HAIR} />
      <path d="M48 56 Q60 50 72 56 L74 70 L46 70 Z" fill={BRAND} />
      <path d="M46 68 L74 68 L90 116 L30 116 Z" fill={BRAND} opacity="0.85" />
      <path d="M32 110 L88 110" stroke="#D4AF37" strokeWidth="4" />
      <path d="M48 58 L41 88 M72 58 L79 88" stroke={SKIN} strokeWidth="5" strokeLinecap="round" />
      <path d="M52 116 L52 134 M68 116 L68 134" stroke={SKIN} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
