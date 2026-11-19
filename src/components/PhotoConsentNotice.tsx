'use client';

import { useState } from 'react';
import { Info, ShieldCheck } from 'lucide-react';

type ConsentKind = 'try-on' | 'video' | 'live' | 'phone-upload';

const SUMMARY: Record<ConsentKind, string> = {
  'try-on': 'By taking or adding a photo you agree that it is sent to our AI partners to create your look. It is not kept after your look is made.',
  video: 'By taking or adding a photo you agree that it is sent to our AI partners to create your festival portrait and video, kept for 1 hour, then deleted.',
  live: 'By starting you agree that your camera is streamed to our AI partner for each 30-second live try-on. The videos play back on this screen only and are deleted when you end the session.',
  'phone-upload': 'This photo goes only to the store display you scanned, is sent to our AI partners to create your look, and is deleted from transfer storage once received.',
};

const DETAILS: Record<ConsentKind, string> = {
  'try-on': 'AI partners: GenLook creates the look; if it fails, Google Gemini is the backup. Your photo is removed from our storage after the look is made; the result is shown to you and is never put on the store TV.',
  video: 'AI partners: Google Gemini creates the festival portrait and a video service on Fal.ai creates the video (the next one is used if one fails). Photos and the video are kept for 1 hour for you to download, then deleted. Showing a video on the store’s Go Live screen is optional, needs your separate consent, and keeps it for 1 day.',
  live: 'AI partner: Fal.ai (Lucy live try-on). The TV records each 30-second session in its own browser so you can watch it back right away. Nothing is uploaded or kept: the videos are deleted when you end the session.',
  'phone-upload': 'The photo is used only for this store visit. A parent or guardian must agree for a child.',
};

/**
 * Plain-language notice placed beside every photo or camera step, so no AI processing is hidden.
 * The ⓘ opens the providers and retention; the link opens the full privacy policy.
 */
export default function PhotoConsentNotice({ kind, large = false, kiosk = false }: { kind: ConsentKind; large?: boolean; /** Shared store screen: no Privacy link (a new tab would leave the kiosk); Details opens in place. */ kiosk?: boolean }) {
  const [open, setOpen] = useState(false);

  if (kind === 'live' && kiosk) {
    return (
      <div className="text-left">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-2.5 shadow-sm">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <ShieldCheck className="h-6 w-6 shrink-0 text-success" aria-hidden="true" />
            <p className="min-w-0 flex-1 truncate whitespace-nowrap text-sm font-medium text-muted">
              By starting, you agree to live AI camera try-on · deleted after session.
            </p>
          </div>
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? 'Hide Live Try-On privacy details' : 'Show Live Try-On privacy details'}
            onClick={() => setOpen((value) => !value)}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition ${open ? 'border-ink bg-ink text-white' : 'border-line-strong bg-canvas text-ink hover:border-ink'}`}
          >
            <Info className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
        {open && (
          <div className="mt-2.5 space-y-2 rounded-2xl border border-line bg-white p-4 text-sm leading-relaxed text-muted shadow-sm">
            <p>
              By starting, you agree that your camera is streamed to our AI partner (Fal.ai · Lucy live try-on) for each 30-second live try-on.
            </p>
            <p>
              Videos play back on this screen only and are deleted as soon as you end the session — nothing is uploaded or kept.
            </p>
            <p>
              A parent or guardian must approve before starting for a child.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`text-left leading-relaxed text-muted ${large ? 'text-base' : 'text-[13px]'}`}>
      <p className="flex items-start gap-2">
        <ShieldCheck className={`${large ? 'mt-0.5 h-5 w-5': 'h-4 w-4'} shrink-0 text-success`} />
        <span>
          {SUMMARY[kind]}{' '}
          A parent or guardian must agree for a child.{' '}
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className={kiosk
              ? 'tv-pill ml-1 inline-flex min-h-14 items-center gap-2 rounded-xl border border-line-strong bg-white px-4 align-middle font-semibold text-ink'
              : 'inline-flex items-center gap-1 align-baseline font-semibold text-brand underline underline-offset-2'}
          >
            <Info className={kiosk ? 'h-5 w-5' : 'h-3.5 w-3.5 self-center'} /> Details
          </button>{' '}
          {!kiosk && <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-brand underline underline-offset-2">Privacy</a>}
        </span>
      </p>
      {open && <p className="mt-2 rounded-xl bg-white p-3">{DETAILS[kind]}</p>}
    </div>
  );
}
