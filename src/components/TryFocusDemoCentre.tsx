'use client';

import QRCode from 'qrcode';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, MessageCircle, Monitor, QrCode, ShieldCheck, Smartphone, Tablet, Tv } from 'lucide-react';

type Demo = { title: string; description: string; path: string; icon: typeof Smartphone; colour: string; qr: boolean };
const demos: Demo[] = [
  { title: 'Mobile Image Try-On QR', description: 'Scan as a customer to open the private image try-on flow.', path: '/maharaja/mobile/experience?demo=image', icon: Smartphone, colour: 'from-[#6f0e20] to-[#25050d]', qr: true },
  { title: 'AI Video Reward QR', description: 'Scan to open the WhatsApp reward-style video entry with demo code.', path: '/maharaja/mobile/experience?demo=video&code=DEMO5000', icon: MessageCircle, colour: 'from-[#754018] to-[#260d08]', qr: true },
  { title: 'Interactive TV', description: 'Full touch TV/standee demonstration with Image, Live, Video and Discover.', path: '/maharaja/tv/experience', icon: Tv, colour: 'from-[#351452] to-[#07131d]', qr: false },
  { title: 'Counter Tablet', description: 'Staff-assisted image try-on and ₹5,000+ video reward flow.', path: '/maharaja/tablet/experience', icon: Tablet, colour: 'from-[#163d37] to-[#071613]', qr: false },
  { title: 'Client Dashboard', description: 'Retailer usage, mobile rules, video, campaign and privacy controls.', path: '/maharaja/client-admin', icon: Monitor, colour: 'from-[#6e0d1f] to-[#2a0710]', qr: false },
  { title: 'TryFocus Control', description: 'Internal client access, credits, devices and commercial packs.', path: '/admin', icon: ShieldCheck, colour: 'from-[#5c4218] to-[#18120d]', qr: false },
];
const testLinks = [
  ['1', 'Interactive TV — Image, Live, Video, Discover', '/maharaja/tv/experience'],
  ['2', 'Counter Tablet — Staff Image + Video Reward', '/maharaja/tablet/experience'],
  ['3', 'Mobile — Image Try-On entry', '/maharaja/mobile/experience?demo=image'],
  ['4', 'Mobile — Video Reward entry', '/maharaja/mobile/experience?demo=video&code=DEMO5000'],
  ['5', 'Client Dashboard', '/maharaja/client-admin'],
  ['6', 'Campaign Manager', '/maharaja/client-admin/campaigns'],
  ['7', 'Video Library / Go Live consent records', '/maharaja/client-admin/videos'],
  ['8', 'Retail Analytics', '/maharaja/client-admin/analytics'],
  ['9', 'Store Operations / Privacy Controls', '/maharaja/client-admin/operations'],
  ['10', 'TryFocus Internal Admin', '/admin'],
  ['11', 'Internal Device Operations', '/admin/devices'],
  ['12', 'Existing LED / Wall Player', '/maharaja/tv'],
] as const;

export default function TryFocusDemoCentre() {
  const [origin, setOrigin] = useState('');
  const [qr, setQr] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => { if (!origin) return; void Promise.all(demos.filter((item) => item.qr).map(async (item) => [item.path, await QRCode.toDataURL(`${origin}${item.path}`, { width: 360, margin: 1, errorCorrectionLevel: 'H', color: { dark: '#2b0910', light: '#fffdf8' } })] as const)).then((values) => setQr(Object.fromEntries(values))); }, [origin]);
  function copy(text: string, id: string) { void navigator.clipboard.writeText(text); setCopied(id); window.setTimeout(() => setCopied(''), 1800); }
  const videoUrl = origin ? `${origin}/maharaja/mobile/experience?demo=video&code=DEMO5000` : '';
  const whatsapp = videoUrl ? `https://wa.me/?text=${encodeURIComponent(`Maharaja Silks AI Video Reward\n\nOpen your private reward link: ${videoUrl}\n\nDemo code: DEMO5000`)}` : '#';
  return <main className="min-h-screen bg-[#0b090a] px-5 py-8 text-[#fff8ea] lg:px-8"><div className="mx-auto max-w-7xl"><header className="rounded-[2rem] bg-[radial-gradient(circle_at_88%_5%,rgba(225,177,82,.3),transparent_26%),linear-gradient(125deg,#4a0d1a,#17070b)] p-7 lg:p-10"><p className="text-xs font-black uppercase tracking-[.25em] text-[#f1ca79]">TryFocus product demo</p><h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">Every screen, one ready-to-share demo centre.</h1><p className="mt-4 max-w-3xl leading-7 text-white/70">Use QR codes for customer mobile flows. Open the other links on their matching device. These are demo routes only; final API and WhatsApp delivery are still pending.</p><div className="mt-6 flex flex-wrap gap-3"><span className="rounded-full border border-[#f1ca79]/30 bg-white/5 px-4 py-2 text-xs font-bold text-[#f1ca79]">Origin: {origin || 'Preparing local URL…'}</span><span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-xs font-bold text-emerald-200">Demo mode · no customer data</span></div></header>
    <section className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{demos.map((item) => { const Icon = item.icon; const url = `${origin}${item.path}`; return <article key={item.path} className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#151214]"><div className={`flex items-start justify-between bg-gradient-to-br ${item.colour} p-6`}><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-[#f4cf78]"><Icon className="h-6 w-6" /></span><span className="text-xs font-black uppercase tracking-wider text-white/50">{item.qr ? 'Scan demo' : 'Open demo'}</span></div><div className="p-6"><h2 className="text-xl font-black">{item.title}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-white/60">{item.description}</p>{item.qr && <div className="mt-5 flex items-center gap-4 rounded-2xl bg-[#fffdf8] p-3 text-[#28090f]"><div className="grid h-24 w-24 place-items-center rounded-xl bg-white">{qr[item.path] ? <img src={qr[item.path]} alt={`${item.title} QR`} className="h-full w-full" /> : <QrCode className="h-9 w-9 animate-pulse" />}</div><p className="text-xs leading-5 text-[#66554d]">Scan with a phone on the same network, then use the guided demo journey.</p></div>}<div className="mt-5 flex gap-2"><Link href={item.path} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#f1ca79] px-3 text-sm font-black text-[#350a11]">Open <ExternalLink className="h-4 w-4" /></Link><button onClick={() => copy(url, item.path)} className="grid h-11 w-11 place-items-center rounded-xl border border-white/15 text-[#f1ca79]" aria-label={`Copy ${item.title} link`}>{copied === item.path ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}</button></div></div></article>; })}</section>
    <section className="mt-7 rounded-[2rem] border border-white/10 bg-[#151214] p-6"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#f1ca79]">Laptop test sequence</p><h2 className="mt-2 text-2xl font-black">Open every product route directly</h2><p className="mt-2 text-sm leading-6 text-white/60">Use this sequence on this laptop. Your existing login and password have not been changed.</p></div><div className="mt-6 grid gap-2 md:grid-cols-2">{testLinks.map(([number, label, path]) => <Link key={path} href={path} className="group flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 transition hover:border-[#f1ca79]/60"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f1ca79] text-xs font-black text-[#350a11]">{number}</span><span className="flex-1 text-sm font-bold text-white/80">{label}</span><ExternalLink className="h-4 w-4 text-[#f1ca79] transition group-hover:translate-x-0.5" /></Link>)}</div></section>
    <section className="mt-7 rounded-[2rem] border border-[#f1ca79]/25 bg-[#211015] p-6"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#f1ca79]">WhatsApp demo message</p><h2 className="mt-2 text-2xl font-black">Share the AI Video Reward link</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">This opens a WhatsApp compose screen containing the demo video-reward link and code. It does not send anything automatically.</p></div><a href={whatsapp} target="_blank" rel="noreferrer" className="flex h-11 items-center gap-2 rounded-xl bg-[#26d366] px-4 text-sm font-black text-[#09270f]"><MessageCircle className="h-4 w-4" />Open WhatsApp message</a></div><div className="mt-5 rounded-xl bg-black/25 p-4 font-mono text-xs leading-6 text-[#f7dfab]">Maharaja Silks AI Video Reward<br /><br />Open your private reward link: {videoUrl || 'Preparing link…'}<br /><br />Demo code: DEMO5000</div></section>
  </div></main>;
}
