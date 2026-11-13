'use client';

import { useEffect, useRef, useState } from 'react';

// One list per page load, shared by every screen that shows posters.
let posterList: Promise<string[]> | null = null;
function loadPosters() {
  if (!posterList) {
    posterList = fetch('/api/maharaja/posters', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { posters: [] }))
      .then((data) => (Array.isArray(data?.posters) ? data.posters : []))
      .catch(() => []);
  }
  return posterList;
}

let logoUrl: Promise<string> | null = null;
function loadLogo() {
  if (!logoUrl) {
    logoUrl = fetch('/api/maharaja/logo?fallback=1', { cache: 'no-store' })
      .then(async (response) => (response.ok ? URL.createObjectURL(await response.blob()) : ''))
      .catch(() => '');
  }
  return logoUrl;
}

/**
 * Fills the space a TV screen's own content leaves empty, so the portrait screen never looks half blank:
 * the store's posters (Settings → Posters), one at a time, changing every 7 seconds. With no posters, the
 * store's logo and line. It takes the rest of the screen's height and hides itself when there is too little
 * room to be worth showing. The screen that uses it is a flex column at least as tall as the screen.
 */
export default function PosterFill({ clientName }: { clientName: string }) {
  const [posters, setPosters] = useState<string[]>([]);
  const [logo, setLogo] = useState('');
  const [index, setIndex] = useState(0);
  const [roomy, setRoomy] = useState(true);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void loadPosters().then((list) => { if (active) setPosters(list); });
    void loadLogo().then((url) => { if (active) setLogo(url); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (posters.length < 2) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % posters.length), 7000);
    return () => window.clearInterval(timer);
  }, [posters.length]);

  useEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setRoomy(entry.contentRect.height >= 220));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={box} className="relative mt-auto min-h-[220px] w-full flex-1">
      {roomy && (posters.length > 0 ? (
        <div className="absolute inset-0 overflow-hidden rounded-3xl border border-line bg-white shadow-sm">
          {posters.map((id, position) => (
            <img
              key={id}
              src={`/api/maharaja/posters?id=${id}`}
              alt=""
              className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-700 ${position === index ? 'opacity-100' : 'opacity-0'}`}
            />
          ))}
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-3xl border border-line bg-white p-8 text-center shadow-sm">
          {logo
            ? <img src={logo} alt={clientName} className="max-h-[160px] max-w-[70%] object-contain" />
            : <p className="text-5xl font-bold text-ink">{clientName}</p>}
          <p className="text-2xl font-semibold text-muted">See yourself in every outfit, in seconds</p>
        </div>
      ))}
    </div>
  );
}
