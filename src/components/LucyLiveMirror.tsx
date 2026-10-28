'use client';

import { fal } from '@fal-ai/client';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, LoaderCircle, Play, RotateCcw, ScanFace, Square } from 'lucide-react';

const LUCY_VTON_APP = 'decart/lucy2-vton/realtime';
type Signal = { type?: string; sdp?: string; candidate?: RTCIceCandidateInit; iceServers?: RTCIceServer[] };
type RealtimeConnection = { send(input: Record<string, unknown>): void; close(): void };

export default function LucyLiveMirror({ referenceImageUrl, garmentName, onComplete }: { referenceImageUrl: string; garmentName: string; onComplete: () => void }) {
  const inputVideo = useRef<HTMLVideoElement>(null);
  const outputVideo = useRef<HTMLVideoElement>(null);
  const localStream = useRef<MediaStream | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const connection = useRef<RealtimeConnection | null>(null);
  const [status, setStatus] = useState<'idle' | 'starting' | 'live' | 'error'>('idle');
  const [seconds, setSeconds] = useState(30);

  async function openCameraPreview() {
    if (localStream.current || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      localStream.current = stream;
      if (inputVideo.current) { inputVideo.current.srcObject = stream; await inputVideo.current.play(); }
      setMessage('Camera preview is ready. Start when the customer is in frame.');
    } catch {
      setStatus('error');
      setMessage('Camera permission is needed for Live AI Mirror. Allow camera access and try again.');
    }
  }
  const [message, setMessage] = useState('Ready when the customer is in frame.');

  function stop(completed = false) {
    connection.current?.close();
    connection.current = null;
    peer.current?.close();
    peer.current = null;
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    if (inputVideo.current) inputVideo.current.srcObject = null;
    if (outputVideo.current) outputVideo.current.srcObject = null;
    if (completed) onComplete();
    setStatus('idle');
  }

  async function ensurePeer(iceServers?: RTCIceServer[]) {
    if (peer.current) return peer.current;
    const pc = new RTCPeerConnection(iceServers?.length ? { iceServers } : undefined);
    const stream = localStream.current;
    stream?.getTracks().forEach((track) => pc.addTrack(track, stream));
    pc.ontrack = (event) => { if (outputVideo.current) outputVideo.current.srcObject = event.streams[0]; };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') { setStatus('live'); setMessage('Live AI Mirror is active. Move naturally.'); } };
    pc.onicecandidate = (event) => {
      if (event.candidate) connection.current?.send({ type: 'candidate', candidate: event.candidate.toJSON() });
    };
    peer.current = pc;
    return pc;
  }

  async function handleSignal(signal: Signal) {
    const pc = await ensurePeer(signal.iceServers);
    if (signal.type === 'offer' && signal.sdp) {
      await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      connection.current?.send({ type: 'answer', sdp: answer.sdp });
    } else if (signal.type === 'candidate' && signal.candidate) {
      await pc.addIceCandidate(signal.candidate);
    }
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) { setStatus('error'); setMessage('This device does not support camera capture.'); return; }
    try {
      setStatus('starting');
      setSeconds(30);
      setMessage('Requesting camera and preparing Live AI Mirror…');
      await openCameraPreview();
      if (!localStream.current) throw new Error('Camera preview is unavailable.');
      const realtime = fal.realtime.connect<Record<string, unknown>, Signal>(LUCY_VTON_APP, {
        clientOnly: true,
        connectionKey: 'tryfocus-lucy-live-mirror',
        tokenExpirationSeconds: 60,
        tokenProvider: async (app) => {
          const response = await fetch('/api/fal/realtime-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app }) });
          if (!response.ok) throw new Error(await response.text());
          return response.text();
        },
        onResult: (result) => { void handleSignal(result); },
        onError: () => { setStatus('error'); setMessage('Live AI Mirror could not connect. The session was not completed.'); },
      });
      connection.current = realtime;
      realtime.send({ prompt: `Replace the customer’s visible outfit with the garment in the reference image: ${garmentName}. Preserve the customer’s identity, body proportions, natural motion, hands, background and lighting. Keep the garment design, texture, border, drape and colours faithful to the reference image.`, reference_image_url: referenceImageUrl });
    } catch {
      stop();
      setStatus('error');
      setMessage('Camera permission or Live AI Mirror could not start. Please check the camera and try again.');
    }
  }

  useEffect(() => { void openCameraPreview(); }, []);
  useEffect(() => {
    if (status !== 'starting' && status !== 'live') return;
    if (seconds <= 0) { stop(true); return; }
    const timer = window.setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [status, seconds]);
  useEffect(() => () => { connection.current?.close(); peer.current?.close(); localStream.current?.getTracks().forEach((track) => track.stop()); }, []);

  return <div className="grid flex-1 items-center gap-8 lg:grid-cols-[1.2fr_.8fr]"><div className="relative aspect-[4/3] overflow-hidden rounded-[2.5rem] border border-[#e6b358]/30 bg-[#07090d]"><video ref={inputVideo} muted playsInline className={`absolute inset-0 h-full w-full object-cover ${status === 'live' ? 'opacity-20' : 'opacity-100'}`} /><video ref={outputVideo} muted playsInline autoPlay className={`absolute inset-0 h-full w-full object-cover ${status === 'live' ? 'opacity-100' : 'opacity-0'}`} />{status === 'idle' && <div className="absolute inset-0 grid place-items-center text-center"><div><ScanFace className="mx-auto h-24 w-24 text-white/35" /><p className="mt-5 text-lg font-black">Stand in the camera frame</p><p className="mt-2 text-sm text-white/55">A 30-second session begins only when staff starts it.</p></div></div>}<span className="absolute left-6 top-6 rounded-full bg-black/50 px-4 py-2 text-xs font-black uppercase tracking-[.15em] text-[#f5d28c]">{status === 'live' ? 'Lucy AI Mirror' : 'Live camera'}</span></div><div className="rounded-[2.5rem] border border-white/10 bg-black/25 p-8"><p className="text-sm font-bold uppercase tracking-[.18em] text-[#e6b358]">Selected look</p><h2 className="mt-3 text-2xl font-black">{garmentName}</h2><div className="mt-4 text-6xl font-black tracking-[-.08em]">00:{String(seconds).padStart(2, '0')}</div><p className="mt-5 text-sm leading-6 text-white/60">Lucy 2.1 VTON transforms the live camera feed. The hard 30-second cutoff controls cost.</p><p className={`mt-5 flex gap-2 text-sm leading-6 ${status === 'error' ? 'text-rose-200' : 'text-white/65'}`}>{status === 'error' && <AlertCircle className="h-4 w-4 shrink-0" />}{status === 'starting' && <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-[#e6b358]" />}{message}</p>{status === 'idle' || status === 'error' ? <button onClick={() => void start()} className="mt-7 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[#e6b358] text-base font-black text-[#2b0910]"><Play className="h-5 w-5 fill-current" />Start 30-second Live Try-On</button> : <button onClick={() => stop(false)} className="mt-7 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl border border-rose-300/50 text-base font-black text-rose-100"><Square className="h-5 w-5 fill-current" />End Live Try-On</button>}<p className="mt-4 text-xs leading-5 text-white/40">Camera video is a live WebRTC stream; the fal key remains server-side.</p></div></div>;
}
