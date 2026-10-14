'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  Activity,
  BadgeIndianRupee,
  CheckCircle2,
  Copy,
  ExternalLink,
  IndianRupee,
  LockKeyhole,
  MonitorPlay,
  Power,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Tv,
  Users,
} from 'lucide-react';

type AccessType = 'try-on' | 'ai-video' | 'both';

type GeneratedPass = {
  code: string;
  link: string;
  phoneMasked: string;
  billLast4: string;
  purchaseAmount: number;
  accessType: AccessType;
  tryOnEligible: boolean;
  aiVideoEligible: boolean;
  expiresAt: string;
};

const maharajaStats = [
  { label: 'Go Live Plays', value: '17', detail: 'Showroom TV queue' },
  { label: 'Replay Library', value: '7', detail: 'Seed videos ready' },
  { label: 'Downloads', value: '31', detail: 'Customer keepsake' },
  { label: 'Campaign', value: 'On', detail: 'Operator controlled' },
];

const recentLogs = [
  { time: 'Today', category: 'Customer Pass', action: 'Billing-gated QR/pass link created' },
  { time: 'Today', category: 'Go Live', action: 'TV queue and replay loop active' },
  { time: 'Pilot', category: 'Maharaja', action: 'AI Diwali campaign workspace ready' },
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

const includes = [
  'No leakage',
  'No duplication',
  'No competitor support',
  'Regional courtesy',
  'Full customer protection',
  'Privacy and brand value maintained',
];

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Server returned a non-JSON response (${response.status}).`);
  }
}

export default function MaharajaClientPortal() {
  const [campaignEnabled, setCampaignEnabled] = useState(true);
  const [activeAdminTab, setActiveAdminTab] = useState<'pass' | 'insights'>('pass');
  const [passPhone, setPassPhone] = useState('');
  const [passBillLast4, setPassBillLast4] = useState('');
  const [passPurchaseAmount, setPassPurchaseAmount] = useState('5000');
  const [passAccessType, setPassAccessType] = useState<AccessType>('both');
  const [generatedPass, setGeneratedPass] = useState<GeneratedPass | null>(null);
  const [passMessage, setPassMessage] = useState('');
  const [isCreatingPass, setIsCreatingPass] = useState(false);
  const [recentPasses, setRecentPasses] = useState<GeneratedPass[]>([]);
  const [passQrDataUrl, setPassQrDataUrl] = useState('');

  const customerLink = generatedPass?.link || '';

  const selectedAccessCopy = useMemo(() => {
    if (passAccessType === 'try-on') return 'Try-on only: active above Rs 500.';
    if (passAccessType === 'ai-video') return 'AI video only: active above Rs 5000.';
    return 'Try-on opens above Rs 500. AI video opens above Rs 5000.';
  }, [passAccessType]);

  async function loadRecentPasses() {
    try {
      const res = await fetch('/api/customer-pass', { cache: 'no-store' });
      const data = await parseJsonResponse(res);
      if (res.ok && data.success && Array.isArray(data.passes)) {
        setRecentPasses(data.passes.slice(0, 6));
      }
    } catch {
      // Recent pass history is helpful, not blocking.
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void loadRecentPasses();
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!customerLink) {
      return;
    }

    QRCode.toDataURL(customerLink, {
      width: 280,
      margin: 2,
      color: {
        dark: '#2A060C',
        light: '#FFFDF8',
      },
    })
      .then((dataUrl) => {
        if (!cancelled) setPassQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setPassQrDataUrl('');
      });

    return () => {
      cancelled = true;
    };
  }, [customerLink]);

  async function createCustomerPass() {
    try {
      setIsCreatingPass(true);
      setPassMessage('');
      setGeneratedPass(null);
      setPassQrDataUrl('');

      const res = await fetch('/api/customer-pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: passPhone,
          billLast4: passBillLast4,
          purchaseAmount: passPurchaseAmount,
          accessType: passAccessType,
        }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Customer pass creation failed.');
      }

      setGeneratedPass(data.pass);
      setPassMessage('Customer entry pass created. Open or copy this link for the second phone.');
      await loadRecentPasses();
    } catch (err) {
      setPassMessage(err instanceof Error ? err.message : 'Customer pass creation failed.');
    } finally {
      setIsCreatingPass(false);
    }
  }

  async function copyCustomerLink() {
    if (!customerLink) return;
    try {
      await navigator.clipboard.writeText(customerLink);
      setPassMessage('Customer entry link copied.');
    } catch {
      setPassMessage('Copy failed. Open the link and share it manually.');
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f1e8] pb-12 text-slate-900">
      <header className="border-b border-[#d8c49b] bg-[#17070a] px-4 py-4 text-white shadow-lg sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-300">
              tryfocus · Maharaja client portal
            </p>
            <h1 className="mt-1 font-serif text-2xl font-bold uppercase tracking-wider text-[#F3E5AB]">
              Maharaja Workspace
            </h1>
            <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-amber-100/70">
              Billing-gated customer entry, campaign control, insights and TV status.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setCampaignEnabled((value) => !value)}
              className={`flex items-center gap-2 border px-3 py-2 text-[10px] font-black uppercase tracking-wider ${
                campaignEnabled
                  ? 'border-emerald-300/40 bg-emerald-950/40 text-emerald-200'
                  : 'border-red-300/35 bg-red-950/40 text-red-200'
              }`}
            >
              <span className={`h-2.5 w-2.5 ${campaignEnabled ? 'bg-emerald-300' : 'bg-red-300'}`} />
              {campaignEnabled ? 'Campaign on' : 'Campaign off'}
            </button>
            <Link
              href="/tv-login?next=/tv"
              className="inline-flex items-center gap-2 border border-[#D4AF37]/35 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#F3E5AB]"
            >
              <Tv className="h-4 w-4 text-[#D4AF37]" />
              TV
            </Link>
            <Link
              href="/studio"
              className="inline-flex items-center gap-2 border border-[#D4AF37]/35 bg-[#D4AF37] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-black"
            >
              <Sparkles className="h-4 w-4" />
              Operator Studio
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {!campaignEnabled && (
          <div className="mb-5 border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-800">
            Campaign is turned off on this operator screen. Turn it on before issuing new customer passes.
          </div>
        )}

        <nav className="mb-5 grid grid-cols-2 gap-3">
          {[
            ['pass', '5K AI Video Pass', 'Phone + bill last 4 QR/link'],
            ['insights', 'Client Insights', 'Usage, package and logs'],
          ].map(([key, title, subtitle]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveAdminTab(key as 'pass' | 'insights')}
              className={`border p-4 text-left ${
                activeAdminTab === key
                  ? 'border-[#6e0d1f] bg-[#6e0d1f] text-[#F3E5AB]'
                  : 'border-[#e1d4c2] bg-white text-slate-900'
              }`}
            >
              <span className="block text-[10px] font-black uppercase tracking-[0.2em]">{title}</span>
              <span className={`mt-1 block text-[11px] font-bold ${activeAdminTab === key ? 'text-[#F3E5AB]/75' : 'text-slate-500'}`}>
                {subtitle}
              </span>
            </button>
          ))}
        </nav>

        {activeAdminTab === 'pass' && (
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
          <div className="border border-[#e1d4c2] bg-white p-5 shadow-sm lg:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-800">
                  Customer Entry Pass
                </p>
                <h2 className="mt-1 font-serif text-2xl font-bold text-[#6e0d1f]">
                  Generate customer access link
                </h2>
                <p className="mt-2 max-w-2xl text-xs font-semibold leading-5 text-slate-600">
                  Staff enters phone, bill last 4 and purchase amount. The customer opens the generated link on another phone.
                </p>
              </div>
              <span className="hidden border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-800 sm:inline-flex">
                Billing controlled
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#7A5B16]">Phone</span>
                <input
                  value={passPhone}
                  onChange={(event) => setPassPhone(event.target.value)}
                  inputMode="numeric"
                  placeholder="9994837342"
                  className="w-full border border-[#d8c49b] bg-[#fffaf0] px-3 py-3 text-sm font-bold outline-none focus:border-[#6e0d1f]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#7A5B16]">Bill last 4</span>
                <input
                  value={passBillLast4}
                  onChange={(event) => setPassBillLast4(event.target.value)}
                  placeholder="1847"
                  maxLength={4}
                  className="w-full border border-[#d8c49b] bg-[#fffaf0] px-3 py-3 text-sm font-bold uppercase outline-none focus:border-[#6e0d1f]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#7A5B16]">Purchase Rs</span>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6e0d1f]" />
                  <input
                    value={passPurchaseAmount}
                    onChange={(event) => setPassPurchaseAmount(event.target.value)}
                    inputMode="numeric"
                    placeholder="5000"
                    className="w-full border border-[#d8c49b] bg-[#fffaf0] py-3 pl-9 pr-3 text-sm font-bold outline-none focus:border-[#6e0d1f]"
                  />
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#7A5B16]">Access</span>
                <select
                  value={passAccessType}
                  onChange={(event) => setPassAccessType(event.target.value as AccessType)}
                  className="w-full border border-[#d8c49b] bg-[#fffaf0] px-3 py-3 text-sm font-bold outline-none focus:border-[#6e0d1f]"
                >
                  <option value="both">Try-On + AI Video</option>
                  <option value="try-on">Try-On only</option>
                  <option value="ai-video">AI Video only</option>
                </select>
              </label>
            </div>

            <div className="mt-4 border border-[#e7d9b7] bg-[#fffaf0] p-4">
              <p className="text-xs font-bold leading-5 text-[#5C4B43]">{selectedAccessCopy}</p>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={createCustomerPass}
                disabled={isCreatingPass || !campaignEnabled}
                className="flex items-center justify-center gap-2 bg-[#6e0d1f] px-5 py-3 text-xs font-black uppercase tracking-wider text-[#F3E5AB] disabled:opacity-50"
              >
                {isCreatingPass ? <RefreshCw className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                Generate Entry Pass
              </button>
              <p className={`text-xs font-bold ${passMessage.includes('failed') || passMessage.includes('eligible') || passMessage.includes('valid') ? 'text-red-700' : 'text-emerald-800'}`}>
                {passMessage || 'Pass expires after the pilot window and is tied to phone + bill.'}
              </p>
            </div>
          </div>

          <aside className="border border-[#d8c49b] bg-[#fffaf0] p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7A5B16]">Customer Link</p>
              <LockKeyhole className="h-4 w-4 text-[#6e0d1f]" />
            </div>
            <div className="mt-4 border border-dashed border-[#6e0d1f]/30 bg-white p-5 text-center">
              {generatedPass && passQrDataUrl ? (
                <img
                  src={passQrDataUrl}
                  alt="Customer entry QR code"
                  className="mx-auto h-48 w-48 border border-[#e7d9b7] bg-white p-2"
                />
              ) : (
                <QrCode className="mx-auto h-12 w-12 text-[#6e0d1f]" />
              )}
              <p className="mt-3 text-xs font-black uppercase tracking-wider text-[#6e0d1f]">
                {generatedPass ? 'Scan from customer phone' : 'Generate pass first'}
              </p>
              <p className="mt-2 break-all font-mono text-[10px] font-bold leading-4 text-slate-600">
                {customerLink || 'Customer entry link will appear here.'}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={copyCustomerLink}
                disabled={!generatedPass}
                className="flex items-center justify-center gap-1.5 border border-[#d8c49b] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#6e0d1f] disabled:opacity-40"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
              <a
                href={generatedPass?.link || '#'}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-wider ${
                  generatedPass ? 'bg-[#6e0d1f] text-[#F3E5AB]' : 'pointer-events-none bg-slate-200 text-slate-400'
                }`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </a>
            </div>
            {generatedPass && (
              <div className="mt-3 border border-emerald-200 bg-emerald-50 p-3 text-[10px] font-bold uppercase tracking-wider text-emerald-900">
                {generatedPass.phoneMasked} · Bill ****{generatedPass.billLast4} · Rs {generatedPass.purchaseAmount}
              </div>
            )}
          </aside>
        </section>
        )}

        {activeAdminTab === 'insights' && (
        <>
        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {maharajaStats.map((stat) => (
            <div key={stat.label} className="border border-amber-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">{stat.label}</p>
              <p className="mt-2 font-serif text-3xl font-bold text-[#6e0d1f]">{stat.value}</p>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">{stat.detail}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_0.8fr]">
          <div className="border border-[#e1d4c2] bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-[#6e0d1f]" />
                <p className="text-xs font-bold uppercase tracking-wider text-[#6e0d1f]">Maharaja Insights</p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Pilot live</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="border border-[#eee1c5] bg-[#fffaf0] p-4">
                <MonitorPlay className="h-5 w-5 text-[#6e0d1f]" />
                <p className="mt-2 text-xs font-black uppercase tracking-wider text-[#7A5B16]">Go Live</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">Queue and replay loop connected to TV screen.</p>
              </div>
              <div className="border border-[#eee1c5] bg-[#fffaf0] p-4">
                <Users className="h-5 w-5 text-[#6e0d1f]" />
                <p className="mt-2 text-xs font-black uppercase tracking-wider text-[#7A5B16]">Customer Entry</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">Phone, bill and purchase amount control the customer access.</p>
              </div>
              <div className="border border-[#eee1c5] bg-[#fffaf0] p-4">
                <Power className="h-5 w-5 text-[#6e0d1f]" />
                <p className="mt-2 text-xs font-black uppercase tracking-wider text-[#7A5B16]">Campaign</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">Operator can pause new pass creation from this screen.</p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {recentLogs.map((log) => (
                <div key={`${log.time}-${log.category}`} className="grid grid-cols-[72px_1fr] gap-3 bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{log.time}</p>
                  <div>
                    <p className="text-xs font-bold text-slate-900">{log.category}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{log.action}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-[#e1d4c2] bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-[#6e0d1f]">Recent Passes</p>
            <div className="mt-4 space-y-2">
              {recentPasses.length ? (
                recentPasses.map((pass) => (
                  <a
                    key={pass.code}
                    href={pass.link}
                    target="_blank"
                    rel="noreferrer"
                    className="block border border-[#eee1c5] bg-[#fffaf0] p-3 text-xs font-bold text-slate-700"
                  >
                    <span className="block font-mono text-[#6e0d1f]">{pass.code}</span>
                    <span>{pass.phoneMasked} · Rs {pass.purchaseAmount}</span>
                  </a>
                ))
              ) : (
                <div className="border border-dashed border-slate-200 bg-slate-50 p-4 text-xs font-semibold text-slate-500">
                  New customer passes will appear here after creation.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 border border-[#e1d4c2] bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-800">
                Product Packages
              </p>
              <h2 className="mt-1 font-serif text-xl font-bold text-[#6e0d1f]">
                tryfocus retail plans
              </h2>
            </div>
            <BadgeIndianRupee className="h-6 w-6 text-[#6e0d1f]" />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <div key={plan.title} className="border border-amber-200 bg-[#fffaf0] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#6e0d1f]">{plan.title}</p>
                <p className="mt-2 font-serif text-2xl font-bold text-[#6e0d1f]">{plan.price}</p>
                <p className="mt-3 text-xs font-black uppercase tracking-wider text-slate-800">{plan.volume}</p>
                <p className="mt-1 text-[11px] font-bold text-amber-800">{plan.retry}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {includes.map((item) => (
              <div key={item} className="flex items-center gap-2 bg-slate-50 px-3 py-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-700">{item}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 border border-amber-200 bg-[#fffaf0] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-800">Future module</p>
            <p className="mt-2 font-serif text-2xl font-bold text-[#6e0d1f]">100 free try-ons</p>
            <p className="mt-2 text-xs font-black uppercase tracking-wider text-slate-800">
              Celebrity AI Video + Event Dress Try-On
            </p>
          </div>
        </section>

        <section className="mt-6 border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
            <p className="text-xs font-bold leading-5 text-emerald-900">
              `/create` is now the client/admin portal. The older AI generation workflow is preserved at `/studio` for operator-controlled testing.
            </p>
          </div>
        </section>
        </>
        )}
      </div>
    </main>
  );
}
