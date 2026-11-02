'use client';

import { useEffect, useRef, useState } from 'react';
import { usePhoneLanguage } from '@/lib/tryfocus/phone-language';

/**
 * Stops a customer leaving a phone page by accident. The phone's back button first runs `onBack`
 * (go to the previous step) when it returns true; otherwise it asks "Are you sure you want to exit?"
 * with Continue and Exit. Closing or reloading the page while `protect` is on shows the browser's own
 * leave warning (browsers do not allow custom text there).
 */
export function useExitGuard({ onBack, protect = true, what = 'tryOn' }: {
  /** Handles back inside the page; return true when it moved to a previous step. */
  onBack?: () => boolean;
  /** Whether closing or reloading should warn (for example once a photo is taken). */
  protect?: boolean;
  what?: 'tryOn' | 'video';
}) {
  const { t } = usePhoneLanguage();
  const [open, setOpen] = useState(false);
  const onBackRef = useRef(onBack);
  const leavingRef = useRef(false);
  useEffect(() => { onBackRef.current = onBack; }, [onBack]);

  // One extra history entry absorbs the back button, so the page decides what back means. It carries
  // Next.js's own history state, so the router treats it as this page and never reloads.
  useEffect(() => {
    const guard = () => window.history.pushState({ ...(window.history.state || {}), tryfocusGuard: true }, '');
    guard();
    const handlePop = () => {
      if (leavingRef.current) return;
      guard();
      if (onBackRef.current?.()) return;
      setOpen(true);
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  useEffect(() => {
    if (!protect) return;
    const handleUnload = (event: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [protect]);

  function exit() {
    leavingRef.current = true;
    setOpen(false);
    // Two entries back: past the guard entry to the page before; a page opened straight from a QR has
    // none, so the tab is closed instead where the browser allows it.
    window.history.go(-2);
    window.setTimeout(() => window.close(), 300);
  }

  const dialog = open ? (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="exit-guard-title">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <h2 id="exit-guard-title" className="text-xl font-bold text-ink">{what === 'video' ? t('exitVideoTitle') : t('exitTitle')}</h2>
        <p className="mt-2 text-sm text-muted">{t('exitText')}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button type="button" onClick={exit} className="tf-btn tf-btn-secondary !min-h-12 text-base">{t('exitBtn')}</button>
          <button type="button" autoFocus onClick={() => setOpen(false)} className="tf-btn tf-btn-primary !min-h-12 text-base">{t('continueBtn')}</button>
        </div>
      </div>
    </div>
  ) : null;

  return { dialog };
}
