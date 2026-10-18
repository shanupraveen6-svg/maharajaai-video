import Link from 'next/link';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#F7F4EC] px-5 py-10 text-[#2A060C]">
      <article className="mx-auto max-w-3xl border border-[#D8C49B] bg-white p-6 shadow-sm md:p-10">
        <p className="text-xs font-bold uppercase text-[#8A1127]">TryFocus · Maharaja AI Experience</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">Terms of Experience</h1>
        <p className="mt-2 text-sm text-[#6B5A51]">Effective 18 October 2026</p>
        <div className="mt-8 space-y-7 text-sm leading-7 text-[#40332D]">
          <section><h2 className="font-serif text-xl font-bold">Purpose</h2><p className="mt-2">This is a promotional visual experience. It does not replace physical fitting, tailoring advice, product inspection or size guidance.</p></section>
          <section><h2 className="font-serif text-xl font-bold">AI limitations</h2><p className="mt-2">Generated media may vary in facial detail, garment drape, colour, accessories, background or motion. Review the result before downloading or approving video generation.</p></section>
          <section><h2 className="font-serif text-xl font-bold">Availability</h2><p className="mt-2">Generation time depends on network conditions and third-party AI capacity. Temporary delays or failures may occur. Duplicate submissions, misuse and attempts beyond the purchased allowance may be limited.</p></section>
          <section><h2 className="font-serif text-xl font-bold">Acceptable use</h2><p className="mt-2">Submit only photographs you are authorised to use. Do not submit unlawful, deceptive, abusive, explicit or confidential third-party content. Children must be supervised by a parent or legal guardian.</p></section>
          <section><h2 className="font-serif text-xl font-bold">Downloads and display</h2><p className="mt-2">Browser downloads depend on device permissions. Showroom display occurs only after Go Live permission. Social promotion requires separate adult permission and is unavailable for child categories during the pilot.</p></section>
        </div>
        <div className="mt-10 flex gap-3 border-t border-[#E2D8C2] pt-6"><Link href="/privacy" className="bg-[#6E0D1F] px-5 py-3 text-xs font-bold uppercase text-[#F3E5AB]">Privacy</Link><Link href="/" className="border border-[#6E0D1F] px-5 py-3 text-xs font-bold uppercase text-[#6E0D1F]">Return</Link></div>
      </article>
    </main>
  );
}
