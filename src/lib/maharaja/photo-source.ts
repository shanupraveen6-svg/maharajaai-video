/** The object path inside our own bucket from a signed Google Cloud Storage link, or '' for any other link. */
export function storagePathFromSignedUrl(value: string, bucketName: string): string {
  if (!bucketName || !/^https:\/\//.test(value)) return '';
  try {
    const url = new URL(value);
    if (url.hostname === 'storage.googleapis.com') {
      const [, bucket, ...rest] = url.pathname.split('/');
      return bucket === bucketName ? decodeURIComponent(rest.join('/')) : '';
    }
    if (url.hostname === `${bucketName}.storage.googleapis.com`) return decodeURIComponent(url.pathname.slice(1));
    const firebase = url.hostname === 'firebasestorage.googleapis.com' && url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (firebase && firebase[1] === bucketName) return decodeURIComponent(firebase[2]);
  } catch {
    // not a link
  }
  return '';
}
