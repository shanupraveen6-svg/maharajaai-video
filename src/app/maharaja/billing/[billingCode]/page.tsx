'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Gift,
  LoaderCircle,
  Phone,
  QrCode,
  RefreshCw,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';

type ExperienceType = 'purchased-garment' | 'catalogue-gift';

type GeneratedPass = {
  code: string;
  phoneMasked: string;
  eventId: string;
  experienceType: ExperienceType;
  expiresAt: string;
  link: string;
};

export default function MaharajaBillingPage() {
  const params = useParams<{ billingCode: string }>();
  const searchParams = useSearchParams();
  const billingCode = params?.billingCode || 'billing';

  const [phone, setPhone] = useState('');
  const [mode, setMode] = useState<ExperienceType>(
    searchParams.get('mode') === 'catalogue' ? 'catalogue-gift' : 'purchased-garment'
  );
  const [pass, setPass] = useState<GeneratedPass | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [whatsappConfigured, setWhatsappConfigured] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [whatsappError, setWhatsappError] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/maharaja/billing/${encodeURIComponent(billingCode)}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data?.success) {
          setWhatsappConfigured(Boolean(data.billing?.whatsapp?.configured));
        }
      })
      .catch(() => undefined);
  }, [billingCode]);

  useEffect(() => {
    if (!pass?.link) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(pass.link, {
      width: 340,
      margin: 2,
      color: { dark: '#161918', light: '#FAFBF8' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [pass]);

  async function createPass(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setWhatsappSent(false);
    setWhatsappError('');
    try {
      const response = await fetch('/api/maharaja/video-pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingCode,
          phone,
          experienceType: mode,
          whatsappOptIn: whatsappConfigured,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to generate customer QR.');
      }
      setPass(data.pass);
      setWhatsappSent(Boolean(data.whatsappSent));
      setWhatsappError(typeof data.whatsappError === 'string' ? data.whatsappError : '');
      setPhone('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to generate customer QR.');
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!pass?.link) return;
    await navigator.clipboard.writeText(pass.link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="min-h-screen bg-[#F4F5F2] text-[#161918]">
      {/* Unified TryFocus Header */}
      <header className="border-b border-[#D8DCD7] bg-[#F4F5F2]/95">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center border border-[#161918] bg-[#161918] font-mono text-xs font-bold tracking-widest text-[#FAF6EE]">
              TF
            </span>
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7A1428]">
                TryFocus × The Majestic Maharaja · Bill Counter
              </p>
              <h1 className="font-serif text-xl font-semibold text-[#161918]">
                1-Day AI Video Pass & Giveaway Generator
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="border border-[#7A1428] bg-[#7A1428]/10 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A1428]">
              {whatsappConfigured
                ? 'WhatsApp Connected · 1-Day Link + QR'
                : 'WhatsApp Not Integrated by Client · Direct QR Mode (1-Day Validity)'}
            </span>
            <Link
              href="/maharaja/workspace"
              className="border border-[#D8DCD7] bg-[#FAFBF8] px-3.5 py-1.5 text-xs font-semibold text-[#161918] hover:border-[#161918]"
            >
              Client Workspace
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[0.95fr_1.05fr]">
        {/* Left: Pass Generator Form */}
        <form
          onSubmit={createPass}
          className="flex flex-col justify-between border border-[#D8DCD7] bg-white p-6"
        >
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
              Step 1 · Select Reward / Pass Type
            </p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
              Issue 1-Day Customer AI Video Access
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[#535A56]">
              If WhatsApp API is connected, the 1-day link is sent via WhatsApp. Since WhatsApp API is not integrated by the client, the <strong>1-Day Direct QR Code</strong> is displayed immediately for the customer to scan.
            </p>

            {/* Mode Selector: Purchased/Own Garment vs Catalogue/Giveaway */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setMode('purchased-garment');
                  setPass(null);
                }}
                className={`flex flex-col items-start border p-4 text-left transition ${
                  mode === 'purchased-garment'
                    ? 'border-[#7A1428] bg-[#7A1428] text-[#FAF6EE]'
                    : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918] hover:border-[#161918]'
                }`}
              >
                <ShoppingBag className="h-5 w-5" />
                <span className="mt-2 font-serif text-base font-semibold">
                  Own / Any Garment Video
                </span>
                <span className="mt-1 text-[11px] opacity-85">
                  Customer uploads any dress/saree photo + person photo → AI Video → Download or Go Live.
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('catalogue-gift');
                  setPass(null);
                }}
                className={`flex flex-col items-start border p-4 text-left transition ${
                  mode === 'catalogue-gift'
                    ? 'border-[#7A1428] bg-[#7A1428] text-[#FAF6EE]'
                    : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918] hover:border-[#161918]'
                }`}
              >
                <Gift className="h-5 w-5" />
                <span className="mt-2 font-serif text-base font-semibold">
                  Catalogue / Giveaway Video
                </span>
                <span className="mt-1 text-[11px] opacity-85">
                  Customer picks from 30 store catalogue outfits + person photo → AI Video → Download or Go Live.
                </span>
              </button>
            </div>

            {/* Customer Phone Input */}
            <div className="mt-5">
              <label className="block font-mono text-xs font-bold uppercase tracking-[0.16em] text-[#161918]">
                Step 2 · Customer 10-Digit Mobile Number
              </label>
              <div className="mt-2 flex items-center border border-[#D8DCD7] bg-[#FAFBF8] px-3.5 focus-within:border-[#7A1428]">
                <Phone className="h-4 w-4 text-[#7A1428]" />
                <input
                  value={phone}
                  onChange={(event) =>
                    setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))
                  }
                  inputMode="numeric"
                  placeholder="9876543210"
                  className="h-12 w-full bg-transparent px-3 font-mono text-lg font-bold tracking-wider text-[#161918] outline-none"
                />
              </div>
              <p className="mt-1.5 text-xs text-[#535A56]">
                Binds the 24-hour AI Video pass to the customer’s mobile number.
              </p>
            </div>

            {/* Delivery Notice Box */}
            <div className="mt-4 border border-[#D8DCD7] bg-[#FAFBF8] p-3.5 text-xs text-[#535A56]">
              <p className="font-bold text-[#161918]">
                Active Delivery: {whatsappConfigured ? 'WhatsApp Link + Direct QR' : 'Direct QR Only (WhatsApp Not Integrated)'}
              </p>
              <p className="mt-1 leading-relaxed">
                Both modes include <strong>Download</strong> and <strong>Go Live</strong>. If the customer clicks <strong>Go Live</strong>, their video will be played on the Maharaja showroom screen (<code>/maharaja/tv</code>) and listed in the client video library.
              </p>
            </div>

            {error && (
              <div className="mt-4 border border-[#B42318] bg-[#FEF3F2] p-3 text-xs font-semibold text-[#B42318]">
                {error}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 flex min-h-13 w-full items-center justify-center gap-2 bg-[#7A1428] px-5 py-3.5 text-xs font-bold uppercase tracking-[0.16em] text-[#FAF6EE] transition hover:bg-[#610F20] disabled:opacity-50"
          >
            {loading ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Generating 1-Day Pass...
              </>
            ) : (
              <>
                <QrCode className="h-4 w-4" />
                Generate 1-Day Customer QR
              </>
            )}
          </button>
        </form>

        {/* Right: Active Customer QR Display */}
        <section className="flex flex-col items-center justify-center border border-[#D8DCD7] bg-[#FAFBF8] p-6 text-center">
          {qrDataUrl && pass ? (
            <div className="w-full max-w-md space-y-4">
              <div className="inline-flex items-center gap-1.5 border border-[#256B45] bg-[#EBF5EE] px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#256B45]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                1-Day Direct QR Ready · {pass.phoneMasked}
              </div>

              <h3 className="font-serif text-2xl font-semibold text-[#161918]">
                {pass.experienceType === 'catalogue-gift'
                  ? 'Catalogue / Giveaway AI Video Pass'
                  : 'Own / Purchased Garment AI Video Pass'}
              </h3>

              <div className="mx-auto inline-block border border-[#D8DCD7] bg-white p-4 shadow-sm">
                <img
                  src={qrDataUrl}
                  alt="Customer 1-Day AI Video QR"
                  className="mx-auto h-64 w-64 object-contain"
                />
              </div>

              <p className="text-xs leading-relaxed text-[#535A56]">
                {whatsappSent
                  ? '1-day link sent to customer WhatsApp and shown via Direct QR above.'
                  : 'WhatsApp API is not integrated by client — ask the customer to scan or photograph this Direct QR (valid for 24 hours).'}
              </p>

              {whatsappError && (
                <p className="border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                  {whatsappError}
                </p>
              )}

              <div className="grid gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={copyLink}
                  className="flex items-center justify-center gap-1.5 border border-[#161918] bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#161918]"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? 'Link Copied' : 'Copy 1-Day Link'}
                </button>
                <a
                  href={pass.link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 bg-[#161918] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#FAF6EE]"
                >
                  Open Mobile Flow
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          ) : (
            <div className="max-w-sm space-y-3 py-12">
              <div className="mx-auto flex h-16 w-16 items-center justify-center border border-[#D8DCD7] bg-white text-[#7A1428]">
                <QrCode className="h-8 w-8" />
              </div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                Ready for Next Customer
              </p>
              <h3 className="font-serif text-2xl font-semibold text-[#161918]">
                No Active QR on Screen
              </h3>
              <p className="text-xs leading-relaxed text-[#535A56]">
                Choose <strong>Own / Any Garment Video</strong> or <strong>Catalogue / Giveaway Video</strong> on the left, enter the customer’s 10-digit mobile number, and generate their 1-day Direct QR.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
