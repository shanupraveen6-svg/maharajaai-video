'use client';

import type { Worker } from 'tesseract.js';
import { parseBarcodePrice } from '@/lib/maharaja/barcode-price';

/**
 * On-device price-tag OCR (Tesseract.js, runs in the customer's browser).
 * Reads the printed MRP without any server AI call.
 */

let workerPromise: Promise<Worker> | null = null;

export function warmUpDeviceOcr() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM } = await import('tesseract.js');
      const worker = await createWorker('eng');
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      return worker;
    })().catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

/** Resize + grayscale + contrast boost so small tag print reads reliably. */
export async function prepareTagImage(dataUrl: string, maxWidth = 1600, quality = 0.85): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Image could not be read.'));
    el.src = dataUrl;
  });
  const scale = Math.min(1, maxWidth / img.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.filter = 'grayscale(1) contrast(1.6)';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Compact colour image for Gemini Vision; preserves small printed characters. */
export async function prepareVisionTagImage(dataUrl: string, maxWidth = 1100, quality = 0.78): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Captured tag photo could not be read.'));
    el.src = dataUrl;
  });
  const scale = Math.min(1, maxWidth / img.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.filter = 'contrast(1.12) brightness(1.04)';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Extracts the horizontal MRP area from a camera frame before OCR. Garment
 * labels commonly place the large ₹ / Rs. price in the middle of the tag.
 */
export async function prepareMrpImage(dataUrl: string, quality = 0.9): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Image could not be read.'));
    el.src = dataUrl;
  });
  const sourceWidth = img.naturalWidth;
  const sourceHeight = img.naturalHeight;
  if (!sourceWidth || !sourceHeight) return dataUrl;

  // Use a deliberately generous centre crop. Browser `object-cover` camera
  // previews can differ from the raw camera-frame aspect ratio, so a narrow
  // crop may exclude a clearly visible price row on some Android devices.
  const cropWidth = Math.round(sourceWidth * 0.92);
  const cropHeight = Math.round(sourceHeight * 0.56);
  const cropLeft = Math.round((sourceWidth - cropWidth) / 2);
  const cropTop = Math.round((sourceHeight - cropHeight) / 2);
  const targetWidth = Math.max(1400, cropWidth * 2);
  const targetHeight = Math.round(targetWidth * (cropHeight / cropWidth));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.filter = 'grayscale(1) contrast(2.1) brightness(1.08)';
  ctx.drawImage(img, cropLeft, cropTop, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight);
  return canvas.toDataURL('image/jpeg', quality);
}

export async function readPriceOnDevice(dataUrl: string, timeoutMs = 3000) {
  const worker = await warmUpDeviceOcr();
  const prepared = await prepareMrpImage(dataUrl);
  const { PSM } = await import('tesseract.js');
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
  const result = await Promise.race([
    worker.recognize(prepared),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('OCR timed out')), Math.max(timeoutMs, 3000))),
  ]);
  const text = result.data.text || '';
  return { text, ...parseBarcodePrice(text) };
}
