import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight, BarChart3, Camera, Check, ChevronDown, CirclePlay,
  LockKeyhole, MonitorPlay, Phone, ShieldCheck, Sparkles, Store,
} from 'lucide-react';

const stores = [{ id: 'maharaja', name: 'Majestic Maharaja', location: 'Thanjavur, Tamil Nadu' }];

const capabilities = [
  ['01', 'Virtual try-on', 'Turn a shopper photo and garment reference into an immediate, downloadable retail try-on.', Camera],
  ['02', 'Cinematic retail video', 'Create event-led customer films with controlled identity, garment detail and brand presentation.', CirclePlay],
  ['03', 'Showroom live', 'Move approved customer films into a managed television queue and an always-on replay library.', MonitorPlay],
  ['04', 'Store intelligence', 'Track scans, successful generations, retries, downloads and participation from one workspace.', BarChart3],
] as const;

const principles = [
  'Client-isolated workspaces',
  'Consent-led showroom publishing',
  'Usage and retry controls',
  'Automatic media retention rules',
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#F4F5F2] text-[#161918]">
      <header className="border-b border-[#D8DCD7] bg-[#F4F5F2]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto flex min-h-14 max-w-7xl items-center justify-between px-5 md:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="TryFocus home">
            <span className="flex h-8 w-8 items-center justify-center bg-[#7A1428] text-white shadow-sm"><Sparkles className="h-4 w-4" /></span>
            <span>
              <span className="block text-base sm:text-lg font-black leading-none tracking-tight">TryFocus</span>
              <span className="mt-0.5 block text-[8.5px] font-bold uppercase tracking-[0.2em] text-[#626A66]">Retail experience platform</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-xs font-bold text-[#4D5551] md:flex" aria-label="Primary navigation">
            <a href="#platform" className="transition hover:text-[#7A1428]">Platform</a>
            <a href="#pricing" className="transition hover:text-[#7A1428]">Pricing</a>
            <a href="#operations" className="transition hover:text-[#7A1428]">Operations</a>
            <Link href="/admin" className="transition hover:text-[#7A1428]">Admin</Link>
            <a href="https://wefocus.in" target="_blank" rel="noopener noreferrer" className="transition hover:text-[#7A1428]">Company</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/admin" className="inline-flex min-h-9 items-center gap-1.5 border border-[#161918] bg-white px-3 text-xs font-bold text-[#161918] transition hover:border-[#7A1428] hover:text-[#7A1428]">
              <LockKeyhole className="h-3.5 w-3.5 text-[#7A1428]" />
              Admin
            </Link>
            <a href="tel:9994837342" className="inline-flex min-h-9 items-center gap-2 bg-[#161918] px-3.5 text-xs font-bold text-white transition hover:bg-[#7A1428] shadow-sm">
              <Phone className="h-3.5 w-3.5 text-[#E8B878]" />
              <span className="hidden sm:inline">Contact:</span> 9994837342
            </a>
          </div>
        </div>
      </header>

      <section className="border-b border-[#D8DCD7]">
        <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="flex flex-col justify-center border-[#D8DCD7] px-5 py-6 sm:py-8 md:px-8 lg:border-r lg:py-6 xl:py-8">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#7A1428]">Fashion retail, made participatory</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-black leading-[1.08] sm:text-4xl lg:text-[2.65rem] xl:text-[3.1rem] tracking-tight">
              TryFocus turns a store visit into a customer experience.
            </h1>
            <p className="mt-3.5 max-w-2xl text-sm sm:text-base leading-6 sm:leading-7 text-[#515955]">
              A client-managed platform for virtual try-on, personalized retail films, QR journeys and showroom screens. Designed for fashion stores that want measurable engagement without adding friction at the counter.
            </p>
            <div className="mt-6 xl:mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-[#D8DCD7] pt-4 text-xs font-bold text-[#515955]">
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#7A1428]" /> Client-isolated</span>
              <span className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-[#7A1428]" /> Consent-led</span>
              <span className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-[#7A1428]" /> Usage-controlled</span>
            </div>
          </div>

          <div className="flex items-center justify-center bg-[#E8EBE7] px-4 py-2.5 sm:px-6 md:px-8 lg:py-3">
            <div id="client-access" className="w-full max-w-[420px] xl:max-w-[440px] overflow-hidden border border-[#BAC3BA] bg-[#FAFBF8] shadow-[0_18px_50px_rgba(21,28,24,0.12)]">
              {/* Header Status Bar */}
              <div className="flex items-center justify-between border-b border-[#D8DCD7] bg-white px-3.5 py-2 sm:px-4">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3D8A5E] opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#3D8A5E]"></span>
                  </span>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#7A1428]">Live AR Try-On</p>
                    <p className="text-xs font-black text-[#161918]">In-Store Customer Fitting</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-[#D0D6D0] bg-[#F4F5F2] px-2 py-0.5 text-[8.5px] font-black uppercase tracking-wider text-[#515955]">
                  <Sparkles className="h-2.5 w-2.5 text-[#7A1428]" /> Multi-Look AI
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
                <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full border border-white/40 bg-black/65 px-2.5 py-0.5 text-[9px] font-bold text-white shadow-lg backdrop-blur-md">
                  <Camera className="h-3 w-3 text-[#D9A9B4]" />
                  <span>Instant Ethnic & Bridal Fitting</span>
                </div>
                <div className="absolute bottom-2.5 right-2.5 rounded border border-white/50 bg-white/90 px-2 py-0.5 text-[8.5px] font-black uppercase tracking-widest text-[#7A1428] shadow-md backdrop-blur-sm">
                  Showroom Mode
                </div>
              </div>

              {/* Integrated Store Selector Form */}
              <div className="border-t border-[#D8DCD7] bg-[#FAFBF8] p-3 sm:p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#7A1428]">Client Access</p>
                    <h2 className="text-xs sm:text-sm font-black text-[#161918]">Select your store workspace</h2>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded border border-[#D0D6D0] bg-white px-2 py-0.5 text-[9px] font-bold text-[#515955]">
                    <LockKeyhole className="h-2.5 w-2.5 text-[#7A1428]" /> Staff Access
                  </span>
                </div>

                <form action="/login" method="get" className="space-y-2">
                  <input type="hidden" name="next" value="/maharaja/workspace" />
                  <label htmlFor="store-select" className="sr-only">Retail workspace</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7A1428]">
                      <Store className="h-3.5 w-3.5" />
                    </div>
                    <select
                      id="store-select"
                      name="store"
                      defaultValue="maharaja"
                      required
                      className="min-h-10 w-full appearance-none rounded-none border border-[#ABB3AD] bg-white pl-9 pr-9 text-xs sm:text-sm font-bold text-[#161918] outline-none transition hover:border-[#7A1428] focus:border-[#7A1428] focus:ring-1 focus:ring-[#7A1428] cursor-pointer"
                    >
                      <option value="" disabled>Select your store</option>
                      {stores.map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.name} · {store.location}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#68716C]" />
                  </div>

                  <button
                    type="submit"
                    id="continue-to-login-btn"
                    className="flex min-h-10 w-full items-center justify-center gap-2 bg-[#7A1428] px-4 text-xs sm:text-sm font-black uppercase tracking-wider text-white shadow-sm transition hover:bg-[#5D0F1F] active:scale-[0.99] cursor-pointer"
                  >
                    <span>Open Store Workspace</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </form>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 border-t border-[#E4E8E4] pt-2 text-[10px] sm:text-[11px] font-medium text-[#68716C]">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#3D8A5E]" /> Client-isolated data
                  </span>
                  <span className="flex items-center gap-1">
                    <MonitorPlay className="h-3.5 w-3.5 text-[#7A1428]" /> TV showroom connected
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="platform" className="border-b border-[#D8DCD7] bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr]">
            <div><p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#7A1428]">One operating system</p><h2 className="mt-4 max-w-md text-4xl font-black leading-tight">From fitting-room curiosity to measurable retail engagement.</h2></div>
            <p className="max-w-2xl self-end text-base leading-7 text-[#59615D]">TryFocus connects the shopper experience, billing counter, client workspace and showroom display. Each part works as one controlled flow instead of a collection of disconnected AI tools.</p>
          </div>
          <div className="mt-12 grid grid-cols-1 border-l border-t border-[#D8DCD7] sm:grid-cols-2 lg:grid-cols-4">
            {capabilities.map(([number, title, copy, Icon]) => (
              <article key={title} className="min-h-72 border-b border-r border-[#D8DCD7] p-6">
                <div className="flex items-center justify-between"><span className="text-xs font-black text-[#8A918D]">{number}</span><Icon className="h-5 w-5 text-[#7A1428]" /></div>
                <h3 className="mt-16 text-xl font-black">{title}</h3><p className="mt-3 text-sm leading-6 text-[#59615D]">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-b border-[#D8DCD7] bg-[#FAFBF8]">
        <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#7A1428]">Transparent Retail Licensing</p>
            <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl text-[#161918]">
              Choose only the AI modules your store needs.
            </h2>
            <p className="mt-4 text-sm sm:text-base leading-7 text-[#59615D]">
              Start with Image Try-On, Live AI Try-On or AI Video. Every module runs on the same TryFocus platform and can be activated on mobile, tablet, TV or the complete store setup.
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-2">
            <PricingPlan title="Standard" label="For a focused store launch" items={[
              ['AI Image Try-On', '4,000 generations', '₹50,000', '₹40,000'],
              ['Live AI Try-On', '500 × 60-second sessions', '₹50,000', '₹40,000'],
              ['AI Video', '500 video journeys', '₹50,000', '₹40,000'],
            ]} />
            <PricingPlan featured title="Pro" label="For a complete flagship experience" items={[
              ['AI Image Try-On', '6,000 generations', '₹99,999', '₹80,000'],
              ['Live AI Try-On', '1,000 × 60-second sessions', '₹99,999', '₹80,000'],
              ['AI Video', '1,000 video journeys', '₹99,999', '₹80,000'],
            ]} />
          </div>
          <div className="mx-auto mt-6 grid max-w-5xl gap-4 border border-[#D8DCD7] bg-white p-5 text-sm text-[#515955] md:grid-cols-[1fr_auto] md:items-center">
            <div><p className="font-black text-[#161918]">One platform. Activate only the surfaces you purchase.</p><p className="mt-1 leading-6">Mobile, tablet, TV/standee and wall player access are configured per client. AI image and AI video include a 15% retry allowance; Live AI Try-On has no retry.</p></div>
            <div className="border-l-0 border-[#E3D7C3] pt-3 md:border-l md:pl-5 md:pt-0"><p className="text-xs font-bold uppercase tracking-wider text-[#7A1428]">Optional hardware</p><p className="mt-1 font-black text-[#161918]">43” Interactive TV Standee</p><p className="text-lg font-black text-[#7A1428]">₹1,00,000</p></div>
          </div>
        </div>
      </section>

      <section id="operations" className="border-b border-[#303633] bg-[#171B19] text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 md:px-8 md:py-20 lg:grid-cols-2">
          <div><p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#D9A9B4]">Built for store operations</p><h2 className="mt-4 max-w-xl text-4xl font-black leading-tight">Customer-facing creativity. Manager-level control.</h2><p className="mt-5 max-w-xl text-base leading-7 text-[#B8C0BB]">Every client receives a separate workspace for campaign status, permanent try-on QR, customer video access, usage, retries and approved showroom content.</p></div>
          <div className="grid gap-px bg-[#3A423E] sm:grid-cols-2">
            {principles.map((item) => <div key={item} className="flex min-h-28 items-center gap-3 bg-[#171B19] p-5"><Check className="h-4 w-4 shrink-0 text-[#D9A9B4]" /><p className="text-sm font-bold">{item}</p></div>)}
          </div>
        </div>
      </section>

      <section className="border-b border-[#D8DCD7] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-5 py-14 text-center md:flex-row md:px-8 md:text-left">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#7A1428]">Client Access</p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-black leading-tight text-[#161918]">Ready to open your store workspace?</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#59615D]">Access is restricted to approved retail store operators and management staff.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a href="#client-access" className="inline-flex min-h-12 items-center gap-2 bg-[#7A1428] px-6 text-sm font-bold text-white transition hover:bg-[#5D0F1F] shadow-sm">
              Select store in hero <ArrowRight className="h-4 w-4" />
            </a>
            <a href="tel:9994837342" className="inline-flex min-h-12 items-center gap-2 border border-[#BFC5C0] bg-white px-5 text-sm font-bold text-[#161918] transition hover:border-[#161918]">
              <Phone className="h-4 w-4 text-[#7A1428]" /> Contact: 9994837342
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#D8DCD7] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-7 text-xs text-[#5E6662] md:flex-row md:items-center md:justify-between md:px-8">
          <div><span className="font-black text-[#161918]">TryFocus</span><span className="ml-2">AI retail experiences for fashion brands.</span></div>
          <div className="flex flex-wrap gap-5"><Link href="/privacy" className="underline underline-offset-4 hover:text-[#7A1428]">Privacy</Link><Link href="/terms" className="underline underline-offset-4 hover:text-[#7A1428]">Terms</Link><a href="https://wefocus.in" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-[#7A1428]">A weFOCUS product</a></div>
        </div>
      </footer>
    </main>
  );
}

function PricingPlan({
  title,
  label,
  items,
  featured = false,
}: {
  title: string;
  label: string;
  items: Array<[string, string, string, string]>;
  featured?: boolean;
}) {
  return (
    <article className={`relative border bg-white p-6 shadow-sm sm:p-8 ${featured ? 'border-2 border-[#7A1428] shadow-[0_20px_50px_rgba(122,20,40,0.10)]' : 'border-[#D8DCD7]'}`}>
      {featured && <span className="absolute -top-3.5 left-6 inline-flex items-center gap-1.5 bg-[#7A1428] px-3.5 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-sm"><Sparkles className="h-3 w-3 text-[#E8B878]" /> Most complete</span>}
      <p className={`text-[11px] font-black uppercase tracking-[0.2em] ${featured ? 'text-[#7A1428]' : 'text-[#6B7570]'}`}>{label}</p>
      <h3 className="mt-2 text-3xl font-black text-[#161918]">{title} Modules</h3>
      <div className="mt-7 divide-y divide-[#E5E8E4] border-y border-[#E5E8E4]">
        {items.map(([module, volume, oldPrice, offerPrice]) => (
          <div key={module} className="grid gap-2 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
            <div><p className="font-black text-[#161918]">{module}</p><p className="mt-1 text-xs font-semibold text-[#626A66]">{volume}</p></div>
            <div className="text-left sm:text-right"><p className="text-sm font-bold text-[#858D88] line-through">{oldPrice}</p><p className="text-2xl font-black text-[#7A1428]">{offerPrice}</p></div>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs leading-5 text-[#59615D]">Each module is selected independently. AI Video and Live access can be restricted by your retailer’s campaign conditions.</p>
      <a href="tel:9994837342" className={`mt-6 flex min-h-12 w-full items-center justify-center gap-2 px-4 text-xs font-black uppercase tracking-wider transition ${featured ? 'bg-[#7A1428] text-white hover:bg-[#5D0F1F]' : 'border border-[#7A1428] text-[#7A1428] hover:bg-[#7A1428] hover:text-white'}`}><Phone className="h-4 w-4" />Request this plan</a>
    </article>
  );
}
