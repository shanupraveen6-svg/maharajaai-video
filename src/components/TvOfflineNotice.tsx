'use client';

import { useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * The showroom TV runs all day. When its internet drops, customers see a clear message instead of
 * broken buttons; when it comes back the screen recovers by itself (a reload after a long outage, so
 * nothing half-loaded stays on screen).
 */
export default function TvOfflineNotice() {
  const [offline, setOffline] = useState(false);
  const wentOfflineAt = useRef(0);

  useEffect(() => {
    const goOffline = () => { wentOfflineAt.current = Date.now(); setOffline(true); };
    const goOnline = () => {
      setOffline(false);
      if (wentOfflineAt.current && Date.now() - wentOfflineAt.current > 60_000) window.location.reload();
      wentOfflineAt.current = 0;
    };
    if (!navigator.onLine) goOffline();
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;
  return (
    <div role="alert" className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-ink/90 p-10 text-center text-white">
      <WifiOff className="h-16 w-16" />
      <p className="mt-6 text-4xl font-bold">We’ll be right back</p>
      <p className="mt-3 max-w-xl text-xl text-white/80">The screen lost its internet connection. It comes back by itself as soon as the connection returns.</p>
    </div>
  );
}
