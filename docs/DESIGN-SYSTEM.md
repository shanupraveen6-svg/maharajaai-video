# TryFocus design system

Every surface (TryFocus admin, client workspace, Go Live player, TV, tablet, phone) follows these rules.
Shared components live in `src/components/ui.tsx`; colour and type tokens live in `src/app/globals.css`.

## Choice hierarchy (customer surfaces)

Choices are always asked in this order, and each level has its own control. A control type is never
reused for another level, so a shopper can always tell which choice matters more.

| Level | Question | Options | Control |
|---|---|---|---|
| 0 | Which experience? | TV: Try-On · AI Video · Live Mirror. Tablet: Store collection · My own outfit · AI Video | `NavTabs` (underlined tabs in the header) |
| 1 | Who is it for? | Women · Men · Boys · Girls | `Segmented` (grey track, white pill), only for this; the first step |
| 2 | What are you trying? | Store collection · My own outfit | Two large picture cards on the TV and phone; on the tablet it is the level 0 tab |
| 3 | Which category / what is it? | Sarees, Kurtis… or the own-outfit type | Plain text list (sidebar on TV and tablet, underlined text row on phone) |
| 4 | Which piece? | Product cards | Image cards with a 1–3 badge, the only image tiles |

There is no step progress bar on any surface. Each screen has one title, one next action and a small Back to the step before it. Categories and outfit types are listed in the order South Indian shoppers wear them most (men and boys start with shirt and pant).

TV, three tabs:
- Try-On: Who → Store collection or My own outfit → Your photo → Pick outfits (up to 3) or Your outfit → Your looks.
- AI Video (store collection only): Who → Your photo → Pick a piece → Your portrait, with the QR that makes
  the video on the phone, where the customer can also Go Live.
- Live Mirror: pick a catalogue piece switched on for Live Mirror → Start live → 5-second countdown → 30 seconds live.

Tablet, three tabs, with New customer in the header:
- Store collection and My own outfit: the TV's Try-On, with the source already chosen by the tab.
- AI Video: the customer's QR only, with New customer under it. The customer picks the piece and makes the
  video on their phone.

Phone: Try-On only, opened from the store's permanent Wall QR (downloaded from the workspace and pasted in
the store). Store collection or My own outfit → Who → What type (the store's categories; own outfit adds
Other) → pick a piece (store collection) → Your photo (Camera or Upload) → Your outfit (own outfit, Camera
or Upload) → Your look. One free look per phone, counted from the phone's first scan, plus one retry kept in
the ⋯ menu. Nothing is stored; Download asks for WhatsApp, then offers Follow us on Instagram and Share on
WhatsApp (the same after downloading from the TV/tablet look QR).

Each workspace chooses the categories customers see, per audience (Catalogue → Categories customers see);
TV, tablet and phone all follow that list.

The camera opens full screen as soon as the source is known. The customer's photo has an upload QR
beside the camera (send a photo from the phone); the outfit photo is taken with the camera only, no QR.

Retry is never a button on the page: it lives in the ⋯ menu in the header of the result (Try-On looks,
AI Video portrait and video).

Retention: everything generated (Try-On looks, AI Video portraits and videos, Live Mirror videos) is kept for
1 hour, and scanning the same QR again within that hour shows it (a phone's Wall QR look opens straight on the
look). Only a video sent to Go Live is kept for 1 day, for the Go Live screen. Then everything is deleted.
Who (Women, Men, Boys, Girls) starts with nothing selected on every surface.

Downloads never start on their own. Every Download asks once for the customer's WhatsApp number
(`useLeadGate`), with an optional, unticked "Send me this store's offers" box.

## Screen skeleton

1. Header: store name (initial mark) + one global action (Start over / New customer).
2. Navigation: level 0 `NavTabs` on customer screens, section `NavTabs` on admin screens.
3. One title (`PageTitle`) with one short subtitle. No small label above a heading.
4. Content, using the level controls above in order.
5. One primary action. Sticky `ActionBar` on phone/tablet, floating bar on TV, top-right on admin.

## Colour and type

- Maroon (`brand`) means "go forward": the primary button only.
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
