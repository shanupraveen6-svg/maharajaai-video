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
  /** Tagged by the store as trending; the TV lists these under Trending. */
  trending?: boolean;
  eligibleForVideo: boolean;
  eligibleForLive?: boolean;
  newArrivalOnly?: boolean;
  /** What the store stocks, for their own record — S/M/L/XL. A catalogue note only; Try-On and AI Video
      make the garment exactly as photographed, regardless of this list. */
  sizes?: string[];
  productUrl: string;
  active: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
  /** SHA-256 of the uploaded photo, so the same photo is never added twice. */
  photoHash?: string;
  /** Set when the store deleted a built-in garment, which would otherwise come back from the code. */
  deletedAt?: string;
};

export type PublicCatalogueProduct = Omit<MaharajaCatalogueProduct, 'storagePath' | 'garmentReferencePath' | 'thumbnailPath' | 'thumbnailSource'> & {
  id: string;
  imageUrl: string;
  /** Small preview for grids; falls back to imageUrl. */
  thumbnailUrl?: string;
  garmentReferenceUrl?: string;
  accent: string;
};
