'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, LoaderCircle } from 'lucide-react';

type DayRow = { date: string; scans: number; tryOns: number; downloads: number; gmv: number; conversion: number };

type AnalyticsWorkspace = {
  clientName: string;
  usage: Record<string, number | undefined>;
  limits?: { image: number; live: number; video: number };
  analytics: {
    imagesSuccess: number;
    imageFailures: number;
    imageRetries: number;
    videosSuccess: number;
    videoFailures: number;
    videoRetries: number;
    videosRendering: number;
    brandedReach: number;
    totalGarments: number;
    days: DayRow[];
  };
};

/** Store analytics from the client's recorded activity and usage counters. */
export default function RetailAnalytics() {
  const [workspace, setWorkspace] = useState<AnalyticsWorkspace | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/maharaja/workspace', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (!data?.success) throw new Error(data?.error || 'Unable to load analytics.');
        setWorkspace(data.workspace);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load analytics.'));
  }, []);

  if (error) {
    return <main className="min-h-screen bg-[#F4F5F2] px-4 py-10 text-center text-[#B42318]">{error} <Link href="/login" className="underline">Sign in</Link></main>;
  }
  if (!workspace) {
    return <main className="flex min-h-screen items-center justify-center bg-[#F4F5F2]"><LoaderCircle className="h-8 w-8 animate-spin text-[#7A1428]" /></main>;
  }

  const { analytics, usage } = workspace;
  const limits = workspace.limits || { image: 4000, live: 500, video: 500 };
  const rate = (ok: number, failed: number) => (ok + failed ? `${Math.round((ok / (ok + failed)) * 100)}%` : '—');
  const kpis: Array<[string, string, string]> = [
    ['Try-On images', String(analytics.imagesSuccess), `${rate(analytics.imagesSuccess, analytics.imageFailures)} success · ${analytics.imageRetries} retries`],
    ['AI videos', String(analytics.videosSuccess), `${rate(analytics.videosSuccess, analytics.videoFailures)} success · ${analytics.videosRendering} rendering`],
    ['Video passes issued', String(usage.videoPasses || 0), `${usage.goLive || 0} sent to Go Live`],
    ['Live mirror sessions', String(usage.liveSessions || 0), '60-second sessions'],
    ['Downloads & shares', String(analytics.brandedReach), 'Branded media saved by customers'],
    ['Price tags scanned', String(analytics.totalGarments), `${usage.tryOnScans || 0} QR opens`],
  ];
  const credits: Array<[string, number, number]> = [
    ['Image Try-On', Number(usage.tryOnGenerated || 0), limits.image],
    ['AI Video', Number(usage.videosGenerated || 0), limits.video],
    ['Live Mirror', Number(usage.liveSessions || 0), limits.live],
  ];

  return (
    <main className="min-h-screen bg-[#F4F5F2] px-4 py-6 text-[#161918] sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/maharaja/client-admin" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#7A1428]">
          <ArrowLeft className="h-4 w-4" /> Client workspace
        </Link>
        <h1 className="mt-3 font-serif text-3xl font-semibold">{workspace.clientName} analytics</h1>
        <p className="mt-1 text-sm text-[#535A56]">Recorded store activity. Customer photos are not kept; these are counts only.</p>

        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
          {kpis.map(([label, value, note]) => (
            <article key={label} className="border border-[#D8DCD7] bg-white p-4">
              <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#7A1428]">{label}</p>
              <p className="mt-2 font-serif text-3xl font-semibold">{value}</p>
              <p className="mt-1 text-xs text-[#535A56]">{note}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 border border-[#D8DCD7] bg-white p-5">
          <h2 className="font-serif text-xl font-semibold">Credits</h2>
          <div className="mt-3 space-y-3">
            {credits.map(([label, used, limit]) => {
              const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
              return (
                <div key={label}>
                  <div className="flex justify-between text-sm"><span>{label}</span><span className="font-mono font-bold">{used} / {limit}</span></div>
                  <div className="mt-1 h-2 bg-[#ECEEE9]"><div className={`h-full ${pct >= 95 ? 'bg-[#B42318]' : pct >= 80 ? 'bg-[#B7791F]' : 'bg-[#7A1428]'}`} style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-6 overflow-x-auto border border-[#D8DCD7] bg-white">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-[#FAFBF8] font-mono text-[11px] uppercase tracking-wider text-[#535A56]">
              <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Tag scans</th><th className="px-4 py-3">Try-Ons</th><th className="px-4 py-3">Downloads</th><th className="px-4 py-3">Scan → Try-On</th></tr>
            </thead>
            <tbody>
              {analytics.days.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-[#535A56]">No activity recorded yet.</td></tr>}
              {analytics.days.slice(0, 30).map((day) => (
                <tr key={day.date} className="border-t border-[#ECEEE9]">
                  <td className="px-4 py-2.5 font-mono">{day.date}</td>
                  <td className="px-4 py-2.5">{day.scans}</td>
                  <td className="px-4 py-2.5">{day.tryOns}</td>
                  <td className="px-4 py-2.5">{day.downloads}</td>
                  <td className="px-4 py-2.5">{day.scans ? `${day.conversion}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
