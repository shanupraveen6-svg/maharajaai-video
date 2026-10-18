'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, Tv, Sparkles, RotateCcw, Flame, ShieldCheck, AlertCircle, ExternalLink, MoreVertical, Lock, Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import { getLiveAudioTrack } from '@/lib/maharaja/audio';
import { getEventOption, isEventId, type EventId } from '@/lib/maharaja/config';

export default function ResultClient({
  sessionId,
  accessCode = '',
  onBack,
  initialRetryUsed = false,
  onRetryUsed,
  initialAllowances,
}: {
  sessionId: string;
  accessCode?: string;
  onBack?: () => void;
  initialRetryUsed?: boolean;
  onRetryUsed?: () => void;
  initialAllowances?: any;
}) {
  const router = useRouter();
  const [showLiveConsent, setShowLiveConsent] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);
  const [thankYouMode, setThankYouMode] = useState<'download' | 'live' | null>(null);
  const [liveFarewell, setLiveFarewell] = useState(false);
  const [showroomConsent, setShowroomConsent] = useState(false);
  const [promotionConsent, setPromotionConsent] = useState(false);
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [category, setCategory] = useState<'women' | 'men' | 'girl' | 'boy'>('women');
  const [showMenu, setShowMenu] = useState(false);
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
  const [liveVideoUrl, setLiveVideoUrl] = useState<string | null>(null);
  const [masterImageUrl, setMasterImageUrl] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string>(sessionId ? `video_${sessionId}` : '');
  const [videoStatus, setVideoStatus] = useState<'processing' | 'ready' | 'failed'>('processing');
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(true);
  const [retryUsed, setRetryUsed] = useState(initialRetryUsed);
  const [allowances, setAllowances] = useState<any>(initialAllowances || null);
  const [videoDone, setVideoDone] = useState(false);

  const enforceLimits = allowances?.enforceRepeatLimits ?? false;
  const imageAllowanceUsed = allowances?.masterImage?.used ?? (retryUsed ? 2 : 1);
  const videoAllowanceUsed = allowances?.video?.used ?? (videoDone || videoUrl ? 1 : 0);
  const imageExhausted = enforceLimits && imageAllowanceUsed >= 2;
  const videoExhausted = enforceLimits && videoAllowanceUsed >= 2;
  const videoManagerAuthorized = !enforceLimits || Boolean(allowances?.video?.managerAuthorized);
  const canRetryVideo = !enforceLimits || (!videoExhausted && (videoAllowanceUsed === 0 || videoManagerAuthorized));
  const canRetryImage = !enforceLimits || !imageExhausted;

  const whatsappSendRequested = useRef(false);
  const liveAudioUrl = useMemo(() => getLiveAudioTrack(sessionId, eventId), [sessionId, eventId]);
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
          if (['women', 'men', 'girl', 'boy'].includes(data.category)) setCategory(data.category);
          if (data.masterImageUrl) {
            setMasterImageUrl(data.masterImageUrl);
          }
          if (data.liveVideoUrl) {
            setLiveVideoUrl(data.liveVideoUrl);
          }
          if (data.allowances) {
            setAllowances(data.allowances);
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
        timer = setTimeout(checkVideoStatus, 2000);
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

  const fetchDownloadBlob = async (url: string, watermark = false) => {
    try {
      if (!watermark) {
        const directRes = await fetch(url);
        if (directRes.ok) return await directRes.blob();
      }
    } catch {
      // Cross-origin Firebase signed URLs often block browser-side blob reads.
    }

    const proxyRes = await fetch('/api/download/asset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, watermark }),
    });

    if (!proxyRes.ok) {
      const payload = await proxyRes.json().catch(() => null);
      throw new Error(payload?.error || 'Download failed.');
    }

    return await proxyRes.blob();
  };

  const downloadAsset = async (url: string, filename: string, watermark = false) => {
    const blob = await fetchDownloadBlob(url, watermark);
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
      await downloadAsset(masterImageUrl, `Maharaja-${eventLabel}-Master-${sessionId}.jpg`, true);
    }
    if (videoUrl) {
      const extension = videoUrl.includes('.webm') ? 'webm' : 'mp4';
      await downloadAsset(videoUrl, `Maharaja-${eventLabel}-Video-${sessionId}.${extension}`, false);
    }
    // Downloading the video must NOT complete or void the billing pass. The pass remains valid for its full window.
  };

  const handleDownload = async () => {
    try {
      await executeDownload();
      setThankYouMode('download');
      setShowThankYou(true);
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : 'Download failed.');
    }
  };

  const handleConfirmGoLive = async () => {
    const isMinor = category === 'girl' || category === 'boy';
    if (!showroomConsent || (isMinor && !guardianConsent)) return;
    if (!customerName.trim() || !customerLocality.trim()) {
      setLiveError('Enter customer name and locality for the Maharaja TV greeting.');
      return;
    }
    setIsGoingLive(true);
    setLiveError(null);

    try {
      const res = await fetch('/api/live/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          videoId: videoId || `video_${sessionId}`,
          videoUrl: liveVideoUrl || videoUrl || undefined,
          liveVideoUrl: liveVideoUrl || undefined,
          customerName: customerName.trim(),
          customerLocality: customerLocality.trim(),
          liveAudioUrl,
          accessCode,
          category,
          showroomConsent,
          guardianConsent: isMinor ? guardianConsent : false,
          promotionConsent: isMinor ? false : promotionConsent,
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

  const handleRetryVideo = async () => {
    if (enforceLimits && videoExhausted) {
      setVideoError('Cinematic Video limit reached (2/2 used). Retries are exhausted for this mobile number.');
      return;
    }
    if (enforceLimits && videoAllowanceUsed >= 1 && !videoManagerAuthorized) {
      setVideoError('Store manager authorization is required before retrying the Cinematic Video.');
      return;
    }
    setShowMenu(false);
    setIsLoadingVideo(true);
    setVideoStatus('processing');
    setVideoUrl(null);
    try {
      await fetch('/api/maharaja/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'retry',
          label: 'Customer AI Video retry (backup prompt)',
          sessionId,
          accessCode,
          target: 'video',
          service: 'ai-video',
        }),
      });

      const startRes = await fetch('/api/video/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          accessCode,
          eventId,
          masterImageUrl,
          retry: true,
          retryMode: 'backup-locked',
          conceptPrompt: 'FAIL-SAFE REGENERATION MODE. RETRY STABILIZED FASHION COMMERCIAL MODE.',
        }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) {
        throw new Error(startData.error || 'Failed to start retry video.');
      }
      if (startData.allowances) {
        setAllowances(startData.allowances);
      }
    } catch (err: any) {
      console.error('Video retry error:', err);
      setVideoStatus('failed');
      setVideoError(err.message || 'Retry video generation could not be completed.');
      setIsLoadingVideo(false);
    }
  };

  const handleRetryImage = async () => {
    if (enforceLimits && imageExhausted) {
      setLiveError('Celebration Image limit reached (2/2 used). Retries are exhausted for this mobile number.');
      return;
    }
    setShowMenu(false);
    try {
      await fetch('/api/maharaja/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'retry',
          label: 'Customer AI Image re-upload retry',
          sessionId,
          accessCode,
          target: 'image',
          service: 'ai-video',
        }),
      });
      onRetryUsed?.();
    } catch (err) {
      console.warn('Image retry log warning:', err);
    }
    if (onBack) {
      onBack();
    } else {
      router.push(accessCode ? `/maharaja/video/${encodeURIComponent(accessCode)}?retry=${encodeURIComponent(sessionId)}` : '/maharaja/workspace');
    }
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

          <p className="mt-7 text-xs font-semibold text-[#F3E5AB]/55">Thank you for experiencing the Maharaja AI visual celebration.</p>
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
          {/* Top-Right Client Logo */}
          <div className="pointer-events-none absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-full border border-[#D4AF37]/50 bg-black/60 px-2 py-1 backdrop-blur-sm shadow-md">
            <img src="/maharaja-logo.png" alt="Maharaja Silks" className="h-4 w-4 rounded-full object-contain" />
            <span className="text-[10px] font-bold tracking-wider uppercase text-[#F3E5AB]">Maharaja</span>
          </div>

          {/* Top-Left Three-Dot Options Menu */}
          <div className="absolute left-3 top-3 z-20">
            <button
              type="button"
              onClick={() => setShowMenu((prev) => !prev)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#D4AF37]/50 bg-black/65 text-[#D4AF37] backdrop-blur-sm hover:bg-black/90 transition shadow-lg"
              aria-label="Options menu"
              title="Options"
            >
              <MoreVertical className="h-4 w-4" />
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-30 cursor-default"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute left-0 top-10 z-40 w-64 rounded-lg border border-[#D4AF37]/60 bg-[#170203]/95 p-2 shadow-2xl backdrop-blur-md text-left space-y-2 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2 py-1 border-b border-[#D4AF37]/20 text-[10px] font-bold uppercase tracking-wider text-[#D4AF37] space-y-1">
                    <div className="flex items-center justify-between">
                      <span>Celebration Image</span>
                      <span className="font-mono text-[10px] text-[#F3E5AB]">{imageAllowanceUsed}/2</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Cinematic Video</span>
                      <span className="font-mono text-[10px] text-[#F3E5AB]">{videoAllowanceUsed}/2</span>
                    </div>
                  </div>

                  {/* Video Retry */}
                  {!videoExhausted ? (
                    canRetryVideo ? (
                      <button
                        type="button"
                        onClick={handleRetryVideo}
                        className="w-full flex items-start gap-2.5 rounded-md px-2.5 py-2 text-xs font-semibold text-[#F3E5AB] hover:bg-[#6e0d1f]/60 hover:text-white transition"
                      >
                        <RotateCcw className="h-4 w-4 text-[#D4AF37] mt-0.5 shrink-0" />
                        <div>
                          <div className="font-bold">Retry Video</div>
                          <div className="text-[10px] text-gray-300 font-normal">
                            Regenerate with backup prompt {enforceLimits ? `(${2 - videoAllowanceUsed} left)` : '(Unlimited Test Mode)'}
                          </div>
                        </div>
                      </button>
                    ) : (
                      <div className="rounded border border-amber-500/40 bg-black/40 p-2 text-[10px] text-amber-200">
                        <div className="font-bold flex items-center gap-1"><Lock className="h-3 w-3" /> Manager Authorization Required</div>
                        <p className="mt-0.5 text-zinc-300">Video retry (1/2 used) requires store manager approval before generating.</p>
                      </div>
                    )
                  ) : (
                    <div className="rounded border border-red-500/30 bg-black/40 p-2 text-[10px] text-red-300">
                      <div className="font-bold">Cinematic Video Limit Reached</div>
                      <p className="mt-0.5 text-zinc-400">2/2 video generations used. Retries are exhausted for this mobile pass.</p>
                    </div>
                  )}

                  {/* Image Retry */}
                  {!imageExhausted ? (
                    <button
                      type="button"
                      onClick={handleRetryImage}
                      className="w-full flex items-start gap-2.5 rounded-md px-2.5 py-2 text-xs font-semibold text-[#F3E5AB] hover:bg-[#6e0d1f]/60 hover:text-white transition"
                    >
                      <ImageIcon className="h-4 w-4 text-[#D4AF37] mt-0.5 shrink-0" />
                      <div>
                        <div className="font-bold">Retry Image</div>
                        <div className="text-[10px] text-gray-300 font-normal">
                          Re-upload photos & start fresh {enforceLimits ? `(${2 - imageAllowanceUsed} left)` : '(Unlimited Test Mode)'}
                        </div>
                      </div>
                    </button>
                  ) : (
                    <div className="rounded border border-red-500/30 bg-black/40 p-2 text-[10px] text-red-300">
                      <div className="font-bold">Celebration Image Limit Reached</div>
                      <p className="mt-0.5 text-zinc-400">2/2 image generations used. Retries are exhausted for this mobile pass.</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <video
            src={videoUrl}
            controls
            loop
            playsInline
            className="w-full h-full object-cover"
          />
        </div>

        {/* Primary Action Buttons */}
        <div className="space-y-3 pt-2">
          <button
            onClick={() => void handleDownload()}
            className="w-full rounded-lg bg-[#D4AF37] px-6 py-4 text-sm font-bold uppercase tracking-wider text-black shadow-xl transition hover:brightness-105 flex items-center justify-center gap-3"
          >
            <Download className="w-5 h-5 fill-black" /> DOWNLOAD IMAGE + VIDEO
          </button>

          <button
            onClick={() => {
              setShowroomConsent(false);
              setPromotionConsent(false);
              setGuardianConsent(false);
              setShowLiveConsent(true);
            }}
            className="w-full rounded-lg border border-[#D4AF37]/50 bg-[#800A1D] px-6 py-4 text-sm font-bold uppercase tracking-wider text-[#F3E5AB] shadow-xl transition hover:brightness-110 flex items-center justify-center gap-3"
          >
            <Tv className="w-5 h-5 text-[#D4AF37]" /> GO LIVE ON MAHARAJA SCREEN
          </button>

          <div className="rounded-lg border border-[#D4AF37]/25 bg-black/45 p-3 text-[11px] leading-5 text-[#F3E5AB]/80">
            Download saves the approved image and video. Go Live also downloads both files, then sends the video to the showroom TV with festival music and Tamil greeting.
          </div>

          <p className="px-2 text-[11px] leading-5 text-[#F3E5AB]/65">
            AI Video media is retained temporarily for delivery and removed within 4 days unless an adult separately permits promotional use. Anonymous usage totals may be retained.{' '}
            <Link href="/privacy" className="font-semibold text-[#D4AF37] underline underline-offset-2">Privacy &amp; Data Use</Link>
          </p>

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
                Your image and video download has started. Thank you for experiencing the Maharaja AI visual celebration.
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
                checked={showroomConsent}
                onChange={(e) => setShowroomConsent(e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-[#D4AF37]"
              />
              <span className="text-xs text-gray-200">
                Allow Maharaja to display this video on the showroom TV during the temporary 4-day period.
              </span>
            </label>

            {(category === 'girl' || category === 'boy') ? (
              <label className="flex items-start gap-3 p-3 rounded-md bg-black/60 border border-[#D4AF37]/30 cursor-pointer">
                <input type="checkbox" checked={guardianConsent} onChange={(e) => setGuardianConsent(e.target.checked)} className="w-5 h-5 mt-0.5 accent-[#D4AF37]" />
                <span className="text-xs text-gray-200">I confirm that I am the parent or legal guardian and permit this child&apos;s video to appear on the showroom TV. Social-media promotion is disabled for children.</span>
              </label>
            ) : (
              <label className="flex items-start gap-3 p-3 rounded-md bg-black/60 border border-[#D4AF37]/30 cursor-pointer">
                <input type="checkbox" checked={promotionConsent} onChange={(e) => setPromotionConsent(e.target.checked)} className="w-5 h-5 mt-0.5 accent-[#D4AF37]" />
                <span className="text-xs text-gray-200">Optional: allow Maharaja to retain and use this creation on its official Instagram and promotional channels.</span>
              </label>
            )}

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
                disabled={!showroomConsent || ((category === 'girl' || category === 'boy') && !guardianConsent) || isGoingLive}
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
