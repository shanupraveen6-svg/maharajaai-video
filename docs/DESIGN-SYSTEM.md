# TryFocus design system

Every surface (TryFocus admin, client workspace, Go Live player, TV, tablet, phone) follows these rules.
Shared components live in `src/components/ui.tsx`; colour and type tokens live in `src/app/globals.css`.

## Choice hierarchy (customer surfaces)

Choices are always asked in this order, and each level has its own control. A control type is never
reused for another level, so a shopper can always tell which choice matters more.

| Level | Question | Options | Control |
|---|---|---|---|
| 0 | Which experience? | TV: Try-On · AI Video · Live Mirror. Tablet: Store collection · My own outfit · AI Video | `NavTabs` (underlined tabs in the header) |
| 1 | Who is it for? | Women · Men · Boys · Girls | `AudienceCards`: four illustrated cards, 2 × 2, nothing pre-selected, with the two-line `PhotoGuide` box under them (full-length, not a selfie; good light, face the camera). On the portrait TV the store's logo fills the bottom of this screen |
| 2 | What are you trying? | Store collection · My own outfit | Two large picture cards on the TV and phone; on the tablet it is the level 0 tab |
| 3 | Which category / what is it? | Sarees, Kurtis… or the own-outfit type | Plain text list (sidebar on TV and tablet, underlined text row on phone) |
| 4 | Which piece? | Product cards | Image cards with a 1–3 badge, the only image tiles |

There is no step progress bar on any surface. Each screen has one title, one next action and a small Back to the step before it. Categories and outfit types are listed in the order South Indian shoppers wear them most (men and boys start with shirt and pant).

TV, three tabs:
- Try-On: Who → Store collection or My own outfit → Your photo → Pick outfits (up to 3) or Your outfit → Your looks.
  The picks can come from any category of the chosen Who (a shirt, a veshti and a kurta…); each is one garment
  and its own look, all made at the same time. Your looks shows one look full size at a time: swipe, Previous /
  Next or tap a small look to move between them (a single look keeps the before/after slider).
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

**One garment per Try-On (TryFocus rule).** Every Try-On dresses the customer in exactly one garment, sent to
the engine as one piece: a shirt, a veshti, a saree, a kurti… never a shirt-and-veshti set in one photo. The
outfit step says so in a guide box ("One garment at a time, not a full set." / "Hold it up, lay it flat or hang
it, the whole piece in the frame, in good light."; a held garment is cut out of the photo before it is sent,
so no engine sees the person holding it), own-outfit types are single garments, and a customer photo that
shows more than one garment is refused before anything is made (no credit used). The outfit's type and title
follow what is actually in the photo, not only the category tapped.

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

## TryFocus admin and the store workspace

TryFocus admin sets up a store's plan; the store's workspace only shows it. A store never edits its plan.

TryFocus admin, one client, in setup order (numbered headings, one section each):
1. Platform: tick boxes TV · Tablet · Phone. Tick TV, Tablet or both and Phone is ticked and locked with
   them; untick both and it is Phone on its own. The modules switch with the platforms.
2. Credits: set a package, top up, or type a limit. Each card shows what is left and a status word.
3. Store login: one username and password for the TV, tablet, Go Live player and workspace.
4. Delivery: WhatsApp link and the Go Live player, each an On / Off switch.
The store's Live for customers / Paused switch sits under its name. Without a client picked, admin shows
every client's usage.

Store workspace, Overview in this order:
1. Your plan (read only): Platforms and Included as ticked chips, credits as a table (left, used, status),
   and the TryFocus number to add credits or a platform.
2. Your screens: the links to open once on each device (TV, tablet, Go Live player).
3. This month: what customers did, against last month.
4. Store settings: festival theme, logo, Instagram.

Status is words, never a bar: Good · Running low · Almost finished · Finished (credits), Live for
customers · Paused (store). No sliders, carousels or rows that scroll sideways on admin or workspace
screens; lists wrap.

The Go Live player asks for the store login once, then keeps the screen signed in. It is laid out for
landscape LED walls and wall-mount TVs (store name, the portrait video in the middle, the greeting).

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
