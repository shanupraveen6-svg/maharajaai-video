'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  CircleDollarSign,
  ExternalLink,
  KeyRound,
  Monitor,
  QrCode,
  ShieldCheck,
  Smartphone,
  Tablet,
  Tv,
  Video,
} from 'lucide-react';
import { catalogueCategories, formatINR, sampleCatalogue } from '@/lib/tryfocus/sample-data';

type Client = {
  id: string;
  name: string;
  branch: string;
  status: 'Active' | 'Paused';
  minPurchaseTryOnDisabled: boolean;
  whatsappConnected: boolean;
  devices: { tv: boolean; tablet: boolean; mobile: boolean; led: boolean };
  usage: { image: number; live: number; video: number };
  limits: { image: number; live: number; video: number };
};

const initialClients: Client[] = [
  {
    id: 'maharaja',
    name: 'The Majestic Maharaja',
    branch: 'Thanjavur · Main Showroom',
    status: 'Active',
    minPurchaseTryOnDisabled: true,
    whatsappConnected: false,
    devices: { tv: true, tablet: true, mobile: true, led: true },
    usage: { image: 1180, live: 72, video: 41 },
    limits: { image: 4000, live: 500, video: 500 },
  },
  {
    id: 'anand',
    name: 'Anand Textiles',
    branch: 'Coimbatore · RS Puram',
    status: 'Paused',
    minPurchaseTryOnDisabled: true,
    whatsappConnected: false,
    devices: { tv: false, tablet: true, mobile: true, led: false },
    usage: { image: 320, live: 0, video: 12 },
    limits: { image: 4000, live: 0, video: 500 },
  },
];

const plans = [
  {
    key: 'image',
    label: 'AI Image Try-On',
    standard: '4,000 generations',
    pro: '6,000 generations',
    oldStandard: '₹50,000',
    oldPro: '₹99,999',
    offerStandard: '₹40,000',
    offerPro: '₹80,000',
    icon: Smartphone,
  },
  {
    key: 'live',
    label: 'Live AI Try-On (TV Only)',
    standard: '500 × 30-second sessions',
    pro: '1,000 × 30-second sessions',
    oldStandard: '₹50,000',
    oldPro: '₹99,999',
    offerStandard: '₹40,000',
    offerPro: '₹80,000',
    icon: Monitor,
  },
  {
    key: 'video',
    label: 'AI Video (1-Day Pass)',
    standard: '500 video rewards',
    pro: '1,000 video rewards',
    oldStandard: '₹50,000',
    oldPro: '₹99,999',
    offerStandard: '₹40,000',
    offerPro: '₹80,000',
    icon: Video,
  },
] as const;

export default function TryFocusAdmin() {
  const [clients, setClients] = useState(initialClients);
  const [clientId, setClientId] = useState(initialClients[0].id);
  const [savedNotice, setSavedNotice] = useState(false);
  const [pairCode, setPairCode] = useState('TF-MAH-8421');

  const client = useMemo(
    () => clients.find((item) => item.id === clientId) || clients[0],
    [clients, clientId]
  );

  function updateClient(next: Partial<Client>) {
    setClients((items) =>
      items.map((item) => (item.id === client.id ? { ...item, ...next } : item))
    );
    setSavedNotice(false);
  }

  function toggleDevice(key: keyof Client['devices']) {
    updateClient({ devices: { ...client.devices, [key]: !client.devices[key] } });
  }

  function setLimit(key: keyof Client['limits'], value: number) {
    updateClient({ limits: { ...client.limits, [key]: Math.max(0, value) } });
  }

  return (
    <main className="min-h-screen bg-[#F4F5F2] text-[#161918]">
      {/* Unified TryFocus Top Header */}
      <header className="sticky top-0 z-30 border-b border-[#D8DCD7] bg-[#F4F5F2]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center border border-[#161918] bg-[#161918] font-mono text-xs font-bold tracking-widest text-[#FAF6EE]">
              TF
            </span>
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7A1428]">
                TryFocus admin
              </p>
              <h1 className="font-serif text-xl font-semibold text-[#161918]">
                Store management
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/maharaja/workspace"
              className="border border-[#D8DCD7] bg-[#FAFBF8] px-3.5 py-2 text-xs font-semibold text-[#161918] hover:border-[#161918]"
            >
              Client Workspace
            </Link>
            <Link
              href="/maharaja/tv/experience"
              className="border border-[#D8DCD7] bg-[#FAFBF8] px-3.5 py-2 text-xs font-semibold text-[#161918] hover:border-[#161918]"
            >
              TV Smart Mirror
            </Link>
            <button
              type="button"
              onClick={() => {
                setSavedNotice(true);
                window.setTimeout(() => setSavedNotice(false), 2500);
              }}
              className="bg-[#7A1428] px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] text-[#FAF6EE]"
            >
              {savedNotice ? 'Configuration Saved' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-6 sm:px-8">
        {/* Client Selector & Status */}
        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-6">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
              Store setup
            </p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-serif text-3xl font-semibold text-[#161918]">
                  Set up each store from one place.
                </h2>
                <p className="mt-2 max-w-xl text-sm text-[#535A56]">
                  Turn store experiences on or off, set credits, and choose how customers continue on mobile.
                </p>
              </div>
              <div className="relative min-w-64">
                <label className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#535A56]">
                  Selected Retailer
                </label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="h-11 w-full appearance-none border border-[#D8DCD7] bg-white px-3.5 text-sm font-semibold text-[#161918] outline-none focus:border-[#7A1428]"
                >
                  <option value="maharaja">The Majestic Maharaja (Thanjavur)</option>
                  <option value="anand">Anand Textiles (Coimbatore)</option>
                </select>
                <ChevronDown className="pointer-events-none absolute bottom-3.5 right-3.5 h-4 w-4 text-[#535A56]" />
              </div>
            </div>
          </div>

          <aside className="flex flex-col justify-between border border-[#D8DCD7] bg-white p-6">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                Client Status & Policy
              </p>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="font-serif text-2xl font-semibold text-[#161918]">{client.name}</p>
                  <p className="text-xs text-[#535A56]">{client.branch}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateClient({ status: client.status === 'Active' ? 'Paused' : 'Active' })
                  }
                  className={`px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider ${
                    client.status === 'Active'
                      ? 'border border-[#256B45] bg-[#EBF5EE] text-[#256B45]'
                      : 'border border-[#B42318] bg-[#FEF3F2] text-[#B42318]'
                  }`}
                >
                  {client.status}
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 border-t border-[#D8DCD7] pt-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#535A56]">AI Image Try-On ₹500 Minimum:</span>
                <button
                  type="button"
                  onClick={() =>
                    updateClient({ minPurchaseTryOnDisabled: !client.minPurchaseTryOnDisabled })
                  }
                  className="font-mono font-bold text-[#256B45]"
                >
                  {client.minPurchaseTryOnDisabled ? 'DISABLED (Direct Scan Active)' : 'ENABLED (₹500 Tag)'}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#535A56]">AI Video Delivery Mode:</span>
                <span className="font-mono font-bold text-[#7A1428]">
                  {client.whatsappConnected ? 'WhatsApp 1-Day Link' : 'Direct QR (1-Day Validity)'}
                </span>
              </div>
            </div>
          </aside>
        </section>

        {/* Purchased Device Access & Retailer Permissions */}
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="border border-[#D8DCD7] bg-white p-6">
            <div className="flex items-center justify-between border-b border-[#D8DCD7] pb-4">
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                  Purchased Device Surfaces
                </p>
                <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                  Turn Each Surface On or Off
                </h2>
              </div>
              <Tv className="h-6 w-6 text-[#7A1428]" />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ['tv', 'Interactive TV / Smart Mirror', 'AI Image Try-On, 30s Live Mirror & Catalogue Video', Tv],
                  ['tablet', 'Counter Tablet & Billing', 'Staff-assisted 1-day Direct QR & giveaway passes', Tablet],
                  ['mobile', 'Customer Mobile QR', 'Direct image scan, 1-day video pass, Download + Go Live', Smartphone],
                  ['led', 'Showroom TV Wall (/maharaja/tv)', 'Plays approved customer Go Live videos & idle loop', Monitor],
                ] as const
              ).map(([key, title, description, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleDevice(key)}
                  className={`flex items-start gap-3.5 border p-4 text-left transition ${
                    client.devices[key]
                      ? 'border-[#7A1428] bg-[#FAFBF8]'
                      : 'border-[#D8DCD7] bg-[#F4F5F2] opacity-65'
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center ${
                      client.devices[key]
                        ? 'bg-[#7A1428] text-white'
                        : 'border border-[#D8DCD7] bg-white text-[#535A56]'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-serif text-base font-semibold text-[#161918]">{title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#535A56]">{description}</p>
                    <span
                      className={`mt-2.5 inline-block px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                        client.devices[key]
                          ? 'bg-[#EBF5EE] text-[#256B45]'
                          : 'bg-[#ECEEE9] text-[#535A56]'
                      }`}
                    >
                      {client.devices[key] ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-6">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
              Experience settings
            </p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
              Customer routing
            </h2>
            <div className="mt-4 space-y-3">
              {[
                [
                  'Mobile try-on',
                  'Free QR access is active for this store.',
                ],
                [
                  'Video delivery',
                  'Customer QR is active for 24 hours.',
                ],
                [
                  'TV video',
                  'Featured catalogue looks continue to mobile.',
                ],
                [
                  'Customer choices',
                  'Customers can download or approve a Go Live video.',
                ],
              ].map(([title, desc]) => (
                <div key={title} className="flex gap-3 border border-[#D8DCD7] bg-white p-3.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#256B45]" />
                  <div>
                    <p className="text-xs font-bold text-[#161918]">{title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[#535A56]">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Usage & Hard Budget Ceilings */}
        <section className="border border-[#D8DCD7] bg-white p-6">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#D8DCD7] pb-4">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                Usage & Credit Ceilings
              </p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                Generation Credits for {client.name}
              </h2>
            </div>
            <span className="font-mono text-xs text-[#535A56]">
              Image / Video / 30s Live Caps
            </span>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {plans.map((plan) => {
              const key = plan.key;
              const used = client.usage[key];
              const limit = client.limits[key];
              const percent = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
              const Icon = plan.icon;
              return (
                <article key={key} className="border border-[#D8DCD7] bg-[#FAFBF8] p-5">
                  <div className="flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center bg-[#161918] text-white">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="font-mono text-xs font-semibold text-[#535A56]">
                      {used.toLocaleString('en-IN')} used
                    </span>
                  </div>
                  <h3 className="mt-3 font-serif text-xl font-semibold text-[#161918]">
                    {plan.label}
                  </h3>
                  <div className="mt-3 flex items-center gap-3">
                    <input
                      aria-label={`${plan.label} limit`}
                      type="number"
                      value={limit}
                      onChange={(e) => setLimit(key, Number(e.target.value))}
                      className="h-10 w-32 border border-[#D8DCD7] bg-white px-3 font-mono text-sm font-bold text-[#161918] outline-none focus:border-[#7A1428]"
                    />
                    <span className="text-xs text-[#535A56]">hard limit</span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden bg-[#ECEEE9]">
                    <div className="h-full bg-[#7A1428]" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mt-2 font-mono text-xs text-[#535A56]">
                    {Math.max(0, limit - used).toLocaleString('en-IN')} remaining · {percent}% used
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        {/* 30-Product South Indian Catalogue Inventory (6 Categories × 5 Models) */}
        <section className="hidden border border-[#D8DCD7] bg-[#FAFBF8] p-6">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#D8DCD7] pb-4">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                Active Store Catalogue · {sampleCatalogue.length} Outfits (5 Per Category)
              </p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">
                Women & Men South Indian Collection
              </h2>
              <p className="mt-1 text-xs text-[#535A56]">
                Every category has 5 models with INR prices. In all AI calls, <strong>Image 1</strong> is the customer photo and <strong>Image 2</strong> is the garment reference (catalogue model faces are ignored).
              </p>
            </div>
            <Link
              href="/maharaja/tv/experience"
              className="inline-flex items-center gap-1.5 bg-[#7A1428] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-[#FAF6EE]"
            >
              Test in Smart Mirror
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalogueCategories.map((cat) => {
              const items = sampleCatalogue.filter((item) => item.category === cat.id);
              return (
                <div key={cat.id} className="border border-[#D8DCD7] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#7A1428]">
                      {cat.gender} · {items.length} Models
                    </span>
                    <span className="font-mono text-xs text-[#535A56]">
                      {formatINR(items[0]?.price || 0)} – {formatINR(items[items.length - 1]?.price || 0)}
                    </span>
                  </div>
                  <h3 className="mt-1 font-serif text-lg font-semibold text-[#161918]">
                    {cat.label}
                  </h3>
                  <p className="text-xs text-[#535A56]">{cat.description}</p>
                  <div className="mt-3 grid grid-cols-5 gap-1.5">
                    {items.map((item) => (
                      <img
                        key={item.sku}
                        src={item.imageUrl}
                        alt={item.title}
                        title={`${item.title} (${formatINR(item.price)})`}
                        className="aspect-[3/4] w-full border border-[#D8DCD7] object-cover"
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
