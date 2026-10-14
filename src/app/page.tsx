import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  LockKeyhole,
  MonitorPlay,
  ShieldCheck,
  Store,
  Tv,
  WandSparkles,
} from 'lucide-react';

const stores = [
  {
    id: 'maharaja',
    name: 'Maharaja',
    location: 'Thanjavur, Tamil Nadu',
    href: '/create',
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
    <main className="min-h-screen bg-[#F8F5EE] text-[#1A1412] font-sans">
      <section className="border-b border-[#e1d1ad] bg-[#fbf7ef]">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center border border-[#6e0d1f]/20 bg-[#6e0d1f] text-[#F3E5AB]">
              <WandSparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="font-serif text-2xl font-bold tracking-[0.02em] text-[#6e0d1f]">tryfocus</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#8A6A20]">Client workspace portal</p>
            </div>
          </div>

          <Link
            href="/tv-login?next=/tv"
            className="inline-flex items-center gap-2 border border-[#6e0d1f]/20 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#6e0d1f] shadow-sm hover:bg-[#fffaf0]"
          >
            <Tv className="h-4 w-4 text-[#8A6A20]" />
            TV Login
          </Link>
        </header>
      </section>

      <section className="px-5 py-10 md:px-8 md:py-14">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="pt-2">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#8A6A20]">FocusAI Retail Platform</p>
            <h1 className="mt-4 max-w-xl font-serif text-4xl font-bold leading-tight text-[#2A060C] md:text-6xl">
              Select a store workspace to continue.
            </h1>
            <p className="mt-5 max-w-xl text-base font-semibold leading-8 text-[#5C4B43]">
              Client teams enter from this portal, choose their assigned store, and open the secured campaign workspace for try-on, AI video and showroom TV control.
            </p>

            <div className="mt-8 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ['1', 'Choose store'],
                ['2', 'Login'],
                ['3', 'Create'],
              ].map(([step, label]) => (
                <div key={step} className="border border-[#d8c49b] bg-white p-4">
                  <p className="font-serif text-3xl font-bold text-[#6e0d1f]">{step}</p>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-[#7A5B16]">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-[#d9c7a1] bg-white p-5 shadow-lg md:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[#8A6A20]">Client Portal</p>
                <h2 className="mt-2 font-serif text-4xl font-bold text-[#2A060C]">Choose your store</h2>
                <p className="mt-3 text-sm font-semibold leading-6 text-[#5C4B43]">
                  Store is intentionally empty first. Select Maharaja only when you want to enter that workspace.
                </p>
              </div>
              <Store className="h-6 w-6 shrink-0 text-[#8A6A20]" />
            </div>

            <form action="/login" method="get" className="border border-[#e7d9b7] bg-[#fffaf0] p-4 md:p-5">
              <input type="hidden" name="next" value="/create" />

              <label htmlFor="store-select" className="text-[10px] font-black uppercase tracking-[0.24em] text-[#8A6A20]">
                Store workspace
              </label>
              <select
                id="store-select"
                name="store"
                defaultValue=""
                required
                className="mt-3 w-full appearance-none border border-[#6e0d1f]/25 bg-white px-4 py-4 text-base font-black uppercase tracking-wider text-[#2A060C] outline-none focus:border-[#6e0d1f]"
              >
                <option value="" disabled>
                  Select store
                </option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name} - {store.location}
                  </option>
                ))}
              </select>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#e7d9b7] pt-4 text-[10px] font-black uppercase tracking-wider">
                <span className="flex items-center gap-1.5 text-emerald-800">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  Maharaja pilot ready
                </span>
                <span className="text-[#6e0d1f]">Secured login</span>
              </div>

              <button
                type="submit"
                className="mt-5 flex w-full items-center justify-center gap-2 bg-[#6e0d1f] px-5 py-4 text-xs font-black uppercase tracking-wider text-[#F3E5AB] transition hover:bg-[#800A1D]"
              >
                Continue to login <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            <div className="mt-5 border border-[#6e0d1f]/10 bg-[#F8F5EE] p-4">
              <div className="flex items-center gap-3">
                <LockKeyhole className="h-4 w-4 text-[#6e0d1f]" />
                <p className="text-xs font-semibold leading-5 text-[#5C4B43]">
                  Login opens only the selected campaign workspace. Other client stores can be added here later without changing the Maharaja flow.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#e1d1ad] bg-[#fffaf0] px-5 py-12 md:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.26em] text-[#8A6A20]">Campaign packages</p>
              <h2 className="mt-3 font-serif text-4xl font-bold leading-tight text-[#2A060C]">
                Built for retail volume and brand safety.
              </h2>
            </div>
            <div className="flex items-center gap-2 border border-[#d8c49b] bg-white px-4 py-3 text-xs font-black uppercase tracking-wider text-[#6e0d1f]">
              <MonitorPlay className="h-4 w-4 text-[#8A6A20]" />
              Try-on + AI video + TV
            </div>
          </div>

          <div className="mt-7 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <div key={plan.title} className="border border-[#d8c49b] bg-white p-6 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#6e0d1f]">{plan.title}</p>
                <h3 className="mt-3 font-serif text-3xl font-bold text-[#2A060C]">{plan.price}</h3>
                <p className="mt-5 text-sm font-bold uppercase tracking-wider text-[#3B2D28]">{plan.volume}</p>
                <p className="mt-2 text-xs font-semibold text-[#7A5B16]">{plan.retry}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
            <div className="border border-[#d8c49b] bg-white p-6">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#6e0d1f]">Included</p>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {pricingIncludes.map((item) => (
                  <div key={item} className="flex items-center gap-3 border border-[#e7d9b7] bg-[#fffaf0] px-3 py-3">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" />
                    <p className="text-xs font-bold uppercase tracking-wider text-[#4A3B35]">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-[#6e0d1f]/25 bg-[#2A060C] p-6 text-[#F3E5AB]">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#D4AF37]">Future module</p>
              <h3 className="mt-3 font-serif text-3xl font-bold">100 free try-ons</h3>
              <p className="mt-3 text-sm font-semibold leading-6 text-[#F3E5AB]/82">
                Celebrity AI video and event dress try-on module planned for client expansion.
              </p>
              <a
                href="https://wefocus.in"
                target="_blank"
                rel="noreferrer"
                className="mt-6 flex w-full items-center justify-center gap-2 bg-[#D4AF37] px-5 py-4 text-xs font-black uppercase tracking-wider text-black"
              >
                Explore wefocus.in <ArrowRight className="h-4 w-4" />
              </a>
              <p className="mt-5 border-t border-[#D4AF37]/25 pt-5 text-xs font-bold uppercase tracking-wider text-[#F3E5AB]/86">
                Enterprise sales: 9994837342
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
