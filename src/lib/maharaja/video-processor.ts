import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

function getFfmpegPath(): string | null {
  if (typeof ffmpegPath === 'string' && fs.existsSync(ffmpegPath)) {
    return ffmpegPath;
  }
  return null;
}

function resolvePublicAsset(relativeOrFullPath: string | undefined, fallback: string) {
  const requested = relativeOrFullPath || fallback;
  const candidate = requested.startsWith('/')
    ? path.join(process.cwd(), 'public', requested.replace(/^\//, ''))
    : requested;
  return fs.existsSync(candidate) ? candidate : '';
}

async function generateBrandedVideo(
  inputBuffer: Buffer,
  durationSeconds: 6 | 9,
  audioRelativeOrFullPath: string,
  stretchToNineSeconds: boolean
): Promise<Buffer> {
  const binary = getFfmpegPath();
  const logoPath = path.join(process.cwd(), 'public', 'maharaja-logo.png');
  const audioPath = resolvePublicAsset(audioRelativeOrFullPath, audioRelativeOrFullPath);
  if (!binary || !fs.existsSync(logoPath) || !audioPath || inputBuffer.length === 0) {
    throw new Error('Required FFmpeg, Maharaja logo, or event audio asset is unavailable.');
  }

  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tmpIn = path.join(os.tmpdir(), `mhr_brand_in_${id}.mp4`);
  const tmpOut = path.join(os.tmpdir(), `mhr_brand_${durationSeconds}_${id}.mp4`);
  try {
    await fs.promises.writeFile(tmpIn, inputBuffer);
    const timingFilter = stretchToNineSeconds ? 'setpts=1.5*PTS' : 'setpts=PTS-STARTPTS';
    const fadeOutStart = (durationSeconds - 0.25).toFixed(2);
    const audioFilter = `[1:a]apad,aformat=sample_rates=44100:channel_layouts=stereo,afade=t=in:st=0:d=0.05,afade=t=out:st=${fadeOutStart}:d=0.25[a_out]`;
    const filterComplex = `[0:v]${timingFilter}[timed];[2:v]scale=96:96[logo];[timed][logo]overlay=W-w-24:24[v_out];${audioFilter}`;
    const args = [
      '-y',
      '-i', tmpIn,
      '-i', audioPath,
      '-i', logoPath,
      '-filter_complex', filterComplex,
      '-map', '[v_out]',
      '-map', '[a_out]',
      '-t', String(durationSeconds),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-ac', '2',
      '-movflags', '+faststart',
      tmpOut,
    ];
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(binary, args);
      let stderr = '';
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      proc.on('close', (code) => code === 0
        ? resolve()
        : reject(new Error(`FFmpeg branded video exited with code ${code}: ${stderr.slice(-400)}`)));
      proc.on('error', reject);
    });
    const output = await fs.promises.readFile(tmpOut);
    if (!output.length) throw new Error('FFmpeg produced an empty branded video.');
    return output;
  } finally {
    await Promise.allSettled([fs.promises.unlink(tmpIn), fs.promises.unlink(tmpOut)]);
  }
}

/** Creates the downloadable six-second MP4 with embedded Maharaja logo and preview audio. */
export function generateCustomer6sVideo(inputBuffer: Buffer, audioRelativeOrFullPath: string) {
  return generateBrandedVideo(inputBuffer, 6, audioRelativeOrFullPath, false);
}

/**
 * Permanently embeds the Maharaja official circular logo into the top-right corner of an MP4 video.
 */
export async function applyMaharajaVideoWatermark(inputBuffer: Buffer): Promise<Buffer> {
  const binary = getFfmpegPath();
  const logoPath = path.join(process.cwd(), 'public', 'maharaja-logo.png');

  if (!binary || !fs.existsSync(logoPath) || inputBuffer.length === 0) {
    console.warn('Video watermarking skipped: ffmpeg or logo asset not found.');
    return inputBuffer;
  }

  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tmpIn = path.join(os.tmpdir(), `mhr_in_${id}.mp4`);
  const tmpOut = path.join(os.tmpdir(), `mhr_wm_${id}.mp4`);

  try {
    await fs.promises.writeFile(tmpIn, inputBuffer);

    const args = [
      '-y',
      '-i', tmpIn,
      '-i', logoPath,
      '-filter_complex', '[1:v]scale=96:96[logo];[0:v][logo]overlay=W-w-24:24[v_out]',
      '-map', '[v_out]',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-c:a', 'copy',
      '-movflags', '+faststart',
      tmpOut,
    ];

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(binary, args);
      let stderr = '';
      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-300)}`));
      });
      proc.on('error', reject);
    });

    const outputBuffer = await fs.promises.readFile(tmpOut);
    return outputBuffer.length > 0 ? outputBuffer : inputBuffer;
  } catch (err) {
    console.warn('Video watermark application warning, falling back to original:', err);
    return inputBuffer;
  } finally {
    try {
      if (fs.existsSync(tmpIn)) await fs.promises.unlink(tmpIn);
      if (fs.existsSync(tmpOut)) await fs.promises.unlink(tmpOut);
    } catch {
      // Ignore temp file cleanup errors
    }
  }
}

/**
 * Creates the authentic 9-second live showroom video by retiming the 6-second video (setpts=1.5*PTS),
 * overlaying the Maharaja logo, and multiplexing the 9-second festival audio track.
 */
export async function generateLive9sVideo(
  input6sBuffer: Buffer,
  audioRelativeOrFullPath?: string
): Promise<Buffer> {
  const audio = audioRelativeOrFullPath || '/audio/maharaja/live/go-live-final.mp3';
  return generateBrandedVideo(input6sBuffer, 9, audio, true);
}
