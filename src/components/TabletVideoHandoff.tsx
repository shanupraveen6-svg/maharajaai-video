'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Clock, MessageSquare, QrCode, Sparkles, Smartphone, CheckCircle2 } from 'lucide-react';

export default function TabletVideoHandoff() {
  const [posterQr, setPosterQr] = useState('');
  const [openVideoUrl, setOpenVideoUrl] = useState('');
  const [whatsappAvailable, setWhatsappAvailable] = useState(false);
  const [useWhatsapp, setUseWhatsapp] = useState(false);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/maharaja/workspace', { cache: 'no-store' })
      .then((response) => response.json())
      .then(async (data) => {
        if (!active || !data.success) return;
        const url = data.workspace?.links?.openVideo;
        if (url) {
          setOpenVideoUrl(url);
          setPosterQr(await QRCode.toDataURL(url, { width: 360, margin: 1, color: { dark: '#161918', light: '#FFFFFF' } }));
        }
        const available = data.workspace?.whatsapp?.configured === true;
        setWhatsappAvailable(available);
        setUseWhatsapp(available && data.workspace?.deliveryMode === 'whatsapp');
      })
      .catch(() => { if (active) setNotice('Unable to load the store video QR. Reload this page.'); });
    return () => { active = false; };
  }, []);

  async function sendWhatsApp() {
    if (phone.length !== 10 || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/maharaja/video-pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'tablet-kiosk', phone, experienceType: 'purchased-garment', whatsappOptIn: true }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.whatsappSent) {
        throw new Error(data.whatsappError || data.error || 'WhatsApp could not send. Show the customer QR code below.');
      }
      setNotice('Private 24-hour video pass link sent to ' + phone + '. Customer can create their video with their own garment.');
      setPhone('');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'WhatsApp could not send. Show the customer QR code below.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Status Banner when WhatsApp is not connected */}
      {!whatsappAvailable && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-[#D8DCD7] bg-[#FAFBF8] p-4 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#161918] text-white">
              <QrCode className="h-3.5 w-3.5" />
            </span>
            <span className="font-semibold text-[#161918]">
              WhatsApp is not connected · Customer scans the QR code directly with their phone
            </span>
          </div>
          <span className="font-mono font-bold uppercase tracking-wider text-[#7A1428]">
            Direct QR Mode
          </span>
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] items-start">
        {/* Left Card: Customer Instructions & 1-Day Validity */}
        <div className="border border-[#D8DCD7] bg-white p-6 sm:p-7 shadow-sm space-y-6">
          <div>
            <div className="inline-flex items-center gap-2 border border-[#7A1428]/20 bg-[#7A1428]/5 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#7A1428]">
              <Clock className="h-3.5 w-3.5" />
              1 Day Validity (24 Hours)
            </div>
            <h2 className="mt-3 font-serif text-3xl font-semibold text-[#161918]">
              AI Fashion Video Pass
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#535A56]">
              Customer can create an AI festival fashion video using their <strong>own garment</strong> and photo on their mobile phone.
            </p>
          </div>

          {/* 3 Step Guide */}
          <div className="space-y-3.5 border-t border-[#D8DCD7] pt-5">
            <h3 className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-[#7A1428]">
              How the customer uses this pass
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-3.5">
                <span className="font-mono text-xs font-bold text-[#7A1428]">Step 1</span>
                <p className="mt-1 text-xs font-semibold text-[#161918]">Scan with Phone</p>
                <p className="mt-1 text-[11px] text-[#535A56]">Open camera app and point at the QR code.</p>
              </div>
              <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-3.5">
                <span className="font-mono text-xs font-bold text-[#7A1428]">Step 2</span>
                <p className="mt-1 text-xs font-semibold text-[#161918]">Upload Own Garment</p>
                <p className="mt-1 text-[11px] text-[#535A56]">Upload photo of dress/saree and portrait photo.</p>
              </div>
              <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-3.5">
                <span className="font-mono text-xs font-bold text-[#7A1428]">Step 3</span>
                <p className="mt-1 text-xs font-semibold text-[#161918]">Get 6s Video</p>
                <p className="mt-1 text-[11px] text-[#535A56]">AI renders fashion film. Link valid for 24 hours.</p>
              </div>
            </div>
          </div>

          {/* WhatsApp option if connected */}
          {whatsappAvailable ? (
            <div className="border border-[#D8DCD7] bg-[#FAFBF8] p-4 space-y-4">
              <label className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#161918]">
                <span>Send via WhatsApp</span>
                <input
                  type="checkbox"
                  checked={useWhatsapp}
                  onChange={(e) => setUseWhatsapp(e.target.checked)}
                  className="h-5 w-5 accent-[#7A1428]"
                />
              </label>

              {useWhatsapp && (
                <div className="space-y-3 pt-2">
                  <label htmlFor="counter-phone" className="block text-xs font-semibold text-[#535A56]">
                    Customer 10-digit mobile number
                  </label>
                  <input
                    id="counter-phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
                    inputMode="tel"
                    placeholder="Enter 10-digit mobile number"
                    className="min-h-12 w-full border border-[#D8DCD7] bg-white px-3.5 text-sm font-semibold outline-none focus:border-[#7A1428]"
                  />
                  <button
                    type="button"
                    disabled={phone.length !== 10 || busy}
                    onClick={sendWhatsApp}
                    className="flex min-h-12 w-full items-center justify-center gap-2 bg-[#7A1428] px-4 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50"
                  >
                    <MessageSquare className="h-4 w-4" />
                    {busy ? 'Sending WhatsApp Link…' : 'Send 24-Hour WhatsApp Link'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded border border-[#D8DCD7] bg-[#FAFBF8] p-4 text-xs text-[#535A56]">
              <p className="font-semibold text-[#161918]">WhatsApp service not active</p>
              <p className="mt-1">
                The customer can scan the QR code directly with any iOS or Android camera app to open their session immediately.
              </p>
            </div>
          )}

          {notice && (
            <p role="status" className="border border-[#7A1428]/30 bg-[#7A1428]/5 p-3 text-xs font-semibold text-[#7A1428]">
              {notice}
            </p>
          )}
        </div>

        {/* Right Card: High-Visibility QR Code */}
        <div className="flex flex-col items-center justify-center border-2 border-[#161918] bg-[#FAFBF8] p-6 text-center shadow-md">
          <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#7A1428]">
            <Smartphone className="h-4 w-4" />
            Customer Scan QR
          </div>
          <h3 className="mt-2 font-serif text-2xl font-semibold text-[#161918]">
            Scan to Create AI Video
          </h3>
          <p className="mt-1 text-xs text-[#535A56]">
            Open camera on customer phone · Valid for 1 full day
          </p>

          <div className="relative mt-5 border-4 border-[#161918] bg-white p-3 shadow-inner">
            {posterQr ? (
              <img
                src={posterQr}
                alt="Customer AI Video Pass QR"
                className="aspect-square w-full max-w-[280px] object-contain"
              />
            ) : (
              <div className="flex aspect-square w-[280px] items-center justify-center bg-gray-50 text-sm text-[#535A56]">
                Loading QR Code…
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs font-bold text-[#256B45]">
            <CheckCircle2 className="h-4 w-4" />
            <span>Own Garment Experience Enabled</span>
          </div>

          <p className="mt-2 max-w-xs text-[11px] text-[#535A56]">
            Reusable counter QR · Each customer scan creates an independent private 24-hour session.
          </p>
        </div>
      </section>
    </div>
  );
}
