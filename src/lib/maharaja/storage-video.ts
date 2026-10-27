import { isSupportedVideoPath } from '@/lib/maharaja/video-playback';

export type StoredVideoCheck =
  | { playable: true; size: number; contentType: string }
  | { playable: false; reason: 'missing' | 'empty' | 'not-video' };

export async function inspectStoredVideo(bucket: any, storagePath: string): Promise<StoredVideoCheck> {
  if (!bucket || !storagePath) return { playable: false, reason: 'missing' };

  try {
    const [metadata] = await bucket.file(storagePath).getMetadata();
    const size = Number(metadata?.size || 0);
    const contentType = String(metadata?.contentType || '').toLowerCase();
    if (size <= 0) return { playable: false, reason: 'empty' };
    if (!contentType.startsWith('video/') && !isSupportedVideoPath(storagePath)) {
      return { playable: false, reason: 'not-video' };
    }
    return { playable: true, size, contentType };
  } catch (error: any) {
    if (Number(error?.code) === 404 || error?.code === 'NotFound') {
      return { playable: false, reason: 'missing' };
    }
    throw error;
  }
}

export async function filterStoredVideos<T extends { storagePath: string }>(
  bucket: any,
  videos: T[],
  concurrency = 8
): Promise<T[]> {
  if (!bucket || !videos.length) return [];
  const playable: T[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), videos.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < videos.length) {
      const index = nextIndex++;
      const video = videos[index];
      try {
        const result = await inspectStoredVideo(bucket, video.storagePath);
        if (result.playable) playable[index] = video;
      } catch (error) {
        // Keep the route resilient to transient Storage errors; the TV player
        // will retry the library refresh rather than treating an unknown error
        // as proof that a customer video is permanently broken.
        console.warn('Stored video availability check failed:', video.storagePath, error);
      }
    }
  }));

  return playable.filter(Boolean);
}

export async function resolveStoredVideoPaths<T extends {
  storagePath?: string;
  liveStoragePath?: string;
}>(bucket: any, videos: T[], concurrency = 8): Promise<Array<T & { resolvedStoragePath: string }>> {
  if (!bucket || !videos.length) return [];
  const resolved: Array<(T & { resolvedStoragePath: string }) | undefined> = [];
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), videos.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < videos.length) {
      const index = nextIndex++;
      const video = videos[index];
      const candidates = Array.from(new Set([
        String(video.liveStoragePath || ''),
        String(video.storagePath || ''),
      ].filter(Boolean)));

      for (const storagePath of candidates) {
        try {
          const result = await inspectStoredVideo(bucket, storagePath);
          if (result.playable) {
            resolved[index] = { ...video, resolvedStoragePath: storagePath };
            break;
          }
        } catch (error) {
          console.warn('Stored video rendition check failed:', storagePath, error);
        }
      }
    }
  }));

  return resolved.filter((video): video is T & { resolvedStoragePath: string } => Boolean(video));
}
