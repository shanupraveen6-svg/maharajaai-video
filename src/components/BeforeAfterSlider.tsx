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
}: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50);
  const resolvedBefore = before || beforeImage || '';
  const resolvedAfter = after || afterImage || '';

  return (
    <section aria-label="Compare your current photo with your AI Try-On" className="mt-2 text-left">
      <div className={`mb-2 flex items-center justify-between font-mono text-[11px] font-bold uppercase tracking-[0.14em] ${dark ? 'text-white' : 'text-[#161918]'}`}>
        <span>{beforeLabel}</span>
        <span className={dark ? 'text-[#EDC26C]' : 'text-[#7A1428]'}>{afterLabel}</span>
      </div>
      <div className={`relative overflow-hidden border border-[#D8DCD7] bg-[#161918] ${frameClassName}`}>
        <img
          src={resolvedBefore}
          alt={beforeLabel}
          className="absolute inset-0 h-full w-full object-contain"
        />
        <img
          src={resolvedAfter}
          alt={afterLabel}
          className="absolute inset-0 h-full w-full object-contain"
          style={{ clipPath: `inset(0 0 0 ${position}%)` }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_6px_#000]"
          style={{ left: `${position}%` }}
        >
          <span className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[#7A1428] text-sm text-white shadow-lg">
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
