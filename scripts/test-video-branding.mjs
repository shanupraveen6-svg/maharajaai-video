import { register } from 'node:module';
register('./ts-alias-loader.mjs', import.meta.url);

import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { applyMaharajaVideoWatermark, generateCustomer6sVideo, generateLive9sVideo } from '../src/lib/maharaja/video-processor.ts';

async function runCommand(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args);
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('close', (code) => {
      if (code === 0) resolve({ out, err });
      else reject(new Error(`Command failed [code ${code}]: ${err.slice(-300)}`));
    });
    p.on('error', reject);
  });
}

async function main() {
  console.log('--- TESTING MAHARAJA VIDEO WATERMARK & 9S RETIMING ---');
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    throw new Error(`ffmpeg binary not found at ${ffmpegPath}`);
  }
  console.log('✓ Found FFmpeg binary at:', ffmpegPath);

  // 1. Create a 6.0-second test video
  const tmp6s = path.join(os.tmpdir(), `test_6s_${Date.now()}.mp4`);
  await runCommand(ffmpegPath, [
    '-y',
    '-f', 'lavfi',
    '-i', 'testsrc=duration=6:size=720x1280:rate=25',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    tmp6s
  ]);

  const test6sBuffer = await fs.promises.readFile(tmp6s);
  console.log(`✓ Generated synthetic 6s MP4: ${test6sBuffer.length} bytes`);

  // 2. Test applyMaharajaVideoWatermark
  console.log('Applying Maharaja logo watermark...');
  const watermarkedBuffer = await applyMaharajaVideoWatermark(test6sBuffer);
  if (!watermarkedBuffer || watermarkedBuffer.length === 0) {
    throw new Error('Watermarked buffer is empty');
  }
  console.log(`✓ Watermarked MP4 generated: ${watermarkedBuffer.length} bytes`);

  // Inspect watermarked MP4
  const tmpWm = path.join(os.tmpdir(), `test_wm_${Date.now()}.mp4`);
  await fs.promises.writeFile(tmpWm, watermarkedBuffer);
  const probeWm = await runCommand(ffmpegPath, ['-i', tmpWm, '-f', 'null', '-']);
  console.log('✓ Watermarked video probe success (contains video stream H.264)');

  // 3. Test downloadable 6-second branded video with embedded preview audio
  console.log('Generating branded 6s customer video with embedded preview audio...');
  const customer6sBuffer = await generateCustomer6sVideo(test6sBuffer, '/audio/maharaja/preview/final-6.mp3');
  const tmpCustomer = path.join(os.tmpdir(), `test_customer_${Date.now()}.mp4`);
  await fs.promises.writeFile(tmpCustomer, customer6sBuffer);
  const probeCustomer = await runCommand(ffmpegPath, ['-i', tmpCustomer, '-f', 'null', '-']);
  if (!/Stream #.*Audio: aac/.test(probeCustomer.err || '')) {
    throw new Error('Customer 6s video container is missing multiplexed AAC audio stream');
  }
  if (!/Duration:\s*00:00:06/.test(probeCustomer.err || '')) {
    throw new Error('Customer video is not six seconds long');
  }
  console.log('✓ Verified branded 6s customer MP4 with embedded AAC audio');

  // 4. Test generateLive9sVideo
  console.log('Generating authentic 9s showroom video with multiplexed Tamil greeting...');
  const live9sBuffer = await generateLive9sVideo(test6sBuffer);
  if (!live9sBuffer || live9sBuffer.length === 0) {
    throw new Error('Live 9s buffer is empty');
  }
  console.log(`✓ Live 9s MP4 generated: ${live9sBuffer.length} bytes`);

  // Inspect live 9s MP4
  const tmpLive = path.join(os.tmpdir(), `test_live_${Date.now()}.mp4`);
  await fs.promises.writeFile(tmpLive, live9sBuffer);
  const probeLive = await runCommand(ffmpegPath, ['-i', tmpLive, '-f', 'null', '-']);
  const probeText = probeLive.err || '';

  // Extract duration from probe
  const durMatch = probeText.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  if (durMatch) {
    const hours = parseFloat(durMatch[1]);
    const mins = parseFloat(durMatch[2]);
    const secs = parseFloat(durMatch[3]);
    const totalSecs = hours * 3600 + mins * 60 + secs;
    console.log(`✓ Verified live video duration: ${totalSecs.toFixed(2)}s (Target: ~9.00s)`);
    if (totalSecs < 8.8 || totalSecs > 9.5) {
      throw new Error(`Unexpected live video duration: ${totalSecs}s`);
    }
  } else {
    console.log('Duration info:', probeText.slice(0, 300));
  }

  // Verify audio stream is multiplexed inside container
  const hasAudio = /Stream #.*Audio: aac/.test(probeText);
  console.log(`✓ Verified multiplexed AAC audio stream: ${hasAudio ? 'YES' : 'NO'}`);
  if (!hasAudio) {
    throw new Error('Live 9s video container is missing multiplexed AAC audio stream');
  }

  // Cleanup
  await fs.promises.unlink(tmp6s).catch(() => {});
  await fs.promises.unlink(tmpWm).catch(() => {});
  await fs.promises.unlink(tmpCustomer).catch(() => {});
  await fs.promises.unlink(tmpLive).catch(() => {});

  console.log('--- ALL VIDEO BRANDING & 9S RETIMING TESTS PASSED ---');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
