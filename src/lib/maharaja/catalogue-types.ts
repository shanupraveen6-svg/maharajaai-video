export type MaharajaCatalogueProduct = {
  sku: string;
  title: string;
  price: number;
  storagePath: string;
  productUrl: string;
  active: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export type PublicCatalogueProduct = Omit<MaharajaCatalogueProduct, 'storagePath'> & {
  imageUrl: string;
};
