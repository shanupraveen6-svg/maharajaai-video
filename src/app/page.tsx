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
            <a href="https://wefocus.in" target="_blank" rel="noopener noreferrer" className="transition hover:text-[#7A1428]">Company</a>
          </nav>
          <a href="tel:9994837342" className="inline-flex min-h-9 items-center gap-2 bg-[#161918] px-3.5 text-xs font-bold text-white transition hover:bg-[#7A1428] shadow-sm">
            <Phone className="h-3.5 w-3.5 text-[#E8B878]" />
            Contact: 9994837342
          </a>
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
              Predictable, quota-backed pricing for fashion retail.
            </h2>
            <p className="mt-4 text-sm sm:text-base leading-7 text-[#59615D]">
              Full platform capabilities in every tier. Choose the right volume of customer try-on images and retail films for your showroom traffic, backed by generous included retry guarantees.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8 items-stretch">
            {/* Pro Plan (Active) */}
            <article className="relative flex flex-col justify-between border-2 border-[#7A1428] bg-white p-6 sm:p-8 shadow-[0_20px_50px_rgba(122,20,40,0.08)]">
              <div className="absolute -top-3.5 left-6 sm:left-8">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#7A1428] px-3.5 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-sm">
                  <Sparkles className="h-3 w-3 text-[#E8B878]" /> Active Plan · Ready Now
                </span>
              </div>

              <div>
                <div className="mt-2 flex items-center justify-between">
                  <h3 className="text-xl font-black text-[#161918]">Pro Account</h3>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#7A1428]">Single Store</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-[#59615D]">
                  Designed for flagship showrooms launching live AR try-on and customer TV broadcasting.
                </p>

                <div className="mt-6 border-b border-[#E8EBE7] pb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl sm:text-4xl font-black text-[#161918]">₹2,00,000</span>
                    <span className="text-xs font-bold text-[#6B7570]">/ 2 Lakhs</span>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold text-[#7A1428]">Full campaign license & complete store setup</p>
                </div>

                <div className="mt-6 space-y-3.5">
                  <div className="rounded border border-[#E0D5C1] bg-[#FAF7F0] p-3 text-xs font-bold text-[#161918]">
                    <div className="flex items-center justify-between">
                      <span className="text-[#7A1428]">AI Try-On Images</span>
                      <span className="font-black text-[#161918]">1,000 Try-Ons</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-[#E8DFC9] pt-2">
                      <span className="text-[#7A1428]">AI Retail Videos</span>
                      <span className="font-black text-[#161918]">1,000 Films</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-[#E8DFC9] pt-2">
                      <span className="text-[#7A1428]">Included Retry Buffer</span>
                      <span className="font-black text-[#3D8A5E]">15% Included (150 extra)</span>
                    </div>
                  </div>

                  <ul className="space-y-2.5 pt-2 text-xs font-medium text-[#444D48]">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-[#7A1428]" />
                      <span>Client-isolated private workspace</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-[#7A1428]" />
                      <span>Showroom TV live broadcast & universal loop</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-[#7A1428]" />
                      <span>Staff counter portal & QR journey</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-[#7A1428]" />
                      <span>High-resolution customer downloads</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-[#7A1428]" />
                      <span>Store analytics & retry transparency</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="mt-8 pt-4">
                <a
                  href="tel:9994837342"
                  className="flex min-h-11 w-full items-center justify-center gap-2 bg-[#7A1428] px-4 text-xs sm:text-sm font-black uppercase tracking-wider text-white shadow-sm transition hover:bg-[#5D0F1F] active:scale-[0.99]"
                >
                  <Phone className="h-3.5 w-3.5 text-[#E8B878]" />
                  <span>Call to Get Started (9994837342)</span>
                </a>
              </div>
            </article>

            {/* Gold Plan (Inactive / Coming Soon) */}
            <article className="relative flex flex-col justify-between border border-[#D0D6D0] bg-[#F7F9F6] p-6 sm:p-8 opacity-75">
              <div className="absolute -top-3.5 left-6 sm:left-8">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#CBD2CB] bg-[#E8ECE6] px-3.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#515955] shadow-xs">
                  Coming Soon
                </span>
              </div>

              <div>
                <div className="mt-2 flex items-center justify-between">
                  <h3 className="text-xl font-black text-[#515955]">Gold Plan</h3>
                  <span className="rounded bg-[#E8ECE6] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#6B7570]">Inactive</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-[#6B7570]">
                  For high-volume wedding and peak festive seasons requiring higher throughput.
                </p>

                <div className="mt-6 border-b border-[#D8DCD7] pb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl sm:text-4xl font-black text-[#515955]">₹3,50,000</span>
                    <span className="text-xs font-bold text-[#6B7570]">/ 3.5 Lakhs</span>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold text-[#6B7570]">Extended volume campaign tier</p>
                </div>

                <div className="mt-6 space-y-3.5">
                  <div className="rounded border border-[#D8DCD7] bg-[#EFF2ED] p-3 text-xs font-bold text-[#515955]">
                    <div className="flex items-center justify-between">
                      <span>AI Try-On Images</span>
                      <span className="font-black text-[#161918]">3,000 Try-Ons</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-[#DDE2DC] pt-2">
                      <span>AI Retail Videos</span>
                      <span className="font-black text-[#161918]">3,000 Films</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-[#DDE2DC] pt-2">
                      <span>Included Retry Buffer</span>
                      <span className="font-black text-[#3D8A5E]">20% Included (600 extra)</span>
                    </div>
                  </div>

                  <ul className="space-y-2.5 pt-2 text-xs font-medium text-[#6B7570]">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-[#8A948E]" />
                      <span>Everything in Pro Account</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-[#8A948E]" />
                      <span>Multi-counter concurrent staff pairing</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-[#8A948E]" />
                      <span>Priority GPU generation queue</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-[#8A948E]" />
                      <span>Custom seasonal festive video templates</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-[#8A948E]" />
                      <span>Dedicated support manager</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="mt-8 pt-4">
                <button
                  type="button"
                  disabled
                  className="flex min-h-11 w-full items-center justify-center gap-2 border border-[#D0D6D0] bg-[#E4E8E3] px-4 text-xs sm:text-sm font-bold uppercase tracking-wider text-[#6B7570] cursor-not-allowed"
                >
                  <span>Coming Soon</span>
                </button>
              </div>
            </article>

            {/* Diamond Plan (Inactive / Coming Soon) */}
            <article className="relative flex flex-col justify-between border border-[#D0D6D0] bg-[#F7F9F6] p-6 sm:p-8 opacity-75">
              <div className="absolute -top-3.5 left-6 sm:left-8">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#CBD2CB] bg-[#E8ECE6] px-3.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#515955] shadow-xs">
                  Coming Soon
                </span>
              </div>

              <div>
                <div className="mt-2 flex items-center justify-between">
                  <h3 className="text-xl font-black text-[#515955]">Diamond Plan</h3>
                  <span className="rounded bg-[#E8ECE6] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#6B7570]">Inactive</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-[#6B7570]">
                  For multi-store retail brands and large format showroom chains.
                </p>

                <div className="mt-6 border-b border-[#D8DCD7] pb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl sm:text-4xl font-black text-[#515955]">Enterprise</span>
                    <span className="text-xs font-bold text-[#6B7570]">/ Multi-Store</span>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold text-[#6B7570]">Enterprise fleet licensing</p>
                </div>

                <div className="mt-6 space-y-3.5">
                  <div className="rounded border border-[#D8DCD7] bg-[#EFF2ED] p-3 text-xs font-bold text-[#515955]">
                    <div className="flex items-center justify-between">
                      <span>AI Try-On Images</span>
                      <span className="font-black text-[#161918]">5,000 Try-Ons</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-[#DDE2DC] pt-2">
                      <span>AI Retail Videos</span>
                      <span className="font-black text-[#161918]">5,000 Films</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-[#DDE2DC] pt-2">
                      <span>Included Retry Buffer</span>
                      <span className="font-black text-[#3D8A5E]">25% Included (1,250 extra)</span>
                    </div>
                  </div>

                  <ul className="space-y-2.5 pt-2 text-xs font-medium text-[#6B7570]">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-[#8A948E]" />
                      <span>Everything in Gold Plan</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-[#8A948E]" />
                      <span>Multi-store centralized dashboard</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-[#8A948E]" />
                      <span>Custom brand neural model fine-tuning</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-[#8A948E]" />
                      <span>Multi-screen synchronous TV showroom network</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-[#8A948E]" />
                      <span>24/7 SLA & dedicated retail solutions engineer</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="mt-8 pt-4">
                <button
                  type="button"
                  disabled
                  className="flex min-h-11 w-full items-center justify-center gap-2 border border-[#D0D6D0] bg-[#E4E8E3] px-4 text-xs sm:text-sm font-bold uppercase tracking-wider text-[#6B7570] cursor-not-allowed"
                >
                  <span>Coming Soon</span>
                </button>
              </div>
            </article>
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
