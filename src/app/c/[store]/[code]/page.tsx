'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  BadgeIndianRupee,
  CheckCircle2,
  Image as ImageIcon,
  Phone,
  Shirt,
  Sparkles,
  Store,
  WandSparkles,
} from 'lucide-react';

type CustomerPass = {
  code: string;
  storeSlug: string;
  phoneMasked: string | null;
  billLast4: string | null;
  purchaseAmount: number;
  status: string;
  tryOnEligible: boolean;
  aiVideoEligible: boolean;
  tryOnEnabled: boolean;
  aiVideoEnabled: boolean;
  expiresAt: string | null;
};

export default function CustomerPassPage() {
  const params = useParams<{ store: string; code: string }>();
  const store = params?.store || 'maharaja';
  const code = params?.code || '';
  const [pass, setPass] = useState<CustomerPass | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFlow, setActiveFlow] = useState<'try-on' | 'ai-video' | null>(null);
  const [personPreview, setPersonPreview] = useState<string | null>(null);
  const [dressPreview, setDressPreview] = useState<string | null>(null);
  const [tagPreview, setTagPreview] = useState<string | null>(null);

  const storeName = useMemo(() => (store === 'maharaja' ? 'Maharaja' : store), [store]);
  const tryOnPhotoSlots: Array<{
    label: string;
    preview: string | null;
    setter: (value: string | null) => void;
  }> = [
    { label: 'Price tag', preview: tagPreview, setter: setTagPreview },
    { label: 'Person', preview: personPreview, setter: setPersonPreview },
    { label: 'Dress', preview: dressPreview, setter: setDressPreview },
  ];

  useEffect(() => {
    let active = true;
    async function loadPass() {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/customer-pass/${code}?store=${store}`);
        const data = await res.json();
        if (!active) return;
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Unable to verify this QR pass.');
        }
        setPass(data.pass);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to verify this QR pass.');
      } finally {
        if (active) setIsLoading(false);
      }
    }

    if (code) loadPass();
    return () => {
      active = false;
    };
  }, [code, store]);

  function loadPreview(event: React.ChangeEvent<HTMLInputElement>, setter: (value: string | null) => void) {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setter(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  }

  const optionCard = (
    title: string,
    subtitle: string,
    amountRule: string,
    enabled: boolean,
    onClick: () => void,
    icon: React.ReactNode
  ) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      className={`w-full border p-5 text-left shadow-sm transition ${
        enabled
          ? 'border-[#6e0d1f]/25 bg-white text-[#2A060C] hover:border-[#6e0d1f]'
          : 'border-slate-200 bg-slate-100 text-slate-400'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={`flex h-12 w-12 items-center justify-center ${enabled ? 'bg-[#6e0d1f] text-[#F3E5AB]' : 'bg-slate-200 text-slate-400'}`}>
          {icon}
        </div>
        <span className={`border px-2 py-1 text-[10px] font-black uppercase tracking-wider ${
          enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-400'
        }`}>
          {enabled ? 'Active' : 'Inactive'}
        </span>
      </div>
      <h2 className="mt-5 font-serif text-2xl font-black">{title}</h2>
      <p className="mt-2 text-sm font-semibold leading-6">{subtitle}</p>
      <p className="mt-4 text-xs font-black uppercase tracking-wider text-[#8A6A20]">{amountRule}</p>
    </button>
  );

  return (
    <main className="min-h-screen bg-[#F8F5EE] px-4 py-5 text-[#1A1412]">
      <section className="mx-auto max-w-md">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center bg-[#6e0d1f] text-[#F3E5AB]">
              <WandSparkles className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-serif text-2xl font-black text-[#6e0d1f]">tryfocus</span>
              <span className="block text-[10px] font-black uppercase tracking-[0.24em] text-[#8A6A20]">
                customer entry
              </span>
            </span>
          </Link>
          <span className="border border-[#6e0d1f]/15 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#6e0d1f]">
            QR
          </span>
        </header>

        <div className="mt-5 border border-[#d8c49b] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Store className="h-5 w-5 text-[#6e0d1f]" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#8A6A20]">Selected store</p>
              <h1 className="font-serif text-2xl font-black text-[#2A060C]">{storeName}</h1>
            </div>
          </div>

          {isLoading ? (
            <div className="mt-5 border border-amber-200 bg-[#fffaf0] p-4 text-sm font-bold text-[#6e0d1f]">
              Verifying customer pass...
            </div>
          ) : error ? (
            <div className="mt-5 flex items-start gap-3 border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : pass ? (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="border border-[#eee1c5] bg-[#fffaf0] p-3">
                <Phone className="h-4 w-4 text-[#6e0d1f]" />
                <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-[#8A6A20]">Phone</p>
                <p className="mt-1 font-mono text-sm font-black">{pass.phoneMasked}</p>
              </div>
              <div className="border border-[#eee1c5] bg-[#fffaf0] p-3">
                <BadgeIndianRupee className="h-4 w-4 text-[#6e0d1f]" />
                <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-[#8A6A20]">Bill</p>
                <p className="mt-1 font-mono text-sm font-black">****{pass.billLast4}</p>
              </div>
            </div>
          ) : null}
        </div>

        {pass && (
          <>
            <section className="mt-5 grid grid-cols-1 gap-4">
              {optionCard(
                'AI Try-On',
                'Preview the selected dress on your photo. Staff will verify the product tag before generation.',
                'Allowed above Rs 500',
                pass.tryOnEnabled && pass.tryOnEligible,
                () => setActiveFlow('try-on'),
                <Shirt className="h-6 w-6" />
              )}
              {optionCard(
                'AI Event Video',
                'Create a premium event fashion video for showroom TV and download.',
                'Allowed above Rs 5000',
                pass.aiVideoEnabled && pass.aiVideoEligible,
                () => setActiveFlow('ai-video'),
                <Sparkles className="h-6 w-6" />
              )}
            </section>

            {activeFlow === 'try-on' && (
              <section className="mt-5 border border-[#d8c49b] bg-white p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#8A6A20]">Try-on test shell</p>
                <h2 className="mt-2 font-serif text-2xl font-black text-[#2A060C]">Add tag, person and dress photos</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#5C4B43]">
                  API connection is pending. This shell confirms the exact retail flow before FASHN integration.
                </p>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  {tryOnPhotoSlots.map(({ label, preview, setter }) => (
                    <label key={label} className="block cursor-pointer">
                      <div className="aspect-[3/4] border border-dashed border-[#d8c49b] bg-[#fffaf0]">
                        {preview ? (
                          <img src={preview} alt={label} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-slate-400">
                            <ImageIcon className="h-6 w-6" />
                            <span className="text-[10px] font-black uppercase tracking-wider">{label}</span>
                          </div>
                        )}
                      </div>
                      <div className="mt-2 bg-[#6e0d1f] px-2 py-2 text-center text-[10px] font-black uppercase tracking-wider text-[#F3E5AB]">
                        Add Photo
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => loadPreview(event, setter)}
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-5 border border-amber-200 bg-[#fffaf0] p-4 text-xs font-bold leading-5 text-[#6e0d1f]">
                  FASHN API will be connected here: one person photo plus one dress photo. Price tag stays as the store-side validation step.
                </div>
              </section>
            )}

            {activeFlow === 'ai-video' && (
              <section className="mt-5 border border-[#6e0d1f]/25 bg-[#17070a] p-5 text-[#F3E5AB] shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D4AF37]">AI video access active</p>
                <h2 className="mt-2 font-serif text-2xl font-black">Staff-assisted video studio</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#F3E5AB]/80">
                  Open the Maharaja operator studio at the photo stand. This keeps expensive generation controlled by staff.
                </p>
                <Link
                  href={`/login?next=/studio`}
                  className="mt-5 flex w-full items-center justify-center gap-2 bg-[#D4AF37] px-5 py-4 text-xs font-black uppercase tracking-wider text-black"
                >
                  Open Video Studio <ArrowRight className="h-4 w-4" />
                </Link>
              </section>
            )}

            <section className="mt-5 border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold leading-5 text-emerald-900">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" />
                <p>
                  This pass is controlled by Maharaja billing and staff. Disabled services cannot start from this QR.
                </p>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
