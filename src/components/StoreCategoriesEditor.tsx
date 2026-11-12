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
  GARMENT_TYPE_OPTIONS,
  type CustomCategory,
  type GarmentType,
  type StoreCategoryLists,
} from '@/lib/tryfocus/store-categories';

const AUDIENCE_LABELS: Record<CatalogueAudience, string> = { women: 'Women', men: 'Men', boys: 'Boys', girls: 'Girls' };

/**
 * The categories customers see on the TV, tablet and phone, per audience and in this order. The store
 * removes a category it does not sell, adds one from the shared list, or makes its own category entirely
 * (naming it and saying what it looks like, so Try-On and AI Video still render it correctly). Each
 * audience keeps at least one.
 */
export default function StoreCategoriesEditor({ lists, customCategories, saving, onSave, onAddCustom, onDeleteCustom }: {
  lists: StoreCategoryLists | undefined;
  customCategories?: CustomCategory[];
  saving: boolean;
  onSave: (next: StoreCategoryLists) => void;
  onAddCustom: (input: { label: string; gender: CatalogueAudience; garmentType: GarmentType; westernTryOnEligible: boolean }) => void;
  onDeleteCustom: (id: string) => void;
}) {
  const [audience, setAudience] = useState<CatalogueAudience | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newGarmentType, setNewGarmentType] = useState<GarmentType>('shirt_pant');
  const [newWestern, setNewWestern] = useState(false);

  const shown = audience ? categoriesFor(lists, audience, customCategories) : [];
  const hidden = audience ? allCategoriesFor(audience, customCategories).filter((cat) => !shown.some((item) => item.id === cat.id)) : [];

  function save(ids: CatalogueCategoryId[]) {
    if (!audience) return;
    // Every audience is saved explicitly, so changing one never resets another.
    const next: StoreCategoryLists = {};
    for (const key of AUDIENCES) next[key] = categoriesFor(lists, key, customCategories).map((cat) => cat.id as CatalogueCategoryId);
    next[audience] = ids;
    onSave(next);
  }

  function submitCustom() {
    if (!audience || !newLabel.trim()) return;
    onAddCustom({ label: newLabel.trim(), gender: audience, garmentType: newGarmentType, westernTryOnEligible: newWestern });
    setNewLabel('');
    setNewGarmentType('shirt_pant');
    setNewWestern(false);
    setAdding(false);
  }

  return (
    <section className="tf-card p-6">
      <h2 className="text-lg font-bold">Categories customers see</h2>
      <p className="mt-1 text-sm text-muted">Remove what you do not sell, add what you do, or make your own category. Customers see them in this order.</p>
      <div className="mt-4 max-w-md">
        <Segmented size="sm" label="Who is it for?" value={audience} onChange={(value) => { setAudience(value); setAdding(false); }} options={AUDIENCES.map((value) => ({ value, label: AUDIENCE_LABELS[value] }))} />
      </div>
      {!audience && <p className="mt-4 text-sm text-muted">Tap Women, Men, Boys or Girls to change their categories.</p>}
      <ul className="mt-4 flex flex-wrap gap-2" aria-label={audience ? `${AUDIENCE_LABELS[audience]} categories shown` : undefined}>
        {shown.map((cat) => {
          const custom = isCustomCategoryId(cat.id as string);
          return (
            <li key={cat.id} className="inline-flex min-h-10 items-center gap-1 rounded-full bg-ink pl-4 pr-1 text-sm font-semibold text-white">
              {cat.label}
              <button
                type="button"
                disabled={saving || shown.length <= 1}
                onClick={() => (custom ? onDeleteCustom(cat.id as string) : save(shown.filter((item) => item.id !== cat.id).map((item) => item.id as CatalogueCategoryId)))}
                aria-label={custom ? `Delete ${cat.label}` : `Remove ${cat.label}`}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
      {hidden.length > 0 && (
        <>
          <p className="mt-4 text-sm font-semibold text-muted">Add</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {hidden.map((cat) => (
              <li key={cat.id}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => save([...shown.map((item) => item.id as CatalogueCategoryId), cat.id as CatalogueCategoryId])}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line-strong bg-white px-4 text-sm font-semibold text-ink hover:border-ink disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> {cat.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {audience && !adding && (
        <button type="button" onClick={() => setAdding(true)} className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-4 text-sm font-semibold text-ink hover:border-ink">
          <Plus className="h-4 w-4" /> New category
        </button>
      )}
      {audience && adding && (
        <div className="mt-4 rounded-2xl border border-line bg-canvas p-4">
          <p className="text-sm font-semibold text-ink">New {AUDIENCE_LABELS[audience]} category</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="new-category-label" className="mb-1 block text-xs font-bold text-muted">Name</label>
              <input id="new-category-label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Jumpsuits" maxLength={40} className="min-h-11 w-full rounded-lg border border-line-strong bg-white px-3 text-sm font-semibold text-ink" />
            </div>
            <div>
              <label htmlFor="new-category-type" className="mb-1 block text-xs font-bold text-muted">What does it look like? (so Try-On renders it right)</label>
              <select id="new-category-type" value={newGarmentType} onChange={(e) => setNewGarmentType(e.target.value as GarmentType)} className="min-h-11 w-full rounded-lg border border-line-strong bg-white px-3 text-sm font-semibold text-ink">
                {GARMENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" checked={newWestern} onChange={(e) => setNewWestern(e.target.checked)} className="h-4 w-4" />
            Offer on Western Try-On
          </label>
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={saving || !newLabel.trim()} onClick={submitCustom} className="tf-btn tf-btn-primary !min-h-10 px-4 text-sm disabled:opacity-50">Add category</button>
            <button type="button" onClick={() => setAdding(false)} className="tf-btn tf-btn-secondary !min-h-10 px-4 text-sm">Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
