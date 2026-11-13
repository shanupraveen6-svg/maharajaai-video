'use client';

import { AgreeButton } from '@/components/ui';

import { useCallback, useRef, useState } from 'react';
import { Download, LoaderCircle, X } from 'lucide-react';
import { usePhoneLanguage } from '@/lib/tryfocus/phone-language';

/**
 * The customer's WhatsApp number before any download on the phone. A download never starts on its own:
 * the customer taps Download, enters a number once, and every download of that link then works for the
 * rest of the visit. The number becomes a lead in the store's workspace; offers are a separate, optional
 * tick. The server checks the token this returns, so the form cannot be skipped.
 */
export type LeadKind = 'pass' | 'looks';
export type LeadSource = 'try-on' | 'ai-video' | 'live-mirror' | 'tv-looks';

function storageKey(kind: LeadKind, ref: string) {
  return `tryfocus:lead:${kind}:${ref}`;
}

function savedToken(kind: LeadKind, ref: string) {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(storageKey(kind, ref)) || 'null');
    // Tokens last a day on the server; drop them a little earlier here.
    return saved?.token && Number(saved.savedAt) > Date.now() - 20 * 60 * 60 * 1000 ? String(saved.token) : '';
  } catch {
    return '';
  }
}

export function useLeadGate({ kind, ref, source }: { kind: LeadKind; ref: string; source: LeadSource }) {
  const { t } = usePhoneLanguage();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  // AI Video also asks for a name and city; Try-On asks for the number only.
  const asksDetails = source === 'ai-video';
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [offers, setOffers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef<((token: string) => void | Promise<void>) | null>(null);

  /** Runs `action` with the lead token, asking for the number first when this link has none yet. */
  const withLead = useCallback((action: (token: string) => void | Promise<void>) => {
    const token = ref ? savedToken(kind, ref) : '';
    if (token) return Promise.resolve(action(token));
    pending.current = action;
    setError('');
    setOpen(true);
    return Promise.resolve();
  }, [kind, ref]);

  /** A token the server refused (expired): forget it so the next tap asks again. */
  const forgetLead = useCallback(() => {
    try { window.sessionStorage.removeItem(storageKey(kind, ref)); } catch { /* private mode */ }
  }, [kind, ref]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setError(t('leadInvalid'));
      return;
    }
    if (asksDetails && (!name.trim() || !city.trim())) {
      setError(t('leadNameCityMissing'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/maharaja/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, ref, source, phone: digits, marketingConsent: offers, ...(asksDetails ? { name: name.trim(), city: city.trim() } : {}) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.token) throw new Error(data?.error || t('leadInvalid'));
      try { window.sessionStorage.setItem(storageKey(kind, ref), JSON.stringify({ token: data.token, savedAt: Date.now(), name: name.trim(), city: city.trim() })); } catch { /* private mode */ }
      // A number the store already has: say so for a moment, then the download continues.
      if (data.alreadyRegistered) {
        setNotice(t('leadAlreadyRegistered'));
        await new Promise((resolve) => window.setTimeout(resolve, 1600));
        setNotice('');
      }
      setOpen(false);
      const action = pending.current;
      pending.current = null;
      if (action) await action(data.token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('leadInvalid'));
    } finally {
      setBusy(false);
    }
  }

  const dialog = open ? (
    <div role="dialog" aria-modal="true" aria-labelledby="lead-gate-title" className="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="lead-gate-title" className="text-2xl font-bold">{t('leadTitle')}</h2>
            <p className="mt-1 text-[15px] text-muted">{t('leadText')}</p>
          </div>
          <button type="button" onClick={() => { setOpen(false); pending.current = null; }} aria-label={t('cancel')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line-strong"><X className="h-5 w-5" /></button>
        </div>
        <label htmlFor="lead-gate-phone" className="mt-5 block text-sm font-semibold text-ink">{t('leadNumber')}</label>
        <div className="mt-1.5 flex min-h-12 items-center rounded-xl border border-line-strong bg-white focus-within:border-ink">
          <span className="pl-3 pr-1 text-base font-semibold text-muted">+91</span>
          <input
            id="lead-gate-phone"
            value={phone}
            onChange={(event) => setPhone(tenDigits(event.target.value))}
            inputMode="numeric"
            maxLength={10}
            pattern="[0-9]{10}"
            autoComplete="tel-national"
            placeholder="9876543210"
            autoFocus
            className="min-h-12 min-w-0 flex-1 bg-transparent px-2 text-lg tabular-nums outline-none"
          />
        </div>
        {asksDetails && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="block text-sm font-semibold text-ink">{t('leadName')}</span>
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoComplete="name" className="mt-1.5 min-h-12 w-full rounded-xl border border-line-strong bg-white px-3 text-lg outline-none focus:border-ink" />
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-ink">{t('leadCity')}</span>
              <input value={city} onChange={(event) => setCity(event.target.value)} maxLength={60} autoComplete="address-level2" className="mt-1.5 min-h-12 w-full rounded-xl border border-line-strong bg-white px-3 text-lg outline-none focus:border-ink" />
            </label>
          </div>
        )}
        <AgreeButton size="md" checked={offers} onChange={setOffers}>{t('leadOffers')}</AgreeButton>
        {error && <p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger">{error}</p>}
        {notice && <p role="status" className="mt-3 rounded-xl bg-warn-soft p-3 text-sm font-semibold text-ink">{notice}</p>}
        <button type="submit" disabled={busy} className="tf-btn tf-btn-primary mt-5 !min-h-12 w-full text-base">
          {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />} {t('leadSubmit')}
        </button>
        <p className="mt-3 text-center text-xs text-muted">{t('leadPrivacy')}</p>
      </form>
    </div>
  ) : null;

  /** The name and city given on this link (AI Video asks for both), so Go Live doesn't ask again. */
  const details = useCallback((): { name: string; city: string } => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(storageKey(kind, ref)) || 'null');
      return { name: String(saved?.name || ''), city: String(saved?.city || '') };
    } catch {
      return { name: '', city: '' };
    }
  }, [kind, ref]);

  return { withLead, forgetLead, details, dialog };
}

/** A WhatsApp number as 10 digits: +91 or a leading 0 from a pasted number is dropped. */
function tenDigits(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length > 10 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
}
