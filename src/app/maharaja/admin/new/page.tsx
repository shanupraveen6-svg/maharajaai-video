'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { PlatformPicker } from '@/components/TryFocusAdmin';
import { PACKAGES, modulesForPackage, type PackageId } from '@/lib/maharaja/access';
import {
  FREE_TRIAL_IMAGE_CREDITS,
  PHONE_PACKAGE_CREDITS,
  PRESETS,
  clampCredits,
  platformOfPackage,
  type PresetId,
} from '@/lib/maharaja/pricing';

/**
 * TryFocus admin's own full page to set up a new client workspace: a store name and branch, the platform
 * (TV, Tablet or both — the customer's phone comes with either), and a starting credit package. Saving
 * creates the workspace and returns to admin with it already picked, so it shows in the store dropdown
 * at once (the dropdown reads the same clients list the save response returns).
 */
export default function NewClientWorkspacePage() {
  const router = useRouter();
  const [storeName, setStoreName] = useState('');
  const [storeBranch, setStoreBranch] = useState('');
  const [pkg, setPkg] = useState<PackageId>('tv');
  const [preset, setPreset] = useState<PresetId | 'trial' | 'phone-package'>('standard');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [authRequired, setAuthRequired] = useState(false);

  const platform = platformOfPackage(pkg);
  const credits = preset === 'trial'
    ? { image: FREE_TRIAL_IMAGE_CREDITS, video: 0, live: 0 }
    : preset === 'phone-package'
      ? { image: PHONE_PACKAGE_CREDITS, video: 0, live: 0 }
      : clampCredits(platform, PRESETS[preset]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!storeName.trim()) {
      setError('Enter a retailer store name.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const slug = storeName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: slug,
          name: storeName.trim(),
          branch: storeBranch.trim() || 'Main Showroom',
          status: 'Active',
          minPurchaseTryOnDisabled: true,
          deliveryMode: 'qr',
          devices: PACKAGES[pkg].devices,
          modules: modulesForPackage(pkg),
          limits: credits,
          // The store's GenLook credits match its Try-On credits for the trial and the Phone package.
          genlookCredits: preset === 'trial' ? FREE_TRIAL_IMAGE_CREDITS : preset === 'phone-package' ? PHONE_PACKAGE_CREDITS : undefined,
        }),
      });
      if (res.status === 401) {
        setAuthRequired(true);
        return;
      }
      const data = await res.json();
      if (!res.ok || !data?.success || !data.client?.id) {
        throw new Error(data?.error || 'Could not create retailer workspace.');
      }
      // Back to admin with this store already picked: the dropdown reflects it at once.
      router.push(`/admin?client=${encodeURIComponent(data.client.id)}&created=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create retailer workspace.');
      setCreating(false);
    }
  }

  if (authRequired) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F4F5F2] px-6 text-ink">
        <div className="rounded-2xl w-full max-w-md border border-line bg-white p-8 shadow-sm">
          <h1 className="mt-3 text-2xl font-bold text-ink">Operator authentication required</h1>
          <p className="mt-2 text-sm leading-6 text-muted">Sign in with your TryFocus operator credentials to create a client workspace.</p>
          <Link href="/login?next=/maharaja/admin/new" className="rounded-xl mt-6 flex w-full items-center justify-center border border-brand bg-brand px-5 py-3 text-xs font-bold text-[#FAF6EE] transition hover:bg-[#5E0E1E]">
            Sign In to TryFocus Admin
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4 sm:px-8">
          <Link href="/admin" className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-muted hover:bg-line/60 hover:text-ink">
            <ArrowLeft className="h-4 w-4" /> Back to admin
          </Link>
        </div>
      </header>

      <form onSubmit={create} className="mx-auto max-w-3xl space-y-6 px-5 py-6 sm:px-8">
        <div>
          <h1 className="text-3xl font-bold text-ink">New client workspace</h1>
          <p className="mt-1 text-sm text-muted">Set up a store&rsquo;s platform and starting credits. The store&rsquo;s own workspace only shows this; it is never edited there.</p>
        </div>

        {error && <div className="rounded-2xl border border-danger bg-[#FEF3F2] p-4 text-sm font-semibold text-danger">{error}</div>}

        <section className="tf-card space-y-4 p-6">
          <h2 className="text-lg font-bold text-ink">1. Store</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-bold text-muted">
              Store name
              <input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="e.g. Pothys Silk Palace"
                className="mt-1.5 h-12 w-full rounded-xl border border-line-strong bg-white px-3 text-base text-ink outline-none focus:border-brand"
                required
                autoFocus
              />
            </label>
            <label className="block text-xs font-bold text-muted">
              Branch / City
              <input
                value={storeBranch}
                onChange={(e) => setStoreBranch(e.target.value)}
                placeholder="e.g. Chennai · T. Nagar"
                className="mt-1.5 h-12 w-full rounded-xl border border-line-strong bg-white px-3 text-base text-ink outline-none focus:border-brand"
              />
            </label>
          </div>
        </section>

        <section className="tf-card space-y-4 p-6">
          <h2 className="text-lg font-bold text-ink">2. Platform</h2>
          <p className="text-sm text-muted">Tick TV, Tablet or both. The customer&rsquo;s phone (Wall QR Try-On and AI Video made on the phone) comes with either.</p>
          <PlatformPicker value={pkg} onChange={setPkg} />
        </section>

        <section className="tf-card space-y-4 p-6">
          <h2 className="text-lg font-bold text-ink">3. Credits</h2>
          <select
            aria-label="Credit package"
            value={preset}
            onChange={(e) => setPreset(e.target.value as PresetId | 'trial' | 'phone-package')}
            className="h-12 w-full max-w-sm rounded-xl border border-line-strong bg-white px-3 text-base text-ink outline-none focus:border-brand"
          >
            <option value="trial">Free trial · {FREE_TRIAL_IMAGE_CREDITS} Try-On</option>
            {(Object.keys(PRESETS) as PresetId[]).map((id) => <option key={id} value={id}>{PRESETS[id].label}</option>)}
          </select>
          <p className="text-sm font-semibold tabular-nums text-ink">
            {credits.image.toLocaleString('en-IN')} images{credits.video ? ` · ${credits.video.toLocaleString('en-IN')} AI Videos` : ''}{credits.live ? ` · ${credits.live.toLocaleString('en-IN')} Live Try-On` : ''}
          </p>
          {preset === 'trial' && (
            <p className="rounded-2xl bg-canvas p-4 text-sm text-muted">Free trial: {FREE_TRIAL_IMAGE_CREDITS} Try-On credits and {FREE_TRIAL_IMAGE_CREDITS} GenLook credits locked to the store. Top up from the client&apos;s Plan tab when they buy.</p>
          )}
        </section>

        <button type="submit" disabled={creating} className="tf-btn tf-btn-primary !min-h-14 w-full text-base">
          {creating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          {creating ? 'Creating…' : 'Create workspace'}
        </button>
      </form>
    </main>
  );
}
