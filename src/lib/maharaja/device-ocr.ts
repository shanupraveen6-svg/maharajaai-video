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

export async function readPriceOnDevice(dataUrl: string, timeoutMs = 15000) {
  const worker = await warmUpDeviceOcr();
  const prepared = await prepareTagImage(dataUrl);
  const result = await Promise.race([
    worker.recognize(prepared),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('OCR timed out')), timeoutMs)),
  ]);
  const text = result.data.text || '';
  return { text, ...parseBarcodePrice(text) };
}
