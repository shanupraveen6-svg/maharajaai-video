'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import {
  BadgeIndianRupee,
  CheckCircle2,
  Film,
  LoaderCircle,
  LockKeyhole,
  Phone,
  QrCode,
  RefreshCw,
  Store,
} from 'lucide-react';
import { AI_VIDEO_MIN_PURCHASE, EVENT_OPTIONS, type EventId } from '@/lib/maharaja/config';

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
  const [billAmount, setBillAmount] = useState('5000');
  const [eventId, setEventId] = useState<EventId>('diwali');
  const [activeEvents, setActiveEvents] = useState<EventId[]>(EVENT_OPTIONS.map((event) => event.id));
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [pass, setPass] = useState<GeneratedPass | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    fetch(`/api/maharaja/billing/${encodeURIComponent(params.billingCode)}`, { cache: 'no-store' })
      .then(readJson)
      .then((data) => {
        setActiveEvents(data.activeEvents);
        setEventId(data.defaultEvent);
        setAuthenticated(data.authenticated === true);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load billing counter.'));
  }, [params.billingCode]);

  async function handleBillerLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError('');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch('/api/operator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'same-origin',
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Invalid credentials');
      setAuthenticated(true);
    } catch (caught) {
      setLoginError(caught instanceof DOMException && caught.name === 'AbortError'
        ? 'Login is taking too long. Please check your connection and try again.'
        : caught instanceof Error ? caught.message : 'Login failed.');
    } finally {
      window.clearTimeout(timeout);
      setLoggingIn(false);
    }
  }

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
          billAmount: Number(billAmount) || AI_VIDEO_MIN_PURCHASE,
          eventId,
          whatsappOptIn,
        }),
      }));
      const qr = await QRCode.toDataURL(data.pass.link, {
        width: 480,
        margin: 2,
        errorCorrectionLevel: 'M',
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
    setBillAmount('5000');
    setWhatsappOptIn(false);
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
            <div><p className="font-serif text-2xl font-bold text-[#6E0D1F]">Maharaja</p><p className="text-xs font-bold uppercase text-[#8A6A20]">AI Video billing counter · <a href="https://wefocus.in" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#6E0D1F] transition">wefocus.in</a></p></div>
          </div>
          <Film className="h-7 w-7 text-[#6E0D1F]" />
        </header>

        {authenticated === false ? (
          <div className="mt-8 mx-auto max-w-md border border-[#D8C49B] bg-white p-6 md:p-8 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#6E0D1F]/10 text-[#6E0D1F] mb-4">
              <LockKeyhole className="h-6 w-6" />
            </div>
            <h2 className="font-serif text-2xl font-bold text-[#2A060C]">Biller login required</h2>
            <p className="mt-2 text-xs leading-5 text-[#5C4B43]">
              To prevent unauthorized generation of passes, sign in with your Maharaja staff credentials to unlock this terminal.
            </p>
            {loginError && (
              <div className="mt-4 border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                {loginError}
              </div>
            )}
            <form onSubmit={handleBillerLogin} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-[#5C4B43]">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Staff username"
                  required
                  className="mt-1 min-h-11 w-full border border-[#D8C49B] bg-[#FFFDF8] px-3 text-sm font-bold outline-none focus:border-[#6E0D1F]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-[#5C4B43]">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="mt-1 min-h-11 w-full border border-[#D8C49B] bg-[#FFFDF8] px-3 text-sm font-bold outline-none focus:border-[#6E0D1F]"
                />
              </div>
              <button
                type="submit"
                disabled={loggingIn}
                className="mt-2 flex min-h-12 w-full items-center justify-center bg-[#6E0D1F] text-xs font-bold uppercase tracking-wider text-[#F3E5AB] hover:bg-[#851025] disabled:opacity-50"
              >
                {loggingIn ? <LoaderCircle className="h-5 w-5 animate-spin" /> : 'Sign in to billing counter'}
              </button>
            </form>
          </div>
        ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
          <form onSubmit={generateCustomerQr} className="border border-[#D8C49B] bg-white p-5 md:p-7">
            <p className="text-xs font-bold uppercase text-[#8A6A20]">Customer eligibility</p>
            <h1 className="mt-2 font-serif text-3xl font-bold text-[#2A060C]">Generate an AI Video QR</h1>
            <p className="mt-3 text-sm leading-6 text-[#5C4B43]">Enter the details from the customer bill. The QR is tied to Maharaja and expires after 1 hour.</p>

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

            <fieldset className="mt-4">
              <legend className="flex items-center gap-1 text-xs font-bold uppercase text-[#5C4B43]">
                <BadgeIndianRupee className="h-4 w-4 text-[#6E0D1F]" /> Bill value
              </legend>
              <div className="mt-2 grid grid-cols-3 border border-[#D8C49B] bg-[#FFFDF8] p-1">
                {[
                  { value: '5000', label: '₹5,000+' },
                  { value: '7000', label: '₹7,000+' },
                  { value: '10000', label: '₹10,000+' },
                ].map((tier) => (
                  <button
                    key={tier.value}
                    type="button"
                    aria-pressed={billAmount === tier.value}
                    onClick={() => setBillAmount(tier.value)}
                    className={`min-h-12 px-2 text-xs font-bold uppercase transition ${billAmount === tier.value ? 'bg-[#6E0D1F] text-[#F3E5AB] shadow-sm' : 'text-[#5C4B43] hover:bg-[#F5EAD3]'}`}
                  >
                    {tier.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="mt-4 block text-xs font-bold uppercase text-[#5C4B43]">Event
              <select
                id="billing-event-select"
                value={eventId}
                onChange={(event) => setEventId(event.target.value as EventId)}
                className="mt-2 min-h-12 w-full border border-[#D8C49B] bg-[#FFFDF8] px-3 text-base font-bold outline-none focus:border-[#6E0D1F]"
              >
                {activeEvents.map((activeEventId) => {
                  const option = EVENT_OPTIONS.find((item) => item.id === activeEventId);
                  return option ? <option key={option.id} value={option.id}>{option.label}</option> : null;
                })}
              </select>
            </label>

            <label htmlFor="whatsapp-opt-in" className="mt-3 flex cursor-pointer items-start gap-3 border border-emerald-200 bg-emerald-50 p-4">
              <input id="whatsapp-opt-in" type="checkbox" checked={whatsappOptIn} onChange={(event) => setWhatsappOptIn(event.target.checked)} className="mt-1 h-5 w-5 accent-emerald-700" />
              <span><span className="block text-sm font-bold text-emerald-900">Customer uses WhatsApp and agrees to receive the AI Video link</span><span className="mt-1 block text-xs leading-5 text-emerald-800">If WhatsApp delivery is unavailable, the customer can still scan and reopen this QR.</span></span>
            </label>

            {error && <div className="mt-4 border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</div>}

            <button
              type="submit"
              id="generate-customer-qr-btn"
              disabled={loading}
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
                <div className="mt-5 space-y-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={(e) => void generateCustomerQr(e as any)}
                    className="flex min-h-12 w-full items-center justify-center gap-2 bg-[#D4AF37] px-4 text-xs font-bold uppercase text-black hover:brightness-105 transition"
                  >
                    {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Retry QR (New Code)
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="flex min-h-12 w-full items-center justify-center gap-2 border border-[#D4AF37]/30 px-4 text-xs font-bold uppercase text-[#F3E5AB] hover:bg-white/5 transition"
                  >
                    Next Customer
                  </button>
                </div>
              </>
            ) : (
              <div className="flex min-h-[480px] flex-col items-center justify-center"><QrCode className="h-24 w-24 text-[#D4AF37]" /><h2 className="mt-5 font-serif text-2xl font-bold">Customer QR appears here</h2><p className="mt-2 max-w-xs text-sm leading-6 text-[#F3E5AB]/65">Complete the billing form on this counter device, then let the customer scan from another phone.</p></div>
            )}
          </aside>
        </div>
        )}
      </div>
    </main>
  );
}
