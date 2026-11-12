'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

/**
 * The ~30-second wait while H3 Max turns the portrait into a video: the portrait itself, softly dimmed,
 * behind a progress bar that fills toward the garment and a caption that changes as it goes. The bar
 * eases up to 92% over about 28 seconds and holds there — it never claims done before the video is —
 * then the caller flips the page away the moment the real video arrives.
 */
export default function VideoGeneratingAnimation({ portraitUrl, captions, announce }: {
  portraitUrl: string;
  /** 4 rotating captions, already in the viewer's language. */
  captions: [string, string, string, string];
  /** One line for screen readers / the tab title, e.g. "Making your video…". */
  announce: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const tick = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 200);
    return () => window.clearInterval(tick);
  }, []);

  const DURATION = 28;
  const progress = Math.min(92, (elapsed / DURATION) * 92);
  const stepIndex = Math.min(3, Math.floor(elapsed / (DURATION / 4)));

  return (
    <div className="relative overflow-hidden rounded-2xl bg-ink" role="status" aria-live="polite" aria-label={announce}>
      {portraitUrl && (
        <img
          src={portraitUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-105 object-cover opacity-40 blur-[2px]"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/10" />
      <div className="relative flex min-h-[420px] flex-col items-center justify-end gap-5 p-7 text-center text-white">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 backdrop-blur">
          <Sparkles className="h-8 w-8 animate-pulse text-white" />
        </span>
        <p className="text-lg font-bold drop-shadow">{captions[stepIndex]}</p>
        <div className="w-full max-w-xs">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand to-[#C2435A] transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
