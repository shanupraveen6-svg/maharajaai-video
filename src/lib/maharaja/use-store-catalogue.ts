'use client';

import { useEffect, useState } from 'react';
import type { TryFocusProduct } from '@/lib/tryfocus/sample-data';
import { fetchCompleteCatalogue } from './catalogue-client';

export function useStoreCatalogue(accessCode = '') {
  const [products, setProducts] = useState<TryFocusProduct[]>([]);
  useEffect(() => {
    let active = true;
    fetchCompleteCatalogue(false, accessCode).then((items) => {
      if (active) setProducts(items.map((item) => ({ ...item, badge: item.newArrival ? 'NEW ARRIVAL' : item.badge })));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [accessCode]);
  return products;
}
