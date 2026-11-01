'use client';

import { useMemo, useState } from 'react';
import { Check, Phone, Smartphone, Tablet, Tv } from 'lucide-react';
import type { CreditModule, Credits, Platform, PresetId } from '@/lib/maharaja/pricing';

/**
 * The store's price calculator: pick a platform, move the sliders, see one package total. It only adds up
 * the rupee totals the server sends for each credit count, so no per-credit price is ever shown here.
 */
export type PricingCalculatorConfig = {
  platforms: Platform[];
  platformLabels: Record<Platform, string>;
  platformModules: Record<Platform, Record<CreditModule, boolean>>;
  softwareFee: Record<Platform, number>;
  ranges: Record<CreditModule, { min: number; max: number; step: number }>;
  labels: Record<CreditModule, string>;
  totals: Record<CreditModule, Record<number, number>>;
  presets: Record<PresetId, { label: string } & Credits>;
  gstRate: number;
  validityMonths: number;
};

const PLATFORM_TEXT: Record<Platform, { Icon: typeof Tv; text: string }> = {
  tv: { Icon: Tv, text: 'A portrait TV in your showroom. Your customers’ phones are included.' },
  tablet: { Icon: Tablet, text: 'A tablet at your counter. Your customers’ phones are included.' },
  phone: { Icon: Smartphone, text: 'Your customers use their own phones from your wall QR.' },
};

const MODULE_NAMES: Record<CreditModule, string> = { image: 'Try-On', video: 'AI Video with Go Live', live: 'Live Mirror' };

const MODULES: CreditModule[] = ['image', 'video', 'live'];

const rupees = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;

export default function PricingCalculator({ config }: { config: PricingCalculatorConfig }) {
  const [platform, setPlatform] = useState<Platform>('tv');
  const [credits, setCredits] = useState<Credits>({
    image: config.presets.standard.image,
    video: config.presets.standard.video,
    live: config.presets.standard.live,
  });

  const included = config.platformModules[platform];
  const summary = useMemo(() => {
    const moduleTotal = (module: CreditModule) => (included[module] ? config.totals[module][credits[module]] ?? 0 : 0);
    const creditsTotal = MODULES.reduce((sum, module) => sum + moduleTotal(module), 0);
    const software = config.softwareFee[platform];
    const subtotal = creditsTotal + software;
    const gst = Math.round(subtotal * config.gstRate);
    const preset = (Object.keys(config.presets) as PresetId[]).find((id) =>
      MODULES.every((module) => !included[module] || config.presets[id][module] === credits[module]));
    return { creditsTotal, software, subtotal, gst, total: subtotal + gst, preset };
  }, [config, credits, included, platform]);

  function setCredit(module: CreditModule, value: number) {
    const { min, max, step } = config.ranges[module];
    const snapped = Math.min(max, Math.max(min, Math.round(value / step) * step));
    setCredits((current) => ({ ...current, [module]: snapped }));
  }

  function applyPreset(id: PresetId) {
    const preset = config.presets[id];
    setCredits({ image: preset.image, video: preset.video, live: preset.live });
  }

  return (
    <div className="mt-12 space-y-6">
      <div className="grid gap-4 md:grid-cols-3" role="radiogroup" aria-label="Choose your platform">
        {config.platforms.map((id) => {
          const { Icon, text } = PLATFORM_TEXT[id];
          const active = platform === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPlatform(id)}
              className={`tf-card flex flex-col p-5 text-left transition ${active ? 'border-ink ring-2 ring-ink' : 'hover:border-line-strong'}`}
            >
              <span className="flex items-center gap-3">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${active ? 'bg-ink text-white' : 'bg-canvas text-ink'}`}><Icon className="h-5 w-5" /></span>
                <span className="text-xl font-bold text-ink">{config.platformLabels[id]}</span>
              </span>
              <span className="mt-3 text-sm text-muted">{text}</span>
              <span className="mt-4 space-y-1.5 text-sm">
                {MODULES.map((module) => {
                  const on = config.platformModules[id][module];
                  return (
                    <span key={module} className={`flex items-center gap-2 ${on ? 'text-ink' : 'text-subtle line-through'}`}>
                      <Check className={`h-4 w-4 shrink-0 ${on ? 'text-success' : 'opacity-0'}`} />{MODULE_NAMES[module]}
                    </span>
                  );
                })}
              </span>
              <span className="mt-4 text-sm text-muted">Software, one time: <b className="text-ink">{rupees(config.softwareFee[id])}</b></span>
            </button>
          );
        })}
      </div>

      <div className="tf-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-ink">Your credits</h3>
            <p className="mt-1 text-sm text-muted">Start from a package, then move any slider. Credits are valid for {config.validityMonths} months.</p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Starting packages">
            {(Object.keys(config.presets) as PresetId[]).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={summary.preset === id}
                onClick={() => applyPreset(id)}
                className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${summary.preset === id ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white text-ink'}`}
              >
                {config.presets[id].label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-6">
          {MODULES.map((module) => {
            const on = included[module];
            const range = config.ranges[module];
            const inputId = `pricing-${module}`;
            return (
              <div key={module} className={on ? '' : 'opacity-50'}>
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor={inputId} className={`font-semibold text-ink ${on ? '' : 'line-through'}`}>{config.labels[module]}</label>
                  <span className="tabular-nums text-lg font-bold text-ink">{on ? credits[module].toLocaleString('en-IN') : 'Not on this platform'}</span>
                </div>
                <input
                  id={inputId}
                  type="range"
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  value={credits[module]}
                  disabled={!on}
                  onChange={(event) => setCredit(module, Number(event.target.value))}
                  className="mt-2 w-full accent-[var(--color-ink)]"
                  aria-valuetext={`${credits[module]} ${config.labels[module]}`}
                />
                <div className="flex justify-between text-xs text-muted tabular-nums">
                  <span>Minimum {range.min.toLocaleString('en-IN')}</span>
                  <span>{range.max.toLocaleString('en-IN')}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="tf-card p-5 sm:p-6" aria-live="polite">
        <dl className="space-y-3 text-base">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="font-semibold text-ink">Your package{summary.preset ? ` · ${config.presets[summary.preset].label}` : ''}</dt>
            <dd className="tabular-nums text-2xl font-bold text-ink">{rupees(summary.creditsTotal)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 text-muted">
            <dt>Software for {config.platformLabels[platform]}, one time</dt>
            <dd className="tabular-nums">{rupees(summary.software)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 text-muted">
            <dt>GST ({Math.round(config.gstRate * 100)}%)</dt>
            <dd className="tabular-nums">{rupees(summary.gst)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
            <dt className="text-lg font-bold text-ink">Total to pay</dt>
            <dd className="tabular-nums text-3xl font-bold text-ink">{rupees(summary.total)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-muted">Paid upfront. When your credits run low, top up with a new package. Your TV or tablet is your own; ask us if you need one.</p>
        <a href="tel:9994837342" className="tf-btn tf-btn-primary mt-5 !min-h-12 w-full"><Phone className="h-4 w-4" /> Call us to start: 9994837342</a>
      </div>
    </div>
  );
}
