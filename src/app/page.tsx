import Link from 'next/link';
import {
  ArrowRight, BarChart3, Camera, Check, ChevronDown, CirclePlay,
  LockKeyhole, MonitorPlay, QrCode, ShieldCheck, Sparkles, Store,
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
      <header className="border-b border-[#D8DCD7]">
        <div className="mx-auto flex min-h-18 max-w-7xl items-center justify-between px-5 md:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="TryFocus home">
            <span className="flex h-9 w-9 items-center justify-center bg-[#7A1428] text-white"><Sparkles className="h-4 w-4" /></span>
            <span>
              <span className="block text-lg font-black leading-none">TryFocus</span>
              <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.2em] text-[#626A66]">Retail experience platform</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-xs font-bold text-[#4D5551] md:flex" aria-label="Primary navigation">
            <a href="#platform" className="transition hover:text-[#7A1428]">Platform</a>
            <a href="#operations" className="transition hover:text-[#7A1428]">Operations</a>
            <a href="https://wefocus.in" target="_blank" rel="noopener noreferrer" className="transition hover:text-[#7A1428]">Company</a>
          </nav>
          <Link href="/login?store=maharaja" className="inline-flex min-h-10 items-center gap-2 bg-[#161918] px-4 text-xs font-bold text-white transition hover:bg-[#7A1428]">
            Client sign in <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      <section className="border-b border-[#D8DCD7]">
        <div className="mx-auto grid min-h-[650px] max-w-7xl grid-cols-1 lg:grid-cols-[1.04fr_0.96fr]">
          <div className="flex flex-col justify-center border-[#D8DCD7] px-5 py-16 md:px-8 lg:border-r lg:py-20">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#7A1428]">Fashion retail, made participatory</p>
            <h1 className="mt-5 max-w-3xl text-5xl font-black leading-[1.02] sm:text-6xl lg:text-7xl">
              TryFocus turns a store visit into a customer experience.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#515955]">
              A client-managed platform for virtual try-on, personalized retail films, QR journeys and showroom screens. Designed for fashion stores that want measurable engagement without adding friction at the counter.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href="#client-access" className="inline-flex min-h-12 items-center gap-2 bg-[#7A1428] px-5 text-sm font-bold text-white hover:bg-[#5D0F1F]">Open client workspace <ArrowRight className="h-4 w-4" /></a>
              <a href="#platform" className="inline-flex min-h-12 items-center border border-[#BFC5C0] px-5 text-sm font-bold hover:border-[#161918]">Explore the platform</a>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 border-t border-[#D8DCD7] pt-6 text-xs font-bold text-[#515955]">
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#7A1428]" /> Client-isolated</span>
              <span className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-[#7A1428]" /> Consent-led</span>
              <span className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-[#7A1428]" /> Usage-controlled</span>
            </div>
          </div>

          <div className="flex items-center bg-[#E8EBE7] px-5 py-12 md:px-8 lg:py-16">
            <div className="w-full border border-[#BBC2BC] bg-[#FAFBF8] shadow-[0_24px_60px_rgba(21,28,24,0.12)]">
              <div className="flex items-center justify-between border-b border-[#D8DCD7] px-5 py-4">
                <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7A1428]">Store experience</p><p className="mt-1 text-base font-black">Customer journey</p></div>
                <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[#3D664E]"><span className="h-2 w-2 bg-[#3D8A5E]" /> Live</span>
              </div>
              <div className="grid grid-cols-[72px_1fr] sm:grid-cols-[92px_1fr]">
                <div className="border-r border-[#D8DCD7] bg-[#171B19] py-5 text-white">
                  {[QrCode, Camera, Sparkles, MonitorPlay].map((Icon, index) => (
                    <div key={index} className={`mx-auto mb-3 flex h-11 w-11 items-center justify-center ${index === 1 ? 'bg-[#7A1428]' : 'text-[#9FA7A2]'}`}><Icon className="h-4 w-4" /></div>
                  ))}
                </div>
                <div className="p-5 sm:p-7">
                  <div className="flex items-start justify-between gap-4">
                    <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#68716C]">Step 02 / 04</p><h2 className="mt-2 text-2xl font-black">Create the look</h2></div>
                    <span className="border border-[#CDD2CE] px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider">Maharaja</span>
                  </div>
                  <div className="mt-7 grid grid-cols-2 gap-3">
                    <div className="aspect-[4/5] border border-dashed border-[#AAB2AC] bg-[#EFF1EE] p-4"><Camera className="h-5 w-5 text-[#7A1428]" /><p className="mt-3 text-xs font-black">Person photo</p><p className="mt-1 text-[10px] leading-4 text-[#68716C]">Full stature, clear light</p></div>
                    <div className="aspect-[4/5] border border-dashed border-[#AAB2AC] bg-[#EFF1EE] p-4"><Store className="h-5 w-5 text-[#7A1428]" /><p className="mt-3 text-xs font-black">Garment</p><p className="mt-1 text-[10px] leading-4 text-[#68716C]">Purchased or catalogue</p></div>
                  </div>
                  <div className="mt-4 flex min-h-12 items-center justify-center gap-2 bg-[#7A1428] px-3 text-center text-xs font-black text-white"><Sparkles className="h-4 w-4" /> Generate customer experience</div>
                  <div className="mt-5 grid grid-cols-3 border-y border-[#D8DCD7] py-4 text-center">
                    <div><p className="text-lg font-black">1</p><p className="text-[9px] font-bold uppercase text-[#68716C]">QR entry</p></div>
                    <div className="border-x border-[#D8DCD7]"><p className="text-lg font-black">2</p><p className="text-[9px] font-bold uppercase text-[#68716C]">AI assets</p></div>
                    <div><p className="text-lg font-black">1</p><p className="text-[9px] font-bold uppercase text-[#68716C]">Live screen</p></div>
                  </div>
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

      <section id="operations" className="border-b border-[#303633] bg-[#171B19] text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 md:px-8 md:py-20 lg:grid-cols-2">
          <div><p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#D9A9B4]">Built for store operations</p><h2 className="mt-4 max-w-xl text-4xl font-black leading-tight">Customer-facing creativity. Manager-level control.</h2><p className="mt-5 max-w-xl text-base leading-7 text-[#B8C0BB]">Every client receives a separate workspace for campaign status, permanent try-on QR, customer video access, usage, retries and approved showroom content.</p></div>
          <div className="grid gap-px bg-[#3A423E] sm:grid-cols-2">
            {principles.map((item) => <div key={item} className="flex min-h-28 items-center gap-3 bg-[#171B19] p-5"><Check className="h-4 w-4 shrink-0 text-[#D9A9B4]" /><p className="text-sm font-bold">{item}</p></div>)}
          </div>
        </div>
      </section>

      <section id="client-access">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 md:px-8 md:py-20 lg:grid-cols-[0.8fr_1.2fr]">
          <div><p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#7A1428]">Client access</p><h2 className="mt-4 text-4xl font-black leading-tight">Your store. Your workspace. Your customer experience.</h2><p className="mt-5 text-base leading-7 text-[#59615D]">Choose the assigned retail workspace to continue. Access is restricted to approved store operators.</p></div>
          <form action="/login" method="get" className="border border-[#C8CEC9] bg-white p-5 sm:p-7">
            <input type="hidden" name="next" value="/maharaja/workspace" />
            <label htmlFor="store-select" className="text-[10px] font-black uppercase tracking-[0.2em] text-[#68716C]">Retail workspace</label>
            <div className="relative mt-3">
              <select id="store-select" name="store" defaultValue="" required className="min-h-14 w-full appearance-none border border-[#ABB3AD] bg-white px-4 pr-12 text-base font-bold outline-none focus:border-[#7A1428]">
                <option value="" disabled>Select your store</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name} · {store.location}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2" />
            </div>
            <button type="submit" id="continue-to-login-btn" className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 bg-[#7A1428] px-5 text-sm font-black text-white hover:bg-[#5D0F1F]">Continue securely <ArrowRight className="h-4 w-4" /></button>
            <p className="mt-4 flex items-center gap-2 text-xs text-[#68716C]"><LockKeyhole className="h-3.5 w-3.5" /> Authentication opens only the selected client environment.</p>
          </form>
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
