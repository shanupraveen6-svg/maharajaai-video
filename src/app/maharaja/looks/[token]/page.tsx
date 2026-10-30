'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  Film,
  LoaderCircle,
  RotateCcw,
  X,
} from 'lucide-react';
import { LOOK_PREFILL_KEY, type LookPrefill } from '@/lib/maharaja/look-prefill';

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

  const router = useRouter();
  const [videoStarting, setVideoStarting] = useState(false);
  const [videoError, setVideoError] = useState('');

  // Auto-download tracking (runs once per look / video)
  const downloadedImagesRef = useRef<Record<string, boolean>>({});
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

  // The festival video is made on the customer's own 24-hour pass: Gemini creates the event
  // portrait from this look, the customer approves it, then renders and optionally goes live.
  const startFestivalVideo = async () => {
    if (!current || videoStarting) return;
    setVideoStarting(true);
    setVideoError('');
    try {
      const response = await fetch(`/api/tv/tryon-handoff/${encodeURIComponent(token)}/pass`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageIndex: active }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.pass?.path) throw new Error(data.error || 'Unable to start your festival video.');
      const prefill: LookPrefill = {
        personPhoto: await toDataUrl(current.imageUrl),
        garmentPhotos: data.pass.experienceType === 'catalogue-gift' || !current.garmentReferenceUrl
          ? []
          : [await toDataUrl(current.garmentReferenceUrl)],
        garmentType: current.garmentType,
      };
      try {
        window.sessionStorage.setItem(LOOK_PREFILL_KEY(data.pass.code), JSON.stringify(prefill));
      } catch {
        // Without storage the customer simply adds the photos on the next screen.
      }
      router.push(data.pass.path);
    } catch (caught) {
      setVideoError(caught instanceof Error ? caught.message : 'Unable to start your festival video.');
      setVideoStarting(false);
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
                TryFocus
              </p>
              <h1 className="font-serif text-base font-semibold leading-none text-[#161918]">
                Your Private Looks
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowRetryImageModal(true)}
            className="inline-flex min-h-11 items-center gap-1.5 border border-[#161918] bg-white px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-[#161918] shadow-sm transition hover:bg-[#FAF6EE] active:scale-95"
          >
            <RotateCcw className="h-3.5 w-3.5 text-[#7A1428]" />
            Retry Image
          </button>
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
                    className="flex min-h-11 shrink-0 items-center pl-3 font-mono font-bold uppercase tracking-wider text-[#7A1428] underline underline-offset-2"
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
                    {current.sku && !current.sku.startsWith('OWN-') && (
                      <p className="font-mono text-xs uppercase tracking-wider text-[#535A56]">
                        SKU: {current.sku}
                      </p>
                    )}
                  </div>
                )}

                {videoError && (
                  <p role="alert" className="mt-4 border border-[#B42318] bg-white p-4 text-sm font-semibold text-[#B42318]">{videoError}</p>
                )}

                <div className="mt-5 space-y-3">
                    <button
                      type="button"
                      disabled={videoStarting}
                      onClick={() => void startFestivalVideo()}
                      className="flex min-h-16 w-full items-center justify-center gap-2.5 border border-[#7A1428] bg-[#7A1428] px-6 text-center text-lg font-bold text-white shadow-md transition hover:bg-[#600f1f] active:scale-[0.99] disabled:opacity-60"
                    >
                      {videoStarting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Film className="h-5 w-5" />}
                      {videoStarting ? 'Opening your video studio…' : 'Create my festival video'}
                    </button>
                    <p className="text-center text-xs text-[#535A56]">
                      Valid for 24 hours on this phone · Showing it on the store TV is optional
                    </p>

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
            </div>

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
              To capture a new photo or select different garments from the store collection,
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

async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  const blob = await (await fetch(url, { cache: 'no-store' })).blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read the look.')));
    reader.onerror = () => reject(new Error('Could not read the look.'));
    reader.readAsDataURL(blob);
  });
}
