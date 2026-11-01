'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Download, LoaderCircle } from 'lucide-react';
import { usePhoneLanguage } from '@/lib/tryfocus/phone-language';

type Recording = { videoUrl: string; downloadUrl: string; garmentTitle: string; clientName: string; expiresAt: string; looks?: Array<{ title: string; imageUrl: string }> };

/** Where the Live Mirror QR lands: the customer's whole 60-second session, to watch and save. */
export default function MirrorRecordingPage() {
  const { id } = useParams<{ id: string }>();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState('');
  const { language, setLanguage, t } = usePhoneLanguage();

  useEffect(() => {
    fetch(`/api/tv/mirror-recording/${encodeURIComponent(id || '')}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => (data?.success ? setRecording(data) : setError(data?.error || 'This Live Mirror video has expired.')))
      .catch(() => setError('The video could not load. Check your connection and try again.'));
  }, [id]);

  const storeName = recording?.clientName || '';

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line bg-canvas px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">{storeName.replace(/^The\s+/i, '').charAt(0) || 'T'}</span>
          <div className="min-w-0">
            <p className="truncate text-base font-bold">{storeName || 'TryFocus'}</p>
            <p className="text-[13px] text-muted">Live Mirror</p>
          </div>
          <div role="group" aria-label="Language" className="ml-auto flex shrink-0 rounded-xl bg-line/70 p-0.5 text-sm font-semibold">
            {([['en', 'English'], ['ta', 'தமிழ்']] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={language === value} onClick={() => setLanguage(value)} className={`min-h-10 rounded-[10px] px-2.5 ${language === value ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}>{label}</button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-4 px-4 py-5">
        {!recording && !error && (
          <div className="flex items-center justify-center gap-2 py-20 text-muted"><LoaderCircle className="h-5 w-5 animate-spin" /> {t('loadingVideo')}</div>
        )}
        {error && (
          <section className="tf-card p-6">
            <h1 className="text-2xl font-bold">{t('videoUnavailable')}</h1>
            <p className="mt-2 text-[15px] text-muted">{error}</p>
          </section>
        )}
        {recording && <>
          <div>
            <h1 className="text-2xl font-bold">{t('mirrorTitle')}</h1>
            {recording.garmentTitle && <p className="mt-1 text-[15px] text-muted">{recording.garmentTitle}</p>}
          </div>
          <video src={recording.videoUrl} controls playsInline className="aspect-[9/16] w-full rounded-2xl bg-ink object-cover" />
          <a href={recording.downloadUrl} download className="tf-btn tf-btn-primary !min-h-14 w-full text-base">
            <Download className="h-5 w-5" /> {t('downloadVideo')}
          </a>
          {Boolean(recording.looks?.length) && (
            <section className="space-y-3 pt-2">
              <div>
                <h2 className="text-xl font-bold">{t('compareLooks')}</h2>
                <p className="mt-0.5 text-[15px] text-muted">{t('compareLooksText')}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {recording.looks!.map((look, index) => (
                  <a key={look.imageUrl} href={look.imageUrl} download={`live-mirror-look-${index + 1}.jpg`} className="tf-card overflow-hidden">
                    <img src={look.imageUrl} alt={look.title || `Look ${index + 1}`} className="aspect-[9/16] w-full bg-canvas object-cover" />
                    <span className="line-clamp-2 block p-2.5 text-[13px] font-semibold leading-snug">{look.title || `Look ${index + 1}`}</span>
                  </a>
                ))}
              </div>
            </section>
          )}
          <p className="text-center text-sm text-muted">{t('linkWorksUntil')} {new Date(recording.expiresAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.</p>
        </>}
      </div>
    </main>
  );
}
