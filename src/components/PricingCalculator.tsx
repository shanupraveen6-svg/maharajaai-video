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
  /** Phone is one package: the fee includes these credits; extra credits are added from `extraTotals`. */
  phonePackage: { fee: number; credits: number; retryPercent: number; totalCredits: number; extraRange: { min: number; max: number; step: number }; extraTotals: Record<number, number> };
  /** November offer: no software charge and 60 free Try-On credits on Phone. */
  novemberOffer: boolean;
};

const PLATFORM_TEXT: Record<Platform, { Icon: typeof Tv; text: string }> = {
  tv: { Icon: Tv, text: 'A portrait TV in your showroom. Phone Try-On included.' },
  tablet: { Icon: Tablet, text: 'A tablet at your counter. Phone Try-On included.' },
  phone: { Icon: Smartphone, text: 'Shoppers use their own phones through your Wall QR.' },
};

const MODULE_NAMES: Record<CreditModule, string> = { image: 'Try-On', video: 'AI Video with Go Live', live: 'Live Mirror' };

const MODULES: CreditModule[] = ['image', 'video', 'live'];

const rupees = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;

export default function PricingCalculator({ config }: { config: PricingCalculatorConfig }) {
  // Phone Try-On is what we promote first.
  const [platform, setPlatform] = useState<Platform>('phone');
  const [phoneExtra, setPhoneExtra] = useState(0);
  const [credits, setCredits] = useState<Credits>({
    image: config.presets.standard.image,
    video: config.presets.standard.video,
    live: config.presets.standard.live,
  });

  const included = config.platformModules[platform];
  const isPhone = platform === 'phone';
  const summary = useMemo(() => {
    const moduleTotal = (module: CreditModule) => (included[module] ? config.totals[module][credits[module]] ?? 0 : 0);
    const creditsTotal = isPhone ? config.phonePackage.extraTotals[phoneExtra] ?? 0 : MODULES.reduce((sum, module) => sum + moduleTotal(module), 0);
    const software = isPhone ? config.phonePackage.fee : config.softwareFee[platform];
    const subtotal = creditsTotal + software;
    const gst = Math.round(subtotal * config.gstRate);
    const preset = (Object.keys(config.presets) as PresetId[]).find((id) =>
      MODULES.every((module) => !included[module] || config.presets[id][module] === credits[module]));
    return { creditsTotal, software, subtotal, gst, total: subtotal + gst, preset };
  }, [config, credits, included, platform, isPhone, phoneExtra]);

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
              {id === 'phone' ? (
                <span className="mt-4 text-sm text-muted">
                  Package: <b className="text-ink">{rupees(config.phonePackage.fee)}</b> with {config.phonePackage.credits.toLocaleString('en-IN')} Try-On + {config.phonePackage.retryPercent}% retries
                  {config.novemberOffer && <span className="mt-2 block w-fit rounded-full bg-[#D4AF37] px-3 py-1 text-xs font-bold text-[#2A060C]">Free in November · 60 Try-Ons</span>}
                </span>
              ) : (
                <span className="mt-4 text-sm text-muted">Software, one time: <b className="text-ink">{rupees(config.softwareFee[id])}</b></span>
              )}
            </button>
          );
        })}
      </div>

      {isPhone ? (
      <div className="tf-card p-5 sm:p-6">
        <h3 className="text-xl font-bold text-ink">Phone package</h3>
        <p className="mt-1 text-sm text-muted">{rupees(config.phonePackage.fee)} includes {config.phonePackage.credits.toLocaleString('en-IN')} Try-Ons plus {config.phonePackage.retryPercent}% for customer retries ({config.phonePackage.totalCredits.toLocaleString('en-IN')} in all). Need more? Top up at ₹10 per Try-On, from 500.</p>
        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="pricing-phone-extra" className="font-semibold text-ink">Top-up Try-Ons (optional, ₹10 each)</label>
            <span className="tabular-nums text-lg font-bold text-ink">{phoneExtra.toLocaleString('en-IN')}</span>
          </div>
          <input
            id="pricing-phone-extra"
            type="range"
            min={config.phonePackage.extraRange.min}
            max={config.phonePackage.extraRange.max}
            step={config.phonePackage.extraRange.step}
            value={phoneExtra}
            onChange={(event) => setPhoneExtra(Number(event.target.value))}
            className="mt-2 w-full accent-[var(--color-ink)]"
            aria-valuetext={`${phoneExtra} extra Try-On credits`}
          />
          <div className="flex justify-between text-xs text-muted tabular-nums">
            <span>None · minimum 500</span>
            <span>{config.phonePackage.extraRange.max.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>
      ) : (
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
      )}

      <div className="tf-card p-5 sm:p-6" aria-live="polite">
        <dl className="space-y-3 text-base">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="font-semibold text-ink">{isPhone ? `Phone package · ${config.phonePackage.totalCredits.toLocaleString('en-IN')} Try-On credits` : `Your package${summary.preset ? ` · ${config.presets[summary.preset].label}` : ''}`}</dt>
            <dd className="tabular-nums text-2xl font-bold text-ink">{rupees(isPhone ? summary.software : summary.creditsTotal)}</dd>
          </div>
          {isPhone ? (
            phoneExtra > 0 && (
              <div className="flex items-baseline justify-between gap-4 text-muted">
                <dt>{phoneExtra.toLocaleString('en-IN')} top-up Try-Ons × ₹10</dt>
                <dd className="tabular-nums">{rupees(summary.creditsTotal)}</dd>
              </div>
            )
          ) : (
            <div className="flex items-baseline justify-between gap-4 text-muted">
              <dt>Software for {config.platformLabels[platform]}, one time</dt>
              <dd className="tabular-nums">{rupees(summary.software)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-4 text-muted">
            <dt>GST ({Math.round(config.gstRate * 100)}%)</dt>
            <dd className="tabular-nums">{rupees(summary.gst)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
            <dt className="text-lg font-bold text-ink">Total to pay</dt>
            <dd className="tabular-nums text-3xl font-bold text-ink">{rupees(summary.total)}</dd>
          </div>
        </dl>
        {isPhone && config.novemberOffer && (
          <p className="mt-3 rounded-2xl bg-[#2A060C] p-3 text-sm font-semibold text-[#F3E5AB]">November offer: no software fee this month and 60 Try-Ons included. Top up anytime, pay as you go. Valid until 30 November.</p>
        )}
        <p className="mt-3 text-sm text-muted">{isPhone ? 'Paid upfront. Top up anytime; you pay only for what you use.' : 'Paid upfront. When your credits run low, top up with a new package. Your TV or tablet is your own; ask us if you need one.'}</p>
        <a href="tel:9994837342" className="tf-btn tf-btn-primary mt-5 !min-h-12 w-full"><Phone className="h-4 w-4" /> Talk to sales: 9994837342</a>
      </div>
    </div>
  );
}
