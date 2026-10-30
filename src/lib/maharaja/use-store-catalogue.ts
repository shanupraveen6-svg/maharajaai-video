'use client';

import { useEffect, useState } from 'react';
import { sampleCatalogue, type TryFocusProduct } from '@/lib/tryfocus/sample-data';
import { fetchCompleteCatalogue } from './catalogue-client';

export function useStoreCatalogue() {
  const [products, setProducts] = useState<TryFocusProduct[]>(sampleCatalogue);
  useEffect(() => {
    let active = true;
    fetchCompleteCatalogue().then((items) => {
      if (active) setProducts(items.map((item) => ({ ...item, badge: item.newArrival ? 'NEW ARRIVAL' : item.badge })));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return products;
}
