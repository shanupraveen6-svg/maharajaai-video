import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

/**
 * Permanently embeds the Maharaja official logo as an unremovable watermark onto the Try-On image.
 */
export async function applyMaharajaWatermark(inputImageBuffer: Buffer): Promise<Buffer> {
  try {
    const logoPath = path.join(process.cwd(), 'public', 'maharaja-logo.png');
    if (!fs.existsSync(logoPath)) {
      console.warn('Maharaja logo not found at:', logoPath);
      return inputImageBuffer;
    }

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
