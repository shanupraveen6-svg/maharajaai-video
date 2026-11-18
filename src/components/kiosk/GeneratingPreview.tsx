'use client';

import { useEffect, useState } from 'react';
import { Shirt } from 'lucide-react';

export type GeneratingItem = {
  key: string;
  image?: string;
  title: string;
  state?: 'generating' | 'ready' | 'failed';
};

/**
 * The wait while looks (or an AI Video portrait) are made, on the 43-inch TV. One design for every case:
 * - The customer's own photo fills the screen behind everything (softly blurred, a light sweep over it), so
 *   the screen is always full, whatever the number of outfits.
 * - One title and a progress bar that moves steadily, eases near the end and never goes back.
 * - The outfits in one strip at the bottom, each shown whole (never cropped), equal widths: 1 outfit is one
 *   centred card, 2–5 share the width. No empty boxes at any count.
 * Edge cases: a failed outfit says "Not created" while the others carry on; a missing garment image shows an
 * icon; long names are cut to one line; after 25 s the title adds "Almost there"; with no customer photo a
 * plain dark backdrop is used; reduced motion stops the sweep (global rule). The first finished look opens
 * the result straight away, and the screen that called this decides what happens if all fail.
 */
export default function GeneratingPreview({ personPhoto, items, title, expectedSeconds = 14 }: {
  personPhoto?: string;
  items: GeneratingItem[];
  title: string;
  /** Typical time for this job; the bar reaches about 80 % by then and keeps easing after. */
  expectedSeconds?: number;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    return () => window.clearInterval(timer);
  }, []);
  const progress = 94 * (1 - Math.exp(-elapsed / (expectedSeconds * 0.62)));
  const slow = elapsed > 25;
  const many = items.length > 1;
  const failed = items.filter((item) => item.state === 'failed').length;

  return (
    <section className="tv-result-screen relative flex w-full flex-col overflow-hidden bg-ink" aria-live="polite" aria-busy="true">
      {/* The customer's photo, full screen behind everything. */}
      {personPhoto && (
        <img src={personPhoto} alt="" className="pointer-events-none absolute inset-0 h-full w-full scale-105 object-cover object-top blur-[6px] brightness-[.62]" />
      )}
      <div className="tv-gen-sweep pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-white/15 to-transparent" />

      {/* Title and progress, top, readable from 2 m. */}
      <div className="relative z-10 flex flex-col items-center gap-5 bg-gradient-to-b from-black/60 to-transparent px-10 pb-16 pt-12 text-center text-white">
        <h2 className="text-[52px] font-bold leading-tight drop-shadow">{title}</h2>
        <div className="h-3 w-full max-w-xl overflow-hidden rounded-full bg-white/25" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
          <div className="h-full rounded-full bg-white transition-[width] duration-300 ease-linear" style={{ width: `${progress}%` }} />
        </div>
        {(slow || failed > 0) && (
          <p className="text-2xl font-semibold text-white/90">
            {failed > 0 && many ? `${failed} not created · the others are on the way` : 'Almost there'}
          </p>
        )}
      </div>

      <div className="flex-1" />

      {/* The outfits, whole, in one strip. */}
      <div className="relative z-10 flex justify-center gap-4 bg-gradient-to-t from-black/70 to-transparent px-6 pb-8 pt-16">
        {items.map((item, index) => (
          <figure
            key={item.key}
            className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            style={{ width: many ? `min(240px, calc((100% - ${(items.length - 1) * 16}px) / ${items.length}))` : '280px' }}
          >
            <span className="relative block aspect-[3/4] w-full bg-canvas">
              {item.image
                ? <img src={item.image} alt="" className={`h-full w-full object-contain p-2 transition ${item.state === 'failed' ? 'opacity-40 grayscale' : ''}`} />
                : <span className="flex h-full w-full items-center justify-center text-muted"><Shirt className="h-16 w-16" strokeWidth={1.4} /></span>}
              {item.state !== 'failed' && item.state !== 'ready' && (
                <span className="tv-gen-sweep pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-white/50 to-transparent" />
              )}
              {many && (
                <span className="absolute left-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-ink text-base font-bold text-white shadow">{index + 1}</span>
              )}
              {item.state === 'failed' && (
                <span className="absolute inset-x-2 bottom-2 rounded-full bg-danger px-3 py-1.5 text-center text-sm font-bold text-white">Not created</span>
              )}
              {item.state === 'ready' && (
                <span className="absolute inset-x-2 bottom-2 rounded-full bg-success px-3 py-1.5 text-center text-sm font-bold text-white">Ready</span>
              )}
            </span>
            <figcaption className="truncate px-3 py-2 text-base font-semibold text-ink">{item.title}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
