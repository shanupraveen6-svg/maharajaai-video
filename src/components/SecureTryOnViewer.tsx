'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ShieldAlert, Sparkles, Lock } from 'lucide-react';

interface SecureTryOnViewerProps {
  imageUrl: string | null;
  alt?: string;
  onDownloadRequested?: () => void;
}

export default function SecureTryOnViewer({ imageUrl, alt = 'Maharaja AI Try-On' }: SecureTryOnViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isBlackout, setIsBlackout] = useState(false);
  const [blackoutReason, setBlackoutReason] = useState<string>('');

  const triggerBlackout = useCallback((reason: string) => {
    setIsBlackout(true);
    setBlackoutReason(reason);
  }, []);

  const resumeFromBlackout = useCallback(() => {
    setIsBlackout(false);
    setBlackoutReason('');
  }, []);

  // Anti-Screenshot Event Listeners
  useEffect(() => {
    // 1. Detect Window Blur (triggered immediately when iOS / Android screenshot or swipe starts)
    const handleBlur = () => {
      triggerBlackout('Screen capture or window blur detected.');
    };

    // 2. Detect Page Visibility Change (triggered when OS screenshot overlay or app switcher activates)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        triggerBlackout('Backgrounded or capture tool opened.');
      }
    };

    // 3. Detect Keyboard Screenshot Shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // PrintScreen key
      if (e.key === 'PrintScreen' || e.keyCode === 44) {
        e.preventDefault();
        triggerBlackout('PrintScreen shortcut blocked.');
        return;
      }
      // macOS: Cmd + Shift + 3, Cmd + Shift + 4, Cmd + Shift + 5
      if (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5')) {
        e.preventDefault();
        triggerBlackout('macOS screenshot shortcut blocked.');
        return;
      }
      // Windows Snipping Tool: Win + Shift + S or Ctrl + Shift + S
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        triggerBlackout('Snipping tool shortcut blocked.');
        return;
      }
      // Print dialog: Cmd + P or Ctrl + P
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        triggerBlackout('Printing is disabled for protected assets.');
        return;
      }
    };

    // 4. Print Event Listeners
    const handleBeforePrint = () => {
      triggerBlackout('Printing is blocked.');
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('beforeprint', handleBeforePrint);

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('beforeprint', handleBeforePrint);
    };
  }, [triggerBlackout]);

  return (
    <div
      ref={containerRef}
      onContextMenu={(e) => e.preventDefault()}
      className="relative aspect-[9/16] w-full overflow-hidden bg-black select-none"
      style={{
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      {/* Pitch-Black Screen Overlay on Screenshot / Blur Detection */}
      {isBlackout && (
        <div
          id="anti-screenshot-blackout"
          onClick={resumeFromBlackout}
          className="absolute inset-0 z-50 flex cursor-pointer flex-col items-center justify-center bg-black p-5 text-center text-white"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-950/80 border border-red-500/50 text-red-400 mb-3">
            <Lock className="h-7 w-7" />
          </div>
          <p className="font-serif text-lg font-bold text-[#F3E5AB]">Screenshots Disabled</p>
          <p className="mt-2 text-xs leading-5 text-zinc-400 max-w-xs">
            To protect Maharaja campaign fashion designs, screenshots are blocked and captured as black.
          </p>
          <p className="mt-2 text-[11px] text-amber-300 font-semibold">
            Use the official &quot;Download Try-On&quot; button below for your HD photo.
          </p>
          <button
            type="button"
            onClick={resumeFromBlackout}
            className="mt-4 rounded border border-[#D4AF37] bg-[#D4AF37]/20 px-4 py-2 text-xs font-bold uppercase text-[#F3E5AB] hover:bg-[#D4AF37]/30"
          >
            Tap to Resume View
          </button>
        </div>
      )}

      {/* Signed Storage URLs render directly; canvas CORS can otherwise leave the preview blank. */}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={alt}
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          className="h-full w-full object-cover pointer-events-none select-none"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-[#F3E5AB]/45">
          <Sparkles className="h-12 w-12" />
          <span className="text-xs font-bold uppercase">AI result preview</span>
        </div>
      )}

      {/* Discreet Security Badge Overlay */}
      {imageUrl && !isBlackout && (
        <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-[#F3E5AB] backdrop-blur-sm border border-[#D4AF37]/30">
          <ShieldAlert className="h-3 w-3 text-[#D4AF37]" />
          Protected Preview
        </div>
      )}
    </div>
  );
}
