'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Download, Tv, Sparkles, CheckCircle2, RotateCcw, Flame, ShieldCheck, AlertCircle } from 'lucide-react';

export default function ResultClient({ sessionId }: { sessionId: string }) {
  const [showLiveConsent, setShowLiveConsent] = useState(false);
  const [publicConsent, setPublicConsent] = useState(true);
  const [isGoingLive, setIsGoingLive] = useState(false);
  const [liveSuccess, setLiveSuccess] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [queueId, setQueueId] = useState<string | null>(null);
  const [liveQueueStatus, setLiveQueueStatus] = useState<'queued' | 'reserved' | 'playing' | 'completed' | 'playback_failed'>('queued');

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string>(sessionId ? `video_${sessionId}` : '');
  const [videoStatus, setVideoStatus] = useState<'processing' | 'ready'>('processing');
  const [isLoadingVideo, setIsLoadingVideo] = useState(true);

  useEffect(() => {
    if (!liveSuccess || countdownSeconds === null) return;
    const interval = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [liveSuccess, countdownSeconds]);

  // Poll /api/live/status after 5-second countdown reaches 0
  useEffect(() => {
    if (!liveSuccess || !queueId || countdownSeconds !== 0) return;

    let isMounted = true;
    let pollTimer: NodeJS.Timeout;

    async function pollQueueStatus() {
      try {
        const res = await fetch(`/api/live/status?queueId=${queueId}`);
        const data = await res.json();
        if (!isMounted) return;

        if (data.success && data.status) {
          setLiveQueueStatus(data.status);
          if (data.status === 'completed' || data.status === 'playback_failed') {
            return;
          }
        }
      } catch (err) {
        console.warn('Error polling live status:', err);
      }

      if (isMounted) {
        pollTimer = setTimeout(pollQueueStatus, 2000);
      }
    }

    pollQueueStatus();

    return () => {
      isMounted = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [liveSuccess, queueId, countdownSeconds]);

  useEffect(() => {
    if (!sessionId) return;
    let isMounted = true;
    let timer: NodeJS.Timeout;

    async function checkVideoStatus() {
      try {
        const res = await fetch(`/api/video/status?sessionId=${sessionId}`);
        const data = await res.json();
        if (!isMounted) return;

        if (data.success) {
          if (data.status === 'ready' || data.status === 'succeeded') {
            setVideoUrl(data.videoUrl);
            setVideoId(data.videoId || `video_${sessionId}`);
            setVideoStatus('ready');
            setIsLoadingVideo(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Polling error checking video status:', err);
      }

      if (isMounted) {
        timer = setTimeout(checkVideoStatus, 3000);
      }
    }

    checkVideoStatus();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  // Explicit error state if sessionId is missing — NEVER substitute sample-session
  if (!sessionId) {
    return (
      <main className="min-h-screen bg-[#070609] text-[#F8F5EE] p-6 flex flex-col items-center justify-center text-center font-sans max-w-lg mx-auto">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h1 className="text-xl font-serif font-bold text-[#F3E5AB] uppercase mb-2">Invalid Session</h1>
        <p className="text-sm text-gray-400 mb-6">No valid session ID was provided in the URL.</p>
        <Link href="/create" className="px-6 py-3 bg-[#6e0d1f] border border-[#D4AF37] text-[#F3E5AB] rounded-xl text-sm font-semibold uppercase tracking-wider">
          Create New Video
        </Link>
      </main>
    );
  }

  const handleDownload = () => {
    if (!videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    const extension = videoUrl.includes('.webm') ? 'webm' : 'mp4';
    a.download = `Maharaja-Diwali-${sessionId}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleConfirmGoLive = async () => {
    if (!publicConsent) return;
    setIsGoingLive(true);
    setLiveError(null);

    try {
      const res = await fetch('/api/live/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          videoId: videoId || `video_${sessionId}`
        })
      });

      const data = await res.json();
      if (data.success) {
        if (data.queueId) setQueueId(data.queueId);
        setLiveQueueStatus('queued');
        setCountdownSeconds(5);
        setLiveSuccess(true);
        setShowLiveConsent(false);
      } else {
        setLiveError(data.error || 'Failed to enqueue video');
      }
    } catch {
      setLiveError('Network error triggering Go Live');
    } finally {
      setIsGoingLive(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#070609] text-[#F8F5EE] p-4 md:p-8 font-sans max-w-lg mx-auto relative">
      
      {/* Header */}
      <header className="flex justify-between items-center border-b border-[#D4AF37]/20 pb-4 mb-6">
        <div className="flex items-center gap-2">
          <Flame className="w-6 h-6 text-[#D4AF37] animate-diya" />
          <h1 className="text-base font-serif font-bold text-[#F3E5AB] tracking-widest uppercase">
            MAHARAJA DIWALI FILM
          </h1>
        </div>
        <span className="text-[10px] font-mono text-[#D4AF37] bg-[#6e0d1f]/40 px-2 py-1 rounded border border-[#D4AF37]/30">
          ID: {sessionId.substring(0, 10)}
        </span>
      </header>

      {/* Rendering / Loading State */}
      {isLoadingVideo || videoStatus === 'processing' || !videoUrl ? (
        <div className="py-20 text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-[#6e0d1f]/40 border-2 border-[#D4AF37] flex items-center justify-center text-[#D4AF37] animate-pulse">
            <Sparkles className="w-10 h-10 animate-spin" />
          </div>
          <h2 className="text-xl font-serif font-bold text-[#F3E5AB] uppercase tracking-wider">
            RENDERING 6-SECOND DIWALI COMMERCIAL...
          </h2>
          <p className="text-xs text-gray-300 max-w-xs mx-auto animate-pulse">
            Google Veo is synthesizing your full-body video with exact identity & garment preservation. Please wait...
          </p>
        </div>
      ) : (
        /* Main Result Card when Ready */
        <div className="space-y-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#6e0d1f]/40 border border-[#D4AF37]/40 text-[#F3E5AB] text-xs font-semibold uppercase tracking-widest">
            <Sparkles className="w-4 h-4 text-[#D4AF37]" /> ✨ YOUR DIWALI FILM IS READY
          </div>

        {/* 9:16 Video Preview Frame */}
        <div className="relative aspect-[9/16] w-full max-w-xs mx-auto rounded-2xl overflow-hidden border-2 border-[#D4AF37] shadow-[0_0_40px_rgba(212,175,55,0.25)] bg-black">
          <video
            src={videoUrl}
            controls
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-xl border border-[#D4AF37]/60 bg-black/70 px-3 py-2 text-center shadow-lg backdrop-blur-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D4AF37]">
              MAHARAJA DIWALI GREETING
            </p>
            <p className="mt-0.5 text-sm font-bold text-[#F3E5AB]">
              <span style={{ fontFamily: "'Noto Serif Tamil', 'Noto Sans Tamil', Latha, 'Tamil Sangam MN', serif" }}>
                இனிய தீபாவளி நல்வாழ்த்துக்கள்
              </span>
            </p>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="space-y-3 pt-2">
          <button
            onClick={handleDownload}
            className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-[#D4AF37] via-[#F5E089] to-[#D4AF37] text-black font-bold uppercase tracking-wider text-sm shadow-xl hover:scale-[1.02] transition flex items-center justify-center gap-3"
          >
            <Download className="w-5 h-5 fill-black" /> DOWNLOAD DIWALI FILM
          </button>

          <button
            onClick={() => setShowLiveConsent(true)}
            className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-[#800A1D] via-[#6e0d1f] to-[#800A1D] border border-[#D4AF37]/50 text-[#F3E5AB] font-bold uppercase tracking-wider text-sm shadow-xl hover:scale-[1.02] transition flex items-center justify-center gap-3"
          >
            <Tv className="w-5 h-5 text-[#D4AF37]" /> GO LIVE ON MAHARAJA SCREEN
          </button>

          <Link
            href="/create"
            className="w-full py-3 px-6 rounded-xl bg-black/60 border border-gray-700 text-gray-300 text-xs font-semibold uppercase tracking-wider hover:bg-black transition flex items-center justify-center gap-2 block"
          >
            <RotateCcw className="w-4 h-4" /> CREATE ANOTHER VIDEO
          </Link>
        </div>

        {/* Success / Error Banners */}
        {liveSuccess && (
          <div className="p-4 rounded-xl bg-emerald-950/70 border border-emerald-500/60 text-emerald-300 text-sm text-left space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="font-bold text-emerald-200 uppercase tracking-wider text-xs">🎉 YOU&apos;RE GOING LIVE!</span>
              </div>
              {countdownSeconds !== null && (
                <span className="px-2.5 py-1 rounded-full bg-[#D4AF37] text-black font-mono font-bold text-xs animate-pulse">
                  {countdownSeconds > 0
                    ? `LIVE IN ${countdownSeconds}s`
                    : liveQueueStatus === 'playing'
                    ? '📺 LIVE NOW ON TV'
                    : liveQueueStatus === 'reserved'
                    ? '⏳ PREPARING ON MAHARAJA SCREEN...'
                    : liveQueueStatus === 'completed'
                    ? '✅ PLAYBACK COMPLETED'
                    : liveQueueStatus === 'playback_failed'
                    ? '⚠️ PLAYBACK FAILED'
                    : '⏳ WAITING FOR MAHARAJA SCREEN...'}
                </span>
              )}
            </div>
            <p className="text-xs text-emerald-300/90 leading-relaxed">
              {countdownSeconds && countdownSeconds > 0 
                ? `Preparing live stream... Look at the Maharaja showroom TV in ${countdownSeconds} seconds!`
                : liveQueueStatus === 'playing'
                ? 'Your video is now playing live on the Maharaja store display screen!'
                : liveQueueStatus === 'reserved'
                ? 'Preparing video stream on the Maharaja screen...'
                : liveQueueStatus === 'completed'
                ? 'Your video has completed playing on the TV screen.'
                : liveQueueStatus === 'playback_failed'
                ? 'Playback encountered an issue on the TV screen.'
                : 'Waiting for Maharaja screen to start playing your video...'}
            </p>

          </div>
        )}

        {liveError && (
          <div className="p-4 rounded-xl bg-red-950/60 border border-red-500/50 text-red-300 text-xs text-left flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
            <div>{liveError}</div>
          </div>
        )}
      </div>
      )}

      {/* Public Display Consent Modal */}
      {showLiveConsent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full maharaja-card p-6 rounded-2xl border border-[#D4AF37]/50 space-y-4">
            <div className="flex items-center gap-2 text-[#D4AF37] font-serif font-bold text-lg uppercase tracking-wider">
              <ShieldCheck className="w-6 h-6" /> PUBLIC DISPLAY CONSENT
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              Before playing your video on Maharaja&apos;s store display, please confirm public display authorization:
            </p>

            <label className="flex items-start gap-3 p-3 rounded-lg bg-black/60 border border-[#D4AF37]/30 cursor-pointer">
              <input
                type="checkbox"
                checked={publicConsent}
                onChange={(e) => setPublicConsent(e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-[#D4AF37]"
              />
              <span className="text-xs text-gray-200">
                “I agree that my completed AI-generated video may be displayed on Maharaja&apos;s public promotional screens.”
              </span>
            </label>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowLiveConsent(false)}
                className="w-1/2 py-3 rounded-xl bg-gray-800 text-gray-300 text-xs font-bold uppercase tracking-wider hover:bg-gray-700"
              >
                CANCEL
              </button>
              <button
                onClick={handleConfirmGoLive}
                disabled={!publicConsent || isGoingLive}
                className="w-1/2 py-3 rounded-xl bg-gradient-to-r from-[#800A1D] via-[#D4AF37] to-[#800A1D] text-black font-bold text-xs uppercase tracking-wider hover:brightness-110 disabled:opacity-50"
              >
                {isGoingLive ? 'ENQUEUING...' : 'CONFIRM & GO LIVE'}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
