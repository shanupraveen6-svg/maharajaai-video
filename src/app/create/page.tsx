'use client';

import React, { useState } from 'react';
import { Camera, CheckCircle2, Sparkles, RefreshCw, Shirt, User, Copy, Download, Upload, Video, Film, Image as ImageIcon, ArrowRight } from 'lucide-react';
import { compressImage } from '@/lib/utils/image';

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

export default function SingleScreenCreateStudioPage() {
  const [sessionId] = useState(() => 'mah_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
  
  // Up to 3 garment photos
  const [garmentPhotos, setGarmentPhotos] = useState<(string | null)[]>([null, null, null]);
  const [personPhoto, setPersonPhoto] = useState<string | null>(null);
  
  // AI Analysis Results
  const [isAnalyzingGarment, setIsAnalyzingGarment] = useState(false);
  const [garmentAnalysis, setGarmentAnalysis] = useState<any>(null);

  const [isAnalyzingPerson, setIsAnalyzingPerson] = useState(false);

  // Master Image State
  const [isUploadingMaster, setIsUploadingMaster] = useState(false);
  const [masterImageUrl, setMasterImageUrl] = useState<string | null>(null);

  // Video State
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [uploadedVideoSuccess, setUploadedVideoSuccess] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [copyMasterPromptSuccess, setCopyMasterPromptSuccess] = useState(false);
  const [copyVideoPromptSuccess, setCopyVideoPromptSuccess] = useState(false);

  // 1. Handle Garment Photo Upload by Slot Index
  const handleGarmentSlotUpload = async (e: React.ChangeEvent<HTMLInputElement>, slotIdx: number) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const { dataUrl } = await compressImage(files[0], 1600, 0.85);
      const updated = [...garmentPhotos];
      updated[slotIdx] = dataUrl;
      setGarmentPhotos(updated);

      const activeGarmentPhotos = updated.filter(Boolean) as string[];
      setIsAnalyzingGarment(true);
      try {
        const res = await fetch('/api/ai/analyze-garment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images: activeGarmentPhotos, sessionId })
        });
        const data = await parseJsonResponse(res);
        if (data.success) {
          setGarmentAnalysis(data.analysis);
        }
      } catch (err) {
        console.error('Garment analysis error:', err);
      } finally {
        setIsAnalyzingGarment(false);
      }
    } catch (compressErr) {
      console.error('Image compression failed:', compressErr);
    }
  };

  // 2. Handle Person Photo Upload
  const handlePersonUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const { dataUrl } = await compressImage(files[0], 1600, 0.85);
      setPersonPhoto(dataUrl);

      setIsAnalyzingPerson(true);
      try {
        const res = await fetch('/api/ai/analyze-person', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: dataUrl, sessionId })
        });
        await parseJsonResponse(res);
      } catch (err) {
        console.error('Person analysis error:', err);
      } finally {
        setIsAnalyzingPerson(false);
      }
    } catch (compressErr) {
      console.error('Image compression failed:', compressErr);
    }
  };

  // 3. Master Image Prompt Generator
  const getMasterImagePrompt = () => {
    return `Create a photorealistic vertical 9:16 full-body Indian festive fashion master image.
Use the first uploaded image as the exact customer identity reference. Preserve the same facial identity, facial features, face shape, skin tone, hairstyle, approximate body proportions, age appearance and overall likeness.
Use the remaining uploaded garment images as the exact clothing reference. Preserve the garment's real primary color, secondary colors, fabric appearance, embroidery, motifs, borders, pattern placement, neckline, sleeves, silhouette and overall design.
Dress the same customer naturally and realistically in the selected garment as a complete full-length outfit.
If the uploaded product contains only a top garment, create a tasteful complementary traditional bottom that matches the product without altering the supplied garment itself.
Create an elegant premium Diwali fashion setting with warm glowing diyas, traditional lamps, subtle rangoli, floral decorations and refined festive golden lighting.
Maintain strict full-body head-to-toe framing. The complete outfit must be clearly visible.
Styling should be attractive, premium and realistic, with natural posture, subtle festive makeup and elegant Indian traditional styling suitable for the customer.
Do not change the customer's identity. Do not redesign the garment. Do not change garment color, embroidery, motifs or pattern. Do not create duplicate people, extra limbs, malformed hands, random text or logos.
The final image should look like a premium Maharaja festive fashion campaign photograph.`;
  };

  const handleCopyMasterPrompt = () => {
    const prompt = getMasterImagePrompt();
    navigator.clipboard.writeText(prompt);
    setCopyMasterPromptSuccess(true);
    setTimeout(() => setCopyMasterPromptSuccess(false), 3000);
  };

  // 4. Video Commercial Prompt Generator
  const getGeminiVideoPrompt = () => {
    return `Create a photorealistic premium 6-second vertical 9:16 Diwali fashion commercial using the uploaded master reference image as the definitive visual reference.
Preserve the exact same person's facial identity, facial features, face shape, skin tone, hairstyle, body proportions, age appearance, garment design, garment color, fabric, embroidery, motifs, pattern, accessories and complete outfit throughout the entire video.
The subject begins slightly farther from the camera and walks slowly and naturally forward toward the camera throughout the shot.
Maintain strict full-body head-to-toe framing throughout so the complete garment length and silhouette remain clearly visible at all times.
The subject smiles warmly and gracefully holds a glowing traditional clay diya in both hands while walking.
Place the subject in a vibrant premium Diwali celebration environment with warm diyas, traditional lamps, floral decorations, subtle rangoli and elegant festive golden lighting.
Use realistic walking motion, natural fabric movement, anatomically correct hands and fingers, elegant posture, subtle festive makeup, realistic skin texture and high-end Indian fashion-commercial lighting.
The subject clearly says in natural Tamil:
"அனைவருக்கும் இனிய தீபாவளி நல்வாழ்த்துக்கள்!"
Keep the camera movement smooth and cinematic. Keep the person centered and clearly visible.
Display the Tamil greeting text tastefully near the lower third for 2-3 seconds.
Do not change the person's face. Do not change the garment. Do not change garment color, embroidery, hairstyle or body proportions. No duplicate person. No extra limbs. No malformed hands. No dancing. No spinning. No jumping. No face morphing. No random text. No generated logos. No excessive fireworks.
Premium festive commercial look, sharp focus, cinematic depth and warm color grading.`;
  };

  const handleCopyVideoPrompt = () => {
    const prompt = getGeminiVideoPrompt();
    navigator.clipboard.writeText(prompt);
    setCopyVideoPromptSuccess(true);
    setTimeout(() => setCopyVideoPromptSuccess(false), 3000);
  };

  // 5. Direct Master Image Upload Handler
  const handleDirectMasterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingMaster(true);
    try {
      const contentType = file.type || 'image/jpeg';
      const signedRes = await fetch('/api/upload/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          assetType: 'master',
          contentType
        })
      });

      const signedData = await parseJsonResponse(signedRes);

      if (!signedData.success || !signedData.directUpload || !signedData.uploadUrl) {
        throw new Error('Firebase direct master image upload is unavailable. Check Firebase Storage configuration.');
      }

      const storagePath = signedData.storagePath || `sessions/${sessionId}/master/master.jpg`;
      const { dataUrl } = await compressImage(file, 1600, 0.85);

      const putRes = await fetch(signedData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file
      });

      if (!putRes.ok) {
        throw new Error(`Direct Storage master upload failed: ${putRes.status}`);
      }

      const completeRes = await fetch('/api/upload/master-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          storagePath,
          masterImageUrl: dataUrl
        })
      });

      const completeData = await parseJsonResponse(completeRes);
      setMasterImageUrl(completeData.masterImageUrl || dataUrl);
    } catch (err: any) {
      console.error('Master image upload failed:', err);
      alert('Master image upload failed: ' + err.message);
    } finally {
      setIsUploadingMaster(false);
    }
  };

  // 6. Direct Video Upload Handler
  const handleDirectVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingVideo(true);
    setProgressMsg('Preparing secure video upload to Firebase Storage...');

    try {
      const contentType = file.type || 'video/mp4';

      const signedRes = await fetch('/api/upload/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          assetType: 'video',
          contentType
        })
      });

      const signedData = await parseJsonResponse(signedRes);

      if (!signedData.success || !signedData.directUpload || !signedData.uploadUrl) {
        throw new Error('Firebase direct video upload is unavailable. Check Firebase Storage configuration.');
      }

      const storagePath = signedData.storagePath || `sessions/${sessionId}/video/final.mp4`;

      setProgressMsg('Uploading video directly to Firebase Storage...');
      const putRes = await fetch(signedData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file
      });

      if (!putRes.ok) {
        throw new Error(`Direct Storage video upload failed: ${putRes.status}`);
      }

      setProgressMsg('Finalizing Diwali Commercial Film...');
      const completeRes = await fetch('/api/video/manual-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          storagePath
        })
      });

      const completeData = await parseJsonResponse(completeRes);

      if (!completeData.success) {
        throw new Error(completeData.error || 'Failed to complete video registration.');
      }

      setUploadedVideoSuccess(true);
      window.location.href = `/result/${sessionId}`;
    } catch (err: any) {
      console.error('Direct Video Upload Error:', err);
      alert('Video Upload Error: ' + err.message);
    } finally {
      setIsUploadingVideo(false);
    }
  };

  const garmentLabels = [
    'Garment Front View',
    'Garment Detail View',
    'Garment Additional View'
  ];

  return (
    <main className="min-h-screen bg-[#070609] text-[#F8F5EE] p-4 md:p-8 font-sans max-w-xl mx-auto relative select-none pb-20 space-y-8">
      
      {/* Header */}
      <header className="flex justify-between items-center border-b border-[#D4AF37]/20 pb-4">
        <div>
          <h1 className="text-lg font-serif font-bold text-[#F3E5AB] tracking-widest uppercase">
            MAHARAJA ALL-IN-ONE STUDIO
          </h1>
          <p className="text-[10px] text-[#D4AF37]/80 tracking-widest uppercase">
            SINGLE-SCREEN FASHION COMMERCIAL CREATOR
          </p>
        </div>

        <div className="text-[10px] font-mono text-[#D4AF37] bg-[#6e0d1f]/40 px-2.5 py-1 rounded-full border border-[#D4AF37]/40">
          ID: {sessionId.substring(0, 10)}
        </div>
      </header>

      {/* =================================================== */}
      {/* SECTION 1: PRODUCT & PERSON IMAGE INPUTS */}
      {/* =================================================== */}
      <section className="space-y-4 p-5 rounded-2xl bg-black/60 border border-[#D4AF37]/30">
        <div className="flex items-center gap-2 border-b border-[#D4AF37]/20 pb-3">
          <Shirt className="w-5 h-5 text-[#D4AF37]" />
          <h2 className="text-sm font-serif font-bold text-[#F3E5AB] uppercase tracking-wider">
            1. GARMENT & PERSON REFERENCE PHOTOS
          </h2>
        </div>

        {/* Garment Uploads (Up to 3) */}
        <div className="space-y-3">
          <p className="text-xs font-mono text-[#D4AF37] uppercase">GARMENT PHOTOS (UP TO 3):</p>
          <div className="grid grid-cols-3 gap-2">
            {garmentLabels.map((label, idx) => (
              <div key={idx} className="space-y-2 p-2 rounded-xl bg-black/80 border border-[#D4AF37]/20 text-center">
                <p className="text-[9px] font-mono text-gray-400 uppercase truncate">{label}</p>
                {garmentPhotos[idx] ? (
                  <div className="relative aspect-[3/4] w-full rounded-lg overflow-hidden border border-[#D4AF37]/40">
                    <img src={garmentPhotos[idx]!} alt={label} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="aspect-[3/4] w-full rounded-lg border border-dashed border-[#D4AF37]/30 flex flex-col items-center justify-center bg-black/40 text-[9px] text-gray-500 font-mono">
                    EMPTY ({idx + 1})
                  </div>
                )}

                <label className="w-full py-1.5 px-1 rounded bg-[#6e0d1f] border border-[#D4AF37]/30 text-[#F3E5AB] text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer hover:brightness-110">
                  <Camera className="w-3 h-3 text-[#D4AF37]" />
                  <span>UPLOAD</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleGarmentSlotUpload(e, idx)}
                    className="hidden"
                  />
                </label>
              </div>
            ))}
          </div>

          {isAnalyzingGarment && (
            <div className="p-3 rounded-lg bg-[#6e0d1f]/40 border border-[#D4AF37]/30 text-center text-[11px] text-[#F3E5AB] flex items-center justify-center gap-2 animate-pulse font-mono">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> ANALYZING GARMENT EMBROIDERY & COLORS...
            </div>
          )}

          {garmentAnalysis && !isAnalyzingGarment && (
            <div className="p-3 rounded-lg bg-black/80 border border-emerald-500/40 text-xs flex justify-between items-center text-gray-300 font-mono">
              <span>GARMENT: <strong className="text-white">{garmentAnalysis.garmentType}</strong> ({garmentAnalysis.primaryColor})</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
          )}
        </div>

        {/* Person Upload (Customer Photo) */}
        <div className="space-y-3 pt-2 border-t border-[#D4AF37]/20">
          <p className="text-xs font-mono text-[#D4AF37] uppercase flex items-center gap-1">
            <User className="w-4 h-4 text-[#D4AF37]" /> CUSTOMER PERSON PHOTO:
          </p>
          <div className="flex gap-4 items-center">
            <div className="w-24 aspect-[3/4] rounded-xl border border-[#D4AF37]/40 bg-black overflow-hidden flex items-center justify-center shrink-0">
              {personPhoto ? (
                <img src={personPhoto} alt="Customer" className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-gray-600" />
              )}
            </div>

            <div className="space-y-2 flex-1">
              <div className="grid grid-cols-2 gap-2">
                <label className="py-2.5 px-3 rounded-lg bg-[#6e0d1f] border border-[#D4AF37]/40 text-[#F3E5AB] text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer hover:brightness-110">
                  <Camera className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>TAKE PHOTO</span>
                  <input type="file" accept="image/*" capture="user" onChange={handlePersonUpload} className="hidden" />
                </label>

                <label className="py-2.5 px-3 rounded-lg bg-black border border-[#D4AF37]/40 text-gray-200 text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer hover:bg-gray-900">
                  <ImageIcon className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>GALLERY</span>
                  <input type="file" accept="image/*" onChange={handlePersonUpload} className="hidden" />
                </label>
              </div>

              {isAnalyzingPerson && (
                <div className="text-[10px] text-[#D4AF37] font-mono animate-pulse">
                  Verifying customer pose...
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* =================================================== */}
      {/* SECTION 2: AI MASTER IMAGE GENERATION & UPLOAD */}
      {/* =================================================== */}
      <section className="space-y-4 p-5 rounded-2xl bg-black/60 border border-[#D4AF37]/30">
        <div className="flex items-center gap-2 border-b border-[#D4AF37]/20 pb-3">
          <Sparkles className="w-5 h-5 text-[#D4AF37]" />
          <h2 className="text-sm font-serif font-bold text-[#F3E5AB] uppercase tracking-wider">
            2. AI MASTER IMAGE STUDIO (GEMINI PRO)
          </h2>
        </div>

        {/* Copy Master Prompt */}
        <div className="space-y-2">
          <button
            onClick={handleCopyMasterPrompt}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#800A1D] via-[#D4AF37] to-[#800A1D] text-black font-bold uppercase tracking-wider text-xs shadow-md flex items-center justify-center gap-2 hover:brightness-110 transition"
          >
            <Copy className="w-4 h-4 fill-black" />
            {copyMasterPromptSuccess ? '✓ MASTER IMAGE PROMPT COPIED' : 'COPY MASTER IMAGE PROMPT'}
          </button>
        </div>

        {/* Upload AI Master Image */}
        <div className="p-4 rounded-xl bg-[#6e0d1f]/30 border border-dashed border-[#D4AF37]/60 text-center space-y-3">
          <p className="text-xs font-serif font-bold text-[#F3E5AB] uppercase tracking-wider">
            UPLOAD GENERATED AI MASTER IMAGE (JPG / PNG)
          </p>

          <label className="inline-flex py-3 px-6 rounded-xl bg-gradient-to-r from-[#D4AF37] via-[#F5E089] to-[#D4AF37] text-black font-bold uppercase tracking-wider text-xs shadow-xl cursor-pointer hover:scale-105 transition items-center justify-center gap-2">
            <Upload className="w-4 h-4 fill-black" />
            <span>{isUploadingMaster ? 'UPLOADING...' : 'SELECT & UPLOAD MASTER IMAGE'}</span>
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png"
              onChange={handleDirectMasterUpload}
              disabled={isUploadingMaster}
              className="hidden"
            />
          </label>
        </div>

        {/* 9:16 Master Image Preview if Uploaded */}
        {masterImageUrl && (
          <div className="relative aspect-[9/16] w-full max-w-xs mx-auto rounded-2xl overflow-hidden border-2 border-[#D4AF37] shadow-xl bg-black">
            <img src={masterImageUrl} alt="Master Reference" className="w-full h-full object-cover" />
            <div className="absolute top-3 right-3 bg-emerald-950/90 border border-emerald-500/50 px-3 py-1 rounded-full text-[10px] text-emerald-300 font-mono">
              MASTER UPLOADED ✓
            </div>
          </div>
        )}
      </section>

      {/* =================================================== */}
      {/* SECTION 3: AI VIDEO STUDIO & MP4 UPLOAD */}
      {/* =================================================== */}
      <section className="space-y-4 p-5 rounded-2xl bg-black/60 border border-[#D4AF37]/30">
        <div className="flex items-center gap-2 border-b border-[#D4AF37]/20 pb-3">
          <Film className="w-5 h-5 text-[#D4AF37]" />
          <h2 className="text-sm font-serif font-bold text-[#F3E5AB] uppercase tracking-wider">
            3. AI VIDEO STUDIO & MP4 UPLOAD
          </h2>
        </div>

        {/* Copy Video Prompt */}
        <div className="space-y-2">
          <button
            onClick={handleCopyVideoPrompt}
            className="w-full py-3.5 px-4 rounded-xl bg-black/80 border-2 border-[#D4AF37] text-[#F3E5AB] font-bold uppercase tracking-wider text-xs shadow-md flex items-center justify-center gap-2 hover:bg-black transition"
          >
            <Copy className="w-4 h-4 text-[#D4AF37]" />
            {copyVideoPromptSuccess ? '✓ VIDEO PROMPT COPIED' : 'COPY GEMINI VIDEO PROMPT'}
          </button>
        </div>

        {/* Upload Generated Video MP4 */}
        <div className="p-4 rounded-xl bg-[#6e0d1f]/40 border-2 border-dashed border-[#D4AF37] text-center space-y-3">
          <div className="w-10 h-10 mx-auto rounded-full bg-black/60 border border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37]">
            <Video className="w-5 h-5" />
          </div>

          <div>
            <p className="text-xs font-serif font-bold text-[#F3E5AB] uppercase tracking-wider">
              UPLOAD GENERATED COMMERCIAL VIDEO (.MP4)
            </p>
            <p className="text-[11px] text-gray-300 mt-0.5">
              Upload your MP4 video file to trigger automatic TV playback & result preview.
            </p>
          </div>

          <label className="inline-flex py-3.5 px-6 rounded-xl bg-gradient-to-r from-[#D4AF37] via-[#F5E089] to-[#D4AF37] text-black font-bold uppercase tracking-wider text-xs shadow-xl cursor-pointer hover:scale-105 transition items-center justify-center gap-2">
            <Upload className="w-4 h-4 fill-black" />
            <span>SELECT & UPLOAD MP4 VIDEO</span>
            <input
              type="file"
              accept="video/mp4,video/*"
              onChange={handleDirectVideoUpload}
              disabled={isUploadingVideo}
              className="hidden"
            />
          </label>
        </div>
      </section>

      {/* =================================================== */}
      {/* SECTION 4: COMPLETE & VIEW RESULT */}
      {/* =================================================== */}
      <section className="pt-2">
        <a
          href={`/result/${sessionId}`}
          className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-[#800A1D] via-[#D4AF37] to-[#800A1D] text-black font-bold uppercase tracking-wider text-sm shadow-xl flex items-center justify-center gap-2 hover:brightness-110 transition block text-center"
        >
          VIEW RESULT PAGE & GO LIVE <ArrowRight className="w-4 h-4" />
        </a>
      </section>

      {/* Uploading Overlay */}
      {isUploadingVideo && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-4">
          <RefreshCw className="w-12 h-12 text-[#D4AF37] animate-spin" />
          <h3 className="text-xl font-serif font-bold text-[#F3E5AB] uppercase tracking-wider">
            UPLOADING DIWALI COMMERCIAL
          </h3>
          <p className="text-xs text-[#D4AF37] font-mono animate-pulse">
            {progressMsg}
          </p>
        </div>
      )}

    </main>
  );
}
