import Link from 'next/link';

/** A link that leads nowhere (a mistyped address, an old QR): a calm page with a way back. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10 text-ink">
      <section className="tf-card w-full max-w-md p-8 text-center">
        <p className="text-xs font-bold tracking-wide text-brand">TRYFOCUS</p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">This page does not exist</h1>
        <p className="mt-3 text-sm leading-6 text-muted">The link may be old or mistyped. If you scanned a QR, ask our staff for a fresh one.</p>
        <Link href="/" className="tf-btn tf-btn-primary !min-h-14 mt-6 w-full text-base">Go to the start</Link>
      </section>
    </main>
  );
}
