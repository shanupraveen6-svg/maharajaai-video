import assert from 'node:assert/strict';
import fs from 'node:fs';

const tv = fs.readFileSync(new URL('../src/components/TryFocusTvExperience.tsx', import.meta.url), 'utf8');
const master = fs.readFileSync(new URL('../src/app/api/ai/master-image/route.ts', import.meta.url), 'utf8');
const phoneUpload = fs.readFileSync(new URL('../src/components/PhonePhotoUpload.tsx', import.meta.url), 'utf8');
const photoTransfer = fs.readFileSync(new URL('../src/app/api/tv/photo-transfer/[token]/route.ts', import.meta.url), 'utf8');

// Header: Home shows the three tabs; past Who only Back and End session (+ Store collection | Own try-on).
assert.match(tv, /const inProcess = mode === 'live-tryon' \? livePhase !== 'who'/, 'In-process is decided per open tab');
assert.match(tv, /\) : inProcess \? \(/, 'In a session the header replaces the tabs');
assert.match(tv, /<span>Store collection<\/span>[\s\S]{0,600}<span>My own outfit<\/span>/, 'Image Try-On offers Store collection and Own try-on in the header');
assert.doesNotMatch(tv, /Start over/, 'Start over is replaced by End session');
assert.doesNotMatch(tv, /Try a garment you brought/, 'The My own outfit card above the categories is gone');
assert.match(tv, /const tab = mode;/, 'End session starts the same tab again');

// Own try-on: nothing chosen for the customer; camera in place of the garments; NO AI check blocking own-garment upload.
assert.match(tv, /const \[ownGarmentType, setOwnGarmentType\] = useState\(''\);/, 'No garment type is pre-selected');
assert.match(tv, /aria-label="What are you showing"/);
assert.match(tv, /ownCameraLive \? \(\s*<>\s*<video ref=\{videoRef\}/, 'The garment camera opens inside the screen, not full screen');
assert.match(tv, /\{cameraOpen && cameraTarget !== 'own-garment' && \(/, 'The full-screen camera is only for the customer photo');
assert.doesNotMatch(tv, /fetch\('\/api\/ai\/garment-check'/, 'Own garment upload does not invoke AI garment-check');
assert.match(tv, /disabled=\{!ownGarmentPhoto \|\| !ownGarmentType \|\| consentMissing\}/, 'Generate enables once garment photo and type are chosen');
assert.match(master, /if \(service === 'try-on' && genlookGarment && !ownOutfitTryOn\)/, 'Own-outfit try-on skips prepareGenlookPieces and ONE_GARMENT rejection');
assert.doesNotMatch(master, /code: 'ONE_GARMENT'/, 'Own-outfit try-on never blocks held garments as ONE_GARMENT');

// Phone QR upload: Gemini Scanner 0 posture check runs on phone upload with Re-upload + primary Submit actions.
assert.match(photoTransfer, /async function analyzeCustomerPosture/, 'Phone QR upload runs Gemini posture analysis');
assert.match(photoTransfer, /posture.*standing.*sitting/, 'Phone QR posture check validates standing vs sitting posture');
assert.match(phoneUpload, /<span>Re-upload<\/span>/, 'Phone QR upload shows Re-upload button');
assert.match(phoneUpload, /<span>\{scanning \? 'Scanning…' : busy \? 'Submitting…' : 'Submit'\}<\/span>/, 'Phone QR upload shows primary Submit button');

// Live Try-On reports its step and Back to the TV header instead of its own Back button.
const live = fs.readFileSync(new URL('../src/components/LucyLiveMirror.tsx', import.meta.url), 'utf8');
assert.match(live, /onBackChange\?\.\(phase === 'camera' && !running \? \(\) => backRef\.current\(\) : null\)/);
assert.doesNotMatch(live, /onClick=\{backToWho\}/, 'No second Back button inside Live Try-On');
console.log('✓ TV header in a session, own try-on without AI garment check, phone QR posture check, Live Back in the header');

// TV fit and readability: screens fill exactly what the fixed header leaves; results and the portrait keep
// the look, QR and End session in one view; the TV type scale has no text under 16 px.
{
  const css = fs.readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /\.tv-fill-screen \{ min-height: calc\(100dvh - var\(--tv-header-h, 240px\) - 64px\); \}/);
  assert.match(css, /\.tv-result-screen \{ height: calc\(100dvh - var\(--tv-header-h, 240px\) - 64px\); \}/);
  assert.match(css, /\.tv-kiosk \.text-sm \{ font-size: 18px;/);
  assert.match(css, /\.tv-kiosk nav button, \.tv-kiosk nav a \{ font-size: 22px; min-height: 72px; \}/);
  assert.match(tv, /setProperty\('--tv-header-h'/, 'The header height is measured');
  assert.equal((tv.match(/tv-result-screen/g) || []).length, 2, 'Try-On results and the AI Video portrait fit one screen');
  // The wait (Try-On looks and the AI Video portrait) is one shared full-screen component.
  const waitScreen = fs.readFileSync(new URL('../src/components/kiosk/GeneratingPreview.tsx', import.meta.url), 'utf8');
  assert.match(waitScreen, /tv-result-screen/, 'The wait screen fits one screen');
  assert.equal((tv.match(/<GeneratingPreview/g) || []).length, 2, 'Try-On and the AI Video portrait share the wait screen');
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
