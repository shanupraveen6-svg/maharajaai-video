import sharp from 'sharp';
import path from 'node:path';

const svg = `
<svg width="1000" height="1500" viewBox="0 0 1000 1500" xmlns="http://www.w3.org/2000/svg">
  <rect width="1000" height="1500" fill="#E9E4DA"/>
  <rect x="120" y="70" width="760" height="1360" rx="30" fill="#FFFDF8" stroke="#6E0D1F" stroke-width="12"/>
  <circle cx="500" cy="135" r="34" fill="#E9E4DA" stroke="#6E0D1F" stroke-width="8"/>
  <text x="500" y="285" text-anchor="middle" font-family="Georgia, serif" font-size="72" font-weight="700" fill="#6E0D1F">MAJESTIC</text>
  <text x="500" y="375" text-anchor="middle" font-family="Georgia, serif" font-size="86" font-weight="700" fill="#6E0D1F">MAHARAJA</text>
  <line x1="210" y1="435" x2="790" y2="435" stroke="#D4AF37" stroke-width="8"/>
  <text x="500" y="545" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="700" fill="#5C4B43">FESTIVE COLLECTION</text>
  <text x="500" y="675" text-anchor="middle" font-family="Arial, sans-serif" font-size="31" fill="#5C4B43">SILK BLEND GARMENT</text>
  <rect x="195" y="755" width="610" height="300" fill="#F8F5EE" stroke="#D8C49B" stroke-width="5"/>
  <text x="500" y="855" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#5C4B43">MRP</text>
  <text x="500" y="985" text-anchor="middle" font-family="Arial, sans-serif" font-size="126" font-weight="700" fill="#17120F">Rs 799</text>
  <text x="500" y="1130" text-anchor="middle" font-family="Arial, sans-serif" font-size="27" fill="#5C4B43">INCLUSIVE OF ALL TAXES</text>
  <text x="500" y="1215" text-anchor="middle" font-family="monospace" font-size="30" fill="#17120F">SKU: MM-TEST-0799</text>
  <g fill="#17120F">
    ${Array.from({ length: 42 }, (_, index) => `<rect x="${225 + index * 13}" y="1260" width="${index % 3 === 0 ? 7 : 4}" height="95"/>`).join('')}
  </g>
  <text x="500" y="1400" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#6E0D1F">TRYFOCUS TEST PRICE TAG</text>
</svg>`;

const output = path.join(process.cwd(), 'public', 'maharaja-test-price-tag-rs-799.png');
await sharp(Buffer.from(svg)).png().toFile(output);
console.log(output);
