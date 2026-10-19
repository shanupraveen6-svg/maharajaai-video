# Maharaja AI Experience — Final Payload Prompt Compliance Report

**Generated:** 2026-10-19T06:17:57.214Z
**Production Commit Target:** `HEAD`  
**Target Provider:** fal.ai (MiniMax Hailuo H3 Max Turbo, 6s / 768P)  
**Provider Prompt Limit:** 3500 characters  
**Total Video Payloads Evaluated:** 145 (144 Normal Scene × Garment Combinations + 1 Universal Backup)  
**Maximum Prompt Length Reaching Fal:** **3018 / 3500 chars** (Safety buffer: 482 chars)
**Minimum Prompt Length Reaching Fal:** **2848 / 3500 chars**
**Backup Prompt Length Reaching Fal:** **2158 / 3500 chars**
**Truncation Status:** **0 / 145 truncated (100% intact delivery within cap)**

> [!NOTE]
> **Metric Scope:** Static Prompt / Final Payload Delivery Compliance.  
> This test verifies the exact string payload delivered to the provider after importing the production `buildFinalPrompt()` from `src/lib/maharaja/config.ts`. It proves that across all production garment types, scene variants, and festival calendars, every prompt fits within the 3500-character production cap without truncation.

---

## 1. Final Payload Architecture (The 4 Intact Layers)

Every final prompt sent to fal.ai contains all four required architectural layers:

1. **Layer 1: Universal Fidelity Rules (~1,460 chars)**
   - P0: Non-negotiable identity and garment lock. Preserves exact facial geometry, natural skin tone, hair, age, expression, pose, hands, feet, body proportions, clothing silhouette, fabric weave, collar, neckline, sleeves, drape, colors, patterns, embroidery, and jewelry. Zero reshaping, beautification, recoloring, or clothing morphing.
   - P1: Subject lock. The person and attire are treated as a protected reference layer. Permits at most one natural soft blink and extremely subtle natural chest breathing. Keeps all other subject elements fixed (no head turn, no smile transition, no body repositioning).
   - P2: Universal safety-first camera treatment. One slow, elegant whole-frame optical push/dolly-in that strictly preserves the original viewpoint and framing. Zero orbit, zero lateral perspective shift, and zero unseen surfaces to prevent clothing reconstruction drift.
   - P3: Living festive environment. Animates only existing background light, bokeh, reflections, focus, and restrained particles in empty space. Particles never cross or obscure the subject.
   - Conflict Resolution: *"Fidelity strictly overrides motion."*

2. **Layer 2: Universal Clothing & Textile Stability Lock (~380 chars)**
   - Unified garment-agnostic preservation rule applied across all customer categories:
     - Treats the approved master image as the sole visual authority.
     - Preserves the exact clothing silhouette, fabric weave, pattern, colors, collar, sleeves, and fit from the input image.
     - Strictly forbids clothing changes, dress morphing, outfit swapping, recoloring, added embroidery, or texture alteration.
     - Anchors fabric drape to body contours with zero pattern drift or texture swimming.
   - *Note on Evaluation Matrix:* The 144 normal evaluations represent full matrix coverage across 4 Customer Categories × 2 Scene Styles × 6 Festival Calendars × Garment Resolution paths, validating that regardless of input metadata, every production payload stays within provider budget with the complete safety suffix intact.

3. **Layer 3: Selected Event Atmosphere & Scene Composition (~250–350 chars)**
   - Cultural isolation across 6 festival calendars (Diwali, Pongal, Christmas, Ramadan, New Year, Birthday) with festival-specific ambient lighting, bokeh, and reflection animation.
   - *Architecture Clarification:* The 8 scene variants (`women_style_1/2`, `men_style_1/2`, `girl_style_1/2`, `boy_style_1/2`) apply to **Gemini master-image composition** (governing foreground placement of brass lamps, pillars, arches, urlis, and pedestals), while **H3 video generation** animates that existing composition with one universal safety-first camera push.
   - Explicit child safety tail for Boy and Girl categories.

4. **Layer 4: Execution & Motion Safety Rule (~250 chars)**
   - Lower body and feet anchored to floor coordinates, frame-1 motion trigger, zero text, words, titles, or logos.

---

## 2. All 144 Normal Production Video Payloads Audit

| Category | Garment Type | Scene Style | Festival Event | Final Length | Cap Margin | Status |
|---|---|---|---|---|---|---|
| **WOMEN** | `saree` | Style 1 | Diwali | 2848 chars | +652 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 1 | New Year | 2858 chars | +642 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 1 | Pongal | 2857 chars | +643 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 1 | Christmas | 2854 chars | +646 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 1 | Ramadan | 2855 chars | +645 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 1 | Birthday | 2859 chars | +641 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 2 | Diwali | 2848 chars | +652 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 2 | New Year | 2858 chars | +642 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 2 | Pongal | 2857 chars | +643 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 2 | Christmas | 2854 chars | +646 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 2 | Ramadan | 2855 chars | +645 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 2 | Birthday | 2859 chars | +641 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 1 | Diwali | 2848 chars | +652 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 1 | New Year | 2858 chars | +642 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 1 | Pongal | 2857 chars | +643 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 1 | Christmas | 2854 chars | +646 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 1 | Ramadan | 2855 chars | +645 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 1 | Birthday | 2859 chars | +641 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 2 | Diwali | 2848 chars | +652 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 2 | New Year | 2858 chars | +642 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 2 | Pongal | 2857 chars | +643 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 2 | Christmas | 2854 chars | +646 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 2 | Ramadan | 2855 chars | +645 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 2 | Birthday | 2859 chars | +641 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 1 | Diwali | 2848 chars | +652 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 1 | New Year | 2858 chars | +642 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 1 | Pongal | 2857 chars | +643 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 1 | Christmas | 2854 chars | +646 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 1 | Ramadan | 2855 chars | +645 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 1 | Birthday | 2859 chars | +641 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 2 | Diwali | 2848 chars | +652 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 2 | New Year | 2858 chars | +642 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 2 | Pongal | 2857 chars | +643 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 2 | Christmas | 2854 chars | +646 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 2 | Ramadan | 2855 chars | +645 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 2 | Birthday | 2859 chars | +641 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 1 | Diwali | 2848 chars | +652 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 1 | New Year | 2858 chars | +642 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 1 | Pongal | 2857 chars | +643 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 1 | Christmas | 2854 chars | +646 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 1 | Ramadan | 2855 chars | +645 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 1 | Birthday | 2859 chars | +641 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 2 | Diwali | 2848 chars | +652 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 2 | New Year | 2858 chars | +642 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 2 | Pongal | 2857 chars | +643 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 2 | Christmas | 2854 chars | +646 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 2 | Ramadan | 2855 chars | +645 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 2 | Birthday | 2859 chars | +641 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 1 | Diwali | 2848 chars | +652 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 1 | New Year | 2858 chars | +642 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 1 | Pongal | 2857 chars | +643 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 1 | Christmas | 2854 chars | +646 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 1 | Ramadan | 2855 chars | +645 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 1 | Birthday | 2859 chars | +641 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 2 | Diwali | 2848 chars | +652 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 2 | New Year | 2858 chars | +642 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 2 | Pongal | 2857 chars | +643 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 2 | Christmas | 2854 chars | +646 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 2 | Ramadan | 2855 chars | +645 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 2 | Birthday | 2859 chars | +641 chars | Intact ✓ |
| **MEN** | `generic` | Style 1 | Diwali | 2848 chars | +652 chars | Intact ✓ |
| **MEN** | `generic` | Style 1 | New Year | 2858 chars | +642 chars | Intact ✓ |
| **MEN** | `generic` | Style 1 | Pongal | 2857 chars | +643 chars | Intact ✓ |
| **MEN** | `generic` | Style 1 | Christmas | 2854 chars | +646 chars | Intact ✓ |
| **MEN** | `generic` | Style 1 | Ramadan | 2855 chars | +645 chars | Intact ✓ |
| **MEN** | `generic` | Style 1 | Birthday | 2859 chars | +641 chars | Intact ✓ |
| **MEN** | `generic` | Style 2 | Diwali | 2848 chars | +652 chars | Intact ✓ |
| **MEN** | `generic` | Style 2 | New Year | 2858 chars | +642 chars | Intact ✓ |
| **MEN** | `generic` | Style 2 | Pongal | 2857 chars | +643 chars | Intact ✓ |
| **MEN** | `generic` | Style 2 | Christmas | 2854 chars | +646 chars | Intact ✓ |
| **MEN** | `generic` | Style 2 | Ramadan | 2855 chars | +645 chars | Intact ✓ |
| **MEN** | `generic` | Style 2 | Birthday | 2859 chars | +641 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 1 | Diwali | 3007 chars | +493 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 1 | New Year | 3017 chars | +483 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 1 | Pongal | 3016 chars | +484 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 1 | Christmas | 3013 chars | +487 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 1 | Ramadan | 3014 chars | +486 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 1 | Birthday | 3018 chars | +482 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 2 | Diwali | 3007 chars | +493 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 2 | New Year | 3017 chars | +483 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 2 | Pongal | 3016 chars | +484 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 2 | Christmas | 3013 chars | +487 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 2 | Ramadan | 3014 chars | +486 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 2 | Birthday | 3018 chars | +482 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 1 | Diwali | 3007 chars | +493 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 1 | New Year | 3017 chars | +483 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 1 | Pongal | 3016 chars | +484 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 1 | Christmas | 3013 chars | +487 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 1 | Ramadan | 3014 chars | +486 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 1 | Birthday | 3018 chars | +482 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 2 | Diwali | 3007 chars | +493 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 2 | New Year | 3017 chars | +483 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 2 | Pongal | 3016 chars | +484 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 2 | Christmas | 3013 chars | +487 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 2 | Ramadan | 3014 chars | +486 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 2 | Birthday | 3018 chars | +482 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 1 | Diwali | 3007 chars | +493 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 1 | New Year | 3017 chars | +483 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 1 | Pongal | 3016 chars | +484 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 1 | Christmas | 3013 chars | +487 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 1 | Ramadan | 3014 chars | +486 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 1 | Birthday | 3018 chars | +482 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 2 | Diwali | 3007 chars | +493 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 2 | New Year | 3017 chars | +483 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 2 | Pongal | 3016 chars | +484 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 2 | Christmas | 3013 chars | +487 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 2 | Ramadan | 3014 chars | +486 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 2 | Birthday | 3018 chars | +482 chars | Intact ✓ |
| **GIRL** | `generic` | Style 1 | Diwali | 3007 chars | +493 chars | Intact ✓ |
| **GIRL** | `generic` | Style 1 | New Year | 3017 chars | +483 chars | Intact ✓ |
| **GIRL** | `generic` | Style 1 | Pongal | 3016 chars | +484 chars | Intact ✓ |
| **GIRL** | `generic` | Style 1 | Christmas | 3013 chars | +487 chars | Intact ✓ |
| **GIRL** | `generic` | Style 1 | Ramadan | 3014 chars | +486 chars | Intact ✓ |
| **GIRL** | `generic` | Style 1 | Birthday | 3018 chars | +482 chars | Intact ✓ |
| **GIRL** | `generic` | Style 2 | Diwali | 3007 chars | +493 chars | Intact ✓ |
| **GIRL** | `generic` | Style 2 | New Year | 3017 chars | +483 chars | Intact ✓ |
| **GIRL** | `generic` | Style 2 | Pongal | 3016 chars | +484 chars | Intact ✓ |
| **GIRL** | `generic` | Style 2 | Christmas | 3013 chars | +487 chars | Intact ✓ |
| **GIRL** | `generic` | Style 2 | Ramadan | 3014 chars | +486 chars | Intact ✓ |
| **GIRL** | `generic` | Style 2 | Birthday | 3018 chars | +482 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 1 | Diwali | 3007 chars | +493 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 1 | New Year | 3017 chars | +483 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 1 | Pongal | 3016 chars | +484 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 1 | Christmas | 3013 chars | +487 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 1 | Ramadan | 3014 chars | +486 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 1 | Birthday | 3018 chars | +482 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 2 | Diwali | 3007 chars | +493 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 2 | New Year | 3017 chars | +483 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 2 | Pongal | 3016 chars | +484 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 2 | Christmas | 3013 chars | +487 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 2 | Ramadan | 3014 chars | +486 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 2 | Birthday | 3018 chars | +482 chars | Intact ✓ |
| **BOY** | `generic` | Style 1 | Diwali | 3007 chars | +493 chars | Intact ✓ |
| **BOY** | `generic` | Style 1 | New Year | 3017 chars | +483 chars | Intact ✓ |
| **BOY** | `generic` | Style 1 | Pongal | 3016 chars | +484 chars | Intact ✓ |
| **BOY** | `generic` | Style 1 | Christmas | 3013 chars | +487 chars | Intact ✓ |
| **BOY** | `generic` | Style 1 | Ramadan | 3014 chars | +486 chars | Intact ✓ |
| **BOY** | `generic` | Style 1 | Birthday | 3018 chars | +482 chars | Intact ✓ |
| **BOY** | `generic` | Style 2 | Diwali | 3007 chars | +493 chars | Intact ✓ |
| **BOY** | `generic` | Style 2 | New Year | 3017 chars | +483 chars | Intact ✓ |
| **BOY** | `generic` | Style 2 | Pongal | 3016 chars | +484 chars | Intact ✓ |
| **BOY** | `generic` | Style 2 | Christmas | 3013 chars | +487 chars | Intact ✓ |
| **BOY** | `generic` | Style 2 | Ramadan | 3014 chars | +486 chars | Intact ✓ |
| **BOY** | `generic` | Style 2 | Birthday | 3018 chars | +482 chars | Intact ✓ |

---

## 3. Single Universal Ultra-Safe Backup Video Payload

| Payload Name | Final Length | Camera Constraint | Subject Constraint | Status |
|---|---|---|---|---|
| **Fail-Safe Video Backup** | 2158 chars | 100% stationary locked-off tripod | Anchored feet, locked face/garment, gentle breathing | Intact ✓ (100% Pass) |

---

## 4. Verification Command

To re-run this exact final-payload delivery audit:

```bash
node scripts/test-final-payload-prompts.mjs
```
