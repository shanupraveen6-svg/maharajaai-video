'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Shown when a page breaks while a customer or staff member is on it. Calm, no technical words, and one
 * button that tries the same page again; the cause is logged for us.
 */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Page failed:', error.message, error.digest || '');
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10 text-ink">
      <section className="tf-card w-full max-w-md p-8 text-center">
        <p className="text-xs font-bold tracking-wide text-brand">TRYFOCUS</p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">This screen could not open</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Nothing was used. Please try again; if it happens again, ask our staff.</p>
        <div className="mt-6 flex flex-col gap-3">
          <button type="button" onClick={() => reset()} className="tf-btn tf-btn-primary !min-h-14 w-full text-base">Try again</button>
          <Link href="/" className="tf-btn tf-btn-secondary !min-h-12 w-full text-sm">Go to the start</Link>
        </div>
      </section>
    </main>
  );
}
