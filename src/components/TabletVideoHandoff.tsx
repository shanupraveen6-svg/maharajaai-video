'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Clock, Gift, LoaderCircle, MessageSquare, QrCode, RefreshCw, Smartphone } from 'lucide-react';
import { formatINR } from '@/lib/tryfocus/sample-data';

type CounterConfig = {
  clientName: string;
  videoMinPurchase: number;
  whatsappEnabled: boolean;
};

const QR_COLORS = { dark: '#161918', light: '#FFFFFF' };

/**
 * The AI Video thank-you gift QR, given after a purchase. Shown in the client workspace, on the counter
 * tablet or the biller's phone (operator session), and on the billing link (billingCode capability). Each
 * "New customer" tap issues a fresh private pass whose 1-day validity starts when the customer first opens
 * it. The customer picks the store collection or the outfit they bought, then downloads or Goes Live.
 */
export default function TabletVideoHandoff({ billingCode }: { billingCode?: string }) {
  const [config, setConfig] = useState<CounterConfig | null>(null);
  const [passQr, setPassQr] = useState('');
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
          } : Promise.reject(new Error(data?.error || 'Invalid billing-counter link.')))
      : fetch('/api/maharaja/workspace', { cache: 'no-store' })
          .then((response) => response.json())
          .then((data) => data?.success ? {
            clientName: data.workspace?.clientName,
            videoMinPurchase: Number(data.workspace?.videoMinPurchase ?? 5000),
            whatsappEnabled: data.workspace?.whatsappEnabled === true,
          } : Promise.reject(new Error(data?.error || 'Sign in again to load the counter QR.')));
    source
      .then((next: CounterConfig) => { if (active) setConfig(next); })
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

  const minimum = config?.videoMinPurchase ?? 5000;
  const storeName = config?.clientName || 'the store';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-brand-soft px-4 py-3 text-sm">
        <p className="font-semibold text-ink">
          <Gift className="mr-1.5 inline h-4 w-4 text-brand" />
          Thank-you gift {minimum > 0 ? <>for bills of {formatINR(minimum)} and above</> : <>on every bill</>}
        </p>
        <span className="inline-flex items-center gap-1.5 text-muted">
          <Clock className="h-4 w-4" /> Each QR works for 1 day
        </span>
      </div>

      {error && <p role="alert" className="rounded-2xl bg-danger-soft p-3 text-sm font-semibold text-danger">{error}</p>}

      <section className="tf-card flex flex-col items-center p-6 text-center">
        <p className="flex items-center gap-2 text-sm font-semibold text-muted">
          <Smartphone className="h-4 w-4" />
          {passQr ? `Customer ${customerCount} · scan with your phone camera` : 'Ready for the next customer'}
        </p>
        <div className="mt-4 rounded-2xl border border-line bg-white p-3">
          {passQr ? (
            <img src={passQr} alt="AI Video gift QR for this customer" className="aspect-square w-[min(300px,70vw)] object-contain" />
          ) : (
            <div className="flex aspect-square w-[min(300px,70vw)] items-center justify-center text-subtle">
              <QrCode className="h-16 w-16" />
            </div>
          )}
        </div>
        {passQr && <p className="mt-3 max-w-sm text-sm text-ink">A gift from {storeName}: a short AI Video of you, in the outfit you bought or one from our collection.</p>}
        <button
          type="button"
          disabled={busy || !config}
          onClick={() => void issuePass()}
          className="tf-btn tf-btn-primary mt-5 !min-h-14 w-full max-w-sm text-base"
        >
          {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
          {busy ? 'Creating QR…' : passQr ? 'New customer' : 'Show QR for this customer'}
        </button>
        <p className="mt-3 max-w-sm text-sm text-muted">
          One QR per customer. Tap New customer for the next bill. A QR that is never scanned uses no credit.
        </p>

        {config?.whatsappEnabled && (
          <div className="mt-5 w-full max-w-sm border-t border-line pt-4 text-left">
            <label htmlFor="counter-phone" className="tf-label block">Or send the gift link on WhatsApp</label>
            <div className="mt-2 flex gap-2">
              <input
                id="counter-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
                inputMode="tel"
                placeholder="10-digit mobile number"
                className="min-h-12 min-w-0 flex-1 border border-line bg-white px-3 text-sm font-semibold outline-none focus:border-brand"
              />
              <button
                type="button"
                disabled={phone.length !== 10 || busy}
                onClick={() => void issuePass(phone)}
                className="tf-btn tf-btn-dark !min-h-12 px-4 text-sm"
              >
                <MessageSquare className="h-4 w-4" /> Send
              </button>
            </div>
          </div>
        )}
        {notice && <p role="status" className="mt-4 max-w-sm text-sm font-semibold text-success">{notice}</p>}
      </section>
    </div>
  );
}
