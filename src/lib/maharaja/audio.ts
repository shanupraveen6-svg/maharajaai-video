import { type EventId, isEventId } from './config';

export const DIWALI_LIVE_AUDIO_TRACKS = [
  '/audio/maharaja/live/diwali-hindu-9s.mp3',
] as const;

export const DIWALI_PREVIEW_AUDIO_TRACKS = [
  '/audio/maharaja/preview/diwali-hindu-6s.mp3',
] as const;

/**
 * Event-specific Live Audio Mappings (9-second Showroom Broadcast Audio)
 * - Diwali: one matched Hindu/Diwali music pair: 6s preview + 9s showroom cut
 * - Pongal: Traditional nadaswaram / harvest celebration rhythm (live-03.mp3)
 * - New Year: Modern gala upbeat celebration with celebration fanfare (live-04.mp3)
 * - Christmas: Festive holiday chimes and elegant joyful orchestral (live-05.mp3)
 * - Ramadan: Serene ambient strings and tranquil cultural melody (live-06.mp3)
 * - Birthday: Cheerful party celebration and fanfare (live-03.mp3)
 *
 * Prevents Diwali greetings from accidentally playing during Christmas, Pongal, or Ramadan.
 */
export const EVENT_LIVE_AUDIO_MAP: Record<EventId, readonly string[]> = {
  diwali: DIWALI_LIVE_AUDIO_TRACKS,
  pongal: ['/audio/maharaja/live/live-03.mp3'],
  'new-year': ['/audio/maharaja/live/live-04.mp3'],
  christmas: ['/audio/maharaja/live/live-05.mp3'],
  ramadan: ['/audio/maharaja/live/live-06.mp3'],
  birthday: ['/audio/maharaja/live/birthday-live.mp3'],
};

/**
 * Event-specific Preview Audio Mappings (6-second Mobile Preview Audio)
 */
export const EVENT_PREVIEW_AUDIO_MAP: Record<EventId, readonly string[]> = {
  diwali: DIWALI_PREVIEW_AUDIO_TRACKS,
  pongal: ['/audio/maharaja/preview/preview-03.mp3'],
  'new-year': ['/audio/maharaja/preview/preview-04.mp3'],
  christmas: ['/audio/maharaja/preview/preview-05.mp3'],
  ramadan: ['/audio/maharaja/preview/preview-07.mp3'],
  birthday: ['/audio/maharaja/preview/preview-08.mp3'],
};

export const PREVIEW_AUDIO_TRACKS = DIWALI_PREVIEW_AUDIO_TRACKS;
export const LIVE_AUDIO_TRACKS = DIWALI_LIVE_AUDIO_TRACKS;

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

export function getPreviewAudioTrack(seed: string, eventId?: string): string {
  const resolvedEventId: EventId = isEventId(eventId) ? eventId : 'diwali';
  const tracks = EVENT_PREVIEW_AUDIO_MAP[resolvedEventId] || PREVIEW_AUDIO_TRACKS;
  return pickAudioTrack(seed, tracks);
}

export function getLiveAudioTrack(seed: string, eventId?: string): string {
  const resolvedEventId: EventId = isEventId(eventId) ? eventId : 'diwali';
  const tracks = EVENT_LIVE_AUDIO_MAP[resolvedEventId] || LIVE_AUDIO_TRACKS;
  return pickAudioTrack(seed, tracks);
}
