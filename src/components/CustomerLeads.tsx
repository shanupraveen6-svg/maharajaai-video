'use client';

import { useEffect, useState } from 'react';
import { Download, LoaderCircle, Users } from 'lucide-react';
import { StatusPill } from '@/components/ui';

type Lead = {
  id: string;
  phone: string;
  marketingConsent: boolean;
  sources: string[];
  downloads: number;
  firstSeenAt?: string;
  lastSeenAt: string;
};

const SOURCE_NAMES: Record<string, string> = {
  'try-on': 'Try-On',
  'tv-looks': 'Try-On',
  'ai-video': 'AI Video',
  'live-mirror': 'Live Mirror',
};

const shortDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/**
 * The store's customers: everyone who gave a WhatsApp number to download a look or a video. Only those who
 * ticked "send me offers" may get the store's offers; the CSV says which.
 */
export default function CustomerLeads() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/maharaja/leads', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        if (data?.success) setLeads(data.leads || []);
        else setError(data?.error || 'Your customers could not be loaded.');
      })
      .catch(() => { if (active) setError('Your customers could not be loaded. Check the connection.'); });
    return () => { active = false; };
  }, []);

  const offersAllowed = leads?.filter((lead) => lead.marketingConsent).length || 0;

  return (
    <section className="tf-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Customers</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">Everyone who gave a WhatsApp number to download a look or a video. Send offers only to customers marked “Offers: yes”.</p>
        </div>
        <a href="/api/maharaja/leads?format=csv" className="tf-btn tf-btn-dark !min-h-11 px-4 text-sm"><Download className="h-4 w-4" /> Download CSV</a>
      </div>

      {error && <p role="alert" className="mt-4 rounded-2xl bg-danger-soft p-3 text-sm font-semibold text-danger">{error}</p>}
      {!leads && !error && <p className="mt-6 flex items-center gap-2 text-sm text-muted"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading your customers…</p>}

      {leads && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-md">
            <div className="rounded-2xl bg-canvas p-4">
              <p className="text-[13px] font-medium text-muted">Customers</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{leads.length.toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-2xl bg-canvas p-4">
              <p className="text-[13px] font-medium text-muted">Offers allowed</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{offersAllowed.toLocaleString('en-IN')}</p>
            </div>
          </div>
          {leads.length === 0 ? (
            <div className="mt-6 flex items-center gap-3 rounded-2xl bg-canvas p-5 text-sm text-muted">
              <Users className="h-5 w-5 shrink-0" /> No customers yet. They appear here when a customer downloads a look or a video.
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line text-xs font-semibold text-muted">
                  <tr><th className="py-2 pr-3">WhatsApp</th><th className="py-2 pr-3">Offers</th><th className="py-2 pr-3">Used</th><th className="py-2 pr-3 text-right">Downloads</th><th className="py-2 pr-3 text-right">First seen</th><th className="py-2 text-right">Last seen</th></tr>
                </thead>
                <tbody>
                  {leads.slice(0, 200).map((lead) => (
                    <tr key={lead.id} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-3 tabular-nums"><a href={`https://wa.me/91${lead.phone}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-4">+91 {lead.phone}</a></td>
                      <td className="py-2.5 pr-3">{lead.marketingConsent ? <StatusPill tone="success">Yes</StatusPill> : <StatusPill>No</StatusPill>}</td>
                      <td className="py-2.5 pr-3 text-muted">{Array.from(new Set((lead.sources || []).map((source) => SOURCE_NAMES[source] || source))).join(', ')}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{Number(lead.downloads || 0).toLocaleString('en-IN')}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{shortDate(lead.firstSeenAt)}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted">{shortDate(lead.lastSeenAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {leads.length > 200 && <p className="mt-3 text-sm text-muted">Showing the latest 200. Download the CSV for all {leads.length.toLocaleString('en-IN')}.</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
