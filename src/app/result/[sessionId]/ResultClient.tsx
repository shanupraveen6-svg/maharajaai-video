'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { Download, Tv, Sparkles, RotateCcw, Flame, ShieldCheck, AlertCircle, ExternalLink } from 'lucide-react';
import { getLiveAudioTrack, getPreviewAudioTrack } from '@/lib/maharaja/audio';

export default function ResultClient({ sessionId }: { sessionId: string }) {
  const [showLiveConsent, setShowLiveConsent] = useState(false);
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);
  const [privacyAction, setPrivacyAction] = useState<'download' | 'live' | null>(null);
  const [publicConsent, setPublicConsent] = useState(true);
  const [customerName, setCustomerName] = useState('');
  const [customerLocality, setCustomerLocality] = useState('');
  const [isGoingLive, setIsGoingLive] = useState(false);
  const [liveSuccess, setLiveSuccess] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [queueId, setQueueId] = useState<string | null>(null);
  const [queueNumber, setQueueNumber] = useState<number | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [peopleAhead, setPeopleAhead] = useState<number | null>(null);
  const [liveQueueStatus, setLiveQueueStatus] = useState<'queued' | 'reserved' | 'playing' | 'completed' | 'playback_failed'>('queued');

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [masterImageUrl, setMasterImageUrl] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string>(sessionId ? `video_${sessionId}` : '');
  const [videoStatus, setVideoStatus] = useState<'processing' | 'ready' | 'failed'>('processing');
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(true);
  const previewAudioUrl = useMemo(() => getPreviewAudioTrack(sessionId), [sessionId]);
  const liveAudioUrl = useMemo(() => getLiveAudioTrack(sessionId), [sessionId]);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const syncPreviewAudioToVideo = (video: HTMLVideoElement) => {
    if (!previewAudioRef.current) return;
    if (Number.isFinite(video.currentTime)) {
      previewAudioRef.current.currentTime = video.currentTime % Math.max(previewAudioRef.current.duration || 6, 1);
    }
  };

  const playPreviewAudioWithVideo = (video: HTMLVideoElement) => {
    if (!previewAudioRef.current) return;
    syncPreviewAudioToVideo(video);
    previewAudioRef.current.volume = 0.9;
    previewAudioRef.current.play().catch((err) => {
      console.warn('Preview audio playback blocked:', err);
    });
  };

  const pausePreviewAudio = () => {
    previewAudioRef.current?.pause();
  };

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
          setQueueNumber(typeof data.queueNumber === 'number' ? data.queueNumber : null);
          setQueuePosition(typeof data.queuePosition === 'number' ? data.queuePosition : null);
          setPeopleAhead(typeof data.peopleAhead === 'number' ? data.peopleAhead : null);
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

        if (!res.ok || data.status === 'failed') {
          setVideoStatus('failed');
          setVideoError(data.error || 'Video generation failed.');
          setIsLoadingVideo(false);
          return;
        }

        if (data.success) {
          if (data.masterImageUrl) {
            setMasterImageUrl(data.masterImageUrl);
          }
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
        <Link href="/create" className="px-6 py-3 bg-[#6e0d1f] border border-[#D4AF37] text-[#F3E5AB] rounded-lg text-sm font-semibold uppercase tracking-wider">
          Create New Video
        </Link>
      </main>
    );
  }

  const fetchDownloadBlob = async (url: string) => {
    try {
      const directRes = await fetch(url);
      if (directRes.ok) return await directRes.blob();
    } catch {
      // Cross-origin Firebase signed URLs often block browser-side blob reads.
    }

    const proxyRes = await fetch('/api/download/asset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!proxyRes.ok) {
      const payload = await proxyRes.json().catch(() => null);
      throw new Error(payload?.error || 'Download failed.');
    }

    return await proxyRes.blob();
  };

  const downloadAsset = async (url: string, filename: string) => {
    const blob = await fetchDownloadBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  };

  const executeDownload = async () => {
    if (masterImageUrl) {
      await downloadAsset(masterImageUrl, `Maharaja-Diwali-Master-${sessionId}.jpg`);
    }
    if (videoUrl) {
      const extension = videoUrl.includes('.webm') ? 'webm' : 'mp4';
      await downloadAsset(videoUrl, `Maharaja-Diwali-Video-${sessionId}.${extension}`);
    }
  };

  const requestPrivacyConfirmation = (action: 'download' | 'live') => {
    setPrivacyAction(action);
    setShowPrivacyNotice(true);
  };

  const handlePrivacyContinue = () => {
    const action = privacyAction;
    setShowPrivacyNotice(false);
    setPrivacyAction(null);

    if (action === 'download') {
      executeDownload().catch((err) => {
        setLiveError(err instanceof Error ? err.message : 'Download failed.');
      });
    }

    if (action === 'live') {
      setShowLiveConsent(true);
    }
  };

  const handleConfirmGoLive = async () => {
    if (!publicConsent) return;
    if (!customerName.trim() || !customerLocality.trim()) {
      setLiveError('Enter customer name and locality for the Maharaja TV greeting.');
      return;
    }
    setIsGoingLive(true);
    setLiveError(null);

    try {
      pausePreviewAudio();
      const autoDownloadError = await executeDownload()
        .then(() => null)
        .catch((err) => (err instanceof Error ? err.message : 'Auto-download failed.'));
      const res = await fetch('/api/live/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          videoId: videoId || `video_${sessionId}`,
          customerName: customerName.trim(),
          customerLocality: customerLocality.trim(),
          liveAudioUrl
        })
      });

      const data = await res.json();
      if (data.success) {
        if (data.queueId) setQueueId(data.queueId);
        setQueueNumber(typeof data.queueNumber === 'number' ? data.queueNumber : null);
        setQueuePosition(typeof data.queuePosition === 'number' ? data.queuePosition : null);
        setPeopleAhead(typeof data.peopleAhead === 'number' ? data.peopleAhead : null);
        setLiveQueueStatus('queued');
        setCountdownSeconds(5);
        setLiveSuccess(true);
        setShowThankYou(true);
        setShowLiveConsent(false);
        if (autoDownloadError) {
          setLiveError(`Sent to TV. ${autoDownloadError} Use Download again if the files did not save.`);
        }
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
      {videoStatus === 'failed' ? (
        <div className="py-20 text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-lg bg-red-950/60 border-2 border-red-500 flex items-center justify-center text-red-300">
            <AlertCircle className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-serif font-bold text-red-200 uppercase tracking-wider">
            VIDEO GENERATION FAILED
          </h2>
          <p className="text-xs text-gray-300 max-w-xs mx-auto">
            {videoError || 'Please create another video after checking the setup.'}
          </p>
          <Link href="/create" className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#D4AF37]/50 bg-[#6e0d1f] px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#F3E5AB]">
            <RotateCcw className="w-4 h-4" /> Create Again
          </Link>
        </div>
      ) : isLoadingVideo || videoStatus === 'processing' || !videoUrl ? (
        <div className="py-20 text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-lg bg-[#6e0d1f]/40 border-2 border-[#D4AF37] flex items-center justify-center text-[#D4AF37] animate-pulse">
            <Sparkles className="w-10 h-10 animate-spin" />
          </div>
          <h2 className="text-xl font-serif font-bold text-[#F3E5AB] uppercase tracking-wider">
            RENDERING 6-SECOND DIWALI COMMERCIAL...
          </h2>
          <p className="text-xs text-gray-300 max-w-xs mx-auto animate-pulse">
            Maharaja AI is rendering your full-body 6-second video with exact identity & garment preservation. Please wait...
          </p>
        </div>
      ) : (
        /* Main Result Card when Ready */
        <div className="space-y-6 text-center">
          <div className="inline-flex items-center gap-2 border-l-2 border-[#D4AF37] bg-[#6e0d1f]/40 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#F3E5AB]">
            <Sparkles className="w-4 h-4 text-[#D4AF37]" /> ✨ YOUR DIWALI FILM IS READY
          </div>

        {/* 9:16 Video Preview Frame */}
        <div className="relative aspect-[9/16] w-full max-w-xs mx-auto rounded-lg overflow-hidden border-2 border-[#D4AF37] shadow-[0_0_40px_rgba(212,175,55,0.25)] bg-black">
          <video
            src={videoUrl}
            controls
            loop
            playsInline
            muted
            onPlay={(event) => playPreviewAudioWithVideo(event.currentTarget)}
            onPlaying={(event) => playPreviewAudioWithVideo(event.currentTarget)}
            onPause={pausePreviewAudio}
            onSeeking={(event) => syncPreviewAudioToVideo(event.currentTarget)}
            onEnded={pausePreviewAudio}
            className="w-full h-full object-cover"
          />
          <audio ref={previewAudioRef} src={previewAudioUrl} loop preload="auto" className="hidden" />
        </div>

        {/* Primary Action Buttons */}
        <div className="space-y-3 pt-2">
          <button
            onClick={() => requestPrivacyConfirmation('download')}
            className="w-full rounded-lg bg-[#D4AF37] px-6 py-4 text-sm font-bold uppercase tracking-wider text-black shadow-xl transition hover:brightness-105 flex items-center justify-center gap-3"
          >
            <Download className="w-5 h-5 fill-black" /> DOWNLOAD IMAGE + VIDEO
          </button>

          <button
            onClick={() => requestPrivacyConfirmation('live')}
            className="w-full rounded-lg border border-[#D4AF37]/50 bg-[#800A1D] px-6 py-4 text-sm font-bold uppercase tracking-wider text-[#F3E5AB] shadow-xl transition hover:brightness-110 flex items-center justify-center gap-3"
          >
            <Tv className="w-5 h-5 text-[#D4AF37]" /> GO LIVE ON MAHARAJA SCREEN
          </button>

          <div className="rounded-lg border border-[#D4AF37]/25 bg-black/45 p-3 text-[11px] leading-5 text-[#F3E5AB]/80">
            Download saves the approved image and video. Go Live also downloads both files, then sends the video to the showroom TV with festival music and Tamil greeting.
          </div>

          <Link
            href="/create"
            className="w-full rounded-lg border border-gray-700 bg-black/60 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-gray-300 transition hover:bg-black flex items-center justify-center gap-2 block"
          >
            <RotateCcw className="w-4 h-4" /> CREATE ANOTHER VIDEO
          </Link>
        </div>

        {liveError && (
          <div className="flex items-start gap-3 rounded-lg border border-red-500/50 bg-red-950/60 p-4 text-left text-xs text-red-300">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
            <div>{liveError}</div>
          </div>
        )}
      </div>
      )}

      {showThankYou && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-lg border border-[#D4AF37]/55 bg-[#120203] p-6 text-center shadow-2xl space-y-5">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-[#D4AF37]/60 bg-[#6e0d1f]/80 text-[#F3E5AB]">
              <Sparkles className="h-7 w-7 text-[#D4AF37]" />
            </div>
            <div>
              <h2 className="font-serif text-2xl font-black text-[#F3E5AB]">
                Thank you for your purchase
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#F3E5AB]/80">
                Advance Deepavali greetings from Maharaja. Your Diwali AI film has been sent to the showroom screen.
              </p>
            </div>

            <div className="rounded-lg border border-emerald-500/45 bg-emerald-950/40 p-4 text-left text-emerald-200 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300/80">
                    Maharaja TV Status
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#F3E5AB]">
                    {countdownSeconds && countdownSeconds > 0
                      ? `Going live in ${countdownSeconds}s`
                      : liveQueueStatus === 'playing'
                      ? 'Playing on showroom TV'
                      : liveQueueStatus === 'reserved'
                      ? 'Preparing on showroom TV'
                      : liveQueueStatus === 'completed'
                      ? 'Completed, now looping on TV'
                      : liveQueueStatus === 'playback_failed'
                      ? 'TV playback needs attention'
                      : 'Waiting in TV queue'}
                  </p>
                </div>
                <span className="border border-[#D4AF37]/45 bg-black/40 px-3 py-1 text-xs font-black text-[#D4AF37]">
                  {liveQueueStatus === 'queued' && queuePosition ? `#${queuePosition}` : liveQueueStatus.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-md border border-emerald-400/25 bg-black/30 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-emerald-300/70">Queue No</p>
                  <p className="mt-1 text-xl font-mono font-black text-[#F3E5AB]">
                    {queueNumber ? `#${queueNumber}` : '--'}
                  </p>
                </div>
                <div className="rounded-md border border-emerald-400/25 bg-black/30 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-emerald-300/70">People Ahead</p>
                  <p className="mt-1 text-xl font-mono font-black text-[#F3E5AB]">
                    {typeof peopleAhead === 'number' ? peopleAhead : '--'}
                  </p>
                </div>
              </div>
            </div>

            <a
              href="https://www.instagram.com/majestic__maharaja/?hl=en"
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-5 py-3 text-sm font-black uppercase tracking-wider text-black"
            >
              <ExternalLink className="h-5 w-5" /> Follow on Instagram
            </a>

            <button
              onClick={() => setShowThankYou(false)}
              className="w-full rounded-lg border border-[#D4AF37]/35 bg-black/50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#F3E5AB]"
            >
              Close and stay on preview
            </button>
          </div>
        </div>
      )}

      {/* Privacy Notice Modal */}
      {showPrivacyNotice && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full maharaja-card p-6 rounded-lg border border-[#D4AF37]/50 space-y-4">
            <div className="flex items-center gap-2 text-[#D4AF37] font-serif font-bold text-lg uppercase tracking-wider">
              <ShieldCheck className="w-6 h-6" /> Privacy Notice
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              This AI image and video are created only for this Maharaja Diwali experience. Download keeps a copy for the customer. Go Live plays it on the showroom TV only after permission.
            </p>

            <div className="rounded-lg border border-[#D4AF37]/30 bg-black/60 p-3 text-xs leading-relaxed text-[#F3E5AB]">
              Privacy note: customer photos and generated files can be cleared after delivery. Do not reuse customer media without permission.
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowPrivacyNotice(false);
                  setPrivacyAction(null);
                }}
                className="w-1/2 rounded-lg bg-gray-800 py-3 text-xs font-bold uppercase tracking-wider text-gray-300 hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handlePrivacyContinue}
                className="w-1/2 rounded-lg bg-[#D4AF37] py-3 text-xs font-bold uppercase tracking-wider text-black hover:brightness-110"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Public Display Consent Modal */}
      {showLiveConsent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full maharaja-card p-6 rounded-lg border border-[#D4AF37]/50 space-y-4">
            <div className="flex items-center gap-2 text-[#D4AF37] font-serif font-bold text-lg uppercase tracking-wider">
              <ShieldCheck className="w-6 h-6" /> GO LIVE DETAILS
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              Add the customer display name and locality for the right side of the Maharaja TV screen.
            </p>

            <div className="grid grid-cols-1 gap-3">
              <label className="space-y-1 text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#D4AF37]">Customer Name</span>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Example: Kavitha"
                  className="w-full rounded-lg border border-[#D4AF37]/35 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37]"
                />
              </label>
              <label className="space-y-1 text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#D4AF37]">Locality</span>
                <input
                  value={customerLocality}
                  onChange={(e) => setCustomerLocality(e.target.value)}
                  placeholder="Example: Thiruvaiyaru"
                  className="w-full rounded-lg border border-[#D4AF37]/35 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37]"
                />
              </label>
            </div>

            <label className="flex items-start gap-3 p-3 rounded-md bg-black/60 border border-[#D4AF37]/30 cursor-pointer">
              <input
                type="checkbox"
                checked={publicConsent}
                onChange={(e) => setPublicConsent(e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-[#D4AF37]"
              />
              <span className="text-xs text-gray-200">
                I agree that this completed AI-generated video may be displayed on Maharaja&apos;s public promotional screen for this Diwali experience.
              </span>
            </label>

            {liveError && (
              <div className="rounded-md border border-red-400/50 bg-red-950/50 p-3 text-xs font-bold text-red-200">
                {liveError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowLiveConsent(false)}
                className="w-1/2 rounded-lg bg-gray-800 py-3 text-xs font-bold uppercase tracking-wider text-gray-300 hover:bg-gray-700"
              >
                CANCEL
              </button>
              <button
                onClick={handleConfirmGoLive}
                disabled={!publicConsent || isGoingLive}
                className="w-1/2 rounded-lg bg-[#D4AF37] py-3 text-xs font-bold uppercase tracking-wider text-black hover:brightness-110 disabled:opacity-50"
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
