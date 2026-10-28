import type { CatalogueCategoryId, TryFocusProduct } from '@/lib/tryfocus/sample-data';

export type MaharajaCatalogueProduct = {
  id?: string;
  sku: string;
  title: string;
  price: number;
  gender: 'women' | 'men';
  audience: 'Women' | 'Men';
  category: CatalogueCategoryId;
  garmentType: TryFocusProduct['garmentType'];
  storagePath: string;
  garmentReferencePath?: string;
  fabricNote?: string;
  badge?: TryFocusProduct['badge'];
  newArrival: boolean;
  eligibleForVideo: boolean;
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
