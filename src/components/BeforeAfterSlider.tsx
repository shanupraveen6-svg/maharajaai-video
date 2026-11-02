'use client';

import { useState } from 'react';

type BeforeAfterSliderProps = {
  before?: string;
  after?: string;
  beforeImage?: string;
  afterImage?: string;
  beforeLabel?: string;
  afterLabel?: string;
  /** Sizing for the comparison frame; defaults to a 3:4 frame filling the width. */
  frameClassName?: string;
  /** Light labels for dark backgrounds such as the TV result screen. */
  dark?: boolean;
  /** 'cover' fills the frame edge to edge (landing page); 'contain' shows the whole photo (default). */
  fit?: 'contain' | 'cover';
  /** Labels sit on the image instead of above it, so the frame has no strip around it. */
  labelsInside?: boolean;
  className?: string;
};

export default function BeforeAfterSlider({
  before,
  after,
  beforeImage,
  afterImage,
  beforeLabel = 'Current look',
  afterLabel = 'AI Try-On',
  frameClassName = 'aspect-[3/4] w-full',
  dark = false,
  fit = 'contain',
  labelsInside = false,
  className = 'mt-2',
}: BeforeAfterSliderProps) {
  const objectFit = fit === 'cover' ? 'object-cover object-top' : 'object-contain';
  const [position, setPosition] = useState(50);
  const resolvedBefore = before || beforeImage || '';
  const resolvedAfter = after || afterImage || '';

  return (
    <section aria-label="Compare your current photo with your AI Try-On" className={`text-left ${className}`}>
      {!labelsInside && (
        <div className={`mb-2 flex items-center justify-between text-xs font-bold ${dark ? 'text-white': 'text-ink'}`}>
          <span>{beforeLabel}</span>
          <span className={dark ? 'text-[#EDC26C]' : 'text-[#7A1428]'}>{afterLabel}</span>
        </div>
      )}
      <div className={`relative overflow-hidden bg-ink ${labelsInside ? '' : 'border border-line'} ${frameClassName}`}>
        <img
          src={resolvedBefore}
          alt={beforeLabel}
          className={`absolute inset-0 h-full w-full ${objectFit}`}
        />
        <img
          src={resolvedAfter}
          alt={afterLabel}
          className={`absolute inset-0 h-full w-full ${objectFit}`}
          style={{ clipPath: `inset(0 0 0 ${position}%)` }}
        />
        {labelsInside && (
          <>
            <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/65 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">{beforeLabel}</span>
            <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-[#7A1428] backdrop-blur-sm">{afterLabel}</span>
          </>
        )}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_6px_#000]"
          style={{ left: `${position}%` }}
        >
          <span className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-brand text-sm text-white shadow-lg">
            ↔
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
          aria-label="Move comparison line between current look and AI Try-On"
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
    </section>
  );
}
