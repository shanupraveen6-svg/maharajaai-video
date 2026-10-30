'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Sparkles, Volume2 } from 'lucide-react';
import { getLiveAudioTrack } from '@/lib/maharaja/audio';
import { getTamilCustomerName } from '@/lib/maharaja/names';
import { isPromoDue, mergeTvPool, nextTvPoolIndex, resumeIndexAfterPromo } from '@/lib/maharaja/tv-pool';

const SOURCE_SECONDS_FOR_LIVE = 6;
const TV_SECONDS_FOR_LIVE = 9;
const TV_PLAYBACK_RATE = SOURCE_SECONDS_FOR_LIVE / TV_SECONDS_FOR_LIVE;
type Slot = 'a' | 'b';
const REMOVED_TV_NAMES = new Set(['செந்தில்', 'senthil']);
const TV_LOCALITY = 'தஞ்சாவூர்';

type PlaybackItem = {
  queueId: string;
  videoId?: string | null;
  storagePath?: string | null;
  queueNumber?: number | null;
  reservationId: string;
  videoUrl: string;
  liveAudioUrl?: string | null;
  customerName?: string | null;
  customerLocality?: string | null;
  /** live: customer Go Live; replay: stored customer video; promo: the store's own promotional video. */
  source?: 'live' | 'replay' | 'promo';
  eventId?: string | null;
  playbackMode?: 'embedded' | 'external';
  durationSeconds?: number;
  playbackRate?: number;
  hasEmbeddedAudio?: boolean;
  timesPlayed?: number;
};

/** Secret code from a workspace's Go Live link (`/tv?screen=...`); empty on a staff-paired TV. */
function goLiveScreenCode() {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('screen') || '';
}

/** Every playback request names its workspace and bypasses all caches, so the queue is always current. */
function liveFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const code = goLiveScreenCode();
  if (code) headers.set('x-golive-screen', code);
  return fetch(input, { ...init, cache: 'no-store', headers });
}

export default function TvPlayerPage() {
  useEffect(() => {
    // Staff login pairs this browser once; a Go Live link needs no pairing.
    if (!goLiveScreenCode()) void fetch('/api/tv/pair', { method: 'POST' }).catch(() => undefined);
  }, []);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const promosRef = useRef<PlaybackItem[]>([]);
  const promoEveryRef = useRef(10);
  const customerPlaysSincePromoRef = useRef(0);
  const promoIndexRef = useRef(0);
  const resumeQueueIdRef = useRef<string | null>(null);
  // The store's promo videos, re-signed every 10 minutes so playback URLs never go stale.
  useEffect(() => {
    let active = true;
    const loadPromos = () => liveFetch('/api/maharaja/promos?playback=1')
      .then((response) => response.json())
      .then((data) => {
        if (!active || !data?.success) return;
        if (data.clientId) setScreenBrand({ clientId: data.clientId, clientName: data.clientName || 'Showroom' });
        promoEveryRef.current = Number(data.everyCustomerVideos) || 10;
        promosRef.current = (data.promos || []).map((promo: { id: string; videoUrl: string; durationSeconds?: number }) => ({
          queueId: `promo_${promo.id}`,
          reservationId: '',
          videoUrl: promo.videoUrl,
          source: 'promo' as const,
          playbackMode: 'embedded' as const,
          hasEmbeddedAudio: true,
          durationSeconds: promo.durationSeconds,
        }));
      })
      .catch(() => undefined);
    void loadPromos();
    const timer = window.setInterval(loadPromos, 10 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  // Each workspace's Go Live screen shows its own name; the Maharaja logo appears only on Maharaja's.
  const [screenBrand, setScreenBrand] = useState<{ clientId: string; clientName: string }>({ clientId: '', clientName: 'Showroom' });
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [currentPlayback, setCurrentPlayback] = useState<PlaybackItem | null>(null);
  const [slotItems, setSlotItems] = useState<Record<Slot, PlaybackItem | null>>({ a: null, b: null });
  const [activeSlot, setActiveSlot] = useState<Slot>('a');
  const [pendingSlot, setPendingSlot] = useState<Slot | null>(null);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [replayLibraryLoaded, setReplayLibraryLoaded] = useState(false);

  const videoARef = useRef<HTMLVideoElement | null>(null);
  const videoBRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentPlaybackRef = useRef<PlaybackItem | null>(null);
  const slotItemsRef = useRef<Record<Slot, PlaybackItem | null>>({ a: null, b: null });
  const activeSlotRef = useRef<Slot>('a');
  const pendingSlotRef = useRef<Slot | null>(null);
  const playlistRef = useRef<PlaybackItem[]>([]);
  const playlistIndexRef = useRef(0);
  const preloadedSlotRef = useRef<Slot | null>(null);
  const preloadedQueueIdRef = useRef<string | null>(null);
  const liveAudioStartedRef = useRef(false);
  const loopInProgressRef = useRef(false);
  const completedQueueIdsRef = useRef<Set<string>>(new Set());
  const completionRequestsRef = useRef<Map<string, Promise<'repeat' | 'completed' | null>>>(new Map());
  const pollInFlightRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackWatchdogRef = useRef<number | null>(null);
  const pendingWatchdogRef = useRef<number | null>(null);
  const stallRecoveryTimerRef = useRef<number | null>(null);
  const lastProgressAtRef = useRef<number>(0);
  const lastProgressPosRef = useRef<number>(0);
  const badQueueIdsRef = useRef<Set<string>>(new Set());
  const activatingSlotRef = useRef<Slot | null>(null);
  const pauseRecoveryRef = useRef<number | null>(null);
  const continuityRecoveryRef = useRef<number | null>(null);
  const buildVersionRef = useRef<string | null>(null);
  const pendingBuildReloadRef = useRef(false);

  useEffect(() => {
    currentPlaybackRef.current = currentPlayback;
  }, [currentPlayback]);

  useEffect(() => {
    slotItemsRef.current = slotItems;
  }, [slotItems]);

  useEffect(() => {
    activeSlotRef.current = activeSlot;
  }, [activeSlot]);

  useEffect(() => {
    pendingSlotRef.current = pendingSlot;
  }, [pendingSlot]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (playbackWatchdogRef.current) clearTimeout(playbackWatchdogRef.current);
      if (pendingWatchdogRef.current) clearTimeout(pendingWatchdogRef.current);
      if (stallRecoveryTimerRef.current) clearTimeout(stallRecoveryTimerRef.current);
      if (pauseRecoveryRef.current) clearTimeout(pauseRecoveryRef.current);
      if (continuityRecoveryRef.current) clearTimeout(continuityRecoveryRef.current);
      const audioEl = audioRef.current;
      audioEl?.pause();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const checkVersion = async () => {
      try {
        const response = await fetch(`/api/version?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        const version = typeof data.version === 'string' ? data.version : '';
        if (!version || !mounted) return;
        if (!buildVersionRef.current) {
          buildVersionRef.current = version;
          return;
        }
        if (version !== buildVersionRef.current) {
          pendingBuildReloadRef.current = true;
          if (!currentPlaybackRef.current && !pendingSlotRef.current) window.location.reload();
        }
      } catch (error) {
        console.warn('TV deployment version check failed; playback continues:', error);
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkVersion();
    };
    void checkVersion();
    const interval = window.setInterval(checkVersion, 60_000);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const getVideoRef = (slot: Slot) => (slot === 'a' ? videoARef.current : videoBRef.current);
  const getInactiveSlot = () => (activeSlotRef.current === 'a' ? 'b' : 'a');

  function displayCustomerName(playback: PlaybackItem | null): string {
    const value = playback?.customerName?.trim() || '';
    const isPlaceholder = !value || value === 'Maharaja Guest' || value === 'Maharaja Customer';
    // Live plays show exactly the name the customer entered.
    if (playback?.source === 'live' && !isPlaceholder) return value;
    if (value === 'திவ்யா' || value.toLocaleLowerCase() === 'divya') {
      return 'கார்த்திக்';
    }
    if (isPlaceholder || REMOVED_TV_NAMES.has(value.toLocaleLowerCase())) {
      const name = getTamilCustomerName(playback?.queueId || 'tv');
      return (name === 'திவ்யா' || name.toLocaleLowerCase() === 'divya') ? 'கார்த்திக்' : name;
    }
    return value;
  }

  function displayCustomerLocality(playback: PlaybackItem | null): string {
    void playback;
    return TV_LOCALITY;
  }

  function resetExternalAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    const hasSource = Boolean(audio.getAttribute('src'));
    if (!hasSource && audio.paused && audio.currentTime === 0) {
      liveAudioStartedRef.current = false;
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    audio.playbackRate = 1;
    audio.removeAttribute('src');
    audio.load();
    liveAudioStartedRef.current = false;
  }

  function configureVideo(video: HTMLVideoElement, playback: PlaybackItem) {
    const usesExternalAudio = playback.playbackMode === 'external';
    const rate = Number.isFinite(playback.playbackRate) && Number(playback.playbackRate) > 0
      ? Number(playback.playbackRate)
      : usesExternalAudio ? TV_PLAYBACK_RATE : 1;
    video.defaultPlaybackRate = rate;
    video.playbackRate = rate;
    video.muted = usesExternalAudio;
    video.volume = 0.92;
    if (!usesExternalAudio) resetExternalAudio();
  }

  const prefetchedUrlsRef = useRef<Set<string>>(new Set());
  function prefetchVideoUrl(url: string) {
    if (!url || prefetchedUrlsRef.current.has(url)) return;
    prefetchedUrlsRef.current.add(url);
    try {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.as = 'video';
      link.href = url;
      document.head.appendChild(link);
    } catch {
      // Ignore if document head is unavailable
    }
  }

  function setSlotPlayback(slot: Slot, playback: PlaybackItem | null) {
    slotItemsRef.current = { ...slotItemsRef.current, [slot]: playback };
    setSlotItems((prev) => ({ ...prev, [slot]: playback }));

    if (playback?.videoUrl) {
      prefetchVideoUrl(playback.videoUrl);
      window.requestAnimationFrame(() => {
        const video = getVideoRef(slot);
        if (video && playback.videoUrl) {
          if (video.src !== playback.videoUrl) {
            video.src = playback.videoUrl;
          }
          configureVideo(video, playback);
          video.load();
        }
      });
    }
  }

  function clearStallRecoveryTimer() {
    if (!stallRecoveryTimerRef.current) return;
    clearTimeout(stallRecoveryTimerRef.current);
    stallRecoveryTimerRef.current = null;
  }

  function clearPlaybackWatchdog() {
    if (playbackWatchdogRef.current) {
      clearTimeout(playbackWatchdogRef.current);
      playbackWatchdogRef.current = null;
    }
    clearStallRecoveryTimer();
  }

  function clearPendingWatchdog() {
    if (!pendingWatchdogRef.current) return;
    clearTimeout(pendingWatchdogRef.current);
    pendingWatchdogRef.current = null;
  }

  function removePlaybackFromPlaylist(queueId: string) {
    const removeIndex = playlistRef.current.findIndex((item) => item.queueId === queueId);
    playlistRef.current = playlistRef.current.filter((item) => item.queueId !== queueId);
    if (removeIndex >= 0 && playlistIndexRef.current >= removeIndex) {
      playlistIndexRef.current = Math.max(playlistIndexRef.current - 1, 0);
    }
  }

  function resetActivePlaybackState() {
    clearPlaybackWatchdog();
    clearStallRecoveryTimer();
    resetExternalAudio();
    loopInProgressRef.current = false;
    setIsPlayingVideo(false);
    setCurrentPlayback(null);
    currentPlaybackRef.current = null;
    setPlaybackError(null);
  }

  function scheduleContinuityRecovery(delayMs = 250) {
    if (continuityRecoveryRef.current) return;
    continuityRecoveryRef.current = window.setTimeout(() => {
      continuityRecoveryRef.current = null;
      if (currentPlaybackRef.current || pendingSlotRef.current) return;
      if (playlistRef.current.length > 0) {
        queueNextPlaylistItem();
        return;
      }
      void loadReplayLibrary().finally(() => {
        if (!currentPlaybackRef.current && !pendingSlotRef.current && !playlistRef.current.length) {
          scheduleContinuityRecovery(2000);
        }
      });
    }, delayMs);
  }

  function skipCurrentPlayback(reason: string) {
    const playback = currentPlaybackRef.current;
    if (!playback) return;

    console.warn('Skipping TV playback:', reason, playback.queueId);
    badQueueIdsRef.current.add(playback.queueId);
    removePlaybackFromPlaylist(playback.queueId);
    setSlotPlayback(activeSlotRef.current, null);
    resetActivePlaybackState();

    scheduleContinuityRecovery(80);
  }

  function skipPendingPlayback(slot: Slot, reason: string) {
    const playback = slotItemsRef.current[slot];
    if (!playback) return;

    console.warn('Skipping pending TV playback:', reason, playback.queueId);
    badQueueIdsRef.current.add(playback.queueId);
    removePlaybackFromPlaylist(playback.queueId);
    setSlotPlayback(slot, null);
    if (pendingSlotRef.current === slot) {
      pendingSlotRef.current = null;
      setPendingSlot(null);
    }
    clearPendingWatchdog();

    window.setTimeout(() => {
      const activeVideo = getVideoRef(activeSlotRef.current);
      if (!currentPlaybackRef.current || activeVideo?.ended || loopInProgressRef.current) {
        if (!currentPlaybackRef.current) scheduleContinuityRecovery(0);
        else queueNextPlaylistItem();
        return;
      }
      preloadNextPlaylistItem();
    }, 80);
  }

  async function notifyPlaybackComplete(playback: PlaybackItem, playNumber: number): Promise<'repeat' | 'completed' | null> {
    if (completedQueueIdsRef.current.has(playback.queueId)) return 'completed';
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await liveFetch('/api/live/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            queueId: playback.queueId,
            reservationId: playback.reservationId,
            playNumber,
          }),
        });
        if (!response.ok) throw new Error(`Completion returned ${response.status}`);
        const data = await response.json().catch(() => ({}));
        if (data.status === 'completed') {
          completedQueueIdsRef.current.add(playback.queueId);
          return 'completed';
        }
        completedQueueIdsRef.current.delete(playback.queueId);
        return data.status === 'repeat' ? 'repeat' : null;
      } catch (err) {
        console.error(`Failed to notify completion (attempt ${attempt}/3):`, err);
        if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, attempt * 500));
      }
    }
    return null;
  }

  function beginCompletionNotification(playback: PlaybackItem, playNumber: number): Promise<'repeat' | 'completed' | null> {
    const existing = completionRequestsRef.current.get(playback.queueId);
    if (existing) return existing;

    const request = notifyPlaybackComplete(playback, playNumber).finally(() => {
      completionRequestsRef.current.delete(playback.queueId);
    });
    completionRequestsRef.current.set(playback.queueId, request);
    return request;
  }

  function preparePlayback(playback: PlaybackItem) {
    const slot = getInactiveSlot();
    clearPendingWatchdog();
    liveAudioStartedRef.current = false;
    loopInProgressRef.current = false;
    pendingSlotRef.current = slot;
    setPendingSlot(slot);
    setSlotPlayback(slot, playback);
    pendingWatchdogRef.current = window.setTimeout(() => {
      if (
        pendingSlotRef.current === slot &&
        slotItemsRef.current[slot]?.queueId === playback.queueId
      ) {
        skipPendingPlayback(slot, 'video could not preload quickly');
      }
    }, 30000);
  }

  function preloadNextPlaylistItem() {
    const playlist = playlistRef.current;
    const current = currentPlaybackRef.current;
    if (!current || playlist.length <= 1 || pendingSlotRef.current) return;

    const nextIndex = (playlistIndexRef.current + 1) % playlist.length;
    const nextPlayback = playlist[nextIndex];
    if (!nextPlayback || nextPlayback.queueId === current.queueId) return;

    const slot = getInactiveSlot();
    const alreadyPreloaded = slotItemsRef.current[slot]?.queueId === nextPlayback.queueId;
    preloadedSlotRef.current = slot;
    preloadedQueueIdRef.current = nextPlayback.queueId;

    if (alreadyPreloaded) return;
    setSlotPlayback(slot, nextPlayback);
  }

  function appendPlaylistItem(playback: PlaybackItem) {
    playlistRef.current = mergeTvPool(
      playlistRef.current,
      [playback],
      badQueueIdsRef.current,
    );

    if (!currentPlaybackRef.current && !pendingSlotRef.current) {
      playlistIndexRef.current = Math.max(playlistRef.current.findIndex((item) => item.queueId === playback.queueId), 0);
      preparePlayback(playback);
    }
  }

  function insertLivePlaybackNext(playback: PlaybackItem) {
    badQueueIdsRef.current.delete(playback.queueId);

    const existingIndex = playlistRef.current.findIndex((item) => item.queueId === playback.queueId);
    if (existingIndex >= 0) {
      playlistRef.current = playlistRef.current.map((item, index) => (
        index === existingIndex ? { ...item, ...playback, source: 'live' } : item
      ));
      return;
    }

    if (!currentPlaybackRef.current && !pendingSlotRef.current) {
      playlistRef.current = [{ ...playback, source: 'live' }];
      playlistIndexRef.current = 0;
      preparePlayback({ ...playback, source: 'live' });
      return;
    }

    const insertAt = Math.min(playlistIndexRef.current + 1, playlistRef.current.length);
    const nextPlaylist = [...playlistRef.current];
    nextPlaylist.splice(insertAt, 0, { ...playback, source: 'live' });
    playlistRef.current = nextPlaylist;
    preloadedSlotRef.current = null;
    preloadedQueueIdRef.current = null;
    preloadNextPlaylistItem();
  }

  function hasOutstandingLivePlayback() {
    return currentPlaybackRef.current?.source === 'live'
      || Boolean(pendingSlotRef.current && slotItemsRef.current[pendingSlotRef.current]?.source === 'live')
      || playlistRef.current.some((item) => item.source === 'live');
  }

  async function loadReplayLibrary() {
    try {
      let offset = 0;
      do {
        // Start with a small page so the screen begins playing promptly even
        // when the showroom library contains many historical videos.
        const res = await liveFetch(`/api/live/replays?limit=24&offset=${offset}`, { cache: 'no-store' });
        const data = await res.json();
        if (!data.success || !Array.isArray(data.items)) return;
        data.items.forEach((item: PlaybackItem) => {
          appendPlaylistItem({ ...item, source: 'replay' });
        });
        offset = typeof data.nextOffset === 'number' ? data.nextOffset : -1;
      } while (offset >= 0);
    } catch (err) {
      console.warn('Replay library load failed:', err);
    } finally {
      setReplayLibraryLoaded(true);
    }
  }

  useEffect(() => {
    if (!audioUnlocked) return;

    let isMounted = true;

    void loadReplayLibrary();
    const replayRefresh = window.setInterval(() => {
      void loadReplayLibrary();
    }, 120 * 1000);

    const pollNextVideo = async () => {
      if (hasOutstandingLivePlayback()) {
        if (isMounted) timeoutRef.current = setTimeout(pollNextVideo, 2000);
        return;
      }
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      // An empty queue is checked every 8 s (each check runs several Firestore queries);
      // right after a video arrives the next check follows in 2 s.
      let nextPollMs = 8000;

      try {
        const res = await liveFetch('/api/live/next');
        if (!isMounted) return;

        const data = await res.json();

        if (data.status === 'play' && data.videoUrl) {
          nextPollMs = 2000;
          insertLivePlaybackNext({
            queueId: data.queueId,
            queueNumber: data.queueNumber || null,
            reservationId: data.reservationId,
            videoUrl: data.videoUrl,
            liveAudioUrl: data.liveAudioUrl || getLiveAudioTrack(data.queueId || data.reservationId || data.videoUrl),
            customerName: data.customerName || null,
            customerLocality: data.customerLocality || null,
            playbackMode: data.playbackMode || 'embedded',
            durationSeconds: data.durationSeconds || null,
            playbackRate: data.playbackRate || 1,
            hasEmbeddedAudio: data.hasEmbeddedAudio !== false,
            timesPlayed: Number(data.timesPlayed || 0),
            source: 'live',
          });
        }
      } catch (err) {
        console.warn('TV polling network error, retrying:', err);
      } finally {
        pollInFlightRef.current = false;
        if (isMounted) {
          timeoutRef.current = setTimeout(pollNextVideo, nextPollMs);
        }
      }
    };

    pollNextVideo();

    return () => {
      isMounted = false;
      window.clearInterval(replayRefresh);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [audioUnlocked]);

  const startVideoPlayback = async () => {
    const video = getVideoRef(activeSlotRef.current);
    const playback = currentPlaybackRef.current;
    if (!video || !playback) return;

    setPlaybackError(null);
    liveAudioStartedRef.current = false;
    loopInProgressRef.current = false;
    lastProgressAtRef.current = Date.now();
    lastProgressPosRef.current = 0;
    clearStallRecoveryTimer();
    try {
      video.currentTime = 0;
      configureVideo(video, playback);

      if (playback.playbackMode === 'external' && audioRef.current) {
        audioRef.current.src = playback.liveAudioUrl || getLiveAudioTrack(playback.queueId);
        audioRef.current.currentTime = 0;
        audioRef.current.volume = 0.88;
      }
      await video.play();
      clearPlaybackWatchdog();
      playbackWatchdogRef.current = window.setTimeout(() => {
        const activeVideo = getVideoRef(activeSlotRef.current);
        const activePlayback = currentPlaybackRef.current;
        if (!activeVideo || !activePlayback || activePlayback.queueId !== playback.queueId) return;
        if (activeVideo.paused || activeVideo.readyState < 2 || activeVideo.currentTime < 0.12) {
          skipCurrentPlayback('video did not visibly start');
        }
      }, 12000);

      liveFetch('/api/tv/playing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queueId: playback.queueId,
          reservationId: playback.reservationId,
        }),
      }).catch((err) => console.error('Failed to notify playing status:', err));
    } catch (err) {
      console.error('Video playback error / autoplay blocked:', err);
      resetExternalAudio();
      try {
        // Some kiosk browsers revoke audible autoplay after a source change.
        // Preserve continuous visuals and restore normal audio on the next item.
        video.muted = true;
        await video.play();
        setPlaybackError('Audio was blocked for this video. Continuous playback remains active.');
      } catch (mutedError) {
        console.error('Muted playback recovery also failed:', mutedError);
        skipCurrentPlayback('browser rejected normal and muted playback');
      }
    }
  };

  useEffect(() => {
    if (!isPlayingVideo || !currentPlayback) return;
    const activeVideo = getVideoRef(activeSlotRef.current);
    if (activeVideo && !activeVideo.paused && activeVideo.currentTime > 0) return;
    const timeout = window.setTimeout(() => {
      void startVideoPlayback();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [isPlayingVideo, currentPlayback, activeSlot]);

  useEffect(() => {
    if (!isPlayingVideo || !currentPlayback?.reservationId) return;
    const heartbeat = () => {
      void liveFetch('/api/tv/playing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queueId: currentPlayback.queueId,
          reservationId: currentPlayback.reservationId,
          heartbeat: true,
        }),
      });
    };
    heartbeat();
    const interval = window.setInterval(heartbeat, 12000);
    return () => window.clearInterval(interval);
  }, [isPlayingVideo, currentPlayback]);

  useEffect(() => {
    if (!currentPlayback) return;

    const timeout = window.setTimeout(preloadNextPlaylistItem, 80);
    return () => window.clearTimeout(timeout);
  }, [currentPlayback, activeSlot]);

  // Recover browser pauses, then skip an asset that still makes no progress.
  useEffect(() => {
    if (!isPlayingVideo || !currentPlayback) return;
    const interval = window.setInterval(() => {
      const activeVideo = getVideoRef(activeSlotRef.current);
      if (!activeVideo || activeVideo.ended || loopInProgressRef.current) return;
      const stalledFor = Date.now() - lastProgressAtRef.current;
      if (activeVideo.paused && stalledFor < 8000) {
        void activeVideo.play().catch(() => undefined);
        return;
      }
      if (stalledFor > 8000) {
        console.warn('Continuous stall watchdog triggered: playback made no progress for >8s, skipping asset.');
        loopInProgressRef.current = true;
        void handleVideoError(activeSlotRef.current);
      }
    }, 1500);
    return () => window.clearInterval(interval);
  }, [isPlayingVideo, currentPlayback, activeSlot]);

  const startLiveAudioWithVisibleVideo = (slot: Slot, video: HTMLVideoElement) => {
    const playback = currentPlaybackRef.current;
    if (slot !== activeSlotRef.current || !playback) return;
    if (video.readyState < 2 || video.currentTime < 0.08 || video.paused) return;

    if (playback.playbackMode !== 'external') {
      video.muted = false;
      video.volume = 0.92;
      if (liveAudioStartedRef.current || audioRef.current?.getAttribute('src')) resetExternalAudio();
      return;
    }

    video.muted = true;
    if (!audioRef.current || liveAudioStartedRef.current) return;
    liveAudioStartedRef.current = true;
    window.requestAnimationFrame(() => {
      if (!audioRef.current || video.paused) return;
      const sourceDuration = playback.durationSeconds || SOURCE_SECONDS_FOR_LIVE;
      const initialAudioTime = Math.min(video.currentTime / sourceDuration, 1) * TV_SECONDS_FOR_LIVE;
      audioRef.current.src = playback.liveAudioUrl || getLiveAudioTrack(playback.queueId);
      audioRef.current.currentTime = initialAudioTime;
      audioRef.current.playbackRate = 1;
      audioRef.current.volume = 0.88;
      audioRef.current.play().catch((audioErr) => {
        console.warn('Live TV audio playback blocked or failed:', audioErr);
      });
    });
  };

  const activatePendingSlot = async (slot: Slot) => {
    if (slot !== pendingSlotRef.current) return;
    if (activatingSlotRef.current === slot) return;
    const playback = slotItemsRef.current[slot];
    const video = getVideoRef(slot);
    if (!playback || !video || video.readyState < 2) return;

    activatingSlotRef.current = slot;
    try {
      const previousSlot = activeSlotRef.current;
      // Retain the finished clip until the replacement video has actually started.
      video.currentTime = 0;
      configureVideo(video, playback);
      await video.play();
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

      clearPendingWatchdog();
      const index = playlistRef.current.findIndex((item) => item.queueId === playback.queueId);
      if (index >= 0) playlistIndexRef.current = index;
      resetExternalAudio();
      currentPlaybackRef.current = playback;
      activeSlotRef.current = slot;
      setCurrentPlayback(playback);
      setActiveSlot(slot);
      setPendingSlot(null);
      pendingSlotRef.current = null;
      preloadedSlotRef.current = null;
      preloadedQueueIdRef.current = null;
      setIsPlayingVideo(true);
      const previousVideo = getVideoRef(previousSlot);
      window.setTimeout(() => {
        if (previousSlot !== slot && previousVideo && !previousVideo.paused) previousVideo.pause();
      }, 140);
      lastProgressAtRef.current = Date.now();
      lastProgressPosRef.current = 0;
      window.requestAnimationFrame(() => {
        loopInProgressRef.current = false;
      });
      // Promos are the store's own files, not customer queue items.
      if (playback.source !== 'promo') void liveFetch('/api/tv/playing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId: playback.queueId, reservationId: playback.reservationId }),
      });
    } catch (error) {
      console.warn('Pending TV video could not start:', error);
      skipPendingPlayback(slot, 'video could not start');
    } finally {
      activatingSlotRef.current = null;
    }
  };

  useEffect(() => {
    if (!pendingSlot) return;

    const tryActivate = () => {
      void activatePendingSlot(pendingSlot);
    };

    const frame = window.requestAnimationFrame(tryActivate);
    const timeout = window.setTimeout(tryActivate, 350);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [pendingSlot, slotItems]);

  function queueNextPlaylistItem() {
    const playlist = playlistRef.current;
    if (!playlist.length) {
      scheduleContinuityRecovery(500);
      return;
    }

    // After every N customer videos, one of the store's promos plays, rotating through them.
    const current = currentPlaybackRef.current;
    const promos = promosRef.current;
    if (current && isPromoDue(customerPlaysSincePromoRef.current, promoEveryRef.current, promos.length, current.source)) {
      const promo = promos[promoIndexRef.current % promos.length];
      promoIndexRef.current += 1;
      customerPlaysSincePromoRef.current = 0;
      resumeQueueIdRef.current = current.queueId;
      preparePlayback(promo);
      return;
    }
    // After a promo, the customer loop resumes right after the video that played before it.
    if (current?.source === 'promo') {
      playlistIndexRef.current = resumeIndexAfterPromo(playlist, resumeQueueIdRef.current);
      preparePlayback(playlist[playlistIndexRef.current]);
      return;
    }

    if (!currentPlaybackRef.current) {
      const index = playlistIndexRef.current % playlist.length;
      playlistIndexRef.current = index;
      preparePlayback(playlist[index]);
      return;
    }

    const currentIndex = playlist.findIndex((item) => item.queueId === currentPlaybackRef.current?.queueId);
    const currentStillInPlaylist = currentIndex >= 0
      && playlist[currentIndex].source === currentPlaybackRef.current.source;

    // A live item was just completed and replaced by its replay entry. Do not
    // restart the stale live item; activate the replay asset instead.
    if (!currentStillInPlaylist) {
      playlistIndexRef.current = currentIndex >= 0 ? currentIndex : 0;
      preparePlayback(playlist[playlistIndexRef.current]);
      return;
    }

    if (playlist.length === 1) {
      const video = getVideoRef(activeSlotRef.current);
      const playback = currentPlaybackRef.current;
      if (!video || !playback) return;
      void startVideoPlayback().finally(() => {
        loopInProgressRef.current = false;
      });
      return;
    }

    const nextIndex = nextTvPoolIndex(playlist, currentPlaybackRef.current.queueId);
    if (nextIndex < 0) {
      scheduleContinuityRecovery(500);
      return;
    }
    const nextPlayback = playlist[nextIndex];
    const preloadedSlot = preloadedSlotRef.current;

    if (
      preloadedSlot &&
      preloadedQueueIdRef.current === nextPlayback.queueId &&
      slotItemsRef.current[preloadedSlot]?.queueId === nextPlayback.queueId
    ) {
      pendingSlotRef.current = preloadedSlot;
      setPendingSlot(preloadedSlot);
      void activatePendingSlot(preloadedSlot);
      return;
    }

    preparePlayback(nextPlayback);
  }

  const handleVideoEnded = async () => {
    const playback = currentPlaybackRef.current;
    if (!playback) return;
    clearPlaybackWatchdog();
    clearStallRecoveryTimer();

    if (playback.source === 'live' || playback.source === undefined) {
      const playNumber = Number(playback.timesPlayed || 0) + 1;

      // Start completion notification in background so screen continuity is never stalled
      void beginCompletionNotification(playback, playNumber).catch((err) => {
        console.warn('Background completion notice failed:', err);
      });

      if (playNumber < 2) {
        const nextPlay = { ...playback, timesPlayed: playNumber };
        currentPlaybackRef.current = nextPlay;
        loopInProgressRef.current = false;
        liveAudioStartedRef.current = false;
        void startVideoPlayback();
        return;
      }

      completedQueueIdsRef.current.add(playback.queueId);
      removePlaybackFromPlaylist(playback.queueId);
      if (!playlistRef.current.length) {
        playlistRef.current = [{ ...playback, source: 'replay' }];
        playlistIndexRef.current = 0;
      }
      void loadReplayLibrary();
    }

    if (pendingBuildReloadRef.current) {
      window.location.reload();
      return;
    }

    if (playback.source !== 'promo') customerPlaysSincePromoRef.current += 1;
    resetExternalAudio();
    liveAudioStartedRef.current = false;
    setPlaybackError(null);
    queueNextPlaylistItem();
  };

  const handleVideoStalled = (slot: Slot) => {
    if (slot !== activeSlotRef.current || !currentPlaybackRef.current) return;
    if (stallRecoveryTimerRef.current) return;
    stallRecoveryTimerRef.current = window.setTimeout(() => {
      stallRecoveryTimerRef.current = null;
      const activeVideo = getVideoRef(activeSlotRef.current);
      if (!activeVideo || activeVideo.ended || loopInProgressRef.current) return;
      console.warn('Playback stalled for >3.5s; attempting recovery before the main watchdog skips it.');
      void activeVideo.play().catch(() => undefined);
    }, 3500);
  };

  const handleVideoPaused = (slot: Slot, video: HTMLVideoElement) => {
    if (slot !== activeSlotRef.current || video.ended || loopInProgressRef.current) return;
    if (!currentPlaybackRef.current || !isPlayingVideo) return;
    if (pauseRecoveryRef.current) clearTimeout(pauseRecoveryRef.current);
    pauseRecoveryRef.current = window.setTimeout(() => {
      pauseRecoveryRef.current = null;
      if (slot !== activeSlotRef.current || video.ended || loopInProgressRef.current) return;
      void video.play().catch(() => undefined);
    }, 250);
  };

  const handleVideoProgress = (slot: Slot, video: HTMLVideoElement) => {
    if (slot !== activeSlotRef.current || !currentPlaybackRef.current) return;

    startLiveAudioWithVisibleVideo(slot, video);
    if (video.currentTime > 0.18) {
      clearPlaybackWatchdog();
    }

    // Heartbeat tracking for frozen screen detection
    if (Math.abs(video.currentTime - lastProgressPosRef.current) > 0.05) {
      lastProgressPosRef.current = video.currentTime;
      lastProgressAtRef.current = Date.now();
      clearStallRecoveryTimer();
    }

    const playback = currentPlaybackRef.current;
    if (!playback || playback.playbackMode !== 'external') return;

    const audio = audioRef.current;
    if (audio && !audio.paused) {
      const sourceDuration = (Number.isFinite(video.duration) && video.duration > 1)
        ? video.duration
        : (playback.durationSeconds || SOURCE_SECONDS_FOR_LIVE);
      const targetAudioTime = Math.min(video.currentTime / sourceDuration, 1) * TV_SECONDS_FOR_LIVE;
      const drift = targetAudioTime - audio.currentTime;

      // Hard seek only on start or major desync (>0.45s) to eliminate buffer flush stutter/clicks
      if (Math.abs(drift) > 0.45) {
        audio.currentTime = targetAudioTime;
      } else if (Math.abs(drift) > 0.04) {
        // Smooth drift steering: micro-adjust playback rate instead of hard seeking
        const adjustment = Math.max(-0.06, Math.min(0.06, drift * 0.4));
        audio.playbackRate = Math.max(0.92, Math.min(1.08, 1.0 + adjustment));
      } else {
        audio.playbackRate = 1.0;
      }
    }
  };

  const handleVideoError = async (slot: Slot) => {
    const playback = slot === activeSlotRef.current
      ? currentPlaybackRef.current
      : slotItemsRef.current[slot];
    if (!playback) return;
    clearPlaybackWatchdog();
    clearStallRecoveryTimer();
    resetExternalAudio();

    if (slot !== activeSlotRef.current) {
      skipPendingPlayback(slot, 'pending video browser playback error');
      return;
    }

    try {
      if (playback.source === 'live' || playback.source === undefined) {
        await liveFetch('/api/live/fail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            queueId: playback.queueId,
            reservationId: playback.reservationId,
            reason: 'TV browser playback error',
          }),
        });
      }
    } catch (err) {
      console.error('Failed to notify playback failure:', err);
    } finally {
      if (pendingBuildReloadRef.current) {
        window.location.reload();
        return;
      }
      badQueueIdsRef.current.add(playback.queueId);
      removePlaybackFromPlaylist(playback.queueId);
      resetActivePlaybackState();
      scheduleContinuityRecovery(80);
    }
  };

  const renderVideoSlot = (slot: Slot) => {
    const playback = slotItems[slot];
    const isActive = activeSlot === slot && playback;
    const isPending = pendingSlot === slot && playback;

    return (
      <video
        key={`tv-video-slot-${slot}`}
        ref={slot === 'a' ? videoARef : videoBRef}
        src={playback?.videoUrl || undefined}
        playsInline
        preload="auto"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          if (playback) configureVideo(video, playback);
        }}
        onCanPlay={() => {
          if (isPending) void activatePendingSlot(slot);
        }}
        onLoadedData={() => {
          if (isPending) void activatePendingSlot(slot);
        }}
        onCanPlayThrough={() => {
          if (isPending) void activatePendingSlot(slot);
        }}
        onPlaying={(event) => startLiveAudioWithVisibleVideo(slot, event.currentTarget)}
        onPause={(event) => handleVideoPaused(slot, event.currentTarget)}
        onTimeUpdate={(event) => handleVideoProgress(slot, event.currentTarget)}
        onWaiting={() => {
          if (isActive) handleVideoStalled(slot);
        }}
        onStalled={() => {
          if (isActive) handleVideoStalled(slot);
        }}
        onEnded={() => {
          if (isActive && !loopInProgressRef.current) {
            loopInProgressRef.current = true;
            void handleVideoEnded();
          }
        }}
        onError={() => handleVideoError(slot)}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-in-out ${
          isActive ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
        }`}
      />
    );
  };

  if (!audioUnlocked) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center bg-[#2B0506] p-4 sm:p-6 text-center select-none font-sans">
        <div className="max-w-xl w-full rounded-lg border border-[#F6D36A]/45 bg-[#170202]/92 p-6 sm:p-10 shadow-2xl space-y-5 sm:space-y-6">
          {screenBrand.clientId === 'maharaja' && <img
            src="/maharaja-logo.png"
            alt="Majestic Maharaja"
            className="mx-auto h-24 w-24 sm:h-32 sm:w-32 rounded-lg object-cover border border-[#F6D36A]/35"
          />}
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-widest text-[#F8E8A8] uppercase">
              {screenBrand.clientName} TV
            </h1>
            <p className="mt-2 text-xs font-bold uppercase tracking-[0.24em] text-[#F6D36A]/80">
              Diwali Celebration Screen
            </p>
          </div>
          <p className="text-xs sm:text-sm leading-6 sm:leading-7 text-[#F8E8A8]/75">
            Tap once to start the showroom player, enable festival background music, and receive live AI videos.
          </p>
          <button
            onClick={() => {
              setAudioUnlocked(true);
            }}
            className="min-h-16 w-full rounded-lg bg-[#F6D36A] px-6 py-3.5 sm:px-8 sm:py-4 text-sm sm:text-base font-black uppercase tracking-wider text-[#3B0507] shadow-2xl transition hover:brightness-110 flex items-center justify-center gap-3"
          >
            <Volume2 className="h-5 w-5 sm:h-6 sm:w-6" /> Start Showroom Screen
          </button>
        </div>
      </main>
    );
  }

  const festivalTitle =
    currentPlayback?.eventId === 'pongal'
      ? 'பொங்கல்'
      : currentPlayback?.eventId === 'new-year'
      ? 'புத்தாண்டு'
      : currentPlayback?.eventId === 'christmas'
      ? 'கிறிஸ்துமஸ்'
      : currentPlayback?.eventId === 'ramadan'
      ? 'ரமலான்'
      : currentPlayback?.eventId === 'birthday'
      ? 'பிறந்தநாள்'
      : 'தீபாவளி';

  return (
    <main className="relative min-h-[100dvh] w-full overflow-x-hidden bg-[#4A0707] text-[#F8E8A8] select-none lg:fixed lg:inset-0 lg:h-[100dvh] lg:w-[100dvw] lg:overflow-hidden">
      <audio ref={audioRef} preload="auto" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_20%,rgba(246,211,106,0.15),transparent_26%),radial-gradient(circle_at_82%_72%,rgba(255,241,168,0.12),transparent_30%),linear-gradient(135deg,#320405_0%,#5D0B09_42%,#210202_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(0deg,rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:9px_9px]" />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[1920px] flex-col items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:grid lg:h-full lg:grid-cols-[minmax(180px,1fr)_auto_minmax(220px,1fr)] lg:gap-8 lg:px-10 lg:py-8 xl:px-14 xl:py-10">
        {/* Left / Top Brand Section */}
        <section className="flex w-full items-center justify-center gap-3.5 lg:h-full lg:flex-col lg:gap-5">
          {screenBrand.clientId === 'maharaja' ? <img
            src="/maharaja-logo.png"
            alt="Majestic Maharaja"
            className="h-14 w-14 shrink-0 rounded-lg border border-[#F6D36A]/45 object-cover shadow-[0_12px_40px_rgba(0,0,0,0.42)] sm:h-20 sm:w-20 lg:h-auto lg:w-[78%] lg:max-w-[300px]"
          /> : <p className="font-serif text-2xl font-black uppercase tracking-[0.12em] text-[#FFF1A8] lg:text-center">{screenBrand.clientName}</p>}
          <div className="text-left lg:text-center">
            <p className="font-serif text-xl font-black uppercase tracking-[0.14em] text-[#FFF1A8] sm:text-2xl lg:text-[clamp(1.65rem,2.4vw,2.5rem)]">
              AI Diwali
            </p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[#F6D36A]/85 sm:text-xs lg:mt-2 lg:text-sm">
              Fashion Film
            </p>
          </div>
        </section>

        {/* Center 9:16 Video Player */}
        <section className="flex w-full flex-1 items-center justify-center lg:h-full">
          <div className="relative aspect-[9/16] h-[54dvh] max-h-[640px] w-auto max-w-[86vw] overflow-hidden rounded-lg border-[3px] border-[#F6D36A] bg-black shadow-[0_0_58px_rgba(246,211,106,0.22),0_22px_70px_rgba(0,0,0,0.52)] sm:h-[60dvh] sm:max-h-[760px] lg:h-[min(86dvh,calc(42vw*16/9))] lg:max-h-[88dvh]">
            {renderVideoSlot('a')}
            {renderVideoSlot('b')}

            {!currentPlayback && (
              <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center bg-[#120203] p-5 text-center sm:p-7">
                <Sparkles className="mb-4 h-10 w-10 animate-pulse text-[#F6D36A] sm:mb-5 sm:h-14 sm:w-14" />
                <p className="font-serif text-xl font-black leading-tight text-[#FFF1A8] sm:text-2xl lg:text-3xl">
                  {!replayLibraryLoaded
                    ? 'Loading showroom videos'
                    : pendingSlot
                      ? 'Loading next showroom video'
                      : 'No showroom video ready'}
                </p>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#F6D36A]/70 sm:mt-4 sm:text-xs">
                  {!replayLibraryLoaded
                    ? 'Connecting to the video library'
                    : pendingSlot
                      ? 'Preparing playback'
                      : 'Add samples in Maharaja admin'}
                </p>
              </div>
            )}

            {playbackError && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/92 p-5 text-center">
                <AlertCircle className="mb-3 h-10 w-10 text-[#F6D36A]" />
                <p className="mb-4 text-xs text-white">{playbackError}</p>
                <button
                  onClick={startVideoPlayback}
                  className="rounded-lg bg-[#F6D36A] px-6 py-2 text-xs font-black uppercase text-[#3B0507]"
                >
                  Press Play
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Right / Bottom Tamil Greeting & Customer Details */}
        <section className="flex w-full min-w-0 flex-col items-center justify-center text-center lg:h-full lg:items-start lg:text-left">
          <div className="w-full max-w-md border-t border-[#F6D36A]/35 pt-3 lg:max-w-none lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 xl:pl-8">
            <h1
              className="break-words text-[clamp(1.35rem,4.5vw,2.2rem)] font-black leading-[1.12] text-[#FFF1A8] [text-shadow:0_5px_22px_rgba(0,0,0,0.55)] lg:text-[clamp(1.75rem,3.3vw,4.4rem)] lg:leading-[1.08]"
              style={{ fontFamily: "'Noto Serif Tamil', 'Noto Sans Tamil', Latha, 'Tamil Sangam MN', serif" }}
            >
              இனிய{' '}
              <br className="hidden lg:inline" />
              {festivalTitle}{' '}
              <br className="hidden lg:inline" />
              நல்வாழ்த்துக்கள்
            </h1>

            <div className="mx-auto mt-3 h-px w-3/4 bg-gradient-to-r from-transparent via-[#F6D36A] to-transparent lg:mx-0 lg:mt-6 lg:w-4/5 lg:from-[#F6D36A] lg:to-transparent" />

            <p
              className="mt-3 break-words text-[clamp(1.1rem,3.5vw,1.6rem)] font-black leading-tight text-white lg:mt-6 lg:text-[clamp(1.3rem,2.1vw,2.5rem)]"
              style={{ fontFamily: "'Noto Serif Tamil', 'Noto Sans Tamil', Latha, 'Tamil Sangam MN', serif" }}
            >
              {displayCustomerName(currentPlayback)}
            </p>
            <p
              className="mt-1 break-words text-[clamp(0.95rem,2.8vw,1.25rem)] font-bold text-[#F6D36A] lg:mt-2.5 lg:text-[clamp(1.05rem,1.6vw,1.9rem)]"
              style={{ fontFamily: "'Noto Serif Tamil', 'Noto Sans Tamil', Latha, 'Tamil Sangam MN', serif" }}
            >
              {displayCustomerLocality(currentPlayback)}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
