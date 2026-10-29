'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Camera,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Gift,
  LoaderCircle,
  Phone,
  QrCode,
  ShoppingBag,
  Sparkles,
  Tablet,
  Upload,
  Video,
} from 'lucide-react';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import {
  catalogueCategories,
  events,
  formatINR,
  sampleCatalogue,
  type CatalogueCategoryId,
  type TryFocusProduct,
} from '@/lib/tryfocus/sample-data';

type TabletTab = 'video-pass' | 'image-tryon';
type VideoPassMode = 'purchased-garment' | 'catalogue-gift';

export default function MaharajaTabletExperience() {
  const [tab, setTab] = useState<TabletTab>('video-pass');

  // Catalogue state
  const [genderFilter, setGenderFilter] = useState<'women' | 'men'>('women');
  const [activeCategory, setActiveCategory] = useState<CatalogueCategoryId>('sarees');
  const [selectedProduct, setSelectedProduct] = useState<TryFocusProduct>(sampleCatalogue[0]);
  const [selectedEventId, setSelectedEventId] = useState<string>(events[0].id);

  // Tab 1: AI Video Pass / Giveaway state
  const [passMode, setPassMode] = useState<VideoPassMode>('catalogue-gift');
  const [phone, setPhone] = useState<string>('');
  const [passLoading, setPassLoading] = useState<boolean>(false);
  const [passError, setPassError] = useState<string>('');
  const [passLink, setPassLink] = useState<string>('');
  const [passCode, setPassCode] = useState<string>('');
  const [passQr, setPassQr] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Tab 2: Staff-Assisted AI Image Try-On state
  const [tryOnSource, setTryOnSource] = useState<'catalogue' | 'own-garment'>('catalogue');
  const [personPhoto, setPersonPhoto] = useState<string>('');
  const [ownGarmentPhoto, setOwnGarmentPhoto] = useState<string>('');
  const [tryOnGenerating, setTryOnGenerating] = useState<boolean>(false);
  const [tryOnResultUrl, setTryOnResultUrl] = useState<string>('');
  const [tryOnStatusNote, setTryOnStatusNote] = useState<string>('');
  const [tryOnMobileQr, setTryOnMobileQr] = useState<string>('');

  const filteredCategories = catalogueCategories.filter((cat) => cat.gender === genderFilter);
  const categoryProducts = sampleCatalogue.filter((item) => item.category === activeCategory);

  useEffect(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://tryfocus.in';
    const url = `${origin}/maharaja/try-on?sku=${encodeURIComponent(selectedProduct.sku)}&source=tablet`;
    QRCode.toDataURL(url, {
      width: 220,
      margin: 1,
      color: { dark: '#161918', light: '#FAFBF8' },
    })
      .then(setTryOnMobileQr)
      .catch(() => setTryOnMobileQr(''));
  }, [selectedProduct]);

  function handleFileRead(setter: (val: string) => void, file?: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setter(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function handleGenerateVideoPass(e: React.FormEvent) {
    e.preventDefault();
    setPassLoading(true);
    setPassError('');
    try {
      const res = await fetch('/api/maharaja/video-pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'tablet-kiosk',
          phone: phone || '9876543210',
          experienceType: passMode,
          catalogueSku: passMode === 'catalogue-gift' ? selectedProduct.sku : undefined,
          eventId: selectedEventId,
          whatsappOptIn: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Unable to generate 1-day AI Video QR.');
      }
      const link = data.pass.link;
      setPassLink(link);
      setPassCode(data.pass.code);
      const qr = await QRCode.toDataURL(link, {
        width: 300,
        margin: 1,
        color: { dark: '#161918', light: '#FAFBF8' },
      });
      setPassQr(qr);
    } catch (err: unknown) {
      setPassError(err instanceof Error ? err.message : 'Unable to generate QR.');
    } finally {
      setPassLoading(false);
    }
  }

  async function handleGenerateImageTryOn() {
    const garmentImg =
      tryOnSource === 'own-garment'
        ? ownGarmentPhoto
        : selectedProduct.garmentReferenceUrl || selectedProduct.imageUrl;

    if (!personPhoto || !garmentImg) {
      setTryOnStatusNote('Please upload/capture Image 1 (Customer Photo) and Image 2 (Garment Photo).');
      return;
    }

    setTryOnGenerating(true);
    setTryOnStatusNote('');
    const sessionId = `tablet_tryon_${Date.now()}`;

    try {
      const res = await fetch('/api/ai/master-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          service: 'try-on',
          templateId: selectedProduct.gender,
          garmentType: selectedProduct.garmentType,
          garmentTypeConfirmed: true,
          processingConsent: true,
          consentVersion: '2026-10-privacy-v2',
          personPhoto,
          garmentPhotos: [garmentImg],
          garmentRoles: ['Primary Garment Reference'],
          garmentAnalysis: `${selectedProduct.title} (${selectedProduct.fabricNote})`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.masterImageUrl) {
        setTryOnResultUrl(data.masterImageUrl);
        setTryOnStatusNote('AI Try-On generated (Image 1 = Customer Identity, Image 2 = Garment Reference).');
      } else {
        setTryOnResultUrl(selectedProduct.imageUrl);
        setTryOnStatusNote(
          data?.error
            ? `Showing studio drape preview (${data.error})`
            : 'Showing studio drape preview.'
        );
      }
    } catch {
      setTryOnResultUrl(selectedProduct.imageUrl);
      setTryOnStatusNote('Showing studio drape preview.');
    } finally {
      setTryOnGenerating(false);
    }
  }

  async function copyPassLink() {
    if (!passLink) return;
    await navigator.clipboard.writeText(passLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="tablet-workspace min-h-screen bg-[#F4F5F2] text-[#161918]">
      {/* Unified TryFocus Header */}
      <header className="sticky top-0 z-30 border-b border-[#D8DCD7] bg-[#F4F5F2]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center border border-[#161918] bg-[#161918] font-mono text-xs font-bold tracking-widest text-[#FAF6EE]">
              TF
            </span>
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7A1428]">
                TryFocus × The Majestic Maharaja · Counter Tablet
              </p>
              <h1 className="font-serif text-lg font-semibold text-[#161918]">Counter assistant</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('video-pass')}
              className={`flex items-center gap-1.5 border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                tab === 'video-pass'
                  ? 'border-[#7A1428] bg-[#7A1428] text-white'
                  : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918]'
              }`}
            >
              <Video className="h-3.5 w-3.5" />
              Create video pass
            </button>
            <button
              type="button"
              onClick={() => setTab('image-tryon')}
              className={`flex items-center gap-1.5 border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                tab === 'image-tryon'
                  ? 'border-[#7A1428] bg-[#7A1428] text-white'
                  : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918]'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Try-on assistant
            </button>
            <Link
              href="/maharaja/workspace"
              className="border border-[#D8DCD7] bg-white px-3.5 py-2 text-xs font-semibold text-[#161918]"
            >
              Workspace
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-6 sm:px-8">
        {/* =========================================================
            TAB 1: AI VIDEO PASS & GIVEAWAY (Direct QR when WhatsApp not connected)
           ========================================================= */}
        {tab === 'video-pass' && (
          <div className="space-y-6">
            {/* Delivery Status Banner */}
            <div className="flex flex-wrap items-center justify-between gap-4 border border-[#D8DCD7] bg-[#FAFBF8] p-5">
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#7A1428]">Customer handoff</p>
                <h2 className="mt-1 font-serif text-2xl font-semibold text-[#161918]">Create a video pass</h2>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#535A56]">Select the experience, then let the customer continue privately by scanning the QR.</p>
              </div>
              <span className="border border-[#7A1428] bg-[#7A1428]/10 px-3.5 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#7A1428]">
                QR valid 24 hours
              </span>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              {/* Left: Pass Type + Optional Catalogue Selection + Customer Phone */}
              <form
                onSubmit={handleGenerateVideoPass}
                className="space-y-5 border border-[#D8DCD7] bg-white p-6"
              >
                <div>
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#7A1428]">
                    Choose experience
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPassMode('catalogue-gift')}
                      className={`flex flex-col items-start border p-4 text-left transition ${
                        passMode === 'catalogue-gift'
                          ? 'border-[#7A1428] bg-[#7A1428] text-white'
                          : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918]'
                      }`}
                    >
                      <Gift className="h-5 w-5" />
                      <span className="mt-2 font-serif text-base font-semibold">
                        Catalogue video
                      </span>
                      <span className="mt-1 text-[11px] opacity-85">
                        Select a store look for the customer.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPassMode('purchased-garment')}
                      className={`flex flex-col items-start border p-4 text-left transition ${
                        passMode === 'purchased-garment'
                          ? 'border-[#7A1428] bg-[#7A1428] text-white'
                          : 'border-[#D8DCD7] bg-[#FAFBF8] text-[#161918]'
                      }`}
                    >
                      <ShoppingBag className="h-5 w-5" />
                      <span className="mt-2 font-serif text-base font-semibold">
                        Purchased garment
                      </span>
                      <span className="mt-1 text-[11px] opacity-85">
                        Customer uses their own selected garment.
                      </span>
                    </button>
                  </div>
                </div>

                {/* Catalogue Dress Picker when in Catalogue/Giveaway mode */}
                {passMode === 'catalogue-gift' && (
                  <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#7A1428]">
                        Optional: Pre-Select Catalogue Outfit ({selectedProduct.sku} · {formatINR(selectedProduct.price)})
                      </span>
                      <div className="flex border border-[#D8DCD7] bg-white p-0.5 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => {
                            setGenderFilter('women');
                            setActiveCategory('sarees');
                          }}
                          className={`px-2.5 py-1 ${
                            genderFilter === 'women' ? 'bg-[#7A1428] text-white' : 'text-[#535A56]'
                          }`}
                        >
                          Women
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setGenderFilter('men');
                            setActiveCategory('kurta');
                          }}
                          className={`px-2.5 py-1 ${
                            genderFilter === 'men' ? 'bg-[#7A1428] text-white' : 'text-[#535A56]'
                          }`}
                        >
                          Men
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {filteredCategories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setActiveCategory(cat.id)}
                          className={`border px-3 py-1 text-xs font-semibold ${
                            activeCategory === cat.id
                              ? 'border-[#161918] bg-[#161918] text-white'
                              : 'border-[#D8DCD7] bg-white text-[#161918]'
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3 grid grid-cols-5 gap-2">
                      {categoryProducts.map((item) => (
                        <button
                          key={item.sku}
                          type="button"
                          onClick={() => setSelectedProduct(item)}
                          className={`overflow-hidden border p-1 text-left ${
                            selectedProduct.sku === item.sku
                              ? 'border-[#7A1428] bg-[#7A1428]/10 ring-1 ring-[#7A1428]'
                              : 'border-[#D8DCD7] bg-white'
                          }`}
                        >
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            className="aspect-[3/4] w-full object-cover"
                          />
                          <p className="mt-1 truncate font-mono text-[10px] font-bold text-[#161918]">
                            {formatINR(item.price)}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Customer Phone Input */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#161918]">
                      Customer mobile
                    </label>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="9876543210"
                      className="mt-1.5 h-11 w-full border border-[#D8DCD7] bg-[#FAFBF8] px-3 font-mono text-base font-bold text-[#161918] outline-none focus:border-[#7A1428]"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#161918]">
                      Video theme
                    </label>
                    <select
                      value={selectedEventId}
                      onChange={(e) => setSelectedEventId(e.target.value)}
                      className="mt-1.5 h-11 w-full border border-[#D8DCD7] bg-[#FAFBF8] px-3 text-sm font-semibold text-[#161918] outline-none focus:border-[#7A1428]"
                    >
                      {events.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.label} ({ev.mood})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {passError && (
                  <p className="border border-[#B42318] bg-[#FEF3F2] p-3 text-xs font-semibold text-[#B42318]">
                    {passError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={passLoading}
                  className="flex min-h-12 w-full items-center justify-center gap-2 bg-[#7A1428] px-5 py-3.5 text-xs font-bold uppercase tracking-[0.16em] text-[#FAF6EE] transition hover:bg-[#610F20] disabled:opacity-50"
                >
                  {passLoading ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Preparing QR...
                    </>
                  ) : (
                    <>
                      <QrCode className="h-4 w-4" />
                      Show customer QR
                    </>
                  )}
                </button>
              </form>

              {/* Right: Scannable 1-Day Direct QR */}
              <div className="flex flex-col items-center justify-center border border-[#D8DCD7] bg-[#FAFBF8] p-6 text-center">
                {passQr && passLink ? (
                  <div className="w-full max-w-md space-y-4">
                    <span className="inline-flex items-center gap-1.5 border border-[#256B45] bg-[#EBF5EE] px-3 py-1 font-mono text-[11px] font-bold uppercase text-[#256B45]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      1-Day Direct QR Active · Code: {passCode}
                    </span>
                    <h3 className="font-serif text-2xl font-semibold text-[#161918]">
                      Scan to continue
                    </h3>
                    <div className="mx-auto inline-block border border-[#D8DCD7] bg-white p-4">
                      <img src={passQr} alt="1-Day Video Pass QR" className="h-60 w-60 object-contain" />
                    </div>
                    <p className="text-xs text-[#535A56]">
                      The customer can create, download, or choose Go Live privately on their phone.
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={copyPassLink}
                        className="flex items-center justify-center gap-1.5 border border-[#161918] bg-white py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#161918]"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copied ? 'Copied' : 'Copy Link'}
                      </button>
                      <a
                        href={passLink}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-1.5 bg-[#161918] py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#FAF6EE]"
                      >
                        Open Mobile Flow
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-sm space-y-3 py-10">
                    <QrCode className="mx-auto h-12 w-12 text-[#7A1428]" />
                    <h3 className="font-serif text-2xl font-semibold text-[#161918]">
                      Customer QR
                    </h3>
                    <p className="text-xs text-[#535A56]">
                      Choose an experience and show a private QR to the customer.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 2: STAFF-ASSISTED AI IMAGE TRY-ON (Catalogue + Own Garment + Slider)
           ========================================================= */}
        {tab === 'image-tryon' && (
          <div className="space-y-6">
            <div className="grid gap-6 border border-[#D8DCD7] bg-white p-6 lg:grid-cols-2">
              {/* Left: Image 1 (Customer) + Image 2 (Catalogue or Own Garment) */}
              <div className="space-y-5">
                <div className="flex items-center justify-between border-b border-[#D8DCD7] pb-3">
                  <div>
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#7A1428]">
                      Staff-Assisted AI Image Try-On
                    </p>
                    <h3 className="font-serif text-xl font-semibold text-[#161918]">
                      Add customer photo and outfit
                    </h3>
                  </div>
                  <div className="flex border border-[#D8DCD7] bg-[#F4F5F2] p-0.5 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setTryOnSource('catalogue')}
                      className={`px-3 py-1.5 ${
                        tryOnSource === 'catalogue' ? 'bg-[#7A1428] text-white' : 'text-[#535A56]'
                      }`}
                    >
                      Catalogue (30)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTryOnSource('own-garment')}
                      className={`px-3 py-1.5 ${
                        tryOnSource === 'own-garment' ? 'bg-[#7A1428] text-white' : 'text-[#535A56]'
                      }`}
                    >
                      Own Garment
                    </button>
                  </div>
                </div>

                {/* Upload Image 1: Customer Photo */}
                <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold uppercase text-[#7A1428]">
                      Customer photo
                    </span>
                    <label className="cursor-pointer bg-[#161918] px-3.5 py-1.5 text-xs font-semibold text-white">
                      Upload / Capture Person
                      <input
                        type="file"
                        accept="image/*"
                        capture="user"
                        className="hidden"
                        onChange={(e) => handleFileRead(setPersonPhoto, e.target.files?.[0])}
                      />
                    </label>
                  </div>
                  {personPhoto && (
                    <img
                      src={personPhoto}
                      alt="Customer"
                      className="mt-3 h-36 w-28 border border-[#D8DCD7] object-cover"
                    />
                  )}
                </div>

                {/* Image 2: Catalogue or Own Garment */}
                {tryOnSource === 'catalogue' ? (
                  <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold uppercase text-[#7A1428]">
                        Select store outfit
                      </span>
                      <div className="flex gap-1 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => {
                            setGenderFilter('women');
                            setActiveCategory('sarees');
                          }}
                          className={`px-2.5 py-1 ${
                            genderFilter === 'women' ? 'bg-[#161918] text-white' : 'bg-white'
                          }`}
                        >
                          Women
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setGenderFilter('men');
                            setActiveCategory('kurta');
                          }}
                          className={`px-2.5 py-1 ${
                            genderFilter === 'men' ? 'bg-[#161918] text-white' : 'bg-white'
                          }`}
                        >
                          Men
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {filteredCategories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setActiveCategory(cat.id)}
                          className={`border px-2.5 py-1 text-xs font-semibold ${
                            activeCategory === cat.id
                              ? 'border-[#7A1428] bg-[#7A1428] text-white'
                              : 'border-[#D8DCD7] bg-white text-[#161918]'
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3 grid grid-cols-5 gap-2">
                      {categoryProducts.map((item) => (
                        <button
                          key={item.sku}
                          type="button"
                          onClick={() => setSelectedProduct(item)}
                          className={`border p-1 text-left ${
                            selectedProduct.sku === item.sku
                              ? 'border-[#7A1428] bg-[#7A1428]/10 ring-1 ring-[#7A1428]'
                              : 'border-[#D8DCD7] bg-white'
                          }`}
                        >
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            className="aspect-[3/4] w-full object-cover"
                          />
                          <p className="mt-1 truncate font-mono text-[10px] font-bold">
                            {formatINR(item.price)}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold uppercase text-[#7A1428]">
                        Add garment photo
                      </span>
                      <label className="cursor-pointer bg-[#161918] px-3.5 py-1.5 text-xs font-semibold text-white">
                        Upload / Capture Dress
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => handleFileRead(setOwnGarmentPhoto, e.target.files?.[0])}
                        />
                      </label>
                    </div>
                    {ownGarmentPhoto && (
                      <img
                        src={ownGarmentPhoto}
                        alt="Own Garment"
                        className="mt-3 h-36 w-28 border border-[#D8DCD7] object-cover"
                      />
                    )}
                  </div>
                )}

                <button
                  type="button"
                  disabled={tryOnGenerating}
                  onClick={handleGenerateImageTryOn}
                  className="flex min-h-12 w-full items-center justify-center gap-2 bg-[#7A1428] px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-[#FAF6EE] disabled:opacity-50"
                >
                  {tryOnGenerating ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Generating AI Try-On...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Create look
                    </>
                  )}
                </button>

                {tryOnStatusNote && (
                  <p className="border border-[#D8DCD7] bg-[#FAFBF8] p-3 text-xs text-[#535A56]">
                    {tryOnStatusNote}
                  </p>
                )}
              </div>

              {/* Right: Result + Mobile QR + Old vs New Dress Slider */}
              <div className="space-y-4 border border-[#D8DCD7] bg-[#FAFBF8] p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7A1428]">
                      Customer result
                    </p>
                    <h4 className="font-serif text-xl font-semibold text-[#161918]">
                      Compare and save to phone
                    </h4>
                  </div>
                  {tryOnMobileQr && (
                    <img
                      src={tryOnMobileQr}
                      alt="Mobile QR"
                      className="h-16 w-16 border border-[#D8DCD7] bg-white p-1"
                    />
                  )}
                </div>

                <div className="mx-auto max-w-sm">
                  <BeforeAfterSlider
                    beforeImage={personPhoto || selectedProduct.imageUrl}
                    afterImage={tryOnResultUrl || selectedProduct.imageUrl}
                    beforeLabel="Old / Current Photo"
                    afterLabel="New AI Try-On Dress"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
