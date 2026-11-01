'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import MaharajaExperience from '@/components/MaharajaExperience';

type PassState = {
  experienceType: 'purchased-garment' | 'catalogue-gift';
  giftChoice: 'catalogue' | 'own' | null;
  started: boolean;
  clientName: string;
};

/**
 * Where the biller's AI Video gift QR lands. AI Video is made from the store collection only, so the
 * customer goes straight to the collection (or to the piece the biller picked). An older QR issued before
 * that, which already started an own-outfit video, finishes in the AI Video flow it began.
 */
export default function GiftVideoEntry({ code, retrySessionId = '' }: { code: string; retrySessionId?: string }) {
  const router = useRouter();
  const [pass, setPass] = useState<PassState | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`/api/maharaja/access/${encodeURIComponent(code)}?service=ai-video`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        if (!data?.success) { setFailed(true); return; }
        const access = data.access || {};
        setPass({
          experienceType: access.experienceType === 'catalogue-gift' ? 'catalogue-gift' : 'purchased-garment',
          giftChoice: access.giftChoice || null,
          started: Boolean(access.videoMasterUrl || access.videoMasterDone || access.videoDone || access.activeVideoJobId),
          clientName: data.workspace?.clientName || '',
        });
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [code]);

  const finishesOwnOutfit = Boolean(pass && pass.experienceType !== 'catalogue-gift' && (pass.giftChoice === 'own' || pass.started));
  const opensCollection = Boolean(pass && !retrySessionId && !finishesOwnOutfit);

  useEffect(() => {
    if (!opensCollection || !pass) return;
    let active = true;
    const open = () => router.replace(`/maharaja/catalogue/${encodeURIComponent(code)}`);
    if (pass.experienceType === 'catalogue-gift') {
      open();
      return;
    }
    // An older gift QR: record the store collection as its choice, then open the collection.
    fetch('/api/maharaja/video-pass/choice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessCode: code, choice: 'catalogue' }),
    })
      .then((response) => response.json().then((data) => ({ ok: response.ok && data?.success, data })))
      .then(({ ok, data }) => {
        if (!active) return;
        if (ok) open();
        else setError(data?.error || 'Please ask our staff for a new QR.');
      })
      .catch(() => { if (active) setError('Check your connection and try again.'); });
    return () => { active = false; };
  }, [opensCollection, pass, code, router]);

  // The AI Video flow shows its own messages for an expired or invalid QR.
  if (failed || retrySessionId || finishesOwnOutfit) {
    return <MaharajaExperience service="ai-video" accessCode={code} retrySessionId={retrySessionId} />;
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center text-ink">
      {error
        ? <p role="alert" className="max-w-sm rounded-2xl bg-danger-soft p-4 text-base font-semibold text-danger">{error}</p>
        : <LoaderCircle className="h-8 w-8 animate-spin text-muted" />}
    </main>
  );
}
