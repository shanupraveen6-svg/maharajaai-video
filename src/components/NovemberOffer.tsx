'use client';

import { useEffect, useState } from 'react';
import { Check, Phone, Smartphone, Sparkles, X } from 'lucide-react';
import { novemberOfferActive } from '@/lib/tryfocus/november-offer';


const SALES_PHONE = '9994837342';
const PHONE_SOFTWARE_FEE = '₹20,000';

/**
 * November offer for the Phone platform: a strip at the top of the landing page and a highlighted card in
 * pricing. Either opens the offer: no software charge in November, 60 free Try-On credits, top-ups in
 * November, and Call now (9994837342).
 */
export default function NovemberOffer({ variant }: { variant: 'strip' | 'card' }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(true);
  // The page is cached for a minute, so the browser checks the end date too.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the browser's clock is only read after mount
  useEffect(() => { if (!novemberOfferActive()) setActive(false); }, []);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  if (!active) return null;

  const trigger = variant === 'strip' ? (
    <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 bg-[#D4AF37] px-4 py-2 text-center text-xs font-bold text-[#2A060C] sm:text-sm">
      <Sparkles className="h-4 w-4 shrink-0" />
      <span>November offer: the Phone platform is free this month, with 60 Try-On credits.</span>
      <span className="hidden underline underline-offset-4 sm:inline">See the offer</span>
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="relative mx-auto mt-8 flex w-full max-w-3xl flex-col items-start gap-4 overflow-hidden rounded-3xl bg-[#2A060C] p-6 text-left text-white shadow-xl ring-2 ring-[#D4AF37] transition hover:-translate-y-0.5 sm:flex-row sm:items-center sm:p-7"
    >
      <span className="absolute right-4 top-4 rounded-full bg-[#D4AF37] px-3 py-1 text-xs font-bold text-[#2A060C]">November offer</span>
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#D4AF37]/15 text-[#F3E5AB]"><Smartphone className="h-7 w-7" /></span>
      <span className="min-w-0 flex-1 pr-24 sm:pr-28">
        <span className="block text-2xl font-bold">Phone platform free in November</span>
        <span className="mt-1 block text-sm text-[#F3E5AB]/85">
          No {PHONE_SOFTWARE_FEE} software charge this month, plus 60 free Try-On credits. Your customers try outfits on their own phones through your Wall QR.
        </span>
      </span>
      <span className="inline-flex min-h-12 shrink-0 items-center rounded-xl bg-[#D4AF37] px-5 text-sm font-bold text-[#2A060C]">See the offer</span>
    </button>
  );

  return (
    <>
      {trigger}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="november-offer-title" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-ink shadow-2xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-block rounded-full bg-[#D4AF37] px-3 py-1 text-xs font-bold text-[#2A060C]">November offer</span>
                <h2 id="november-offer-title" className="mt-3 text-2xl font-bold">Phone platform, free in November</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line-strong"><X className="h-5 w-5" /></button>
            </div>
            <ul className="mt-5 space-y-3 text-[15px]">
              {[
                `No software service charge in November (usually ${PHONE_SOFTWARE_FEE}).`,
                '60 Try-On credits free to use.',
                'After the 60, top up any time: credits are pay as you go.',
              ].map((line) => (
                <li key={line} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success-soft text-success"><Check className="h-4 w-4" /></span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted">From December, the Phone platform&apos;s {PHONE_SOFTWARE_FEE} software service charge applies.</p>
            <a href={`tel:${SALES_PHONE}`} className="tf-btn tf-btn-primary mt-6 !min-h-14 w-full text-base">
              <Phone className="h-5 w-5" /> Call now: {SALES_PHONE}
            </a>
            <p className="mt-2 text-center text-xs text-muted">Contact sales to start your free November.</p>
          </div>
        </div>
      )}
    </>
  );
}
