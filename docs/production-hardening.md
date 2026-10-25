# Production hardening deployment

The application keeps the current Gemini and H3 model IDs. Deployment does not
run media cleanup or modify existing stored live videos. The cleanup job preserves
legacy live sessions, including sessions identified by stored live-9s.mp4 files.
New Go Live submissions carry live-v2 retention and receive three days of replay
eligibility independently of their customer pass expiry.

## Google Cloud owner actions

The available service account returned HTTP 403 for security policy administration.
An authorized project owner must activate the following prepared settings:

```sh
firebase deploy --only firestore:rules --project maharaja-799bb
gcloud firestore fields ttls update expiresAt --collection-group=securityRateLimits --enable-ttl --project=maharaja-799bb
```

The rules deny Firebase client SDK access. All application data access uses the
authenticated server API and Admin SDK. These commands do not delete live media.
The TTL policy applies only to securityRateLimits documents with timestamp expiry.
Existing records without that field are removed by the scheduled numeric-expiry
cleanup. Do not deploy all index definitions blindly: preserve
additional indexes already configured in the project.

## TV pairing

Sign in on the TV once and open /maharaja/tv. The browser receives a 30-day
HttpOnly display cookie; staff passwords are unchanged. Display cookies authorize
playback operations only, not the workspace, publishing or pairing administration.
Use Disconnect paired TVs in the workspace to revoke all display tokens.

## Verification

Run the production build and the E2E script against a local mock server. Do not
run destructive cleanup tests against production. Media tests use synthetic local
clips and no paid generation calls. Configure CRON_SECRET in production and verify
the scheduled cleanup run in Vercel logs after deployment.
