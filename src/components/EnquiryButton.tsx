'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, Phone, X } from 'lucide-react';

const MODULES = ['Image Try-On', 'Live AI Try-On', 'AI Video', 'TV Standee'];

/**
 * A button that opens a short enquiry form. The enquiry is saved for TryFocus admin and emailed to
 * TryFocus support, so interest from pricing, demo and "add credits" buttons is never lost.
 */
export default function EnquiryButton({
  interest,
  source,
  className,
  children,
  storeName = '',
  modules = [],
}: {
  interest: string;
  source: string;
  className: string;
  children: ReactNode;
  storeName?: string;
  modules?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<string[]>(modules);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSending(true);
    setError('');
    try {
      const response = await fetch('/api/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          phone: form.get('phone'),
          storeName: form.get('storeName'),
          city: form.get('city'),
          message: form.get('message'),
          website: form.get('website'),
          modules: picked,
          interest,
          source,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not send. Please call 9994837342.');
      setSent(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not send. Please call 9994837342.');
    } finally {
      setSending(false);
    }
  }

  function close() {
    setOpen(false);
    setSent(false);
    setError('');
  }

  const field = 'min-h-11 w-full border border-[#D8DCD7] bg-white px-3 text-sm text-[#161918] outline-none focus:border-[#7A1428]';

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>{children}</button>
      {open && createPortal(
        <div role="dialog" aria-modal="true" aria-labelledby="enquiry-title" className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={close}>
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto bg-white p-5 text-left shadow-xl sm:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7A1428]">TryFocus</p>
                <h2 id="enquiry-title" className="mt-1 text-xl font-black text-[#161918]">{interest}</h2>
              </div>
              <button type="button" aria-label="Close" onClick={close} className="flex h-10 w-10 items-center justify-center text-[#535A56]"><X className="h-5 w-5" /></button>
            </div>
            {sent ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-[#256B45]" />
                <p className="mt-3 font-black text-[#161918]">Thank you. We will call you shortly.</p>
                <p className="mt-1 text-sm text-[#535A56]">Need it sooner? Call <a href="tel:9994837342" className="font-bold text-[#7A1428]">9994837342</a></p>
                <button type="button" onClick={close} className="mt-5 min-h-11 bg-[#161918] px-5 text-xs font-bold uppercase tracking-wider text-white">Close</button>
              </div>
            ) : (
              <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-3">
                <input name="name" required minLength={2} maxLength={80} autoComplete="name" placeholder="Your name *" className={field} />
                <input name="phone" required type="tel" inputMode="tel" maxLength={14} autoComplete="tel" placeholder="Mobile number *" className={field} />
                <input name="storeName" required minLength={2} maxLength={120} defaultValue={storeName} autoComplete="organization" placeholder="Store / brand name *" className={field} />
                <input name="city" maxLength={80} autoComplete="address-level2" placeholder="City" className={field} />
                <fieldset>
                  <legend className="text-xs font-bold uppercase tracking-wider text-[#535A56]">Interested in</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {MODULES.map((module) => (
                      <label key={module} className="flex min-h-10 items-center gap-2 border border-[#D8DCD7] px-2 text-sm">
                        <input
                          type="checkbox"
                          checked={picked.includes(module)}
                          onChange={(event) => setPicked((current) => event.target.checked ? [...current, module] : current.filter((item) => item !== module))}
                        />
                        {module}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <textarea name="message" maxLength={1000} rows={3} placeholder="Anything we should know? (optional)" className={`${field} py-2`} />
                <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
                {error && <p role="alert" className="text-sm font-semibold text-[#B42318]">{error}</p>}
                <button type="submit" disabled={sending} className="flex min-h-12 w-full items-center justify-center gap-2 bg-[#7A1428] text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">
                  {sending && <Loader2 className="h-4 w-4 animate-spin" />} Send request
                </button>
                <p className="text-xs text-[#535A56]">We use these details only to contact you about TryFocus. Or call <a href="tel:9994837342" className="inline-flex items-center gap-1 font-bold text-[#7A1428]"><Phone className="h-3 w-3" />9994837342</a></p>
              </form>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
