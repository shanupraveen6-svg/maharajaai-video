# Maharaja AI Experience — Final Payload Prompt Compliance Report

**Generated:** 2026-10-18T07:24:20.158Z  
**Production Commit Target:** `HEAD`  
**Target Provider:** fal.ai (MiniMax Hailuo H3 Max Turbo, 6s / 768P)  
**Provider Prompt Limit:** 2800 characters  
**Total Video Payloads Evaluated:** 49 (48 Normal Scene Combinations + 1 Universal Backup)  
**Maximum Prompt Length Reaching Fal:** **2676 / 2800 chars** (Safety buffer: 124 chars)  
**Truncation Status:** **0 / 49 truncated (100% Intact Delivery)**

> [!NOTE]
> **Metric Scope:** Static Prompt / Final Payload Delivery Compliance.  
> This test verifies the exact string payload delivered to the provider after `buildFinalPrompt()` and truncation constraints. It guarantees all required prompt layers survive without being clipped. This is a deterministic prompt-delivery test, not a neural model output generation benchmark (e.g. face embedding similarity or fabric $\Delta E$).

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

2. **Layer 2: Garment & Textile Stability (~250–350 chars)**
   - Saree / Lehenga / Salwar / Kurta-Dhoti / Boy Ethnic / Pattu Pavadai specific architectural constraints.

3. **Layer 3: Selected Event Atmosphere & Category Scene Direction (~250–350 chars)**
   - Strict cultural isolation across 6 festival calendars (Diwali, Pongal, Christmas, Ramadan, New Year, Birthday).
   - Specific camera trajectory for the 8 category scene variants (`women_style_1`, `women_style_2`, `men_style_1`, `men_style_2`, `girl_style_1`, `girl_style_2`, `boy_style_1`, `boy_style_2`).
   - Explicit child safety tail for Boy and Girl categories.

4. **Layer 4: Execution & Motion Safety Rule (~250 chars)**
   - Floor coordinate anchor lock, frame-1 motion trigger, zero text/logos.

---

## 2. All 48 Normal Production Video Payloads Audit

| Category | Scene Style | Festival Event | Scene Trajectory Cue | Final Length | Cap Status | Truncation |
|---|---|---|---|---|---|---|
| **WOMEN** | Style 1 | Diwali | "foreground reveal" | 2665 chars | <= 2800 ✓ | None (Intact) |
| **WOMEN** | Style 1 | New Year | "foreground reveal" | 2577 chars | <= 2800 ✓ | None (Intact) |
| **WOMEN** | Style 1 | Pongal | "foreground reveal" | 2582 chars | <= 2800 ✓ | None (Intact) |
| **WOMEN** | Style 1 | Christmas | "foreground reveal" | 2590 chars | <= 2800 ✓ | None (Intact) |
| **WOMEN** | Style 1 | Ramadan | "foreground reveal" | 2563 chars | <= 2800 ✓ | None (Intact) |
| **WOMEN** | Style 1 | Birthday | "foreground reveal" | 2557 chars | <= 2800 ✓ | None (Intact) |
| **WOMEN** | Style 2 | Diwali | "glides forward" | 2615 chars | <= 2800 ✓ | None (Intact) |
| **WOMEN** | Style 2 | New Year | "glides forward" | 2512 chars | <= 2800 ✓ | None (Intact) |
| **WOMEN** | Style 2 | Pongal | "glides forward" | 2542 chars | <= 2800 ✓ | None (Intact) |
| **WOMEN** | Style 2 | Christmas | "glides forward" | 2519 chars | <= 2800 ✓ | None (Intact) |
| **WOMEN** | Style 2 | Ramadan | "glides forward" | 2504 chars | <= 2800 ✓ | None (Intact) |
| **WOMEN** | Style 2 | Birthday | "glides forward" | 2520 chars | <= 2800 ✓ | None (Intact) |
| **MEN** | Style 1 | Diwali | "forward reveal" | 2676 chars | <= 2800 ✓ | None (Intact) |
| **MEN** | Style 1 | New Year | "forward reveal" | 2623 chars | <= 2800 ✓ | None (Intact) |
| **MEN** | Style 1 | Pongal | "forward reveal" | 2637 chars | <= 2800 ✓ | None (Intact) |
| **MEN** | Style 1 | Christmas | "forward reveal" | 2616 chars | <= 2800 ✓ | None (Intact) |
| **MEN** | Style 1 | Ramadan | "forward reveal" | 2622 chars | <= 2800 ✓ | None (Intact) |
| **MEN** | Style 1 | Birthday | "forward reveal" | 2618 chars | <= 2800 ✓ | None (Intact) |
| **MEN** | Style 2 | Diwali | "lateral tracking slider" | 2671 chars | <= 2800 ✓ | None (Intact) |
| **MEN** | Style 2 | New Year | "lateral tracking slider" | 2634 chars | <= 2800 ✓ | None (Intact) |
| **MEN** | Style 2 | Pongal | "lateral tracking slider" | 2634 chars | <= 2800 ✓ | None (Intact) |
| **MEN** | Style 2 | Christmas | "lateral tracking slider" | 2639 chars | <= 2800 ✓ | None (Intact) |
| **MEN** | Style 2 | Ramadan | "lateral tracking slider" | 2590 chars | <= 2800 ✓ | None (Intact) |
| **MEN** | Style 2 | Birthday | "lateral tracking slider" | 2613 chars | <= 2800 ✓ | None (Intact) |
| **GIRL** | Style 1 | Diwali | "gentle forward push" | 2667 chars | <= 2800 ✓ | None (Intact) |
| **GIRL** | Style 1 | New Year | "gentle forward push" | 2613 chars | <= 2800 ✓ | None (Intact) |
| **GIRL** | Style 1 | Pongal | "gentle forward push" | 2626 chars | <= 2800 ✓ | None (Intact) |
| **GIRL** | Style 1 | Christmas | "gentle forward push" | 2615 chars | <= 2800 ✓ | None (Intact) |
| **GIRL** | Style 1 | Ramadan | "gentle forward push" | 2610 chars | <= 2800 ✓ | None (Intact) |
| **GIRL** | Style 1 | Birthday | "gentle forward push" | 2603 chars | <= 2800 ✓ | None (Intact) |
| **GIRL** | Style 2 | Diwali | "lateral arc reveal" | 2666 chars | <= 2800 ✓ | None (Intact) |
| **GIRL** | Style 2 | New Year | "lateral arc reveal" | 2586 chars | <= 2800 ✓ | None (Intact) |
| **GIRL** | Style 2 | Pongal | "lateral arc reveal" | 2625 chars | <= 2800 ✓ | None (Intact) |
| **GIRL** | Style 2 | Christmas | "lateral arc reveal" | 2592 chars | <= 2800 ✓ | None (Intact) |
| **GIRL** | Style 2 | Ramadan | "lateral arc reveal" | 2588 chars | <= 2800 ✓ | None (Intact) |
| **GIRL** | Style 2 | Birthday | "lateral arc reveal" | 2598 chars | <= 2800 ✓ | None (Intact) |
| **BOY** | Style 1 | Diwali | "forward push" | 2582 chars | <= 2800 ✓ | None (Intact) |
| **BOY** | Style 1 | New Year | "forward push" | 2559 chars | <= 2800 ✓ | None (Intact) |
| **BOY** | Style 1 | Pongal | "forward push" | 2562 chars | <= 2800 ✓ | None (Intact) |
| **BOY** | Style 1 | Christmas | "forward push" | 2537 chars | <= 2800 ✓ | None (Intact) |
| **BOY** | Style 1 | Ramadan | "forward push" | 2531 chars | <= 2800 ✓ | None (Intact) |
| **BOY** | Style 1 | Birthday | "forward push" | 2542 chars | <= 2800 ✓ | None (Intact) |
| **BOY** | Style 2 | Diwali | "lateral slider move" | 2571 chars | <= 2800 ✓ | None (Intact) |
| **BOY** | Style 2 | New Year | "lateral slider move" | 2523 chars | <= 2800 ✓ | None (Intact) |
| **BOY** | Style 2 | Pongal | "lateral slider move" | 2566 chars | <= 2800 ✓ | None (Intact) |
| **BOY** | Style 2 | Christmas | "lateral slider move" | 2534 chars | <= 2800 ✓ | None (Intact) |
| **BOY** | Style 2 | Ramadan | "lateral slider move" | 2529 chars | <= 2800 ✓ | None (Intact) |
| **BOY** | Style 2 | Birthday | "lateral slider move" | 2535 chars | <= 2800 ✓ | None (Intact) |

---

## 3. Single Universal Ultra-Safe Backup Video Payload

| Payload Name | Final Length | Camera Constraint | Subject Constraint | Status |
|---|---|---|---|---|
| **Fail-Safe Video Backup** | 2170 chars | 100% stationary locked-off tripod | Anchored feet, locked face/garment, gentle breathing | Intact ✓ (100% Pass) |

---

## 4. Verification Command

To re-run this exact final-payload delivery audit:

```bash
node scripts/test-final-payload-prompts.mjs
```
