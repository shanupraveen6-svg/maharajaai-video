'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function TabletVideoHandoff() {
  const [posterQr, setPosterQr] = useState('');
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
        if (url) setPosterQr(await QRCode.toDataURL(url, { width: 340, margin: 1 }));
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
      if (!response.ok || !data.success || !data.whatsappSent) throw new Error(data.whatsappError || data.error || 'WhatsApp could not send. Show the poster QR.');
      setNotice('Private 24-hour link sent. The customer can upload any garment and photo on their phone.');
      setPhone('');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'WhatsApp could not send. Show the poster QR.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
      <div className="border border-[#D8DCD7] bg-white p-5 sm:p-7">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#7A1428]">Counter video handoff</p>
        <h2 className="mt-2 font-serif text-3xl font-semibold">Create a video with any garment</h2>
        <p className="mt-3 text-sm leading-relaxed text-[#535A56]">The biller decides when to offer this experience. The customer scans the poster QR or receives a private WhatsApp link, then uploads their garment and photo on mobile. Download and Go Live are shown after the video is ready.</p>

        <label className="mt-7 flex min-h-16 items-center justify-between gap-3 border border-[#D8DCD7] bg-[#FAFBF8] p-4 text-sm font-semibold">
          <span>Send a private WhatsApp link {whatsappAvailable ? '' : '· API not connected'}</span>
          <input type="checkbox" checked={useWhatsapp} disabled={!whatsappAvailable} onChange={(event) => { setUseWhatsapp(event.target.checked); setNotice(''); }} className="h-6 w-6 accent-[#7A1428]" />
        </label>
        {useWhatsapp ? (
          <div className="mt-5 space-y-3">
            <label htmlFor="counter-phone" className="text-sm font-semibold">Customer mobile number</label>
            <input id="counter-phone" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="tel" autoComplete="tel" placeholder="10-digit number" className="min-h-14 w-full border border-[#D8DCD7] px-4 text-base" />
            <button type="button" disabled={phone.length !== 10 || busy} onClick={sendWhatsApp} className="min-h-14 w-full bg-[#7A1428] px-5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Sending…' : 'Send 24-hour WhatsApp link'}</button>
          </div>
        ) : <p className="mt-5 text-sm text-[#535A56]">Show the permanent QR beside this panel. Each scan opens a new private 24-hour session.</p>}
        {notice && <p role="status" className="mt-5 border border-[#D8DCD7] bg-[#FAFBF8] p-3 text-sm">{notice}</p>}
      </div>

      <div className="flex flex-col items-center justify-center border border-[#D8DCD7] bg-[#FAFBF8] p-5 text-center sm:p-7">
        <h3 className="font-serif text-2xl font-semibold">Customer QR</h3>
        <p className="mt-2 max-w-sm text-sm text-[#535A56]">Reusable at the counter or on a poster. No new QR is needed for each customer.</p>
        {posterQr ? <img src={posterQr} alt="Permanent customer AI video QR" className="mt-5 aspect-square w-full max-w-[300px] border border-[#D8DCD7] bg-white p-3" /> : <div className="mt-5 flex aspect-square w-full max-w-[300px] items-center justify-center border border-[#D8DCD7] bg-white text-sm text-[#535A56]">Loading QR…</div>}
        <p className="mt-4 text-xs text-[#535A56]">The link created after a scan expires in 24 hours.</p>
      </div>
    </section>
  );
}
