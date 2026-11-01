/**
 * Older printed AI Video posters land here. AI Video QRs now come only from the billing counter, one per
 * customer, so this page points the customer there instead of opening a session.
 */
export default function VideoPosterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10 text-ink">
      <section className="w-full max-w-md rounded-2xl border border-line bg-white p-7">
        <h1 className="text-3xl font-bold">Ask the billing counter for your AI Video QR</h1>
        <p className="mt-3 text-base text-muted">
          Each AI Video QR is made for one customer at the billing counter and works for 1 day on your phone.
        </p>
      </section>
    </main>
  );
}
