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
    poseTitle: string;
    poseDescription: string;
    masterPrompt: string;
    videoPrompt: string;
  }
> = {
  men: {
    title: 'Men Template',
    label: 'Indoor hero glow',
    poseTitle: 'Indoor Hero Festival Portrait',
    poseDescription: 'Still confident pose, royal indoor Diwali lights, hero-style camera push.',
    masterPrompt: `Create a photorealistic vertical 9:16 full-body Indian festive fashion master image. Use the first uploaded image as the exact customer identity reference. Preserve facial identity, facial features, face shape, skin tone, hairstyle, body proportions, age appearance and likeness. Use remaining garment images as exact clothing reference. Preserve garment primary color, fabric, embroidery, borders, silhouette and design. Dress the customer in the selected garment with neat premium festive closed footwear if feet are visible; no slippers, no casual bathroom sandals. Scene: a royal indoor Diwali fashion-store interior with brass lamps, marigold garlands, warm gold spotlights, diyas, soft temple-style glow, subtle festive bokeh and distant crackers visible through an arch/window. Masculine, confident, modest, premium fashion-model posture with relaxed shoulders, full-body head-to-toe framing. Subject stands still in a natural hero pose facing camera with a soft confident smile. Gentle family-friendly retail styling only; no glamour pose, no tight body contour focus, no hip/waist/chest/leg emphasis, no awkward crop. Keep forehead clean: no vibhuti, kumkum, tilak, bindi, religious symbol, white mark, red mark or decorative forehead mark. Do not add text, captions, signs, letters, logos, banners or greeting words inside the image.`,
    videoPrompt: `Create a premium 6-second vertical 9:16 Diwali fashion hero video from the uploaded image. Use the uploaded image as the exact identity, face, body, outfit, garment color, footwear, background and lighting reference.

The man must look like a premium fashion model, not like a still doll. Keep him grounded and stable, with only a small natural head turn toward the camera, confident eye contact, and a soft heroic smile. No full walking, no dancing, no body spin, no hand waving, no lip-sync.

CapCut-style hero energy: start with a fast cinematic whip reveal from golden Diwali lights, then a rapid crash-zoom/dolly-in toward the subject, with background motion blur, sparks, diya glow and distant crackers. Then slow down into a powerful hero freeze, with a subtle final zoom-out showing the full outfit.

Timing: 0-1s fast festive light reveal, 1-3s crash zoom/dolly-in with background blur, 3-5s subject turns head slightly to camera and smiles, 5-6s slow hero zoom-out full-body frame.

No text, no captions, no greeting words, no logos. No forehead mark of any kind. No vibhuti, kumkum, tilak, bindi, religious symbol, white mark or red mark. Preserve exact face, body and garment.`,
  },
  women: {
    title: 'Women Template',
    label: 'Indoor diya grace',
    poseTitle: 'Indoor Graceful Diya Portrait',
    poseDescription: 'Still modest pose, diya palace mood, heroine-style soft camera move.',
    masterPrompt: `Create a photorealistic vertical 9:16 full-body Indian festive fashion master image. Use the first uploaded image as the exact customer identity reference. Preserve facial identity, facial features, face shape, skin tone, hairstyle, body proportions, age appearance and likeness. Use remaining garment images as exact clothing reference. Preserve garment primary color, fabric, embroidery, motifs, borders, silhouette and design. Dress the customer in the selected garment with neat premium festive footwear if feet are visible; no slippers, no casual bathroom sandals. Scene: an elegant indoor Diwali palace/store setting with glowing diyas, brass lamps, marigold flowers, soft rangoli, warm golden lighting, gentle festive bokeh and graceful cinematic premium retail styling. Modest, respectful, family-friendly, no waist/hip/chest/leg/body-part emphasis, no glamour pose, no tight body contour focus, no awkward crop. Full outfit visible, full-body head-to-toe framing. Subject stands still with graceful fashion-model posture, relaxed shoulders and a soft festival smile. Keep forehead clean: no vibhuti, kumkum, tilak, bindi, religious symbol, white mark, red mark or decorative forehead mark. Do not add text, captions, signs, letters, logos, banners or greeting words inside the image.`,
    videoPrompt: `Create a premium 6-second vertical 9:16 Diwali fashion hero video from the uploaded image. Use the uploaded image as the exact identity, face, body, outfit, garment color, jewelry, footwear, background and lighting reference.

The woman must look like an elegant premium fashion model, not like a still doll. Keep her modest, graceful and stable, with only a small natural head turn toward the camera, soft eye movement, and a warm festival smile. No full walking, no dancing, no body spin, no hip or waist emphasis, no glamour pose, no lip-sync.

CapCut-style heroine energy: start with a fast golden diya-light reveal, rack focus from glowing lamps to the subject, then a smooth dolly-in with soft motion blur in the background. Add gold light sweep, marigold shimmer, diya flicker and premium festive bokeh. End with a slow elegant zoom-out showing the full outfit.

Timing: 0-1s fast diya/rangoli light reveal, 1-3s dolly-in and rack focus to subject, 3-5s gentle head turn to camera with soft smile, 5-6s full-body elegant hero frame.

No text, no captions, no greeting words, no logos. No forehead mark of any kind. No vibhuti, kumkum, tilak, bindi, religious symbol, white mark or red mark. Preserve exact face, body and garment.`,
  },
  boy: {
    title: 'Boy Template',
    label: 'Outdoor lights',
    poseTitle: 'Outdoor Festival Lights Portrait',
    poseDescription: 'Still cheerful pose, courtyard lights, safe festive sparkle.',
    masterPrompt: `Create a photorealistic vertical 9:16 full-body Indian festive fashion master image. Use the first uploaded image as the exact young customer identity reference. Preserve facial identity, facial features, skin tone, hairstyle, body proportions and age appearance. Use remaining garment images as exact clothing reference. Preserve garment primary color, fabric, embroidery and design. Dress the customer in the selected garment with neat festive footwear if feet are visible; no slippers, no casual bathroom sandals. Scene: a wholesome outdoor Diwali courtyard/temple-street setting with lantern strings, marigold decor, safe distant fireworks, warm fairy lights, diyas on the ground, and festive golden evening glow. Modest, child-safe, family-friendly, no body-part emphasis, no adult styling, no awkward crop, full-body head-to-toe framing. Subject stands still in a cheerful natural pose, gently holding a small glowing clay diya with both hands at mid-torso, simple natural fingers. Keep forehead clean: no vibhuti, kumkum, tilak, bindi, religious symbol, white mark, red mark or decorative forehead mark. Do not add text, captions, signs, letters, logos, banners or greeting words inside the image.`,
    videoPrompt: `Create a premium 6-second vertical 9:16 Diwali fashion hero video from the uploaded image. Use the uploaded image as the exact identity, face, age, body, outfit, garment color, footwear, background and lighting reference.

The boy must look cheerful and natural, not like a still doll. Keep him child-safe and stable, with only a small head turn toward the camera, natural eye movement, and a soft happy smile. If a diya is visible, keep it steady. No full walking, no dancing, no body spin, no adult styling, no lip-sync.

CapCut-style festive energy: start with a fast outdoor lantern/cracker reveal, then a quick cinematic dolly-in toward the boy with background light streaks, safe distant fireworks, diya glow and warm festival bokeh. Slow down into a clean hero smile moment, then final zoom-out to show the full outfit.

Timing: 0-1s fast lantern/firework reveal, 1-3s dolly-in with background motion blur, 3-5s boy turns head slightly to camera and smiles, 5-6s full-body festival hero frame.

No text, no captions, no greeting words, no logos. No forehead mark of any kind. No vibhuti, kumkum, tilak, bindi, religious symbol, white mark or red mark. Preserve exact face, body and garment.`,
  },
  girl: {
    title: 'Girl Template',
    label: 'Outdoor courtyard',
    poseTitle: 'Outdoor Diwali Courtyard Portrait',
    poseDescription: 'Still sweet pose, courtyard diyas, princess-like festival glow.',
    masterPrompt: `Create a photorealistic vertical 9:16 full-body Indian festive fashion master image. Use the first uploaded image as the exact young customer identity reference. Preserve facial identity, facial features, skin tone, hairstyle, body proportions and age appearance. Use remaining garment images as exact clothing reference. Preserve garment primary color, fabric, embroidery and design. Dress the customer in the selected garment with neat festive footwear if feet are visible; no slippers, no casual bathroom sandals. Scene: a wholesome outdoor Diwali courtyard/garden/temple-light setting with glowing diyas, lantern strings, marigold flowers, soft rangoli, warm fairy lights and gentle golden festival atmosphere. Modest, child-safe, family-friendly, no waist/hip/chest/leg/body-part emphasis, no glamour pose, no adult styling, no tight body contour focus, no awkward crop, full-body head-to-toe framing. Subject stands still in a simple respectful festive pose, gently holding a small glowing clay diya with both hands at mid-torso, simple natural fingers. Keep forehead clean: no vibhuti, kumkum, tilak, bindi, religious symbol, white mark, red mark or decorative forehead mark. Do not add text, captions, signs, letters, logos, banners or greeting words inside the image.`,
    videoPrompt: `Create a premium 6-second vertical 9:16 Diwali fashion hero video from the uploaded image. Use the uploaded image as the exact identity, face, age, body, outfit, garment color, footwear, background and lighting reference.

The girl must look sweet, natural and festive, not like a still doll. Keep her child-safe, modest and stable, with only a small head turn toward the camera, natural eye movement, and a soft happy smile. If a diya is visible, keep it steady. No full walking, no dancing, no body spin, no adult styling, no hip or waist emphasis, no lip-sync.

CapCut-style festive energy: start with a fast fairy-light and diya reveal, rack focus from glowing lights to the girl, then a smooth dolly-in with warm golden bokeh, marigold shimmer and soft festival sparkles. Slow down into a sweet smile moment, then final zoom-out to show the full outfit.

Timing: 0-1s fast diya/fairy-light reveal, 1-3s dolly-in and rack focus to subject, 3-5s girl turns head slightly to camera and smiles, 5-6s full-body festive hero frame.

No text, no captions, no greeting words, no logos. No forehead mark of any kind. No vibhuti, kumkum, tilak, bindi, religious symbol, white mark or red mark. Preserve exact face, body and garment.`,
  },
};

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

const categoryOptions: Array<{
  id: MasterTemplateId;
  title: string;
  subtitle: string;
}> = [
  { id: 'men', title: 'Men', subtitle: 'Indoor hero Diwali' },
  { id: 'women', title: 'Women', subtitle: 'Indoor diya grace' },
  { id: 'boy', title: 'Boy', subtitle: 'Outdoor lights, below 18' },
  { id: 'girl', title: 'Girl', subtitle: 'Outdoor courtyard, below 18' },
];

const cameraMotionTemplates = [
  {
    title: 'Top Crane Gold Sweep',
    prompt: `Fresh camera template 1: start from a high top-angle view of Diwali lights/rangoli, crane down quickly toward the subject, add a gold light sweep across the frame, then settle into a slow hero zoom-out. Keep the subject stable with only a tiny head turn and soft smile.`,
  },
  {
    title: 'Side Truck Diya Reveal',
    prompt: `Fresh camera template 2: start with a blurred foreground diya or lamp on one side, truck the camera from left to right into a clear front view, rack focus from diya glow to the subject, then end with a full-body hero frame. Keep the subject stable with only a tiny head turn and soft smile.`,
  },
  {
    title: 'Low-Angle Light Surge',
    prompt: `Fresh camera template 3: start from a low premium hero angle, surge forward with background festive light streaks and warm motion blur, then slow into a sharp confident portrait and final zoom-out. Keep the subject stable with only a tiny head turn and soft smile.`,
  },
  {
    title: 'Poster Whip Reveal',
    prompt: `Fresh camera template 4: begin with a fast whip-pan blur of marigold lights and gold particles, reveal the subject like a movie-poster hero shot, add soft sparkles/cracker glow in the background, then finish with a clean slow zoom-out full outfit frame. Keep the subject stable with only a tiny head turn and soft smile.`,
  },
] as const;

function getNextCameraMotionTemplate() {
  const storageKey = 'maharaja-camera-template-index';
  const current = Number(window.localStorage.getItem(storageKey) || '0');
  const index = Number.isFinite(current) ? current % cameraMotionTemplates.length : 0;
  window.localStorage.setItem(storageKey, String(index + 1));
  return cameraMotionTemplates[index];
}

const progressCopy: Record<VideoPhase, string> = {
  idle: 'Ready to generate after approval.',
  starting: 'Preparing cinematic prompt and starting AI video generation...',
  rendering: 'MiniMax is still rendering the final MP4. This can stay near 90% until the provider returns the completed video. Do not retry.',
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
  const [selectedCategory, setSelectedCategory] = useState<MasterTemplateId | null>(null);

  const [garmentPhotos, setGarmentPhotos] = useState<(string | null)[]>([null, null, null]);
  const [personPhoto, setPersonPhoto] = useState<string | null>(null);
  const [garmentAnalysis, setGarmentAnalysis] = useState<GarmentAnalysis | null>(null);
  const [personAnalysis, setPersonAnalysis] = useState<PersonAnalysis | null>(null);

  const [isGeneratingMaster, setIsGeneratingMaster] = useState(false);
  const [masterGenerationMessage, setMasterGenerationMessage] = useState<string | null>(null);
  const [masterImageUrl, setMasterImageUrl] = useState<string | null>(null);
  const [masterApproved, setMasterApproved] = useState(false);

  const [videoPhase, setVideoPhase] = useState<VideoPhase>('idle');
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploadingManualMaster, setIsUploadingManualMaster] = useState(false);

  const activeGarmentPhotos = useMemo(() => garmentPhotos.filter(Boolean) as string[], [garmentPhotos]);
  const hasRequiredPhotos = activeGarmentPhotos.length >= 1 && !!personPhoto;
  const canGenerateMaster = mode === 'test' && hasRequiredPhotos && !!selectedCategory;
  const canUploadManualMaster = mode === 'proof' && !!selectedCategory;
  const canGenerateVideo = !!selectedCategory && !!masterImageUrl && masterApproved && videoPhase === 'idle';
  const selectedMasterTemplate = selectedCategory ? masterTemplates[selectedCategory] : masterTemplates.women;

  useEffect(() => {
    if (videoPhase !== 'starting' && videoPhase !== 'rendering' && videoPhase !== 'saving') return;

    const timer = window.setInterval(() => {
      setVideoProgress((current) => {
        if (videoPhase === 'starting') return Math.min(current + 3, 20);
        if (videoPhase === 'rendering') return Math.min(current + 1, 92);
        if (videoPhase === 'saving') return Math.min(current + 4, 96);
        return current;
      });
    }, 1800);

    return () => window.clearInterval(timer);
  }, [videoPhase]);


  function setLocalGarmentReady(nextPhotos: (string | null)[], category: MasterTemplateId | null = selectedCategory) {
    const images = nextPhotos.filter(Boolean) as string[];
    if (!images.length) return;

    if (!category) {
      setGarmentAnalysis({
        garmentType: 'Photos uploaded',
        primaryColor: 'Select category',
        operatorMessage: 'Select Men, Women, Boy, or Girl to lock the correct prompt before generation.',
      });
      return;
    }

    setGarmentAnalysis({
      category: masterTemplates[category].title,
      garmentType: `${masterTemplates[category].title} selected`,
      primaryColor: 'From uploaded garment photos',
      operatorMessage: `${masterTemplates[category].title} prompt is locked by operator selection. No category-detection API credit used.`,
    });
  }

  function setLocalPersonReady(category: MasterTemplateId | null = selectedCategory) {
    if (!category) {
      setPersonAnalysis({
        fullBodyVisible: true,
        faceVisible: true,
        lightingQuality: 'acceptable',
        operatorMessage: 'Customer photo ready. Select category to lock the correct prompt.',
      });
      return;
    }

    setPersonAnalysis({
      subjectGroup: category === 'boy' || category === 'girl' ? 'child' : 'adult',
      fullBodyVisible: true,
      faceVisible: true,
      lightingQuality: 'acceptable',
      operatorMessage: `${masterTemplates[category].title} customer photo ready. Face and outfit references will be sent directly to image generation.`,
    });
  }

  function resetGeneratedOutputs() {
    setMasterImageUrl(null);
    setMasterApproved(false);
    setMasterGenerationMessage(null);
    setVideoPhase('idle');
    setVideoProgress(0);
    setVideoError(null);
    setJobId(null);
  }

  function selectMode(nextMode: CreateMode) {
    setMode(nextMode);
    setError(null);
    resetGeneratedOutputs();
  }

  function selectCategory(nextCategory: MasterTemplateId) {
    setSelectedCategory(nextCategory);
    setError(null);
    resetGeneratedOutputs();
    if (activeGarmentPhotos.length) {
      setLocalGarmentReady(garmentPhotos, nextCategory);
    }
    if (personPhoto) {
      setLocalPersonReady(nextCategory);
    }
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
      setLocalGarmentReady(nextPhotos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Garment upload failed.');
    }
  }

  async function handlePersonUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    try {
      const { dataUrl } = await compressImage(file, aiPhotoMaxDimension, aiPhotoQuality);
      setPersonPhoto(dataUrl);
      resetGeneratedOutputs();
      setLocalPersonReady();

      if (mode === 'proof' && selectedCategory) {
        await registerManualMasterImage(file, dataUrl, 'Uploaded ready AI image from customer photo slot. Master image approved automatically.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Customer photo analysis failed.');
    }
  }

  async function generateMasterImage() {
    if (!canGenerateMaster || !personPhoto || !selectedCategory) return;

    setIsGeneratingMaster(true);
    setMasterApproved(false);
    setError(null);
    setMasterGenerationMessage('Sending compressed photos to Gemini image generation...');

    try {
      const resolvedTemplateId = selectedCategory;
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

  async function registerManualMasterImage(file: File, dataUrl: string, successMessage: string) {
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
      setMasterGenerationMessage(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Manual master image upload failed.');
    } finally {
      setIsUploadingManualMaster(false);
    }
  }

  async function handleManualMasterUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedCategory) return;

    try {
      const { dataUrl } = await compressImage(file, 1600, 0.85);
      await registerManualMasterImage(file, dataUrl, 'Uploaded AI image registered. Ready for 6-second video generation.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Manual master image upload failed.');
    }
  }

  async function startVideoGeneration() {
    if (!canGenerateVideo || !masterImageUrl) return;

    setVideoPhase('starting');
    setVideoProgress(8);
    setVideoError(null);
    setError(null);

    try {
      const cameraTemplate = getNextCameraMotionTemplate();
      const finalVideoPrompt = `${selectedMasterTemplate.videoPrompt}

Use this exact fresh camera motion for this generation:
${cameraTemplate.prompt}

Final safety: no glamour/body-part emphasis, no hip/waist/chest/leg focus, no awkward crop, no forehead mark, no religious mark, no text inside video. The subject must feel alive through eye movement, tiny head turn, soft smile, lights, camera motion and background motion.`;

      const startRes = await fetch('/api/video/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          garmentAnalysis,
          masterImageUrl,
          conceptPrompt: finalVideoPrompt,
        }),
      });
      const startData = await parseJsonResponse(startRes);
      setJobId(startData.jobId);
      setVideoPhase('rendering');
      setVideoProgress(25);

      await pollVideoStatus(startData.jobId);
    } catch (err) {
      setVideoPhase('failed');
      const message = err instanceof Error ? err.message : 'Video generation failed to start.';
      setVideoError(message);
      setError(message);
    }
  }

  async function pollVideoStatus(activeJobId: string) {
    let attempts = 0;

    while (attempts < 180) {
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
        const message = statusData.error || 'Video generation failed.';
        setVideoError(message);
        throw new Error(message);
      }
    }

    throw new Error('Video generation is still taking longer than expected. Check job status before retrying so you do not spend another credit.');
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

      <section className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Select customer category</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              This locks the exact prompt. No auto category detection credit is used.
            </p>
          </div>
          <span className="rounded-full bg-[#6e0d1f] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#F3E5AB]">
            {selectedCategory ? `${masterTemplates[selectedCategory].title} locked` : 'Choose first'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {categoryOptions.map((option) => {
            const active = option.id === selectedCategory;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => selectCategory(option.id)}
                className={`rounded-xl border p-4 text-left transition ${
                  active
                    ? 'border-[#6e0d1f] bg-[#6e0d1f] text-white shadow-md'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-amber-300'
                }`}
              >
                <p className="font-serif text-lg font-bold uppercase tracking-wider">{option.title}</p>
                <p className={`mt-1 text-[11px] font-semibold ${active ? 'text-amber-100' : 'text-slate-500'}`}>
                  {option.subtitle}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-xl border border-amber-200 bg-[#fffaf0] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-800">
            Selected Diwali Pose
          </p>
          <p className="mt-1 font-serif text-lg font-bold text-[#6e0d1f]">
            {selectedMasterTemplate.poseTitle}
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
            {selectedMasterTemplate.poseDescription} Body motion is locked low-risk; video motion comes from camera, lights, diyas and festive background only.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => selectMode('proof')}
            className={`rounded-xl border p-4 text-left transition ${
              mode === 'proof'
                ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-sm'
                : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300'
            }`}
          >
            <p className="text-sm font-bold uppercase tracking-wider">Upload Ready AI Image</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Skip Gemini image cost. Upload your generated master image, then generate video.
            </p>
          </button>

          <button
            type="button"
            onClick={() => selectMode('test')}
            className={`rounded-xl border p-4 text-left transition ${
              mode === 'test'
                ? 'border-[#6e0d1f] bg-[#fff7e6] text-[#6e0d1f] shadow-sm'
                : 'border-slate-200 bg-white text-slate-700 hover:border-amber-300'
            }`}
          >
            <p className="text-sm font-bold uppercase tracking-wider">Generate AI Image</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Use Gemini image API from garment photos and customer photo.
            </p>
          </button>
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
                !canUploadManualMaster || isUploadingManualMaster ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:brightness-110'
              }`}
            >
              {isUploadingManualMaster ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5 text-amber-200" />}
              Upload Ready AI Image
              <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleManualMasterUpload} disabled={!canUploadManualMaster || isUploadingManualMaster} className="hidden" />
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
                {mode === 'proof'
                  ? selectedCategory
                    ? `${masterTemplates[selectedCategory].title} prompt locked · uploaded AI image to video`
                    : 'Select Men, Women, Boy, or Girl before video generation'
                  : selectedCategory
                    ? `${masterTemplates[selectedCategory].title} prompt locked · AI 6-second video generation`
                    : 'Select Men, Women, Boy, or Girl before generation'}
              </p>
            </div>
          </div>
          <button
            onClick={startVideoGeneration}
            disabled={!canGenerateVideo}
            className="py-4 px-6 rounded-2xl bg-gradient-to-r from-[#D4AF37] via-[#F5E089] to-[#D4AF37] text-black font-bold uppercase tracking-wider text-xs shadow-lg flex items-center justify-center gap-2 disabled:opacity-40"
          >
            Generate 6-sec Video <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <div className="h-3 bg-white/10 rounded-full overflow-hidden border border-amber-300/20">
            <div
              className="h-full bg-gradient-to-r from-amber-300 to-emerald-400 transition-all duration-500"
              style={{ width: `${videoProgress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs font-mono text-amber-100">
            <span>{progressCopy[videoPhase]}</span>
            <span>{videoProgress}%</span>
          </div>
          {jobId && <p className="text-[11px] text-amber-200/80 font-mono">JOB: {jobId}</p>}
          {videoError && (
            <div className="rounded-xl border border-red-400/50 bg-red-500/15 p-3 text-xs font-bold text-red-100">
              {videoError}
            </div>
          )}
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
