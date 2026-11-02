'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Segmented } from '@/components/ui';
import type { CatalogueAudience, CatalogueCategoryId } from '@/lib/tryfocus/sample-data';
import { AUDIENCES, allCategoriesFor, categoriesFor, type StoreCategoryLists } from '@/lib/tryfocus/store-categories';

const AUDIENCE_LABELS: Record<CatalogueAudience, string> = { women: 'Women', men: 'Men', boys: 'Boys', girls: 'Girls' };

/**
 * The categories customers see on the TV, tablet and phone, per audience and in this order. The store
 * removes a category it does not sell and adds one it does; each audience keeps at least one.
 */
export default function StoreCategoriesEditor({ lists, saving, onSave }: {
  lists: StoreCategoryLists | undefined;
  saving: boolean;
  onSave: (next: StoreCategoryLists) => void;
}) {
  const [audience, setAudience] = useState<CatalogueAudience>('women');
  const shown = categoriesFor(lists, audience);
  const hidden = allCategoriesFor(audience).filter((cat) => !shown.some((item) => item.id === cat.id));

  function save(ids: CatalogueCategoryId[]) {
    // Every audience is saved explicitly, so changing one never resets another.
    const next: StoreCategoryLists = {};
    for (const key of AUDIENCES) next[key] = categoriesFor(lists, key).map((cat) => cat.id as CatalogueCategoryId);
    next[audience] = ids;
    onSave(next);
  }

  return (
    <section className="tf-card p-6">
      <h2 className="text-lg font-bold">Categories customers see</h2>
      <p className="mt-1 text-sm text-muted">Remove what you do not sell and add what you do. Customers see them in this order.</p>
      <div className="mt-4 max-w-md">
        <Segmented size="sm" label="Who is it for?" value={audience} onChange={setAudience} options={AUDIENCES.map((value) => ({ value, label: AUDIENCE_LABELS[value] }))} />
      </div>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label={`${AUDIENCE_LABELS[audience]} categories shown`}>
        {shown.map((cat) => (
          <li key={cat.id} className="inline-flex min-h-10 items-center gap-1 rounded-full bg-ink pl-4 pr-1 text-sm font-semibold text-white">
            {cat.label}
            <button
              type="button"
              disabled={saving || shown.length <= 1}
              onClick={() => save(shown.filter((item) => item.id !== cat.id).map((item) => item.id as CatalogueCategoryId))}
              aria-label={`Remove ${cat.label}`}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
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
    </section>
  );
}
