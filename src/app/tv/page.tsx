'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Sparkles, Volume2 } from 'lucide-react';
import { getLiveAudioTrack } from '@/lib/maharaja/audio';

const TV_PLAYBACK_RATE = 0.66;

export default function TvPlayerPage() {
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [currentPlayback, setCurrentPlayback] = useState<{
    queueId: string;
    reservationId: string;
    videoUrl: string;
    liveAudioUrl?: string | null;
    customerName?: string | null;
    customerLocality?: string | null;
  } | null>(null);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollInFlightRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (!audioUnlocked || isPlayingVideo) return;

    let isMounted = true;

    const pollNextVideo = async () => {
      if (pollInFlightRef.current || isPlayingVideo) return;
      pollInFlightRef.current = true;

      try {
        const res = await fetch('/api/live/next');
        if (!isMounted) return;

        const data = await res.json();

        if (data.status === 'play' && data.videoUrl) {
          setCurrentPlayback({
            queueId: data.queueId,
            reservationId: data.reservationId,
            videoUrl: data.videoUrl,
            liveAudioUrl: data.liveAudioUrl || getLiveAudioTrack(data.queueId || data.reservationId || data.videoUrl),
            customerName: data.customerName || null,
            customerLocality: data.customerLocality || null,
          });
          setIsPlayingVideo(true);
        }
      } catch (err) {
        console.warn('TV polling network error, retrying:', err);
      } finally {
        pollInFlightRef.current = false;
        if (isMounted && !isPlayingVideo) {
          timeoutRef.current = setTimeout(pollNextVideo, 2000);
        }
      }
    };

    pollNextVideo();

    return () => {
      isMounted = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [audioUnlocked, isPlayingVideo]);

  const startVideoPlayback = async () => {
    if (!videoRef.current || !currentPlayback) return;

    setPlaybackError(null);
    try {
      videoRef.current.defaultPlaybackRate = TV_PLAYBACK_RATE;
      videoRef.current.playbackRate = TV_PLAYBACK_RATE;
      if (audioRef.current) {
        audioRef.current.src = currentPlayback.liveAudioUrl || getLiveAudioTrack(currentPlayback.queueId);
        audioRef.current.currentTime = 0;
        audioRef.current.volume = 0.88;
        audioRef.current.play().catch((audioErr) => {
          console.warn('Live TV audio playback blocked or failed:', audioErr);
        });
      }
      await videoRef.current.play();

      fetch('/api/tv/playing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queueId: currentPlayback.queueId,
          reservationId: currentPlayback.reservationId,
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
  }, [isPlayingVideo, currentPlayback]);

  const handleVideoEnded = async () => {
    if (!currentPlayback) return;
    audioRef.current?.pause();

    try {
      await fetch('/api/live/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queueId: currentPlayback.queueId,
          reservationId: currentPlayback.reservationId,
        }),
      });
    } catch (err) {
      console.error('Failed to notify completion:', err);
    } finally {
      setIsPlayingVideo(false);
      setCurrentPlayback(null);
      setPlaybackError(null);
    }
  };

  const handleVideoError = async () => {
    if (!currentPlayback) return;
    audioRef.current?.pause();

    try {
      await fetch('/api/live/fail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queueId: currentPlayback.queueId,
          reservationId: currentPlayback.reservationId,
          reason: 'TV browser playback error',
        }),
      });
    } catch (err) {
      console.error('Failed to notify playback failure:', err);
    } finally {
      setIsPlayingVideo(false);
      setCurrentPlayback(null);
      setPlaybackError(null);
    }
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

        <div className="relative z-10 grid h-full grid-cols-[0.84fr_0.82fr_1fr] items-center gap-10 px-14 py-10">
          <section className="flex h-full flex-col items-center justify-center gap-6">
            <img
              src="/maharaja-logo.png"
              alt="Majestic Maharaja"
              className="w-[82%] max-w-[360px] rounded-[2rem] border border-[#F6D36A]/45 object-cover shadow-[0_24px_80px_rgba(0,0,0,0.42)]"
            />
            <div className="text-center">
              <p className="font-serif text-4xl font-black uppercase tracking-[0.16em] text-[#FFF1A8]">
                AI Diwali
              </p>
              <p className="mt-2 text-sm font-bold uppercase tracking-[0.26em] text-[#F6D36A]/85">
                Fashion Film
              </p>
            </div>
          </section>

          <section className="flex h-full items-center justify-center">
            <div className="relative h-[91%] aspect-[9/16] overflow-hidden rounded-[1.6rem] border-[3px] border-[#F6D36A] bg-black shadow-[0_0_58px_rgba(246,211,106,0.22),0_22px_70px_rgba(0,0,0,0.52)]">
              {isPlayingVideo && currentPlayback ? (
                <video
                  ref={videoRef}
                  src={currentPlayback.videoUrl}
                  autoPlay
                  muted
                  playsInline
                  onLoadedMetadata={(event) => {
                    event.currentTarget.defaultPlaybackRate = TV_PLAYBACK_RATE;
                    event.currentTarget.playbackRate = TV_PLAYBACK_RATE;
                  }}
                  onEnded={handleVideoEnded}
                  onError={handleVideoError}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center bg-[#120203] p-7 text-center">
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
            <div className="border-l border-[#F6D36A]/35 pl-10">
              <p className="text-sm font-black uppercase tracking-[0.32em] text-[#F6D36A]/85">
                தீபாவளி வாழ்த்து
              </p>
              <h1
                className="mt-6 text-[clamp(3.4rem,5.6vw,6.3rem)] font-black leading-[1.04] text-[#FFF1A8] [text-shadow:0_5px_22px_rgba(0,0,0,0.55)]"
                style={{ fontFamily: "'Noto Serif Tamil', 'Noto Sans Tamil', Latha, 'Tamil Sangam MN', serif" }}
              >
                இனிய
                <br />
                தீபாவளி
                <br />
                நல்வாழ்த்துகள்
              </h1>

              <div className="mt-10 h-px w-4/5 bg-gradient-to-r from-[#F6D36A] to-transparent" />

              <p
                className="mt-9 text-[clamp(2rem,3vw,3.4rem)] font-black leading-tight text-white"
                style={{ fontFamily: "'Noto Serif Tamil', 'Noto Sans Tamil', Latha, 'Tamil Sangam MN', serif" }}
              >
                {currentPlayback?.customerName || 'Maharaja Customer'}
              </p>
              <p
                className="mt-3 text-[clamp(1.5rem,2.2vw,2.5rem)] font-bold text-[#F6D36A]"
                style={{ fontFamily: "'Noto Serif Tamil', 'Noto Sans Tamil', Latha, 'Tamil Sangam MN', serif" }}
              >
                {currentPlayback?.customerLocality || 'Thanjavur'}
              </p>

              <p className="mt-10 max-w-md text-sm font-bold uppercase tracking-[0.22em] text-[#FFF1A8]/70">
                Maharaja Ready-Made Store
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
