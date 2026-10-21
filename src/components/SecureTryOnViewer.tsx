'use client';

import React, { useState } from 'react';
import { Sparkles, MoreVertical, RotateCcw } from 'lucide-react';

interface SecureTryOnViewerProps {
  imageUrl: string | null;
  alt?: string;
  onDownloadRequested?: () => void;
  onRetryRequested?: () => void;
  retryUsed?: boolean;
  serviceType?: 'try-on' | 'ai-video';
  allowanceUsed?: number;
  allowanceMax?: number;
  enforceRepeatLimits?: boolean;
}

export default function SecureTryOnViewer({
  imageUrl,
  alt = 'Maharaja AI Try-On',
  onRetryRequested,
  retryUsed = false,
  serviceType = 'try-on',
  allowanceUsed,
  allowanceMax = 2,
  enforceRepeatLimits = true,
}: SecureTryOnViewerProps) {
  const [showMenu, setShowMenu] = useState(false);

  const used = typeof allowanceUsed === 'number' ? allowanceUsed : (retryUsed ? 2 : 1);
  const max = allowanceMax || 2;
  const isExhausted = enforceRepeatLimits ? used >= max : false;
  const serviceLabel = serviceType === 'try-on' ? 'AI Try-On' : 'Celebration Image';

  return (
    <div className="relative aspect-[9/16] w-full overflow-hidden bg-black">
      {/* Signed Storage URLs render directly; canvas CORS can otherwise leave the preview blank. */}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={alt}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-[#F3E5AB]/45">
          <Sparkles className="h-12 w-12" />
          <span className="text-xs font-bold uppercase">AI result preview</span>
        </div>
      )}

      {/* Top-Right Client Logo */}
      {imageUrl && (
        <div className="pointer-events-none absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-full border border-[#D4AF37]/50 bg-black/60 px-2 py-1 backdrop-blur-sm shadow-md">
          <img src="/maharaja-logo.png" alt="Maharaja Silks" className="h-4 w-4 rounded-full object-contain" />
          <span className="text-[10px] font-bold tracking-wider uppercase text-[#F3E5AB]">Maharaja</span>
        </div>
      )}

      {/* Top-Left Three-Dot Options Menu */}
      {imageUrl && onRetryRequested && (
        <div className="absolute top-3 left-3 z-30">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu((prev) => !prev);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-[#D4AF37] border border-[#D4AF37]/50 backdrop-blur-sm hover:bg-black/85 transition shadow-md"
            title="Options"
            aria-label="Options"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-40 cursor-default"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                }}
              />
              <div className="absolute left-0 top-9 z-50 w-44 rounded-lg border border-[#D4AF37]/60 bg-[#170203]/95 p-1.5 shadow-2xl backdrop-blur-md text-left animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onRetryRequested();
                  }}
                  className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-xs font-bold text-[#F3E5AB] hover:bg-[#6e0d1f] hover:text-white transition"
                >
                  <RotateCcw className="h-4 w-4 text-[#D4AF37] shrink-0" />
                  <span>Retry</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
