'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Clock,
  AtSign,
  Download,
  MessageCircle,
  Film,
  LoaderCircle,
  MoreVertical,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react';
import { LOOK_PREFILL_KEY, type LookPrefill } from '@/lib/maharaja/look-prefill';
import { useLeadGate } from '@/components/LeadGate';
import { useExitGuard } from '@/components/ExitGuard';

type Look = {
  sku: string;
  title: string;
  imageUrl: string;
  downloadUrl: string;
  category?: string;
  garmentType?: string;
  gender?: string;
  garmentReferenceUrl?: string;
  /** False for catalogue looks from the counter tablet: those festival videos are made on the TV. */
  videoAvailable?: boolean;
};

export default function PrivateLooksPage() {
  const { token } = useParams<{ token: string }>();
  const [looks, setLooks] = useState<Look[]>([]);
  const [active, setActive] = useState(0);
  const [expiresAt, setExpiresAt] = useState('');
  const [videoOff, setVideoOff] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const router = useRouter();
  const [videoStarting, setVideoStarting] = useState(false);
  const [videoError, setVideoError] = useState('');

  const [downloadingManual, setDownloadingManual] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const [store, setStore] = useState({ name: '', instagramUrl: '' });
  // Nothing downloads on its own: Save asks for the customer's WhatsApp number first.
  const leadGate = useLeadGate({ kind: 'looks', ref: token || '', source: 'tv-looks' });
  // Back or close asks first: this private link is the only copy of the customer's looks.
  const exitGuard = useExitGuard({});

  // Retry lives in the header ⋯ menu.
  const [showMenu, setShowMenu] = useState(false);
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
      setVideoOff(data.videoOff === true);
      setStore({ name: typeof data.clientName === 'string' ? data.clientName : '', instagramUrl: typeof data.instagramUrl === 'string' ? data.instagramUrl : '' });
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

  // Saves the look once the customer has given a WhatsApp number (the server checks the lead token).
  const saveLook = (look: Look) => leadGate.withLead(async (leadToken) => {
    setDownloadingManual(true);
    setDownloadError('');
    try {
      const res = await fetch(`${look.downloadUrl}&lead=${encodeURIComponent(leadToken)}`, { cache: 'no-store' });
      if (res.status === 428) {
        leadGate.forgetLead();
        throw new Error('Please enter your WhatsApp number again.');
      }
      if (!res.ok) throw new Error('This look could not be saved. Please try again.');
      const blobUrl = URL.createObjectURL(await res.blob());
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `tryfocus-${(look.sku || 'look').toLowerCase().replace(/[^a-z0-9_-]/g, '')}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
      setDownloaded(true);
    } catch (caught) {
      setDownloadError(caught instanceof Error ? caught.message : 'This look could not be saved. Please try again.');
    } finally {
      setDownloadingManual(false);
    }
  });

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
    <main className="min-h-screen bg-[#F4F5F2] text-ink">
      {/* Header with Contextual Retry Button */}
      <header className="sticky top-0 z-30 border-b border-line bg-[#F4F5F2]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center border border-ink bg-ink tabular-nums text-xs font-bold text-[#FAF6EE]">
              TF
            </span>
            <div>
              <h1 className="text-base font-bold leading-none text-ink">
                Your Private Looks
              </h1>
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              aria-label="Look options"
              aria-expanded={showMenu}
              onClick={() => setShowMenu((open) => !open)}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-line-strong bg-white"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-12 z-40 w-64 overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
                <button type="button" onClick={() => { setShowMenu(false); setShowRetryImageModal(true); }} className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-[15px] font-semibold">
                  <RotateCcw className="h-4 w-4" /> Retry with another outfit
                </button>
                <button type="button" onClick={() => { setShowMenu(false); void fetchLooks(); }} className="flex min-h-12 w-full items-center gap-3 border-t border-line px-4 text-left text-[15px] font-semibold">
                  <RefreshCw className="h-4 w-4" /> Refresh my looks
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="mx-auto max-w-xl px-4 py-6 sm:px-6">
        {loading && (
          <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
            <LoaderCircle className="h-10 w-10 animate-spin text-brand" />
            <p className="mt-4 tracking-tight text-lg">Opening your private looks…</p>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-danger bg-white p-6 text-center shadow-sm">
            <AlertCircle className="mx-auto h-10 w-10 text-danger" />
            <h2 className="mt-3 tracking-tight text-xl font-bold text-ink">Look Unavailable</h2>
            <p className="mt-2 text-sm text-muted">{error}</p>
            <button
              type="button"
              onClick={fetchLooks}
              className="rounded-xl mt-5 inline-flex min-h-11 items-center justify-center border border-ink bg-white px-5 text-sm font-semibold text-ink hover:bg-[#F4F5F2]"
            >
              Check Again
            </button>
          </div>
        )}

        {!loading && !error && current && (
          <>
            <div>
                {/* 9:16 Vertical Try-On Result Card */}
                <div className="relative overflow-hidden border border-ink bg-ink shadow-md">
                  <div className="absolute left-3 top-3 z-10">
                    <span className="border border-brand/40 bg-brand px-2.5 py-1 text-xs font-bold text-white shadow-sm">
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
                  <div className="rounded-2xl mt-4 flex items-center justify-between gap-3 border border-line bg-white p-3 shadow-sm">
                    <button
                      type="button"
                      onClick={() =>
                        setActive((index) => (index - 1 + looks.length) % looks.length)
                      }
                      className="flex h-11 w-11 items-center justify-center border border-ink bg-white text-lg font-semibold hover:bg-[#F4F5F2] active:scale-95"
                      aria-label="Previous look"
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div className="min-w-0 text-center">
                      <p className="truncate text-base font-bold">{current.title}</p>
                      <p className="tabular-nums text-xs text-muted">
                        Look {active + 1} of {looks.length}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActive((index) => (index + 1) % looks.length)}
                      className="flex h-11 w-11 items-center justify-center border border-ink bg-white text-lg font-semibold hover:bg-[#F4F5F2] active:scale-95"
                      aria-label="Next look"
                    >
                      <ArrowRight className="h-5 w-5" />
                    </button>
                  </div>
                )}

                {/* Single Look Title */}
                {looks.length <= 1 && (
                  <div className="mt-3 text-center">
                    <h2 className="text-xl font-bold text-ink">
                      {current.title}
                    </h2>
                    {current.sku && !current.sku.startsWith('OWN-') && (
                      <p className="text-xs text-muted">
                        SKU: {current.sku}
                      </p>
                    )}
                  </div>
                )}

                {videoError && (
                  <p role="alert" className="mt-4 border border-danger bg-white p-4 text-sm font-semibold text-danger">{videoError}</p>
                )}

                <div className="mt-5 space-y-3">
                    {videoOff ? null : current.videoAvailable === false ? (
                      <p className="border border-line bg-canvas p-4 text-center text-sm text-muted">
                        AI Video uses our store collection. Ask our staff to pick a piece for your video.
                      </p>
                    ) : (<>
                    <button
                      type="button"
                      disabled={videoStarting}
                      onClick={() => void startFestivalVideo()}
                      className="flex min-h-16 w-full items-center justify-center gap-2.5 border border-brand bg-brand px-6 text-center text-lg font-bold text-white shadow-md transition hover:bg-[#600f1f] active:scale-[0.99] disabled:opacity-60"
                    >
                      {videoStarting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Film className="h-5 w-5" />}
                      {videoStarting ? 'Opening your AI Video…' : 'Create my AI Video'}
                    </button>
                    <p className="text-center text-xs text-muted">
                      Valid for 24 hours on this phone · Showing it on the store TV is optional
                    </p>
                    </>)}

                    <button
                      type="button"
                      disabled={downloadingManual}
                      onClick={() => void saveLook(current)}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-ink bg-white px-5 text-sm font-semibold text-ink transition hover:bg-[#F4F5F2]"
                    >
                      {downloadingManual ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      {downloadingManual ? 'Saving…' : 'Download this look'}
                    </button>
                    {downloadError && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger">{downloadError}</p>}
                    {downloaded && (
                      <div className="space-y-2">
                        {store.instagramUrl && (
                          <a href={store.instagramUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white">
                            <AtSign className="h-4 w-4" /> Follow us on Instagram
                          </a>
                        )}
                        <button type="button" onClick={() => void shareLook(current, store.name)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-ink bg-white px-5 text-sm font-semibold text-ink">
                          <MessageCircle className="h-4 w-4" /> Share on WhatsApp
                        </button>
                      </div>
                    )}
                </div>
            </div>

            {/* Expiry and Privacy Note */}
            {expiresAt && (
              <p className="mt-6 flex items-center justify-center gap-1.5 text-center tabular-nums text-xs text-muted">
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

      {leadGate.dialog}
      {exitGuard.dialog}

      {/* Retry, from the header ⋯ menu */}
      {showRetryImageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="rounded-2xl w-full max-w-sm border border-ink bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 text-brand">
                <RotateCcw className="h-5 w-5" />
                <h3 className="tracking-tight text-lg font-bold text-ink">Retake or Change Garment</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRetryImageModal(false)}
                className="p-1 text-muted hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 text-sm text-muted">
              To take a new photo or pick other outfits from the store collection, go back to the
              store TV or ask our staff at the counter.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowRetryImageModal(false);
                  fetchLooks();
                }}
                className="min-h-11 border border-ink bg-ink px-4 text-xs font-bold text-white hover:bg-[#2A2E2C]"
              >
                Refresh Current Looks
              </button>
              <button
                type="button"
                onClick={() => setShowRetryImageModal(false)}
                className="min-h-11 border border-line bg-white px-4 text-xs font-bold text-muted hover:bg-[#F4F5F2]"
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

/** Shares the look image (WhatsApp is one tap away in the phone's share sheet); falls back to a WhatsApp text. */
async function shareLook(look: { imageUrl: string } | undefined, storeName: string) {
  const text = `My new look${storeName ? ` from ${storeName}` : ''}`;
  if (look) {
    try {
      const blob = await (await fetch(look.imageUrl, { cache: 'no-store' })).blob();
      const file = new File([blob], 'my-look.jpg', { type: blob.type || 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}
