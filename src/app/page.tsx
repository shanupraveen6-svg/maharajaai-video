import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Camera,
  Crown,
  Flame,
  LockKeyhole,
  MapPin,
  ShieldCheck,
  Sparkles,
  Store,
  Tv,
} from 'lucide-react';

const storeCards = [
  {
    name: 'Maharaja',
    location: 'Thanjavur, Tamil Nadu',
    status: 'Active pilot',
    href: '/create',
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#070609] text-[#F8F5EE] font-sans overflow-hidden">
      <section className="relative min-h-screen">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,6,9,0.24),rgba(7,6,9,0.96)),url('https://images.unsplash.com/photo-1605379399843-5870eea9b74e?auto=format&fit=crop&w=1800&q=80')]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(212,175,55,0.18),transparent_34%),linear-gradient(90deg,rgba(42,6,12,0.94),rgba(7,6,9,0.72),rgba(42,6,12,0.92))]" />

        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#D4AF37]/50 bg-black/50 text-[#D4AF37]">
              <Crown className="h-5 w-5" />
            </div>
            <div>
              <p className="font-serif text-xl font-bold tracking-[0.22em] text-[#F3E5AB]">MAHARAJA AI</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#D4AF37]/80">Retail celebration studio</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/tv"
              className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/40 bg-black/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#F3E5AB] backdrop-blur hover:bg-black/70"
            >
              <Tv className="h-4 w-4 text-[#D4AF37]" />
              TV
            </Link>
          </div>
        </header>

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-84px)] max-w-7xl grid-cols-1 items-center gap-10 px-5 pb-12 pt-10 md:grid-cols-[1.05fr_0.95fr] md:px-8">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/35 bg-black/45 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#F3E5AB] backdrop-blur">
              <Flame className="h-4 w-4 text-[#D4AF37] animate-diya" />
              Tamil Nadu festive retail AI
            </div>

            <h1 className="font-serif text-5xl font-bold leading-[0.98] tracking-wide text-[#F3E5AB] md:text-7xl">
              Turn every festive shopper into the hero of the store screen.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-8 text-[#F8F5EE]/82 md:text-lg">
              Upload the garment, capture the customer, generate a premium Diwali fashion image, create a 6-second greeting video, then download or send it live to the showroom TV.
            </p>

            <div className="mt-8 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { icon: Camera, text: 'Garment capture' },
                { icon: Sparkles, text: 'AI fashion image' },
                { icon: Tv, text: 'Go live on TV' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.text} className="rounded-lg border border-white/12 bg-black/36 p-4 backdrop-blur">
                    <Icon className="mb-3 h-5 w-5 text-[#D4AF37]" />
                    <p className="text-xs font-bold uppercase tracking-wider text-white/86">{item.text}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-[#D4AF37]/30 bg-[#10070C]/88 p-5 shadow-2xl backdrop-blur md:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#D4AF37]">Select Store</p>
                <h2 className="mt-2 font-serif text-3xl font-bold text-[#F3E5AB]">Choose your pilot location</h2>
              </div>
              <ShieldCheck className="h-6 w-6 text-emerald-300" />
            </div>

            <div className="space-y-4">
              {storeCards.map((store) => (
                <Link
                  key={store.name}
                  href={store.href}
                  className="group block rounded-xl border border-[#D4AF37]/35 bg-black/45 p-5 transition hover:border-[#F5E089] hover:bg-black/70"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-4">
                      <div className="flex h-13 w-13 items-center justify-center rounded-lg border border-[#D4AF37]/35 bg-[#D4AF37]/12 text-[#D4AF37]">
                        <Store className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="font-serif text-2xl font-bold text-[#F3E5AB]">{store.name}</h3>
                        <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/62">
                          <MapPin className="h-3.5 w-3.5 text-[#D4AF37]" />
                          {store.location}
                        </p>
                      </div>
                    </div>
                    <BadgeCheck className="h-5 w-5 text-emerald-300" />
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-4">
                    <span className="rounded-full border border-emerald-300/30 bg-emerald-950/40 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                      {store.status}
                    </span>
                    <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#F3E5AB]">
                      Login and create <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center gap-3">
                <LockKeyhole className="h-4 w-4 text-[#D4AF37]" />
                <p className="text-xs font-semibold leading-5 text-white/72">
                  Store login is required before entering the creation studio. Maharaja is active now; more stores can be added later.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
