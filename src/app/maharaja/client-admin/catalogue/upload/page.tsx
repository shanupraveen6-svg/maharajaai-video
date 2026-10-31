import Link from 'next/link';
import CatalogueBulkImport from '@/components/CatalogueBulkImport';

export default function CatalogueUploadPage() {
  return <main className="min-h-screen bg-[#F4F5F2] px-5 py-8 text-ink md:px-10">
    <div className="mx-auto max-w-5xl">
      <Link href="/maharaja/client-admin" className="rounded-xl inline-flex min-h-12 items-center border border-ink bg-white px-5 text-sm font-bold">← Back to Maharaja admin</Link>
      <p className="mt-8 text-sm font-bold text-brand">The Majestic Maharaja · Catalogue</p>
      <h1 className="mt-2 text-4xl font-bold">Upload garments by category</h1>
      <p className="mt-2 max-w-2xl text-base text-muted">Choose Women, Men, Boys or Girls, pick the category, then upload a batch. You approve the titles before any garment is published.</p>
      <CatalogueBulkImport />
    </div>
  </main>;
}
