import QRCode from 'qrcode';

/**
 * Downloads a printable QR poster carrying the store's own name (the Wall QR, for example), for the
 * workspace and the counter tablet alike. Browser only.
 */
export async function downloadBrandedQr({ storeName, filename, title, subtitle, targetUrl }: {
  storeName: string;
  filename: string;
  title: string;
  subtitle: string;
  targetUrl: string;
}) {
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, targetUrl, {
    width: 560,
    margin: 2,
    color: { dark: '#161918', light: '#FAFBF8' },
  });

  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 1120;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#F4F5F2';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#7A1428';
  ctx.lineWidth = 8;
  ctx.strokeRect(32, 32, canvas.width - 64, canvas.height - 64);

  ctx.fillStyle = '#7A1428';
  ctx.font = '700 26px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(storeName || 'Your store', canvas.width / 2, 108);

  ctx.fillStyle = '#161918';
  ctx.font = '700 44px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(title, canvas.width / 2, 174);

  ctx.fillStyle = '#535A56';
  ctx.font = '500 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(subtitle, canvas.width / 2, 224);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(150, 276, 600, 600);
  ctx.strokeStyle = '#D8DCD7';
  ctx.lineWidth = 3;
  ctx.strokeRect(150, 276, 600, 600);
  ctx.drawImage(qrCanvas, 170, 296, 560, 560);

  ctx.fillStyle = '#161918';
  ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Scan with your phone camera', canvas.width / 2, 950);

  const anchor = document.createElement('a');
  anchor.href = canvas.toDataURL('image/png');
  anchor.download = filename;
  anchor.click();
}
