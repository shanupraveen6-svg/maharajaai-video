# TryFocus launch checklist

## 1. One-time setup (TryFocus)

- [ ] **Vercel environment:** fill every key in `.env.example` (Project → Settings → Environment Variables).
      `CRON_SECRET` is required, or the daily privacy cleanup will not run.
- [ ] **AI costs and caps:** set `AI_COST_*` from your fal.ai and Google invoices, then `AI_DAILY_CAP_CLIENT_USD`
      and `AI_DAILY_CAP_PLATFORM_USD`. Also set spending limits inside fal.ai and Google AI Studio.
- [ ] **Firebase rules:** deploy the locked rules: `npx firebase-tools deploy --only firestore:rules,storage`
      (uses `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`). The app only uses Firebase from the server.
- [ ] **Storage CORS** (needed for promo uploads and Live Mirror videos; skip if promo uploads already work):
      `gsutil cors set cors.json gs://<FIREBASE_STORAGE_BUCKET>`
- [ ] **Thumbnails** for garments uploaded before this release: `npm run catalogue:thumbnails`
- [ ] **TryFocus admin → client:** screen (TV / Tablet / both), Live Mirror add-on, Package 1 or 2, client login.

## 2. Devices in the store

| Device | Open | Check |
|---|---|---|
| Portrait TV + webcam (Chrome) | `/maharaja/tv/experience`, sign in once | Try-On, AI Video, Live Mirror (if added) |
| Counter tablet (Chrome) | `/maharaja/tablet/experience`, sign in once | Staff Try-On, AI Video gift QR |
| Biller (workspace) | Workspace → AI Video gift | Show QR, New customer |
| LED / wall screen (any browser) | Workspace → Go Live & videos → Open player, tap Start | Plays Go Live videos and promos |
| Customer phones | Scan the Wall QR and a gift QR | Try-On, gift video, Download, Go Live |

## 3. Test script (run each once, note anything confusing)

1. **Wall QR:** scan → Store collection → photo → outfit → look appears in about 20 s → Save photo. Repeat in தமிழ்.
2. **Gift QR, new collection:** biller taps Show QR → customer scans → "… new collection" → outfit → photo →
   portrait → video → Download and Go Live → video plays on the LED screen.
3. **Gift QR, your collection:** New customer → scan → "Your collection" → photo + outfit photo → portrait →
   video → Download / Go Live. Use the retry once to see the backup video.
4. **TV AI Video:** AI Video → bill digits (if a minimum is set) → photo → outfit → portrait → Proceed → scan the QR →
   Generate video on the phone → Download and Go Live.
5. **Live Mirror (add-on):** pick an outfit → Start → 5-second countdown → 60 seconds, change outfit twice →
   scan the QR → the whole video and "Compare your looks" open on the phone.
6. **Idle TV:** leave the TV untouched for 3 minutes → it resets and plays Go Live videos → one tap returns.
7. **Offline:** unplug the TV's internet → "We'll be right back" → plug back → the screen recovers.
8. **Workspace:** catalogue upload, AI Video switch on pieces, monthly numbers on Overview, setup checklist.

## 4. Automated checks (developers)

- `npx tsc --noEmit && npx eslint src` and every `scripts/test-*.mjs` run on each push (GitHub Actions).
- `npm run test:e2e` runs real-browser checks on a production build against the mock backend (never production
  data). Set `E2E_CHROME_PATH` if Chrome is not at the default path.
