'use client';

import React, { useState } from 'react';
import { Camera, CheckCircle2, Sparkles, RefreshCw, Shirt, User, Copy, Download, Upload, Video, Film, Image as ImageIcon, ArrowRight, ArrowLeft } from 'lucide-react';
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

// XHR Helper with real-time percentage upload progress
function xhrUploadFile(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: XMLHttpRequestBodyInit | File | Blob | FormData,
  onProgress: (percent: number, loadedMb: string, totalMb: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);

    Object.entries(headers).forEach(([k, v]) => {
      xhr.setRequestHeader(k, v);
    });

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        const loadedMb = (event.loaded / (1024 * 1024)).toFixed(1);
        const totalMb = (event.total / (1024 * 1024)).toFixed(1);
        onProgress(percent, loadedMb, totalMb);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload HTTP Error ${xhr.status}: ${xhr.responseText || 'Server error'}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network failure uploading file.'));
    xhr.ontimeout = () => reject(new Error('Upload connection timed out.'));

    xhr.send(body);
  });
}

export default function WebappViewportCreateStudioPage() {
  const [sessionId] = useState(() => 'mah_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
  const [activeScreen, setActiveScreen] = useState<1 | 2>(1);
  
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
  const [uploadProgress, setUploadProgress] = useState<number>(0);
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

  // 6. Real-time Video Upload Handler with XHR Percentage Progress
  const handleDirectVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileSizeMb = (file.size / (1024 * 1024)).toFixed(1);
    setIsUploadingVideo(true);
    setUploadProgress(0);
    setProgressMsg(`Initializing video upload (${fileSizeMb} MB)...`);

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

      let storagePath = `sessions/${sessionId}/video/final.mp4`;

      if (signedData.success && signedData.directUpload && signedData.uploadUrl) {
        storagePath = signedData.storagePath || storagePath;
        setProgressMsg(`Uploading to Firebase Storage (0% of ${fileSizeMb} MB)...`);

        try {
          await xhrUploadFile(
            signedData.uploadUrl,
            'PUT',
            { 'Content-Type': contentType },
            file,
            (percent, loadedMb, totalMb) => {
              setUploadProgress(percent);
              setProgressMsg(`Uploading video: ${percent}% (${loadedMb} MB / ${totalMb} MB)`);
            }
          );
        } catch (directErr: any) {
          console.warn('Direct signed URL XHR failed, attempting server fallback:', directErr);
          setProgressMsg('Retrying via server upload stream...');
          const formData = new FormData();
          formData.append('file', file);
          formData.append('sessionId', sessionId);

          const fallbackRes = await fetch('/api/upload/video', {
            method: 'POST',
            body: formData
          });
          const fallbackData = await parseJsonResponse(fallbackRes);
          if (!fallbackData.success) throw fallbackData;
        }
      } else {
        setProgressMsg(`Uploading via server stream (0% of ${fileSizeMb} MB)...`);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sessionId', sessionId);

        const fallbackRes = await fetch('/api/upload/video', {
          method: 'POST',
          body: formData
        });
        const fallbackData = await parseJsonResponse(fallbackRes);
        if (!fallbackData.success) throw fallbackData;
      }

      setUploadProgress(100);
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
    <main className="min-h-screen bg-[#FDFCF9] text-slate-900 p-4 sm:p-6 lg:p-10 font-sans max-w-7xl mx-auto relative select-none pb-24 space-y-8">
      
      {/* Header */}
      <header className="flex justify-between items-center bg-white p-5 md:p-6 rounded-2xl border border-amber-200/80 shadow-sm">
        <div>
          <h1 className="text-xl md:text-2xl font-serif font-bold text-[#6e0d1f] tracking-widest uppercase">
            MAHARAJA AI STUDIO
          </h1>
          <p className="text-xs text-amber-700 font-semibold tracking-widest uppercase">
            FULL WEBAPP VIEWPORT — DIWALI COMMERCIAL CREATOR
          </p>
        </div>

        <div className="text-xs md:text-sm font-mono font-bold text-[#6e0d1f] bg-amber-50 px-4 py-2 rounded-full border border-amber-300 shadow-sm">
          SESSION ID: {sessionId}
        </div>
      </header>

      {/* 2-SCREEN STEP INDICATOR BAR */}
      <div className="grid grid-cols-2 gap-4 text-xs md:text-sm font-mono max-w-2xl mx-auto">
        <button
          onClick={() => setActiveScreen(1)}
          className={`py-4 px-4 rounded-2xl border text-center transition font-bold uppercase tracking-wider flex items-center justify-center gap-2.5 ${
            activeScreen === 1
              ? 'bg-[#6e0d1f] border-amber-400 text-white shadow-xl scale-[1.02]'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm'
          }`}
        >
          <Sparkles className="w-5 h-5 text-amber-400" />
          <span>1. CAPTURE & MASTER KIT</span>
        </button>

        <button
          onClick={() => setActiveScreen(2)}
          className={`py-4 px-4 rounded-2xl border text-center transition font-bold uppercase tracking-wider flex items-center justify-center gap-2.5 ${
            activeScreen === 2
              ? 'bg-[#6e0d1f] border-amber-400 text-white shadow-xl scale-[1.02]'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm'
          }`}
        >
          <Film className="w-5 h-5 text-amber-400" />
          <span>2. VIDEO KIT & GO LIVE</span>
        </button>
      </div>

      {/* =================================================== */}
      {/* SCREEN 1: CAPTURE PHOTOS & MASTER IMAGE KIT (2 COLUMNS) */}
      {/* =================================================== */}
      {activeScreen === 1 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            
            {/* LEFT COLUMN: Garment & Person Section */}
            <section className="space-y-6 p-6 md:p-8 rounded-3xl bg-white border border-slate-200 shadow-md">
              <div className="flex items-center gap-3 border-b border-amber-100 pb-4">
                <Shirt className="w-6 h-6 text-[#6e0d1f]" />
                <h2 className="text-base md:text-lg font-serif font-bold text-[#6e0d1f] uppercase tracking-wider">
                  1. GARMENT & PERSON REFERENCE PHOTOS
                </h2>
              </div>

              {/* Garment Uploads (Up to 3) */}
              <div className="space-y-4">
                <p className="text-xs font-mono font-bold text-amber-800 uppercase">GARMENT PHOTOS (UP TO 3):</p>
                <div className="grid grid-cols-3 gap-3">
                  {garmentLabels.map((label, idx) => (
                    <div key={idx} className="space-y-2 p-3 rounded-2xl bg-slate-50 border border-slate-200 text-center shadow-inner">
                      <p className="text-[10px] font-mono text-slate-500 font-bold uppercase truncate">{label}</p>
                      {garmentPhotos[idx] ? (
                        <div className="relative aspect-[3/4] w-full rounded-xl overflow-hidden border-2 border-amber-400 shadow-sm">
                          <img src={garmentPhotos[idx]!} alt={label} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="aspect-[3/4] w-full rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center bg-white text-xs text-slate-400 font-mono font-bold">
                          SLOT {idx + 1}
                        </div>
                      )}

                      <label className="w-full py-2 px-1 rounded-xl bg-[#6e0d1f] border border-amber-300 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer hover:bg-[#800A1D] shadow-sm">
                        <Camera className="w-3.5 h-3.5 text-amber-300" />
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
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-center text-xs text-[#6e0d1f] font-bold flex items-center justify-center gap-2 animate-pulse font-mono">
                    <RefreshCw className="w-4 h-4 animate-spin text-[#6e0d1f]" /> ANALYZING GARMENT EMBROIDERY & COLORS...
                  </div>
                )}

                {garmentAnalysis && !isAnalyzingGarment && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-xs md:text-sm flex justify-between items-center text-emerald-900 font-mono font-semibold">
                    <span>GARMENT: <strong>{garmentAnalysis.garmentType}</strong> ({garmentAnalysis.primaryColor})</span>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  </div>
                )}
              </div>

              {/* Person Upload (Customer Photo) */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-mono font-bold text-amber-800 uppercase flex items-center gap-1.5">
                  <User className="w-4 h-4 text-[#6e0d1f]" /> CUSTOMER PERSON PHOTO:
                </p>
                <div className="flex gap-5 items-center">
                  <div className="w-28 aspect-[3/4] rounded-2xl border-2 border-amber-300 bg-slate-100 overflow-hidden flex items-center justify-center shrink-0 shadow-inner">
                    {personPhoto ? (
                      <img src={personPhoto} alt="Customer" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-10 h-10 text-slate-400" />
                    )}
                  </div>

                  <div className="space-y-3 flex-1">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="py-3.5 px-3 rounded-xl bg-[#6e0d1f] border border-amber-300 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer hover:bg-[#800A1D] shadow-sm">
                        <Camera className="w-4 h-4 text-amber-300" />
                        <span>TAKE PHOTO</span>
                        <input type="file" accept="image/*" capture="user" onChange={handlePersonUpload} className="hidden" />
                      </label>

                      <label className="py-3.5 px-3 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-200 shadow-sm">
                        <ImageIcon className="w-4 h-4 text-slate-600" />
                        <span>GALLERY</span>
                        <input type="file" accept="image/*" onChange={handlePersonUpload} className="hidden" />
                      </label>
                    </div>

                    {isAnalyzingPerson && (
                      <div className="text-xs text-amber-800 font-mono font-bold animate-pulse">
                        Verifying customer pose & lighting...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* RIGHT COLUMN: Master Image Studio Section */}
            <section className="space-y-6 p-6 md:p-8 rounded-3xl bg-white border border-slate-200 shadow-md">
              <div className="flex items-center gap-3 border-b border-amber-100 pb-4">
                <Sparkles className="w-6 h-6 text-[#6e0d1f]" />
                <h2 className="text-base md:text-lg font-serif font-bold text-[#6e0d1f] uppercase tracking-wider">
                  2. MASTER IMAGE PROMPT & UPLOAD
                </h2>
              </div>

              <button
                onClick={handleCopyMasterPrompt}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-[#800A1D] via-amber-600 to-[#800A1D] text-white font-bold uppercase tracking-wider text-xs md:text-sm shadow-md flex items-center justify-center gap-2.5 hover:brightness-110 transition"
              >
                <Copy className="w-5 h-5 text-amber-300" />
                {copyMasterPromptSuccess ? '✓ MASTER IMAGE PROMPT COPIED' : 'COPY MASTER IMAGE PROMPT'}
              </button>

              <div className="p-6 rounded-2xl bg-amber-50/60 border-2 border-dashed border-amber-300 text-center space-y-4">
                <p className="text-xs md:text-sm font-serif font-bold text-[#6e0d1f] uppercase tracking-wider">
                  UPLOAD AI MASTER IMAGE (JPG / PNG)
                </p>

                <label className="inline-flex py-4 px-8 rounded-2xl bg-[#6e0d1f] border border-amber-300 text-white font-bold uppercase tracking-wider text-xs md:text-sm shadow-lg cursor-pointer hover:bg-[#800A1D] transition items-center justify-center gap-2.5">
                  <Upload className="w-5 h-5 text-amber-300" />
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

              {masterImageUrl ? (
                <div className="relative aspect-[9/16] w-full max-w-xs mx-auto rounded-3xl overflow-hidden border-2 border-amber-400 shadow-2xl bg-black">
                  <img src={masterImageUrl} alt="Master Reference" className="w-full h-full object-cover" />
                  <div className="absolute top-4 right-4 bg-emerald-600 text-white px-4 py-1.5 rounded-full text-xs font-mono font-bold shadow-md">
                    MASTER UPLOADED ✓
                  </div>
                </div>
              ) : (
                <div className="aspect-[9/16] w-full max-w-xs mx-auto rounded-3xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center bg-slate-50 text-slate-400 font-mono text-xs">
                  <ImageIcon className="w-12 h-12 mb-2 text-slate-300" />
                  <span>MASTER IMAGE PREVIEW</span>
                </div>
              )}
            </section>

          </div>

          {/* Navigation to Screen 2 */}
          <button
            onClick={() => setActiveScreen(2)}
            className="w-full py-5 px-8 rounded-2xl bg-gradient-to-r from-[#6e0d1f] via-amber-600 to-[#6e0d1f] text-white font-bold uppercase tracking-wider text-sm md:text-base shadow-xl flex items-center justify-center gap-3 hover:scale-[1.01] transition"
          >
            PROCEED TO SCREEN 2: VIDEO KIT <ArrowRight className="w-5 h-5 text-amber-300" />
          </button>
        </div>
      )}

      {/* =================================================== */}
      {/* SCREEN 2: VIDEO KIT & GO LIVE TV (2 COLUMNS) */}
      {/* =================================================== */}
      {activeScreen === 2 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setActiveScreen(1)}
              className="px-4 py-2.5 rounded-2xl bg-white border border-slate-300 text-slate-700 text-xs font-mono font-bold uppercase flex items-center gap-2 hover:bg-slate-50 shadow-sm"
            >
              <ArrowLeft className="w-4 h-4 text-slate-600" /> BACK TO SCREEN 1
            </button>
            <span className="text-xs md:text-sm font-mono font-bold text-[#6e0d1f] bg-amber-100 px-4 py-1.5 rounded-full border border-amber-300">
              SCREEN 2 OF 2
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            
            {/* LEFT COLUMN: Master Reference Preview */}
            <section className="space-y-6 p-6 md:p-8 rounded-3xl bg-white border border-slate-200 shadow-md">
              <div className="flex items-center gap-3 border-b border-amber-100 pb-4">
                <Sparkles className="w-6 h-6 text-[#6e0d1f]" />
                <h2 className="text-base md:text-lg font-serif font-bold text-[#6e0d1f] uppercase tracking-wider">
                  MASTER REFERENCE IMAGE
                </h2>
              </div>

              {masterImageUrl ? (
                <div className="relative aspect-[9/16] w-full max-w-xs mx-auto rounded-3xl overflow-hidden border-2 border-amber-400 shadow-2xl bg-black">
                  <img src={masterImageUrl} alt="Master Reference" className="w-full h-full object-cover" />
                  <div className="absolute top-4 right-4 bg-emerald-600 text-white px-4 py-1.5 rounded-full text-xs font-mono font-bold shadow-md">
                    MASTER REFERENCE READY ✓
                  </div>
                </div>
              ) : (
                <div className="aspect-[9/16] w-full max-w-xs mx-auto rounded-3xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center bg-slate-50 text-slate-400 font-mono text-xs">
                  <ImageIcon className="w-12 h-12 mb-2 text-slate-300" />
                  <span>NO MASTER IMAGE UPLOADED YET</span>
                </div>
              )}
            </section>

            {/* RIGHT COLUMN: Video Kit Prompt & Upload */}
            <section className="space-y-6 p-6 md:p-8 rounded-3xl bg-white border border-slate-200 shadow-md">
              <div className="flex items-center gap-3 border-b border-amber-100 pb-4">
                <Film className="w-6 h-6 text-[#6e0d1f]" />
                <h2 className="text-base md:text-lg font-serif font-bold text-[#6e0d1f] uppercase tracking-wider">
                  VIDEO PROMPT & MP4 UPLOAD
                </h2>
              </div>

              <button
                onClick={handleCopyVideoPrompt}
                className="w-full py-4 px-6 rounded-2xl bg-white border-2 border-[#6e0d1f] text-[#6e0d1f] font-bold uppercase tracking-wider text-xs md:text-sm shadow-md flex items-center justify-center gap-2.5 hover:bg-amber-50 transition"
              >
                <Copy className="w-5 h-5 text-[#6e0d1f]" />
                {copyVideoPromptSuccess ? '✓ VIDEO PROMPT COPIED TO CLIPBOARD' : 'COPY GEMINI VIDEO PROMPT'}
              </button>

              <div className="p-8 rounded-2xl bg-amber-50/60 border-2 border-dashed border-amber-300 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-white border border-amber-300 flex items-center justify-center text-[#6e0d1f] shadow-sm">
                  <Video className="w-7 h-7" />
                </div>

                <div>
                  <p className="text-sm md:text-base font-serif font-bold text-[#6e0d1f] uppercase tracking-wider">
                    UPLOAD GENERATED COMMERCIAL VIDEO (.MP4)
                  </p>
                  <p className="text-xs text-slate-600 font-medium mt-1">
                    Upload your MP4 video to launch live TV playback & result preview.
                  </p>
                </div>

                <label className="inline-flex py-4 px-8 rounded-2xl bg-[#6e0d1f] border border-amber-300 text-white font-bold uppercase tracking-wider text-xs md:text-sm shadow-lg cursor-pointer hover:bg-[#800A1D] transition items-center justify-center gap-2.5">
                  <Upload className="w-5 h-5 text-amber-300" />
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

          </div>

          {/* Navigation to Result Page */}
          <a
            href={`/result/${sessionId}`}
            className="w-full py-5 px-8 rounded-2xl bg-gradient-to-r from-[#6e0d1f] via-amber-600 to-[#6e0d1f] text-white font-bold uppercase tracking-wider text-sm md:text-base shadow-xl flex items-center justify-center gap-3 hover:brightness-110 transition block text-center"
          >
            VIEW RESULT PAGE & GO LIVE TV <ArrowRight className="w-5 h-5 text-amber-300" />
          </a>
        </div>
      )}

      {/* Real-time Percentage Uploading Overlay */}
      {isUploadingVideo && (
        <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-5">
          <div className="relative w-20 h-20 flex items-center justify-center">
            <RefreshCw className="w-16 h-16 text-[#6e0d1f] animate-spin" />
            <span className="absolute font-mono font-bold text-xs text-[#6e0d1f]">
              {uploadProgress}%
            </span>
          </div>

          <div className="space-y-2 max-w-md w-full">
            <h3 className="text-2xl font-serif font-bold text-[#6e0d1f] uppercase tracking-wider">
              UPLOADING DIWALI COMMERCIAL
            </h3>
            
            {/* Visual Progress Bar */}
            <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden border border-slate-300 shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-[#6e0d1f] to-amber-500 transition-all duration-200"
                style={{ width: `${Math.max(5, uploadProgress)}%` }}
              />
            </div>

            <p className="text-xs text-amber-900 font-mono font-bold animate-pulse pt-1">
              {progressMsg}
            </p>
          </div>
        </div>
      )}

    </main>
  );
}
