'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Volume2, Flame, CheckCircle2, AlertCircle } from 'lucide-react';

const TV_PLAYBACK_RATE = 1;

export default function TvPlayerPage() {
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // Playback state
  const [currentPlayback, setCurrentPlayback] = useState<{
    queueId: string;
    reservationId: string;
    videoUrl: string;
  } | null>(null);

  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pollInFlightRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Polling engine: checks GET /api/live/next every 2 seconds when idle
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
            videoUrl: data.videoUrl
          });
          setIsPlayingVideo(true);
        }
      } catch (err) {
        console.warn('TV Polling Network Error (retrying...):', err);
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

  // Video Playback Execution
  const startVideoPlayback = async () => {
    if (!videoRef.current || !currentPlayback) return;

    setPlaybackError(null);
    try {
      videoRef.current.defaultPlaybackRate = TV_PLAYBACK_RATE;
      videoRef.current.playbackRate = TV_PLAYBACK_RATE;
      await videoRef.current.play();
      
      // Notify backend immediately that video is now actively playing on screen
      fetch('/api/tv/playing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queueId: currentPlayback.queueId,
          reservationId: currentPlayback.reservationId
        })
      }).catch(err => console.error('Failed to notify playing status:', err));
    } catch (err: any) {
      console.error('Video playback error / autoplay blocked:', err);
      setPlaybackError('Autoplay blocked. Press play to start video.');
    }
  };


  useEffect(() => {
    if (isPlayingVideo && currentPlayback) {
      startVideoPlayback();
    }
  }, [isPlayingVideo, currentPlayback]);

  // Completion handler: notifies POST /api/live/complete and returns to idle
  const handleVideoEnded = async () => {
    if (!currentPlayback) return;

    try {
      await fetch('/api/live/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queueId: currentPlayback.queueId,
          reservationId: currentPlayback.reservationId
        })
      });
    } catch (err) {
      console.error('Failed to notify completion:', err);
    } finally {
      setIsPlayingVideo(false);
      setCurrentPlayback(null);
      setPlaybackError(null);
    }
  };

  // Playback failure handler: notifies POST /api/live/fail and returns to idle without marking complete
  const handleVideoError = async () => {
    if (!currentPlayback) return;

    try {
      await fetch('/api/live/fail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queueId: currentPlayback.queueId,
          reservationId: currentPlayback.reservationId,
          reason: 'TV Browser playback error'
        })
      });
    } catch (err) {
      console.error('Failed to notify playback failure:', err);
    } finally {
      setIsPlayingVideo(false);
      setCurrentPlayback(null);
      setPlaybackError(null);
    }
  };

  // 1. Audio Unlock Prompt for Smart TV browsers
  if (!audioUnlocked) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#070609] p-6 text-center select-none font-sans">
        <div className="max-w-lg w-full maharaja-card p-10 rounded-2xl border border-[#D4AF37]/40 shadow-2xl space-y-6">
          <Flame className="w-14 h-14 text-[#D4AF37] mx-auto animate-diya" />
          
          <div>
            <h1 className="text-3xl font-serif font-bold text-[#F3E5AB] tracking-widest uppercase mb-1">
              MAHARAJA TV PLAYER
            </h1>
            <p className="text-xs text-[#D4AF37]/80 tracking-widest uppercase">
              Thanjavur In-Store Digital Signage
            </p>
          </div>

          <p className="text-sm text-gray-300">
            Tap below once to start the player and enable sound for customer video broadcasts.
          </p>

          <button
            onClick={() => setAudioUnlocked(true)}
            className="w-full py-4 px-8 rounded-xl bg-gradient-to-r from-[#D4AF37] via-[#F5E089] to-[#D4AF37] text-black font-bold uppercase tracking-wider text-base shadow-2xl hover:scale-105 transition flex items-center justify-center gap-3"
          >
            <Volume2 className="w-6 h-6" /> START MAHARAJA SCREEN
          </button>
        </div>
      </main>
    );
  }

  // 2. Fullscreen 16:9 Signage Player Screen (with 9:16 Vertical Video Centered)
  return (
    <main className="fixed inset-0 w-screen h-screen bg-black overflow-hidden flex items-center justify-center select-none">
      <div className="relative w-full h-full max-w-[177.78vh] max-h-[56.25vw] aspect-video bg-[#0B0609] border border-[#D4AF37]/30 flex flex-col justify-between p-6 shadow-2xl overflow-hidden">
        
        {/* Top Header */}
        <header className="relative z-20 flex justify-between items-center border-b border-[#D4AF37]/20 pb-4">
          <div className="flex items-center gap-3">
            <Flame className="w-7 h-7 text-[#D4AF37] animate-diya" />
            <div>
              <h1 className="text-xl font-serif font-bold text-[#F3E5AB] tracking-widest uppercase">
                MAHARAJA
              </h1>
              <p className="text-[10px] text-[#D4AF37]/70 tracking-widest uppercase">
                THANJAVUR — DIWALI CELEBRATION
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/60 border border-[#D4AF37]/30 text-[11px] text-[#F3E5AB]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            DISPLAY: <span className="font-semibold text-white">MAHARAJA MAIN</span>
          </div>
        </header>

        {/* Player Body */}
        <div className="relative z-10 flex-1 flex items-center justify-center my-4 overflow-hidden">
          {isPlayingVideo && currentPlayback ? (
            /* 9:16 Vertical Video Frame Centered Inside 16:9 Shell */
            <div className="relative h-full aspect-[9/16] rounded-xl overflow-hidden border-2 border-[#D4AF37] shadow-[0_0_50px_rgba(212,175,55,0.3)] bg-black">
              <video
                ref={videoRef}
                src={currentPlayback.videoUrl}
                autoPlay
                playsInline
                onLoadedMetadata={(e) => {
                  e.currentTarget.defaultPlaybackRate = TV_PLAYBACK_RATE;
                  e.currentTarget.playbackRate = TV_PLAYBACK_RATE;
                }}
                onEnded={handleVideoEnded}
                onError={handleVideoError}
                className="w-full h-full object-cover"
              />

              {playbackError && (
                <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-4 text-center z-30">
                  <AlertCircle className="w-10 h-10 text-amber-400 mb-2" />
                  <p className="text-xs text-white mb-4">{playbackError}</p>
                  <button
                    onClick={startVideoPlayback}
                    className="py-2 px-6 rounded-lg bg-[#D4AF37] text-black font-bold text-xs uppercase"
                  >
                    PRESS PLAY TO START
                  </button>
                </div>
              )}

              {/* Greeting text: no container/background, pinned to the bottom edge so it never covers the face */}
              <div className="pointer-events-none absolute bottom-5 left-3 right-3 text-center">
                <p className="text-[10px] uppercase text-[#F5D76E] font-black tracking-[0.24em] [text-shadow:0_2px_4px_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.85)]">
                  MAHARAJA DIWALI GREETING
                </p>
                <p className="mt-1 text-lg md:text-2xl text-[#FFD86B] font-black leading-tight [text-shadow:0_2px_4px_rgba(0,0,0,0.95),0_0_10px_rgba(0,0,0,0.9)]">
                  <span style={{ fontFamily: "'Noto Serif Tamil', 'Noto Sans Tamil', Latha, 'Tamil Sangam MN', serif" }}>
                    இனிய தீபாவளி நல்வாழ்த்துக்கள்
                  </span>
                </p>
              </div>
            </div>
          ) : (
            /* Maharaja Idle Promotional Advertisement */
            <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 bg-gradient-to-b from-[#2A060C]/40 to-[#070609]/80 rounded-2xl border border-[#D4AF37]/20 relative">
              <Sparkles className="w-12 h-12 text-[#D4AF37] mb-4 animate-bounce" />
              
              <h2 className="text-3xl md:text-5xl font-serif font-bold text-[#F3E5AB] tracking-wider mb-4 uppercase">
                THIS DIWALI, YOU COULD BE HERE.
              </h2>
              
              <p className="text-lg md:text-2xl text-gray-200 mb-8 max-w-2xl font-light">
                Shop <span className="text-[#D4AF37] font-semibold">₹5,000+</span> at Maharaja Thanjavur & star in your personalized AI Diwali Film on our big screen!
              </p>

              <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-[#6e0d1f]/60 border border-[#D4AF37]/50 text-[#F3E5AB] text-sm uppercase tracking-widest font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                SHOP ₹5,000+ → SCAN → AI FILM → GO LIVE
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="relative z-20 flex justify-between items-center border-t border-[#D4AF37]/20 pt-3 text-[11px] text-[#D4AF37]/80">
          <span>✨ MAHARAJA READY-MADE STORE, THANJAVUR</span>
          <span>DIWALI SPECIAL PROMOTION</span>
        </footer>

      </div>
    </main>
  );
}
