'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, Tv, Sparkles, RotateCcw, Flame, ShieldCheck, AlertCircle, ExternalLink } from 'lucide-react';
import { getLiveAudioTrack, getPreviewAudioTrack } from '@/lib/maharaja/audio';
import { getEventOption, isEventId, type EventId } from '@/lib/maharaja/config';

export default function ResultClient({
  sessionId,
  accessCode = '',
  onBack,
}: {
  sessionId: string;
  accessCode?: string;
  onBack?: () => void;
}) {
  const router = useRouter();
  const [showLiveConsent, setShowLiveConsent] = useState(false);
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);
  const [thankYouMode, setThankYouMode] = useState<'download' | 'live' | null>(null);
  const [liveFarewell, setLiveFarewell] = useState(false);
  const [privacyAction, setPrivacyAction] = useState<'download' | 'live' | null>(null);
  const [publicConsent, setPublicConsent] = useState(true);
  const [showRetryPin, setShowRetryPin] = useState(false);
  const [retryPin, setRetryPin] = useState('');
  const [retryError, setRetryError] = useState<string | null>(null);
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
  const [eventId, setEventId] = useState<EventId>('diwali');

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [masterImageUrl, setMasterImageUrl] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string>(sessionId ? `video_${sessionId}` : '');
  const [videoStatus, setVideoStatus] = useState<'processing' | 'ready' | 'failed'>('processing');
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(true);
  const [retryUsed, setRetryUsed] = useState(false);
  const [videoDone, setVideoDone] = useState(false);
  const whatsappSendRequested = useRef(false);
  const previewAudioUrl = useMemo(() => getPreviewAudioTrack(sessionId), [sessionId]);
  const liveAudioUrl = useMemo(() => getLiveAudioTrack(sessionId), [sessionId]);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const instagramUrl = 'https://www.instagram.com/majestic__maharaja/?hl=en';
  const eventLabel = getEventOption(eventId).label;

  useEffect(() => {
    const storageKey = `maharaja:live-farewell:${sessionId}`;
    const stored = window.sessionStorage.getItem(storageKey);
    if (!stored) return;
    try {
      const data = JSON.parse(stored);
      setQueueId(typeof data.queueId === 'string' ? data.queueId : null);
      setQueueNumber(typeof data.queueNumber === 'number' ? data.queueNumber : null);
      setQueuePosition(typeof data.queuePosition === 'number' ? data.queuePosition : null);
      setPeopleAhead(typeof data.peopleAhead === 'number' ? data.peopleAhead : null);
      setLiveQueueStatus('queued');
      setCountdownSeconds(0);
      setLiveSuccess(true);
      setThankYouMode('live');
      setShowThankYou(true);
      setLiveFarewell(true);
    } catch {
      window.sessionStorage.removeItem(storageKey);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!liveFarewell) return;
    const marker = { maharajaLiveFarewell: sessionId };
    window.history.replaceState(marker, '', window.location.href);
    window.history.pushState(marker, '', window.location.href);
    const keepFarewellOpen = () => {
      window.history.pushState(marker, '', window.location.href);
    };
    window.addEventListener('popstate', keepFarewellOpen);
    return () => window.removeEventListener('popstate', keepFarewellOpen);
  }, [liveFarewell, sessionId]);

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
        const res = await fetch(`/api/live/status?queueId=${queueId}&accessCode=${encodeURIComponent(accessCode)}`);
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
        const queryParams = new URLSearchParams({ sessionId });
        if (accessCode) queryParams.set('accessCode', accessCode);
        const res = await fetch(`/api/video/status?${queryParams.toString()}`);
        const data = await res.json();
        if (!isMounted) return;

        if (!res.ok || data.status === 'failed') {
          setVideoStatus('failed');
          setVideoError(data.error || 'Video generation failed.');
          setIsLoadingVideo(false);
          return;
        }

        if (data.success) {
          if (isEventId(data.eventId)) setEventId(data.eventId);
          if (data.masterImageUrl) {
            setMasterImageUrl(data.masterImageUrl);
          }
          if (typeof data.retryUsed === 'boolean') setRetryUsed(data.retryUsed);
          if (typeof data.videoDone === 'boolean') setVideoDone(data.videoDone);
          if (data.status === 'ready' || data.status === 'succeeded') {
            setVideoUrl(data.videoUrl);
            setVideoId(data.videoId || `video_${sessionId}`);
            setVideoStatus('ready');
            setIsLoadingVideo(false);
            if (accessCode && !whatsappSendRequested.current) {
              whatsappSendRequested.current = true;
              void fetch('/api/whatsapp/send-result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, accessCode }),
              }).catch(() => undefined);
            }
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
        <Link href={accessCode ? `/maharaja/video/${encodeURIComponent(accessCode)}` : '/maharaja/workspace'} className="px-6 py-3 bg-[#6e0d1f] border border-[#D4AF37] text-[#F3E5AB] rounded-lg text-sm font-semibold uppercase tracking-wider">
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
    await fetch('/api/maharaja/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'download', label: `${eventLabel} customer result downloaded`, sessionId, accessCode }),
    }).catch(() => undefined);

    if (masterImageUrl) {
      await downloadAsset(masterImageUrl, `Maharaja-${eventLabel}-Master-${sessionId}.jpg`);
    }
    if (videoUrl) {
      const extension = videoUrl.includes('.webm') ? 'webm' : 'mp4';
      await downloadAsset(videoUrl, `Maharaja-${eventLabel}-Video-${sessionId}.${extension}`);
    }
    // Downloading the video must NOT complete or void the billing pass. The pass remains valid for its full window.
  };

  const requestPrivacyConfirmation = (action: 'download' | 'live') => {
    setPrivacyAction(action);
    setShowPrivacyNotice(true);
  };

  const handlePrivacyContinue = async () => {
    const action = privacyAction;
    setShowPrivacyNotice(false);
    setPrivacyAction(null);

    if (action === 'download') {
      try {
        await executeDownload();
        setThankYouMode('download');
        setShowThankYou(true);
      } catch (err) {
        setLiveError(err instanceof Error ? err.message : 'Download failed.');
      }
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
      const res = await fetch('/api/live/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          videoId: videoId || `video_${sessionId}`,
          videoUrl: videoUrl || undefined,
          customerName: customerName.trim(),
          customerLocality: customerLocality.trim(),
          liveAudioUrl,
          accessCode,
        })
      });

      const data = await res.json();
      if (data.success) {
        void executeDownload().catch((err) => {
          setLiveError(`Sent to TV. ${err instanceof Error ? err.message : 'Auto-download failed.'} Use Download again if needed.`);
        });
        if (data.queueId) setQueueId(data.queueId);
        setQueueNumber(typeof data.queueNumber === 'number' ? data.queueNumber : null);
        setQueuePosition(typeof data.queuePosition === 'number' ? data.queuePosition : null);
        setPeopleAhead(typeof data.peopleAhead === 'number' ? data.peopleAhead : null);
        setLiveQueueStatus('queued');
        setCountdownSeconds(Number(data.peopleAhead || 0) > 0 ? 0 : 5);
        setLiveSuccess(true);
        setThankYouMode('live');
        setShowThankYou(true);
        setShowLiveConsent(false);
        window.sessionStorage.setItem(`maharaja:live-farewell:${sessionId}`, JSON.stringify({
          queueId: data.queueId || null,
          queueNumber: typeof data.queueNumber === 'number' ? data.queueNumber : null,
          queuePosition: typeof data.queuePosition === 'number' ? data.queuePosition : null,
          peopleAhead: typeof data.peopleAhead === 'number' ? data.peopleAhead : null,
        }));
        setLiveFarewell(true);
      } else {
        setLiveError(data.error || 'Failed to enqueue video');
      }
    } catch {
      setLiveError('Network error triggering Go Live');
    } finally {
      setIsGoingLive(false);
    }
  };

  const confirmRetryPin = async () => {
    setRetryError(null);
    const response = await fetch('/api/maharaja/activity', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'retry', label: 'Manager approved AI Video retry', sessionId, accessCode, pin: retryPin.trim() }),
    }).catch(() => null);
    if (!response?.ok) {
      const payload = await response?.json().catch(() => ({}));
      setRetryError(payload?.error || 'Unable to verify the manager PIN.');
      return;
    }
    setRetryUsed(true);
    setShowRetryPin(false);
    router.push(accessCode ? `/maharaja/video/${encodeURIComponent(accessCode)}?retry=${encodeURIComponent(sessionId)}` : '/maharaja/workspace');
  };

  if (liveFarewell) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070609] px-5 py-10 text-center text-[#F8F5EE]">
        <section className="w-full max-w-lg">
          <img src="/maharaja-logo.png" alt="Majestic Maharaja" className="mx-auto h-24 w-24 border border-[#D4AF37]/45 object-cover shadow-xl" />
          <Sparkles className="mx-auto mt-7 h-9 w-9 text-[#D4AF37]" />
          <h1 className="mt-4 font-serif text-3xl font-black text-[#F3E5AB]">Thank you for your purchase</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#F3E5AB]/80">
            Your {eventLabel} AI film has been sent to the Maharaja showroom screen. Your image and video downloads have also started.
          </p>

          <div className="mt-7 border-y border-[#D4AF37]/30 py-5">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D4AF37]">Maharaja TV Status</p>
            <p className="mt-2 text-base font-bold text-[#F3E5AB]">
              {liveQueueStatus === 'playing'
                ? 'Playing on showroom TV'
                : liveQueueStatus === 'reserved'
                ? 'Preparing on showroom TV'
                : liveQueueStatus === 'completed'
                ? 'Completed and added to the TV loop'
                : liveQueueStatus === 'playback_failed'
                ? 'Maharaja staff are checking TV playback'
                : typeof peopleAhead === 'number' && peopleAhead > 0
                ? `Queue #${queueNumber || '--'} - ${peopleAhead} people ahead`
                : `Added to the showroom queue${queueNumber ? ` - #${queueNumber}` : ''}`}
            </p>
          </div>

          <div className="mt-7 space-y-3">
            <a href={instagramUrl} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 bg-[#D4AF37] px-5 py-3 text-sm font-black uppercase tracking-wider text-black">
              <ExternalLink className="h-5 w-5" /> Follow Maharaja
            </a>
          </div>

          <p className="mt-7 text-xs font-semibold text-[#F3E5AB]/55">Thanks for experiencing Maharaja AI.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070609] text-[#F8F5EE] p-4 md:p-8 font-sans max-w-lg mx-auto relative">
      
      {/* Header */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#D4AF37] hover:underline"
        >
          ← Back to Outfits & Try-On
        </button>
      )}
      <header className="flex justify-between items-center border-b border-[#D4AF37]/20 pb-4 mb-6">
        <div className="flex items-center gap-2">
          <Flame className="w-6 h-6 text-[#D4AF37] animate-diya" />
          <h1 className="text-base font-serif font-bold text-[#F3E5AB] tracking-widest uppercase">
            MAHARAJA {eventLabel.toUpperCase()} FILM
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
            {videoError || 'The AI video could not be completed. Your video slot has been automatically restored.'}
          </p>
          <button
            type="button"
            onClick={() => {
              if (onBack) onBack();
              else router.push(accessCode ? `/maharaja/video/${encodeURIComponent(accessCode)}` : '/maharaja/workspace');
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-6 py-3 text-xs font-bold uppercase tracking-wider text-black shadow-lg hover:brightness-105"
          >
            <RotateCcw className="w-4 h-4" /> Generate Video Again
          </button>
        </div>
      ) : isLoadingVideo || videoStatus === 'processing' || !videoUrl ? (
        <div className="py-20 text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-lg bg-[#6e0d1f]/40 border-2 border-[#D4AF37] flex items-center justify-center text-[#D4AF37] animate-pulse">
            <Sparkles className="w-10 h-10 animate-spin" />
          </div>
          <h2 className="text-xl font-serif font-bold text-[#F3E5AB] uppercase tracking-wider">
            RENDERING 6-SECOND {eventLabel.toUpperCase()} FILM...
          </h2>
          <p className="text-xs text-gray-300 max-w-xs mx-auto animate-pulse">
            Your Maharaja film is being prepared. Keep this page open.
          </p>
        </div>
      ) : (
        /* Main Result Card when Ready */
        <div className="space-y-6 text-center">
          <div className="inline-flex items-center gap-2 border-l-2 border-[#D4AF37] bg-[#6e0d1f]/40 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#F3E5AB]">
            <Sparkles className="w-4 h-4 text-[#D4AF37]" /> YOUR {eventLabel.toUpperCase()} FILM IS READY
          </div>

        {/* 9:16 Video Preview Frame */}
        <div className="relative aspect-[9/16] w-full max-w-xs mx-auto rounded-lg overflow-hidden border-2 border-[#D4AF37] shadow-[0_0_40px_rgba(212,175,55,0.25)] bg-black">
          {videoDone && !retryUsed && (
            <button
              type="button"
              onClick={() => {
                setRetryPin('');
                setRetryError(null);
                setShowRetryPin(true);
              }}
              className="absolute right-3 top-3 z-10 rounded-full border border-[#D4AF37]/50 bg-black/55 p-2 text-[#D4AF37] backdrop-blur hover:bg-black/75 transition"
              aria-label="Manager retry"
              title="Manager Video Retry"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
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
          <img src="/maharaja-logo.png" alt="Majestic Maharaja" className="pointer-events-none absolute right-3 top-14 z-[5] w-[27%] max-w-24 border border-[#D4AF37]/45 shadow-lg" />
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

        </div>

        {liveError && (
          <div className="flex items-start gap-3 rounded-lg border border-red-500/50 bg-red-950/60 p-4 text-left text-xs text-red-300">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
            <div>{liveError}</div>
          </div>
        )}
      </div>
      )}

      {showThankYou && thankYouMode !== 'live' && (
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
                Your image and video download has started. Thanks for experiencing Maharaja AI.
              </p>
            </div>

            <a
              href={instagramUrl}
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

      {showRetryPin && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-sm w-full rounded-lg border border-[#D4AF37]/55 bg-[#120203] p-6 text-center shadow-2xl space-y-4">
            <div>
              <h2 className="font-serif text-2xl font-black text-[#F3E5AB]">Manager Retry</h2>
              <p className="mt-2 text-xs leading-5 text-[#F3E5AB]/75">
                Retry is protected so customer credits are not spent accidentally.
              </p>
            </div>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={retryPin}
              onChange={(event) => {
                setRetryPin(event.target.value.replace(/\D/g, '').slice(0, 6));
                setRetryError(null);
              }}
              placeholder="••••••"
              className="w-full rounded-lg border border-[#D4AF37]/35 bg-black/60 px-4 py-3 text-center text-2xl font-black tracking-[0.5em] text-white outline-none focus:border-[#D4AF37]"
            />
            {retryError && (
              <div className="rounded-md border border-red-400/50 bg-red-950/50 p-3 text-xs font-bold text-red-200">
                {retryError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowRetryPin(false)}
                className="w-1/2 rounded-lg bg-gray-800 py-3 text-xs font-bold uppercase tracking-wider text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={confirmRetryPin}
                className="w-1/2 rounded-lg bg-[#D4AF37] py-3 text-xs font-bold uppercase tracking-wider text-black"
              >
                Unlock
              </button>
            </div>
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
              This AI image and video are created only for this Maharaja {eventLabel} experience. Download keeps a copy for the customer. Go Live plays it on the showroom TV only after permission.
            </p>

            <div className="rounded-lg border border-[#D4AF37]/30 bg-black/60 p-3 text-xs leading-relaxed text-[#F3E5AB]">
              We do not reuse your photos or generated media for any other purpose. Generated files are retained only as needed to deliver this experience and operate the approved showroom queue.
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
                I agree that this completed AI-generated video may be displayed on Maharaja&apos;s public promotional screen for this {eventLabel} experience.
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
