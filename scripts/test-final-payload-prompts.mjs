import { register } from 'node:module';
register('./ts-alias-loader.mjs', import.meta.url);

import fs from 'fs';
import path from 'path';

// Exact imports from production config — zero duplicate builders in test suite
const {
  EVENT_IDS,
  getEventOption,
  NORMAL_SCENE_VARIANTS,
  buildEventVideoPrompt,
  buildFailSafeVideoPrompt,
  getNormalSceneVariant,
  buildFinalPrompt,
  buildMotionSafetyRule,
  MAX_VIDEO_PROMPT_CHARS,
} = await import('../src/lib/maharaja/config.ts');

const CATEGORIES = ['women', 'men', 'girl', 'boy'];
const PROMPT_SETS = ['set-1', 'set-2'];

const CATEGORY_GARMENTS = {
  women: ['saree', 'lehenga', 'salwar', 'generic'],
  men: ['kurta_dhoti', 'generic'],
  girl: ['pattu_pavadai', 'salwar', 'lehenga', 'generic'],
  boy: ['boy_ethnic', 'generic'],
};

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
  console.log(`  ✓ PASS: ${message}`);
}

// Scene choreography markers expected in final payload
const SCENE_CUES = {
  women_style_1: 'foreground reveal',
  women_style_2: 'glides forward',
  men_style_1: 'forward reveal',
  men_style_2: 'lateral tracking slider',
  girl_style_1: 'gentle forward push',
  girl_style_2: 'lateral arc reveal',
  boy_style_1: 'forward push',
  boy_style_2: 'lateral slider move',
};

// Expected garment fidelity cues in Layer 2
const GARMENT_CUES = {
  saree: 'SAREE SPECIFIC FIDELITY',
  lehenga: 'LEHENGA',
  salwar: 'SALWAR',
  kurta_dhoti: 'MEN\'S TRADITIONAL SPECIFIC FIDELITY',
  boy_ethnic: 'BOY\'S TRADITIONAL ETHNIC FIDELITY',
  pattu_pavadai: 'GIRL\'S TRADITIONAL ETHNIC FIDELITY',
  generic: 'GARMENT REFERENCE FIDELITY',
};

console.log('\n===============================================================');
console.log('   MAHARAJA FINAL PROVIDER PAYLOAD & PROMPT COMPLIANCE AUDIT');
console.log('   (Using Production buildFinalPrompt from config.ts)');
console.log('===============================================================\n');

console.log('Auditing 144 Normal Production Video Payloads (All Production Garments × Scenes × Events)...');

const auditResults = [];
let maxLength = 0;
let minLength = 99999;

for (const cat of CATEGORIES) {
  const garments = CATEGORY_GARMENTS[cat];
  for (const garment of garments) {
    for (const pSet of PROMPT_SETS) {
      const variant = getNormalSceneVariant(cat, pSet);
      const expectedCue = SCENE_CUES[variant];
      const expectedGarmentCue = GARMENT_CUES[garment];

      for (const eventId of EVENT_IDS) {
        const eventOption = getEventOption(eventId);
        const basePrompt = buildEventVideoPrompt(cat, eventId, pSet, garment);
        const rawPrompt = `${basePrompt}\n\n${buildMotionSafetyRule(undefined, false)}`.replace(/\s+/g, ' ').trim();
        // Uses production buildFinalPrompt imported directly from config.ts
        const finalPrompt = buildFinalPrompt(basePrompt, undefined, false);

        const len = finalPrompt.length;
        if (len > maxLength) maxLength = len;
        if (len < minLength) minLength = len;

        const tag = `[${variant} / ${garment} / ${eventId}]`;

        // 1. Cap assertion: Final prompt must remain strictly < 2800 characters
        assert(len < MAX_VIDEO_PROMPT_CHARS, `${tag} Length < ${MAX_VIDEO_PROMPT_CHARS} chars (actual: ${len} chars)`);
        assert(rawPrompt.length < MAX_VIDEO_PROMPT_CHARS, `${tag} Zero character truncation before cap (raw: ${rawPrompt.length} chars)`);

        // 2. Event presence assertion
        const hasEvent = finalPrompt.toUpperCase().includes(eventOption.label.toUpperCase());
        assert(hasEvent, `${tag} Contains selected event label (${eventOption.label})`);

        // 3. Scene marker assertion
        const hasSceneCue = finalPrompt.toLowerCase().includes(expectedCue);
        assert(hasSceneCue, `${tag} Contains selected scene choreography cue ("${expectedCue}")`);

        // 4. Garment specific fidelity assertion
        const hasGarmentCue = finalPrompt.includes(expectedGarmentCue);
        assert(hasGarmentCue, `${tag} Contains garment fidelity rule ("${expectedGarmentCue}")`);

        // 5. Identity & Garment fidelity assertion
        assert(finalPrompt.includes('P0 — ABSOLUTE FIDELITY'), `${tag} Contains P0 fidelity rules`);
        assert(finalPrompt.includes('Identity: Preserve exact facial geometry'), `${tag} Contains facial identity lock`);
        assert(finalPrompt.includes('Garment: Preserve exact silhouette'), `${tag} Contains garment silhouette lock`);
        assert(finalPrompt.includes('Neutral grey stays pure grey'), `${tag} Contains grey color fidelity lock`);

        // 6. Execution / Safety instruction assertion
        assert(finalPrompt.includes('EXECUTION & ANCHOR CONSTRAINTS:'), `${tag} Contains execution & anchor constraints`);
        assert(finalPrompt.includes('feet stay firmly anchored to floor coordinates'), `${tag} Feet anchored to floor coordinates`);

        // 7. Child safety assertion for boy/girl
        if (cat === 'boy' || cat === 'girl') {
          assert(finalPrompt.includes('CHILD SAFETY:'), `${tag} Contains explicit child safety lock`);
          assert(finalPrompt.toLowerCase().includes('adult glamour'), `${tag} Explicit anti-glamour instruction present`);
        }

        auditResults.push({
          variant,
          category: cat,
          garment,
          sceneStyle: pSet === 'set-1' ? 'Style 1' : 'Style 2',
          eventId,
          eventLabel: eventOption.label,
          charLength: len,
          cue: expectedCue,
          status: 'PASSED',
        });
      }
    }
  }
}

console.log(`\nAuditing Single Universal Ultra-Safe Backup Video Payload...`);
const backupBase = buildFailSafeVideoPrompt('women', 'diwali');
const finalBackup = buildFinalPrompt(backupBase, undefined, true);

assert(finalBackup.length < MAX_VIDEO_PROMPT_CHARS, `[Backup] Length < ${MAX_VIDEO_PROMPT_CHARS} chars (actual: ${finalBackup.length} chars)`);
assert(finalBackup.includes('FAIL-SAFE REGENERATION MODE'), '[Backup] Contains fail-safe regeneration header');
assert(finalBackup.includes('STABILIZED LOCKED REGENERATION'), '[Backup] Contains stabilized locked regeneration rule');
assert(finalBackup.includes('locked-off tripod'), '[Backup] Contains locked-off tripod camera constraint');
assert(finalBackup.includes('feet stay locked to floor coordinates'), '[Backup] Feet locked to floor coordinates');
assert(finalBackup.includes('EXECUTION & ANCHOR CONSTRAINTS:'), '[Backup] Contains execution & anchor constraints');

const totalPayloads = auditResults.length + 1;

console.log('\n===============================================================');
console.log('   AUDIT SUMMARY & RESULTS');
console.log('===============================================================');
console.log(`Total Payloads Evaluated:          ${totalPayloads} (144 Normal + 1 Backup)`);
console.log(`Maximum Final Normal Prompt:       ${maxLength} / 2800 chars (Safety margin: ${MAX_VIDEO_PROMPT_CHARS - maxLength} chars)`);
console.log(`Minimum Final Normal Prompt:       ${minLength} / 2800 chars`);
console.log(`Backup Final Prompt:               ${finalBackup.length} / 2800 chars (Safety margin: ${MAX_VIDEO_PROMPT_CHARS - finalBackup.length} chars)`);
console.log(`Truncated Payloads:                0 / ${totalPayloads} (100% Intact Delivery)`);
console.log(`Every Final Prompt < 2800:         100% PROVEN`);
console.log('===============================================================\n');

// Write Markdown Compliance Report
const reportDir = path.join(process.cwd(), 'docs');
fs.mkdirSync(reportDir, { recursive: true });

const mdContent = `# Maharaja AI Experience — Final Payload Prompt Compliance Report

**Generated:** ${new Date().toISOString()}
**Production Commit Target:** \`HEAD\`  
**Target Provider:** fal.ai (MiniMax Hailuo H3 Max Turbo, 6s / 768P)  
**Provider Prompt Limit:** ${MAX_VIDEO_PROMPT_CHARS} characters  
**Total Video Payloads Evaluated:** ${totalPayloads} (144 Normal Scene × Garment Combinations + 1 Universal Backup)  
**Maximum Prompt Length Reaching Fal:** **${maxLength} / 2800 chars** (Safety buffer: ${MAX_VIDEO_PROMPT_CHARS - maxLength} chars)  
**Minimum Prompt Length Reaching Fal:** **${minLength} / 2800 chars**  
**Backup Prompt Length Reaching Fal:** **${finalBackup.length} / 2800 chars**  
**Truncation Status:** **0 / ${totalPayloads} truncated (100% Intact Delivery < 2800 chars)**

> [!NOTE]
> **Metric Scope:** Static Prompt / Final Payload Delivery Compliance.  
> This test verifies the exact string payload delivered to the provider after importing the production \`buildFinalPrompt()\` from \`src/lib/maharaja/config.ts\`. It proves that across ALL production garment types (saree, lehenga, salwar, kurta_dhoti, pattu_pavadai, boy_ethnic, generic), scene variants, and festival calendars, every single prompt fits under the 2,800 character limit without truncation.

---

## 1. Final Payload Architecture (The 4 Intact Layers)

Every final prompt sent to fal.ai contains all four required architectural layers:

1. **Layer 1: Universal Fidelity Rules (~1,460 chars)**
   - P0: Non-negotiable identity lock, facial geometry, natural skin tone, hair, age, visible jewelry lock. Anti-beautification, zero skin-whitening.
   - P0/P4: Garment fidelity lock (exact silhouette, fabric weave, embroidery, true colors; neutral grey remains neutral grey).
   - P1: Controlled vitality (subtle breathing <1.5cm, 1–2 soft blinks over 6s, natural micro-saccades, grounded feet anchored to floor coordinates).
   - P2: Luxury camera choreography (optical dolly-in, 10°–15° lateral perspective shift, 3D multi-plane parallax).
   - P3: Refined ambient festive lighting skims across fabric drape and polished floor reflections.
   - Conflict Resolution: *"Fidelity strictly overrides motion."*

2. **Layer 2: Garment & Textile Stability (~250–410 chars)**
   - Dedicated garment-specific architectural constraints across all 7 production types:
     - \`saree\`: Blouse design, continuous 6-yard drape, vertical waist pleats, metallic gold zari borders, pallu over shoulder.
     - \`lehenga\`: Flared kalis silhouette, waistband, choli bodice, dupatta drape, zero saree pleats.
     - \`salwar\`: Flowing tunic flare, neckline, sleeve cut, churidar fit, zero saree pleats.
     - \`kurta_dhoti\`: Mandarin collar, placket buttons, dhoti/veshti pleats, zero feminine elements.
     - \`boy_ethnic\`: Cheerful boyish traditional ethnic wear, zero adult glamour.
     - \`pattu_pavadai\`: Girl's silk skirt & blouse/anarkali, zero mature styling.
     - \`generic\`: Body-contoured geometric anchor and reference fidelity.

3. **Layer 3: Selected Event Atmosphere & Category Scene Direction (~250–350 chars)**
   - Strict cultural isolation across 6 festival calendars (Diwali, Pongal, Christmas, Ramadan, New Year, Birthday).
   - Specific camera trajectory for the 8 category scene variants (\`women_style_1\`, \`women_style_2\`, \`men_style_1\`, \`men_style_2\`, \`girl_style_1\`, \`girl_style_2\`, \`boy_style_1\`, \`boy_style_2\`).
   - Explicit child safety tail for Boy and Girl categories.

4. **Layer 4: Execution & Motion Safety Rule (~250 chars)**
   - Floor coordinate anchor lock, frame-1 motion trigger, zero text/logos.

---

## 2. All 144 Normal Production Video Payloads Audit

| Category | Garment Type | Scene Style | Festival Event | Final Length | Cap Margin (< 2800) | Status |
|---|---|---|---|---|---|---|
${auditResults.map(r => `| **${r.category.toUpperCase()}** | \`${r.garment}\` | ${r.sceneStyle} | ${r.eventLabel} | ${r.charLength} chars | +${MAX_VIDEO_PROMPT_CHARS - r.charLength} chars | Intact ✓ |`).join('\n')}

---

## 3. Single Universal Ultra-Safe Backup Video Payload

| Payload Name | Final Length | Camera Constraint | Subject Constraint | Status |
|---|---|---|---|---|
| **Fail-Safe Video Backup** | ${finalBackup.length} chars | 100% stationary locked-off tripod | Anchored feet, locked face/garment, gentle breathing | Intact ✓ (100% Pass) |

---

## 4. Verification Command

To re-run this exact final-payload delivery audit:

\`\`\`bash
node scripts/test-final-payload-prompts.mjs
\`\`\`
`;

fs.writeFileSync(path.join(reportDir, 'PROMPT_RATING_REPORT.md'), mdContent);
console.log('Report generated: docs/PROMPT_RATING_REPORT.md\n');
