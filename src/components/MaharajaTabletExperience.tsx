'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { fetchCatalogueSettings } from '@/lib/maharaja/catalogue-client';
import TabletVideoHandoff from '@/components/TabletVideoHandoff';
import TryFocusTvExperience from '@/components/TryFocusTvExperience';

/**
 * The counter page. A store with the tablet gets the same Try-On and AI Video flow as the TV, at tablet
 * scale, plus the biller's AI Video gift QR. Without the tablet (a TV-only store) this page is the
 * biller's AI Video gift QR only, on a phone or a computer.
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
    <main className="tablet-workspace min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">{clientName.replace(/^The\s+/i, '').charAt(0) || 'T'}</span>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold">{clientName}</h1>
              <p className="text-sm text-muted">Billing counter</p>
            </div>
          </div>
          <Link href="/maharaja/workspace" className="flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-muted hover:text-ink">Workspace</Link>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-6 py-6">
        <TabletVideoHandoff />
      </div>
    </main>
  );
}
