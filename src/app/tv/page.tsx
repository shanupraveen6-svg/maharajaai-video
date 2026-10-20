'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Sparkles, Volume2 } from 'lucide-react';
import { getLiveAudioTrack } from '@/lib/maharaja/audio';
import { getTamilCustomerName } from '@/lib/maharaja/names';

const SOURCE_SECONDS_FOR_LIVE = 6;
const TV_SECONDS_FOR_LIVE = 9;
const TV_PLAYBACK_RATE = SOURCE_SECONDS_FOR_LIVE / TV_SECONDS_FOR_LIVE;
type Slot = 'a' | 'b';
const REMOVED_TV_NAMES = new Set(['செந்தில்', 'senthil']);
const TV_LOCALITY = 'தஞ்சாவூர்';

type PlaybackItem = {
  queueId: string;
  reservationId: string;
  videoUrl: string;
  liveAudioUrl?: string | null;
  customerName?: string | null;
  customerLocality?: string | null;
  source?: 'live' | 'replay';
  eventId?: string | null;
  playbackMode?: 'embedded' | 'external';
  durationSeconds?: number;
  playbackRate?: number;
  hasEmbeddedAudio?: boolean;
};

export default function TvPlayerPage() {
  const [audioUnlocked, setAudioUnlocked] = useState(false);
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
  const pollInFlightRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackWatchdogRef = useRef<number | null>(null);
  const pendingWatchdogRef = useRef<number | null>(null);
  const stallRecoveryTimerRef = useRef<number | null>(null);
  const lastProgressAtRef = useRef<number>(Date.now());
  const lastProgressPosRef = useRef<number>(0);
  const badQueueIdsRef = useRef<Set<string>>(new Set());

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
      const audioEl = audioRef.current;
      audioEl?.pause();
    };
  }, []);

  const getVideoRef = (slot: Slot) => (slot === 'a' ? videoARef.current : videoBRef.current);
  const getInactiveSlot = () => (activeSlotRef.current === 'a' ? 'b' : 'a');

  function displayCustomerName(playback: PlaybackItem | null): string {
    const value = playback?.customerName?.trim() || '';
    if (value === 'திவ்யா' || value.toLocaleLowerCase() === 'divya') {
      return 'கார்த்திக்';
    }
    if (!value || value === 'Maharaja Guest' || value === 'Maharaja Customer' || REMOVED_TV_NAMES.has(value.toLocaleLowerCase())) {
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

  function setSlotPlayback(slot: Slot, playback: PlaybackItem | null) {
    slotItemsRef.current = { ...slotItemsRef.current, [slot]: playback };
    setSlotItems((prev) => ({ ...prev, [slot]: playback }));
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

  function skipCurrentPlayback(reason: string) {
    const playback = currentPlaybackRef.current;
    if (!playback) return;

    console.warn('Skipping TV playback:', reason, playback.queueId);
    resetActivePlaybackState();

    if (playlistRef.current.length > 0) {
      window.setTimeout(() => queueNextPlaylistItem(), 80);
    }
  }

  function skipPendingPlayback(slot: Slot, reason: string) {
    const playback = slotItemsRef.current[slot];
    if (!playback) return;

    console.warn('Skipping pending TV playback:', reason, playback.queueId);
    setSlotPlayback(slot, null);
    if (pendingSlotRef.current === slot) {
      pendingSlotRef.current = null;
      setPendingSlot(null);
    }
    clearPendingWatchdog();

    window.setTimeout(queueNextPlaylistItem, 80);
  }

  async function notifyPlaybackComplete(playback: PlaybackItem) {
    if (completedQueueIdsRef.current.has(playback.queueId)) return;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch('/api/live/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            queueId: playback.queueId,
            reservationId: playback.reservationId,
          }),
        });
        if (!response.ok) throw new Error(`Completion returned ${response.status}`);
        const data = await response.json().catch(() => ({}));
        if (data.status === 'completed') completedQueueIdsRef.current.add(playback.queueId);
        else completedQueueIdsRef.current.delete(playback.queueId);
        return;
      } catch (err) {
        console.error(`Failed to notify completion (attempt ${attempt}/3):`, err);
        if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, attempt * 500));
      }
    }
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
    if (badQueueIdsRef.current.has(playback.queueId)) return;

    const existingIndex = playlistRef.current.findIndex((item) => item.queueId === playback.queueId);
    if (existingIndex >= 0) {
      playlistRef.current = playlistRef.current.map((item, index) => (
        index === existingIndex ? { ...item, ...playback } : item
      ));
    } else {
      playlistRef.current = [...playlistRef.current, playback];
    }

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
    window.setTimeout(preloadNextPlaylistItem, 50);
  }

  async function loadReplayLibrary() {
    try {
      let offset = 0;
      do {
        const res = await fetch(`/api/live/replays?limit=200&offset=${offset}`, { cache: 'no-store' });
        const data = await res.json();
        if (!data.success || !Array.isArray(data.items)) return;
        data.items.forEach((item: PlaybackItem) => {
          badQueueIdsRef.current.delete(item.queueId);
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
    }, 30 * 1000);

    const pollNextVideo = async () => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;

      try {
        const res = await fetch('/api/live/next');
        if (!isMounted) return;

        const data = await res.json();

        if (data.status === 'play' && data.videoUrl) {
          insertLivePlaybackNext({
            queueId: data.queueId,
            reservationId: data.reservationId,
            videoUrl: data.videoUrl,
            liveAudioUrl: data.liveAudioUrl || getLiveAudioTrack(data.queueId || data.reservationId || data.videoUrl),
            customerName: data.customerName || null,
            customerLocality: data.customerLocality || null,
            playbackMode: data.playbackMode || 'embedded',
            durationSeconds: data.durationSeconds || null,
            playbackRate: data.playbackRate || 1,
            hasEmbeddedAudio: data.hasEmbeddedAudio !== false,
            source: 'live',
          });
        }
      } catch (err) {
        console.warn('TV polling network error, retrying:', err);
      } finally {
        pollInFlightRef.current = false;
        if (isMounted) {
          timeoutRef.current = setTimeout(pollNextVideo, 2000);
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

      fetch('/api/tv/playing', {
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
      setPlaybackError('Autoplay blocked. Press play to start video.');
    }
  };

  useEffect(() => {
    if (!isPlayingVideo || !currentPlayback) return;
    const timeout = window.setTimeout(() => {
      void startVideoPlayback();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [isPlayingVideo, currentPlayback, activeSlot]);

  useEffect(() => {
    if (!currentPlayback) return;

    const timeout = window.setTimeout(preloadNextPlaylistItem, 500);
    return () => window.clearTimeout(timeout);
  }, [currentPlayback, activeSlot]);

  // Continuous freeze watchdog: if video is active but currentTime does not advance for >5s, auto-advance
  useEffect(() => {
    if (!isPlayingVideo || !currentPlayback) return;
    const interval = window.setInterval(() => {
      const activeVideo = getVideoRef(activeSlotRef.current);
      if (!activeVideo || activeVideo.paused || activeVideo.ended || loopInProgressRef.current) return;
      if (Date.now() - lastProgressAtRef.current > 5000) {
        console.warn('Continuous stall watchdog triggered: video position frozen for >5s, auto-advancing.');
        loopInProgressRef.current = true;
        handleVideoEnded();
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

  const activatePendingSlot = (slot: Slot) => {
    if (slot !== pendingSlotRef.current) return;
    const playback = slotItemsRef.current[slot];
    const video = getVideoRef(slot);
    if (!playback || !video || video.readyState < 2) return;

    clearPendingWatchdog();
    const index = playlistRef.current.findIndex((item) => item.queueId === playback.queueId);
    if (index >= 0) playlistIndexRef.current = index;

    resetExternalAudio();
    loopInProgressRef.current = false;
    setCurrentPlayback(playback);
    setActiveSlot(slot);
    setPendingSlot(null);
    pendingSlotRef.current = null;
    preloadedSlotRef.current = null;
    preloadedQueueIdRef.current = null;
    setIsPlayingVideo(true);
  };

  useEffect(() => {
    if (!pendingSlot) return;

    const tryActivate = () => {
      activatePendingSlot(pendingSlot);
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
    if (!playlist.length) return;

    if (!currentPlaybackRef.current) {
      const index = playlistIndexRef.current % playlist.length;
      playlistIndexRef.current = index;
      preparePlayback(playlist[index]);
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

    const nextIndex = (playlistIndexRef.current + 1) % playlist.length;
    const nextPlayback = playlist[nextIndex];
    const preloadedSlot = preloadedSlotRef.current;

    if (
      preloadedSlot &&
      preloadedQueueIdRef.current === nextPlayback.queueId &&
      slotItemsRef.current[preloadedSlot]?.queueId === nextPlayback.queueId
    ) {
      pendingSlotRef.current = preloadedSlot;
      setPendingSlot(preloadedSlot);
      activatePendingSlot(preloadedSlot);
      return;
    }

    preparePlayback(nextPlayback);
  }

  const handleVideoEnded = () => {
    const playback = currentPlaybackRef.current;
    if (!playback) return;
    clearPlaybackWatchdog();
    clearStallRecoveryTimer();
    resetExternalAudio();

    if (playback.source !== 'replay') {
      playback.source = 'replay';
      removePlaybackFromPlaylist(playback.queueId);
      void notifyPlaybackComplete(playback).finally(() => loadReplayLibrary());
    }

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
      console.warn('Playback stalled for >3.5s, advancing to next item.');
      loopInProgressRef.current = true;
      handleVideoEnded();
    }, 3500);
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

    // Dynamic duration end guard: if within 0.22s of the video end, proactively advance smoothly
    const dur = video.duration;
    if (Number.isFinite(dur) && dur > 1 && video.currentTime >= (dur - 0.22)) {
      if (!loopInProgressRef.current) {
        loopInProgressRef.current = true;
        handleVideoEnded();
        return;
      }
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
      if (playback.source !== 'replay') {
        await fetch('/api/live/fail', {
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
      badQueueIdsRef.current.add(playback.queueId);
      removePlaybackFromPlaylist(playback.queueId);
      resetActivePlaybackState();
      window.setTimeout(queueNextPlaylistItem, 80);
    }
  };

  const renderVideoSlot = (slot: Slot) => {
    const playback = slotItems[slot];
    const isActive = activeSlot === slot && playback;
    const isPending = pendingSlot === slot && playback;

    return (
      <video
        key={`${slot}-${playback?.queueId || 'empty'}`}
        ref={slot === 'a' ? videoARef : videoBRef}
        src={playback?.videoUrl || undefined}
        playsInline
        preload="auto"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          if (playback) configureVideo(video, playback);
        }}
        onCanPlay={() => {
          if (isPending) activatePendingSlot(slot);
        }}
        onLoadedData={() => {
          if (isPending) activatePendingSlot(slot);
        }}
        onCanPlayThrough={() => {
          if (isPending) activatePendingSlot(slot);
        }}
        onPlaying={(event) => startLiveAudioWithVisibleVideo(slot, event.currentTarget)}
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
            handleVideoEnded();
          }
        }}
        onError={() => handleVideoError(slot)}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
          isActive ? 'opacity-100' : 'opacity-0'
        }`}
      />
    );
  };

  if (!audioUnlocked) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#2B0506] p-6 text-center select-none font-sans">
        <div className="max-w-xl w-full rounded-lg border border-[#F6D36A]/45 bg-[#170202]/92 p-10 shadow-2xl space-y-6">
          <img
            src="/maharaja-logo.png"
            alt="Majestic Maharaja"
            className="mx-auto h-32 w-32 rounded-lg object-cover border border-[#F6D36A]/35"
          />
          <div>
            <h1 className="font-serif text-3xl font-bold tracking-widest text-[#F8E8A8] uppercase">
              Majestic Maharaja TV
            </h1>
            <p className="mt-2 text-xs font-bold uppercase tracking-[0.24em] text-[#F6D36A]/80">
              Diwali Celebration Screen
            </p>
          </div>
          <p className="text-sm leading-7 text-[#F8E8A8]/75">
            Tap once to start the 55-inch showroom player, enable festival background music, and receive live AI ads.
          </p>
          <button
            onClick={() => {
              setAudioUnlocked(true);
            }}
            className="w-full rounded-lg bg-[#F6D36A] px-8 py-4 text-base font-black uppercase tracking-wider text-[#3B0507] shadow-2xl transition hover:brightness-110 flex items-center justify-center gap-3"
          >
            <Volume2 className="h-6 w-6" /> Start Maharaja Screen
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 flex h-screen w-screen items-center justify-center overflow-hidden bg-black select-none">
      <audio ref={audioRef} preload="auto" />
      <div className="relative aspect-video h-full max-h-[56.25vw] w-full max-w-[177.78vh] overflow-hidden bg-[#4A0707] text-[#F8E8A8]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_20%,rgba(246,211,106,0.15),transparent_26%),radial-gradient(circle_at_82%_72%,rgba(255,241,168,0.12),transparent_30%),linear-gradient(135deg,#320405_0%,#5D0B09_42%,#210202_100%)]" />
        <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(0deg,rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:9px_9px]" />

        <div className="relative z-10 grid h-full grid-cols-[1fr_0.86fr_1fr] items-center gap-6 px-14 py-10">
          <section className="flex h-full flex-col items-center justify-center gap-5">
            <img
              src="/maharaja-logo.png"
              alt="Majestic Maharaja"
              className="w-[82%] max-w-[330px] rounded-lg border border-[#F6D36A]/45 object-cover shadow-[0_24px_80px_rgba(0,0,0,0.42)]"
            />
            <div className="text-center">
              <p className="font-serif text-4xl font-black uppercase tracking-[0.16em] text-[#FFF1A8]">
                AI Diwali
              </p>
              <p className="mt-2 text-sm font-bold uppercase tracking-[0.24em] text-[#F6D36A]/85">
                Fashion Film
              </p>
            </div>
          </section>

          <section className="flex h-full items-center justify-center">
            <div className="relative h-[92%] aspect-[9/16] overflow-hidden rounded-lg border-[3px] border-[#F6D36A] bg-black shadow-[0_0_58px_rgba(246,211,106,0.22),0_22px_70px_rgba(0,0,0,0.52)]">
              {renderVideoSlot('a')}
              {renderVideoSlot('b')}

              {!currentPlayback && (
                <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center bg-[#120203] p-7 text-center">
                  <Sparkles className="mb-5 h-14 w-14 text-[#F6D36A] animate-pulse" />
                  <p className="font-serif text-3xl font-black leading-tight text-[#FFF1A8]">
                    {!replayLibraryLoaded
                      ? 'Loading showroom videos'
                      : pendingSlot
                        ? 'Loading next showroom video'
                        : 'No showroom video ready'}
                  </p>
                  <p className="mt-4 text-xs font-bold uppercase tracking-[0.22em] text-[#F6D36A]/70">
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

          <section className="flex h-full flex-col justify-center">
            <div className="border-l border-[#F6D36A]/35 pl-8">
              <h1
                className="text-[clamp(2.45rem,4.25vw,4.9rem)] font-black leading-[1.06] text-[#FFF1A8] [text-shadow:0_5px_22px_rgba(0,0,0,0.55)]"
                style={{ fontFamily: "'Noto Serif Tamil', 'Noto Sans Tamil', Latha, 'Tamil Sangam MN', serif" }}
              >
                இனிய
                <br />
                {currentPlayback?.eventId === 'pongal'
                  ? 'பொங்கல்'
                  : currentPlayback?.eventId === 'new-year'
                  ? 'புத்தாண்டு'
                  : currentPlayback?.eventId === 'christmas'
                  ? 'கிறிஸ்துமஸ்'
                  : currentPlayback?.eventId === 'ramadan'
                  ? 'ரமலான்'
                  : currentPlayback?.eventId === 'birthday'
                  ? 'பிறந்தநாள்'
                  : 'தீபாவளி'}
                <br />
                நல்வாழ்த்துக்கள்
              </h1>

              <div className="mt-7 h-px w-4/5 bg-gradient-to-r from-[#F6D36A] to-transparent" />

              <p
                className="mt-7 text-[clamp(1.55rem,2.35vw,2.7rem)] font-black leading-tight text-white"
                style={{ fontFamily: "'Noto Serif Tamil', 'Noto Sans Tamil', Latha, 'Tamil Sangam MN', serif" }}
              >
                {displayCustomerName(currentPlayback)}
              </p>
              <p
                className="mt-3 text-[clamp(1.15rem,1.75vw,2rem)] font-bold text-[#F6D36A]"
                style={{ fontFamily: "'Noto Serif Tamil', 'Noto Sans Tamil', Latha, 'Tamil Sangam MN', serif" }}
              >
                {displayCustomerLocality(currentPlayback)}
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
