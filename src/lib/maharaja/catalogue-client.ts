import type { StoreCategoryLists } from '@/lib/tryfocus/store-categories';
import type { WorkspaceAccess } from '@/lib/maharaja/access';
import type { PublicCatalogueProduct } from './catalogue-types';

/** `accessCode` (a customer QR or pass code) selects the client's catalogue on pages without a staff login. */
export async function fetchCompleteCatalogue(includeInactive = false, accessCode = '', workspaceCode = ''): Promise<PublicCatalogueProduct[]> {
  const access = accessCode ? `&access=${encodeURIComponent(accessCode)}` : '';
  const code = workspaceCode ? `&workspaceCode=${encodeURIComponent(workspaceCode)}` : '';
  const query = (offset: number) => `/api/maharaja/catalogue?offset=${offset}&limit=100${includeInactive ? '&includeInactive=true' : ''}${access}${code}`;
  const first = await fetch(query(0), { cache: 'no-store' });
  const initial = await first.json();
  if (!first.ok || !initial.success || !Array.isArray(initial.products)) throw new Error(initial.error || 'Could not load catalogue.');
  const total = Math.min(Math.max(0, Number(initial.total) || 0), 10_000);
  const offsets = Array.from({ length: Math.max(0, Math.ceil(total / 100) - 1) }, (_, index) => (index + 1) * 100);
  const pages = await Promise.all(offsets.map(async (offset) => {
    const response = await fetch(query(offset), { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.success || !Array.isArray(data.products)) throw new Error(data.error || `Could not load catalogue page ${offset / 100 + 1}.`);
    return data.products as PublicCatalogueProduct[];
  }));
  return [...initial.products, ...pages.flat()];
}

export async function fetchCatalogueSettings(accessCode = ''): Promise<{ tvBillSuffixRequired: boolean; clientName: string; access: WorkspaceAccess | null; categoryLists: StoreCategoryLists; instagramUrl: string }> {
  try {
    const access = accessCode ? `&access=${encodeURIComponent(accessCode)}` : '';
    const res = await fetch(`/api/maharaja/catalogue?offset=0&limit=1${access}`, { cache: 'no-store' });
    const data = await res.json();
    return {
      tvBillSuffixRequired: data?.tvBillSuffixRequired !== false,
      clientName: typeof data?.clientName === 'string' ? data.clientName : '',
      access: data?.access && typeof data.access === 'object' ? data.access as WorkspaceAccess : null,
      categoryLists: data?.categoryLists && typeof data.categoryLists === 'object' ? data.categoryLists as StoreCategoryLists : {},
      instagramUrl: typeof data?.instagramUrl === 'string' ? data.instagramUrl : '',
    };
  } catch {
    return { tvBillSuffixRequired: true, clientName: '', access: null, categoryLists: {}, instagramUrl: '' };
  }
}
