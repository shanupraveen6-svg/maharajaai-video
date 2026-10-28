import QRCode from 'qrcode';

export async function createTryOnPosterDataUrl(targetUrl: string, options?: { title?: string; subtitle?: string; footer?: string }) {
  const qrDataUrl = await QRCode.toDataURL(targetUrl, {
    width: 920,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#2A060C', light: '#FFFFFF' },
  });
  const qrImage = await loadImage(qrDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 2200;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to prepare QR poster.');

  context.fillStyle = '#F8F5EE';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#6E0D1F';
  context.fillRect(0, 0, canvas.width, 330);
  context.fillStyle = '#D4AF37';
  context.fillRect(0, 330, canvas.width, 18);

  context.textAlign = 'center';
  context.fillStyle = '#F3E5AB';
  context.font = '700 82px Georgia, serif';
  context.fillText('MAHARAJA', canvas.width / 2, 145);
  context.font = '700 30px Arial, sans-serif';
  context.fillText('POWERED BY WEFOCUS.IN', canvas.width / 2, 225);

  context.fillStyle = '#2A060C';
  context.font = '700 92px Georgia, serif';
  context.fillText(options?.title || 'AI TRY-ON', canvas.width / 2, 520);
  context.fillStyle = '#735B22';
  context.font = '700 35px Arial, sans-serif';
  context.fillText(options?.subtitle || 'SCAN TO SEE YOUR LOOK', canvas.width / 2, 595);

  context.fillStyle = '#FFFFFF';
  context.fillRect(260, 680, 1080, 1080);
  context.drawImage(qrImage, 340, 760, 920, 920);

  context.fillStyle = '#6E0D1F';
  context.fillRect(220, 1845, 1160, 150);
  context.fillStyle = '#F3E5AB';
  context.font = '700 47px Arial, sans-serif';
  context.fillText(options?.footer || 'AVAILABLE ON BILLS OF RS 500+', canvas.width / 2, 1940);
  context.fillStyle = '#5C4B43';
  context.font = '600 28px Arial, sans-serif';
  context.fillText('Ask Maharaja staff for purchase eligibility', canvas.width / 2, 2070);

  return canvas.toDataURL('image/png');
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load QR image.'));
    image.src = source;
  });
}
