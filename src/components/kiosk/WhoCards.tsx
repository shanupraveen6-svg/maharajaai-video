'use client';

import { ChevronRight } from 'lucide-react';
import { Figure } from '@/components/AudienceCards';

/** Image Try-On and Live Try-On start with three groups; Kids then picks Boys or Girls under the camera. */
export type WhoGroup = 'women' | 'men' | 'kids';

export type WhoLabels = { women: string; men: string; kids: string; adultAge: string; kidsAge: string };
const ENGLISH: WhoLabels = { women: 'Women', men: 'Men', kids: 'Kids', adultAge: '13 and above', kidsAge: 'Up to 12' };

/**
 * Who is it for, as three cards stacked vertically (3 × 1): Women, Men, Kids, each with its figure and age
 * line. Nothing is selected until the customer taps one. AI Video keeps the four-card AudienceCards.
 */
export default function WhoCards({ value, onChange, size = 'lg', labels = ENGLISH }: { value: WhoGroup | null; onChange: (group: WhoGroup) => void; size?: 'md' | 'lg'; labels?: WhoLabels }) {
  const lg = size === 'lg';
  const CARDS: Array<{ id: WhoGroup; label: string; age: string }> = [
    { id: 'women', label: labels.women, age: labels.adultAge },
    { id: 'men', label: labels.men, age: labels.adultAge },
    { id: 'kids', label: labels.kids, age: labels.kidsAge },
  ];
  return (
    <div role="group" aria-label="Who is it for" className={`grid grid-cols-1 ${lg ? 'gap-5' : 'gap-3'}`}>
      {CARDS.map((card) => {
        const selected = value === card.id;
        return (
          <button
            key={card.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(card.id)}
            className={`group flex items-center gap-5 overflow-hidden rounded-3xl border bg-white text-left transition hover:border-ink ${selected ? 'border-ink ring-2 ring-ink' : 'border-line'} ${lg ? 'p-5' : 'p-3'}`}
          >
            <span className={`flex shrink-0 items-center justify-center rounded-2xl bg-brand-soft ${lg ? 'h-40 w-40' : 'h-24 w-24'}`}>
              {card.id === 'kids' ? (
                <span className="flex items-end">
                  <Figure audience="boys" className={lg ? 'h-28' : 'h-16'} />
                  <Figure audience="girls" className={`${lg ? 'h-28' : 'h-16'} -ml-6`} />
                </span>
              ) : (
                <Figure audience={card.id} className={`${lg ? 'h-36' : 'h-20'} transition group-hover:-translate-y-0.5`} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block font-bold text-ink ${lg ? 'text-4xl' : 'text-xl'}`}>{card.label}</span>
              <span className={`mt-1 block text-muted ${lg ? 'text-xl' : 'text-sm'}`}>{card.age}</span>
            </span>
            <ChevronRight className={`shrink-0 text-ink transition group-hover:translate-x-1 ${lg ? 'h-10 w-10' : 'h-6 w-6'}`} />
          </button>
        );
      })}
    </div>
  );
}

/** Kids only: Boys or Girls, under the camera. Nothing is picked until the customer taps one. */
export function KidsSwitch({ value, onChange, disabled, size = 'lg', labels = { boys: 'Boys', girls: 'Girls' } }: { value: 'boys' | 'girls' | null; onChange: (value: 'boys' | 'girls') => void; disabled?: boolean; size?: 'md' | 'lg'; labels?: { boys: string; girls: string } }) {
  return (
    <div role="group" aria-label="Boys or girls" className="grid grid-cols-2 gap-3 rounded-2xl bg-line/60 p-1.5">
      {(['boys', 'girls'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          disabled={disabled}
          onClick={() => onChange(option)}
          className={`rounded-xl font-bold transition disabled:opacity-50 ${size === 'lg' ? 'min-h-16 text-2xl' : 'min-h-11 text-base'} ${value === option ? 'bg-white text-ink shadow' : 'text-muted hover:text-ink'}`}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );
}
