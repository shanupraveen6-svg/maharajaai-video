'use client';

import type { ReactNode } from 'react';
import type { TryFocusProduct } from '@/lib/tryfocus/sample-data';

/**
 * Under the camera on the TV, shared by Image Try-On and Live Try-On: category tabs (an underlined text row,
 * only categories with garments) and the garments as one row of picture cards that scrolls sideways.
 * Image Try-On picks up to 3 (numbered 1–3); Live Try-On picks one (ringed).
 */
export default function GarmentRail({
  tabs,
  activeTab,
  onTab,
  items,
  selected,
  max,
  onToggle,
  disabled = false,
  leading,
  empty = 'No outfits here yet. Ask our staff.',
}: {
  tabs: Array<{ id: string; label: string }>;
  activeTab: string | undefined;
  onTab: (id: string) => void;
  items: TryFocusProduct[];
  /** SKUs picked, in the order they were tapped. */
  selected: string[];
  max: number;
  onToggle: (item: TryFocusProduct) => void;
  disabled?: boolean;
  /** A card before the garments (My own outfit). */
  leading?: ReactNode;
  empty?: string;
}) {
  return (
    <div className="space-y-4">
      <div role="group" aria-label="Category" className="flex gap-x-2 overflow-x-auto border-b border-line">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={activeTab === tab.id}
            disabled={disabled}
            onClick={() => onTab(tab.id)}
            className={`-mb-px min-h-16 shrink-0 whitespace-nowrap border-b-[3px] px-4 text-xl font-semibold disabled:opacity-50 ${activeTab === tab.id ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex snap-x gap-4 overflow-x-auto pb-3">
        {leading}
        {items.map((item) => {
          const index = selected.indexOf(item.sku);
          const picked = index >= 0;
          const full = !picked && max > 1 && selected.length >= max;
          return (
            <button
              key={item.sku}
              type="button"
              aria-pressed={picked}
              aria-label={`${picked ? 'Remove' : 'Select'} ${item.title}`}
              disabled={disabled || full}
              onClick={() => onToggle(item)}
              className={`relative w-48 shrink-0 snap-start overflow-hidden rounded-2xl border bg-white text-left transition disabled:opacity-40 ${picked ? 'border-ink ring-[3px] ring-ink' : 'border-line hover:border-line-strong'}`}
            >
              <span className="block aspect-[3/4] w-full bg-canvas">
                <img src={item.thumbnailUrl || item.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain" />
              </span>
              {max > 1 && (
                <span className={`absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold shadow ${picked ? 'bg-ink text-white' : 'bg-white/90 text-ink'}`}>
                  {picked ? index + 1 : '+'}
                </span>
              )}
              <span className="line-clamp-2 block p-3 text-base font-semibold leading-snug text-ink">{item.title}</span>
            </button>
          );
        })}
        {!items.length && !leading && <p className="p-4 text-xl text-muted">{empty}</p>}
      </div>
    </div>
  );
}
