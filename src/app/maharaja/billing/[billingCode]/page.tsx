'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { CheckCircle2, Film, Gift, LoaderCircle, LockKeyhole, Phone, QrCode, Store } from 'lucide-react';

type ExperienceType = 'purchased-garment' | 'catalogue-gift';
type DeliveryMethod = 'whatsapp' | 'qr';
type GeneratedPass = { code: string; phoneMasked: string; expiresAt: string; link: string; experienceType: ExperienceType };

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'Unable to create customer access.');
  return data;
}

export default function MaharajaBillingPage() {
  const params = useParams<{ billingCode: string }>();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<ExperienceType>(searchParams.get('mode') === 'catalogue' ? 'catalogue-gift' : 'purchased-garment');
  const [delivery, setDelivery] = useState<DeliveryMethod>('whatsapp');
  const [phone, setPhone] = useState('');
  const [pass, setPass] = useState<GeneratedPass | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    fetch(`/api/maharaja/billing/${encodeURIComponent(params.billingCode)}`, { cache: 'no-store' })
      .then(readJson).then((data) => setAuthenticated(data.authenticated === true))
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load billing counter.'));
  }, [params.billingCode]);

  async function login(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError('');
    try {
      await readJson(await fetch('/api/operator/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }));
      setAuthenticated(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Login failed.'); }
    finally { setLoading(false); }
  }

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
    if (normalizedPhone.length !== 10) { setError('Enter a valid 10 digit WhatsApp number.'); return; }
    setLoading(true); setError(''); setMessage(''); setPass(null); setQrDataUrl('');
    try {
      const data = await readJson(await fetch('/api/maharaja/video-pass', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingCode: params.billingCode, phone: normalizedPhone, experienceType: mode, whatsappOptIn: delivery === 'whatsapp' }),
      }));
      setPass(data.pass);
      setQrDataUrl(await QRCode.toDataURL(data.pass.link, { width: 480, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#2A060C', light: '#FFFFFF' } }));
      setMessage(delivery === 'whatsapp'
        ? data.whatsappSent ? 'One-day AI Video link sent on WhatsApp. QR is also available as backup.' : 'WhatsApp is not connected or could not send. Show the one-day QR to the customer.'
        : 'One-day customer QR is ready.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to create customer access.'); }
    finally { setLoading(false); }
  }

  if (authenticated === null) return <main className="flex min-h-screen items-center justify-center bg-[#F5F2EA]"><LoaderCircle className="h-8 w-8 animate-spin text-[#6E0D1F]" /></main>;
  if (!authenticated) return <main className="flex min-h-screen items-center justify-center bg-[#F5F2EA] p-4"><form onSubmit={login} className="w-full max-w-sm border border-[#D8C49B] bg-white p-6"><LockKeyhole className="h-7 w-7 text-[#6E0D1F]" /><h1 className="mt-3 font-serif text-2xl font-bold">Maharaja staff login</h1>{error && <p className="mt-3 text-sm font-bold text-red-700">{error}</p>}<input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className="mt-5 min-h-12 w-full border px-3" required /><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="mt-3 min-h-12 w-full border px-3" required /><button disabled={loading} className="mt-4 min-h-12 w-full bg-[#6E0D1F] text-xs font-bold uppercase text-[#F3E5AB]">Sign in</button></form></main>;

  return <main className="min-h-screen bg-[#F5F2EA] px-4 py-6 text-[#211A17]"><div className="mx-auto max-w-4xl">
    <header className="flex items-center gap-3 border-b border-[#D8C49B] pb-5"><span className="flex h-12 w-12 items-center justify-center bg-[#6E0D1F] text-[#F3E5AB]"><Store className="h-5 w-5" /></span><div><p className="font-serif text-2xl font-bold text-[#6E0D1F]">Maharaja</p><p className="text-xs font-bold uppercase text-[#8A6A20]">Customer experience counter</p></div></header>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
      <form onSubmit={generate} className="border border-[#D8C49B] bg-white p-6">
        <h1 className="font-serif text-3xl font-bold">Customer AI Video QR</h1>
        <div className="mt-5 grid grid-cols-2 border border-[#D8C49B] p-1">
          <button type="button" onClick={() => { setMode('purchased-garment'); setPass(null); }} className={`min-h-16 px-3 text-xs font-bold uppercase ${mode === 'purchased-garment' ? 'bg-[#6E0D1F] text-[#F3E5AB]' : ''}`}><Film className="mx-auto mb-1 h-4 w-4" />Own garment AI video</button>
          <button type="button" onClick={() => { setMode('catalogue-gift'); setPass(null); }} className={`min-h-16 px-3 text-xs font-bold uppercase ${mode === 'catalogue-gift' ? 'bg-[#21090E] text-[#F3E5AB]' : ''}`}><Gift className="mx-auto mb-1 h-4 w-4" />AI Video Gift Link</button>
        </div>
        <p className="mt-4 text-sm leading-6 text-[#5C4B43]">{mode === 'purchased-garment' ? 'Customer uploads their purchased garment and photo, then creates an image and AI video. Download or Go Live is chosen privately on mobile.' : 'Customer selects a Maharaja catalogue garment, then completes the private image and AI-video journey on mobile.'}</p>
        <label className="mt-5 block text-xs font-bold uppercase text-[#5C4B43]">Customer WhatsApp number<div className="relative mt-2"><Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6E0D1F]" /><input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" pattern="[0-9]{10}" required className="min-h-12 w-full border border-[#D8C49B] pl-10 pr-3 text-base font-bold" placeholder="10 digit number" /></div></label>
        <fieldset className="mt-5"><legend className="text-xs font-bold uppercase text-[#5C4B43]">Send customer access by</legend><div className="mt-2 grid grid-cols-2 border border-[#D8C49B] p-1"><button type="button" onClick={() => setDelivery('whatsapp')} className={`min-h-12 px-3 text-xs font-bold uppercase ${delivery === 'whatsapp' ? 'bg-[#6E0D1F] text-[#F3E5AB]' : 'text-[#6E0D1F]'}`}>WhatsApp link</button><button type="button" onClick={() => setDelivery('qr')} className={`min-h-12 px-3 text-xs font-bold uppercase ${delivery === 'qr' ? 'bg-[#6E0D1F] text-[#F3E5AB]' : 'text-[#6E0D1F]'}`}>Show QR</button></div><p className="mt-2 text-xs leading-5 text-[#6B625C]">The client decides this per store. Both customer links expire after 24 hours.</p></fieldset>
        {error && <p className="mt-4 border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p>}
        {message && <p className="mt-4 border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p>}
        <button disabled={loading} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 bg-[#6E0D1F] text-xs font-bold uppercase text-[#F3E5AB] disabled:opacity-45">{loading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : mode === 'catalogue-gift' ? <Gift className="h-5 w-5" /> : <QrCode className="h-5 w-5" />}Generate customer QR</button>
      </form>
      <aside className="border border-[#D8C49B] bg-[#21090E] p-6 text-center text-[#F3E5AB]">{pass && qrDataUrl ? <><CheckCircle2 className="mx-auto h-6 w-6 text-emerald-300" /><img src={qrDataUrl} alt="One-day customer access QR" className="mx-auto mt-4 w-full max-w-[280px] bg-white p-4" /><p className="mt-4 font-mono text-sm font-bold">{pass.phoneMasked}</p><p className="mt-3 text-xs text-[#F3E5AB]/75">{delivery === 'whatsapp' ? 'WhatsApp link requested. Keep this QR as customer backup.' : 'Ask the customer to scan now. This QR is valid for one day.'}</p><button type="button" onClick={() => { setPhone(''); setPass(null); setQrDataUrl(''); setMessage(''); }} className="mt-4 min-h-11 w-full border border-[#D4AF37]/40 text-xs font-bold uppercase">Next customer</button></> : <div className="flex min-h-[420px] flex-col items-center justify-center"><QrCode className="h-20 w-20 text-[#D4AF37]" /><p className="mt-4 font-serif text-xl font-bold">One-day customer QR appears here</p></div>}</aside>
    </div>
  </div></main>;
}
