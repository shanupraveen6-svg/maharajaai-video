'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type Look = { sku: string; title: string; imageUrl: string; downloadUrl: string };

export default function PrivateLooksPage() {
  const { token } = useParams<{ token: string }>();
  const [looks, setLooks] = useState<Look[]>([]);
  const [active, setActive] = useState(0);
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`/api/tv/tryon-handoff/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'These looks are unavailable.');
        setLooks(data.looks);
        setExpiresAt(data.expiresAt);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'These looks are unavailable.'));
  }, [token]);

  const current = looks[active];
  return <main className="min-h-screen bg-[#F4F5F2] px-4 py-6 text-[#161918]">
    <div className="mx-auto max-w-xl">
      <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#7A1428]">TryFocus × Maharaja</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold">Your private looks</h1>
      <p className="mt-2 text-sm text-[#535A56]">Choose a look and save it to your phone. This link expires after 15 minutes.</p>
      {error && <p className="mt-6 border border-[#B42318] bg-white p-5 text-[#B42318]">{error}</p>}
      {!error && !current && <p className="mt-8 text-center text-lg">Opening your looks…</p>}
      {current && <>
        <div className="mt-6 overflow-hidden border border-[#D8DCD7] bg-[#161918]">
          <img src={current.imageUrl} alt={current.title} className="max-h-[72vh] w-full object-contain" />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button type="button" onClick={() => setActive((index) => (index - 1 + looks.length) % looks.length)} className="min-h-14 border border-[#161918] bg-white px-5 text-lg font-semibold">←</button>
          <div className="min-w-0 text-center"><p className="font-serif text-xl font-semibold">{current.title}</p><p className="text-sm text-[#535A56]">Look {active + 1} of {looks.length}</p></div>
          <button type="button" onClick={() => setActive((index) => (index + 1) % looks.length)} className="min-h-14 border border-[#161918] bg-white px-5 text-lg font-semibold">→</button>
        </div>
        <a href={current.downloadUrl} className="mt-5 flex min-h-16 items-center justify-center bg-[#7A1428] px-6 text-lg font-bold text-white">Download this look</a>
        {expiresAt && <p className="mt-4 text-center text-xs text-[#535A56]">Available until {new Date(expiresAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</p>}
      </>}
    </div>
  </main>;
}
