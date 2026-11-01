'use client';

import { useEffect, useState } from 'react';

type Replay = { videoUrl: string };

/**
 * When nobody is using the TV, it plays the store's recent Go Live videos (muted) so the screen sells
 * itself. It only reads the replay list, so a separate Go Live player keeps its own queue. A tap anywhere
 * hands the screen back to the customer.
 */
export default function TvIdleLoop({ clientName, onWake }: { clientName: string; onWake: () => void }) {
  const [videos, setVideos] = useState<string[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let active = true;
    fetch('/api/live/replays?limit=20', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (!active || !Array.isArray(data?.items)) return;
        setVideos((data.items as Replay[]).map((item) => item.videoUrl).filter(Boolean));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  // No Go Live videos yet: the normal start screen stays up.
  if (!videos.length) return null;

  const next = () => setIndex((current) => (current + 1) % videos.length);

  return (
    <button type="button" onClick={onWake} className="fixed inset-0 z-[60] block bg-ink text-left" aria-label="Tap to start">
      <video
        key={`${index}-${videos[index]}`}
        src={videos[index]}
        autoPlay
        muted
        playsInline
        onEnded={next}
        onError={next}
        className="h-full w-full object-contain"
      />
      <span className="absolute inset-x-8 bottom-10 flex items-center justify-between gap-6 rounded-3xl bg-white/95 p-6 shadow-2xl">
        <span className="min-w-0">
          <span className="block truncate text-xl font-semibold text-muted">{clientName}</span>
          <span className="mt-1 block text-3xl font-bold text-ink">Try our outfits on yourself</span>
        </span>
        <span className="tf-btn tf-btn-primary shrink-0 !min-h-16 px-8 text-xl">Tap to start</span>
      </span>
    </button>
  );
}
