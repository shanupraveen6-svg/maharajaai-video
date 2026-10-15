export const MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024;

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export function validateSourceImage(file: File, maxBytes = MAX_SOURCE_IMAGE_BYTES) {
  if (!file.size) throw new Error('The selected image is empty. Choose another photo.');
  if (file.size > maxBytes) throw new Error('The selected image is too large. Choose an image below 12 MB.');
  if (!SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase())) {
    throw new Error('Use a JPG, PNG, WEBP, HEIC, or HEIF image.');
  }
}

export function appendUniqueImages(existing: string[], incoming: string[], limit: number) {
  const combined = Array.from(new Set([...existing, ...incoming]));
  if (combined.length > limit) throw new Error(`Upload no more than ${limit} garment photos.`);
  return combined;
}
