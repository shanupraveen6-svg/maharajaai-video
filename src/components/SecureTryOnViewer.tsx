'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ShieldAlert, Sparkles, Lock, MoreVertical, Image as ImageIcon } from 'lucide-react';

interface SecureTryOnViewerProps {
  imageUrl: string | null;
  alt?: string;
  onDownloadRequested?: () => void;
  onRetryRequested?: () => void;
  retryUsed?: boolean;
  serviceType?: 'try-on' | 'ai-video';
  allowanceUsed?: number;
  allowanceMax?: number;
}

export default function SecureTryOnViewer({
  imageUrl,
  alt = 'Maharaja AI Try-On',
  onRetryRequested,
  retryUsed = false,
  serviceType = 'try-on',
  allowanceUsed,
  allowanceMax = 2,
}: SecureTryOnViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isBlackout, setIsBlackout] = useState(false);
  const [blackoutReason, setBlackoutReason] = useState<string>('');
  const [showMenu, setShowMenu] = useState(false);

  const used = typeof allowanceUsed === 'number' ? allowanceUsed : (retryUsed ? 2 : 1);
  const max = allowanceMax || 2;
  const isExhausted = used >= max;
  const serviceLabel = serviceType === 'try-on' ? 'AI Try-On' : 'Celebration Image';

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
    // 1. Detect Window Blur (only when truly blurred/switched away, and auto-resume on return)
    const handleBlur = () => {
      // Avoid false-positive blackouts when focusing inputs or opening native file picker
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'BUTTON')) {
        return;
      }
      triggerBlackout('Screen capture or window blur detected.');
    };

    const handleFocus = () => {
      resumeFromBlackout();
    };

    // 2. Detect Page Visibility Change (triggered when OS screenshot overlay or app switcher activates)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        triggerBlackout('Backgrounded or capture tool opened.');
      } else if (document.visibilityState === 'visible') {
        resumeFromBlackout();
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
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('beforeprint', handleBeforePrint);

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('beforeprint', handleBeforePrint);
    };
  }, [triggerBlackout, resumeFromBlackout]);

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
          referrerPolicy="no-referrer"
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

      {/* Top-Right Three-Dot Options Menu */}
      {imageUrl && !isBlackout && onRetryRequested && (
        <div className="absolute top-3 right-3 z-30">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu((prev) => !prev);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-[#D4AF37] border border-[#D4AF37]/50 backdrop-blur-sm hover:bg-black/85 transition"
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
              <div className="absolute right-0 top-9 z-50 w-60 rounded-lg border border-[#D4AF37]/60 bg-[#170203]/95 p-2 shadow-2xl backdrop-blur-md text-left space-y-2">
                <div className="px-2 py-1 border-b border-[#D4AF37]/20 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#D4AF37]">
                  <span>{serviceLabel}</span>
                  <span className="font-mono text-[10px] text-[#F3E5AB]">{used}/{max}</span>
                </div>

                {!isExhausted ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      onRetryRequested();
                    }}
                    className="w-full flex items-start gap-2.5 rounded-md px-2.5 py-2 text-xs font-semibold text-[#F3E5AB] hover:bg-[#6e0d1f]/60 hover:text-white transition"
                  >
                    <ImageIcon className="h-4 w-4 text-[#D4AF37] mt-0.5 shrink-0" />
                    <div>
                      <div className="font-bold">Retry Image</div>
                      <div className="text-[10px] text-gray-300 font-normal">Re-upload photos & generate again ({max - used} retry left)</div>
                    </div>
                  </button>
                ) : (
                  <div className="px-2 py-2 text-[11px] text-[#F3E5AB]/75 rounded bg-black/40 border border-red-500/30">
                    <div className="font-bold text-red-400">{serviceLabel} Limit Reached</div>
                    <div className="text-[10px] text-zinc-300 mt-0.5">Maximum {max}/{max} generations used. Retries are exhausted for this mobile pass.</div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
