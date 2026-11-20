'use client';

import { useEffect, useRef, useState } from 'react';
import PosterFill from '@/components/kiosk/PosterFill';

type Clip = { videoUrl: string };

/**
 * The TV while the store has its customer screens turned off: a full-screen promotion player. It plays the
 * store's promotion videos (Settings → Promotion videos) between its customers' Go Live AI Videos, muted,
 * one after another with no black frame. There is nothing to tap: no Try-On, no tabs. With no videos at
 * all, the store's posters (or its name) fill the screen. The playlist is read again every 10 minutes.
 */
export default function TvPromoPlayer({ clientName }: { clientName: string }) {
  const [clips, setClips] = useState<string[]>([]);
  const indexRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [promoData, replayData] = await Promise.all([
        fetch('/api/maharaja/promos?playback=1', { cache: 'no-store' }).then((response) => response.json()).catch(() => null),
        fetch('/api/live/replays?limit=20', { cache: 'no-store' }).then((response) => response.json()).catch(() => null),
      ]);
      if (!active) return;
      const promos = (Array.isArray(promoData?.promos) ? promoData.promos as Clip[] : []).map((clip) => clip.videoUrl).filter(Boolean);
      const customers = (Array.isArray(replayData?.items) ? replayData.items as Clip[] : []).map((clip) => clip.videoUrl).filter(Boolean);
      // A promotion after every few customer videos (the store's own setting), so both keep coming round.
      const every = Math.max(1, Number(promoData?.everyCustomerVideos) || 3);
      const playlist: string[] = [];
      let promoIndex = 0;
      customers.forEach((url, index) => {
        playlist.push(url);
        if (promos.length && (index + 1) % every === 0) playlist.push(promos[promoIndex++ % promos.length]);
      });
      if (!customers.length) playlist.push(...promos);
      setClips(playlist);
    };
    void load();
    const timer = window.setInterval(load, 10 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !clips.length) return;
    const playCurrent = () => {
      el.src = clips[indexRef.current % clips.length];
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
  }, [clips]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-ink" aria-label={`${clientName} promotion`}>
      {clips.length ? (
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full flex-col bg-[#F4F5F2] p-8">
          <PosterFill clientName={clientName} />
        </div>
      )}
      {clips.length > 0 && clientName && (
        <span className="absolute left-6 top-6 inline-flex max-w-[70%] items-center truncate rounded-full bg-black/55 px-5 py-2.5 text-xl font-semibold text-white backdrop-blur-md sm:left-10 sm:top-10">
          {clientName}
        </span>
      )}
    </div>
  );
}
