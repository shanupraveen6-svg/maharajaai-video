'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Check, Clock, Phone, Smartphone, Sparkles, X } from 'lucide-react';
import { NOVEMBER_OFFER_ENDS_AT, novemberOfferActive } from '@/lib/tryfocus/november-offer';


const SALES_PHONE = '9994837342';
// The Phone package price customers see: ₹20,000, GST included.
const PHONE_SOFTWARE_FEE = '₹20,000';

/**
 * November offer for the Phone platform: a strip at the top of the landing page and a highlighted card in
 * pricing. Either opens the offer: no software charge in November, 60 free Try-On credits, top-ups in
 * November, and Call now (9994837342).
 */
export default function NovemberOffer({ variant }: { variant: 'strip' | 'card' }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(true);
  // Days left until 30 November ends (India time); read in the browser so the page cache never shows a stale count.
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      if (!novemberOfferActive()) { setActive(false); return; }
      setDaysLeft(Math.max(1, Math.ceil((NOVEMBER_OFFER_ENDS_AT - Date.now()) / 86_400_000)));
    };
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  if (!active) return null;

  const trigger = variant === 'strip' ? (
    <button type="button" onClick={() => setOpen(true)} className="tf-offer-strip relative flex w-full items-center justify-center gap-2 overflow-hidden bg-gradient-to-r from-[#B8860B] via-[#F3D36B] to-[#B8860B] px-4 py-2.5 text-center text-xs font-bold text-[#2A060C] sm:text-sm">
      <span className="relative flex h-2.5 w-2.5 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7A1428] opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#7A1428]" /></span>
      <span>November offer: Phone Try-On is free this month, with 60 Try-Ons included.</span>
      {daysLeft !== null && <span className="hidden rounded-full bg-[#2A060C] px-2.5 py-0.5 text-[#F3E5AB] sm:inline">{daysLeft === 1 ? 'Ends today' : `${daysLeft} days left`}</span>}
      <span className="hidden underline underline-offset-4 md:inline">See offer</span>
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="tf-offer-card group relative mx-auto mt-8 block w-full max-w-4xl overflow-hidden rounded-[2rem] bg-[radial-gradient(120%_140%_at_0%_0%,#5C0E1E_0%,#2A060C_55%,#160307_100%)] p-6 text-left text-white shadow-[0_24px_60px_-20px_rgba(122,20,40,0.65)] ring-2 ring-[#D4AF37] transition hover:-translate-y-1 sm:p-9"
    >
      {/* A gold shine sweeps across the card. */}
      <span aria-hidden="true" className="tf-offer-shine pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-20deg] bg-gradient-to-r from-transparent via-[#F3E5AB]/25 to-transparent" />
      <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#D4AF37]/15 blur-2xl" />

      <span className="relative flex flex-wrap items-center gap-2">
        <span className="tf-offer-pulse inline-flex items-center gap-1.5 rounded-full bg-[#D4AF37] px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-[#2A060C]">
          <Sparkles className="h-3.5 w-3.5" /> November offer
        </span>
        {daysLeft !== null && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D4AF37]/60 px-3 py-1 text-xs font-bold text-[#F3E5AB]">
            <Clock className="h-3.5 w-3.5" /> {daysLeft === 1 ? 'Ends today' : `${daysLeft} days left`}
          </span>
        )}
      </span>

      <span className="relative mt-5 grid items-center gap-6 sm:grid-cols-[1fr_auto]">
        <span>
          <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-6xl font-extrabold leading-none text-[#F3D36B] drop-shadow sm:text-7xl">₹0</span>
            <span className="text-2xl font-bold text-white/55 line-through decoration-[#D4AF37] decoration-2">{PHONE_SOFTWARE_FEE}</span>
          </span>
          <span className="mt-3 block text-2xl font-extrabold leading-tight sm:text-3xl">Phone Try-On, free through November</span>
          <span className="mt-2 block max-w-xl text-[15px] text-[#F3E5AB]/85">Shoppers scan your Wall QR and see your collection on themselves, on their own phones. Start today at no cost.</span>
          <span className="mt-5 flex flex-wrap gap-2">
            {['No software fee', '60 Try-Ons included', 'Top up anytime'].map((chip) => (
              <span key={chip} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-semibold text-white ring-1 ring-white/15">
                <Check className="h-4 w-4 text-[#F3D36B]" /> {chip}
              </span>
            ))}
          </span>
        </span>
        <span className="flex flex-col items-start gap-2 sm:items-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#D4AF37]/15 text-[#F3D36B] ring-1 ring-[#D4AF37]/40"><Smartphone className="h-10 w-10" /></span>
          <span className="inline-flex min-h-14 items-center gap-2 rounded-2xl bg-[#F3D36B] px-6 text-base font-extrabold text-[#2A060C] shadow-lg transition group-hover:bg-white">
            Start free <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
          </span>
        </span>
      </span>
      <style>{`
        @keyframes tf-offer-shine { 0% { transform: translateX(0) skewX(-20deg); } 60%, 100% { transform: translateX(450%) skewX(-20deg); } }
        @keyframes tf-offer-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.6); } 50% { box-shadow: 0 0 0 8px rgba(212, 175, 55, 0); } }
        .tf-offer-shine { animation: tf-offer-shine 3.6s ease-in-out infinite; }
        .tf-offer-pulse { animation: tf-offer-pulse 2s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) { .tf-offer-shine, .tf-offer-pulse { animation: none; } }
      `}</style>
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
                <h2 id="november-offer-title" className="mt-3 text-2xl font-extrabold">Phone Try-On, free through November</h2>
                {daysLeft !== null && <p className="mt-1 text-sm font-semibold text-muted">{daysLeft === 1 ? 'Ends today' : `${daysLeft} days left`}</p>}
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line-strong"><X className="h-5 w-5" /></button>
            </div>
            <ul className="mt-5 space-y-3 text-[15px]">
              {[
                `No software fee in November (regularly ${PHONE_SOFTWARE_FEE} including GST).`,
                '60 Try-Ons included.',
                'Need more? Top up anytime, from 500 Try-Ons.',
              ].map((line) => (
                <li key={line} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success-soft text-success"><Check className="h-4 w-4" /></span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted">From December, the standard {PHONE_SOFTWARE_FEE} Phone package (including GST) applies.</p>
            <a href={`tel:${SALES_PHONE}`} className="tf-btn tf-btn-primary mt-6 !min-h-14 w-full text-base">
              <Phone className="h-5 w-5" /> Call sales: {SALES_PHONE}
            </a>
            <p className="mt-2 text-center text-xs text-muted">Our team sets up your store and Wall QR for you.</p>
          </div>
        </div>
      )}
    </>
  );
}
