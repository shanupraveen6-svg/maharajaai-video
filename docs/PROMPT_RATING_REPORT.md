# Maharaja AI Experience — Final Payload Prompt Compliance Report

**Generated:** 2026-10-18T09:50:01.068Z
**Production Commit Target:** `HEAD`  
**Target Provider:** fal.ai (MiniMax Hailuo H3 Max Turbo, 6s / 768P)  
**Provider Prompt Limit:** 2800 characters  
**Total Video Payloads Evaluated:** 145 (144 Normal Scene × Garment Combinations + 1 Universal Backup)  
**Maximum Prompt Length Reaching Fal:** **2683 / 2800 chars** (Safety buffer: 117 chars)  
**Minimum Prompt Length Reaching Fal:** **2269 / 2800 chars**  
**Backup Prompt Length Reaching Fal:** **2158 / 2800 chars**  
**Truncation Status:** **0 / 145 truncated (100% Intact Delivery < 2800 chars)**

> [!NOTE]
> **Metric Scope:** Static Prompt / Final Payload Delivery Compliance.  
> This test verifies the exact string payload delivered to the provider after importing the production `buildFinalPrompt()` from `src/lib/maharaja/config.ts`. It proves that across ALL production garment types (saree, lehenga, salwar, kurta_dhoti, pattu_pavadai, boy_ethnic, generic), scene variants, and festival calendars, every single prompt fits under the 2,800 character limit without truncation.

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

| Category | Garment Type | Scene Style | Festival Event | Final Length | Cap Margin (< 2800) | Status |
|---|---|---|---|---|---|---|
| **WOMEN** | `saree` | Style 1 | Diwali | 2509 chars | +291 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 1 | New Year | 2421 chars | +379 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 1 | Pongal | 2426 chars | +374 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 1 | Christmas | 2434 chars | +366 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 1 | Ramadan | 2407 chars | +393 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 1 | Birthday | 2401 chars | +399 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 2 | Diwali | 2459 chars | +341 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 2 | New Year | 2356 chars | +444 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 2 | Pongal | 2386 chars | +414 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 2 | Christmas | 2363 chars | +437 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 2 | Ramadan | 2348 chars | +452 chars | Intact ✓ |
| **WOMEN** | `saree` | Style 2 | Birthday | 2364 chars | +436 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 1 | Diwali | 2597 chars | +203 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 1 | New Year | 2509 chars | +291 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 1 | Pongal | 2514 chars | +286 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 1 | Christmas | 2522 chars | +278 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 1 | Ramadan | 2495 chars | +305 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 1 | Birthday | 2489 chars | +311 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 2 | Diwali | 2547 chars | +253 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 2 | New Year | 2444 chars | +356 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 2 | Pongal | 2474 chars | +326 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 2 | Christmas | 2451 chars | +349 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 2 | Ramadan | 2436 chars | +364 chars | Intact ✓ |
| **WOMEN** | `lehenga` | Style 2 | Birthday | 2452 chars | +348 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 1 | Diwali | 2511 chars | +289 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 1 | New Year | 2423 chars | +377 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 1 | Pongal | 2428 chars | +372 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 1 | Christmas | 2436 chars | +364 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 1 | Ramadan | 2409 chars | +391 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 1 | Birthday | 2403 chars | +397 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 2 | Diwali | 2461 chars | +339 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 2 | New Year | 2358 chars | +442 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 2 | Pongal | 2388 chars | +412 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 2 | Christmas | 2365 chars | +435 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 2 | Ramadan | 2350 chars | +450 chars | Intact ✓ |
| **WOMEN** | `salwar` | Style 2 | Birthday | 2366 chars | +434 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 1 | Diwali | 2430 chars | +370 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 1 | New Year | 2342 chars | +458 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 1 | Pongal | 2347 chars | +453 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 1 | Christmas | 2355 chars | +445 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 1 | Ramadan | 2328 chars | +472 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 1 | Birthday | 2322 chars | +478 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 2 | Diwali | 2380 chars | +420 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 2 | New Year | 2277 chars | +523 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 2 | Pongal | 2307 chars | +493 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 2 | Christmas | 2284 chars | +516 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 2 | Ramadan | 2269 chars | +531 chars | Intact ✓ |
| **WOMEN** | `generic` | Style 2 | Birthday | 2285 chars | +515 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 1 | Diwali | 2585 chars | +215 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 1 | New Year | 2532 chars | +268 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 1 | Pongal | 2546 chars | +254 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 1 | Christmas | 2525 chars | +275 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 1 | Ramadan | 2531 chars | +269 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 1 | Birthday | 2527 chars | +273 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 2 | Diwali | 2580 chars | +220 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 2 | New Year | 2543 chars | +257 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 2 | Pongal | 2543 chars | +257 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 2 | Christmas | 2548 chars | +252 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 2 | Ramadan | 2499 chars | +301 chars | Intact ✓ |
| **MEN** | `kurta_dhoti` | Style 2 | Birthday | 2522 chars | +278 chars | Intact ✓ |
| **MEN** | `generic` | Style 1 | Diwali | 2361 chars | +439 chars | Intact ✓ |
| **MEN** | `generic` | Style 1 | New Year | 2308 chars | +492 chars | Intact ✓ |
| **MEN** | `generic` | Style 1 | Pongal | 2322 chars | +478 chars | Intact ✓ |
| **MEN** | `generic` | Style 1 | Christmas | 2301 chars | +499 chars | Intact ✓ |
| **MEN** | `generic` | Style 1 | Ramadan | 2307 chars | +493 chars | Intact ✓ |
| **MEN** | `generic` | Style 1 | Birthday | 2303 chars | +497 chars | Intact ✓ |
| **MEN** | `generic` | Style 2 | Diwali | 2356 chars | +444 chars | Intact ✓ |
| **MEN** | `generic` | Style 2 | New Year | 2319 chars | +481 chars | Intact ✓ |
| **MEN** | `generic` | Style 2 | Pongal | 2319 chars | +481 chars | Intact ✓ |
| **MEN** | `generic` | Style 2 | Christmas | 2324 chars | +476 chars | Intact ✓ |
| **MEN** | `generic` | Style 2 | Ramadan | 2275 chars | +525 chars | Intact ✓ |
| **MEN** | `generic` | Style 2 | Birthday | 2298 chars | +502 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 1 | Diwali | 2576 chars | +224 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 1 | New Year | 2522 chars | +278 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 1 | Pongal | 2535 chars | +265 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 1 | Christmas | 2524 chars | +276 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 1 | Ramadan | 2519 chars | +281 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 1 | Birthday | 2512 chars | +288 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 2 | Diwali | 2575 chars | +225 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 2 | New Year | 2495 chars | +305 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 2 | Pongal | 2534 chars | +266 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 2 | Christmas | 2501 chars | +299 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 2 | Ramadan | 2497 chars | +303 chars | Intact ✓ |
| **GIRL** | `pattu_pavadai` | Style 2 | Birthday | 2507 chars | +293 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 1 | Diwali | 2597 chars | +203 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 1 | New Year | 2543 chars | +257 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 1 | Pongal | 2556 chars | +244 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 1 | Christmas | 2545 chars | +255 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 1 | Ramadan | 2540 chars | +260 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 1 | Birthday | 2533 chars | +267 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 2 | Diwali | 2596 chars | +204 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 2 | New Year | 2516 chars | +284 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 2 | Pongal | 2555 chars | +245 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 2 | Christmas | 2522 chars | +278 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 2 | Ramadan | 2518 chars | +282 chars | Intact ✓ |
| **GIRL** | `salwar` | Style 2 | Birthday | 2528 chars | +272 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 1 | Diwali | 2683 chars | +117 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 1 | New Year | 2629 chars | +171 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 1 | Pongal | 2642 chars | +158 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 1 | Christmas | 2631 chars | +169 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 1 | Ramadan | 2626 chars | +174 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 1 | Birthday | 2619 chars | +181 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 2 | Diwali | 2682 chars | +118 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 2 | New Year | 2602 chars | +198 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 2 | Pongal | 2641 chars | +159 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 2 | Christmas | 2608 chars | +192 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 2 | Ramadan | 2604 chars | +196 chars | Intact ✓ |
| **GIRL** | `lehenga` | Style 2 | Birthday | 2614 chars | +186 chars | Intact ✓ |
| **GIRL** | `generic` | Style 1 | Diwali | 2516 chars | +284 chars | Intact ✓ |
| **GIRL** | `generic` | Style 1 | New Year | 2462 chars | +338 chars | Intact ✓ |
| **GIRL** | `generic` | Style 1 | Pongal | 2475 chars | +325 chars | Intact ✓ |
| **GIRL** | `generic` | Style 1 | Christmas | 2464 chars | +336 chars | Intact ✓ |
| **GIRL** | `generic` | Style 1 | Ramadan | 2459 chars | +341 chars | Intact ✓ |
| **GIRL** | `generic` | Style 1 | Birthday | 2452 chars | +348 chars | Intact ✓ |
| **GIRL** | `generic` | Style 2 | Diwali | 2515 chars | +285 chars | Intact ✓ |
| **GIRL** | `generic` | Style 2 | New Year | 2435 chars | +365 chars | Intact ✓ |
| **GIRL** | `generic` | Style 2 | Pongal | 2474 chars | +326 chars | Intact ✓ |
| **GIRL** | `generic` | Style 2 | Christmas | 2441 chars | +359 chars | Intact ✓ |
| **GIRL** | `generic` | Style 2 | Ramadan | 2437 chars | +363 chars | Intact ✓ |
| **GIRL** | `generic` | Style 2 | Birthday | 2447 chars | +353 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 1 | Diwali | 2491 chars | +309 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 1 | New Year | 2468 chars | +332 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 1 | Pongal | 2471 chars | +329 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 1 | Christmas | 2446 chars | +354 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 1 | Ramadan | 2440 chars | +360 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 1 | Birthday | 2451 chars | +349 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 2 | Diwali | 2480 chars | +320 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 2 | New Year | 2432 chars | +368 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 2 | Pongal | 2475 chars | +325 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 2 | Christmas | 2443 chars | +357 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 2 | Ramadan | 2438 chars | +362 chars | Intact ✓ |
| **BOY** | `boy_ethnic` | Style 2 | Birthday | 2444 chars | +356 chars | Intact ✓ |
| **BOY** | `generic` | Style 1 | Diwali | 2477 chars | +323 chars | Intact ✓ |
| **BOY** | `generic` | Style 1 | New Year | 2454 chars | +346 chars | Intact ✓ |
| **BOY** | `generic` | Style 1 | Pongal | 2457 chars | +343 chars | Intact ✓ |
| **BOY** | `generic` | Style 1 | Christmas | 2432 chars | +368 chars | Intact ✓ |
| **BOY** | `generic` | Style 1 | Ramadan | 2426 chars | +374 chars | Intact ✓ |
| **BOY** | `generic` | Style 1 | Birthday | 2437 chars | +363 chars | Intact ✓ |
| **BOY** | `generic` | Style 2 | Diwali | 2466 chars | +334 chars | Intact ✓ |
| **BOY** | `generic` | Style 2 | New Year | 2418 chars | +382 chars | Intact ✓ |
| **BOY** | `generic` | Style 2 | Pongal | 2461 chars | +339 chars | Intact ✓ |
| **BOY** | `generic` | Style 2 | Christmas | 2429 chars | +371 chars | Intact ✓ |
| **BOY** | `generic` | Style 2 | Ramadan | 2424 chars | +376 chars | Intact ✓ |
| **BOY** | `generic` | Style 2 | Birthday | 2430 chars | +370 chars | Intact ✓ |

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
