'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Activity,
  Camera,
  CheckCircle2,
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
  category?: string;
  garmentType?: string;
  primaryColor?: string;
  fabricAppearance?: string;
  embroideryDescription?: string;
  operatorMessage?: string;
};

type PersonAnalysis = {
  subjectGroup?: 'adult' | 'child';
  fullBodyVisible?: boolean;
  faceVisible?: boolean;
  lightingQuality?: string;
  operatorMessage?: string;
};

type VideoPhase = 'idle' | 'starting' | 'rendering' | 'saving' | 'ready' | 'failed';
type CreateMode = 'proof' | 'test';
type MasterTemplateId = 'men' | 'women' | 'boy' | 'girl';

const masterTemplates: Record<
  MasterTemplateId,
  {
    title: string;
    label: string;
    masterPrompt: string;
    videoPrompt: string;
  }
> = {
  men: {
    title: 'Men Template',
    label: 'Crackers runway',
    masterPrompt: `Use the same Maharaja Diwali menswear scene for image and video: a royal festive fashion-store walkway with warm gold lighting, tasteful distant crackers/fireworks, diyas, brass lamps, marigold decor, subtle rangoli floor detail and cinematic premium retail styling. Keep the mood elegant, confident, family-friendly and masculine without changing the customer, body, face or garment. Keep the focus on the full outfit and festive retail look, not on individual body parts.`,
    videoPrompt: `Use the same Maharaja Diwali menswear scene as the master image: a royal festive fashion-store walkway with warm gold lighting, tasteful distant crackers/fireworks, diyas, brass lamps, marigold decor, subtle rangoli floor detail and cinematic premium retail styling. Selected style is MEN only. The default action is walk + stand + smile: walk slowly forward for the first 3 seconds, stop naturally, stand still, look toward the camera, and smile for the final 3 seconds. Keep the framing modest, respectful and outfit-focused. Do not emphasize legs, hips, chest, waist or any isolated body part. Do not borrow any women's clothing, pose, jewellery, saree, lehenga, dupatta or bridal styling.`,
  },
  women: {
    title: 'Women Template',
    label: 'Diyas palace',
    masterPrompt: `Use the same Maharaja Diwali womenswear scene for image and video: an elegant palace-inspired festive fashion-store interior with glowing diyas, brass lamps, marigold flowers, soft rangoli, warm golden lighting, gentle festive bokeh and graceful cinematic premium retail styling. Keep the mood elegant, beautiful, family-friendly and celebratory without changing the customer, body, face or garment. Keep the focus on the full outfit, fabric, festive styling and graceful presence, not on individual body parts.`,
    videoPrompt: `Use the same Maharaja Diwali womenswear scene as the master image: an elegant palace-inspired festive fashion-store interior with glowing diyas, brass lamps, marigold flowers, soft rangoli, warm golden lighting, gentle festive bokeh and graceful cinematic premium retail styling. Selected style is WOMEN only. The default action is walk + stand + smile: walk slowly forward for the first 3 seconds, stop naturally, stand still, look toward the camera, and smile warmly for the final 3 seconds. Keep the framing modest, respectful, culturally appropriate for a Thanjavur family fashion store, and outfit-focused. Do not emphasize legs, hips, chest, waist or any isolated body part. Do not use glamour, seductive or body-focused posing. Do not borrow any men's shirt, trouser, suiting, moustache, beard or menswear styling.`,
  },
  boy: {
    title: 'Boy Template',
    label: 'Family diya',
    masterPrompt: `Use the same wholesome Maharaja Diwali boyswear family-store scene for image and video: diyas, brass lamps, marigold flowers, soft rangoli, gentle golden festive lights, safe distant festive sparkle and joyful family celebration mood. Keep the mood child-safe, modest, respectful, family-friendly and outfit-focused without changing the child, body, face, age appearance or garment. Keep the focus on the full outfit and festive family retail look, not on individual body parts.`,
    videoPrompt: `Use the same wholesome Maharaja Diwali boyswear family-store scene as the master image: diyas, brass lamps, marigold flowers, soft rangoli, gentle golden festive lights, safe distant festive sparkle and joyful family celebration mood. Selected style is BOY only. The default action is walk + stand + smile: the boy safely holds a small glowing clay diya in both hands, walks slowly forward for the first 3 seconds, stops naturally, stands still, looks toward the camera, and smiles for the final 3 seconds. Camera slowly moves closer. Keep the framing child-safe, modest, respectful, family-friendly and outfit-focused. No adult styling. No glamour. No body-part focus.`,
  },
  girl: {
    title: 'Girl Template',
    label: 'Family diya',
    masterPrompt: `Use the same wholesome Maharaja Diwali girlswear family-store scene for image and video: glowing diyas, brass lamps, marigold flowers, soft rangoli, gentle golden festive lights and joyful family celebration mood. Keep the mood child-safe, modest, respectful, family-friendly and outfit-focused without changing the child, body, face, age appearance or garment. Keep the focus on the full outfit and festive family retail look, not on individual body parts.`,
    videoPrompt: `Use the same wholesome Maharaja Diwali girlswear family-store scene as the master image: glowing diyas, brass lamps, marigold flowers, soft rangoli, gentle golden festive lights and joyful family celebration mood. Selected style is GIRL only. The default action is walk + stand + smile: the girl safely holds a small glowing clay diya in both hands, walks slowly forward for the first 3 seconds, stops naturally, stands still, looks toward the camera, and smiles for the final 3 seconds. Camera slowly moves closer. Keep the framing child-safe, modest, respectful, family-friendly and outfit-focused. No adult styling. No glamour. No seductive pose. No body-part focus.`,
  },
};

function deriveMasterTemplateId(
  analysis: GarmentAnalysis | null,
  personAnalysis?: PersonAnalysis | null
): MasterTemplateId {
  const text = [
    analysis?.category,
    analysis?.garmentType,
    analysis?.operatorMessage,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const isFeminine = /(women|woman|female|girl|girls|saree|sari|lehenga|kurti|salwar|dupatta|gown|bridal|blouse|churidar|frock|pavadai|pattu pavadai)/i.test(text);
  const isChild = personAnalysis?.subjectGroup === 'child' || /(kid|kids|child|children|boy|boys|girl|girls)/i.test(text);

  if (isChild) {
    return isFeminine ? 'girl' : 'boy';
  }

  if (isFeminine) {
    return 'women';
  }

  return 'men';
}

async function parseJsonResponse(res: Response) {
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    let message = '';
    if (res.status === 413) {
      message = 'Uploaded photos are too large for the server request. Retake/crop the photos or upload smaller images.';
    } else if (contentType.includes('application/json')) {
      const payload = await res.json();
      message = payload.error || payload.message || '';
    } else {
      message = await res.text();
    }
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
const aiPhotoMaxDimension = 1152;
const aiPhotoQuality = 0.72;

const progressCopy: Record<VideoPhase, string> = {
  idle: 'Ready to generate after approval.',
  starting: 'Preparing cinematic prompt and sending to Veo Fast...',
  rendering: 'Rendering 6-second Maharaja Diwali film...',
  saving: 'Saving private MP4 to Firebase Storage...',
  ready: 'Video is ready.',
  failed: 'Video generation failed. Stop and review before retrying.',
};

const productTabs = [
  {
    title: 'Try On',
    subtitle: 'Image to image',
    status: 'Coming soon',
  },
  {
    title: 'Diwali Greeting',
    subtitle: 'AI image + 6-sec video',
    status: 'Active now',
  },
  {
    title: 'Be The Hero',
    subtitle: 'Brand film moment',
    status: 'Coming soon',
  },
  {
    title: 'Function Try On',
    subtitle: 'Wedding and event looks',
    status: 'Coming soon',
  },
];

const maharajaStats = [
  { label: 'Total creates', value: '142', detail: 'Maharaja workspace' },
  { label: 'Diwali greetings', value: '38', detail: 'Active campaign' },
  { label: 'Downloads', value: '31', detail: 'Customer keepsake' },
  { label: 'Go Live plays', value: '17', detail: 'TV display queue' },
];

const recentLogs = [
  { time: 'Today', category: 'Diwali Greeting', action: 'AI image + video test ready' },
  { time: 'Yesterday', category: 'Try On', action: 'Image-to-image module planned' },
  { time: 'Pilot', category: 'TV Queue', action: 'Maharaja main display connected' },
];

export default function CreatePage() {
  const router = useRouter();
  const [sessionId] = useState(() => `mah_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  const [mode, setMode] = useState<CreateMode>('test');

  const [garmentPhotos, setGarmentPhotos] = useState<(string | null)[]>([null, null, null]);
  const [personPhoto, setPersonPhoto] = useState<string | null>(null);
  const [garmentAnalysis, setGarmentAnalysis] = useState<GarmentAnalysis | null>(null);
  const [personAnalysis, setPersonAnalysis] = useState<PersonAnalysis | null>(null);

  const [isAnalyzingGarment, setIsAnalyzingGarment] = useState(false);
  const [isAnalyzingPerson, setIsAnalyzingPerson] = useState(false);
  const [isGeneratingMaster, setIsGeneratingMaster] = useState(false);
  const [masterGenerationMessage, setMasterGenerationMessage] = useState<string | null>(null);
  const [masterImageUrl, setMasterImageUrl] = useState<string | null>(null);
  const [masterApproved, setMasterApproved] = useState(false);

  const [videoPhase, setVideoPhase] = useState<VideoPhase>('idle');
  const [videoProgress, setVideoProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploadingManualMaster, setIsUploadingManualMaster] = useState(false);
  const [isUploadingManualVideo, setIsUploadingManualVideo] = useState(false);
  const [manualUploadProgress, setManualUploadProgress] = useState(0);

  const activeGarmentPhotos = useMemo(() => garmentPhotos.filter(Boolean) as string[], [garmentPhotos]);
  const hasRequiredPhotos = activeGarmentPhotos.length >= 1 && !!personPhoto;
  const canGenerateMaster = mode === 'test' && hasRequiredPhotos && !isAnalyzingGarment && !isAnalyzingPerson;
  const canGenerateVideo = !!masterImageUrl && masterApproved && videoPhase === 'idle';
  const masterTemplateId = useMemo(
    () => deriveMasterTemplateId(garmentAnalysis, personAnalysis),
    [garmentAnalysis, personAnalysis]
  );
  const selectedMasterTemplate = masterTemplates[masterTemplateId];

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

  const videoPrompt = useMemo(() => {
    return `Create exactly a 6-second vertical 9:16 silent Diwali fashion video. The final video duration must be 6 seconds only. Do not create 7, 8, 9, 10 seconds, or longer.

Use the approved AI master image as the only person, face, body, outfit and background mood source.

LOCKED SOURCE RULE:
The final person, face, hairstyle, skin tone, body shape, outfit, garment colors, fabric pattern, pants/saree/dress and styling must come from the approved master image. Do not change gender styling. Do not borrow clothing, face or body from any other style.

INTERNAL CAMPAIGN STYLE:
${selectedMasterTemplate.videoPrompt}

ACTION:
The default action must be walk + stand + smile. The person walks slowly forward for the first 3 seconds, stops naturally, stands still, looks toward the camera, and smiles for the final 3 seconds. Camera slowly moves closer. Avoid fast movement, dancing, spinning or big pose changes.

FRAMING:
Keep full-body or near full-body framing for most of the video so the outfit remains visible. Keep the face clear and stable. Keep it modest, respectful, family-friendly and suitable for a Thanjavur fashion store. Do not emphasize legs, hips, chest, waist or any isolated body part.

AUDIO:
Silent video only. Do not create any voice, speech, dialogue, music, voice-over, spoken words, Malayalam, Hindi, English, Tamil speech, lip-sync or mouth speaking. The person must not speak. Keep the mouth naturally closed or softly smiling.

TEXT:
Do not render any text inside the AI video. Do not create Tamil text, English text, random text, banners, logos or captions. The app will overlay the Tamil greeting separately after video generation.

QUALITY:
Make it realistic, premium, polished and suitable for a fashion retail store screen. Avoid changing the person into a different model, avoid face morphing, avoid changing dress color or pattern, avoid wrong text, avoid random logos.`;
  }, [selectedMasterTemplate]);

  async function analyzeGarments(nextPhotos: (string | null)[]) {
    const images = nextPhotos.filter(Boolean) as string[];
    if (!images.length) return;

    if (mode === 'proof') {
      setGarmentAnalysis({
        garmentType: 'Proof garment',
        primaryColor: 'Manual proof',
        operatorMessage: 'Proof Mode: garment photos are loaded locally. No AI analysis credit used.',
      });
      return;
    }

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

  function resetGeneratedOutputs() {
    setMasterImageUrl(null);
    setMasterApproved(false);
    setMasterGenerationMessage(null);
    setVideoPhase('idle');
    setVideoProgress(0);
    setJobId(null);
    setManualUploadProgress(0);
  }

  function selectMode(nextMode: CreateMode) {
    setMode(nextMode);
    setError(null);
    resetGeneratedOutputs();
  }

  async function handleGarmentUpload(e: React.ChangeEvent<HTMLInputElement>, slotIndex: number) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { dataUrl } = await compressImage(file, aiPhotoMaxDimension, aiPhotoQuality);
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
      const { dataUrl } = await compressImage(file, aiPhotoMaxDimension, aiPhotoQuality);
      setPersonPhoto(dataUrl);
      resetGeneratedOutputs();

      if (mode === 'proof') {
        setPersonAnalysis({
          fullBodyVisible: true,
          faceVisible: true,
          lightingQuality: 'proof mode',
          operatorMessage: 'Proof Mode: customer photo is loaded locally. No AI analysis credit used.',
        });
        return;
      }

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
    setMasterGenerationMessage('Sending compressed photos to Gemini image generation...');

    try {
      const resolvedTemplateId = deriveMasterTemplateId(garmentAnalysis, personAnalysis);
      const resolvedTemplate = masterTemplates[resolvedTemplateId];
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 60000);

      let data;
      try {
        setMasterGenerationMessage('Generating Maharaja AI image. Please wait on this page...');
        const res = await fetch('/api/ai/master-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            sessionId,
            garmentAnalysis,
            personAnalysis,
            personPhoto,
            garmentPhotos: activeGarmentPhotos,
            conceptPrompt: resolvedTemplate.masterPrompt,
            templateId: resolvedTemplateId,
          }),
        });
        data = await parseJsonResponse(res);
      } finally {
        window.clearTimeout(timeout);
      }

      if (!data.success || !data.masterImageUrl) {
        throw new Error(data.error || 'Gemini returned no AI image. Check the image model and billing setup.');
      }
      setMasterGenerationMessage('AI image generated. Review and approve it.');
      setMasterImageUrl(data.masterImageUrl);
    } catch (err) {
      const message = err instanceof Error && err.name === 'AbortError'
        ? 'AI image generation took longer than 60 seconds and was stopped. This usually means the model/API is too slow for the current deployment limit.'
        : err instanceof Error
          ? err.message
          : 'AI image generation failed.';
      setMasterGenerationMessage(`Stopped: ${message}`);
      setError(`AI image generation failed: ${message}`);
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

      if (!signedData.success || !signedData.directUpload || !signedData.uploadUrl) {
        throw new Error('Firebase direct video upload is unavailable.');
      }

      const storagePath = signedData.storagePath || `sessions/${sessionId}/video/final.mp4`;
      await xhrUploadFile(
        signedData.uploadUrl,
        'PUT',
        { 'Content-Type': contentType },
        file,
        setManualUploadProgress
      );

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
          conceptPrompt: videoPrompt,
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
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-[#12070B] p-5 md:p-6 rounded-xl border border-amber-400/35 shadow-sm text-white">
        <div>
          <p className="text-[11px] text-amber-300 font-bold tracking-[0.24em] uppercase">
            focusAI workspace · Maharaja selected
          </p>
          <h1 className="mt-1 text-xl md:text-2xl font-serif font-bold text-[#F3E5AB] tracking-widest uppercase">
            Maharaja Campaign Console
          </h1>
          <p className="mt-1 text-xs text-amber-100/75 font-semibold tracking-widest uppercase">
            Diwali Greeting is active now. Other products are coming soon.
          </p>
        </div>
        <div className="text-xs md:text-sm font-mono font-bold text-[#F3E5AB] bg-black/50 px-4 py-2 rounded-full border border-amber-300/40 shadow-sm">
          SESSION ID: {sessionId}
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {productTabs.map((tab, index) => {
          const active = index === 1;
          return (
            <div
              key={tab.title}
              className={`rounded-xl border p-4 ${
                active
                  ? 'border-[#6e0d1f] bg-[#6e0d1f] text-white shadow-md'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-serif font-bold uppercase tracking-wider">{tab.title}</p>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    active ? 'bg-[#F3E5AB] text-[#6e0d1f]' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {tab.status}
                </span>
              </div>
              <p className={`mt-2 text-xs font-semibold ${active ? 'text-amber-100' : 'text-slate-500'}`}>
                {tab.subtitle}
              </p>
            </div>
          );
        })}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-mono font-bold uppercase">
        {['Upload', 'AI Image', 'Approve', 'Video'].map((step, index) => (
          <div
            key={step}
            className={`p-3 rounded-lg border text-center ${
              index === 0 && hasRequiredPhotos
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
            <label
              className={`w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-[#800A1D] via-amber-600 to-[#800A1D] text-white font-bold uppercase tracking-wider text-xs md:text-sm shadow-md flex items-center justify-center gap-2.5 ${
                !hasRequiredPhotos || isUploadingManualMaster ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:brightness-110'
              }`}
            >
              {isUploadingManualMaster ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5 text-amber-200" />}
              Upload AI Image
              <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleManualMasterUpload} disabled={!hasRequiredPhotos || isUploadingManualMaster} className="hidden" />
            </label>
          ) : (
            <button
              onClick={generateMasterImage}
              disabled={!canGenerateMaster || isGeneratingMaster}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-[#800A1D] via-amber-600 to-[#800A1D] text-white font-bold uppercase tracking-wider text-xs md:text-sm shadow-md flex items-center justify-center gap-2.5 hover:brightness-110 transition disabled:opacity-50"
            >
              {isGeneratingMaster ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5 text-amber-200" />}
              {masterImageUrl ? 'Regenerate AI Image' : 'Generate AI Image'}
            </button>
          )}

          {masterGenerationMessage && (
            <div className={`rounded-xl border p-3 text-xs font-bold ${
              masterGenerationMessage.startsWith('Stopped')
                ? 'border-red-300 bg-red-50 text-red-800'
                : masterGenerationMessage.includes('generated')
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-amber-300 bg-amber-50 text-[#6e0d1f]'
            }`}>
              {masterGenerationMessage}
            </div>
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
                {mode === 'proof' ? 'Upload final MP4 · no Gemini/Veo credit used' : 'Veo Fast 720p · real API test · demo locked to 2 starts'}
              </p>
            </div>
          </div>
          {mode === 'proof' ? (
            <label
              className={`py-4 px-6 rounded-2xl bg-gradient-to-r from-[#D4AF37] via-[#F5E089] to-[#D4AF37] text-black font-bold uppercase tracking-wider text-xs shadow-lg flex items-center justify-center gap-2 ${
                !masterApproved || isUploadingManualVideo ? 'opacity-40 pointer-events-none' : 'cursor-pointer hover:brightness-110'
              }`}
            >
              {isUploadingManualVideo ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload Final Video
              <input type="file" accept="video/mp4,video/webm,video/*" onChange={handleManualVideoUpload} disabled={!masterApproved || isUploadingManualVideo} className="hidden" />
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

        <div className="space-y-2">
          <div className="h-3 bg-white/10 rounded-full overflow-hidden border border-amber-300/20">
            <div
              className="h-full bg-gradient-to-r from-amber-300 to-emerald-400 transition-all duration-500"
              style={{ width: `${mode === 'proof' ? manualUploadProgress : videoProgress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs font-mono text-amber-100">
            <span>{mode === 'proof' ? (isUploadingManualVideo ? 'Uploading final video to Firebase Storage...' : 'Upload final MP4 after approval.') : progressCopy[videoPhase]}</span>
            <span>{mode === 'proof' ? manualUploadProgress : videoProgress}%</span>
          </div>
          {jobId && <p className="text-[11px] text-amber-200/80 font-mono">JOB: {jobId}</p>}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_0.9fr]">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {maharajaStats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">{stat.label}</p>
              <p className="mt-2 font-serif text-3xl font-bold text-[#6e0d1f]">{stat.value}</p>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">{stat.detail}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#6e0d1f]" />
              <p className="text-xs font-bold uppercase tracking-wider text-[#6e0d1f]">Activity Logs</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
              Pilot live
            </span>
          </div>
          <div className="space-y-2">
            {recentLogs.map((log) => (
              <div key={`${log.time}-${log.category}`} className="grid grid-cols-[72px_1fr] gap-3 rounded-lg bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{log.time}</p>
                <div>
                  <p className="text-xs font-bold text-slate-900">{log.category}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{log.action}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
