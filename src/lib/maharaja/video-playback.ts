export type VideoPlaybackMode = 'embedded' | 'external';

export type VideoPlaybackProfile = {
  playbackMode: VideoPlaybackMode;
  durationSeconds: number;
  playbackRate: number;
  hasEmbeddedAudio: boolean;
};

const SUPPORTED_VIDEO_EXTENSION = /\.(mp4|m4v|mov|webm)$/i;

export function isSupportedVideoPath(storagePath: string): boolean {
  return SUPPORTED_VIDEO_EXTENSION.test(storagePath.split('?')[0] || '');
}

export function getVideoFormat(storagePath: string): string {
  const match = storagePath.split('?')[0]?.match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() || 'video';
}

export function getVideoPlaybackProfile(
  video: Record<string, unknown>,
  selectedStoragePath: string
): VideoPlaybackProfile {
  const explicitDuration = Number(video.durationSeconds);
  const isLiveNineSecond = /(?:live[-_]?9s|final[-_]?9s|\/live\/)/i.test(selectedStoragePath);
  const durationSeconds = Number.isFinite(explicitDuration) && explicitDuration > 0
    ? explicitDuration
    : isLiveNineSecond ? 9 : 6;
  const playbackMode: VideoPlaybackMode = video.playbackMode === 'external' ? 'external' : 'embedded';
  const hasEmbeddedAudio = playbackMode === 'embedded' && video.hasEmbeddedAudio !== false;

  return {
    playbackMode,
    durationSeconds,
    playbackRate: playbackMode === 'external' && durationSeconds <= 6 ? 2 / 3 : 1,
    hasEmbeddedAudio,
  };
}
