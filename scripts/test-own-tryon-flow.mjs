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
