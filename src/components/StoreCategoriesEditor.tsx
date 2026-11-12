'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Segmented } from '@/components/ui';
import type { CatalogueAudience, CatalogueCategoryId } from '@/lib/tryfocus/sample-data';
import {
  AUDIENCES,
  allCategoriesFor,
  categoriesFor,
  isCustomCategoryId,
  isWesternCategory,
  GARMENT_TYPE_OPTIONS,
  WESTERN_GARMENT_TYPES,
  type CustomCategory,
  type GarmentType,
  type StoreCategory,
  type StoreCategoryLists,
  type WesternOverrides,
} from '@/lib/tryfocus/store-categories';

const AUDIENCE_LABELS: Record<CatalogueAudience, string> = { women: 'Women', men: 'Men', boys: 'Boys', girls: 'Girls' };

/**
 * The categories customers see, per audience, in two groups: Western wear (WW on: also offered on Western
 * Try-On, and a garment uploaded into it starts switched on there) and other wear (Try-On only). Tapping
 * WW on a category moves it between the groups and brings the garments already in it along. ✕ hides a
 * standard category, or deletes one the store made — once nothing is left in it.
 */
export default function StoreCategoriesEditor({
  variant = 'tryon',
  lists,
  customCategories = [],
  westernOverrides = {},
  garmentCounts = {},
  saving,
  onSave,
  onAddCustom,
  onDeleteCustom,
  onWestern,
}: {
  /** 'video' edits AI Video's own list: one group, no WW, no new categories (made on Try-On). */
  variant?: 'tryon' | 'video';
  lists: StoreCategoryLists | undefined;
  customCategories?: CustomCategory[];
  westernOverrides?: WesternOverrides;
  /** Garments in each category, so a category isn't deleted out from under them. */
  garmentCounts?: Record<string, number>;
  saving: boolean;
  onSave: (next: StoreCategoryLists) => void;
  onAddCustom?: (input: { label: string; gender: CatalogueAudience; garmentType: GarmentType; westernTryOnEligible: boolean }) => void;
  onDeleteCustom?: (id: string) => void;
  onWestern?: (categoryId: string, western: boolean) => void;
}) {
  const [audience, setAudience] = useState<CatalogueAudience | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newGarmentType, setNewGarmentType] = useState<GarmentType>('shirt_pant');
  const [newWestern, setNewWestern] = useState(true);
  const [blocked, setBlocked] = useState('');

  const shown = audience ? categoriesFor(lists, audience, customCategories) : [];
  const hidden = audience ? allCategoriesFor(audience, customCategories).filter((cat) => !shown.some((item) => item.id === cat.id)) : [];
  const western = (cat: StoreCategory) => isWesternCategory(cat.id, customCategories, westernOverrides);
  const westernShown = shown.filter(western);
  const otherShown = shown.filter((cat) => !western(cat));

  function save(ids: CatalogueCategoryId[]) {
    if (!audience) return;
    // Every audience is saved explicitly, so changing one never resets another.
    const next: StoreCategoryLists = {};
    for (const key of AUDIENCES) next[key] = categoriesFor(lists, key, customCategories).map((cat) => cat.id as CatalogueCategoryId);
    next[audience] = ids;
    onSave(next);
  }

  function remove(cat: StoreCategory) {
    setBlocked('');
    const count = garmentCounts[cat.id] || 0;
    if (variant === 'tryon' && isCustomCategoryId(cat.id as string)) {
      if (count > 0) { setBlocked(`${cat.label} still has ${count} garment(s). Move them to another category or delete them first.`); return; }
      onDeleteCustom?.(cat.id as string);
      return;
    }
    save(shown.filter((item) => item.id !== cat.id).map((item) => item.id as CatalogueCategoryId));
  }

  function chooseType(type: GarmentType) {
    setNewGarmentType(type);
    setNewWestern(WESTERN_GARMENT_TYPES.has(type));
  }

  function submitCustom() {
    if (!audience || !newLabel.trim()) return;
    onAddCustom?.({ label: newLabel.trim(), gender: audience, garmentType: newGarmentType, westernTryOnEligible: newWestern });
    setNewLabel('');
    chooseType('shirt_pant');
    setAdding(false);
  }

  function chip(cat: StoreCategory) {
    const ww = western(cat);
    const count = garmentCounts[cat.id] || 0;
    const custom = isCustomCategoryId(cat.id as string);
    return (
      <li key={cat.id} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong bg-white py-1 pl-4 pr-1 text-sm font-semibold text-ink">
        {cat.label}
        <span className="text-xs font-medium tabular-nums text-subtle">{count}</span>
        {variant === 'tryon' && <button
          type="button"
          disabled={saving}
          aria-pressed={ww}
          onClick={() => onWestern?.(cat.id as string, !ww)}
          title={ww ? 'Western wear: tap to make it Try-On only' : 'Tap to make it Western wear'}
          className={`ml-1 min-h-8 rounded-full px-2.5 text-[11px] font-bold transition ${ww ? 'bg-ink text-white' : 'border border-line-strong text-muted hover:border-ink hover:text-ink'}`}
        >
          WW
        </button>}
        <button
          type="button"
          disabled={saving || shown.length <= 1}
          onClick={() => remove(cat)}
          aria-label={custom && variant === 'tryon' ? `Delete ${cat.label}` : `Hide ${cat.label}`}
          title={custom && variant === 'tryon' ? 'Delete this category' : variant === 'video' ? 'Take this category off AI Video' : 'Hide this category from customers'}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-40"
        >
          <X className="h-4 w-4" />
        </button>
      </li>
    );
  }

  return (
    <div className="space-y-5">
      <div className="max-w-md">
        <Segmented size="sm" label="Who is it for?" value={audience} onChange={(value) => { setAudience(value); setAdding(false); setBlocked(''); }} options={AUDIENCES.map((value) => ({ value, label: AUDIENCE_LABELS[value] }))} />
      </div>
      {!audience && <p className="text-sm text-muted">Tap Women, Men, Boys or Girls to change their categories.</p>}

      {audience && (
        <>
          {variant === 'video' ? (
            <div>
              <p className="text-sm font-semibold text-ink">AI Video categories <span className="font-normal text-muted">· what the TV&apos;s AI Video screen offers</span></p>
              <ul className="mt-2 flex flex-wrap gap-2">{shown.map(chip)}</ul>
            </div>
          ) : <>
          <div>
            <p className="text-sm font-semibold text-ink">Western wear <span className="font-normal text-muted">· WW on: also offered on Western Try-On, and new uploads start switched on there</span></p>
            <ul className="mt-2 flex flex-wrap gap-2">{westernShown.length ? westernShown.map(chip) : <li className="text-sm text-muted">None yet. Tap WW on a category below to add it here.</li>}</ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Other wear <span className="font-normal text-muted">· Try-On only</span></p>
            <ul className="mt-2 flex flex-wrap gap-2">{otherShown.length ? otherShown.map(chip) : <li className="text-sm text-muted">None.</li>}</ul>
          </div>
          </>}
          {blocked && <p className="rounded-xl bg-warn-soft p-3 text-sm text-ink">{blocked}</p>}

          {hidden.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-muted">{variant === 'video' ? 'Not on AI Video — tap to add' : 'Hidden from customers — tap to show again'}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {hidden.map((cat) => (
                  <li key={cat.id}>
                    <button type="button" disabled={saving} onClick={() => save([...shown.map((item) => item.id as CatalogueCategoryId), cat.id as CatalogueCategoryId])} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-dashed border-line-strong bg-white px-4 text-sm font-semibold text-muted hover:border-ink hover:text-ink disabled:opacity-50">
                      <Plus className="h-4 w-4" /> {cat.label}{garmentCounts[cat.id] ? <span className="text-xs tabular-nums"> · {garmentCounts[cat.id]}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {variant === 'video' ? null : !adding ? (
            <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-ink bg-white px-5 text-sm font-semibold text-ink hover:bg-canvas">
              <Plus className="h-4 w-4" /> New {AUDIENCE_LABELS[audience]} category
            </button>
          ) : (
            <div className="rounded-2xl border border-line bg-canvas p-4">
              <p className="text-sm font-semibold text-ink">New {AUDIENCE_LABELS[audience]} category</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-muted">Name</span>
                  <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitCustom(); }} placeholder="e.g. Jumpsuits" maxLength={40} className="min-h-11 w-full rounded-lg border border-line-strong bg-white px-3 text-sm font-semibold text-ink" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-muted">What it looks like (so Try-On makes it right)</span>
                  <select value={newGarmentType} onChange={(e) => chooseType(e.target.value as GarmentType)} className="min-h-11 w-full rounded-lg border border-line-strong bg-white px-3 text-sm font-semibold text-ink">
                    {GARMENT_TYPE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </label>
                <button type="button" aria-pressed={newWestern} onClick={() => setNewWestern((on) => !on)} className={`min-h-11 rounded-full px-4 text-sm font-bold ${newWestern ? 'bg-ink text-white' : 'border border-line-strong bg-white text-muted'}`}>
                  WW {newWestern ? 'on' : 'off'}
                </button>
              </div>
              <div className="mt-4 flex gap-2">
                <button type="button" disabled={saving || !newLabel.trim()} onClick={submitCustom} className="tf-btn tf-btn-primary !min-h-11 px-5 text-sm disabled:opacity-50">Add category</button>
                <button type="button" onClick={() => setAdding(false)} className="tf-btn tf-btn-secondary !min-h-11 px-5 text-sm">Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
