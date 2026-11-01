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
  /** Small WebP preview for grids, made from storagePath when the garment is saved. */
  thumbnailPath?: string;
  /** The storagePath the thumbnail was made from; a new photo makes a new thumbnail. */
  thumbnailSource?: string;
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

export type PublicCatalogueProduct = Omit<MaharajaCatalogueProduct, 'storagePath' | 'garmentReferencePath' | 'thumbnailPath' | 'thumbnailSource'> & {
  id: string;
  imageUrl: string;
  /** Small preview for grids; falls back to imageUrl. */
  thumbnailUrl?: string;
  garmentReferenceUrl?: string;
  accent: string;
};
