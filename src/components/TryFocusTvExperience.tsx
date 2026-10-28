'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft, ArrowRight, Check, ChevronRight, CirclePlay, Clock3, Download,
  Gem, Heart, ImageIcon, Layers3, Play, QrCode, ScanFace, Shirt,
  Sparkles, Stars, WandSparkles,
} from 'lucide-react';
import { catalogueCategories, events, formatINR, sampleCatalogue, type TryFocusProduct } from '@/lib/tryfocus/sample-data';
import LucyLiveMirror from '@/components/LucyLiveMirror';

type Screen = 'home' | 'image' | 'live' | 'video' | 'discover' | 'result';
type ImageStep = 'source' | 'category' | 'product' | 'capture';

const menu = [
  { id: 'image', title: 'AI Image\nTry-On', eyebrow: 'Free on this screen', icon: Shirt, tone: 'from-rose-900 via-[#4b0816] to-[#16050b]' },
  { id: 'live', title: 'Live AI\nTry-On', eyebrow: '30-second experience', icon: ScanFace, tone: 'from-[#2a174f] via-[#100d2c] to-[#07141f]' },
  { id: 'video', title: 'AI Video\nReward', eyebrow: 'Code or catalogue', icon: CirclePlay, tone: 'from-[#5c3012] via-[#211007] to-[#100705]' },
  { id: 'discover', title: 'Discover\nYour Look', eyebrow: 'Your AI stylist', icon: WandSparkles, tone: 'from-[#143b38] via-[#081b1d] to-[#061112]' },
] as const;

export default function TryFocusTvExperience() {
  const [screen, setScreen] = useState<Screen>('home');
  const [imageStep, setImageStep] = useState<ImageStep>('source');
  const [source, setSource] = useState<'catalogue' | 'own'>('catalogue');
  const [audience, setAudience] = useState<'Women' | 'Men'>('Women');
  const [selectedCategory, setSelectedCategory] = useState<string>('sarees');
  const [selectedProduct, setSelectedProduct] = useState<TryFocusProduct | null>(null);
  const [resultTitle, setResultTitle] = useState('Your look is ready');
  const [resultKind, setResultKind] = useState<'image' | 'video' | 'live'>('image');
  const [liveSeconds, setLiveSeconds] = useState(30);
  const [liveRunning, setLiveRunning] = useState(false);
  const [videoCode, setVideoCode] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(events[0].id);
  const [occasion, setOccasion] = useState('Wedding');

  const visibleCategories = catalogueCategories.filter((category) => category.audience === audience);
  const visibleProducts = sampleCatalogue.filter((product) => product.category === selectedCategory);
  const videoProducts = sampleCatalogue.filter((product) => product.eligibleForVideo).slice(0, 6);

  useEffect(() => {
    if (!liveRunning) return;
    if (liveSeconds <= 0) {
      setLiveRunning(false);
      setResultTitle('Your Live Try-On is complete');
      setResultKind('live');
      setScreen('result');
      return;
    }
    const timer = window.setTimeout(() => setLiveSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [liveRunning, liveSeconds]);

  const selectedEventLabel = useMemo(() => events.find((event) => event.id === selectedEvent)?.label || 'Royal Diwali', [selectedEvent]);

  function startMenu(next: Screen) {
    setScreen(next);
    if (next === 'image') {
      setImageStep('source');
      setSelectedProduct(null);
    }
    if (next === 'live') {
      setLiveSeconds(30);
      setLiveRunning(false);
    }
  }

  function showImageResult(product?: TryFocusProduct | null) {
    setSelectedProduct(product || selectedProduct);
    setResultKind('image');
    setResultTitle(product ? `${product.title} looks beautiful on you` : 'Your own garment look is ready');
    setScreen('result');
  }

  function showVideoHandoff(product?: TryFocusProduct | null) {
    setSelectedProduct(product || selectedProduct);
    setResultKind('video');
    setResultTitle(`${selectedEventLabel} video portrait is ready`);
    setScreen('result');
  }

  function resetToHome() {
    setLiveRunning(false);
    setLiveSeconds(30);
    setScreen('home');
  }

  return (
    <main className="min-h-[100svh] overflow-hidden bg-[#070608] text-[#fff8ea] selection:bg-[#e6b358] selection:text-black">
      <div className="relative mx-auto min-h-[100svh] max-w-[1280px] overflow-hidden border-x border-white/10 bg-[#0c080b] shadow-[0_0_120px_rgba(229,179,88,0.1)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_0%,rgba(142,29,64,0.42),transparent_34%),radial-gradient(circle_at_15%_85%,rgba(215,157,67,0.18),transparent_30%)]" />
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#e6b358] to-transparent" />

        <header className="relative z-10 flex h-24 items-center justify-between border-b border-white/10 bg-black/20 px-8 backdrop-blur-xl md:px-12">
          <button onClick={resetToHome} className="flex items-center gap-3 text-left" aria-label="Return to TryFocus home">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#f3cf7a] to-[#aa6b17] text-[#28060d] shadow-[0_0_30px_rgba(236,187,95,0.32)]"><Sparkles className="h-6 w-6" /></span>
            <span><span className="block text-2xl font-black tracking-tight">TryFocus</span><span className="block text-[10px] font-bold uppercase tracking-[0.26em] text-[#e8bd68]">Maharaja Silk Experience</span></span>
          </button>
          <div className="flex items-center gap-3"><span className="hidden rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-xs font-bold text-emerald-200 sm:block">All experiences ready</span><span className="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-white/5"><Heart className="h-5 w-5 text-[#e8bd68]" /></span></div>
        </header>

        {screen === 'home' && <section className="relative z-10 flex min-h-[calc(100svh-6rem)] flex-col px-8 py-12 md:px-12 md:py-16">
          <div className="max-w-3xl"><p className="text-sm font-black uppercase tracking-[0.28em] text-[#e9bd68]">Welcome to Maharaja</p><h1 className="mt-4 text-5xl font-black leading-[0.96] tracking-[-0.05em] sm:text-6xl lg:text-7xl">See yourself<br /><span className="text-[#e9bd68]">in the celebration.</span></h1><p className="mt-6 max-w-2xl text-lg leading-8 text-white/70">Choose an experience below. Every look is private, and your result can move directly to your phone.</p></div>
          <div className="mt-auto grid gap-4 pt-14 sm:grid-cols-2 xl:grid-cols-4">
            {menu.map((item, index) => {
              const Icon = item.icon;
              return <button key={item.id} onClick={() => startMenu(item.id as Screen)} className={`group min-h-64 overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br ${item.tone} p-7 text-left shadow-2xl transition duration-300 hover:-translate-y-2 hover:border-[#e6b358]/70 hover:shadow-[0_24px_70px_rgba(0,0,0,0.42)]`}>
                <div className="flex items-start justify-between"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-[#f3cf7a] backdrop-blur"><Icon className="h-7 w-7" /></span><span className="text-sm font-black text-white/40">0{index + 1}</span></div>
                <p className="mt-10 whitespace-pre-line text-3xl font-black leading-[0.94] tracking-tight">{item.title}</p><div className="mt-5 flex items-center justify-between border-t border-white/15 pt-4 text-xs font-bold uppercase tracking-[0.15em] text-white/70"><span>{item.eyebrow}</span><ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" /></div>
              </button>;
            })}
          </div>
        </section>}

        {screen === 'image' && <section className="relative z-10 mx-auto flex min-h-[calc(100svh-6rem)] w-full max-w-6xl flex-col px-8 py-10 md:px-12">
          <TvHeading eyebrow="Free TV experience" title="AI Image Try-On" onBack={resetToHome} />
          {imageStep === 'source' && <div className="grid flex-1 content-center gap-5 lg:grid-cols-[0.9fr_1.1fr]"><div className="rounded-[2rem] border border-[#e6b358]/30 bg-[#e6b358]/10 p-7"><p className="text-sm font-black uppercase tracking-[0.2em] text-[#e6b358]">Step 1 of 4</p><h2 className="mt-4 text-4xl font-black leading-tight">Who are we styling today?</h2><div className="mt-8 grid grid-cols-2 gap-3">{(['Women', 'Men'] as const).map((item) => <button key={item} onClick={() => setAudience(item)} className={`rounded-2xl border p-5 text-left text-xl font-black transition ${audience === item ? 'border-[#e6b358] bg-[#e6b358] text-[#2a0910]' : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10'}`}>{item}</button>)}</div></div><div className="grid gap-5 sm:grid-cols-2"><ChoiceCard title="Store catalogue" copy="Browse Maharaja's curated styles." icon={<Layers3 className="h-9 w-9" />} onClick={() => { setSource('catalogue'); setImageStep('category'); }} /><ChoiceCard title="Your own garment" copy="Show us a garment from the store." icon={<ScanFace className="h-9 w-9" />} onClick={() => { setSource('own'); setImageStep('capture'); }} /></div></div>}
          {imageStep === 'category' && <div className="flex flex-1 flex-col"><div className="grid grid-cols-2 gap-4 pt-10 sm:grid-cols-3">{visibleCategories.map((category) => <button key={category.id} onClick={() => { setSelectedCategory(category.id); setImageStep('product'); }} className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 text-left transition hover:-translate-y-1 hover:border-[#e6b358]/70 hover:bg-[#e6b358]/10"><Gem className="h-7 w-7 text-[#e6b358]" /><p className="mt-10 text-2xl font-black">{category.label}</p><p className="mt-2 text-sm leading-5 text-white/60">{category.description}</p></button>)}</div><button onClick={() => setImageStep('source')} className="mt-auto inline-flex w-fit items-center gap-2 pt-10 text-sm font-bold text-[#e6b358]"><ArrowLeft className="h-4 w-4" />Change source</button></div>}
          {imageStep === 'product' && <div className="flex flex-1 flex-col"><p className="mt-5 text-sm text-white/60">Choose a garment from the sample Maharaja catalogue.</p><div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">{visibleProducts.slice(0, 6).map((product) => <ProductCard key={product.id} product={product} onClick={() => { setSelectedProduct(product); setImageStep('capture'); }} />)}</div><button onClick={() => setImageStep('category')} className="mt-auto inline-flex w-fit items-center gap-2 pt-8 text-sm font-bold text-[#e6b358]"><ArrowLeft className="h-4 w-4" />Back to categories</button></div>}
          {imageStep === 'capture' && <CapturePanel label={source === 'catalogue' ? `Ready to try ${selectedProduct?.title || 'your selected look'}` : 'Show your garment to the camera'} buttonLabel="Generate my look" onComplete={() => showImageResult()} />}
        </section>}

        {screen === 'live' && <section className="relative z-10 mx-auto flex min-h-[calc(100svh-6rem)] w-full max-w-6xl flex-col px-8 py-10 md:px-12"><TvHeading eyebrow="TV only · Lucy 2.1 · 30 seconds" title="Live AI Try-On" onBack={resetToHome} /><LucyLiveMirror referenceImageUrl={selectedProduct?.imageUrl || sampleCatalogue[0].imageUrl} garmentName={selectedProduct?.title || 'Selected Maharaja look'} onComplete={() => { setResultTitle('Your Live Try-On is complete'); setResultKind('live'); setScreen('result'); }} /></section>}

        {screen === 'video' && <section className="relative z-10 mx-auto flex min-h-[calc(100svh-6rem)] w-full max-w-6xl flex-col px-8 py-10 md:px-12"><TvHeading eyebrow="Reward or catalogue" title="AI Video Experience" onBack={resetToHome} /><div className="grid flex-1 content-center gap-5 lg:grid-cols-[0.78fr_1.22fr]"><div className="rounded-[2rem] border border-[#e6b358]/30 bg-[#e6b358]/10 p-7"><p className="text-sm font-black uppercase tracking-[0.18em] text-[#e6b358]">Have a reward code?</p><h2 className="mt-3 text-3xl font-black">Enter your WhatsApp code</h2><p className="mt-3 text-sm leading-6 text-white/65">Your ₹5,000+ purchase reward stays active for 24 hours.</p><input value={videoCode} onChange={(event) => setVideoCode(event.target.value)} placeholder="Enter 6-digit code" className="mt-7 h-16 w-full rounded-2xl border border-white/15 bg-black/30 px-5 text-xl font-bold tracking-[0.22em] outline-none placeholder:text-sm placeholder:tracking-normal placeholder:text-white/35 focus:border-[#e6b358]" /><button onClick={() => showVideoHandoff()} disabled={videoCode.trim().length < 4} className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#e6b358] font-black text-[#2b0910] disabled:opacity-40">Continue with code <ArrowRight className="h-5 w-5" /></button></div><div><p className="text-sm font-black uppercase tracking-[0.18em] text-[#e6b358]">Or select an eligible catalogue look</p><div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">{videoProducts.map((product) => <ProductCard key={product.id} product={product} onClick={() => { setSelectedProduct(product); showVideoHandoff(product); }} compact />)}</div></div></div></section>}

        {screen === 'discover' && <section className="relative z-10 mx-auto flex min-h-[calc(100svh-6rem)] w-full max-w-6xl flex-col px-8 py-10 md:px-12"><TvHeading eyebrow="Maharaja AI stylist" title="Discover Your Look" onBack={resetToHome} /><div className="grid flex-1 items-center gap-8 lg:grid-cols-[0.78fr_1.22fr]"><div className="rounded-[2rem] border border-white/10 bg-black/30 p-7"><p className="text-sm font-black uppercase tracking-[0.18em] text-[#e6b358]">What are you shopping for?</p><div className="mt-5 grid grid-cols-2 gap-3">{['Wedding', 'Diwali', 'Reception', 'Gift'].map((item) => <button key={item} onClick={() => setOccasion(item)} className={`rounded-2xl border p-4 text-left font-bold ${occasion === item ? 'border-[#e6b358] bg-[#e6b358] text-[#2b0910]' : 'border-white/15 bg-white/5 text-white/70'}`}>{item}</button>)}</div><p className="mt-8 text-sm font-black uppercase tracking-[0.18em] text-[#e6b358]">Style direction</p><div className="mt-4 flex flex-wrap gap-2">{['Classic', 'Royal', 'Something new'].map((item) => <span key={item} className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold text-white/75">{item}</span>)}</div></div><div><p className="text-lg text-white/60">Three recommendations for your {occasion.toLowerCase()} moment.</p><div className="mt-5 grid gap-4 sm:grid-cols-3">{sampleCatalogue.filter((item) => item.audience === audience).slice(0, 3).map((product, index) => <button key={product.id} onClick={() => { setSelectedProduct(product); setScreen('image'); setSource('catalogue'); setSelectedCategory(product.category); setImageStep('capture'); }} className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.06] text-left transition hover:-translate-y-1 hover:border-[#e6b358]"><div className={`relative h-44 bg-gradient-to-br ${product.accent}`}><img src={product.imageUrl} alt="" className="h-full w-full object-cover opacity-80" /><span className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#f4d28a]">{index === 0 ? 'Safe choice' : index === 1 ? 'Stylist pick' : 'Something new'}</span></div><div className="p-4"><p className="font-black">{product.title}</p><p className="mt-1 text-sm text-[#e6b358]">{formatINR(product.price)}</p></div></button>)}</div></div></div></section>}

        {screen === 'result' && <section className="relative z-10 mx-auto flex min-h-[calc(100svh-6rem)] w-full max-w-6xl flex-col px-8 py-10 md:px-12"><TvHeading eyebrow={resultKind === 'video' ? 'Your private video journey' : 'Your TryFocus result'} title={resultTitle} onBack={resetToHome} /><div className="grid flex-1 items-center gap-9 lg:grid-cols-[1.15fr_0.85fr]"><div className={`relative aspect-[4/3] overflow-hidden rounded-[2.5rem] border border-[#e6b358]/30 bg-gradient-to-br ${selectedProduct?.accent || 'from-[#5d1a2a] via-[#230610] to-[#0a080b]'}`}><img src={selectedProduct?.imageUrl || '/images/hero-tryon.jpg'} alt="Your generated TryFocus look" className="h-full w-full object-cover opacity-80" /><div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" /><div className="absolute bottom-7 left-7 right-7 flex items-end justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#e6b358]">Maharaja · TryFocus</p><p className="mt-2 text-2xl font-black">{selectedProduct?.title || 'Your selected look'}</p></div><Sparkles className="h-8 w-8 text-[#f2cd79]" /></div></div><div className="rounded-[2.5rem] border border-white/10 bg-black/30 p-8"><QrCode className="h-16 w-16 text-[#f1cb73]" /><h2 className="mt-6 text-3xl font-black">Scan to continue on your phone</h2><p className="mt-4 text-base leading-7 text-white/65">{resultKind === 'video' ? 'Generate, preview and download your AI video privately on mobile. You decide whether to share it.' : 'Your look is ready to save, download or keep exploring privately.'}</p><div className="mt-7 grid h-36 w-36 grid-cols-5 gap-1 rounded-xl bg-white p-3">{Array.from({ length: 25 }, (_, index) => <span key={index} className={`${[0, 1, 2, 5, 7, 10, 12, 14, 18, 20, 23, 24].includes(index) || index % 3 === 0 ? 'bg-[#2b0910]' : 'bg-white'}`} />)}</div><button onClick={resetToHome} className="mt-8 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-[#e6b358]/50 text-sm font-black text-[#f1cb73] transition hover:bg-[#e6b358] hover:text-[#2b0910]">Finish experience <Check className="h-5 w-5" /></button></div></div></section>}
      </div>
    </main>
  );
}

function TvHeading({ eyebrow, title, onBack }: { eyebrow: string; title: string; onBack: () => void }) {
  return <div className="flex items-end justify-between gap-6"><div><p className="text-sm font-black uppercase tracking-[0.25em] text-[#e6b358]">{eyebrow}</p><h1 className="mt-2 text-4xl font-black tracking-[-0.04em] sm:text-5xl">{title}</h1></div><button onClick={onBack} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-[#f1cb73] transition hover:bg-white/10" aria-label="Back to home"><ArrowLeft className="h-6 w-6" /></button></div>;
}

function ChoiceCard({ title, copy, icon, onClick }: { title: string; copy: string; icon: ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="group min-h-72 rounded-[2rem] border border-white/10 bg-white/[0.06] p-7 text-left transition hover:-translate-y-1 hover:border-[#e6b358]/70 hover:bg-[#e6b358]/10"><span className="text-[#e6b358]">{icon}</span><h3 className="mt-14 text-3xl font-black">{title}</h3><p className="mt-3 max-w-xs text-base leading-7 text-white/60">{copy}</p><span className="mt-8 inline-flex items-center gap-2 text-sm font-black text-[#e6b358]">Choose <ChevronRight className="h-5 w-5" /></span></button>;
}

function ProductCard({ product, onClick, compact = false }: { product: TryFocusProduct; onClick: () => void; compact?: boolean }) {
  return <button onClick={onClick} className="group overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.06] text-left transition hover:-translate-y-1 hover:border-[#e6b358]/70"><div className={`relative ${compact ? 'h-32' : 'h-44'} bg-gradient-to-br ${product.accent}`}><img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent" /></div><div className={compact ? 'p-3' : 'p-4'}><p className={`${compact ? 'text-sm' : 'text-base'} font-black leading-tight`}>{product.title}</p><p className="mt-2 text-sm font-bold text-[#e6b358]">{formatINR(product.price)}</p></div></button>;
}

function CapturePanel({ label, buttonLabel, onComplete }: { label: string; buttonLabel: string; onComplete: () => void }) {
  const [countdown, setCountdown] = useState(0);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  async function beginCapture() {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCountdown(5);
    } catch { setCameraError('Camera permission is needed to take the customer photo.'); }
  }
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => {
      if (countdown === 1) {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setCountdown(0);
        onComplete();
      } else setCountdown((value) => value - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, onComplete]);
  useEffect(() => () => { streamRef.current?.getTracks().forEach((track) => track.stop()); }, []);
  return <div className="grid flex-1 items-center gap-8 lg:grid-cols-[1.2fr_0.8fr]"><div className="relative aspect-[4/3] overflow-hidden rounded-[2.5rem] border border-dashed border-[#e6b358]/50 bg-black/25"><video ref={videoRef} muted playsInline className="h-full w-full object-cover" /><div className="pointer-events-none absolute inset-10 rounded-[2rem] border border-[#e6b358]/30" />{countdown > 0 ? <div className="absolute inset-0 grid place-items-center bg-black/25"><div className="text-center"><p className="text-8xl font-black text-[#f6d892]">{countdown}</p><p className="mt-3 text-sm font-black uppercase tracking-[.18em]">Hold still</p></div></div> : !streamRef.current && <div className="absolute inset-0 grid place-items-center text-center"><div><ImageIcon className="mx-auto h-20 w-20 text-[#e6b358]" /><p className="mt-5 text-2xl font-black">Camera capture area</p><p className="mt-2 text-sm text-white/60">A five-second countdown starts before the photo.</p></div></div>}</div><div className="rounded-[2.5rem] border border-white/10 bg-black/30 p-8"><p className="text-sm font-black uppercase tracking-[0.2em] text-[#e6b358]">Ready when you are</p><h2 className="mt-4 text-3xl font-black leading-tight">{label}</h2><p className="mt-4 text-base leading-7 text-white/60">Take a clear, full-body customer photo. The countdown gives them time to get ready.</p>{cameraError && <p className="mt-4 text-sm font-bold text-rose-200">{cameraError}</p>}<button onClick={() => void beginCapture()} disabled={countdown > 0} className="mt-8 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[#e6b358] text-base font-black text-[#2b0910] transition hover:bg-[#f6d892] disabled:opacity-50"><Stars className="h-5 w-5" />{countdown > 0 ? `Capturing in ${countdown}` : buttonLabel}</button></div></div>;
}
