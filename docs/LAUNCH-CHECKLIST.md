# TryFocus launch checklist

## 1. One-time setup (TryFocus)

- [ ] **Vercel environment:** fill every key in `.env.example` (Project → Settings → Environment Variables).
      `CRON_SECRET` is required, or the daily privacy cleanup will not run.
- [ ] **Rupee rate:** `USD_TO_INR=98` (about ₹94 plus a ₹4 buffer; the admin spend and profit figures use it).
- [ ] **Engines:** `TRYON_ENGINE_ORDER` and `VIDEO_ENGINE_ORDER` stay empty for the defaults
      (Try-On GenLook → fal → FASHN → Gemini; AI Video H3 Max → Gemini Omni Flash as the ultimate backup).
      `FASHN_API_KEY` is optional. Add PixVerse (and Lucy for Live Mirror) only after they pass the saree test.
- [ ] **AI costs and caps:** set `AI_COST_*` from your fal.ai and Google invoices (defaults: 0.068 / 0.0735 / 0.48 / 0.6), then `AI_DAILY_CAP_CLIENT_USD`
      and `AI_DAILY_CAP_PLATFORM_USD`. Also set spending limits inside fal.ai and Google AI Studio.
- [ ] **Firebase rules:** deploy the locked rules: `npx firebase-tools deploy --only firestore:rules,storage`
      (uses `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`). The app only uses Firebase from the server.
- [ ] **Storage CORS** (needed for promo uploads and Live Mirror videos; skip if promo uploads already work):
      `gsutil cors set cors.json gs://<FIREBASE_STORAGE_BUCKET>`
- [ ] **Thumbnails** for garments uploaded before this release: `npm run catalogue:thumbnails`
- [ ] **TryFocus admin → client:** platform (TV / Tablet / Phone; its modules switch with it), Set to Standard / Pro /
      Premium or a top-up (price and our profit are shown), client login.
- [ ] **Catalogue:** switch on the pieces for AI Video and for Live Mirror (Live Mirror shows only pieces switched on, over ₹10,000).

## 2. Devices in the store

| Device | Open | Check |
|---|---|---|
| Portrait TV + webcam (Chrome) | `/maharaja/tv/experience`, sign in once | Try-On, AI Video, Live Mirror (if added) |
| Counter tablet (Chrome) | `/maharaja/tablet/experience`, sign in once | Staff Try-On, AI Video gift QR |
| Biller (workspace) | Workspace → AI Video gift | Show QR, New customer |
| LED / wall screen (any browser) | Workspace → Go Live & videos → Open player, tap Start | Plays Go Live videos and promos |
| Customer phones | Scan the Wall QR and a gift QR | Try-On, gift video, Download, Go Live |

## 3. Test script (run each once, note anything confusing)

1. **Wall QR:** scan → Store collection → photo → outfit → look appears in about 20 s → Save photo → enter a WhatsApp
   number → it downloads. Repeat in தமிழ்.
2. **TV Try-On:** Who → Store collection → the camera opens full screen with the upload QR → take a photo → pick up
   to 3 → looks → ⋯ menu shows the retry → Show QR → on the phone, Download asks for the WhatsApp number first.
3. **TV own outfit:** Who → My own outfit → photo → the camera opens again for the outfit (no QR) → What is it? → look.
4. **Gift QR:** biller taps the piece bought (optional) → Show QR → customer scans → the collection opens (or the
   chosen piece) → photo → portrait → video → Download (WhatsApp number) and Go Live → it plays on the LED screen.
5. **TV / tablet AI Video:** AI Video → bill digits (if a minimum is set) → Who → photo → pick a piece → portrait →
   the QR appears → video on the phone.
6. **Live Mirror (TV):** pick a piece → Start live → 5-second countdown → 30 seconds, change outfit twice → scan the
   QR → Download asks for the WhatsApp number.
7. **Counter tablet:** the same Try-On and AI Video steps, plus the AI Video gift tab; no Live Mirror.
8. **Idle TV:** leave the TV untouched for 3 minutes → it resets and plays Go Live videos → one tap returns.
9. **Offline:** unplug the TV's internet → "We'll be right back" → plug back → the screen recovers.
10. **Workspace:** catalogue upload, AI Video and Live Mirror switches on pieces, Customers tab and its CSV.

## 4. Automated checks (developers)

- `npx tsc --noEmit && npx eslint src` and every `scripts/test-*.mjs` run on each push (GitHub Actions).
- `npm run test:e2e` runs real-browser checks on a production build against the mock backend (never production
  data). Set `E2E_CHROME_PATH` if Chrome is not at the default path.
