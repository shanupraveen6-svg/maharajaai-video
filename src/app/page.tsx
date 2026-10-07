import React from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Camera,
  Crown,
  Image as ImageIcon,
  LockKeyhole,
  MapPin,
  MonitorPlay,
  ShieldCheck,
  Store,
  Tv,
  WandSparkles,
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
    <main className="min-h-screen bg-[#F8F5EE] text-[#1A1412] font-sans overflow-hidden">
      <section className="relative min-h-screen">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,245,238,0.94),rgba(248,245,238,0.86)),url('https://images.unsplash.com/photo-1615715874901-4412f63d6e0f?auto=format&fit=crop&w=1800&q=80')]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(212,175,55,0.22),transparent_28%),linear-gradient(90deg,rgba(248,245,238,0.98),rgba(248,245,238,0.76),rgba(110,13,31,0.18))]" />

        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#6e0d1f]/20 bg-[#6e0d1f] text-[#F3E5AB]">
              <WandSparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="font-serif text-2xl font-bold tracking-[0.02em] text-[#6e0d1f]">focusAI</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#8A6A20]">Fashion retail AI studio</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/tv"
              className="inline-flex items-center gap-2 rounded-full border border-[#6e0d1f]/20 bg-white/70 px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#6e0d1f] shadow-sm backdrop-blur hover:bg-white"
            >
              <Tv className="h-4 w-4 text-[#8A6A20]" />
              TV
            </Link>
          </div>
        </header>

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-84px)] max-w-7xl grid-cols-1 items-center gap-10 px-5 pb-12 pt-10 md:grid-cols-[1.05fr_0.95fr] md:px-8">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#6e0d1f]/15 bg-white/74 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#6e0d1f] shadow-sm backdrop-blur">
              <Activity className="h-4 w-4 text-[#8A6A20]" />
              AI marketing OS for fashion stores
            </div>

            <h1 className="font-serif text-5xl font-bold leading-[0.98] tracking-wide text-[#2A060C] md:text-7xl">
              Fashion stores need more than try-on. They need moments customers share.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-8 text-[#4A3B35] md:text-lg">
              focusAI helps retail teams create AI fashion images, festive greeting videos, showroom TV moments and campaign-ready content from real customer and garment photos.
            </p>

            <div className="mt-8 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { icon: Camera, text: 'Capture garments' },
                { icon: ImageIcon, text: 'Generate AI looks' },
                { icon: MonitorPlay, text: 'Broadcast in-store' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.text} className="rounded-lg border border-[#6e0d1f]/10 bg-white/72 p-4 shadow-sm backdrop-blur">
                    <Icon className="mb-3 h-5 w-5 text-[#6e0d1f]" />
                    <p className="text-xs font-bold uppercase tracking-wider text-[#3B2D28]">{item.text}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-9 grid max-w-2xl grid-cols-3 gap-3">
              {[
                ['142', 'AI creates'],
                ['38', 'TV moments'],
                ['4', 'Retail modules'],
              ].map(([value, label]) => (
                <div key={label} className="rounded-lg border border-[#D4AF37]/28 bg-[#fffaf0]/80 p-4">
                  <p className="font-serif text-3xl font-bold text-[#6e0d1f]">{value}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#7A5B16]">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[#6e0d1f]/14 bg-white/86 p-5 shadow-2xl backdrop-blur md:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#8A6A20]">Enter Workspace</p>
                <h2 className="mt-2 font-serif text-3xl font-bold text-[#2A060C]">Select store</h2>
              </div>
              <ShieldCheck className="h-6 w-6 text-emerald-700" />
            </div>

            <div className="space-y-4">
              {storeCards.map((store) => (
                <Link
                  key={store.name}
                  href={store.href}
                  className="group block rounded-xl border border-[#6e0d1f]/18 bg-[#fffaf0] p-5 transition hover:border-[#6e0d1f]/45 hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-4">
                      <div className="flex h-13 w-13 items-center justify-center rounded-lg border border-[#6e0d1f]/20 bg-[#6e0d1f]/8 text-[#6e0d1f]">
                        <Store className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="font-serif text-2xl font-bold text-[#2A060C]">{store.name}</h3>
                        <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#6B5A52]">
                          <MapPin className="h-3.5 w-3.5 text-[#8A6A20]" />
                          {store.location}
                        </p>
                      </div>
                    </div>
                    <BadgeCheck className="h-5 w-5 text-emerald-700" />
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-4">
                    <span className="rounded-full border border-emerald-700/18 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                      {store.status}
                    </span>
                    <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#6e0d1f]">
                      Login and create <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-5 rounded-lg border border-[#6e0d1f]/10 bg-[#F8F5EE] p-4">
              <div className="flex items-center gap-3">
                <LockKeyhole className="h-4 w-4 text-[#6e0d1f]" />
                <p className="text-xs font-semibold leading-5 text-[#5C4B43]">
                  Store login opens the focusAI workspace for that client. Maharaja is active now; more stores and campaigns can be added later.
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                { icon: BarChart3, text: 'Campaign analytics' },
                { icon: Crown, text: 'Premium retail modules' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.text} className="rounded-lg border border-[#6e0d1f]/10 bg-white p-3">
                    <Icon className="mb-2 h-4 w-4 text-[#8A6A20]" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#5C4B43]">{item.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
