'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Film,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Tv,
  X,
} from 'lucide-react';

type Look = {
  sku: string;
  title: string;
  imageUrl: string;
  downloadUrl: string;
  category?: string;
  garmentType?: string;
  gender?: string;
  garmentReferenceUrl?: string;
};

export default function PrivateLooksPage() {
  const { token } = useParams<{ token: string }>();
  const [looks, setLooks] = useState<Look[]>([]);
  const [active, setActive] = useState(0);
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // View state: 'image' (try-on photo) or 'video' (preview generated video)
  const [activeView, setActiveView] = useState<'image' | 'video'>('image');

  // Finding 1: Explicit opt-in consent (defaults to false)
  const [consentGoLive, setConsentGoLive] = useState(false);

  // Video generation state
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoProgressStep, setVideoProgressStep] = useState(0);
  const [videoError, setVideoError] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoJobId, setVideoJobId] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  // Auto-download tracking (runs once per look / video)
  const downloadedImagesRef = useRef<Record<string, boolean>>({});
  const downloadedVideoRef = useRef(false);
  const [downloadingManual, setDownloadingManual] = useState(false);

  // Header modal state for "Retry Image"
  const [showRetryImageModal, setShowRetryImageModal] = useState(false);

  const fetchLooks = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError('');
      const response = await fetch(`/api/tv/tryon-handoff/${encodeURIComponent(token)}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'These looks are unavailable.');
      setLooks(data.looks || []);
      setExpiresAt(data.expiresAt || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'These looks are unavailable.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchLooks();
  }, [fetchLooks]);

  const current = looks[active];

  // Reliable manual download helper using blob URLs
  const downloadAsset = async (url: string, filename: string) => {
    try {
      setDownloadingManual(true);
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    } catch {
      window.open(url, '_blank');
    } finally {
      setDownloadingManual(false);
    }
  };

  // Best-effort auto-download attempt on initial view
  useEffect(() => {
    if (!current?.downloadUrl) return;
    const key = `${current.sku || 'look'}_${active}`;
    if (downloadedImagesRef.current[key]) return;
    downloadedImagesRef.current[key] = true;

    try {
      const a = document.createElement('a');
      a.href = current.downloadUrl;
      a.download = `tryfocus-maharaja-${(current.sku || 'look').toLowerCase().replace(/[^a-z0-9_-]/g, '')}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.warn('Auto image download skipped:', err);
    }
  }, [current, active]);

  // Best-effort auto-download attempt once video is ready
  useEffect(() => {
    if (!videoUrl || downloadedVideoRef.current) return;
    downloadedVideoRef.current = true;

    try {
      const a = document.createElement('a');
      a.href = videoUrl;
      a.download = `tryfocus-maharaja-festival-video-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.warn('Auto video download skipped:', err);
    }
  }, [videoUrl]);

  // Poll video status until ready
  const pollVideoStatus = useCallback(
    async (jobId: string) => {
      let attempts = 0;
      const maxAttempts = 50;

      while (attempts < maxAttempts) {
        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, 2500));

        if (attempts === 2) setVideoProgressStep(1);
        if (attempts === 5) setVideoProgressStep(2);
        if (attempts === 9) setVideoProgressStep(3);

        try {
          const res = await fetch(
            `/api/tv/tryon-handoff/${encodeURIComponent(token)}/video?jobId=${encodeURIComponent(jobId)}`,
            { cache: 'no-store' }
          );
          const data = await res.json().catch(() => ({}));

          if (data.status === 'ready' && data.videoUrl) {
            setVideoUrl(data.videoUrl);
            setVideoGenerating(false);
            setActiveView('video');
            return;
          }

          if (data.status === 'failed') {
            throw new Error(data.error || 'Video generation interrupted.');
          }
        } catch (err) {
          throw err;
        }
      }
      throw new Error('Video generation is taking longer than expected. Please tap Retry Video.');
    },
    [token]
  );

  // Generate AI Video
  const handleGenerateVideo = async (useFailProofPrompt = false, isRetry = false) => {
    if (!consentGoLive) {
      setVideoError('Please check the Go-Live display consent to generate your video.');
      return;
    }

    setVideoGenerating(true);
    setVideoError('');
    setVideoProgressStep(0);
    downloadedVideoRef.current = false;

    try {
      const response = await fetch(`/api/tv/tryon-handoff/${encodeURIComponent(token)}/video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageIndex: active,
          consentGoLive: true,
          useFailProofPrompt,
          isRetry,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to start AI video generation.');
      }

      setVideoJobId(data.jobId);
      if (isRetry) setRetryCount((c) => c + 1);

      // If already ready or mock
      if (data.status === 'ready' && data.videoUrl) {
        setVideoUrl(data.videoUrl);
        setVideoGenerating(false);
        setActiveView('video');
        return;
      }

      // Otherwise poll until ready
      await pollVideoStatus(data.jobId);
    } catch (caught) {
      setVideoError(
        caught instanceof Error
          ? caught.message
          : 'Unable to generate video. Tap Retry Video below.'
      );
      setVideoGenerating(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F4F5F2] text-[#161918]">
      {/* Header with Contextual Retry Button */}
      <header className="sticky top-0 z-30 border-b border-[#D8DCD7] bg-[#F4F5F2]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center border border-[#161918] bg-[#161918] font-mono text-xs font-bold tracking-widest text-[#FAF6EE]">
              TF
            </span>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#7A1428]">
                TryFocus × Maharaja
              </p>
              <h1 className="font-serif text-base font-semibold leading-none text-[#161918]">
                {activeView === 'image' ? 'Your Private Looks' : 'Festival AI Video'}
              </h1>
            </div>
          </div>

          {/* Contextual Retry Button: "Retry Image" vs "Retry Video" */}
          {activeView === 'image' ? (
            <button
              type="button"
              onClick={() => setShowRetryImageModal(true)}
              className="inline-flex min-h-9 items-center gap-1.5 border border-[#161918] bg-white px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-[#161918] shadow-sm transition hover:bg-[#FAF6EE] active:scale-95"
            >
              <RotateCcw className="h-3.5 w-3.5 text-[#7A1428]" />
              Retry Image
            </button>
          ) : (
            <button
              type="button"
              disabled={videoGenerating || retryCount >= 1}
              onClick={() => handleGenerateVideo(true, true)}
              className="inline-flex min-h-9 items-center gap-1.5 border border-[#7A1428] bg-[#7A1428] px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-[#600f1f] active:scale-95 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5 text-white" />
              {retryCount >= 1 ? 'Retry Used' : 'Retry Video'}
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <div className="mx-auto max-w-xl px-4 py-6 sm:px-6">
        {loading && (
          <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
            <LoaderCircle className="h-10 w-10 animate-spin text-[#7A1428]" />
            <p className="mt-4 font-serif text-lg">Opening your private looks…</p>
          </div>
        )}

        {error && !loading && (
          <div className="border border-[#B42318] bg-white p-6 text-center shadow-sm">
            <AlertCircle className="mx-auto h-10 w-10 text-[#B42318]" />
            <h2 className="mt-3 font-serif text-xl font-bold text-[#161918]">Look Unavailable</h2>
            <p className="mt-2 text-sm text-[#535A56]">{error}</p>
            <button
              type="button"
              onClick={fetchLooks}
              className="mt-5 inline-flex min-h-11 items-center justify-center border border-[#161918] bg-white px-5 text-sm font-semibold text-[#161918] hover:bg-[#F4F5F2]"
            >
              Check Again
            </button>
          </div>
        )}

        {!loading && !error && current && (
          <>
            {/* VIEW 1: Image Try-On Look View */}
            {activeView === 'image' && (
              <div>
                {/* Honest download messaging */}
                <div className="mb-4 flex items-center justify-between border border-[#D8DCD7] bg-[#FAFBF8] px-3.5 py-2 text-xs text-[#535A56]">
                  <span className="flex items-center gap-1.5 font-medium text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Auto-download attempted · Tap button below if not saved
                  </span>
                  <button
                    type="button"
                    onClick={() => downloadAsset(current.downloadUrl, `tryfocus-${current.sku || 'look'}.jpg`)}
                    className="font-mono font-bold uppercase tracking-wider text-[#7A1428] underline underline-offset-2"
                  >
                    Save look
                  </button>
                </div>

                {/* 9:16 Vertical Try-On Result Card */}
                <div className="relative overflow-hidden border-2 border-[#161918] bg-[#161918] shadow-md">
                  <div className="absolute left-3 top-3 z-10">
                    <span className="border border-[#7A1428]/40 bg-[#7A1428] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
                      AI Virtual Try-On
                    </span>
                  </div>
                  <img
                    src={current.imageUrl}
                    alt={current.title}
                    className="max-h-[68vh] w-full object-contain"
                  />
                </div>

                {/* Carousel Controls (if multi-looks present) */}
                {looks.length > 1 && (
                  <div className="mt-4 flex items-center justify-between gap-3 border border-[#D8DCD7] bg-white p-3 shadow-sm">
                    <button
                      type="button"
                      onClick={() =>
                        setActive((index) => (index - 1 + looks.length) % looks.length)
                      }
                      className="flex h-11 w-11 items-center justify-center border border-[#161918] bg-white text-lg font-semibold hover:bg-[#F4F5F2] active:scale-95"
                      aria-label="Previous look"
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div className="min-w-0 text-center">
                      <p className="truncate font-serif text-base font-semibold">{current.title}</p>
                      <p className="font-mono text-xs text-[#535A56]">
                        Look {active + 1} of {looks.length}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActive((index) => (index + 1) % looks.length)}
                      className="flex h-11 w-11 items-center justify-center border border-[#161918] bg-white text-lg font-semibold hover:bg-[#F4F5F2] active:scale-95"
                      aria-label="Next look"
                    >
                      <ArrowRight className="h-5 w-5" />
                    </button>
                  </div>
                )}

                {/* Single Look Title */}
                {looks.length <= 1 && (
                  <div className="mt-3 text-center">
                    <h2 className="font-serif text-xl font-semibold text-[#161918]">
                      {current.title}
                    </h2>
                    {current.sku && (
                      <p className="font-mono text-xs uppercase tracking-wider text-[#535A56]">
                        SKU: {current.sku}
                      </p>
                    )}
                  </div>
                )}

                {/* Video Generation Progress Overlay / Card */}
                {videoGenerating && (
                  <div className="mt-5 border-2 border-[#7A1428] bg-white p-6 text-center shadow-lg">
                    <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-[#7A1428]" />
                    <h3 className="mt-3 font-serif text-lg font-bold text-[#161918]">
                      Creating Your 6-Second Festival AI Film
                    </h3>
                    <p className="mt-1 text-xs text-[#535A56]">
                      Powered by Fail-Proof Motion Engine with grounded festive lighting
                    </p>

                    <div className="mt-5 space-y-2 text-left">
                      {[
                        'Locking customer identity & garment fabric weave',
                        'Applying fail-proof medium-flat festive motion',
                        'Rendering 9:16 vertical 4K cinematic lighting',
                        'Queueing for showroom TV displays & auto-download',
                      ].map((stepLabel, idx) => (
                        <div key={idx} className="flex items-center gap-2.5 text-xs">
                          {videoProgressStep > idx ? (
                            <Check className="h-4 w-4 text-emerald-700" />
                          ) : videoProgressStep === idx ? (
                            <LoaderCircle className="h-4 w-4 animate-spin text-[#7A1428]" />
                          ) : (
                            <span className="h-4 w-4 rounded-full border border-[#D8DCD7]" />
                          )}
                          <span
                            className={
                              videoProgressStep >= idx ? 'font-medium text-[#161918]' : 'text-[#7D8581]'
                            }
                          >
                            {stepLabel}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Error message */}
                {videoError && !videoGenerating && (
                  <div className="mt-4 border border-[#B42318] bg-white p-4 text-xs text-[#B42318]">
                    <p className="font-semibold">{videoError}</p>
                    <p className="mt-1 text-[#535A56]">
                      Review the error or tap Retry Video below to recreate.
                    </p>
                  </div>
                )}

                {/* Go-Live Consent Checkbox + Generate Video Trigger */}
                {!videoGenerating && (
                  <div className="mt-5 space-y-3">
                    {/* Go-Live Consent Box (Finding 1: Explicit opt-in) */}
                    <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-4 text-left shadow-sm">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={consentGoLive}
                          onChange={(e) => setConsentGoLive(e.target.checked)}
                          className="mt-1 h-5 w-5 cursor-pointer rounded border-[#D8DCD7] accent-[#7A1428]"
                        />
                        <div className="text-sm">
                          <span className="font-semibold text-[#161918]">
                            I consent to preview this festival video on Maharaja showroom TV displays (Go-Live).
                          </span>
                          <p className="mt-1 text-xs text-[#535A56]">
                            Explicit customer consent allows your 6-second video to be celebrated on showroom TV screens.
                          </p>
                        </div>
                      </label>
                    </div>

                    {/* Generate AI Video Button */}
                    <button
                      type="button"
                      disabled={!consentGoLive}
                      onClick={() => handleGenerateVideo(false, false)}
                      className="flex min-h-16 w-full items-center justify-center gap-2.5 border border-[#7A1428] bg-[#7A1428] px-6 text-center text-lg font-bold text-white shadow-md transition hover:bg-[#600f1f] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Film className="h-5 w-5" />
                      🎬 Generate 6-Second AI Video
                    </button>

                    {/* Manual Save Image Button */}
                    <button
                      type="button"
                      disabled={downloadingManual}
                      onClick={() => downloadAsset(current.downloadUrl, `tryfocus-${(current.sku || 'look').toLowerCase()}.jpg`)}
                      className="flex min-h-12 w-full items-center justify-center gap-2 border border-[#161918] bg-white px-5 text-sm font-semibold text-[#161918] transition hover:bg-[#F4F5F2]"
                    >
                      <Download className="h-4 w-4" />
                      {downloadingManual ? 'Saving Image…' : 'Save Try-On Image (.jpg)'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* VIEW 2: Video Preview & Review Page */}
            {activeView === 'video' && videoUrl && (
              <div>
                {/* Honest video download notification */}
                <div className="mb-4 flex items-center justify-between border border-[#D8DCD7] bg-[#FAFBF8] px-3.5 py-2 text-xs text-[#535A56]">
                  <span className="flex items-center gap-1.5 font-medium text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Auto-download attempted · Tap button below to save video
                  </span>
                  <button
                    type="button"
                    onClick={() => downloadAsset(videoUrl, `tryfocus-festival-film-${Date.now()}.mp4`)}
                    className="font-mono font-bold uppercase tracking-wider text-[#7A1428] underline underline-offset-2"
                  >
                    Save video
                  </button>
                </div>

                {/* Showroom TV Go-Live Badge */}
                <div className="mb-3 flex items-center justify-center gap-2 border border-[#7A1428]/20 bg-[#FAF6EE] p-2.5 text-center text-xs text-[#7A1428]">
                  <Tv className="h-4 w-4 text-[#7A1428]" />
                  <span className="font-semibold">
                    Showroom TV Go-Live Active · Queued for TV display
                  </span>
                </div>

                {/* 9:16 Vertical Video Player */}
                <div className="relative overflow-hidden border-2 border-[#161918] bg-black shadow-lg">
                  <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 border border-[#FAF6EE]/40 bg-black/70 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[#FAF6EE] backdrop-blur-sm">
                    <Sparkles className="h-3 w-3 text-amber-400" />
                    9:16 Vertical Film
                  </div>
                  <video
                    src={videoUrl}
                    controls
                    autoPlay
                    playsInline
                    loop
                    className="max-h-[72vh] w-full object-contain"
                  />
                </div>

                {/* Video Action Buttons */}
                <div className="mt-5 space-y-3">
                  <button
                    type="button"
                    disabled={downloadingManual}
                    onClick={() => downloadAsset(videoUrl, `tryfocus-festival-film-${Date.now()}.mp4`)}
                    className="flex min-h-16 w-full items-center justify-center gap-2.5 border border-[#7A1428] bg-[#7A1428] px-6 text-center text-lg font-bold text-white shadow-md transition hover:bg-[#600f1f] active:scale-[0.99]"
                  >
                    <Download className="h-5 w-5" />
                    {downloadingManual ? 'Saving Video…' : '⬇ Download 4K Festival Video (.mp4)'}
                  </button>

                  {/* Toggle back to Try-On Image */}
                  <button
                    type="button"
                    onClick={() => setActiveView('image')}
                    className="flex min-h-12 w-full items-center justify-center gap-2 border border-[#161918] bg-white px-5 text-sm font-semibold text-[#161918] transition hover:bg-[#F4F5F2]"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Try-On Photo
                  </button>

                  {/* Retry Video action with fail-proof medium flat backup */}
                  {retryCount < 1 ? (
                    <button
                      type="button"
                      disabled={videoGenerating}
                      onClick={() => handleGenerateVideo(true, true)}
                      className="flex min-h-11 w-full items-center justify-center gap-2 border border-[#D8DCD7] bg-[#FAFBF8] px-4 font-mono text-xs font-bold uppercase tracking-wider text-[#7A1428] transition hover:bg-white active:scale-95"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Regenerate with Fail-Proof Backup Motion (1 retry allowed)
                    </button>
                  ) : (
                    <p className="text-center font-mono text-xs text-[#8C938F]">
                      Regeneration limit reached (1 retry used).
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Expiry and Privacy Note */}
            {expiresAt && (
              <p className="mt-6 flex items-center justify-center gap-1.5 text-center font-mono text-xs text-[#535A56]">
                <Clock className="h-3.5 w-3.5" />
                This private look link expires at{' '}
                {new Date(expiresAt).toLocaleTimeString('en-IN', {
                  hour: 'numeric',
                  minute: '2-digit',
                })}{' '}
                IST
              </p>
            )}
          </>
        )}
      </div>

      {/* "Retry Image" Modal Dialog */}
      {showRetryImageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm border-2 border-[#161918] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 text-[#7A1428]">
                <RotateCcw className="h-5 w-5" />
                <h3 className="font-serif text-lg font-bold text-[#161918]">Retake or Change Garment</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRetryImageModal(false)}
                className="p-1 text-[#535A56] hover:text-[#161918]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 text-sm text-[#535A56]">
              To capture a new photo or select different garments from Maharaja’s silk collection,
              please step to the showroom 43&quot; TV kiosk or counter tablet.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowRetryImageModal(false);
                  fetchLooks();
                }}
                className="min-h-11 border border-[#161918] bg-[#161918] px-4 font-mono text-xs font-bold uppercase tracking-wider text-white hover:bg-[#2A2E2C]"
              >
                Refresh Current Looks
              </button>
              <button
                type="button"
                onClick={() => setShowRetryImageModal(false)}
                className="min-h-11 border border-[#D8DCD7] bg-white px-4 font-mono text-xs font-bold uppercase tracking-wider text-[#535A56] hover:bg-[#F4F5F2]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
