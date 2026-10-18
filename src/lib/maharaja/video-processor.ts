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
  const binary = getFfmpegPath();
  const logoPath = path.join(process.cwd(), 'public', 'maharaja-logo.png');

  // Resolve audio path
  let audioPath = '';
  if (audioRelativeOrFullPath) {
    const candidate = audioRelativeOrFullPath.startsWith('/')
      ? path.join(process.cwd(), 'public', audioRelativeOrFullPath.replace(/^\//, ''))
      : audioRelativeOrFullPath;
    if (fs.existsSync(candidate)) audioPath = candidate;
  }
  if (!audioPath) {
    const defaultLiveAudio = path.join(process.cwd(), 'public', 'audio', 'maharaja', 'live', 'go-live-final.mp3');
    if (fs.existsSync(defaultLiveAudio)) audioPath = defaultLiveAudio;
  }

  if (!binary || input6sBuffer.length === 0) {
    console.warn('Live 9s video generation skipped: ffmpeg not available.');
    return input6sBuffer;
  }

  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tmpIn = path.join(os.tmpdir(), `mhr_in9_${id}.mp4`);
  const tmpOut = path.join(os.tmpdir(), `mhr_live9_${id}.mp4`);

  try {
    await fs.promises.writeFile(tmpIn, input6sBuffer);

    const hasLogo = fs.existsSync(logoPath);
    const hasAudio = Boolean(audioPath && fs.existsSync(audioPath));

    const args: string[] = ['-y', '-i', tmpIn];
    if (hasAudio) args.push('-i', audioPath);
    if (hasLogo) args.push('-i', logoPath);

    // Build filter complex
    let filter = '[0:v]setpts=1.5*PTS[v_slow]';
    if (hasLogo) {
      const logoInputIdx = hasAudio ? 2 : 1;
      filter += `;[${logoInputIdx}:v]scale=96:96[logo];[v_slow][logo]overlay=W-w-24:24[v_out]`;
    } else {
      filter += ';[v_slow]copy[v_out]';
    }

    args.push('-filter_complex', filter, '-map', '[v_out]');

    if (hasAudio) {
      args.push('-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-shortest');
    }

    args.push(
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-movflags', '+faststart',
      tmpOut
    );

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(binary, args);
      let stderr = '';
      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg live 9s exited with code ${code}: ${stderr.slice(-300)}`));
      });
      proc.on('error', reject);
    });

    const outputBuffer = await fs.promises.readFile(tmpOut);
    return outputBuffer.length > 0 ? outputBuffer : input6sBuffer;
  } catch (err) {
    console.warn('Live 9s video generation warning, falling back to original:', err);
    return input6sBuffer;
  } finally {
    try {
      if (fs.existsSync(tmpIn)) await fs.promises.unlink(tmpIn);
      if (fs.existsSync(tmpOut)) await fs.promises.unlink(tmpOut);
    } catch {
      // Ignore temp file cleanup errors
    }
  }
}
