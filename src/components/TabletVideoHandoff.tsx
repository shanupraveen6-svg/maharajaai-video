'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Clock, Gift, LoaderCircle, MessageSquare, QrCode, RefreshCw, Search, Smartphone, X } from 'lucide-react';
import { formatINR } from '@/lib/tryfocus/sample-data';
import type { PublicCatalogueProduct } from '@/lib/maharaja/catalogue-types';

type CounterConfig = {
  clientName: string;
  videoMinPurchase: number;
  whatsappEnabled: boolean;
};

const QR_COLORS = { dark: '#161918', light: '#FFFFFF' };

const PAGE_SIZE = 100;

/**
 * The AI Video thank-you gift QR, given after a purchase. Shown in the client workspace, on the counter
 * tablet or the biller's phone (operator session), and on the billing link (billingCode capability). Each
 * "New customer" tap issues a fresh private pass whose 1-day validity starts when the customer first opens
 * it. AI Video uses the store collection: the biller may tap the piece the customer bought, so the
 * customer's phone opens with it chosen; otherwise the customer picks from the collection.
 */
export default function TabletVideoHandoff({ billingCode, qrOnly = false, autoShow = false }: {
  billingCode?: string;
  /** Shows the first QR without a tap (the tablet). Each QR counts as one given, so the workspace waits for a tap. */
  autoShow?: boolean;
  /** Only the QR and New customer: the customer picks the piece on their phone. */
  qrOnly?: boolean;
}) {
  const [config, setConfig] = useState<CounterConfig | null>(null);
  const [passQr, setPassQr] = useState('');
  const [customerCount, setCustomerCount] = useState(0);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pieces, setPieces] = useState<PublicCatalogueProduct[]>([]);
  const [piecesTotal, setPiecesTotal] = useState(0);
  const [piecesLoading, setPiecesLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [purchased, setPurchased] = useState<PublicCatalogueProduct | null>(null);

  async function fetchPieces(offset: number) {
    const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE), videoOnly: 'true' });
    if (billingCode) params.set('access', billingCode);
    const response = await fetch(`/api/maharaja/catalogue?${params}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data?.success) throw new Error(data?.error || 'The collection could not be loaded.');
    return {
      items: (data.products || []).filter((item: PublicCatalogueProduct) => item.eligibleForVideo !== false) as PublicCatalogueProduct[],
      total: Number(data.total || 0),
    };
  }

  function loadMorePieces() {
    setPiecesLoading(true);
    fetchPieces(pieces.length)
      .then(({ items, total }) => { setPieces((current) => [...current, ...items]); setPiecesTotal(total); })
      // The QR still works without the list: the customer then picks the piece on their phone.
      .catch(() => undefined)
      .finally(() => setPiecesLoading(false));
  }

  useEffect(() => {
    if (qrOnly) { setPiecesLoading(false); return; }
    let active = true;
    fetchPieces(0)
      .then(({ items, total }) => { if (active) { setPieces(items); setPiecesTotal(total); } })
      .catch(() => undefined)
      .finally(() => { if (active) setPiecesLoading(false); });
    return () => { active = false; };
  // Loads the first page once per counter link.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingCode]);

  const search = query.trim().toLowerCase();
  const matchingPieces = (search
    ? pieces.filter((item) => item.sku.toLowerCase().includes(search) || item.title.toLowerCase().includes(search))
    : pieces).slice(0, 24);

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
        body: JSON.stringify({
          ...(billingCode ? { billingCode } : { source: 'tablet-kiosk' }),
          phone: whatsappPhone,
          experienceType: 'catalogue-gift',
          ...(purchased ? { catalogueSku: purchased.sku } : {}),
          whatsappOptIn: Boolean(whatsappPhone),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.pass?.link) throw new Error(data.error || 'Unable to create the customer QR.');
      setPassQr(await QRCode.toDataURL(data.pass.link, { width: 560, margin: 2, color: QR_COLORS }));
      setCustomerCount((count) => count + 1);
      // The next customer starts with no piece chosen.
      setPurchased(null);
      setQuery('');
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

  // The tablet shows the first customer's QR as soon as the store settings load.
  useEffect(() => {
    if (autoShow && config && !passQr) void issuePass();
  // Runs once, when the settings arrive.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoShow, config]);

  const minimum = config?.videoMinPurchase ?? 5000;
  const storeName = config?.clientName || 'the store';

  return (
    <div className="space-y-4">
      {!qrOnly && <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-brand-soft px-4 py-3 text-sm">
        <p className="font-semibold text-ink">
          <Gift className="mr-1.5 inline h-4 w-4 text-brand" />
          Thank-you gift {minimum > 0 ? <>for bills of {formatINR(minimum)} and above</> : <>on every bill</>}
        </p>
        <span className="inline-flex items-center gap-1.5 text-muted">
          <Clock className="h-4 w-4" /> Each QR works for 1 day
        </span>
      </div>}

      {error && <p role="alert" className="rounded-2xl bg-danger-soft p-3 text-sm font-semibold text-danger">{error}</p>}

      {!qrOnly && <section className="tf-card p-5" aria-label="Piece the customer bought">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-bold text-ink">Piece the customer bought</h3>
          <p className="text-sm text-muted">Optional. Without it, the customer picks from the collection.</p>
        </div>
        {purchased ? (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-ink bg-white p-2 pr-3">
            <img src={purchased.thumbnailUrl || purchased.imageUrl} alt="" className="h-16 w-12 shrink-0 rounded-lg bg-canvas object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{purchased.title}</p>
              <p className="text-sm text-muted tabular-nums">{purchased.sku}</p>
            </div>
            <button type="button" onClick={() => setPurchased(null)} aria-label="Clear the chosen piece" className="flex h-11 w-11 items-center justify-center rounded-xl border border-line-strong"><X className="h-5 w-5" /></button>
          </div>
        ) : (
          <>
            <label className="mt-3 flex min-h-12 items-center gap-2 rounded-xl border border-line-strong bg-white px-3">
              <Search className="h-4 w-4 shrink-0 text-muted" />
              <span className="sr-only">Search by SKU or name</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="SKU or name" className="min-w-0 flex-1 bg-transparent text-base outline-none" />
            </label>
            <div className="mt-3 grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {matchingPieces.map((item) => (
                <button key={item.sku} type="button" onClick={() => setPurchased(item)} className="overflow-hidden rounded-xl border border-line bg-white text-left hover:border-ink">
                  <img src={item.thumbnailUrl || item.imageUrl} alt="" loading="lazy" className="aspect-[3/4] w-full bg-canvas object-cover" />
                  <span className="block truncate px-2 py-1.5 text-xs font-semibold text-ink">{item.title}</span>
                </button>
              ))}
            </div>
            {piecesLoading && <p className="mt-2 flex items-center gap-2 text-sm text-muted"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading the collection…</p>}
            {!piecesLoading && search && matchingPieces.length === 0 && <p className="mt-2 text-sm text-muted">No AI Video piece matches. The customer can pick on their phone.</p>}
            {!piecesLoading && pieces.length < piecesTotal && (
              <button type="button" onClick={loadMorePieces} className="mt-2 min-h-11 text-sm font-semibold text-ink underline underline-offset-4">Load more pieces</button>
            )}
          </>
        )}
      </section>}

      <section className="tf-card flex flex-col items-center p-6 text-center">
        <p className="flex items-center gap-2 text-sm font-semibold text-muted">
          <Smartphone className="h-4 w-4" />
          {passQr ? (qrOnly ? 'Scan with your phone camera' : `Customer ${customerCount} · scan with your phone camera`) : 'Ready for the next customer'}
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
        {passQr && !qrOnly && <p className="mt-3 max-w-sm text-sm text-ink">A gift from {storeName}: a short AI Video of you in a piece from our collection.</p>}
        <button
          type="button"
          disabled={busy || !config}
          onClick={() => void issuePass()}
          className="tf-btn tf-btn-primary mt-5 !min-h-14 w-full max-w-sm text-base"
        >
          {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
          {busy ? 'Creating QR…' : passQr ? 'New customer' : 'Show QR for this customer'}
        </button>
        {!qrOnly && <p className="mt-3 max-w-sm text-sm text-muted">
          One QR per customer. Tap New customer for the next bill. A QR that is never scanned uses no credit.
        </p>}

        {config?.whatsappEnabled && !qrOnly && (
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
