/** Renderer-safe contract for the canonical catalog product image archive. */
export const MAX_PRODUCT_PHOTOS = 12;
export const MAX_PRODUCT_PHOTO_BYTES = 5 * 1024 * 1024;

export interface ProductPhotoCollection {
  productId: string;
  revision: string;
  /** SHA256 identities in canonical order; index zero is the cover. No file paths. */
  photos: Array<{ id: string; format: string }>;
  sourceUrl: string;
  sourceLicense: string;
}

export interface ProductPhotoMutation {
  productId: string;
  expectedRevision: string;
}
export interface AddProductPhotosInput extends ProductPhotoMutation { dataUrls: string[] }
export interface SelectProductPhotoInput extends ProductPhotoMutation { photoId: string }
export interface ReorderProductPhotosInput extends ProductPhotoMutation { photoIds: string[] }

/** Ordered workspace draft. Existing photos carry only their hash; new bytes stay
 * in the renderer until the product's single Save. Index zero is the cover. */
export interface ProductPhotoDraftPhoto {
  id: string;
  format: string;
  dataUrl?: string;
}
