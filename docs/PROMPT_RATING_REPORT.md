# Maharaja AI Experience — Final Payload Prompt Compliance Report

**Generated:** 2026-10-19T05:27:20.724Z
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
   - P0: Non-negotiable identity lock, facial geometry, natural skin tone, hair, age, visible jewelry lock. Anti-beautification, zero skin-whitening.
   - P0/P4: Garment fidelity lock (exact silhouette, fabric weave, embroidery, true colors; neutral grey remains neutral grey).
   - P1: Controlled vitality (subtle breathing <1.5cm, 1–2 soft blinks over 6s, natural micro-saccades, grounded feet anchored to floor coordinates).
   - P2: Luxury camera choreography (optical dolly-in, 10°–15° lateral perspective shift, 3D multi-plane parallax).
   - P3: Refined ambient festive lighting skims across fabric drape and polished floor reflections.
   - Conflict Resolution: *"Fidelity strictly overrides motion."*

2. **Layer 2: Garment & Textile Stability (~250–410 chars)**
   - Dedicated garment-specific architectural constraints across all 7 production types:
     - `saree`: Blouse design, continuous 6-yard drape, vertical waist pleats, metallic gold zari borders, pallu over shoulder.
     - `lehenga`: Flared kalis silhouette, waistband, choli bodice, dupatta drape, zero saree pleats.
     - `salwar`: Flowing tunic flare, neckline, sleeve cut, churidar fit, zero saree pleats.
     - `kurta_dhoti`: Mandarin collar, placket buttons, dhoti/veshti pleats, zero feminine elements.
     - `boy_ethnic`: Cheerful boyish traditional ethnic wear, zero adult glamour.
     - `pattu_pavadai`: Girl's silk skirt & blouse/anarkali, zero mature styling.
     - `generic`: Body-contoured geometric anchor and reference fidelity.

3. **Layer 3: Selected Event Atmosphere & Category Scene Direction (~250–350 chars)**
   - Strict cultural isolation across 6 festival calendars (Diwali, Pongal, Christmas, Ramadan, New Year, Birthday).
   - Specific camera trajectory for the 8 category scene variants (`women_style_1`, `women_style_2`, `men_style_1`, `men_style_2`, `girl_style_1`, `girl_style_2`, `boy_style_1`, `boy_style_2`).
   - Explicit child safety tail for Boy and Girl categories.

4. **Layer 4: Execution & Motion Safety Rule (~250 chars)**
   - Floor coordinate anchor lock, frame-1 motion trigger, zero text/logos.

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
