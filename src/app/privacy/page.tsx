import Link from 'next/link';

const privacyEmail = process.env.NEXT_PUBLIC_PRIVACY_EMAIL || 'privacy@tryfocus.in';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#F7F4EC] px-5 py-10 text-[#2A060C]">
      <article className="mx-auto max-w-3xl border border-[#D8C49B] bg-white p-6 shadow-sm md:p-10">
        <p className="text-xs font-bold uppercase text-[#8A1127]">TryFocus Fashion Marketing Platform · Maharaja Client Experience</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">Privacy &amp; Data Use</h1>
        <p className="mt-2 text-sm text-[#6B5A51]">Effective 25 October 2026 · Policy version 2026-10-privacy-v2</p>
        <div className="mt-8 space-y-7 text-sm leading-7 text-[#40332D]">
          <section><h2 className="font-serif text-xl font-bold text-[#2A060C]">What we process</h2><p className="mt-2">Depending on the experience, we process person and garment photographs, generated media, purchase tier, event selection, session identifiers, and limited details supplied for delivery or showroom playback.</p></section>
          <section><h2 className="font-serif text-xl font-bold text-[#2A060C]">AI Try-On</h2><p className="mt-2">One person and one garment photo are sent to Fal.ai for the first Try-On. An included customer retry may use up to three garment photos with Google Gemini. The service does not silently switch providers after a failed request. Source photographs are removed from Maharaja storage after successful generation; provider processing and retention follow the provider&apos;s terms. The result is returned to the browser for viewing and download. It is not added to the showroom TV or promotional library.</p></section>
          <section><h2 className="font-serif text-xl font-bold text-[#2A060C]">AI Video</h2><p className="mt-2">Video source media and generated results are temporarily retained to complete rendering, delivery and support. Go Live media expires within three days. AI Video Gift Link media expires within four days and is never added to the showroom or promotional library.</p></section>
          <section><h2 className="font-serif text-xl font-bold text-[#2A060C]">Showroom and promotion</h2><p className="mt-2">Showroom-TV display requires affirmative Go Live permission. Social-media promotion is a separate optional choice. A parent or legal guardian must provide both the child Go Live confirmation and the optional promotion choice for Girl and Boy categories. Closing the dialog or leaving the promotion choice unchecked means permission was not granted.</p></section>
          <section><h2 className="font-serif text-xl font-bold text-[#2A060C]">Service providers</h2><p className="mt-2">The experience uses Fal.ai for first Try-On images and AI Video, Google Gemini for festival images and eligible Try-On retries, Firebase for secured processing and storage, and Vercel for application delivery. These services process data as required to provide the experience under their applicable service and data-processing terms.</p></section>
          <section><h2 className="font-serif text-xl font-bold text-[#2A060C]">Information that may remain</h2><p className="mt-2">After personal media deletion, non-identifying operational records may remain, including date, event, purchase tier, approximate garment value, success or failure, processing time, downloads and Go Live counts. These support security, billing and service improvement.</p></section>
          <section><h2 className="font-serif text-xl font-bold text-[#2A060C]">Your choices</h2><p className="mt-2">You may decline Go Live, decline promotion, withdraw optional promotional permission, or request early deletion. Contact <a className="font-semibold text-[#6E0D1F] underline" href={`mailto:${privacyEmail}`}>{privacyEmail}</a> with the billing phone number and last four bill digits so the request can be verified.</p></section>
          <section><h2 className="font-serif text-xl font-bold text-[#2A060C]">Security and contact</h2><p className="mt-2">Access controls, signed media links, rate limits and audit records protect the service. No internet service can promise absolute security. Privacy questions and grievances may be sent to <a className="font-semibold text-[#6E0D1F] underline" href={`mailto:${privacyEmail}`}>{privacyEmail}</a>. Maharaja must confirm its designated grievance contact before public launch.</p></section>
        </div>
        <div className="mt-10 flex gap-3 border-t border-[#E2D8C2] pt-6"><Link href="/" className="bg-[#6E0D1F] px-5 py-3 text-xs font-bold uppercase text-[#F3E5AB]">Return</Link><Link href="/terms" className="border border-[#6E0D1F] px-5 py-3 text-xs font-bold uppercase text-[#6E0D1F]">Terms</Link></div>
      </article>
    </main>
  );
}
