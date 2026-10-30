'use client';

import { useParams } from 'next/navigation';
import TabletVideoHandoff from '@/components/TabletVideoHandoff';

export default function MaharajaBillingPage() {
  const params = useParams<{ billingCode: string }>();
  const billingCode = params?.billingCode || '';

  return (
    <main className="min-h-screen bg-[#F4F5F2] text-[#161918]">
      <header className="border-b border-[#D8DCD7] bg-[#F4F5F2]/95">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-8">
          <span className="flex h-10 w-10 items-center justify-center border border-[#161918] bg-[#161918] font-mono text-xs font-bold tracking-widest text-[#FAF6EE]">
            TF
          </span>
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7A1428]">
              TryFocus · Bill Counter
            </p>
            <h1 className="font-serif text-xl font-semibold text-[#161918]">AI Video QR for customers</h1>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
        <TabletVideoHandoff billingCode={billingCode} />
      </div>
    </main>
  );
}
