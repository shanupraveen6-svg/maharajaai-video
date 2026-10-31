'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/** Same id the try-on pages use; it lets a phone reopen its own pass instead of minting new ones. */
function posterDeviceId() {
  try {
    const key = 'tryfocus:maharaja:device-id';
    const value = window.localStorage.getItem(key) || crypto.randomUUID().replace(/-/g, '');
    window.localStorage.setItem(key, value);
    return value;
  } catch {
    return '';
  }
}

function PosterEntry() {
  const router = useRouter();
  const code = useSearchParams().get('code') || '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    if (!code || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/maharaja/video-pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'video-poster', billingCode: code, experienceType: 'purchased-garment', deviceId: posterDeviceId() }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.pass?.code) throw new Error(data.error || 'Unable to start your video.');
      router.replace(`/maharaja/video/${encodeURIComponent(data.pass.code)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to start your video.');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F4F5F2] px-5 py-10 text-[#161918]">
      <section className="w-full max-w-md border border-[#D8DCD7] bg-white p-7 shadow-sm">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#7A1428]">TryFocus · AI Fashion Video</p>
        <h1 className="mt-4 font-serif text-4xl font-semibold">Create your AI fashion video</h1>
        <p className="mt-4 text-base leading-relaxed text-[#535A56]">Use your own garment and photo to create a Diwali portrait, then generate your video privately on this phone. Your session lasts 24 hours.</p>
        {error && <p role="alert" className="mt-5 border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <button type="button" disabled={!code || busy} onClick={start} className="mt-7 min-h-14 w-full bg-[#7A1428] px-5 text-base font-bold text-white disabled:opacity-50">
          {busy ? 'Opening your private session…' : 'Start my video'}
        </button>
        <p className="mt-4 text-center text-xs text-[#535A56]">Show this QR only when the store offers the video experience.</p>
      </section>
    </main>
  );
}

export default function VideoPosterPage() {
  return <Suspense fallback={<main className="min-h-screen bg-[#F4F5F2]" />}><PosterEntry /></Suspense>;
}
