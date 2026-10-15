'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import {
  BadgeIndianRupee,
  CheckCircle2,
  Download,
  ExternalLink,
  Film,
  LoaderCircle,
  Phone,
  QrCode,
  RefreshCw,
  Store,
} from 'lucide-react';
import { AI_VIDEO_MIN_PURCHASE, EVENT_OPTIONS, type EventId } from '@/lib/maharaja/config';
import { downloadDataUrl } from '@/lib/maharaja/qr-poster';

type GeneratedPass = {
  code: string;
  phoneMasked: string;
  billLast4: string;
  eventId: EventId;
  expiresAt: string;
  link: string;
};

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'Unable to create customer QR.');
  return data;
}

export default function MaharajaBillingPage() {
  const params = useParams<{ billingCode: string }>();
  const [phone, setPhone] = useState('');
  const [billLast4, setBillLast4] = useState('');
  const [eventId, setEventId] = useState<EventId>('diwali');
  const [activeEvents, setActiveEvents] = useState<EventId[]>(EVENT_OPTIONS.map((event) => event.id));
  const [eligible, setEligible] = useState(false);
  const [pass, setPass] = useState<GeneratedPass | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/maharaja/billing/${encodeURIComponent(params.billingCode)}`, { cache: 'no-store' })
      .then(readJson)
      .then((data) => { setActiveEvents(data.activeEvents); setEventId(data.defaultEvent); })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load billing counter.'));
  }, [params.billingCode]);

  async function generateCustomerQr(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setPass(null);
    setQrDataUrl('');

    try {
      const data = await readJson(await fetch('/api/maharaja/video-pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingCode: params.billingCode,
          phone,
          billLast4,
          eventId,
          eligible,
        }),
      }));
      const qr = await QRCode.toDataURL(data.pass.link, {
        width: 720,
        margin: 2,
        errorCorrectionLevel: 'H',
        color: { dark: '#2A060C', light: '#FFFFFF' },
      });
      setPass(data.pass);
      setQrDataUrl(qr);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create customer QR.');
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setPhone('');
    setBillLast4('');
    setEligible(false);
    setPass(null);
    setQrDataUrl('');
    setError('');
  }

  return (
    <main className="min-h-screen bg-[#F5F2EA] px-4 py-6 text-[#211A17]">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between border-b border-[#D8C49B] pb-5">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center bg-[#6E0D1F] text-[#F3E5AB]"><Store className="h-5 w-5" /></span>
            <div><p className="font-serif text-2xl font-bold text-[#6E0D1F]">Maharaja</p><p className="text-xs font-bold uppercase text-[#8A6A20]">AI Video billing counter · tryfocus</p></div>
          </div>
          <Film className="h-7 w-7 text-[#6E0D1F]" />
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
          <form onSubmit={generateCustomerQr} className="border border-[#D8C49B] bg-white p-5 md:p-7">
            <p className="text-xs font-bold uppercase text-[#8A6A20]">Customer eligibility</p>
            <h1 className="mt-2 font-serif text-3xl font-bold text-[#2A060C]">Generate an AI Video QR</h1>
            <p className="mt-3 text-sm leading-6 text-[#5C4B43]">Enter the details from the customer bill. The QR is tied to Maharaja and expires after 2 hours.</p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold uppercase text-[#5C4B43]">Phone number
                <div className="relative mt-2">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6E0D1F]" />
                  <input
                    id="billing-phone-input"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={14}
                    placeholder="10 digit number"
                    className="min-h-12 w-full border border-[#D8C49B] bg-[#FFFDF8] pl-10 pr-3 text-base font-bold outline-none focus:border-[#6E0D1F]"
                  />
                </div>
              </label>
              <label className="text-xs font-bold uppercase text-[#5C4B43]">Bill last 4
                <input
                  id="billing-last4-input"
                  value={billLast4}
                  onChange={(event) => setBillLast4(event.target.value)}
                  maxLength={4}
                  placeholder="1847"
                  className="mt-2 min-h-12 w-full border border-[#D8C49B] bg-[#FFFDF8] px-3 text-base font-bold uppercase outline-none focus:border-[#6E0D1F]"
                />
              </label>
            </div>

            <label className="mt-4 block text-xs font-bold uppercase text-[#5C4B43]">Event
              <select
                id="billing-event-select"
                value={eventId}
                onChange={(event) => setEventId(event.target.value as EventId)}
                className="mt-2 min-h-12 w-full border border-[#D8C49B] bg-[#FFFDF8] px-3 text-base font-bold outline-none focus:border-[#6E0D1F]"
              >
                {EVENT_OPTIONS.filter((option) => activeEvents.includes(option.id)).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>

            <label htmlFor="bill-verified-checkbox" className="mt-5 flex cursor-pointer items-start gap-3 border-2 border-[#E2D4B8] bg-[#FFF8E8] p-4 transition hover:border-[#6E0D1F]">
              <input
                id="bill-verified-checkbox"
                type="checkbox"
                checked={eligible}
                onChange={(event) => setEligible(event.target.checked)}
                className="mt-1 h-6 w-6 cursor-pointer accent-[#6E0D1F]"
              />
              <span className="cursor-pointer">
                <span className="flex items-center gap-1 text-sm font-bold text-[#6E0D1F]">
                  <BadgeIndianRupee className="h-4 w-4" /> Bill verified at Rs {AI_VIDEO_MIN_PURCHASE} or above
                </span>
                <span className="mt-1 block text-xs leading-5 text-[#5C4B43]">
                  The biller confirms eligibility before creating the customer QR.
                </span>
              </span>
            </label>

            {error && <div className="mt-4 border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</div>}

            <button
              type="submit"
              id="generate-customer-qr-btn"
              disabled={loading || !eligible}
              className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 bg-[#6E0D1F] px-5 py-4 text-xs font-bold uppercase text-[#F3E5AB] disabled:opacity-45"
            >
              {loading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <QrCode className="h-5 w-5" />}
              Generate Customer QR
            </button>
          </form>

          <aside className="border border-[#D8C49B] bg-[#21090E] p-5 text-center text-[#F3E5AB] md:p-7">
            {pass && qrDataUrl ? (
              <>
                <div className="flex items-center justify-center gap-2 text-emerald-300"><CheckCircle2 className="h-5 w-5" /><span className="text-xs font-bold uppercase">Customer QR ready</span></div>
                <div className="mx-auto mt-4 max-w-[300px] bg-white p-4"><img src={qrDataUrl} alt="Customer AI Video QR code" className="h-auto w-full" /></div>
                <p className="mt-4 font-mono text-sm font-bold">{pass.phoneMasked} · ****{pass.billLast4}</p>
                <p className="mt-1 text-xs font-bold uppercase text-[#D4AF37]">{EVENT_OPTIONS.find((option) => option.id === pass.eventId)?.label} AI Video</p>
                <p className="mt-2 text-xs leading-5 text-[#F3E5AB]/70">Show this QR to the customer. They scan it on their phone to create the image and video.</p>
                <a
                  id="open-customer-pass-link"
                  href={pass.link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 bg-[#D4AF37] px-4 text-xs font-bold uppercase text-black hover:brightness-105"
                >
                  <ExternalLink className="h-4 w-4" /> Open Customer AI Video
                </a>
                <button type="button" onClick={() => downloadDataUrl(qrDataUrl, `maharaja-ai-video-${pass.billLast4}.png`)} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 border border-[#D4AF37]/50 px-4 text-xs font-bold uppercase text-[#F3E5AB] hover:bg-black/30"><Download className="h-4 w-4" /> Download QR PNG</button>
                <button type="button" onClick={resetForm} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 border border-[#D4AF37]/30 px-4 text-xs font-bold uppercase"><RefreshCw className="h-4 w-4" /> Next customer</button>
              </>
            ) : (
              <div className="flex min-h-[480px] flex-col items-center justify-center"><QrCode className="h-24 w-24 text-[#D4AF37]" /><h2 className="mt-5 font-serif text-2xl font-bold">Customer QR appears here</h2><p className="mt-2 max-w-xs text-sm leading-6 text-[#F3E5AB]/65">Complete the billing form on this counter device, then let the customer scan from another phone.</p></div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
