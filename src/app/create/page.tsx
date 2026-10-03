'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Copy,
  Film,
  Image as ImageIcon,
  RefreshCw,
  Shirt,
  Sparkles,
  Upload,
  User,
} from 'lucide-react';
import { compressImage } from '@/lib/utils/image';

type GarmentAnalysis = {
  garmentType?: string;
  primaryColor?: string;
  embroideryDescription?: string;
  operatorMessage?: string;
};

type PersonAnalysis = {
  fullBodyVisible?: boolean;
  faceVisible?: boolean;
  lightingQuality?: string;
  operatorMessage?: string;
};

type VideoPhase = 'idle' | 'starting' | 'rendering' | 'saving' | 'ready' | 'failed';
type ConceptId = 'royal-entrance' | 'lamp-runway' | 'rangoli-spotlight' | 'storefront-greeting';

async function parseJsonResponse(res: Response) {
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    const message = contentType.includes('application/json')
      ? (await res.json()).error
      : await res.text();
    throw new Error(message || `HTTP ${res.status}`);
  }
  if (!contentType.includes('application/json')) {
    throw new Error(`Expected JSON but received ${contentType}`);
  }
  return await res.json();
}

function xhrUploadFile(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: XMLHttpRequestBodyInit | File | Blob | FormData,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);

    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network failure uploading file.'));
    xhr.send(body);
  });
}

const garmentLabels = ['Front View', 'Detail View', 'Additional View'];

const campaignConcepts: Array<{
  id: ConceptId;
  title: string;
  description: string;
  imageDirection: string;
  videoDirection: string;
}> = [
  {
    id: 'royal-entrance',
    title: 'Royal Entrance',
    description: 'Grand showroom arch, premium model pose, rich Diwali glow.',
    imageDirection:
      'Concept: Royal Entrance. Place the customer at a grand Maharaja showroom entrance with carved arches, brass lamps, marigold garlands and warm gold rim light. For men, add premium safe fireworks sparkle and cracker-light bokeh only in the far background, never near the body or garment. For women, emphasize elegant diya rows, soft lamp glow, floral decor and graceful festive warmth. Pose should be full-body, confident and elegant, like a premium festive fashion campaign.',
    videoDirection:
      'Concept: Royal Entrance Walk. Start with the full-body subject framed under a grand showroom arch, then use a slow premium dolly push-in. For men, use safe distant fireworks sparkle and cracker-light bokeh as background energy only. For women, use soft diya rows, lamp glow and floral festive elegance. Keep posture confident and elegant, with warm lamps and marigold decor moving softly in the background.'
  },
  {
    id: 'lamp-runway',
    title: 'Lamp Runway',
    description: 'Fashion runway feel with brass lamps and cinematic depth.',
    imageDirection:
      'Concept: Lamp Runway. Create a luxury in-store festive runway lined with brass kuthu vilakku lamps and soft diya trails. For men, add subtle golden cracker-spark bokeh behind the runway for energetic festive style. For women, increase soft diya glow, brass lamp symmetry, floral warmth and graceful luxury. The customer stands centered, full-body, with editorial fashion posture and clean product visibility from collar to footwear.',
    videoDirection:
      'Concept: Lamp Runway Film. Use a slow runway-style camera push with brass lamps on both sides, soft diya flicker, shallow festive bokeh and gentle fabric motion. For men, add safe distant cracker-spark bokeh in the background. For women, emphasize soft diya trails, warm lamp reflections and elegant floral glow. Keep the full outfit visible and unchanged.'
  },
  {
    id: 'rangoli-spotlight',
    title: 'Rangoli Spotlight',
    description: 'Top festive floor design, elegant portrait-to-full-body framing.',
    imageDirection:
      'Concept: Rangoli Spotlight. Place the customer on a refined Diwali rangoli floor with warm overhead showroom glow, brass lamps in the corners and rich maroon-gold decor. For men, add crisp festive sparkle and distant cracker-light reflections in the background. For women, make the rangoli, diya circle, brass lamps and soft golden glow more graceful and devotional. The pose should feel refined, graceful and premium, with the garment as the central product.',
    videoDirection:
      'Concept: Rangoli Spotlight Film. Begin with full-body framing over a beautiful rangoli floor, then add a very slow cinematic push-in with glowing diyas around the edges. For men, use subtle far-background cracker sparkle reflections. For women, use stronger diya circle glow and soft floral-lamp movement. Keep the subject calm, premium and product-focused.'
  },
  {
    id: 'storefront-greeting',
    title: 'Storefront Greeting',
    description: 'Premium Diwali greeting card feel for TV and sharing.',
    imageDirection:
      'Concept: Storefront Greeting. Create a luxury Maharaja festive showroom greeting visual with the customer as the product model, elegant maroon-gold decor, lamps and a refined banner area for the Tamil greeting only if text is used. For men, add celebratory cracker-light bokeh and festive sparkle outside the storefront/background only. For women, focus on diya glow, brass lamps, flower garlands and soft graceful festival warmth.',
    videoDirection:
      'Concept: Storefront Greeting Film. Make it feel like a premium 6-second festive TV greeting from a showroom campaign: full-body model pose, soft push-in, warm lamps, maroon-gold decor, and an optional small final greeting card with the exact Tamil text. For men, use safe distant cracker-light sparkle in the background. For women, use elegant diya rows, lamp glow and floral festive warmth.'
  }
];

const progressCopy: Record<VideoPhase, string> = {
  idle: 'Ready to generate after approval.',
  starting: 'Preparing cinematic prompt and sending to Veo Fast...',
  rendering: 'Rendering 6-second Maharaja Diwali film...',
  saving: 'Saving private MP4 to Firebase Storage...',
  ready: 'Video is ready.',
  failed: 'Video generation failed. Stop and review before retrying.',
};

export default function CreatePage() {
  const router = useRouter();
  const [sessionId] = useState(() => `mah_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  const [mode, setMode] = useState<'proof' | 'auto'>('proof');
  const [selectedConceptId, setSelectedConceptId] = useState<ConceptId>('royal-entrance');

  const [garmentPhotos, setGarmentPhotos] = useState<(string | null)[]>([null, null, null]);
  const [personPhoto, setPersonPhoto] = useState<string | null>(null);
  const [garmentAnalysis, setGarmentAnalysis] = useState<GarmentAnalysis | null>(null);
  const [personAnalysis, setPersonAnalysis] = useState<PersonAnalysis | null>(null);

  const [isAnalyzingGarment, setIsAnalyzingGarment] = useState(false);
  const [isAnalyzingPerson, setIsAnalyzingPerson] = useState(false);
  const [isGeneratingMaster, setIsGeneratingMaster] = useState(false);
  const [masterImageUrl, setMasterImageUrl] = useState<string | null>(null);
  const [masterApproved, setMasterApproved] = useState(false);

  const [videoPhase, setVideoPhase] = useState<VideoPhase>('idle');
  const [videoProgress, setVideoProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState<'master' | 'video' | null>(null);
  const [isUploadingManualMaster, setIsUploadingManualMaster] = useState(false);
  const [isUploadingManualVideo, setIsUploadingManualVideo] = useState(false);
  const [manualUploadProgress, setManualUploadProgress] = useState(0);

  const activeGarmentPhotos = useMemo(() => garmentPhotos.filter(Boolean) as string[], [garmentPhotos]);
  const selectedConcept = useMemo(
    () => campaignConcepts.find((concept) => concept.id === selectedConceptId) || campaignConcepts[0],
    [selectedConceptId]
  );
  const canGenerateMaster = activeGarmentPhotos.length >= 1 && !!personPhoto && !isAnalyzingGarment && !isAnalyzingPerson;
  const canGenerateVideo = !!masterImageUrl && masterApproved && videoPhase === 'idle';

  useEffect(() => {
    if (videoPhase !== 'starting' && videoPhase !== 'rendering' && videoPhase !== 'saving') return;

    const timer = window.setInterval(() => {
      setVideoProgress((current) => {
        if (videoPhase === 'starting') return Math.min(current + 3, 20);
        if (videoPhase === 'rendering') return Math.min(current + 2, 85);
        if (videoPhase === 'saving') return Math.min(current + 4, 96);
        return current;
      });
    }, 1800);

    return () => window.clearInterval(timer);
  }, [videoPhase]);

  const masterPrompt = useMemo(() => {
    const garment = garmentAnalysis?.garmentType || 'selected festive outfit';
    const color = garmentAnalysis?.primaryColor || 'the original garment color';
    const embroidery = garmentAnalysis?.embroideryDescription || 'the exact embroidery, motifs, borders and fabric details';

    return `CRITICAL PRODUCT LOCK:
The uploaded garment photos are the product being sold. The model must wear the exact same uploaded product outfit. Do not create a kurta, sherwani, festive costume, jacket, robe, saree, lehenga or any different clothing unless that exact item is visible in the product photos. Diwali styling is allowed only in the background, lights, lamps, flowers, rangoli and showroom mood. The clothes must stay exactly like the product photos.

Create a premium cinematic 9:16 full-body Maharaja Diwali showroom fashion advertisement image.

Use the customer photo only as the identity and body reference. Preserve the same face, facial structure, eyes, nose, smile, jawline, skin tone, hairstyle, age appearance, height impression, body proportions and natural presence. Facial match must be very close to the uploaded customer photo. Ignore and replace the clothes worn in the customer photo.

Use the garment photos as the exact clothing reference and the main sales product. The person must wear the exact uploaded product outfit, not a newly invented festive outfit. Preserve the ${color} ${garment}, ${embroidery}, fabric texture, neckline, sleeves, silhouette, buttons, pockets, cargo pockets, stitching, wrinkles, fit, length and pattern placement.

Do not convert the outfit into a kurta, sherwani, saree, lehenga or any other traditional costume unless that exact garment is present in the uploaded reference photos. If the uploaded garment is a shirt, pants, cargo, casualwear, kidswear or westernwear, keep that exact style.

Make the customer look like a premium fashion model in a luxury retail campaign while still looking like the same real person. Improve only posture, styling, lighting and scene quality; do not alter identity or body shape.

Match the presentation tone naturally to the customer: elegant and confident for men, graceful and refined for women, cheerful and premium for kids. Do not change gender presentation, age appearance or facial identity.

${selectedConcept.imageDirection}

Only the environment, lighting and mood should become grand Diwali-themed: premium Maharaja Thanjavur showroom, warm diya glow, brass lamps, marigold flowers, subtle rangoli, rich maroon and gold decor, luxury festive entrance, soft cinematic bokeh and celebratory retail atmosphere.

Optional text: if a greeting is shown as a small elegant showroom banner or final festive card, use only this exact natural Tamil greeting text: "இனிய தீபாவளி நல்வாழ்த்துக்கள்". Do not add any other text.

Lighting/camera: warm golden key light, soft rim light, gentle diya highlights, realistic skin texture, editorial fashion photography, 50mm lens look, slightly low flattering camera height, elegant straight posture, natural confident smile, full-body vertical framing, sharp garment visibility from collar to footwear.

Strict rules: do not change identity, skin tone, body shape, garment type, garment color, garment design, pattern, fit, bottom wear or footwear. No duplicate people, extra limbs, distorted hands, random text except the exact Tamil greeting above, or fake logos.`;
  }, [garmentAnalysis, selectedConcept]);

  const videoPrompt = useMemo(() => {
    const garment = garmentAnalysis?.garmentType || 'selected outfit';
    const color = garmentAnalysis?.primaryColor || 'original garment color';

    return `CRITICAL PRODUCT LOCK:
The uploaded master image outfit is the product being sold. Keep the exact same outfit for the full video. Do not create a kurta, sherwani, festive costume, jacket, robe, saree, lehenga or any different clothing unless it is already shown in the master image. Diwali styling is allowed only in the background, lights, lamps, flowers, rangoli and showroom mood. The clothes must stay exactly like the master image.

Create a premium cinematic 6-second vertical 9:16 Maharaja Diwali showroom fashion commercial using the uploaded master image as the exact reference.

The uploaded outfit is the sales product and hero of the ad. Preserve the same person identity, face, eyes, nose, smile, jawline, skin tone, hairstyle, age appearance, body proportions, ${color} ${garment}, garment embroidery, fabric texture, motifs, borders, shirt/pant structure, pockets, cargo pockets, stitching, wrinkles, fit, bottom wear, footwear and complete outfit throughout the video.

The outfit must remain exactly as shown in the master image. Do not change it into a kurta, sherwani, saree, lehenga or any other festive costume unless the master image already shows that exact outfit.

Shot: luxury retail Diwali fashion model film. The subject stands gracefully in the same outfit, looking like a premium showroom campaign model while still being the same real person. Use a slow cinematic dolly push-in from full-body head-to-toe framing only, with subtle natural breathing, soft stable smile, gentle fabric motion and elegant hand placement. Do not use close-up face shots. If a diya is used, keep it small and away from the garment so the product remains clearly visible.

Match the presentation tone naturally to the customer: elegant and confident for men, graceful and refined for women, cheerful and premium for kids. Facial match must remain very close for the full video.

${selectedConcept.videoDirection}

Lighting/camera: 35mm cinematic lens look, warm golden key light, soft rim light, diya glow on face and garment, festive background bokeh, rich maroon-gold Diwali color grade, premium Maharaja showroom atmosphere, realistic skin texture, sharp focus on garment details and face.

Optional text: if a greeting appears as a small elegant final card or showroom banner, use only this exact natural Tamil greeting text: "இனிய தீபாவளி நல்வாழ்த்துக்கள்". Do not add any other text.

Do not make the person speak. Do not create lip-sync or mouth movement. Keep the face stable and natural. The Tamil greeting will be added by the Maharaja website/TV overlay, not by the generated video.

Keep full body visible from head to toe for the entire 6 seconds. No close-up, no speaking, no lip-sync, no dancing, spinning, fast walking, face change, skin tone change, body shape change, outfit swap, garment redesign, traditional outfit substitution, duplicate person, extra limbs, malformed hands, random text except the exact Tamil greeting above, or generated logo.`;
  }, [garmentAnalysis, selectedConcept]);

  async function copyPrompt(type: 'master' | 'video', prompt: string) {
    await navigator.clipboard.writeText(prompt);
    setCopiedPrompt(type);
    window.setTimeout(() => setCopiedPrompt(null), 2000);
  }

  async function analyzeGarments(nextPhotos: (string | null)[]) {
    const images = nextPhotos.filter(Boolean) as string[];
    if (!images.length) return;

    setIsAnalyzingGarment(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/analyze-garment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images, sessionId }),
      });
      const data = await parseJsonResponse(res);
      setGarmentAnalysis(data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Garment analysis failed.');
    } finally {
      setIsAnalyzingGarment(false);
    }
  }

  async function handleGarmentUpload(e: React.ChangeEvent<HTMLInputElement>, slotIndex: number) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { dataUrl } = await compressImage(file, 1600, 0.85);
      const nextPhotos = [...garmentPhotos];
      nextPhotos[slotIndex] = dataUrl;
      setGarmentPhotos(nextPhotos);
      setMasterImageUrl(null);
      setMasterApproved(false);
      await analyzeGarments(nextPhotos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Garment upload failed.');
    }
  }

  async function handlePersonUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzingPerson(true);
    setError(null);
    try {
      const { dataUrl } = await compressImage(file, 1600, 0.85);
      setPersonPhoto(dataUrl);
      setMasterImageUrl(null);
      setMasterApproved(false);

      const res = await fetch('/api/ai/analyze-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, sessionId }),
      });
      const data = await parseJsonResponse(res);
      setPersonAnalysis(data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Customer photo analysis failed.');
    } finally {
      setIsAnalyzingPerson(false);
    }
  }

  async function generateMasterImage() {
    if (!canGenerateMaster || !personPhoto) return;

    setIsGeneratingMaster(true);
    setMasterApproved(false);
    setError(null);

    try {
      const res = await fetch('/api/ai/master-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          garmentAnalysis,
          personAnalysis,
          personPhoto,
          garmentPhotos: activeGarmentPhotos,
          conceptPrompt: selectedConcept.imageDirection,
        }),
      });
      const data = await parseJsonResponse(res);
      setMasterImageUrl(data.masterImageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Master image generation failed.');
    } finally {
      setIsGeneratingMaster(false);
    }
  }

  async function handleManualMasterUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingManualMaster(true);
    setError(null);
    try {
      const contentType = file.type || 'image/jpeg';
      const signedRes = await fetch('/api/upload/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, assetType: 'master', contentType }),
      });
      const signedData = await parseJsonResponse(signedRes);
      if (!signedData.success || !signedData.directUpload || !signedData.uploadUrl) {
        throw new Error('Firebase direct master image upload is unavailable.');
      }

      await xhrUploadFile(signedData.uploadUrl, 'PUT', { 'Content-Type': contentType }, file, () => {});
      const { dataUrl } = await compressImage(file, 1600, 0.85);

      const completeRes = await fetch('/api/upload/master-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          storagePath: signedData.storagePath || `sessions/${sessionId}/master/master.jpg`,
          masterImageUrl: dataUrl,
        }),
      });
      const completeData = await parseJsonResponse(completeRes);
      setMasterImageUrl(completeData.masterImageUrl || dataUrl);
      setMasterApproved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Manual master image upload failed.');
    } finally {
      setIsUploadingManualMaster(false);
    }
  }

  async function handleManualVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingManualVideo(true);
    setManualUploadProgress(0);
    setError(null);
    try {
      const contentType = file.type || 'video/mp4';
      const signedRes = await fetch('/api/upload/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, assetType: 'video', contentType }),
      });
      const signedData = await parseJsonResponse(signedRes);
      let storagePath = `sessions/${sessionId}/video/final.mp4`;

      if (signedData.success && signedData.directUpload && signedData.uploadUrl) {
        storagePath = signedData.storagePath || storagePath;
        await xhrUploadFile(
          signedData.uploadUrl,
          'PUT',
          { 'Content-Type': contentType },
          file,
          setManualUploadProgress
        );
      } else {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sessionId', sessionId);
        const fallbackRes = await fetch('/api/upload/video', { method: 'POST', body: formData });
        const fallbackData = await parseJsonResponse(fallbackRes);
        storagePath = fallbackData.storagePath || storagePath;
        setManualUploadProgress(100);
      }

      const completeRes = await fetch('/api/video/manual-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, storagePath }),
      });
      await parseJsonResponse(completeRes);
      router.push(`/result/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Manual video upload failed.');
    } finally {
      setIsUploadingManualVideo(false);
    }
  }

  async function startVideoGeneration() {
    if (!canGenerateVideo || !masterImageUrl) return;

    setVideoPhase('starting');
    setVideoProgress(8);
    setError(null);

    try {
      const startRes = await fetch('/api/video/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          garmentAnalysis,
          masterImageUrl,
          conceptPrompt: selectedConcept.videoDirection,
        }),
      });
      const startData = await parseJsonResponse(startRes);
      setJobId(startData.jobId);
      setVideoPhase('rendering');
      setVideoProgress(25);

      await pollVideoStatus(startData.jobId);
    } catch (err) {
      setVideoPhase('failed');
      setError(err instanceof Error ? err.message : 'Video generation failed to start.');
    }
  }

  async function pollVideoStatus(activeJobId: string) {
    let attempts = 0;

    while (attempts < 90) {
      attempts += 1;
      await new Promise((resolve) => window.setTimeout(resolve, 5000));

      const statusRes = await fetch(`/api/video/status?sessionId=${sessionId}&jobId=${activeJobId}`);
      const statusData = await parseJsonResponse(statusRes);

      if (statusData.status === 'ready' || statusData.status === 'succeeded') {
        setVideoPhase('saving');
        setVideoProgress(95);
        await new Promise((resolve) => window.setTimeout(resolve, 800));
        setVideoPhase('ready');
        setVideoProgress(100);
        router.push(`/result/${sessionId}`);
        return;
      }

      if (statusData.status === 'failed') {
        throw new Error(statusData.error || 'Video generation failed.');
      }
    }

    throw new Error('Video generation is taking longer than expected. Check status before retrying.');
  }

  return (
    <main className="min-h-screen bg-[#FDFCF9] text-slate-900 p-4 sm:p-6 lg:p-10 font-sans max-w-7xl mx-auto pb-24 space-y-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-5 md:p-6 rounded-2xl border border-amber-200/80 shadow-sm">
        <div>
          <h1 className="text-xl md:text-2xl font-serif font-bold text-[#6e0d1f] tracking-widest uppercase">
            MAHARAJA AI STUDIO
          </h1>
          <p className="text-xs text-amber-700 font-semibold tracking-widest uppercase">
            Automated Diwali image and 6-second video creator
          </p>
        </div>
        <div className="text-xs md:text-sm font-mono font-bold text-[#6e0d1f] bg-amber-50 px-4 py-2 rounded-full border border-amber-300 shadow-sm">
          SESSION ID: {sessionId}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-mono font-bold uppercase">
        {['Upload', 'Master Image', 'Approve', '6-sec Video'].map((step, index) => (
          <div
            key={step}
            className={`p-3 rounded-xl border text-center ${
              index === 0 && canGenerateMaster
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : index === 1 && masterImageUrl
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : index === 2 && masterApproved
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : index === 3 && videoPhase !== 'idle'
                      ? 'bg-amber-50 border-amber-300 text-[#6e0d1f]'
                      : 'bg-white border-slate-200 text-slate-500'
            }`}
          >
            {step}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-2xl bg-white border border-amber-200 p-2 shadow-sm">
        <button
          onClick={() => setMode('proof')}
          className={`py-3 rounded-xl text-xs font-bold uppercase tracking-wider ${
            mode === 'proof' ? 'bg-[#6e0d1f] text-white' : 'bg-slate-50 text-slate-600'
          }`}
        >
          Proof Mode: Gemini App Upload
        </button>
        <button
          onClick={() => setMode('auto')}
          className={`py-3 rounded-xl text-xs font-bold uppercase tracking-wider ${
            mode === 'auto' ? 'bg-[#6e0d1f] text-white' : 'bg-slate-50 text-slate-600'
          }`}
        >
          Auto Mode: Paid API Test
        </button>
      </div>

      <section className="rounded-2xl bg-white border border-amber-200 p-5 md:p-6 shadow-sm space-y-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm md:text-base font-serif font-bold text-[#6e0d1f] uppercase tracking-wider">
            Campaign Concept
          </h2>
          <p className="text-xs text-slate-600">
            Pick one look. Face, beauty and product dress stay locked in every concept.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {campaignConcepts.map((concept) => (
            <button
              key={concept.id}
              type="button"
              onClick={() => setSelectedConceptId(concept.id)}
              className={`min-h-28 rounded-xl border p-4 text-left transition ${
                selectedConceptId === concept.id
                  ? 'border-[#6e0d1f] bg-[#6e0d1f] text-white shadow-md'
                  : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-amber-300'
              }`}
            >
              <span className="block text-xs font-bold uppercase tracking-wider">{concept.title}</span>
              <span className={`mt-2 block text-xs leading-relaxed ${selectedConceptId === concept.id ? 'text-amber-50' : 'text-slate-600'}`}>
                {concept.description}
              </span>
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-300 text-red-800 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <section className="space-y-6 p-6 md:p-8 rounded-2xl bg-white border border-slate-200 shadow-md">
          <div className="flex items-center gap-3 border-b border-amber-100 pb-4">
            <Shirt className="w-6 h-6 text-[#6e0d1f]" />
            <h2 className="text-base md:text-lg font-serif font-bold text-[#6e0d1f] uppercase tracking-wider">
              Garment and Customer Photos
            </h2>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-mono font-bold text-amber-800 uppercase">Garment photos, up to 3</p>
            <div className="grid grid-cols-3 gap-3">
              {garmentLabels.map((label, index) => (
                <div key={label} className="space-y-2 p-3 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                  <p className="text-[10px] font-mono text-slate-500 font-bold uppercase truncate">{label}</p>
                  {garmentPhotos[index] ? (
                    <div className="relative aspect-[3/4] w-full rounded-xl overflow-hidden border-2 border-amber-400 bg-black">
                      <img src={garmentPhotos[index]!} alt={label} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="aspect-[3/4] w-full rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center bg-white text-xs text-slate-400 font-mono font-bold">
                      SLOT {index + 1}
                    </div>
                  )}
                  <label className="w-full py-2 px-1 rounded-xl bg-[#6e0d1f] border border-amber-300 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer hover:bg-[#800A1D]">
                    <Camera className="w-3.5 h-3.5 text-amber-300" />
                    Upload
                    <input type="file" accept="image/*" onChange={(e) => handleGarmentUpload(e, index)} className="hidden" />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-mono font-bold text-amber-800 uppercase flex items-center gap-1.5">
              <User className="w-4 h-4 text-[#6e0d1f]" /> Customer person photo
            </p>
            <div className="flex gap-5 items-center">
              <div className="w-28 aspect-[3/4] rounded-2xl border-2 border-amber-300 bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                {personPhoto ? (
                  <img src={personPhoto} alt="Customer" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 text-slate-400" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 flex-1">
                <label className="py-3.5 px-3 rounded-xl bg-[#6e0d1f] border border-amber-300 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer hover:bg-[#800A1D]">
                  <Camera className="w-4 h-4 text-amber-300" />
                  Take Photo
                  <input type="file" accept="image/*" capture="user" onChange={handlePersonUpload} className="hidden" />
                </label>
                <label className="py-3.5 px-3 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-200">
                  <ImageIcon className="w-4 h-4 text-slate-600" />
                  Gallery
                  <input type="file" accept="image/*" onChange={handlePersonUpload} className="hidden" />
                </label>
              </div>
            </div>
          </div>

          {(isAnalyzingGarment || isAnalyzingPerson) && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-center text-xs text-[#6e0d1f] font-bold flex items-center justify-center gap-2 animate-pulse font-mono">
              <RefreshCw className="w-4 h-4 animate-spin" /> Analyzing photos...
            </div>
          )}

          {garmentAnalysis && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 font-mono space-y-1">
              <div className="flex items-center justify-between font-bold">
                <span>{garmentAnalysis.garmentType || 'Garment'} · {garmentAnalysis.primaryColor || 'Color detected'}</span>
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <p>{garmentAnalysis.operatorMessage || garmentAnalysis.embroideryDescription}</p>
            </div>
          )}

          {personAnalysis && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 font-mono space-y-1">
              <div className="flex items-center justify-between font-bold">
                <span>Customer photo verified</span>
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <p>{personAnalysis.operatorMessage || `Lighting: ${personAnalysis.lightingQuality || 'checked'}`}</p>
            </div>
          )}
        </section>

        <section className="space-y-6 p-6 md:p-8 rounded-2xl bg-white border border-slate-200 shadow-md">
          <div className="flex items-center gap-3 border-b border-amber-100 pb-4">
            <Sparkles className="w-6 h-6 text-[#6e0d1f]" />
            <h2 className="text-base md:text-lg font-serif font-bold text-[#6e0d1f] uppercase tracking-wider">
              Master Image Approval
            </h2>
          </div>

          {mode === 'proof' ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#6e0d1f]">Master image prompt</h3>
                  <button
                    onClick={() => copyPrompt('master', masterPrompt)}
                    className="px-3 py-2 rounded-lg bg-white border border-amber-300 text-[#6e0d1f] text-[11px] font-bold uppercase flex items-center gap-1"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedPrompt === 'master' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs leading-relaxed text-slate-700 max-h-32 overflow-auto whitespace-pre-line">
                  {masterPrompt}
                </p>
              </div>

              <label className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-[#800A1D] via-amber-600 to-[#800A1D] text-white font-bold uppercase tracking-wider text-xs md:text-sm shadow-md flex items-center justify-center gap-2.5 cursor-pointer hover:brightness-110">
                {isUploadingManualMaster ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5 text-amber-200" />}
                Upload Gemini Master Image
                <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleManualMasterUpload} disabled={isUploadingManualMaster} className="hidden" />
              </label>
            </div>
          ) : (
            <button
              onClick={generateMasterImage}
              disabled={!canGenerateMaster || isGeneratingMaster}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-[#800A1D] via-amber-600 to-[#800A1D] text-white font-bold uppercase tracking-wider text-xs md:text-sm shadow-md flex items-center justify-center gap-2.5 hover:brightness-110 transition disabled:opacity-50"
            >
              {isGeneratingMaster ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5 text-amber-200" />}
              {masterImageUrl ? 'Regenerate Master Image' : 'Generate Diwali Master Image'}
            </button>
          )}

          {masterImageUrl ? (
            <div className="space-y-4">
              <div className="relative aspect-[9/16] w-full max-w-xs mx-auto rounded-2xl overflow-hidden border-2 border-amber-400 shadow-2xl bg-black">
                <img src={masterImageUrl} alt="Generated master reference" className="w-full h-full object-cover" />
                <div className="absolute top-3 right-3 bg-emerald-600 text-white px-3 py-1.5 rounded-full text-[10px] font-mono font-bold">
                  GENERATED
                </div>
              </div>

              <button
                onClick={() => setMasterApproved(true)}
                className={`w-full py-4 rounded-2xl border font-bold uppercase tracking-wider text-xs transition ${
                  masterApproved
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-white border-[#6e0d1f] text-[#6e0d1f] hover:bg-amber-50'
                }`}
              >
                {masterApproved ? 'Master Image Approved' : 'Approve Master Image'}
              </button>
            </div>
          ) : (
            <div className="aspect-[9/16] w-full max-w-xs mx-auto rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center bg-slate-50 text-slate-400 font-mono text-xs">
              <ImageIcon className="w-12 h-12 mb-2 text-slate-300" />
              <span>Generated image preview</span>
            </div>
          )}
        </section>
      </div>

      <section className="p-6 md:p-8 rounded-2xl bg-[#12070B] border border-amber-500/30 shadow-xl text-white space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Film className="w-7 h-7 text-amber-300" />
            <div>
              <h2 className="font-serif font-bold uppercase tracking-wider text-lg text-[#F3E5AB]">6-Second Video Generation</h2>
              <p className="text-xs text-amber-100/80">
                {mode === 'proof' ? 'Manual Gemini mobile MP4 upload · no AI API spend' : 'Veo Fast 720p · demo locked to 2 starts · no Standard mode'}
              </p>
            </div>
          </div>
          {mode === 'proof' ? (
            <label className={`py-4 px-6 rounded-2xl bg-gradient-to-r from-[#D4AF37] via-[#F5E089] to-[#D4AF37] text-black font-bold uppercase tracking-wider text-xs shadow-lg flex items-center justify-center gap-2 ${!masterImageUrl ? 'opacity-40 pointer-events-none' : 'cursor-pointer'}`}>
              {isUploadingManualVideo ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload Gemini MP4
              <input type="file" accept="video/mp4,video/*" onChange={handleManualVideoUpload} disabled={!masterImageUrl || isUploadingManualVideo} className="hidden" />
            </label>
          ) : (
            <button
              onClick={startVideoGeneration}
              disabled={!canGenerateVideo}
              className="py-4 px-6 rounded-2xl bg-gradient-to-r from-[#D4AF37] via-[#F5E089] to-[#D4AF37] text-black font-bold uppercase tracking-wider text-xs shadow-lg flex items-center justify-center gap-2 disabled:opacity-40"
            >
              Generate 6-sec Video <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {mode === 'proof' && (
          <div className="rounded-2xl bg-white/5 border border-amber-300/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#F3E5AB]">Video prompt for Gemini app</h3>
              <button
                onClick={() => copyPrompt('video', videoPrompt)}
                className="px-3 py-2 rounded-lg bg-white/10 border border-amber-300/30 text-amber-100 text-[11px] font-bold uppercase flex items-center gap-1"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedPrompt === 'video' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs leading-relaxed text-amber-50/90 max-h-32 overflow-auto whitespace-pre-line">
              {videoPrompt}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <div className="h-3 bg-white/10 rounded-full overflow-hidden border border-amber-300/20">
            <div
              className="h-full bg-gradient-to-r from-amber-300 to-emerald-400 transition-all duration-500"
              style={{ width: `${mode === 'proof' ? manualUploadProgress : videoProgress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs font-mono text-amber-100">
            <span>{mode === 'proof' ? (isUploadingManualVideo ? 'Uploading manual MP4 to Firebase Storage...' : 'Upload Gemini MP4 after master image is ready.') : progressCopy[videoPhase]}</span>
            <span>{mode === 'proof' ? manualUploadProgress : videoProgress}%</span>
          </div>
          {jobId && <p className="text-[11px] text-amber-200/80 font-mono">JOB: {jobId}</p>}
        </div>
      </section>
    </main>
  );
}
