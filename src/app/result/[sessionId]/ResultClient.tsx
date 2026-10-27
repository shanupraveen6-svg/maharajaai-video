'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, Tv, Sparkles, RotateCcw, AlertCircle, ExternalLink, MessageCircle, MoreVertical } from 'lucide-react';
import { getEventOption, type EventId } from '@/lib/maharaja/config';

export default function ResultClient({
  sessionId,
  accessCode = '',
  onBack,
  initialVideoJobId = '',
  initialVideoUrl = '',
  initialMasterImageUrl = '',
  initialEventId = 'diwali',
  allowGoLive: initialAllowGoLive = true,
  catalogueProduct: initialCatalogueProduct = null,
  embedded = false,
}: {
  sessionId: string;
  accessCode?: string;
  onBack?: () => void;
  initialVideoJobId?: string;
  initialVideoUrl?: string;
  initialMasterImageUrl?: string;
  initialEventId?: EventId;
  allowGoLive?: boolean;
  catalogueProduct?: { sku: string; title?: string; price?: number } | null;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [showThankYou, setShowThankYou] = useState(false);
  const [thankYouMode, setThankYouMode] = useState<'download' | 'live' | null>(null);
  const [liveFarewell, setLiveFarewell] = useState(false);
  const [liveSuccess, setLiveSuccess] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [queueId, setQueueId] = useState<string | null>(null);
  const [queueNumber, setQueueNumber] = useState<number | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [peopleAhead, setPeopleAhead] = useState<number | null>(null);
  const [liveQueueStatus, setLiveQueueStatus] = useState<'queued' | 'reserved' | 'playing' | 'completed' | 'playback_failed'>('queued');
  const [liveTimesPlayed, setLiveTimesPlayed] = useState(0);
  const [eventId, setEventId] = useState<EventId>(initialEventId);
  const [category, setCategory] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerLocality, setCustomerLocality] = useState('');
  const [videoJobId, setVideoJobId] = useState(initialVideoJobId);
  const [allowGoLive, setAllowGoLive] = useState(initialAllowGoLive);
  const [catalogueProduct, setCatalogueProduct] = useState(initialCatalogueProduct);

  const [videoUrl, setVideoUrl] = useState<string | null>(initialVideoUrl || null);
  const [masterImageUrl, setMasterImageUrl] = useState<string | null>(initialMasterImageUrl || null);
  const [videoStatus, setVideoStatus] = useState<'processing' | 'ready' | 'failed'>(initialVideoUrl ? 'ready' : 'processing');
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(!initialVideoUrl);
  const [downloading, setDownloading] = useState<'bundle' | null>(null);
  const [lastDownloaded, setLastDownloaded] = useState<'bundle' | null>(null);
  const [goLiveSubmitting, setGoLiveSubmitting] = useState(false);
  const [liveConsent, setLiveConsent] = useState(false);
  const [guardianLiveConsent, setGuardianLiveConsent] = useState(false);
  const [promotionConsent, setPromotionConsent] = useState(false);
  const [showRetryMenu, setShowRetryMenu] = useState(false);
  const [retrySubmitting, setRetrySubmitting] = useState(false);

  const instagramUrl = 'https://www.instagram.com/majestic__maharaja/?hl=en';
  const eventLabel = getEventOption(eventId).label;

  useEffect(() => {
    let active = true;
    async function loadResult() {
      try {
        const response = await fetch(`/api/video/result?sessionId=${encodeURIComponent(sessionId)}&accessCode=${encodeURIComponent(accessCode)}`, { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok || !data.success) throw new Error(data.error || 'The completed video could not be loaded.');
        setVideoJobId(data.jobId);
        setVideoUrl(data.videoUrl);
        setMasterImageUrl(data.masterImageUrl || null);
        setEventId(data.eventId || 'diwali');
        setCategory(data.category || null);
        setCustomerName(data.customerName || '');
        setCustomerLocality(data.customerLocality || '');
        setAllowGoLive(data.allowGoLive !== false);
        setCatalogueProduct(data.catalogueProduct || null);
        setVideoStatus('ready');
        if (data.queue?.queueId) {
          setQueueId(data.queue.queueId);
          setQueueNumber(data.queue.queueNumber || null);
          setLiveQueueStatus(data.queue.status || 'queued');
          setLiveSuccess(true);
          setCountdownSeconds(0);
        }
      } catch (caught) {
        if (!active) return;
        setVideoStatus('failed');
        setVideoError(caught instanceof Error ? caught.message : 'The completed video could not be loaded.');
      } finally {
        if (active) setIsLoadingVideo(false);
      }
    }
    if (sessionId && accessCode) void loadResult();
    return () => { active = false; };
  }, [sessionId, accessCode]);

  useEffect(() => {
    const storageKey = `maharaja:live-farewell:${sessionId}`;
    window.sessionStorage.removeItem(storageKey);
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
          setLiveTimesPlayed(Number(data.timesPlayed || 0));
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
  }, [liveSuccess, queueId, countdownSeconds, accessCode]);

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

  const fetchDownloadBlob = async (kind: 'image' | 'video' | 'bundle') => {
    const proxyRes = await fetch('/api/download/asset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, accessCode, jobId: videoJobId, kind }),
    });

    if (!proxyRes.ok) {
      const payload = await proxyRes.json().catch(() => null);
      throw new Error(payload?.error || 'Download failed.');
    }

    return await proxyRes.blob();
  };

  const downloadFileName = (kind: 'image' | 'video' | 'bundle') => (kind === 'bundle'
    ? `Maharaja-${eventLabel}-${sessionId}.zip`
    : kind === 'image'
    ? `Maharaja-${eventLabel}-Master-${sessionId}.jpg`
    : `Maharaja-${eventLabel}-Video-${sessionId}.mp4`);

  const triggerFileDownload = (blob: Blob, filename: string) => {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(objectUrl);
    }, 30000);
  };

  const downloadAsset = async (kind: 'image' | 'video' | 'bundle') => {
    const blob = await fetchDownloadBlob(kind);
    triggerFileDownload(blob, downloadFileName(kind));
  };

  /**
   * Saves the image and video as two separate files so phones can put them in
   * the gallery. Prefers the native share sheet ("Save to Photos"); falls back
   * to two individual downloads, and only then to the ZIP bundle.
   * Returns 'cancelled' when the customer dismisses the share sheet.
   */
  const saveImageAndVideo = async (): Promise<'shared' | 'downloaded' | 'cancelled'> => {
    let imageBlob: Blob;
    let videoBlob: Blob;
    try {
      [imageBlob, videoBlob] = await Promise.all([fetchDownloadBlob('image'), fetchDownloadBlob('video')]);
    } catch {
      await downloadAsset('bundle');
      return 'downloaded';
    }
    const files = [
      new File([imageBlob], downloadFileName('image'), { type: 'image/jpeg' }),
      new File([videoBlob], downloadFileName('video'), { type: 'video/mp4' }),
    ];
    if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files })) {
      try {
        await navigator.share({ files, title: `Maharaja ${eventLabel} AI film` });
        return 'shared';
      } catch (shareError: any) {
        if (shareError?.name === 'AbortError') return 'cancelled';
        // NotAllowedError (share sheet blocked after network wait) falls through to downloads.
      }
    }
    triggerFileDownload(imageBlob, downloadFileName('image'));
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    triggerFileDownload(videoBlob, downloadFileName('video'));
    return 'downloaded';
  };

  const handleDownloadBundle = async (showConfirmation = true) => {
    if (downloading) return;
    setDownloading('bundle');
    setLiveError(null);
    try {
      const outcome = await saveImageAndVideo();
      if (outcome === 'cancelled') return;
      await fetch('/api/maharaja/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'download', label: `${eventLabel} image and video downloaded`, sessionId, accessCode }),
      }).catch(() => undefined);
      if (showConfirmation) {
        setLastDownloaded('bundle');
        setThankYouMode('download');
        setShowThankYou(true);
      }
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setDownloading(null);
    }
  };

  const handleWhatsAppShare = () => {
    const message = `My ${eventLabel} Maharaja AI film is now in the showroom queue. Thank you, Maharaja!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const handleVideoRetry = async () => {
    if (retrySubmitting || !accessCode || !videoUrl || !window.confirm('Use your included video retry? Your current film remains available to Maharaja.')) return;
    setRetrySubmitting(true);
    setLiveError(null);
    try {
      const response = await fetch('/api/maharaja/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'retry', target: 'video', service: 'ai-video', label: 'Customer video retry', accessCode, sessionId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Video retry is unavailable.');
      if (onBack) onBack();
      else router.push(`/maharaja/video/${encodeURIComponent(accessCode)}?retry=${encodeURIComponent(sessionId)}`);
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : 'Video retry is unavailable.');
    } finally {
      setRetrySubmitting(false);
    }
  };

  const handleGoLive = async () => {
    const childCategory = category === 'girl' || category === 'boy';
    if (!liveConsent || (childCategory && !guardianLiveConsent) || goLiveSubmitting || !videoJobId) return;
    setGoLiveSubmitting(true);
    setLiveError(null);
    try {
      const response = await fetch('/api/live/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          accessCode,
          jobId: videoJobId,
          liveConsent,
          loopConsent: liveConsent,
          guardianConsent: guardianLiveConsent,
          promotionConsent,
          customerName,
          customerLocality,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'The video could not be added to the showroom queue.');
      setQueueId(data.queueId);
      setQueueNumber(data.queueNumber || null);
      setLiveQueueStatus(data.status || 'queued');
      setLiveSuccess(true);
      setCountdownSeconds(0);
      setLiveFarewell(true);
      await saveImageAndVideo().catch(() => {
        setLiveError('Your TV queue is confirmed. Tap Download below if the image and video did not save.');
      });
      setThankYouMode('live');
      setLiveFarewell(true);
    } catch (caught) {
      setLiveError(caught instanceof Error ? caught.message : 'Go Live failed.');
    } finally {
      setGoLiveSubmitting(false);
    }
  };

  if (liveFarewell) {
    return (
      <main className="min-h-screen bg-[#070609] text-[#F8F5EE]">
        {!embedded && <header className="border-b border-[#D4AF37]/30 bg-[#21090E] px-5 py-5 text-[#F3E5AB]"><div className="mx-auto max-w-5xl"><p className="text-xs font-bold uppercase text-[#D4AF37]">Majestic Maharaja · powered by TryFocus</p><h1 className="mt-1 font-serif text-2xl font-bold">Maharaja AI Experience</h1></div></header>}
        <div className="flex justify-center px-5 py-10 text-center">
        <section className="w-full max-w-lg">
          <img src="/maharaja-logo.png" alt="Majestic Maharaja" className="mx-auto h-24 w-24 border border-[#D4AF37]/45 object-cover shadow-xl" />
          <Sparkles className="mx-auto mt-7 h-9 w-9 text-[#D4AF37]" />
          <h1 className="mt-4 font-serif text-3xl font-black text-[#F3E5AB]">Thank you for your purchase</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#F3E5AB]/80">
            Your {eventLabel} AI film has been sent to the Maharaja showroom screen.
          </p>

          <div className="mt-7 border-y border-[#D4AF37]/30 py-5">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D4AF37]">Maharaja TV Status</p>
            <p className="mt-2 text-base font-bold text-[#F3E5AB]">
              {liveQueueStatus === 'playing'
                ? liveTimesPlayed >= 1 ? 'Second playback on showroom TV' : 'Playing on showroom TV'
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
            <button
              type="button"
              onClick={() => void handleDownloadBundle(false)}
              disabled={Boolean(downloading) || !masterImageUrl || !videoUrl}
              className="flex min-h-11 w-full items-center justify-center gap-2 bg-[#D4AF37] px-3 text-xs font-bold uppercase text-black disabled:opacity-45"
            >
              <Download className="h-4 w-4" /> {downloading ? 'Preparing downloads' : 'Download image & video'}
            </button>
            <button type="button" onClick={handleWhatsAppShare} className="flex w-full items-center justify-center gap-2 border border-[#25D366] bg-transparent px-5 py-3 text-sm font-black text-[#7BE495]">
              <MessageCircle className="h-5 w-5" /> Share on WhatsApp
            </button>
            <a href={instagramUrl} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 bg-[#D4AF37] px-5 py-3 text-sm font-black uppercase tracking-wider text-black">
              <ExternalLink className="h-5 w-5" /> Follow Maharaja
            </a>
          </div>

          <p className="mt-7 text-xs font-semibold text-[#F3E5AB]/55">Thank you for experiencing the Maharaja AI visual celebration.</p>
        </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070609] text-[#F8F5EE] p-4 md:p-8 font-sans max-w-lg mx-auto relative">
      {!embedded && <div className="mb-5 border-b border-[#D4AF37]/30 pb-4"><p className="text-xs font-bold uppercase text-[#D4AF37]">Majestic Maharaja · powered by TryFocus</p><p className="mt-1 font-serif text-2xl font-bold text-[#F3E5AB]">Maharaja AI Experience</p></div>}
      
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
      <header className="relative flex justify-between items-center border-b border-[#D4AF37]/20 pb-4 mb-6">
        <div className="flex items-center gap-2">
          <img src="/maharaja-logo.png" alt="" className="h-7 w-7 object-cover" />
          <h1 className="text-base font-serif font-bold text-[#F3E5AB] tracking-widest uppercase">
            MAHARAJA {eventLabel.toUpperCase()} FILM
          </h1>
        </div>
        {videoStatus === 'ready' && videoUrl && !liveSuccess && <div className="relative shrink-0">
          <button type="button" aria-label="Video options" title="Video options" onClick={() => setShowRetryMenu((value) => !value)} className="flex h-10 w-10 items-center justify-center border border-[#D4AF37]/45 text-[#D4AF37]"><MoreVertical className="h-5 w-5" /></button>
          {showRetryMenu && <div className="absolute right-0 top-11 z-40 w-40 border border-[#D4AF37]/50 bg-[#21090E] p-1 shadow-xl"><button type="button" disabled={retrySubmitting} onClick={() => { setShowRetryMenu(false); void handleVideoRetry(); }} className="flex min-h-10 w-full items-center gap-2 px-2 text-left text-xs font-bold disabled:opacity-50"><RotateCcw className="h-4 w-4" /> Retry video</button></div>}
        </div>}
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
          {catalogueProduct && (
            <div className="border border-[#D4AF37]/35 bg-[#21090E] p-4">
              <p className="text-[10px] font-bold uppercase text-[#D4AF37]">AI Video Gift Link</p>
              <p className="mt-1 font-serif text-lg font-bold text-[#F3E5AB]">{catalogueProduct.title}</p>
              <p className="mt-1 font-bold text-[#D4AF37]">Rs {new Intl.NumberFormat('en-IN').format(catalogueProduct.price || 0)}</p>
            </div>
          )}
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

          <video
            src={videoUrl}
            controls
            playsInline
            preload="auto"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Primary Action Buttons */}
        <div className="space-y-3 pt-2">
          <button
            type="button"
            onClick={() => void handleDownloadBundle()}
            disabled={Boolean(downloading) || !masterImageUrl || !videoUrl}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-3 text-xs font-bold uppercase text-black disabled:opacity-45"
          >
            <Download className="h-4 w-4" /> {downloading ? 'Preparing downloads' : 'Download image & video'}
          </button>

          {allowGoLive && <>
          <label className="flex items-start gap-3 rounded-lg border border-[#D4AF37]/30 bg-black/45 p-3 text-left text-[11px] leading-5 text-[#F3E5AB]/80">
            <input
              type="checkbox"
              checked={liveConsent}
              onChange={(event) => setLiveConsent(event.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#D4AF37]"
            />
            <span>I agree that this video may play on the Maharaja showroom TV and remain in its approved loop for up to three days.</span>
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-[#D4AF37]/30 bg-black/45 p-3 text-left text-[11px] leading-5 text-[#F3E5AB]/80">
            <input type="checkbox" checked={promotionConsent} onChange={(event) => setPromotionConsent(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D4AF37]" />
            <span>Optional: I permit Maharaja to select and share this finished video on its official social media pages. Leaving this unchecked allows showroom TV playback only.</span>
          </label>

          <div className="space-y-3 rounded-lg border border-[#D4AF37]/25 bg-black/35 p-4 text-left text-xs leading-5 text-[#F3E5AB]/80">
            <p className="font-semibold text-[#D4AF37]">Showroom display details</p>
            <label className="block space-y-1">
              <span>Name</span>
              <input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value.slice(0, 48))}
                placeholder="Your name"
                autoComplete="name"
                className="min-h-11 w-full rounded-md border border-[#D4AF37]/35 bg-black/40 px-3 text-sm text-white outline-none placeholder:text-[#F3E5AB]/45 focus:border-[#D4AF37]"
              />
            </label>
            <label className="block space-y-1">
              <span>City</span>
              <input
                value={customerLocality}
                onChange={(event) => setCustomerLocality(event.target.value.slice(0, 48))}
                placeholder="Thanjavur"
                autoComplete="address-level2"
                className="min-h-11 w-full rounded-md border border-[#D4AF37]/35 bg-black/40 px-3 text-sm text-white outline-none placeholder:text-[#F3E5AB]/45 focus:border-[#D4AF37]"
              />
            </label>
          </div>

          {(category === 'girl' || category === 'boy') && (
            <label className="flex items-start gap-3 rounded-lg border border-[#D4AF37]/30 bg-black/45 p-3 text-left text-[11px] leading-5 text-[#F3E5AB]/80">
              <input
                type="checkbox"
                checked={guardianLiveConsent}
                onChange={(event) => setGuardianLiveConsent(event.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#D4AF37]"
              />
              <span>I confirm that I am the parent or legal guardian and permit this child&apos;s video to appear on the showroom TV and approved loop.</span>
            </label>
          )}

          <button
            type="button"
            onClick={() => void handleGoLive()}
            disabled={!liveConsent || ((category === 'girl' || category === 'boy') && !guardianLiveConsent) || goLiveSubmitting || liveSuccess}
            className="flex min-h-14 w-full items-center justify-center gap-3 rounded-lg bg-[#6E0D1F] px-6 text-sm font-bold uppercase tracking-wider text-[#F3E5AB] disabled:opacity-45"
          >
            <Tv className="h-5 w-5" /> {goLiveSubmitting ? 'Adding to TV queue' : liveSuccess ? 'Added to TV queue' : 'Go Live on Maharaja TV'}
          </button>
          </>}

          <p className="px-2 text-[11px] leading-5 text-[#F3E5AB]/65">
            AI Video media is retained temporarily for delivery and removed within 3 days unless an adult separately permits promotional use. Anonymous usage totals may be retained.{' '}
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
            <p className="text-xs font-bold uppercase text-[#D4AF37]">Majestic Maharaja · powered by TryFocus</p>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-[#D4AF37]/60 bg-[#6e0d1f]/80 text-[#F3E5AB]">
              <Sparkles className="h-7 w-7 text-[#D4AF37]" />
            </div>
            <div>
              <h2 className="font-serif text-2xl font-black text-[#F3E5AB]">
                Thank you for your purchase
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#F3E5AB]/80">
                Your image and video downloads have started. Thank you for experiencing the Maharaja AI visual celebration.
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
    </main>
  );
}
