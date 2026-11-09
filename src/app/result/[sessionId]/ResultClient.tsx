'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, Tv, Sparkles, RotateCcw, AlertCircle, ExternalLink, MessageCircle } from 'lucide-react';
import HelpRetry, { HELP_TEXT } from '@/components/HelpRetry';
import { getEventOption, type EventId } from '@/lib/maharaja/config';
import { useLeadGate } from '@/components/LeadGate';

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
  storeName: storeNameProp = '',
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
  /** Kept for older callers; the screen always carries the store's own header now. */
  embedded?: boolean;
  /** The store's own name, shown instead of the Maharaja branding for every other store. */
  storeName?: string;
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
  const [videoRetryClosed, setVideoRetryClosed] = useState(false);
  const [retrySubmitting, setRetrySubmitting] = useState(false);

  // The store's own Instagram (set in its AI Video section); hidden when the store has none.
  const [instagramUrl, setInstagramUrl] = useState('');
  const [storeName, setStoreName] = useState('');
  const shownName = storeName || storeNameProp;
  const store = shownName.replace(/^The\s+/i, '') || 'Maharaja';
  // Nothing downloads or shares on its own: the customer gives a WhatsApp number first.
  const leadGate = useLeadGate({ kind: 'pass', ref: accessCode, source: 'ai-video' });
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
        setAllowGoLive(data.allowGoLive === true);
        setInstagramUrl(typeof data.instagramUrl === 'string' ? data.instagramUrl : '');
        setStoreName(typeof data.clientName === 'string' ? data.clientName : '');
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

  const fetchDownloadBlob = async (kind: 'image' | 'video' | 'bundle', leadToken: string) => {
    const proxyRes = await fetch('/api/download/asset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, accessCode, jobId: videoJobId, kind, leadToken }),
    });

    if (!proxyRes.ok) {
      const payload = await proxyRes.json().catch(() => null);
      if (payload?.leadRequired) leadGate.forgetLead();
      throw new Error(payload?.error || 'Download failed.');
    }

    return await proxyRes.blob();
  };

  const downloadFileName = (kind: 'image' | 'video' | 'bundle') => (kind === 'bundle'
    ? `${store.replace(/[^a-z0-9]+/gi, '-')}-${eventLabel}-${sessionId}.zip`
    : kind === 'image'
    ? `${store.replace(/[^a-z0-9]+/gi, '-')}-${eventLabel}-Master-${sessionId}.jpg`
    : `${store.replace(/[^a-z0-9]+/gi, '-')}-${eventLabel}-Video-${sessionId}.mp4`);

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

  const downloadAsset = async (kind: 'image' | 'video' | 'bundle', leadToken: string) => {
    const blob = await fetchDownloadBlob(kind, leadToken);
    triggerFileDownload(blob, downloadFileName(kind));
  };


  /**
   * Saves the image and video as two separate files so phones can put them in
   * the gallery. Prefers the native share sheet ("Save to Photos"); falls back
   * to two individual downloads, and only then to the ZIP bundle.
   * Returns 'cancelled' when the customer dismisses the share sheet.
   */
  const saveImageAndVideo = async (leadToken: string): Promise<'shared' | 'downloaded' | 'cancelled'> => {
    let imageBlob: Blob;
    let videoBlob: Blob;
    try {
      [imageBlob, videoBlob] = await Promise.all([fetchDownloadBlob('image', leadToken), fetchDownloadBlob('video', leadToken)]);
    } catch {
      await downloadAsset('bundle', leadToken);
      return 'downloaded';
    }
    const files = [
      new File([imageBlob], downloadFileName('image'), { type: 'image/jpeg' }),
      new File([videoBlob], downloadFileName('video'), { type: 'video/mp4' }),
    ];
    if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files })) {
      try {
        await navigator.share({ files, title: `${store} ${eventLabel} AI film` });
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

  const handleDownloadBundle = (showConfirmation = true) => leadGate.withLead((leadToken) => saveBundle(leadToken, showConfirmation));

  const saveBundle = async (leadToken: string, showConfirmation: boolean) => {
    if (downloading) return;
    setDownloading('bundle');
    setLiveError(null);
    try {
      const outcome = await saveImageAndVideo(leadToken);
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

  // Shares the film itself where the phone allows (WhatsApp appears in the share sheet); otherwise opens WhatsApp with a message.
  const handleWhatsAppShare = () => leadGate.withLead((leadToken) => shareOnWhatsApp(leadToken));

  const shareOnWhatsApp = async (leadToken: string) => {
    const message = `My ${eventLabel} AI fashion film${storeName ? ` from ${storeName}` : ''}!${instagramUrl ? ` ${instagramUrl}` : ''}`;
    try {
      const blob = await fetchDownloadBlob('video', leadToken);
      const file = new File([blob], downloadFileName('video'), { type: 'video/mp4' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: message });
        return;
      }
    } catch (shareError) {
      if ((shareError as { name?: string })?.name === 'AbortError') return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const handleVideoRetry = async () => {
    // Help has already asked "Do you need to retry this video?"; there is no second question.
    if (retrySubmitting || !accessCode || !videoUrl) return;
    setRetrySubmitting(true);
    setLiveError(null);
    try {
      const response = await fetch('/api/maharaja/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'retry', target: 'video', service: 'ai-video', label: 'Customer video retry', accessCode, sessionId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        // 403 means the rule actually refuses a retry (used up, or not available yet): Help now shows
        // the tips and who can help. Anything else (409 busy, a network hiccup, a 5xx) is transient —
        // the retry was never used, so Help keeps offering it.
        if (response.status === 403) setVideoRetryClosed(true);
        throw new Error(data.error || 'Video retry is unavailable.');
      }
      if (onBack) onBack();
      else router.push(`/maharaja/catalogue/${encodeURIComponent(accessCode)}`);
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
      setThankYouMode('live');
      setLiveFarewell(true);
    } catch (caught) {
      setLiveError(caught instanceof Error ? caught.message : 'Go Live failed.');
    } finally {
      setGoLiveSubmitting(false);
    }
  };

  // Nothing saves on its own: the customer taps Download (after giving a WhatsApp number).

  const storeInitial = store.charAt(0) || 'S';
  const isChild = category === 'girl' || category === 'boy';
  const rupees = (value: number) => `₹${new Intl.NumberFormat('en-IN').format(value)}`;
  // The store's header: initial and name, with Help (the video retry) once the video is ready.
  const header = (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur-md">
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-base font-bold text-white">{storeInitial}</span>
        <p className="min-w-0 flex-1 truncate font-bold">{shownName || 'AI Video'}</p>
        {videoStatus === 'ready' && videoUrl && !liveSuccess && (
          <HelpRetry text={HELP_TEXT.video} canRetry={Boolean(accessCode) && !videoRetryClosed} busy={retrySubmitting} onRetry={() => void handleVideoRetry()} />
        )}
      </div>
    </header>
  );

  // After Go Live: where the video is in the store's queue, with Download and Share.
  if (liveFarewell) {
    return (
      <main className="min-h-screen bg-canvas pb-10 text-ink">
        {header}
        <div className="mx-auto max-w-xl space-y-4 px-4 py-6 text-center">
          <Sparkles className="mx-auto h-9 w-9 text-brand" />
          <h1 className="text-2xl font-bold">Thank you for your purchase</h1>
          <p className="mx-auto max-w-sm text-[15px] text-muted">Your {eventLabel} video is on its way to the {store} showroom screen.</p>
          <div className="rounded-2xl border border-line bg-white p-4">
            <p className="text-sm font-semibold text-muted">On the showroom screen</p>
            <p className="mt-1 text-lg font-bold">
              {liveQueueStatus === 'playing'
                ? liveTimesPlayed >= 1 ? 'Playing again now' : 'Playing now'
                : liveQueueStatus === 'reserved'
                ? 'Getting ready to play'
                : liveQueueStatus === 'completed'
                ? 'Played, and in the screen’s loop for today'
                : liveQueueStatus === 'playback_failed'
                ? 'Our staff are checking the screen'
                : typeof peopleAhead === 'number' && peopleAhead > 0
                ? `Number ${queueNumber || '--'} · ${peopleAhead} ahead of you`
                : `In the queue${queueNumber ? ` · number ${queueNumber}` : ''}`}
            </p>
          </div>
          <div className="space-y-3 pt-2">
            <button type="button" onClick={() => void handleDownloadBundle(false)} disabled={Boolean(downloading) || !masterImageUrl || !videoUrl} className="tf-btn tf-btn-primary !min-h-14 w-full text-base">
              <Download className="h-5 w-5" /> {downloading ? 'Preparing…' : 'Download image and video'}
            </button>
            <button type="button" onClick={() => void handleWhatsAppShare()} className="tf-btn tf-btn-secondary !min-h-14 w-full text-base">
              <MessageCircle className="h-5 w-5" /> Share on WhatsApp
            </button>
            {instagramUrl && <a href={instagramUrl} target="_blank" rel="noreferrer" className="tf-btn tf-btn-secondary !min-h-14 w-full text-base"><ExternalLink className="h-5 w-5" /> Follow {store} on Instagram</a>}
          </div>
        </div>
        {leadGate.dialog}
      </main>
    );
  }

  if (!sessionId) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-canvas p-6 text-center text-ink">
        <AlertCircle className="mb-4 h-10 w-10 text-danger" />
        <p className="text-lg font-bold">This video link is not valid.</p>
        <p className="mt-2 text-sm text-muted">Please ask the store for a new QR.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas pb-10 text-ink">
      {header}
      <div className="mx-auto max-w-xl space-y-4 px-4 py-5">
        {videoStatus === 'failed' ? (
          <div className="space-y-4 rounded-2xl bg-white p-8 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-danger" />
            <h2 className="text-xl font-bold">The video could not be made</h2>
            <p className="text-sm text-muted">{videoError || 'Nothing was used. Please make it again.'}</p>
            <button
              type="button"
              onClick={() => { if (onBack) onBack(); else router.push(accessCode ? `/maharaja/catalogue/${encodeURIComponent(accessCode)}` : '/'); }}
              className="tf-btn tf-btn-primary !min-h-14 w-full text-base"
            >
              <RotateCcw className="h-5 w-5" /> Make my video again
            </button>
          </div>
        ) : isLoadingVideo || videoStatus === 'processing' || !videoUrl ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-white p-10 text-center">
            <Sparkles className="h-10 w-10 animate-pulse text-brand" />
            <p className="text-base font-semibold">Getting your {eventLabel} video ready… keep this page open.</p>
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-bold">Your video</h1>
              <p className="mt-1 text-[15px] text-muted">Your {eventLabel} film from {store}.</p>
            </div>
            {catalogueProduct && (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-3 text-sm">
                <span className="min-w-0 truncate font-semibold">{catalogueProduct.title}</span>
                {Number(catalogueProduct.price || 0) > 0 && <span className="shrink-0 font-bold tabular-nums">{rupees(Number(catalogueProduct.price))}</span>}
              </div>
            )}
            <div className="mx-auto aspect-[9/16] w-full max-w-sm overflow-hidden rounded-2xl bg-black">
              <video src={videoUrl} controls playsInline preload="auto" className="h-full w-full object-cover" />
            </div>

            <button type="button" onClick={() => void handleDownloadBundle()} disabled={Boolean(downloading) || !masterImageUrl || !videoUrl} className={`tf-btn ${allowGoLive ? 'tf-btn-secondary' : 'tf-btn-primary'} !min-h-14 w-full text-base`}>
              <Download className="h-5 w-5" /> {downloading ? 'Preparing…' : 'Download image and video'}
            </button>

            {allowGoLive && (
              <section className="space-y-3 rounded-2xl border border-line bg-white p-4">
                <div>
                  <h2 className="text-lg font-bold">Go Live on the store’s screen</h2>
                  <p className="mt-0.5 text-sm text-muted">Your video plays on the {store} showroom screen.</p>
                </div>
                <label className="block text-sm">
                  <span className="font-semibold">Name</span>
                  <input value={customerName} onChange={(event) => setCustomerName(event.target.value.slice(0, 48))} placeholder="Your name" autoComplete="name" className="mt-1 min-h-12 w-full rounded-xl border border-line-strong bg-white px-3 text-base outline-none focus:border-ink" />
                </label>
                <label className="block text-sm">
                  <span className="font-semibold">City</span>
                  <input value={customerLocality} onChange={(event) => setCustomerLocality(event.target.value.slice(0, 48))} placeholder="Your city" autoComplete="address-level2" className="mt-1 min-h-12 w-full rounded-xl border border-line-strong bg-white px-3 text-base outline-none focus:border-ink" />
                </label>
                <label className="flex items-start gap-3 text-[13px] text-ink">
                  <input type="checkbox" checked={liveConsent} onChange={(event) => setLiveConsent(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
                  <span>I agree that this video may play on the {store} showroom screen and stay in its loop for up to one day.</span>
                </label>
                <label className="flex items-start gap-3 text-[13px] text-ink">
                  <input type="checkbox" checked={promotionConsent} onChange={(event) => setPromotionConsent(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
                  <span>Optional: {store} may share this video on its official social media pages. Unticked, it plays on the showroom screen only.</span>
                </label>
                {isChild && (
                  <label className="flex items-start gap-3 rounded-xl bg-warn-soft p-3 text-[13px] text-ink">
                    <input type="checkbox" checked={guardianLiveConsent} onChange={(event) => setGuardianLiveConsent(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
                    <span>I am the parent or guardian and allow this child&apos;s video on the showroom screen.</span>
                  </label>
                )}
                <button type="button" onClick={() => void handleGoLive()} disabled={!liveConsent || (isChild && !guardianLiveConsent) || goLiveSubmitting || liveSuccess} className="tf-btn tf-btn-primary !min-h-14 w-full text-base">
                  <Tv className="h-5 w-5" /> {goLiveSubmitting ? 'Sending…' : liveSuccess ? 'Sent to the screen' : 'Go Live'}
                </button>
              </section>
            )}

            {liveError && (
              <p role="alert" className="flex items-start gap-2 rounded-2xl bg-danger-soft p-3 text-sm font-semibold text-danger"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {liveError}</p>
            )}

            <p className="text-center text-xs leading-5 text-muted">
              Your video is kept for 1 hour, or 1 day if it goes live, then deleted.{' '}
              <Link href="/privacy" className="font-semibold text-ink underline underline-offset-2">Privacy</Link>
            </p>
          </>
        )}
      </div>

      {showThankYou && thankYouMode !== 'live' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 text-center shadow-2xl">
            <Sparkles className="mx-auto h-8 w-8 text-brand" />
            <h2 className="text-xl font-bold">Saved to your phone</h2>
            <p className="text-sm text-muted">Thank you for visiting {store}.</p>
            <button type="button" onClick={() => void handleWhatsAppShare()} className="tf-btn tf-btn-primary !min-h-14 w-full text-base"><MessageCircle className="h-5 w-5" /> Share on WhatsApp</button>
            {instagramUrl && <a href={instagramUrl} target="_blank" rel="noreferrer" className="tf-btn tf-btn-secondary !min-h-14 w-full text-base"><ExternalLink className="h-5 w-5" /> Follow {store} on Instagram</a>}
            <button type="button" onClick={() => setShowThankYou(false)} className="min-h-11 w-full text-sm font-semibold text-muted">Close</button>
          </div>
        </div>
      )}
      {leadGate.dialog}
    </main>
  );
}
