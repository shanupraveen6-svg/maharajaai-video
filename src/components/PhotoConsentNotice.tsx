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
  'try-on': 'AI partners: GenLook, Fal.ai or FASHN creates the look; if one fails, the next is used, with Google Gemini as the last backup. Your photo is removed from our storage after the look is made; the result is shown to you and is never put on the store TV.',
  video: 'AI partners: Google Gemini creates the festival portrait and a video service on Fal.ai creates the video (the next one is used if one fails). Photos and the video are kept for 1 hour for you to download, then deleted. Showing a video on the store’s Go Live screen is optional, needs your separate consent, and keeps it for 1 day.',
  live: 'AI partner: Fal.ai (Lucy live try-on). The TV records each 30-second session in its own browser so you can watch it back right away. Nothing is uploaded or kept: the videos are deleted when you end the session.',
  'phone-upload': 'The photo is used only for this store visit. A parent or guardian must agree for a child.',
};

/**
 * Plain-language notice placed beside every photo or camera step, so no AI processing is hidden.
 * The ⓘ opens the providers and retention; the link opens the full privacy policy.
 */
export default function PhotoConsentNotice({ kind, large = false }: { kind: ConsentKind; large?: boolean }) {
  const [open, setOpen] = useState(false);
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
            className="inline-flex items-center gap-1 align-baseline font-semibold text-brand underline underline-offset-2"
          >
            <Info className="h-3.5 w-3.5 self-center" /> Details
          </button>{' '}
          <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-brand underline underline-offset-2">Privacy</a>
        </span>
      </p>
      {open && <p className="mt-2 rounded-xl bg-white p-3">{DETAILS[kind]}</p>}
    </div>
  );
}
