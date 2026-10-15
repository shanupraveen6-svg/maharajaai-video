import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import sharp from 'sharp';

const clientId = 'maharaja';
const secret = process.env.OPERATOR_AUTH_SECRET || process.env.ADMIN_PASSWORD || 'tryfocus-local-development';
const accessCode = crypto.createHmac('sha256', secret)
  .update(`${clientId}:permanent-try-on`)
  .digest('base64url')
  .slice(0, 20);
const origin = process.env.TRYFOCUS_PUBLIC_ORIGIN || 'https://maharaja-aivideo.vercel.app';
const targetUrl = `${origin}/maharaja/try-on?access=${accessCode}`;
const qrBuffer = await QRCode.toBuffer(targetUrl, {
  width: 920,
  margin: 2,
  errorCorrectionLevel: 'H',
  color: { dark: '#2A060C', light: '#FFFFFF' },
});
const qrBase64 = qrBuffer.toString('base64');

const svg = `
<svg width="1600" height="2200" viewBox="0 0 1600 2200" xmlns="http://www.w3.org/2000/svg">
  <rect width="1600" height="2200" fill="#F8F5EE"/>
  <rect width="1600" height="330" fill="#6E0D1F"/>
  <rect y="330" width="1600" height="18" fill="#D4AF37"/>
  <text x="800" y="150" text-anchor="middle" font-family="Georgia, serif" font-size="82" font-weight="700" fill="#F3E5AB">MAHARAJA</text>
  <text x="800" y="230" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#F3E5AB">POWERED BY TRYFOCUS</text>
  <text x="800" y="520" text-anchor="middle" font-family="Georgia, serif" font-size="92" font-weight="700" fill="#2A060C">AI TRY-ON</text>
  <text x="800" y="600" text-anchor="middle" font-family="Arial, sans-serif" font-size="35" font-weight="700" fill="#735B22">SCAN TO SEE YOUR LOOK</text>
  <rect x="260" y="680" width="1080" height="1080" fill="#FFFFFF"/>
  <image href="data:image/png;base64,${qrBase64}" x="340" y="760" width="920" height="920"/>
  <rect x="220" y="1845" width="1160" height="150" fill="#6E0D1F"/>
  <text x="800" y="1942" text-anchor="middle" font-family="Arial, sans-serif" font-size="47" font-weight="700" fill="#F3E5AB">AVAILABLE ON BILLS OF RS 500+</text>
  <text x="800" y="2070" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="600" fill="#5C4B43">Ask Maharaja staff for purchase eligibility</text>
</svg>`;

const outputPath = path.join(process.cwd(), 'public', 'maharaja-ai-try-on-rs-500-sample.png');
await sharp(Buffer.from(svg)).png().toFile(outputPath);
console.log(`Generated ${outputPath}`);
