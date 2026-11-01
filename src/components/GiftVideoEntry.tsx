'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, LoaderCircle, Shirt } from 'lucide-react';
import MaharajaExperience from '@/components/MaharajaExperience';
import { usePhoneLanguage } from '@/lib/tryfocus/phone-language';

type PassState = {
  experienceType: 'purchased-garment' | 'catalogue-gift';
  giftChoice: 'catalogue' | 'own' | null;
  started: boolean;
  clientName: string;
};

/**
 * Where the biller's AI Video gift QR lands. The customer first picks the store collection or the outfit
 * they bought; after that (or when the video has already started) the AI Video flow takes over.
 */
export default function GiftVideoEntry({ code, retrySessionId = '' }: { code: string; retrySessionId?: string }) {
  const router = useRouter();
  const { language, setLanguage, t } = usePhoneLanguage();
  const [pass, setPass] = useState<PassState | null>(null);
  const [preview, setPreview] = useState<string[]>([]);
  const [chosenOwn, setChosenOwn] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<'catalogue' | 'own' | ''>('');
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
    fetch(`/api/maharaja/catalogue?offset=0&limit=4&videoOnly=true&access=${encodeURIComponent(code)}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (!active || !Array.isArray(data?.products)) return;
        setPreview(data.products.filter((item: { eligibleForVideo?: boolean }) => item.eligibleForVideo !== false).slice(0, 4).map((item: { thumbnailUrl?: string; imageUrl: string }) => item.thumbnailUrl || item.imageUrl));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [code]);

  const goToCatalogue = pass?.experienceType === 'catalogue-gift';
  useEffect(() => {
    if (goToCatalogue) router.replace(`/maharaja/catalogue/${encodeURIComponent(code)}`);
  }, [goToCatalogue, code, router]);

  async function choose(choice: 'catalogue' | 'own') {
    setBusy(choice);
    setError('');
    try {
      const response = await fetch('/api/maharaja/video-pass/choice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: code, choice }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Please try again.');
      if (choice === 'catalogue') router.replace(`/maharaja/catalogue/${encodeURIComponent(code)}`);
      else setChosenOwn(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Please try again.');
      setBusy('');
    }
  }

  // The AI Video flow shows its own messages for an expired or invalid QR.
  if (failed || chosenOwn || retrySessionId || (pass && !goToCatalogue && (pass.giftChoice === 'own' || pass.started))) {
    return <MaharajaExperience service="ai-video" accessCode={code} retrySessionId={retrySessionId} />;
  }
  if (!pass || goToCatalogue) {
    return <main className="flex min-h-screen items-center justify-center bg-canvas"><LoaderCircle className="h-8 w-8 animate-spin text-muted" /></main>;
  }

  const storeName = pass.clientName.replace(/^The\s+/i, '');

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line bg-canvas px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">{pass.clientName.replace(/^The\s+/i, '').charAt(0) || 'T'}</span>
          <p className="min-w-0 flex-1 truncate text-base font-bold">{pass.clientName}</p>
          <div role="group" aria-label="Language" className="flex shrink-0 rounded-xl bg-line/70 p-0.5 text-sm font-semibold">
            {([['en', 'English'], ['ta', 'தமிழ்']] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={language === value} onClick={() => setLanguage(value)} className={`min-h-10 rounded-[10px] px-2.5 ${language === value ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}>{label}</button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-4 px-4 py-5">
        {/* Two boxes and nothing else. The store's collection comes first and is the larger box. The choice is
            final: the server locks it, so going back reopens the chosen flow. */}
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void choose('catalogue')}
          className="tf-card group block w-full overflow-hidden p-0 text-left ring-1 ring-ink transition disabled:opacity-60"
        >
          {preview.length > 0 && (
            <span className="grid grid-cols-4 gap-0.5 bg-[#F1EEE9]">
              {preview.map((src) => <img key={src} src={src} alt="" className="aspect-[3/4] w-full object-cover" />)}
            </span>
          )}
          <span className="flex items-center gap-4 p-5">
            <span className="min-w-0 flex-1 text-xl font-bold">{storeName} {t('newCollection')}</span>
            {busy === 'catalogue' ? <LoaderCircle className="h-6 w-6 shrink-0 animate-spin" /> : <ArrowRight className="h-6 w-6 shrink-0 transition group-hover:translate-x-1" />}
          </span>
        </button>

        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void choose('own')}
          className="tf-card flex w-full items-center gap-4 p-5 text-left transition hover:border-ink disabled:opacity-60"
        >
          <Shirt className="h-6 w-6 shrink-0 text-muted" strokeWidth={1.6} />
          <span className="min-w-0 flex-1 text-lg font-semibold">{t('yourCollection')}</span>
          {busy === 'own' ? <LoaderCircle className="h-5 w-5 shrink-0 animate-spin" /> : <ArrowRight className="h-5 w-5 shrink-0 text-muted" />}
        </button>

        {error && <p role="alert" className="rounded-2xl bg-danger-soft p-3 text-sm font-semibold text-danger">{error}</p>}
      </div>
    </main>
  );
}
