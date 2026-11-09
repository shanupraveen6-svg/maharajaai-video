'use client';

import { useEffect, useRef, useState } from 'react';

let showing = 0;
/** True while a session clock is on screen; the kiosk's idle reset waits for it instead. */
export function sessionTimerShowing() { return showing > 0; }

/**
 * The TV's session clock under a result QR. The customer has 2 minutes to scan and download (or Go Live);
 * the last minute shows in red, then the session ends on its own and the TV is ready for the next customer.
 */
export default function SessionTimer({ onExpire, label = 'Scan and download within', limitSeconds = 120, graceSeconds = 60 }: {
  onExpire: () => void;
  label?: string;
  limitSeconds?: number;
  graceSeconds?: number;
}) {
  const [elapsed, setElapsed] = useState(0);
  const expireRef = useRef(onExpire);
  useEffect(() => { expireRef.current = onExpire; }, [onExpire]);

  useEffect(() => {
    showing += 1;
    return () => { showing -= 1; };
  }, []);

  useEffect(() => {
    const started = Date.now();
    const tick = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      setElapsed(seconds);
      if (seconds >= limitSeconds + graceSeconds) {
        window.clearInterval(tick);
        expireRef.current();
      }
    }, 1000);
    return () => window.clearInterval(tick);
  }, [limitSeconds, graceSeconds]);

  const over = elapsed >= limitSeconds;
  const left = over ? limitSeconds + graceSeconds - elapsed : limitSeconds - elapsed;
  const clock = `${Math.floor(Math.max(0, left) / 60)}:${String(Math.max(0, left) % 60).padStart(2, '0')}`;

  return (
    <div
      role="timer"
      aria-live="off"
      className={`flex items-center justify-between gap-4 rounded-2xl border px-5 py-3 text-lg ${over ? 'border-danger bg-danger-soft text-danger' : 'border-line bg-white text-ink'}`}
    >
      <span className="font-semibold">{over ? 'Session ending soon' : label}</span>
      <span className="text-2xl font-bold tabular-nums">{over ? `Ends in ${clock}` : clock}</span>
    </div>
  );
}
