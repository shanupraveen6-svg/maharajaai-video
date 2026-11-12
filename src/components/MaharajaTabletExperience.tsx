'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { fetchCatalogueSettings } from '@/lib/maharaja/catalogue-client';
import TryFocusTvExperience from '@/components/TryFocusTvExperience';

/**
 * The counter page: a store with the tablet gets Try-On at tablet scale, run by the team. AI Video only
 * starts on the TV, so a store without the tablet (a TV-only store) has no counter screen at all.
 */
export default function MaharajaTabletExperience() {
  const [counterTryOn, setCounterTryOn] = useState<boolean | null>(null);
  const [clientName, setClientName] = useState('');

  useEffect(() => {
    let active = true;
    fetchCatalogueSettings()
      .then((settings) => {
        if (!active) return;
        setClientName(settings.clientName || '');
        setCounterTryOn(settings.access ? settings.access.counterTryOn : true);
      })
      .catch(() => { if (active) setCounterTryOn(true); });
    return () => { active = false; };
  }, []);

  if (counterTryOn === null) {
    return <main className="flex min-h-screen items-center justify-center bg-canvas"><LoaderCircle className="h-8 w-8 animate-spin text-muted" /></main>;
  }
  if (counterTryOn) return <TryFocusTvExperience device="tablet" />;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center text-ink">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-xl font-bold text-white">{clientName.replace(/^The\s+/i, '').charAt(0) || 'T'}</span>
      <div>
        <h1 className="text-xl font-bold">No counter screen for this store</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">This store has no tablet booked. AI Video starts on the showroom TV; Try-On is reached from the Wall QR.</p>
      </div>
      <Link href="/maharaja/workspace" className="tf-btn tf-btn-secondary !min-h-11 px-4 text-sm">Open the workspace</Link>
    </main>
  );
}
