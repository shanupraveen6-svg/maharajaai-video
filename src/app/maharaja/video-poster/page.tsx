/**
 * Older printed AI Video posters land here. AI Video now starts only on the showroom TV, one portrait per
 * customer, so this page points the customer there instead of opening a session.
 */
export default function VideoPosterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10 text-ink">
      <section className="w-full max-w-md rounded-2xl border border-line bg-white p-7">
        <h1 className="text-3xl font-bold">Ask for AI Video at the showroom TV</h1>
        <p className="mt-3 text-base text-muted">
          Each AI Video starts on the showroom TV, made for one customer at a time, and hands off to your
          own phone for the video.
        </p>
      </section>
    </main>
  );
}
