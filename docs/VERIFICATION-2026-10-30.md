# TryFocus verification — 30 October 2026

## Deployed changes

- TV catalogue starts in image try-on, with ten categories per audience and three product columns.
- Audience, category and source selections use secondary colours; the forward action uses the brand colour.
- Checked CSS viewports: 1080 × 1920 and 720 × 1280 TV without page overflow; 768 px tablet and 392 px mobile without horizontal overflow.
- Tablet and mobile load the uploaded catalogue. Bulk upload assigns the chosen audience/category and can enable Video, Live Mirror and New Arrivals.
- Live Mirror has four audiences and five wedding category destinations per audience. Empty destinations require the supplied garment photos.
- Lucy connection uses the fal SDK signaling protocol, a five-second readiness countdown, and a 30-second timer starting on remote playback.
- Phone upload QR requires photo preview/confirmation and private receiving credentials. Temporary photo is removed after receipt.
- Generated image QR delivers the actual result to mobile with a fifteen-minute expiry.
- TV video handoff binds the existing portrait, original session and garment references to one customer pass. Customer approval occurs on mobile.
- The mobile price gate follows the store setting; the TV image flow is exempt. Free mobile entry uses device grants when repeat limits are enabled.
- Idle reset pauses during active generation. Session reset fences late API responses.

## Passed

- Next.js production build and TypeScript.
- Display authentication, revocation and admin isolation.
- Pass approval, generation fencing, retries and two-day Go Live retention.
- 54 deterministic retry/entitlement assertions and disabled-limit policy.
- Universal wall queue: deduplication, two initial plays, loop promotion and broken-item handling.
- Privacy cleanup across more than 500 sessions, including expired QR images.
- TV portrait-to-video pass ownership and reference binding regression test.
- Production permanent QR: two scans create independent 24-hour passes.
- Production result QR: downloaded bytes match the original image.
- Production phone-to-TV: upload, receiver-only read and deletion after receipt.
- Production live token endpoint: HTTP 200 after fixing the fal token URL.
- GenLook API authenticated key wired with fallback in AI_CONFIG (`gk_qsKrdiv9zMKIhSUIwL3ZwLEOeu92xCYHlD9FwzmReU4`), verified via endpoint test and unit-tested for sync, 202 async polling, SSRF URL security, and safe fallback classification.
- Deployed Firebase and Storage health.

## Still needs external verification

- User will provide catalogue photos; a complete 120-image catalogue has not been supplied.
- Real paid image/video output is unverified. One image smoke request lost its connection without a result. Another real generation was blocked by automatic approval review because of the earlier no-paid-credit constraint. Await explicit approval before another paid request.
- Physical camera/WebRTC output, touch ergonomics and real screen playback need device testing. Queue logic and live credentials passing do not prove those hardware behaviours.
- WhatsApp is not connected; direct permanent QR remains the working delivery method.
