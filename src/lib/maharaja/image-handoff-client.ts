import QRCode from 'qrcode';

export async function createImageHandoff(
  imageUrl: string,
  sku: string,
  title: string,
  metadata?: { category?: string; garmentType?: string; gender?: string; garmentReferenceUrl?: string }
) {
  const image = await new Promise<string>((resolve, reject) => {
    const source = new Image();
    source.crossOrigin = 'anonymous';
    source.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1400 / Math.max(source.naturalWidth, source.naturalHeight));
      canvas.width = Math.round(source.naturalWidth * scale);
      canvas.height = Math.round(source.naturalHeight * scale);
      const context = canvas.getContext('2d');
      if (!context) { reject(new Error('Unable to prepare your phone handoff.')); return; }
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', .85));
    };
    source.onerror = () => reject(new Error('Unable to read the completed look.'));
    source.src = imageUrl;
  });
  const response = await fetch('/api/tv/tryon-handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Tablet looks: catalogue festival videos are made only on the store TV.
      source: 'tablet',
      looks: [{
        sku,
        title,
        image,
        category: metadata?.category,
        garmentType: metadata?.garmentType,
        gender: metadata?.gender,
        garmentReferenceUrl: metadata?.garmentReferenceUrl,
      }],
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.token) throw new Error(data.error || 'Phone handoff unavailable.');
  return QRCode.toDataURL(`${window.location.origin}/maharaja/looks/${data.token}`, { width: 300, margin: 2 });
}
