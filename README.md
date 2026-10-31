# TryFocus Maharaja AI Experience

Production retail experience for Maharaja, Thanjavur, provided by TryFocus.

## Live Flow

1. Maharaja staff sign in through `/login` and open `/maharaja/workspace`.
2. The admin workspace downloads the permanent AI Try-On wall QR and opens the billing-counter link.
3. Wall-QR customers scan an eligible price tag, add one customer photo and one garment photo, and generate a Fal AI Try-On image.
4. Billing-counter staff create a one-hour customer QR for purchases of Rs 5,000+, Rs 7,000+, or Rs 10,000+.
5. AI Video customers add one customer photo and up to two garment photos. Gemini creates the event master image; the customer explicitly selects MiniMax H3 Max (768p) or PixVerse C1 (720p) for the six-second video.
6. Customers preview and download inside the web app or send the completed video to the Maharaja TV queue.
7. `/tv` continuously plays queued and stored completed videos with Maharaja live audio.

## Production Routes

- `/` - TryFocus client portal.
- `/login` - Maharaja owner/operator login.
- `/maharaja/workspace` - Maharaja admin workspace.
- `/maharaja/billing/[billingCode]` - Billing-counter QR generator.
- `/maharaja/try-on` - Permanent wall-QR customer experience.
- `/maharaja/video/[code]` - Billing-QR customer experience.
- `/result/[sessionId]` - In-app image and video result experience.
- `/tv` - Authenticated Maharaja showroom screen and stored-video loop.

## Required Environment

```bash
FIREBASE_PROJECT_ID="..."
FIREBASE_CLIENT_EMAIL="..."
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FIREBASE_STORAGE_BUCKET="..."

GOOGLE_AI_API_KEY_PRIMARY="..."
GEMINI_ANALYSIS_MODEL="gemini-2.5-flash-lite"
GEMINI_IMAGE_MODEL="gemini-3.1-flash-image"
FAL_KEY="..."
# Video renders use Fal with explicit H3 Max and PixVerse C1 customer selection.

OPERATOR_USERNAME="..."
OPERATOR_PASSWORD="..."
OPERATOR_AUTH_SECRET="..."
```

Production fails closed when Firebase, Gemini, Fal.ai, or operator credentials are unavailable. Mock storage is restricted to non-production automated checks and cannot be enabled in a production build.

## Verification

```bash
npm run build
node scripts/test-pass-state.mjs
node scripts/test-admin-retry-flow.mjs
```

## Server tests (separate test Firebase project)

Three tests need a running server with real Firebase. Never run them against production.

1. Create a free Firebase project for testing (for example `tryfocus-test`) with Firestore and Storage.
2. Create a service account key for it and put the test values in `.env.test` (git-ignored):
   `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_STORAGE_BUCKET`,
   `OPERATOR_USERNAME`, `OPERATOR_PASSWORD`, `OPERATOR_AUTH_SECRET`. Add AI keys only if you accept paid test calls.
3. `npm run build && npm run test:server`

The runner refuses to start if `.env.test` points at the production project, and blanks every key
that `.env.test` does not set so nothing falls back to the production values in `.env.local`.
