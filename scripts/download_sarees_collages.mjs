import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

function escapeXml(unsafe) {
  return String(unsafe || '').replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return c;
    }
  });
}

function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuf = await res.arrayBuffer();
      return Buffer.from(arrayBuf);
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
}

async function main() {
  const outputDir = path.resolve(process.cwd(), 'silk_sarees_collages');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Fetching silk sarees collection from majesticmaharaja.online...');
  const res = await fetch('https://majesticmaharaja.online/collections/silk-sarees/products.json?limit=50');
  if (!res.ok) throw new Error(`Failed to fetch collection: HTTP ${res.status}`);
  const data = await res.json();
  const products = (data.products || []).slice(0, 25);

  console.log(`Found ${products.length} saree products to process.`);

  const summary = [];

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const indexNum = String(i + 1).padStart(2, '0');
    const safeTitle = sanitizeFilename(product.title);
    const filename = `${indexNum}_${safeTitle}.jpg`;
    const outPath = path.join(outputDir, filename);

    console.log(`\n[${i + 1}/25] Processing: ${product.title}`);

    // Take top 4 images
    const imagesToUse = product.images.slice(0, 4);
    if (imagesToUse.length < 3) {
      console.warn(`  Warning: Product only has ${imagesToUse.length} images!`);
    }

    console.log(`  Downloading ${imagesToUse.length} images...`);
    const buffers = await Promise.all(
      imagesToUse.map((img) => fetchWithRetry(img.src))
    );

    const w = 760;
    const h = 1013;
    const gap = 16;
    const bannerH = 120;
    const totalW = w * 2 + gap * 3;
    const totalH = h * 2 + gap * 3 + bannerH;

    // Resize images to fit quadrant
    const resizedBuffers = await Promise.all(
      buffers.map((buf) =>
        sharp(buf)
          .resize(w, h, { fit: 'cover', position: 'centre' })
          .toBuffer()
      )
    );

    const price = product.variants?.[0]?.price
      ? `₹${Number(product.variants[0].price).toLocaleString('en-IN')}`
      : '';
    const sku = product.variants?.[0]?.sku ? `SKU: ${product.variants[0].sku}` : '';

    const bannerSvg = Buffer.from(`
      <svg width="${totalW}" height="${bannerH}" viewBox="0 0 ${totalW} ${bannerH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#1F070B"/>
        <rect x="0" y="0" width="100%" height="3" fill="#D4AF37"/>
        <text x="${gap * 2}" y="48" font-family="serif, Georgia, 'Times New Roman'" font-size="28" font-weight="bold" fill="#F3E5AB">${escapeXml(product.title)}</text>
        <text x="${gap * 2}" y="92" font-family="sans-serif, Arial, Helvetica" font-size="22" font-weight="bold" fill="#D4AF37">${escapeXml(price)} <tspan font-size="16" font-weight="normal" fill="#D8C49B">${escapeXml(sku ? ' • ' + sku : '')}</tspan></text>
        <text x="${totalW - gap * 2}" y="72" text-anchor="end" font-family="serif, Georgia" font-size="24" font-weight="bold" fill="#D4AF37" letter-spacing="3">MAJESTIC MAHARAJA</text>
      </svg>
    `);

    // Prepare coordinates for 4 images in 2x2 grid
    const composites = [
      { input: resizedBuffers[0], top: gap, left: gap },
      { input: resizedBuffers[1], top: gap, left: gap * 2 + w },
      { input: resizedBuffers[2] || resizedBuffers[0], top: gap * 2 + h, left: gap },
      { input: resizedBuffers[3] || resizedBuffers[1], top: gap * 2 + h, left: gap * 2 + w },
      { input: bannerSvg, top: h * 2 + gap * 3, left: 0 },
    ];

    await sharp({
      create: {
        width: totalW,
        height: totalH,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite(composites)
      .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
      .toFile(outPath);

    console.log(`  ✓ Saved collage: ${filename} (${totalW}x${totalH})`);

    summary.push({
      number: i + 1,
      title: product.title,
      price,
      sku: product.variants?.[0]?.sku || '',
      imagesCount: product.images.length,
      collageFilename: filename,
      productUrl: `https://majesticmaharaja.online/products/${product.handle}`,
    });
  }

  // Save summary JSON
  fs.writeFileSync(
    path.join(outputDir, 'summary.json'),
    JSON.stringify(summary, null, 2),
    'utf-8'
  );

  console.log('\n=========================================');
  console.log(`All 25 saree collages generated successfully in:\n${outputDir}`);
  console.log('=========================================');
}

main().catch((err) => {
  console.error('Fatal error generating collages:', err);
  process.exit(1);
});
