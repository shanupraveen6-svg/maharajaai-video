'use client';

import { useEffect, useRef, useState } from 'react';

type Replay = { videoUrl: string };

/**
 * When nobody is using the TV, it plays the store's recent Go Live videos (muted) so the screen sells
 * itself. It only reads the replay list, so a separate Go Live player keeps its own queue. A tap anywhere
 * hands the screen back to the customer. The video element stays mounted the whole time and its `src` is
 * swapped in place, so one clip ends and the next starts with no black frame in between.
 */
export default function TvIdleLoop({ clientName, onWake }: { clientName: string; onWake: () => void }) {
  const [videos, setVideos] = useState<string[]>([]);
  const indexRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videos.length) return;
    const playCurrent = () => {
      el.src = videos[indexRef.current % videos.length];
      el.play().catch(() => undefined);
    };
    const next = () => { indexRef.current += 1; playCurrent(); };
    el.addEventListener('ended', next);
    el.addEventListener('error', next);
    playCurrent();
    return () => {
      el.removeEventListener('ended', next);
      el.removeEventListener('error', next);
    };
  }, [videos]);

  // No Go Live videos yet: the normal start screen stays up.
  if (!videos.length) return null;

  return (
    <button type="button" onClick={onWake} className="fixed inset-0 z-[60] block bg-ink text-left" aria-label="Tap to start">
      <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />

      {/* Client name, a small contained badge, top left. */}
      <span className="absolute left-6 top-6 inline-flex max-w-[70%] items-center truncate rounded-full bg-black/55 px-5 py-2.5 text-lg font-semibold text-white backdrop-blur-md sm:left-10 sm:top-10 sm:text-xl">
        {clientName}
      </span>

      {/* The call to action: a floating pill, not flush to the edge, sized to be noticed without taking the screen. */}
      <span className="absolute inset-x-0 bottom-12 flex justify-center sm:bottom-16">
        <span className="tf-btn tf-btn-primary !min-h-[72px] rounded-full px-12 text-2xl shadow-2xl">AI Try-On experience</span>
      </span>
    </button>
  );
}
