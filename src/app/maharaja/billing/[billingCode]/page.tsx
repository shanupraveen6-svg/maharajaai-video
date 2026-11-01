'use client';

import { useParams } from 'next/navigation';
import TabletVideoHandoff from '@/components/TabletVideoHandoff';

export default function MaharajaBillingPage() {
  const params = useParams<{ billingCode: string }>();
  const billingCode = params?.billingCode || '';

  return (
    <main className="min-h-screen bg-[#F4F5F2] text-ink">
      <header className="border-b border-line bg-[#F4F5F2]/95">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-8">
          <span className="flex h-10 w-10 items-center justify-center border border-ink bg-ink tabular-nums text-xs font-bold text-[#FAF6EE]">
            TF
          </span>
          <div>
            <h1 className="text-xl font-bold text-ink">AI Video gift</h1>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
        <TabletVideoHandoff billingCode={billingCode} />
      </div>
    </main>
  );
}
