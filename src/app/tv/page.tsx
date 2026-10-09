'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Sparkles, Volume2 } from 'lucide-react';
import { getLiveAudioTrack } from '@/lib/maharaja/audio';

const TV_PLAYBACK_RATE = 0.66;
const SOURCE_SECONDS_FOR_LIVE = 6;
type Slot = 'a' | 'b';

type PlaybackItem = {
  queueId: string;
  reservationId: string;
  videoUrl: string;
  liveAudioUrl?: string | null;
  customerName?: string | null;
  customerLocality?: string | null;
};

export default function TvPlayerPage() {
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [currentPlayback, setCurrentPlayback] = useState<PlaybackItem | null>(null);
  const [slotItems, setSlotItems] = useState<Record<Slot, PlaybackItem | null>>({ a: null, b: null });
  const [activeSlot, setActiveSlot] = useState<Slot>('a');
  const [pendingSlot, setPendingSlot] = useState<Slot | null>(null);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);

  const videoARef = useRef<HTMLVideoElement | null>(null);
  const videoBRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentPlaybackRef = useRef<PlaybackItem | null>(null);
  const slotItemsRef = useRef<Record<Slot, PlaybackItem | null>>({ a: null, b: null });
  const activeSlotRef = useRef<Slot>('a');
  const pendingSlotRef = useRef<Slot | null>(null);
  const playlistRef = useRef<PlaybackItem[]>([]);
  const playlistIndexRef = useRef(0);
  const liveAudioStartedRef = useRef(false);
  const loopInProgressRef = useRef(false);
  const completedQueueIdsRef = useRef<Set<string>>(new Set());
  const pollInFlightRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    currentPlaybackRef.current = currentPlayback;
  }, [currentPlayback]);

  useEffect(() => {
    slotItemsRef.current = slotItems;
  }, [slotItems]);

  useEffect(() => {
    activeSlotRef.current = activeSlot;
  }, [activeSlot]);

  useEffect(() => {
    pendingSlotRef.current = pendingSlot;
  }, [pendingSlot]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      audioRef.current?.pause();
    };
  }, []);

  const getVideoRef = (slot: Slot) => (slot === 'a' ? videoARef.current : videoBRef.current);
  const getInactiveSlot = () => (activeSlotRef.current === 'a' ? 'b' : 'a');

  async function notifyPlaybackComplete(playback: PlaybackItem) {
    if (completedQueueIdsRef.current.has(playback.queueId)) return;
    completedQueueIdsRef.current.add(playback.queueId);
    try {
      await fetch('/api/live/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queueId: playback.queueId,
          reservationId: playback.reservationId,
        }),
      });
    } catch (err) {
      console.error('Failed to notify completion:', err);
    }
  }

  function preparePlayback(playback: PlaybackItem) {
    const slot = getInactiveSlot();
    liveAudioStartedRef.current = false;
    loopInProgressRef.current = false;
    setSlotItems((prev) => ({ ...prev, [slot]: playback }));
    setPendingSlot(slot);
  }

  function appendPlaylistItem(playback: PlaybackItem) {
    const exists = playlistRef.current.some((item) => item.queueId === playback.queueId);
    if (!exists) {
      playlistRef.current = [...playlistRef.current, playback];
    }

    if (!currentPlaybackRef.current && !pendingSlotRef.current) {
      playlistIndexRef.current = Math.max(playlistRef.current.findIndex((item) => item.queueId === playback.queueId), 0);
      preparePlayback(playback);
    }
  }

  useEffect(() => {
    if (!audioUnlocked) return;

    let isMounted = true;

    const pollNextVideo = async () => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;

      try {
        const res = await fetch('/api/live/next');
        if (!isMounted) return;

        const data = await res.json();

        if (data.status === 'play' && data.videoUrl) {
          appendPlaylistItem({
            queueId: data.queueId,
            reservationId: data.reservationId,
            videoUrl: data.videoUrl,
            liveAudioUrl: data.liveAudioUrl || getLiveAudioTrack(data.queueId || data.reservationId || data.videoUrl),
            customerName: data.customerName || null,
            customerLocality: data.customerLocality || null,
          });
        }
      } catch (err) {
        console.warn('TV polling network error, retrying:', err);
      } finally {
        pollInFlightRef.current = false;
        if (isMounted) {
          timeoutRef.current = setTimeout(pollNextVideo, 2000);
        }
      }
    };

    pollNextVideo();

    return () => {
      isMounted = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [audioUnlocked]);

  const startVideoPlayback = async () => {
    const video = getVideoRef(activeSlotRef.current);
    const playback = currentPlaybackRef.current;
    if (!video || !playback) return;

    setPlaybackError(null);
    liveAudioStartedRef.current = false;
    loopInProgressRef.current = false;
    try {
      video.defaultPlaybackRate = TV_PLAYBACK_RATE;
      video.playbackRate = TV_PLAYBACK_RATE;
      video.currentTime = 0;
      if (audioRef.current) {
        audioRef.current.src = playback.liveAudioUrl || getLiveAudioTrack(playback.queueId);
        audioRef.current.currentTime = 0;
        audioRef.current.volume = 0.88;
      }
      await video.play();

      fetch('/api/tv/playing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queueId: playback.queueId,
          reservationId: playback.reservationId,
        }),
      }).catch((err) => console.error('Failed to notify playing status:', err));
    } catch (err) {
      console.error('Video playback error / autoplay blocked:', err);
      audioRef.current?.pause();
      setPlaybackError('Autoplay blocked. Press play to start video.');
    }
  };

  useEffect(() => {
    if (isPlayingVideo && currentPlayback) {
      void startVideoPlayback();
    }
  }, [isPlayingVideo, currentPlayback, activeSlot]);

  const startLiveAudioWithVisibleVideo = (slot: Slot, video: HTMLVideoElement) => {
    const playback = currentPlaybackRef.current;
    if (slot !== activeSlotRef.current || !playback || !audioRef.current || liveAudioStartedRef.current) return;
    if (video.readyState < 2 || video.currentTime < 0.08 || video.paused) return;
    liveAudioStartedRef.current = true;
    window.requestAnimationFrame(() => {
      if (!audioRef.current || video.paused) return;
      audioRef.current.src = playback.liveAudioUrl || getLiveAudioTrack(playback.queueId);
      audioRef.current.currentTime = Math.min(video.currentTime / SOURCE_SECONDS_FOR_LIVE, 1) * 9;
      audioRef.current.volume = 0.88;
      audioRef.current.play().catch((audioErr) => {
        console.warn('Live TV audio playback blocked or failed:', audioErr);
      });
    });
  };

  const activatePendingSlot = (slot: Slot) => {
    if (slot !== pendingSlotRef.current) return;
    const playback = slotItemsRef.current[slot];
    const video = getVideoRef(slot);
    if (!playback || !video || video.readyState < 2) return;

    const index = playlistRef.current.findIndex((item) => item.queueId === playback.queueId);
    if (index >= 0) playlistIndexRef.current = index;

    audioRef.current?.pause();
    liveAudioStartedRef.current = false;
    loopInProgressRef.current = false;
    setCurrentPlayback(playback);
    setActiveSlot(slot);
    setPendingSlot(null);
    setIsPlayingVideo(true);
  };

  const queueNextPlaylistItem = () => {
    const playlist = playlistRef.current;
    if (!playlist.length) return;

    if (playlist.length === 1) {
      const video = getVideoRef(activeSlotRef.current);
      if (!video) return;
      video.currentTime = 0;
      video.playbackRate = TV_PLAYBACK_RATE;
      video.play().catch((err) => {
        console.error('Failed to loop current TV video:', err);
        setPlaybackError('Autoplay blocked. Press play to continue video.');
      }).finally(() => {
        loopInProgressRef.current = false;
      });
      return;
    }

    playlistIndexRef.current = (playlistIndexRef.current + 1) % playlist.length;
    preparePlayback(playlist[playlistIndexRef.current]);
  };

  const handleVideoEnded = async () => {
    const playback = currentPlaybackRef.current;
    if (!playback) return;
    audioRef.current?.pause();

    await notifyPlaybackComplete(playback);

    liveAudioStartedRef.current = false;
    setPlaybackError(null);
    queueNextPlaylistItem();
  };

  const handleVideoProgress = (slot: Slot, video: HTMLVideoElement) => {
    if (slot !== activeSlotRef.current || !currentPlaybackRef.current) return;

    startLiveAudioWithVisibleVideo(slot, video);

    const duration = Number.isFinite(video.duration) && video.duration > 0
      ? Math.min(video.duration, SOURCE_SECONDS_FOR_LIVE)
      : SOURCE_SECONDS_FOR_LIVE;

    if (video.currentTime >= duration - 0.05 && !loopInProgressRef.current) {
      loopInProgressRef.current = true;
      void handleVideoEnded();
    }
  };

  const handleVideoError = async () => {
    const playback = currentPlaybackRef.current;
    if (!playback) return;
    audioRef.current?.pause();

    try {
      await fetch('/api/live/fail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queueId: playback.queueId,
          reservationId: playback.reservationId,
          reason: 'TV browser playback error',
        }),
      });
    } catch (err) {
      console.error('Failed to notify playback failure:', err);
    } finally {
      setIsPlayingVideo(false);
      setCurrentPlayback(null);
      setPlaybackError(null);
      queueNextPlaylistItem();
    }
  };

  const renderVideoSlot = (slot: Slot) => {
    const playback = slotItems[slot];
    const isActive = activeSlot === slot && playback;
    const isPending = pendingSlot === slot && playback;

    return (
      <video
        key={`${slot}-${playback?.queueId || 'empty'}`}
        ref={slot === 'a' ? videoARef : videoBRef}
        src={playback?.videoUrl || undefined}
        muted
        playsInline
        preload="auto"
        onLoadedMetadata={(event) => {
          event.currentTarget.defaultPlaybackRate = TV_PLAYBACK_RATE;
          event.currentTarget.playbackRate = TV_PLAYBACK_RATE;
        }}
        onCanPlay={() => {
          if (isPending) activatePendingSlot(slot);
        }}
        onPlaying={(event) => startLiveAudioWithVisibleVideo(slot, event.currentTarget)}
        onTimeUpdate={(event) => handleVideoProgress(slot, event.currentTarget)}
        onEnded={handleVideoEnded}
        onError={handleVideoError}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
          isActive ? 'opacity-100' : 'opacity-0'
        }`}
      />
    );
  };

  if (!audioUnlocked) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#2B0506] p-6 text-center select-none font-sans">
        <div className="max-w-xl w-full rounded-2xl border border-[#F6D36A]/45 bg-[#170202]/92 p-10 shadow-2xl space-y-6">
          <img
            src="/maharaja-logo.png"
            alt="Majestic Maharaja"
            className="mx-auto h-32 w-32 rounded-2xl object-cover border border-[#F6D36A]/35"
          />
          <div>
            <h1 className="font-serif text-3xl font-bold tracking-widest text-[#F8E8A8] uppercase">
              Majestic Maharaja TV
            </h1>
            <p className="mt-2 text-xs font-bold uppercase tracking-[0.24em] text-[#F6D36A]/80">
              Diwali Celebration Screen
            </p>
          </div>
          <p className="text-sm leading-7 text-[#F8E8A8]/75">
            Tap once to start the 55-inch showroom player, enable festival background music, and receive live AI ads.
          </p>
          <button
            onClick={() => {
              setAudioUnlocked(true);
            }}
            className="w-full rounded-xl bg-gradient-to-r from-[#F6D36A] via-[#FFF1A8] to-[#F6D36A] px-8 py-4 text-base font-black uppercase tracking-wider text-[#3B0507] shadow-2xl transition hover:brightness-110 flex items-center justify-center gap-3"
          >
            <Volume2 className="h-6 w-6" /> Start Maharaja Screen
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 flex h-screen w-screen items-center justify-center overflow-hidden bg-black select-none">
      <audio ref={audioRef} preload="auto" />
      <div className="relative aspect-video h-full max-h-[56.25vw] w-full max-w-[177.78vh] overflow-hidden bg-[#4A0707] text-[#F8E8A8]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_20%,rgba(246,211,106,0.15),transparent_26%),radial-gradient(circle_at_82%_72%,rgba(255,241,168,0.12),transparent_30%),linear-gradient(135deg,#320405_0%,#5D0B09_42%,#210202_100%)]" />
        <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(0deg,rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:9px_9px]" />

        <div className="relative z-10 grid h-full grid-cols-[1fr_0.86fr_1fr] items-center gap-6 px-14 py-10">
          <section className="flex h-full flex-col items-center justify-center gap-5">
            <img
              src="/maharaja-logo.png"
              alt="Majestic Maharaja"
              className="w-[82%] max-w-[330px] rounded-[1.85rem] border border-[#F6D36A]/45 object-cover shadow-[0_24px_80px_rgba(0,0,0,0.42)]"
            />
            <div className="text-center">
              <p className="font-serif text-4xl font-black uppercase tracking-[0.16em] text-[#FFF1A8]">
                AI Diwali
              </p>
              <p className="mt-2 text-sm font-bold uppercase tracking-[0.24em] text-[#F6D36A]/85">
                Fashion Film
              </p>
            </div>
          </section>

          <section className="flex h-full items-center justify-center">
            <div className="relative h-[92%] aspect-[9/16] overflow-hidden rounded-[1.6rem] border-[3px] border-[#F6D36A] bg-black shadow-[0_0_58px_rgba(246,211,106,0.22),0_22px_70px_rgba(0,0,0,0.52)]">
              {renderVideoSlot('a')}
              {renderVideoSlot('b')}

              {!currentPlayback && !pendingSlot && (
                <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center bg-[#120203] p-7 text-center">
                  <Sparkles className="mb-5 h-14 w-14 text-[#F6D36A] animate-pulse" />
                  <p className="font-serif text-3xl font-black leading-tight text-[#FFF1A8]">
                    Waiting for next AI ad
                  </p>
                  <p className="mt-4 text-xs font-bold uppercase tracking-[0.22em] text-[#F6D36A]/70">
                    Portrait screen ready
                  </p>
                </div>
              )}

              {playbackError && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/92 p-5 text-center">
                  <AlertCircle className="mb-3 h-10 w-10 text-[#F6D36A]" />
                  <p className="mb-4 text-xs text-white">{playbackError}</p>
                  <button
                    onClick={startVideoPlayback}
                    className="rounded-lg bg-[#F6D36A] px-6 py-2 text-xs font-black uppercase text-[#3B0507]"
                  >
                    Press Play
                  </button>
                </div>
              )}
            </div>
          </section>

          <section className="flex h-full flex-col justify-center">
            <div className="border-l border-[#F6D36A]/35 pl-8">
              <h1
                className="text-[clamp(2.45rem,4.25vw,4.9rem)] font-black leading-[1.06] text-[#FFF1A8] [text-shadow:0_5px_22px_rgba(0,0,0,0.55)]"
                style={{ fontFamily: "'Noto Serif Tamil', 'Noto Sans Tamil', Latha, 'Tamil Sangam MN', serif" }}
              >
                இனிய
                <br />
                தீபாவளி
                <br />
                நல்வாழ்த்துகள்
              </h1>

              <div className="mt-7 h-px w-4/5 bg-gradient-to-r from-[#F6D36A] to-transparent" />

              <p
                className="mt-7 text-[clamp(1.55rem,2.35vw,2.7rem)] font-black leading-tight text-white"
                style={{ fontFamily: "'Noto Serif Tamil', 'Noto Sans Tamil', Latha, 'Tamil Sangam MN', serif" }}
              >
                {currentPlayback?.customerName || 'Maharaja Customer'}
              </p>
              <p
                className="mt-3 text-[clamp(1.15rem,1.75vw,2rem)] font-bold text-[#F6D36A]"
                style={{ fontFamily: "'Noto Serif Tamil', 'Noto Sans Tamil', Latha, 'Tamil Sangam MN', serif" }}
              >
                {currentPlayback?.customerLocality || 'Thanjavur'}
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
