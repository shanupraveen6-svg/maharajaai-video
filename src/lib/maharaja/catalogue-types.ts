import type { CatalogueCategoryId, CatalogueAudience, TryFocusProduct } from '@/lib/tryfocus/sample-data';

export type MaharajaCatalogueProduct = {
  id?: string;
  sku: string;
  title: string;
  price: number;
  gender: CatalogueAudience;
  audience: TryFocusProduct['audience'];
  category: CatalogueCategoryId;
  garmentType: TryFocusProduct['garmentType'];
  storagePath: string;
  garmentReferencePath?: string;
  fabricNote?: string;
  badge?: TryFocusProduct['badge'];
  newArrival: boolean;
  eligibleForVideo: boolean;
  eligibleForLive?: boolean;
  newArrivalOnly?: boolean;
  productUrl: string;
  active: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export type PublicCatalogueProduct = Omit<MaharajaCatalogueProduct, 'storagePath' | 'garmentReferencePath'> & {
  id: string;
  imageUrl: string;
  garmentReferenceUrl?: string;
  accent: string;
};
