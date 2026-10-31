'use client';

import { useState } from 'react';
import { Info, ShieldCheck } from 'lucide-react';

type ConsentKind = 'try-on' | 'video' | 'live' | 'phone-upload';

const SUMMARY: Record<ConsentKind, string> = {
  'try-on': 'By taking or adding a photo you agree that it is sent to our AI partners to create your look. It is not kept after your look is made.',
  video: 'By taking or adding a photo you agree that it is sent to our AI partners to create your festival portrait and video, kept for 1 day, then deleted.',
  live: 'By starting you agree that your camera is streamed to our AI partner for the 60-second live try-on. Nothing is recorded or stored.',
  'phone-upload': 'This photo goes only to the store display you scanned, is sent to our AI partners to create your look, and is deleted from transfer storage once received.',
};

const DETAILS: Record<ConsentKind, string> = {
  'try-on': 'AI partners: GenLook or Fal.ai creates the look; if that fails, Google Gemini creates it once as a backup. Your photo is removed from our storage after the look is made; the result is shown to you and is never put on the store TV.',
  video: 'AI partners: Google Gemini creates the festival portrait and Fal.ai creates the video. Photos and the video are kept for 1 day for you to download, then deleted. Showing a video on the store TV is optional and needs your separate consent.',
  live: 'AI partner: Fal.ai (Lucy live try-on). The live picture exists only during the 60 seconds and is not saved by the store.',
  'phone-upload': 'The photo is used only for this store visit. A parent or guardian must agree for a child.',
};

/**
 * Plain-language notice placed beside every photo or camera step, so no AI processing is hidden.
 * The ⓘ opens the providers and retention; the link opens the full privacy policy.
 */
export default function PhotoConsentNotice({ kind, large = false }: { kind: ConsentKind; large?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border border-[#D8DCD7] bg-[#FAFBF8] text-left text-[#535A56] ${large ? 'p-4 text-base' : 'p-3 text-xs'}`}>
      <p className="flex items-start gap-2">
        <ShieldCheck className={`${large ? 'mt-0.5 h-5 w-5' : 'h-4 w-4'} shrink-0 text-[#256B45]`} />
        <span>
          {SUMMARY[kind]}{' '}
          A parent or guardian must agree for a child.{' '}
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className={`inline-flex items-center gap-1 font-semibold text-[#7A1428] underline ${large ? 'min-h-11' : 'min-h-8'}`}
          >
            <Info className="h-4 w-4" /> Details
          </button>{' '}
          <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-[#7A1428] underline">Privacy</a>
        </span>
      </p>
      {open && <p className="mt-2 border-t border-[#D8DCD7] pt-2">{DETAILS[kind]}</p>}
    </div>
  );
}
