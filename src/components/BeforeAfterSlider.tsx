'use client';

import { useState } from 'react';

export default function BeforeAfterSlider({ before, after }: { before: string; after: string }) {
  const [position, setPosition] = useState(50);

  return (
    <section aria-label="Compare your current photo with your AI Try-On" className="mt-4 text-left">
      <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase text-[#F3E5AB]">
        <span>Current look</span><span>AI Try-On</span>
      </div>
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-black">
        <img src={before} alt="Current customer photo" className="absolute inset-0 h-full w-full object-contain" />
        <img
          src={after}
          alt="AI Try-On result"
          className="absolute inset-0 h-full w-full object-contain"
          style={{ clipPath: `inset(0 0 0 ${position}%)` }}
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_6px_#000]" style={{ left: `${position}%` }}>
          <span className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[#6E0D1F] text-sm text-white shadow-lg">↔</span>
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
