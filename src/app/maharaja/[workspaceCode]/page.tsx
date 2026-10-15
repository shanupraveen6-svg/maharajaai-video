'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Film,
  LoaderCircle,
  Power,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  CalendarRange,
  History,
  Tag,
  Trash2,
  LogOut,
  BarChart3,
  IndianRupee,
} from 'lucide-react';
import { createTryOnPosterDataUrl, downloadDataUrl } from '@/lib/maharaja/qr-poster';
import { EVENT_OPTIONS, getEventOption, type EventId } from '@/lib/maharaja/config';

type RecentPass = {
  code: string;
  phoneMasked: string;
  billLast4: string;
  eventId: EventId;
  status: string;
  createdAt: string;
  usage: { scans?: number; imagesGenerated?: number; videosGenerated?: number; goLive?: number };
};

type Workspace = {
  clientName: string;
  workspaceCode: string;
  campaignEnabled: boolean;
  activeEvents: EventId[];
  defaultEvent: EventId;
  tryOnUrl: string;
  billingUrl: string;
  usage: {
    tryOnScans: number;
    tryOnGenerated: number;
    videoPasses: number;
    videosGenerated: number;
    goLive: number;
    retries: number;
    downloads: number;
  };
  recentPasses: RecentPass[];
  activity: Array<{ id: string; type: string; label: string; createdAt: string }>;
  analytics: {
    totalGmv: number;
    totalGarments: number;
    brandedReach: number;
    luxuryCount: number;
    festiveCount: number;
    days: Array<{ date: string; scans: number; tryOns: number; gmv: number; averagePrice: number; downloads: number; conversion: number }>;
  };
};

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'Request failed.');
  return data;
}

export default function MaharajaAdminPage() {
  const params = useParams<{ workspaceCode: string }>();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [posterDataUrl, setPosterDataUrl] = useState('');
  const [posterVisible, setPosterVisible] = useState(false);
  const [billingCopied, setBillingCopied] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadWorkspace() {
    setLoading(true);
    try {
      const data = await readJson(await fetch('/api/maharaja/workspace', { cache: 'no-store' }));
      setWorkspace(data.workspace);
      if (params.workspaceCode !== data.workspace.workspaceCode) {
        setMessage('This Maharaja workspace link is not valid.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load Maharaja workspace.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch('/api/maharaja/workspace', { cache: 'no-store' })
      .then(readJson)
      .then((data) => {
        if (!active) return;
        setWorkspace(data.workspace);
        if (params.workspaceCode !== data.workspace.workspaceCode) {
          setMessage('This Maharaja workspace link is not valid.');
        }
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : 'Unable to load Maharaja workspace.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params.workspaceCode]);

  useEffect(() => {
    let cancelled = false;
    if (!workspace?.tryOnUrl) return;
    createTryOnPosterDataUrl(workspace.tryOnUrl)
      .then((dataUrl) => {
        if (!cancelled) setPosterDataUrl(dataUrl);
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Unable to build Try-On poster.');
      });
    return () => {
      cancelled = true;
    };
  }, [workspace?.tryOnUrl]);

  const stats = useMemo(() => workspace ? [
    { label: 'Try-On scans', value: workspace.usage.tryOnScans || 0 },
    { label: 'Try-Ons made', value: workspace.usage.tryOnGenerated || 0 },
    { label: 'Video passes', value: workspace.usage.videoPasses || 0 },
    { label: 'Videos made', value: workspace.usage.videosGenerated || 0 },
    { label: 'Go Live', value: workspace.usage.goLive || 0 },
    { label: 'Downloads', value: workspace.usage.downloads || 0 },
    { label: 'Manager retries', value: workspace.usage.retries || 0 },
  ] : [], [workspace]);
  const formatMoney = (value: number) => `Rs ${new Intl.NumberFormat('en-IN').format(value || 0)}`;

  async function toggleCampaign() {
    if (!workspace) return;
    setSaving(true);
    setMessage('');
    try {
      const data = await readJson(await fetch('/api/maharaja/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignEnabled: !workspace.campaignEnabled }),
      }));
      setWorkspace((current) => current ? { ...current, campaignEnabled: data.workspace.campaignEnabled } : current);
      setMessage(`Campaign turned ${data.workspace.campaignEnabled ? 'on' : 'off'}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update campaign.');
    } finally {
      setSaving(false);
    }
  }

  async function copyLink(link: string, label: string) {
    try {
      await navigator.clipboard.writeText(link);
      setMessage(`${label} copied.`);
    } catch {
      setMessage(`Copy failed. Open ${label.toLowerCase()} and copy it from the address bar.`);
    }
  }

  async function saveEventSettings(activeEvents: EventId[], defaultEvent: EventId) {
    if (!workspace || !activeEvents.length) return;
    setSaving(true);
    setMessage('');
    try {
      const data = await readJson(await fetch('/api/maharaja/workspace', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeEvents, defaultEvent }),
      }));
      setWorkspace((current) => current ? { ...current, activeEvents: data.workspace.activeEvents, defaultEvent: data.workspace.defaultEvent } : current);
      setMessage('Event controls saved and aligned with generation prompts.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save event controls.');
    } finally { setSaving(false); }
  }

  async function downloadPoster() {
    if (!posterDataUrl) return;
    downloadDataUrl(posterDataUrl, 'maharaja-ai-try-on-rs-500.png');
    await fetch('/api/maharaja/activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'qr-download', label: 'Permanent AI Try-On wall QR downloaded' }) });
  }

  async function resetTryOnLimits() {
    if (!window.confirm('Reset completed AI Try-On limits for all test devices? Use this only during controlled testing.')) return;
    setSaving(true);
    try {
      const data = await readJson(await fetch('/api/maharaja/try-on-grants', { method: 'DELETE' }));
      setMessage(`Try-On limits reset for ${data.cleared} device${data.cleared === 1 ? '' : 's'}.`);
      await loadWorkspace();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to reset Try-On limits.');
    } finally { setSaving(false); }
  }

  async function logout() {
    setSaving(true);
    try {
      await fetch('/api/operator/logout', { method: 'POST' });
    } finally {
      window.location.assign('/login?store=maharaja');
    }
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#F5F2EA] text-[#6E0D1F]"><LoaderCircle className="h-8 w-8 animate-spin" /></main>;
  }

  if (!workspace || params.workspaceCode !== workspace.workspaceCode) {
    return <main className="flex min-h-screen items-center justify-center bg-[#F5F2EA] p-6 text-center font-bold text-red-800">{message || 'Maharaja workspace not found.'}</main>;
  }

  return (
    <main className="min-h-screen bg-[#F5F2EA] text-[#211A17]">
      <header className="border-b border-[#D4AF37]/30 bg-[#21090E] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-[#D4AF37]">TryFocus client workspace</p>
            <h1 className="mt-1 font-serif text-3xl font-bold text-[#F3E5AB]">Maharaja Admin</h1>
          </div>
          <div className="flex gap-3"><button type="button" onClick={toggleCampaign} disabled={saving} className={`inline-flex min-h-11 items-center justify-center gap-2 border px-4 py-3 text-xs font-bold uppercase ${workspace.campaignEnabled ? 'border-emerald-400 bg-emerald-950 text-emerald-200' : 'border-red-400 bg-red-950 text-red-200'}`}>
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
            Campaign {workspace.campaignEnabled ? 'On' : 'Off'}
          </button><button type="button" onClick={() => void logout()} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 border border-[#D4AF37]/45 px-4 py-3 text-xs font-bold uppercase text-[#F3E5AB]"><LogOut className="h-4 w-4" /> Logout</button></div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-7">
        {message && <div className="mb-5 border border-[#D4AF37]/40 bg-white px-4 py-3 text-sm font-semibold text-[#6E0D1F]">{message}</div>}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {stats.map((stat) => (
            <div key={stat.label} className="border border-[#DDD2BD] bg-white p-4">
              <p className="text-xs font-bold uppercase text-[#765E27]">{stat.label}</p>
              <p className="mt-2 font-serif text-3xl font-bold text-[#6E0D1F]">{stat.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 border border-[#DDD2BD] bg-white p-5 md:p-6">
          <div className="flex items-start gap-3"><BarChart3 className="mt-1 h-6 w-6 text-[#6E0D1F]" /><div><p className="text-xs font-bold uppercase text-[#8A6A20]">Retail intelligence</p><h2 className="mt-1 font-serif text-2xl font-bold text-[#2A060C]">Merchandise performance</h2></div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="border border-[#DDD2BD] p-4"><IndianRupee className="h-5 w-5 text-[#6E0D1F]" /><p className="mt-3 text-xs font-bold uppercase text-[#765E27]">Total garment value scanned</p><p className="mt-1 font-serif text-3xl font-bold text-[#6E0D1F]">{formatMoney(workspace.analytics.totalGmv)}</p></div>
            <div className="border border-[#DDD2BD] p-4"><Download className="h-5 w-5 text-[#6E0D1F]" /><p className="mt-3 text-xs font-bold uppercase text-[#765E27]">Watermarked brand recall</p><p className="mt-1 font-serif text-3xl font-bold text-[#6E0D1F]">{workspace.analytics.brandedReach}</p><p className="mt-1 text-xs text-slate-500">Recorded downloads and shares</p></div>
            <div className="border border-[#DDD2BD] p-4"><Sparkles className="h-5 w-5 text-[#6E0D1F]" /><p className="mt-3 text-xs font-bold uppercase text-[#765E27]">Luxury vs festive tier</p><p className="mt-1 font-serif text-3xl font-bold text-[#6E0D1F]">{workspace.analytics.luxuryCount} : {workspace.analytics.festiveCount}</p><p className="mt-1 text-xs text-slate-500">Luxury is Rs 3,000 and above</p></div>
          </div>
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead><tr className="border-b border-[#DDD2BD] text-xs uppercase text-[#765E27]"><th className="py-3">Date</th><th>Garments scanned</th><th>Try-Ons</th><th>Total GMV</th><th>Avg price</th><th>Downloads</th><th>Conversion</th></tr></thead><tbody>{workspace.analytics.days.length ? workspace.analytics.days.map((day) => <tr key={day.date} className="border-b border-[#EEE7DA]"><td className="py-3 font-bold">{day.date}</td><td>{day.scans}</td><td>{day.tryOns}</td><td>{formatMoney(day.gmv)}</td><td>{formatMoney(day.averagePrice)}</td><td>{day.downloads}</td><td>{day.conversion}%</td></tr>) : <tr><td colSpan={7} className="py-7 text-center text-slate-500">Price scans and completed Try-Ons will appear here.</td></tr>}</tbody></table></div>
        </section>

        <section className="mt-6 border border-[#DDD2BD] bg-white p-5 md:p-6">
          <div className="flex items-start gap-3">
            <CalendarRange className="mt-1 h-6 w-6 text-[#6E0D1F]" />
            <div>
              <p className="text-xs font-bold uppercase text-[#8A6A20]">Campaign & Theme Controls</p>
              <h2 className="mt-1 font-serif text-2xl font-bold text-[#2A060C]">Active Festival Campaign</h2>
              <p className="mt-1 text-sm text-[#5C4B43]">
                Select the active festival campaign for Maharaja Silks. The selected festival controls the AI styling prompts, customer greetings, and TV broadcast overlays.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {EVENT_OPTIONS.map((option) => {
              const isActive = workspace.activeEvents.includes(option.id);
              const isDefault = workspace.defaultEvent === option.id;

              return (
                <div
                  key={option.id}
                  className={`relative flex flex-col justify-between border p-4 transition ${
                    isDefault
                      ? 'border-[#6E0D1F] bg-[#FFF8E8] shadow-sm'
                      : 'border-[#DDD2BD] bg-white hover:border-[#8A6A20]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-lg font-bold text-[#2A060C]">{option.label}</span>
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-bold uppercase text-[#6E0D1F]">
                      Active
                      <input
                        type="checkbox"
                        checked={isActive}
                        disabled={saving || (isActive && workspace.activeEvents.length === 1)}
                        onChange={() => {
                          const activeEvents = isActive
                            ? workspace.activeEvents.filter((eventId) => eventId !== option.id)
                            : [...workspace.activeEvents, option.id];
                          const defaultEvent = isDefault && isActive ? activeEvents[0] : workspace.defaultEvent;
                          void saveEventSettings(activeEvents, defaultEvent);
                        }}
                        className="h-5 w-5 accent-[#6E0D1F]"
                      />
                    </label>
                  </div>

                  <p className="mt-2 text-xs leading-5 text-[#5C4B43]">
                    {option.scene}
                  </p>

                  <div className="mt-3 flex items-center justify-between border-t border-[#E8DFCF] pt-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold ${isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                      <Sparkles className="h-3 w-3" /> {isActive ? 'Available' : 'Inactive'}
                    </span>
                    <label className={`flex items-center gap-2 text-xs font-black uppercase ${isActive ? 'cursor-pointer text-[#6E0D1F]' : 'cursor-not-allowed text-slate-400'}`}>
                      Default
                      <input
                        type="radio"
                        name="default-event"
                        checked={isDefault}
                        disabled={saving || !isActive}
                        onChange={() => void saveEventSettings(workspace.activeEvents, option.id)}
                        className="h-4 w-4 accent-[#6E0D1F]"
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Card 1: Permanent wall QR */}
          <div className="border border-[#D8C49B] bg-white p-5 md:p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase text-[#8A6A20]">Permanent wall QR</p>
                  <h2 className="mt-2 font-serif text-2xl font-bold text-[#2A060C]">Maharaja AI Try-On</h2>
                  <p className="mt-2 text-sm leading-6 text-[#5C4B43]">
                    Display this poster inside the store. It allows customers to scan Rs 500+ price tags and preview festival outfits.
                  </p>
                </div>
                <QrCode className="h-7 w-7 shrink-0 text-[#6E0D1F]" />
              </div>

              {posterVisible && (
                <div className="mt-5 grid gap-5 sm:grid-cols-[180px_1fr] sm:items-center">
                  <div className="aspect-[8/11] overflow-hidden border border-[#D8C49B] bg-[#F8F5EE]">
                    {posterDataUrl ? (
                      <img src={posterDataUrl} alt="Maharaja AI Try-On printable QR poster" className="h-full w-full object-contain" />
                    ) : (
                      <LoaderCircle className="mx-auto mt-16 h-8 w-8 animate-spin text-[#6E0D1F]" />
                    )}
                  </div>
                  <div className="space-y-3">
                    <button
                      type="button"
                      id="download-tryon-png-btn"
                      disabled={!posterDataUrl}
                      onClick={() => void downloadPoster()}
                      className="flex min-h-12 w-full items-center justify-center gap-2 bg-[#6E0D1F] px-4 py-3 text-xs font-bold uppercase text-[#F3E5AB] disabled:opacity-40"
                    >
                      <Download className="h-4 w-4" /> Download Try-On PNG
                    </button>
                    <a
                      href="/maharaja-test-price-tag-rs-799.png"
                      download="maharaja-test-price-tag-rs-799.png"
                      className="flex min-h-12 w-full items-center justify-center gap-2 border border-[#D8C49B] px-4 py-3 text-center text-xs font-bold uppercase text-[#6E0D1F]"
                    >
                      <Tag className="h-4 w-4" /> Download Rs 799 Test Tag
                    </a>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void resetTryOnLimits()}
                      className="flex min-h-12 w-full items-center justify-center gap-2 border border-red-200 px-4 py-3 text-xs font-bold uppercase text-red-800 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" /> Reset Test Try-On Limits
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!posterVisible && (
              <button
                type="button"
                id="generate-tryon-qr-btn"
                disabled={!posterDataUrl}
                onClick={() => setPosterVisible(true)}
                className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 bg-[#6E0D1F] px-5 text-xs font-bold uppercase text-[#F3E5AB] disabled:opacity-40"
              >
                <QrCode className="h-5 w-5" /> Generate Try-On QR
              </button>
            )}
          </div>

          {/* Card 2: Billing counter link */}
          <div className="border border-[#D8C49B] bg-[#21090E] p-5 text-[#F3E5AB] md:p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase text-[#D4AF37]">Billing counter</p>
                  <h2 className="mt-2 font-serif text-2xl font-bold">AI Video customer QR</h2>
                  <p className="mt-2 text-sm leading-6 text-[#F3E5AB]/75">
                    Copy the counter link to any billing computer or tablet. The counter generates customer QR codes for qualifying purchases.
                  </p>
                </div>
                <Film className="h-7 w-7 shrink-0 text-[#D4AF37]" />
              </div>
            </div>

            <button
              type="button"
              id="copy-billing-link-btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(workspace.billingUrl);
                  setBillingCopied(true);
                  setMessage('Billing link copied.');
                  window.setTimeout(() => setBillingCopied(false), 2500);
                } catch {
                  setMessage('Copy failed.');
                }
              }}
              className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 bg-[#D4AF37] px-5 py-4 text-xs font-bold uppercase text-black transition hover:brightness-105"
            >
              {billingCopied ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-800" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-5 w-5" />
                  Copy Billing Link
                </>
              )}
            </button>
          </div>
        </section>

        <section className="mt-6 border border-[#DDD2BD] bg-white p-5 md:p-6">
          <div className="flex items-center gap-3"><History className="h-6 w-6 text-[#6E0D1F]" /><div><p className="text-xs font-bold uppercase text-[#8A6A20]">Audit log</p><h2 className="font-serif text-2xl font-bold text-[#2A060C]">Maharaja activity</h2></div></div>
          <div className="mt-4 divide-y divide-[#EEE7DA]">
            {workspace.activity?.length ? workspace.activity.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-3 text-sm"><div><span className="mr-2 border border-[#D8C49B] px-2 py-1 text-[10px] font-bold uppercase text-[#6E0D1F]">{item.type}</span><span className="font-semibold">{item.label}</span></div><time className="shrink-0 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</time></div>) : <p className="py-6 text-sm text-slate-500">New QR, generation, download, retry and Go Live activity will appear here.</p>}
          </div>
        </section>

        <section className="mt-6 border border-[#DDD2BD] bg-white p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-bold uppercase text-[#8A6A20]">Customer activity</p><h2 className="mt-1 font-serif text-2xl font-bold text-[#2A060C]">Recent AI Video QR codes</h2></div>
            <button type="button" onClick={() => void loadWorkspace()} title="Refresh activity" className="flex h-10 w-10 items-center justify-center border border-[#D8C49B] text-[#6E0D1F]"><RefreshCw className="h-4 w-4" /></button>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead><tr className="border-b border-[#DDD2BD] text-xs uppercase text-[#765E27]"><th className="py-3">Customer</th><th>Bill</th><th>Event</th><th>Scans</th><th>Videos</th><th>Status</th><th>Test</th></tr></thead>
              <tbody>
                {workspace.recentPasses.length ? workspace.recentPasses.map((pass) => (
                  <tr key={pass.code} className="border-b border-[#EEE7DA]"><td className="py-4 font-mono font-bold">{pass.phoneMasked}</td><td>****{pass.billLast4}</td><td>{getEventOption(pass.eventId).label}</td><td>{pass.usage?.scans || 0}</td><td>{pass.usage?.videosGenerated || 0}</td><td className="font-bold text-emerald-700">{pass.status}</td><td><Link href={`/maharaja/video/${pass.code}`} target="_blank" className="inline-flex min-h-9 items-center gap-1 border border-[#D8C49B] px-3 text-xs font-bold uppercase text-[#6E0D1F]"><ExternalLink className="h-3.5 w-3.5" /> Open</Link></td></tr>
                )) : <tr><td colSpan={7} className="py-8 text-center text-slate-500">Customer QR codes generated at the billing counter will appear here.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="mt-6 flex items-center gap-2 text-xs font-semibold text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-700" /> All QR codes, passes and usage on this page belong to Maharaja.</footer>
      </div>
    </main>
  );
}
