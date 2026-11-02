import sharp from 'sharp';
import { activeClientId } from '@/lib/maharaja/client-context';
import { maharajaDefaultLogo, readStoreLogo } from '@/lib/maharaja/store-logo';

/**
 * Puts the store's own logo on a Try-On image (bottom right). A store with an uploaded logo gets it on a
 * white rounded card; the Maharaja demo keeps its round gold badge; a store with no logo gets none, so a
 * customer never downloads a look carrying another store's brand.
 */
export async function applyMaharajaWatermark(inputImageBuffer: Buffer, clientId = activeClientId()): Promise<Buffer> {
  try {
    const uploaded = await readStoreLogo(clientId);
    if (uploaded) return await applyCardLogo(inputImageBuffer, uploaded);
    const fallback = maharajaDefaultLogo(clientId);
    if (!fallback) return inputImageBuffer;
    return await applyRoundBadge(inputImageBuffer, fallback);
  } catch (error) {
    console.warn('Store logo could not be added:', error);
    return inputImageBuffer;
  }
}

async function applyCardLogo(inputImageBuffer: Buffer, logo: Buffer): Promise<Buffer> {
  const metadata = await sharp(inputImageBuffer).metadata();
  const width = metadata.width || 768;
  const height = metadata.height || 1024;
  const maxW = Math.round(width * 0.26);
  const maxH = Math.round(height * 0.09);
  const inner = await sharp(logo).resize(maxW, maxH, { fit: 'inside' }).png().toBuffer();
  const innerMeta = await sharp(inner).metadata();
  const pad = Math.max(8, Math.round(width * 0.012));
  const cardW = (innerMeta.width || maxW) + pad * 2;
  const cardH = (innerMeta.height || maxH) + pad * 2;
  const radius = Math.round(Math.min(cardW, cardH) * 0.22);
  const card = await sharp(Buffer.from(`<svg width="${cardW}" height="${cardH}"><rect width="${cardW}" height="${cardH}" rx="${radius}" ry="${radius}" fill="#ffffff" fill-opacity="0.92"/></svg>`))
    .composite([{ input: inner, top: pad, left: pad }])
    .png()
    .toBuffer();
  const margin = Math.max(16, Math.round(width * 0.035));
  return sharp(inputImageBuffer)
    .composite([{ input: card, top: height - cardH - margin, left: width - cardW - margin }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

async function applyRoundBadge(inputImageBuffer: Buffer, logoPath: Buffer): Promise<Buffer> {
  try {

    const metadata = await sharp(inputImageBuffer).metadata();
    const width = metadata.width || 768;
    const height = metadata.height || 1024;

    // Scale the badge proportionally (16% to 22% of image width, clamp between 90 and 200px)
    const size = Math.min(200, Math.max(90, Math.round(width * 0.19)));

    // Circular mask
    const circleMask = Buffer.from(
      `<svg width="${size}" height="${size}">
         <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="#fff" />
       </svg>`
    );

    const roundedLogo = await sharp(logoPath)
      .resize(size, size, { fit: 'cover' })
      .composite([{ input: circleMask, blend: 'dest-in' }])
      .png()
      .toBuffer();

    const badgeWidth = size + 8;
    const badgeHeight = size + 8;

    const goldRing = Buffer.from(
      `<svg width="${badgeWidth}" height="${badgeHeight}">
         <circle cx="${badgeWidth / 2}" cy="${badgeHeight / 2}" r="${size / 2 + 2}" stroke="#D4AF37" stroke-width="4" fill="none" opacity="0.95"/>
       </svg>`
    );

    const badge = await sharp({
      create: {
        width: badgeWidth,
        height: badgeHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        { input: roundedLogo, top: 4, left: 4 },
        { input: goldRing, top: 0, left: 0 },
      ])
      .png()
      .toBuffer();

    const margin = Math.max(16, Math.round(width * 0.04));

    // Composite permanent watermark onto bottom-right corner of image
    return await sharp(inputImageBuffer)
      .composite([
        {
          input: badge,
          top: height - badgeHeight - margin,
          left: width - badgeWidth - margin,
        },
      ])
      .jpeg({ quality: 92 })
      .toBuffer();
  } catch (error) {
    console.error('Failed to apply Maharaja watermark:', error);
    return inputImageBuffer;
  }
}
