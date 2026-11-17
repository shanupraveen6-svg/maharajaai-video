import assert from 'node:assert/strict';
import fs from 'node:fs';

const tv = fs.readFileSync(new URL('../src/components/TryFocusTvExperience.tsx', import.meta.url), 'utf8');
const check = fs.readFileSync(new URL('../src/app/api/ai/garment-check/route.ts', import.meta.url), 'utf8');

// Header: Home shows the three tabs; past Who only Back and End session (+ Store collection | Own try-on).
assert.match(tv, /const inProcess = mode === 'live-tryon' \? livePhase !== 'who'/, 'In-process is decided per open tab');
assert.match(tv, /\) : inProcess \? \(/, 'In a session the header replaces the tabs');
assert.match(tv, /<span>Store collection<\/span>[\s\S]{0,600}<span>Own try-on<\/span>/, 'Image Try-On offers Store collection and Own try-on in the header');
assert.doesNotMatch(tv, /Start over/, 'Start over is replaced by End session');
assert.doesNotMatch(tv, /Try a garment you brought/, 'The My own outfit card above the categories is gone');
assert.match(tv, /const tab = isTablet \? mode : defaultMode;/, 'End session takes the TV back to Home');

// Own try-on: nothing chosen for the customer; camera in place of the garments; the AI check before Generate.
assert.match(tv, /const \[ownGarmentType, setOwnGarmentType\] = useState\(''\);/, 'No garment type is pre-selected');
assert.match(tv, /aria-label="What are you showing"/);
assert.match(tv, /ownCameraLive \? \(\s*<>\s*<video ref=\{videoRef\}/, 'The garment camera opens inside the screen, not full screen');
assert.match(tv, /\{cameraOpen && cameraTarget !== 'own-garment' && \(/, 'The full-screen camera is only for the customer photo');
assert.match(tv, /fetch\('\/api\/ai\/garment-check'/);
assert.match(tv, /disabled=\{!ownGarmentPhoto \|\| !checkPassed \|\| consentMissing\}/, 'Generate waits for a passed (or unavailable) check');
assert.match(tv, /This looks like/);
assert.match(tv, /Show one garment at a time/);

// The check: one garment, the chosen type; when it cannot run, the customer goes on ('unchecked').
assert.match(check, /verifyMaharajaAccess\(req, body\.accessCode, 'try-on'\)/, 'Only the store screens can use it');
assert.match(check, /else if \(garments > 1\) status = 'multiple'/);
assert.match(check, /else if \(detected && detected\.id !== chosen\.id\) status = 'mismatch'/);
assert.match(check, /catch \(error\) \{[\s\S]*status: 'unchecked'/, 'A failed check never blocks the customer');

// Live Try-On reports its step and Back to the TV header instead of its own Back button.
const live = fs.readFileSync(new URL('../src/components/LucyLiveMirror.tsx', import.meta.url), 'utf8');
assert.match(live, /onBackChange\?\.\(phase === 'camera' && !running \? \(\) => backRef\.current\(\) : null\)/);
assert.doesNotMatch(live, /onClick=\{backToWho\}/, 'No second Back button inside Live Try-On');
console.log('✓ TV header in a session, own try-on on one screen with the AI garment check, Live Back in the header');

// TV fit and readability: screens fill exactly what the fixed header leaves; results and the portrait keep
// the look, QR and End session in one view; the TV type scale has no text under 16 px.
{
  const css = fs.readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /\.tv-fill-screen \{ min-height: calc\(100dvh - var\(--tv-header-h, 240px\) - 64px\); \}/);
  assert.match(css, /\.tv-result-screen \{ height: calc\(100dvh - var\(--tv-header-h, 240px\) - 64px\); \}/);
  assert.match(css, /\.tv-kiosk \.text-sm \{ font-size: 18px;/);
  assert.match(css, /\.tv-kiosk nav button, \.tv-kiosk nav a \{ font-size: 22px; min-height: 72px; \}/);
  assert.match(tv, /setProperty\('--tv-header-h'/, 'The header height is measured');
  assert.equal((tv.match(/tv-result-screen/g) || []).length, 3, 'Try-On generating, results and the AI Video portrait fit one screen');
  assert.doesNotMatch(tv, /min-h-\[calc\(100dvh-2\d0px\)\]/, 'No guessed header heights left');
  // Built-in poster for Maharaja, trimmed from the centre; the upload card shows the size guide.
  const posters = fs.readFileSync(new URL('../src/app/api/maharaja/posters/route.ts', import.meta.url), 'utf8');
  assert.match(posters, /poster-must-try\.jpg/);
  assert.ok(fs.existsSync(new URL('../public/images/maharaja-client/poster-must-try.jpg', import.meta.url)));
  const fill = fs.readFileSync(new URL('../src/components/kiosk/PosterFill.tsx', import.meta.url), 'utf8');
  assert.match(fill, /object-cover object-center/);
  const manager = fs.readFileSync(new URL('../src/components/PosterManager.tsx', import.meta.url), 'utf8');
  assert.match(manager, /Best 1080 × 1920 px, portrait \(9:16\)/);
  console.log('✓ TV screens fit one view, TV type scale, built-in poster with centre crop and size guide');
}
