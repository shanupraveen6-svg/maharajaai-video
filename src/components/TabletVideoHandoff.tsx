'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Clock, Download, LoaderCircle, MessageSquare, QrCode, RefreshCw, Smartphone } from 'lucide-react';
import { formatINR } from '@/lib/tryfocus/sample-data';

type CounterConfig = {
  clientName: string;
  videoMinPurchase: number;
  whatsappEnabled: boolean;
  openVideoUrl: string;
};

type CounterMode = 'per-customer' | 'permanent';

const QR_COLORS = { dark: '#161918', light: '#FFFFFF' };

/**
 * Billing-counter AI Video QR. Used on the counter tablet (operator session) and on the
 * billing link (billingCode capability). Each "Next customer" tap issues a fresh private pass
 * whose 24-hour validity starts when the customer first opens it.
 */
export default function TabletVideoHandoff({ billingCode }: { billingCode?: string }) {
  const [config, setConfig] = useState<CounterConfig | null>(null);
  const [mode, setMode] = useState<CounterMode>('per-customer');
  const [passQr, setPassQr] = useState('');
  const [permanentQr, setPermanentQr] = useState('');
  const [customerCount, setCustomerCount] = useState(0);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const source = billingCode
      ? fetch(`/api/maharaja/billing/${encodeURIComponent(billingCode)}`, { cache: 'no-store' })
          .then((response) => response.json())
          .then((data) => data?.success ? {
            clientName: data.clientName,
            videoMinPurchase: Number(data.videoMinPurchase ?? 5000),
            whatsappEnabled: data.whatsappEnabled === true,
            openVideoUrl: data.openVideoUrl || '',
          } : Promise.reject(new Error(data?.error || 'Invalid billing-counter link.')))
      : fetch('/api/maharaja/workspace', { cache: 'no-store' })
          .then((response) => response.json())
          .then((data) => data?.success ? {
            clientName: data.workspace?.clientName,
            videoMinPurchase: Number(data.workspace?.videoMinPurchase ?? 5000),
            whatsappEnabled: data.workspace?.whatsappEnabled === true,
            openVideoUrl: data.workspace?.links?.openVideo || '',
          } : Promise.reject(new Error(data?.error || 'Sign in again to load the counter QR.')));
    source
      .then(async (next: CounterConfig) => {
        if (!active) return;
        setConfig(next);
        if (next.openVideoUrl) setPermanentQr(await QRCode.toDataURL(next.openVideoUrl, { width: 720, margin: 2, color: QR_COLORS }));
      })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Unable to load the counter QR. Reload this page.'); });
    return () => { active = false; };
  }, [billingCode]);

  async function issuePass(whatsappPhone = '') {
    if (busy) return;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const response = await fetch('/api/maharaja/video-pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(billingCode
          ? { billingCode, phone: whatsappPhone, experienceType: 'purchased-garment', whatsappOptIn: Boolean(whatsappPhone) }
          : { source: 'tablet-kiosk', phone: whatsappPhone, experienceType: 'purchased-garment', whatsappOptIn: Boolean(whatsappPhone) }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.pass?.link) throw new Error(data.error || 'Unable to create the customer QR.');
      setPassQr(await QRCode.toDataURL(data.pass.link, { width: 560, margin: 2, color: QR_COLORS }));
      setCustomerCount((count) => count + 1);
      if (whatsappPhone) {
        setPhone('');
        setNotice(data.whatsappSent
          ? `Link sent on WhatsApp to ${data.pass.phoneMasked}. The QR below works too.`
          : `WhatsApp could not send${data.whatsappError ? ` (${data.whatsappError})` : ''}. Ask the customer to scan the QR.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create the customer QR.');
    } finally {
      setBusy(false);
    }
  }

  function downloadPermanentQr() {
    if (!permanentQr) return;
    const link = document.createElement('a');
    link.href = permanentQr;
    link.download = `${(config?.clientName || 'store').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-ai-video-counter-qr.png`;
    link.click();
  }

  const minimum = config?.videoMinPurchase ?? 5000;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-[#7A1428]/30 bg-[#7A1428]/5 px-4 py-3">
        <p className="text-sm font-semibold text-[#161918]">
          {minimum > 0 ? <>Offer for bills of <strong>{formatINR(minimum)}</strong> and above</> : <>Offer on every bill</>}
          <span className="font-normal text-[#535A56]"> · Own garment AI video</span>
        </p>
        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-[#7A1428]">
          <Clock className="h-3.5 w-3.5" />
          Valid 24 h from first scan
        </span>
      </div>

      {/* With a minimum bill, every customer gets a fresh QR; the permanent poster would bypass the bill. */}
      {minimum === 0 && <div className="grid grid-cols-2 border border-[#161918]" role="tablist" aria-label="Counter QR type">
        {([
          ['per-customer', 'New QR per customer'],
          ['permanent', 'Permanent counter QR'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={`min-h-12 px-3 text-xs font-bold uppercase tracking-wider ${mode === id ? 'bg-[#161918] text-white' : 'bg-white text-[#161918]'}`}
          >
            {label}
          </button>
        ))}
      </div>}

      {error && <p role="alert" className="border border-[#B42318] bg-[#FEF3F2] p-3 text-sm font-semibold text-[#B42318]">{error}</p>}

      {mode === 'per-customer' || minimum > 0 ? (
        <section className="flex flex-col items-center border-2 border-[#161918] bg-[#FAFBF8] p-6 text-center">
          <p className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#7A1428]">
            <Smartphone className="h-4 w-4" />
            {passQr ? `Customer ${customerCount} · Scan with phone camera` : 'Ready for the next customer'}
          </p>
          <div className="mt-4 border-4 border-[#161918] bg-white p-3">
            {passQr ? (
              <img src={passQr} alt="Customer AI Video QR" className="aspect-square w-full max-w-[300px] object-contain" />
            ) : (
              <div className="flex aspect-square w-[min(300px,70vw)] items-center justify-center text-[#8A918D]">
                <QrCode className="h-16 w-16" />
              </div>
            )}
          </div>
          <button
            type="button"
            disabled={busy || !config}
            onClick={() => void issuePass()}
            className="mt-5 flex min-h-14 w-full max-w-sm items-center justify-center gap-2 bg-[#7A1428] px-5 text-sm font-bold uppercase tracking-wider text-white disabled:opacity-50"
          >
            {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
            {busy ? 'Creating QR…' : passQr ? 'Next customer · New QR' : 'Show QR for this customer'}
          </button>
          <p className="mt-3 max-w-sm text-xs text-[#535A56]">
            Each QR is private to one customer. A QR that is never scanned does not use any video credit.
          </p>

          {config?.whatsappEnabled && (
            <div className="mt-5 w-full max-w-sm border-t border-[#D8DCD7] pt-4 text-left">
              <label htmlFor="counter-phone" className="block text-xs font-semibold text-[#535A56]">
                Or send the link on WhatsApp
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="counter-phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
                  inputMode="tel"
                  placeholder="10-digit mobile number"
                  className="min-h-12 min-w-0 flex-1 border border-[#D8DCD7] bg-white px-3 text-sm font-semibold outline-none focus:border-[#7A1428]"
                />
                <button
                  type="button"
                  disabled={phone.length !== 10 || busy}
                  onClick={() => void issuePass(phone)}
                  className="flex min-h-12 items-center gap-1.5 bg-[#161918] px-4 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50"
                >
                  <MessageSquare className="h-4 w-4" />
                  Send
                </button>
              </div>
            </div>
          )}
          {notice && <p role="status" className="mt-4 max-w-sm text-sm font-semibold text-[#256B45]">{notice}</p>}
        </section>
      ) : (
        <section className="flex flex-col items-center border-2 border-[#161918] bg-[#FAFBF8] p-6 text-center">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#7A1428]">Print and paste at the counter</p>
          <div className="mt-4 border-4 border-[#161918] bg-white p-3">
            {permanentQr ? (
              <img src={permanentQr} alt="Permanent AI Video counter QR" className="aspect-square w-full max-w-[300px] object-contain" />
            ) : (
              <div className="flex aspect-square w-[min(300px,70vw)] items-center justify-center text-sm text-[#535A56]">Loading QR…</div>
            )}
          </div>
          <button
            type="button"
            disabled={!permanentQr}
            onClick={downloadPermanentQr}
            className="mt-5 flex min-h-12 w-full max-w-sm items-center justify-center gap-2 border border-[#161918] bg-white px-5 text-xs font-bold uppercase tracking-wider text-[#161918] disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Download QR for printing
          </button>
          <p className="mt-3 max-w-sm text-xs text-[#535A56]">
            Every scan creates a separate private 24-hour session for that customer.
          </p>
        </section>
      )}
    </div>
  );
}
