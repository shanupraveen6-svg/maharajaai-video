export const PREVIEW_AUDIO_TRACKS = [
  '/audio/maharaja/preview/preview-01.mp3',
  '/audio/maharaja/preview/preview-02.mp3',
  '/audio/maharaja/preview/preview-03.mp3',
  '/audio/maharaja/preview/preview-04.mp3',
  '/audio/maharaja/preview/preview-05.mp3',
  '/audio/maharaja/preview/preview-06.mp3',
  '/audio/maharaja/preview/preview-07.mp3',
  '/audio/maharaja/preview/preview-08.mp3',
] as const;

export const LIVE_AUDIO_TRACKS = [
  '/audio/maharaja/live/live-01.mp3',
  '/audio/maharaja/live/live-02.mp3',
  '/audio/maharaja/live/live-03.mp3',
  '/audio/maharaja/live/live-04.mp3',
  '/audio/maharaja/live/live-05.mp3',
  '/audio/maharaja/live/live-06.mp3',
] as const;

function hashSeed(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function pickAudioTrack(seed: string, tracks: readonly string[]) {
  if (!tracks.length) return '';
  return tracks[hashSeed(seed || 'maharaja') % tracks.length];
}

export function getPreviewAudioTrack(seed: string) {
  return pickAudioTrack(seed, PREVIEW_AUDIO_TRACKS);
}

export function getLiveAudioTrack(seed: string) {
  return pickAudioTrack(seed, LIVE_AUDIO_TRACKS);
}
