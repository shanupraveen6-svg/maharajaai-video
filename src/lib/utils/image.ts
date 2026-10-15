import { validateSourceImage } from './image-upload';

// Browser-side canvas image compression helper to ensure uploads stay below Vercel's request limit.

export async function compressImage(
  file: File,
  maxDimension = 2048,
  quality = 0.85
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  validateSourceImage(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The selected image could not be read. Choose another photo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('This image format could not be opened on this device. Choose a JPG, PNG, or WEBP photo.'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('The selected image could not be prepared. Choose another photo.'));
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error('The selected image could not be compressed. Choose another photo.'));
            }
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve({ blob, dataUrl, width, height });
          },
          'image/jpeg',
          quality
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
