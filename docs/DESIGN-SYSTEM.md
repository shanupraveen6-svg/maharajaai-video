# TryFocus design system

Every surface (TryFocus admin, client workspace, Go Live player, TV, tablet, phone) follows these rules.
Shared components live in `src/components/ui.tsx`; colour and type tokens live in `src/app/globals.css`.

## Choice hierarchy (customer surfaces)

Choices are always asked in this order, and each level has its own control. A control type is never
reused for another level, so a shopper can always tell which choice matters more.

| Level | Question | Options | Control |
|---|---|---|---|
| 0 | Which experience? | Try-On · Live Mirror · AI Video | `NavTabs` (underlined tabs in the header) |
| 1 | Who is it for? | Women · Men · Boys · Girls | `Segmented` (grey track, white pill), only for this; the first step |
| 2 | What are you trying? | Store collection · My own outfit | Two large picture cards, a step of its own |
| 3 | Which category / what is it? | Sarees, Kurtis… or the own-outfit type | Plain text list (sidebar on TV and tablet, underlined text row on phone) |
| 4 | Which piece? | Product cards | Image cards with a 1–3 badge, the only image tiles |

Try-On steps, shown with `StepProgress`, the same on TV and tablet (scale only differs):
- Store collection: Who → Store or own → Your photo → Pick outfits (up to 3) → Your looks
- My own outfit: Who → Store or own → Your photo → Your outfit → Your look

The camera opens full screen as soon as Store or own is chosen. The customer's photo has an upload QR
beside the camera (send a photo from the phone); the outfit photo is taken with the camera only, no QR.

AI Video (store collection only): Who → Your photo → Pick a piece → Your portrait (with the QR that makes
the video on the phone).

Live Mirror (TV only): pick a catalogue piece switched on for Live Mirror → Start live → 5-second
countdown → 30 seconds live.

Retry is never a button on the page: it lives in the ⋯ menu in the header of the result (Try-On looks,
AI Video portrait and video).

Downloads never start on their own. Every Download asks once for the customer's WhatsApp number
(`useLeadGate`), with an optional, unticked "Send me this store's offers" box.

## Screen skeleton

1. Header: store name (initial mark) + one global action (Start over / New customer).
2. Navigation: level 0 `NavTabs` on customer screens, section `NavTabs` on admin screens.
3. Progress (customer flows only).
4. One title (`PageTitle`) with one short subtitle. No small label above a heading.
5. Content, using the level controls above in order.
6. One primary action. Sticky `ActionBar` on phone/tablet, floating bar on TV, top-right on admin.

## Colour and type

- Maroon (`brand`) means "go forward": the primary button and the current progress step only.
- Selected things use ink (`ink`); everything else is neutral (`line`, `muted`, `canvas`).
- One typeface (Plus Jakarta Sans), sentence case, no monospace or letter-spaced capitals.
- Surfaces differ in scale only: TV 64 px touch targets and large type, tablet 48 px, phone 44 px,
  admin denser cards and tables.
- Exception: the Go Live player keeps its festive maroon and gold theme (showroom signage), but uses
  the same words and button shapes.

## Words

Use these names everywhere, never a variant:
Try-On · Live Mirror · AI Video · Go Live · Go Live player · Store collection · My own outfit ·
Start over · New customer · Credits.
