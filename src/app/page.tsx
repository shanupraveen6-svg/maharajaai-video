import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight, BarChart3, Camera, Check, ChevronDown, CirclePlay,
  LockKeyhole, MonitorPlay, Phone, ShieldCheck, Sparkles, Store,
} from 'lucide-react';
import PricingCalculator, { type PricingCalculatorConfig } from '@/components/PricingCalculator';
import NovemberOffer from '@/components/NovemberOffer';
import { novemberOfferActive } from '@/lib/tryfocus/november-offer';
import {
  CREDIT_LABELS, CREDIT_RANGE, CREDIT_VALIDITY_MONTHS, GST_RATE, PLATFORMS, PLATFORM_LABELS, PLATFORM_MODULES,
  PRESETS, SOFTWARE_FEE, moduleTotalsTable,
} from '@/lib/maharaja/pricing';
import { listClientWorkspaces } from '@/lib/maharaja/server';

// Every workspace TryFocus admin created, refreshed each minute, so a new store appears without a release.
export const revalidate = 60;

async function storeList(): Promise<Array<{ id: string; name: string; location: string }>> {
  try {
    const workspaces = await listClientWorkspaces();
    return workspaces
      .map((workspace) => ({ id: workspace.clientId, name: workspace.clientName.replace(/^The\s+/i, ''), location: workspace.branch || '' }))
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return [{ id: 'maharaja', name: 'Majestic Maharaja', location: 'Thanjavur, Tamil Nadu' }];
  }
}

const capabilities = [
  ['01', 'Virtual try-on', 'Turn a shopper photo and garment reference into an immediate, downloadable retail try-on.', Camera],
  ['02', 'Cinematic retail video', 'Create event-led customer films with controlled identity, garment detail and brand presentation.', CirclePlay],
  ['03', 'Showroom live', 'Move approved customer films into a managed television queue and an always-on replay library.', MonitorPlay],
  ['04', 'Store intelligence', 'Track scans, successful generations, retries, downloads and participation from one workspace.', BarChart3],
] as const;

/** The calculator gets only package totals per credit count (rules in pricing.ts), never per-credit prices. */
const pricingConfig: PricingCalculatorConfig = {
  platforms: PLATFORMS,
  platformLabels: PLATFORM_LABELS,
  platformModules: PLATFORM_MODULES,
  softwareFee: SOFTWARE_FEE,
  ranges: CREDIT_RANGE,
  labels: CREDIT_LABELS,
  totals: { image: moduleTotalsTable('image'), video: moduleTotalsTable('video'), live: moduleTotalsTable('live') },
  presets: PRESETS,
  gstRate: GST_RATE,
  validityMonths: CREDIT_VALIDITY_MONTHS,
};

const principles = [
  'Client-isolated workspaces',
  'Consent-led showroom publishing',
  'Usage and retry controls',
  'Automatic media retention rules',
];

export default async function LandingPage() {
  const stores = await storeList();
  // The November Phone offer shows until 30 November 2026 (India time).
  const offerOn = novemberOfferActive();
  return (
    <main className="min-h-screen bg-[#F4F5F2] text-ink">
      {offerOn && <NovemberOffer variant="strip" />}
      <header className="border-b border-line bg-[#F4F5F2]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto flex min-h-14 max-w-7xl items-center justify-between px-5 md:px-8">
          <Link href="/" className="rounded-xl flex items-center gap-3" aria-label="TryFocus home">
            <span className="flex h-8 w-8 items-center justify-center bg-brand text-white shadow-sm"><Sparkles className="h-4 w-4" /></span>
            <span>
              <span className="block text-base sm:text-lg font-bold leading-none tracking-tight">TryFocus</span>
              <span className="mt-0.5 block text-[8.5px] font-bold text-[#626A66]">Retail experience platform</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-xs font-bold text-[#4D5551] md:flex" aria-label="Primary navigation">
            <a href="#platform" className="transition hover:text-[#7A1428]">Platform</a>
            <a href="#pricing" className="transition hover:text-[#7A1428]">Pricing</a>
            <a href="#operations" className="transition hover:text-[#7A1428]">Operations</a>
            <a href="https://wefocus.in" target="_blank" rel="noopener noreferrer" className="transition hover:text-[#7A1428]">Company</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/admin" className="rounded-xl inline-flex min-h-9 items-center gap-1.5 border border-ink bg-white px-3 text-xs font-bold text-ink transition hover:border-brand hover:text-brand">
              <LockKeyhole className="h-3.5 w-3.5 text-brand" />
              Admin
            </Link>
            <a href="tel:9994837342" className="rounded-xl inline-flex min-h-9 items-center gap-2 bg-ink px-3.5 text-xs font-bold text-white transition hover:bg-brand shadow-sm">
              <Phone className="h-3.5 w-3.5 text-[#E8B878]" />
              <span className="hidden sm:inline">Contact:</span> 9994837342
            </a>
          </div>
        </div>
      </header>

      <section className="border-b border-line">
        <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="flex flex-col justify-center border-line px-5 py-6 sm:py-8 md:px-8 lg:border-r lg:py-6 xl:py-8">
            <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-[1.08] sm:text-4xl lg:text-[2.65rem] xl:text-[3.1rem] tracking-tight">
              TryFocus turns a store visit into a customer experience.
            </h1>
            <p className="mt-3.5 max-w-2xl text-sm sm:text-base leading-6 sm:leading-7 text-muted">
              A client-managed platform for virtual try-on, personalized retail films, QR journeys and showroom screens. Designed for fashion stores that want measurable engagement without adding friction at the counter.
            </p>
            <div className="mt-6 xl:mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4 text-xs font-bold text-muted">
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand" /> Client-isolated</span>
              <span className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-brand" /> Consent-led</span>
              <span className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-brand" /> Usage-controlled</span>
            </div>
          </div>

          <div className="flex items-center justify-center bg-[#E8EBE7] px-4 py-2.5 sm:px-6 md:px-8 lg:py-3">
            <div id="client-access" className="rounded-2xl w-full max-w-[420px] xl:max-w-[440px] overflow-hidden border border-[#BAC3BA] bg-canvas shadow-[0_18px_50px_rgba(21,28,24,0.12)]">
              {/* Header Status Bar */}
              <div className="flex items-center justify-between border-b border-line bg-white px-3.5 py-2 sm:px-4">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3D8A5E] opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#3D8A5E]"></span>
                  </span>
                  <div>
                    <p className="text-xs font-bold text-brand">Live AR Try-On</p>
                    <p className="text-xs font-bold text-ink">In-Store Customer Fitting</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-[#D0D6D0] bg-[#F4F5F2] px-2 py-0.5 text-[8.5px] font-bold text-muted">
                  <Sparkles className="h-2.5 w-2.5 text-brand" /> Multi-Look AI
                </span>
              </div>

              {/* Real Model & AR Try-On Image */}
              <div className="relative overflow-hidden bg-[#FAF6F0] max-h-[250px] sm:max-h-[270px]">
                <Image
                  src="/images/hero-tryon.jpg"
                  alt="TryFocus in-store retail virtual try-on and AR experience"
                  width={1024}
                  height={897}
                  priority
                  className="h-[240px] sm:h-[265px] w-full object-cover object-top transition-transform duration-700 ease-out hover:scale-[1.01]"
                />
                {/* Floating AR pill overlay */}
                <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full border border-white/40 bg-black/65 px-2.5 py-0.5 text-xs font-bold text-white shadow-lg backdrop-blur-md">
                  <Camera className="h-3 w-3 text-[#D9A9B4]" />
                  <span>Instant Ethnic & Bridal Fitting</span>
                </div>
                <div className="absolute bottom-2.5 right-2.5 rounded border border-white/50 bg-white/90 px-2 py-0.5 text-[8.5px] font-bold text-brand shadow-md backdrop-blur-sm">
                  Showroom Mode
                </div>
              </div>

              {/* Integrated Store Selector Form */}
              <div className="border-t border-line bg-canvas p-3 sm:p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <h2 className="text-xs sm:text-sm font-bold text-ink">Select your store workspace</h2>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded border border-[#D0D6D0] bg-white px-2 py-0.5 text-xs font-bold text-muted">
                    <LockKeyhole className="h-2.5 w-2.5 text-brand" /> Staff Access
                  </span>
                </div>

                <form action="/login" method="get" className="space-y-2">
                  <input type="hidden" name="next" value="/maharaja/workspace" />
                  <label htmlFor="store-select" className="sr-only">Retail workspace</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand">
                      <Store className="h-3.5 w-3.5" />
                    </div>
                    <select
                      id="store-select"
                      name="store"
                      defaultValue=""
                      required
                      className="min-h-10 w-full appearance-none rounded-none border border-[#ABB3AD] bg-white pl-9 pr-9 text-xs sm:text-sm font-bold text-ink outline-none transition hover:border-brand focus:border-brand focus:ring-1 focus:ring-brand cursor-pointer"
                    >
                      <option value="" disabled>Select your store</option>
                      {stores.map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.location ? `${store.name} · ${store.location}` : store.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#68716C]" />
                  </div>

                  <button
                    type="submit"
                    id="continue-to-login-btn"
                    className="rounded-xl flex min-h-10 w-full items-center justify-center gap-2 bg-brand px-4 text-xs sm:text-sm font-bold text-white shadow-sm transition hover:bg-[#5D0F1F] active:scale-[0.99] cursor-pointer"
                  >
                    <span>Open Store Workspace</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </form>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 border-t border-[#E4E8E4] pt-2 text-xs sm:text-xs font-medium text-[#68716C]">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#3D8A5E]" /> Client-isolated data
                  </span>
                  <span className="flex items-center gap-1">
                    <MonitorPlay className="h-3.5 w-3.5 text-brand" /> TV showroom connected
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="platform" className="border-b border-line bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr]">
            <div><p className="text-xs font-bold text-brand">One operating system</p><h2 className="mt-4 max-w-md text-4xl font-bold leading-tight">From fitting-room curiosity to measurable retail engagement.</h2></div>
            <p className="max-w-2xl self-end text-base leading-7 text-muted">TryFocus connects the shopper experience, billing counter, client workspace and showroom display. Each part works as one controlled flow instead of a collection of disconnected AI tools.</p>
          </div>
          <div className="mt-12 grid grid-cols-1 border-l border-t border-line sm:grid-cols-2 lg:grid-cols-4">
            {capabilities.map(([number, title, copy, Icon]) => (
              <article key={title} className="min-h-72 border-b border-r border-line p-6">
                <div className="flex items-center justify-between"><span className="text-xs font-bold text-subtle">{number}</span><Icon className="h-5 w-5 text-brand" /></div>
                <h3 className="mt-16 text-xl font-bold">{title}</h3><p className="mt-3 text-sm leading-6 text-muted">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-b border-line bg-canvas">
        <div className="mx-auto max-w-5xl px-5 py-16 md:px-8 md:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold leading-tight text-ink sm:text-4xl">TV, tablet or phone?</h2>
            <p className="mt-4 text-sm leading-7 text-muted sm:text-base">Pick your platform, choose your credits and see your total. Software is a one-time payment; credits are pay as you go.</p>
          </div>

          {offerOn && <NovemberOffer variant="card" />}

          <PricingCalculator config={pricingConfig} />
        </div>
      </section>

      <section id="operations" className="border-b border-[#303633] bg-[#171B19] text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 md:px-8 md:py-20 lg:grid-cols-2">
          <div><p className="text-xs font-bold text-[#D9A9B4]">Built for store operations</p><h2 className="mt-4 max-w-xl text-4xl font-bold leading-tight">Customer-facing creativity. Manager-level control.</h2><p className="mt-5 max-w-xl text-base leading-7 text-[#B8C0BB]">Every client receives a separate workspace for campaign status, permanent try-on QR, customer video access, usage, retries and approved showroom content.</p></div>
          <div className="grid gap-px bg-[#3A423E] sm:grid-cols-2">
            {principles.map((item) => <div key={item} className="flex min-h-28 items-center gap-3 bg-[#171B19] p-5"><Check className="h-4 w-4 shrink-0 text-[#D9A9B4]" /><p className="text-sm font-bold">{item}</p></div>)}
          </div>
        </div>
      </section>

      <section className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-5 py-14 text-center md:flex-row md:px-8 md:text-left">
          <div>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold leading-tight text-ink">Ready to open your store workspace?</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted">Access is restricted to approved retail store operators and management staff.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a href="#client-access" className="rounded-xl inline-flex min-h-12 items-center gap-2 bg-brand px-6 text-sm font-bold text-white transition hover:bg-[#5D0F1F] shadow-sm">
              Select store in hero <ArrowRight className="h-4 w-4" />
            </a>
            <a href="tel:9994837342" className="rounded-xl inline-flex min-h-12 items-center gap-2 border border-[#BFC5C0] bg-white px-5 text-sm font-bold text-ink transition hover:border-ink">
              <Phone className="h-4 w-4 text-brand" /> Contact: 9994837342
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-7 text-xs text-[#5E6662] md:flex-row md:items-center md:justify-between md:px-8">
          <div><span className="font-bold text-ink">TryFocus</span><span className="ml-2">AI retail experiences for fashion brands.</span></div>
          <div className="flex flex-wrap gap-5"><Link href="/privacy" className="rounded-xl underline underline-offset-4 hover:text-[#7A1428]">Privacy</Link><Link href="/terms" className="rounded-xl underline underline-offset-4 hover:text-[#7A1428]">Terms</Link><a href="https://wefocus.in" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-[#7A1428]">A weFOCUS product</a></div>
        </div>
      </footer>
    </main>
  );
}
