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
    href: '/login?next=/create',
  },
];

const pricingPlans = [
  {
    title: 'Growth',
    volume: '1000 videos + 1000 try-ons',
    retry: '15% retry included',
    price: 'Rs 2 lakhs',
  },
  {
    title: 'Scale',
    volume: '2000 videos + 2000 try-ons',
    retry: '15% retry included',
    price: 'Rs 3.5 lakhs',
  },
  {
    title: 'Enterprise',
    volume: '3000 videos + 5000 try-ons',
    retry: '20% retry included',
    price: 'Rs 5 lakhs',
  },
];

const pricingIncludes = [
  'No leakage',
  'No duplication',
  'No competitor support',
  'Regional courtesy',
  'Future branding workouts',
  'Full customer protection',
  '100% secured',
  'Privacy and brand value maintained',
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
              href="/tv-login?next=/tv"
              className="inline-flex items-center gap-2 border border-[#6e0d1f]/20 bg-white/70 px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#6e0d1f] shadow-sm backdrop-blur hover:bg-white"
            >
              <Tv className="h-4 w-4 text-[#8A6A20]" />
              TV
            </Link>
          </div>
        </header>

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-84px)] max-w-7xl grid-cols-1 items-center gap-10 px-5 pb-12 pt-10 md:grid-cols-[1.05fr_0.95fr] md:px-8">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 border-l-2 border-[#6e0d1f] bg-white/68 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#6e0d1f] shadow-sm backdrop-blur">
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

          <div className="border border-[#6e0d1f]/14 bg-white/88 p-6 shadow-2xl backdrop-blur md:p-7">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#8A6A20]">Client Portal</p>
                <h2 className="mt-2 font-serif text-3xl font-bold text-[#2A060C]">Choose your store</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#5C4B43]">
                  Select the retail workspace assigned to your store.
                </p>
              </div>
              <ShieldCheck className="h-6 w-6 text-emerald-700" />
            </div>

            <div className="space-y-4">
              <div className="border border-[#6e0d1f]/18 bg-[#fffaf0] p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-13 w-13 items-center justify-center border border-[#6e0d1f]/20 bg-white text-[#6e0d1f]">
                    <Store className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <label htmlFor="store-select" className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#8A6A20]">
                      Store
                    </label>
                    <select
                      id="store-select"
                      defaultValue="maharaja"
                      className="mt-2 w-full appearance-none border border-[#6e0d1f]/20 bg-white px-4 py-3 font-serif text-2xl font-bold text-[#2A060C] outline-none focus:border-[#6e0d1f]"
                    >
                      {storeCards.map((store) => (
                        <option key={store.name} value={store.name.toLowerCase()}>
                          {store.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#6B5A52]">
                      <MapPin className="h-3.5 w-3.5 text-[#8A6A20]" />
                      {storeCards[0].location}
                    </p>
                  </div>
                  <BadgeCheck className="h-5 w-5 shrink-0 text-emerald-700" />
                </div>

                <div className="mt-5 flex items-center justify-between gap-4 border-t border-[#e7d9b7] pt-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                    {storeCards[0].status}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#6e0d1f]">
                    Workspace ready
                  </span>
                </div>

                <Link
                  href={storeCards[0].href}
                  className="mt-5 flex w-full items-center justify-center gap-2 bg-[#6e0d1f] px-5 py-4 text-xs font-black uppercase tracking-wider text-[#F3E5AB] transition hover:bg-[#800A1D]"
                >
                  Continue to login <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="mt-5 border border-[#6e0d1f]/10 bg-[#F8F5EE] p-4">
              <div className="flex items-center gap-3">
                <LockKeyhole className="h-4 w-4 text-[#6e0d1f]" />
                <p className="text-xs font-semibold leading-5 text-[#5C4B43]">
                  Store login opens the selected campaign workspace. New client stores can be added to this portal as they go live.
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

      <section className="bg-[#FBF7EF] px-5 py-16 md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-[11px] font-black uppercase tracking-[0.26em] text-[#8A6A20]">
              Pricing for retail campaigns
            </p>
            <h2 className="mt-3 font-serif text-4xl font-bold leading-tight text-[#2A060C] md:text-5xl">
              Built for Diwali volume, showroom safety and brand control.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[#5C4B43] md:text-base">
              Each plan includes AI video generation, AI try-on allocation, retry buffer, customer privacy handling and Maharaja-style campaign support.
            </p>
          </div>

          <div className="mt-9 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <div key={plan.title} className="border border-[#d8c49b] bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-[#6e0d1f]">{plan.title}</p>
                    <h3 className="mt-3 font-serif text-3xl font-bold text-[#2A060C]">{plan.price}</h3>
                  </div>
                  <BadgeCheck className="h-6 w-6 text-emerald-700" />
                </div>
                <p className="mt-5 text-sm font-bold uppercase tracking-wider text-[#3B2D28]">{plan.volume}</p>
                <p className="mt-2 text-xs font-semibold text-[#7A5B16]">{plan.retry}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 border border-[#D4AF37]/40 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#8A6A20]">
              Future model coming soon
            </p>
            <h3 className="mt-3 font-serif text-3xl font-bold text-[#2A060C]">
              100 free try-ons
            </h3>
            <p className="mt-3 text-sm font-bold uppercase tracking-wider text-[#6e0d1f]">
              Celebrity AI Video + Event Dress Try-On
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
            <div className="border border-[#d8c49b] bg-[#fffaf0] p-6">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#6e0d1f]">All prices include</p>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {pricingIncludes.map((item) => (
                  <div key={item} className="flex items-center gap-3 border border-[#e7d9b7] bg-white px-3 py-3">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" />
                    <p className="text-xs font-bold uppercase tracking-wider text-[#4A3B35]">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-[#6e0d1f]/25 bg-[#2A060C] p-6 text-[#F3E5AB]">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#D4AF37]">
                Add-on support
              </p>
              <h3 className="mt-3 font-serif text-3xl font-bold">Rs 25,000</h3>
              <p className="mt-3 text-sm font-semibold leading-6 text-[#F3E5AB]/82">
                Digital support + branding workouts for campaign setup, improvements and store-level rollout.
              </p>
              <div className="mt-6 border-t border-[#D4AF37]/25 pt-5">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#D4AF37]">Enterprise</p>
                <p className="mt-2 text-sm font-semibold text-[#F3E5AB]/86">
                  Contact sales for custom volume: <span className="font-black text-white">9994837342</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
