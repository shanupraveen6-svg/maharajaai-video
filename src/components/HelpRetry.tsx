'use client';

import { useEffect, useState } from 'react';
import { CircleHelp, LoaderCircle, RotateCcw, X } from 'lucide-react';

export type HelpRetryText = {
  /** The header button. */
  help: string;
  /** "Do you need to retry this image?" */
  question: string;
  /** What the retry does, in one line ("We make it again once, free, from a new photo."). */
  retryText: string;
  /** Shown instead of the question when the retry is used up or not offered here. */
  noRetryTitle: string;
  noRetryText: string;
  tipsTitle: string;
  tips: string[];
  yes: string;
  cancel: string;
  close: string;
};

export const HELP_RETRY_EN = {
  help: 'Help',
  yes: 'Yes, retry',
  cancel: 'Cancel',
  close: 'Close',
  tipsTitle: 'For the best result',
  noRetryTitle: 'Need help?',
};

/** English wording per result; the phone passes its own language. */
export const HELP_TEXT = {
  image: {
    ...HELP_RETRY_EN,
    question: 'Do you need to retry this image?',
    retryText: 'You have one more try, free. We start again from your photo.',
    noRetryText: 'Your free retry has been used. Our staff can help you at the counter.',
    tips: ['A full-length photo, not a selfie.', 'Good light, facing the camera.', 'One garment at a time, the whole piece in the frame.'],
  },
  looks: {
    ...HELP_RETRY_EN,
    question: 'Do you need to retry these looks?',
    retryText: 'We start again: Who, your photo and the outfits.',
    noRetryText: 'Our staff can help you at the counter.',
    tips: ['A full-length photo, not a selfie.', 'Good light, facing the camera.', 'Stand straight, arms a little away from the body.'],
  },
  portrait: {
    ...HELP_RETRY_EN,
    question: 'Do you need to retry this portrait?',
    retryText: 'We make it once more with the same piece, from a new photo.',
    noRetryText: 'Your portrait retry has been used. Our staff can help you at the counter.',
    tips: ['A full-length photo, not a selfie.', 'Good light, facing the camera.', 'Nothing covering the face.'],
  },
  video: {
    ...HELP_RETRY_EN,
    question: 'Do you need to retry this video?',
    retryText: 'We make the video once more from the same portrait. It takes about two minutes.',
    noRetryText: 'Your video retry has been used. Our staff can help you at the counter.',
    tips: ['The video follows your portrait.', 'Keep this page open while it is made.', 'Download it before you leave the store.'],
  },
} satisfies Record<string, HelpRetryText>;

/**
 * The Help button in a result's header, in place of a ⋯ menu. It opens one question, "Do you need to
 * retry this image / video?", with Yes, retry and Cancel, the one line on what the retry does and the
 * tips for a better photo. With no retry left (or none here) it shows the tips and who can help.
 * `extra` adds one more choice under the question (on the TV: Choose another piece).
 */
export default function HelpRetry({
  text,
  canRetry,
  onRetry,
  busy = false,
  size = 'phone',
  extra,
}: {
  text: HelpRetryText;
  canRetry: boolean;
  onRetry: () => void;
  busy?: boolean;
  size?: 'phone' | 'tv';
  extra?: { label: string; onClick: () => void };
}) {
  const [open, setOpen] = useState(false);
  const tv = size === 'tv';

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={tv
          ? 'flex min-h-16 shrink-0 items-center gap-2 rounded-xl border border-line-strong bg-white px-5 text-lg font-semibold text-ink'
          : 'flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line-strong bg-white px-3 text-sm font-semibold text-ink'}
      >
        <CircleHelp className={tv ? 'h-6 w-6' : 'h-4 w-4'} /> {text.help}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-retry-title"
          onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
        >
          <div className={`w-full rounded-t-3xl bg-white text-ink shadow-2xl sm:rounded-3xl ${tv ? 'max-w-xl p-8' : 'max-w-md p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="help-retry-title" className={tv ? 'text-3xl font-bold' : 'text-2xl font-bold'}>{canRetry ? text.question : text.noRetryTitle}</h2>
                <p className={`mt-1 text-muted ${tv ? 'text-lg' : 'text-[15px]'}`}>{canRetry ? text.retryText : text.noRetryText}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={text.close} className={`flex shrink-0 items-center justify-center rounded-xl border border-line-strong ${tv ? 'h-16 w-16' : 'h-11 w-11'}`}><X className={tv ? 'h-6 w-6' : 'h-5 w-5'} /></button>
            </div>

            <div className={`mt-4 rounded-2xl bg-canvas ${tv ? 'p-5' : 'p-4'}`}>
              <p className={`font-semibold ${tv ? 'text-lg' : 'text-sm'}`}>{text.tipsTitle}</p>
              <ul className={`mt-1.5 list-disc space-y-1 pl-5 text-muted ${tv ? 'text-lg' : 'text-sm'}`}>
                {text.tips.map((tip) => <li key={tip}>{tip}</li>)}
              </ul>
            </div>

            <div className={`mt-5 grid gap-2 ${canRetry ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {canRetry ? (
                <>
                  <button type="button" onClick={() => setOpen(false)} className={`tf-btn tf-btn-secondary w-full ${tv ? '!min-h-16 text-lg' : '!min-h-12 text-base'}`}>{text.cancel}</button>
                  <button type="button" disabled={busy} onClick={() => { setOpen(false); onRetry(); }} className={`tf-btn tf-btn-primary w-full ${tv ? '!min-h-16 text-lg' : '!min-h-12 text-base'}`}>
                    {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <RotateCcw className="h-5 w-5" />} {text.yes}
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setOpen(false)} className={`tf-btn tf-btn-secondary w-full ${tv ? '!min-h-16 text-lg' : '!min-h-12 text-base'}`}>{text.close}</button>
              )}
            </div>
            {extra && (
              <button type="button" onClick={() => { setOpen(false); extra.onClick(); }} className={`mt-3 w-full text-center font-semibold text-muted underline underline-offset-4 hover:text-ink ${tv ? 'min-h-16 text-lg' : 'min-h-11 text-sm'}`}>{extra.label}</button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
