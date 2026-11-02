'use client';

import { useEffect, useState } from 'react';

/** Simple outfit outlines, one per popular garment, drawn on a 64 x 64 grid. */
const OUTFITS: Array<{ name: string; path: string }> = [
  { name: 'Shirt', path: 'M24 8 L32 14 L40 8 L52 14 L58 26 L50 30 L48 24 L48 56 L16 56 L16 24 L14 30 L6 26 L12 14 Z M32 14 L32 56 M28 22 L31 22 M28 32 L31 32 M28 42 L31 42' },
  { name: 'T-shirt', path: 'M22 8 Q32 16 42 8 L56 16 L50 28 L44 25 L44 56 L20 56 L20 25 L14 28 L8 16 Z' },
  { name: 'Kurta', path: 'M26 6 L32 12 L38 6 L48 10 L54 30 L47 32 L45 22 L47 60 L17 60 L19 22 L17 32 L10 30 L16 10 Z M32 12 L32 30' },
  { name: 'Saree', path: 'M22 6 Q32 12 40 6 L44 22 L54 58 L14 58 L22 22 Z M40 6 Q50 18 46 34 M24 40 L44 40 M20 50 L50 50' },
  { name: 'Lehenga', path: 'M24 6 L40 6 L42 20 L22 20 Z M22 22 L42 22 L58 58 L6 58 Z M14 50 L50 50 M32 22 L32 58' },
  { name: 'Frock', path: 'M24 6 L30 10 L34 10 L40 6 L44 12 L40 24 L54 56 L10 56 L24 24 L20 12 Z M24 24 L40 24' },
];

const LINES = ['Picking the fabric…', 'Matching the colours…', 'Fitting it on you…', 'Getting the drape right…', 'Adding the final touches…'];

/**
 * The wait while a look or a video is being made: outfits take turns with a gentle hanger swing and a
 * short line about what is happening. `tone="dark"` sits on the maroon AI Video screens.
 */
export default function DressLoader({ size = 'md', tone = 'light', caption = true, title }: {
  size?: 'sm' | 'md' | 'lg';
  tone?: 'light' | 'dark';
  caption?: boolean;
  title?: string;
}) {
  const [index, setIndex] = useState(0);
  const [line, setLine] = useState(0);
  useEffect(() => {
    const outfits = window.setInterval(() => setIndex((value) => (value + 1) % OUTFITS.length), 1100);
    const lines = window.setInterval(() => setLine((value) => (value + 1) % LINES.length), 3200);
    return () => { window.clearInterval(outfits); window.clearInterval(lines); };
  }, []);
  const box = size === 'lg' ? 'h-36 w-36' : size === 'sm' ? 'h-14 w-14' : 'h-24 w-24';
  const stroke = tone === 'dark' ? '#F3E5AB' : 'var(--color-brand, #7A1428)';
  const outfit = OUTFITS[index];
  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
      <style>{`
        @keyframes tf-dress-swing { 0% { transform: rotate(-7deg) translateY(2px); opacity: 0; } 15% { opacity: 1; } 50% { transform: rotate(6deg) translateY(0); } 85% { opacity: 1; } 100% { transform: rotate(-4deg) translateY(2px); opacity: 0; } }
        @keyframes tf-dress-dot { 0%, 100% { transform: scale(0.6); opacity: 0.4; } 50% { transform: scale(1); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .tf-dress-anim, .tf-dress-dot { animation: none !important; opacity: 1 !important; } }
      `}</style>
      <div className={`relative ${box}`}>
        {/* The hanger the outfits swing from. */}
        <svg viewBox="0 0 64 64" className="absolute inset-x-0 -top-3 mx-auto h-1/3 w-1/2" aria-hidden="true">
          <path d="M32 4 Q36 4 36 8 Q36 11 32 12 L32 14" fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
        </svg>
        <svg key={outfit.name} viewBox="0 0 64 64" className="tf-dress-anim h-full w-full" style={{ animation: 'tf-dress-swing 1.1s ease-in-out', transformOrigin: '50% 8%' }} aria-hidden="true">
          <path d={outfit.path} fill="none" stroke={stroke} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
      <div className="flex gap-1.5" aria-hidden="true">
        {OUTFITS.map((item, dot) => (
          <span key={item.name} className="tf-dress-dot h-1.5 w-1.5 rounded-full" style={{ background: stroke, animation: `tf-dress-dot 1.2s ease-in-out ${dot * 0.15}s infinite`, opacity: dot === index ? 1 : 0.4 }} />
        ))}
      </div>
      {title && <p className={`text-center font-bold ${size === 'lg' ? 'text-2xl' : 'text-lg'} ${tone === 'dark' ? 'text-[#F3E5AB]' : 'text-ink'}`}>{title}</p>}
      {caption && <p className={`text-center ${size === 'lg' ? 'text-lg' : 'text-sm'} ${tone === 'dark' ? 'text-[#F3E5AB]/80' : 'text-muted'}`}>{LINES[line]}</p>}
    </div>
  );
}
