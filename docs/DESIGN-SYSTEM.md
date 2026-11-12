# TryFocus design system

Every surface (TryFocus admin, client workspace, Go Live player, TV, tablet, phone) follows these rules.
Shared components live in `src/components/ui.tsx`; colour and type tokens live in `src/app/globals.css`.

## Packages

TryFocus sells two packages, TV and Tablet (or both). Each includes the customer's phone:
- TV: Try-On, AI Video (the portrait on the TV, the video made on the customer's phone) and Western Try-On on the
  showroom TV, plus the Wall QR phone Try-On.
- Tablet (run by the store's team): Try-On only, at the counter, plus the Wall QR phone Try-On.
AI Video only starts on the TV, so a Tablet-only store does not have it; buying the TV is what adds it.
There is no Phone-only package and no November offer.

## Choice hierarchy (customer surfaces)

Choices are always asked in this order, and each level has its own control. A control type is never
reused for another level, so a shopper can always tell which choice matters more.

| Level | Question | Options | Control |
|---|---|---|---|
| 0 | Which experience? | TV: Try-On · AI Video · Western Try-On. Tablet: Catalogue Try-On · Own-outfit Try-On · Wall QR | `NavTabs` (underlined tabs in the header) |
| 1 | Who is it for? | Women · Men · Boys · Girls | `AudienceCards`: four illustrated cards, 2 × 2, nothing pre-selected, with the two-line `PhotoGuide` box under them (full-length, not a selfie; good light, face the camera). On the portrait TV the store's logo fills the bottom of this screen |
| 2 | What are you trying? | Store collection · My own outfit | Two large picture cards on the TV and the phone |
| 3 | Which category / what is it? | Sarees, Kurtis… or the own-outfit type | Plain text list (sidebar on TV and tablet, underlined text row on phone) |
| 4 | Which piece? | Product cards | Image cards with a 1–3 badge, the only image tiles |

There is no step progress bar on any surface. Each screen has one title, one next action and a small Back to the step before it. Categories and outfit types are listed in the order South Indian shoppers wear them most (men and boys start with shirt and pant).

The tablet's own two Try-On tabs stand in for level 2 there: picking Catalogue Try-On or Own-outfit Try-On
already answers "what are you trying?", so that step never appears on the tablet; Who (level 1) still comes
first inside whichever tab is open.

TV, three tabs:
- Try-On: Who → Your photo → Store collection or My own outfit → Pick outfits (up to 3) or Your outfit → Your looks.
  The picks can come from any category of the chosen Who (a shirt, a veshti and a kurta…); each is one garment
  and its own look, all made at the same time. Your looks shows one look full size at a time: swipe, Previous /
  Next or tap a small look to move between them (a single look keeps the before/after slider).
- AI Video (store collection only): (the last 4 digits of the bill on a large on-screen number pad, when the store
  set a minimum bill; 0 = a free gift) → Who → Your photo → Pick a piece (with its price) → Pick a location (one
  of 3 for that audience) → Your portrait, with the QR that makes the video on the phone, where the customer can
  also Go Live.
- Western Try-On: shirts, dresses and other western-cut garments only — the real-time engine (Decart Lucy) does
  not handle draped or ethnic wear (a saree, lehenga, veshti, kurta set…) well, so the name says what it is
  before the customer ever taps it. Eligibility is a property of the category itself, not a per-store choice:
  a western category is eligible everywhere it is used, an ethnic one never is. The camera is on as soon as the
  tab opens, with the outfits in one card under it. Who → pick a piece switched on for Western Try-On (none is
  picked for the customer) → Start live, which appears on the camera only once a piece is picked → 5-second
  countdown → 30 seconds live → the replay with a Play button and the QR.
- End session (TV): a large red, full-width End session under every result QR (Try-On looks, AI Video portrait,
  Western Try-On video); the same tab starts again. Only the AI Video portrait has a clock above it: 2 minutes to
  download or Go Live on the phone, the last minute in red, then the session ends on its own; Retry sits
  beside its End session.

Tablet, run by the store's team, three tabs: Catalogue Try-On, Own-outfit Try-On, Wall QR. Each Try-On tab
is its own source, decided by the tab, not by an in-flow "What would you like to try?" step — Who still
asks first. End session sits in the header on either Try-On tab (Wall QR has none); there is no AI Video
tab here, and no clock on the tablet:
- Catalogue Try-On: Who → Your photo → outfits from the collection → looks.
- Own-outfit Try-On: Who → Your photo → Your outfit (photographed with the camera) → look. The team takes
  the customer's photo either way and shows them the result.
- Wall QR: the store's permanent Try-On QR, shown large to scan at the counter, and a poster with the
  store's name to download, print and paste anywhere in the store.

AI Video only starts on the TV, never the tablet. On the TV: Who → Your photo → Pick a piece → Pick a
location → Your portrait → Generate video (this also approves the portrait) → the QR. Scanning the QR on
the phone starts the video immediately, with its own animated progress screen — no "Make my video" tap,
since the TV already approved it. If a video comes out wrong, the customer retries it privately on their
own phone, where no one else sees it (the portrait retry stays on the TV). Then Download (which saves the
file on its own right after the WhatsApp number is given) or Go Live, which plays it on the store's Go
Live player.

Phone: Try-On only, opened from the store's permanent Wall QR (downloaded from the workspace and pasted in
the store). (A photo of the bill, Camera or Upload, read on the server, when the store set a Try-On minimum)
→ Who → Your photo (Camera or Upload) → Store collection or My own outfit → What type (the store's
categories; own outfit adds Other) → pick a piece, or Your outfit (Camera or Upload) → Your look. TV and
tablet never ask for a bill on Try-On. One free look per phone, counted from the phone's first scan, plus one retry asked
from Help. Nothing is stored; Download asks for WhatsApp, then offers Follow us on Instagram and Share on
WhatsApp (the same after downloading from the TV/tablet look QR).

Each workspace chooses the categories customers see, per audience (Catalogue → Categories customers see);
TV, tablet and phone all follow that list.

Prices: only AI Video shows a piece's price (to move the customer to buy it). Try-On and Western Try-On never
show prices.

The workspace uploads garments in one flow, not three: pick who it's for, pick a category (added, edited or
removed in Categories customers see), drop in a batch of photos — any mix, no pre-sorting. Every garment
lands in one table and is on Try-On automatically, no switch needed. Two switches decide the rest:
- AI Video, off by default — the store opts in its premium pieces. Switching it on for a garment marks that
  row with a red "Add price" badge until a price is entered; the price itself is set in the garment's full
  detail view (opened from its thumbnail), alongside its sizes.
- Western Try-On, on automatically wherever the garment's category is western-cut (a property of the
  category itself, not a per-store setting), off wherever it is not; the store can still switch an
  individual garment either way.
Upload publishes the reviewed batch; Redo clears it to start again. Publishing is blocked, with a clear
count, until every AI Video garment has its price.

**One garment per Try-On (TryFocus rule).** Every Try-On dresses the customer in exactly one garment, sent to
the engine as one piece: a shirt, a veshti, a saree, a kurti… never a shirt-and-veshti set in one photo. The
outfit step says so in a guide box ("One garment at a time, not a full set." / "Hold it up, lay it flat or hang
it, the whole piece in the frame, in good light."; a held garment is cut out of the photo before it is sent,
so no engine sees the person holding it), own-outfit types are single garments, and a customer photo that
shows more than one garment is refused before anything is made (no credit used). The outfit's type and title
follow what is actually in the photo, not only the category tapped.

The camera opens full screen as soon as the source is known, with a 112 px shutter. The captured (or
phone-sent) photo is confirmed in that same full-screen view — Retry or Use this photo — never on a second
preview page; an adult goes straight on, a child's photo still waits on the guardian-consent tick. The
customer's photo has an upload QR beside the camera (send a photo from the phone), confirmed the same way;
the outfit photo is taken with the camera only, no QR and no file upload, since it is a store garment in hand.

Retry is never a button on the page, except Retry beside End session on the TV's AI Video portrait. The result's header has a Help button (`HelpRetry`, Try-On looks,
AI Video portrait and video). It asks "Do you need to retry this image?" (or portrait, looks, video) with
Cancel and Yes, retry, one line on what the retry does, and three tips for a better photo (full-length, not a
selfie; good light, facing the camera; one garment at a time). With no retry left, or none on that screen
(the TV looks link on the phone), it shows the tips and who can help. There is no ⋯ menu anywhere.

Retention: everything generated (Try-On looks, AI Video portraits and videos, Western Try-On videos) is kept for
1 hour, and scanning the same QR again within that hour shows it (a phone's Wall QR look opens straight on the
look). Only a video sent to Go Live is kept for 1 day, for the Go Live screen. Then everything is deleted.
Who (Women, Men, Boys, Girls) starts with nothing selected on every surface.

Downloads never start on their own. Every Download asks once for the customer's WhatsApp number
(`useLeadGate`), with an optional, unticked "Send me this store's offers" box.

## TryFocus admin and the store workspace

TryFocus admin sets up a store's plan; the store's workspace only shows it. A store never edits its plan.

Picking a client in TryFocus admin opens that client's own workspace underneath the plan panel — the same
screen, same data, as the store sees when it logs in. There is no separate admin-only catalogue or settings
tool: what TryFocus staff sets up during delivery (catalogue, logo, Instagram, promo videos) is exactly what
the store opens later. Only the plan panel above it (platform, credits, store login, delivery, delete
workspace) is admin-only and never shown to the store.

A new client is set up on its own page (New client, from the admin header): store name, branch, platform
and a starting credit package, in that order. Create workspace saves it and returns to admin with that
store already picked, so it is live in the store dropdown at once.

TryFocus admin, one client, in setup order (numbered headings, one section each):
1. Platform: tick boxes TV · Tablet · Phone. TV, Tablet or both; at least one stays ticked. Phone is always
   ticked and locked: the customer's phone (Wall QR Try-On, and finishing an AI Video the TV started) comes
   with both. Phone on its own is no longer sold. The modules switch with the platforms: AI Video needs the
   TV, so a Tablet-only client has no AI Video credits to set.
2. Credits: set a package, top up, or type a limit. Each card shows what is left and a status word.
3. Store login: one username and password for the TV, tablet, Go Live player and workspace.
4. Delivery: WhatsApp link and the Go Live player, each an On / Off switch.
The store's Live for customers / Paused switch sits under its name. Above the four steps, one picked
client shows "In the store's workspace" (read only: Working now per feature, what the store set up
with done / to do, the month's counts against last month, latest activity) and "Set up by TryFocus"
(platform, credits, store login, delivery, AI cost, each with a Change link to its step). Delete
workspace sits last. Without a client picked, admin is a status board: four totals, Needs action, and
one card per client.

Store workspace, Overview in this order, compact, showing only this store's own things:
0. A warning strip only when credits are low or finished, or the store is paused.
1. Your plan (read only): one row per feature the store has (Try-On, AI Video, Western Try-On, Go Live player)
   with its status word (Working · Working, credits low · Credits finished · Switch on garments · Paused ·
   Off), credits left and the credit status; the booked platforms beside the heading; how customers get
   their looks and the TryFocus number in one line.
2. Open your screens: one row of buttons (TV, tablet, Go Live player) and the Wall QR download.
3. This month: counts only, no money figures — Image Try-On and Wall QR scans (every store); AI Video,
   Go Live and Real Try-On (Western Try-On) only for a store with the TV, so a Tablet-only store sees just
   Image Try-On and Wall QR scans — with last month in brackets. There is no To do list.
Festival theme, logo and Instagram are on the Settings tab. Customers (everyone who gave a WhatsApp
number to download, with Offers yes / no and a CSV download) is its own tab. Workspace tabs wrap on a phone.
The Wall QR poster carries the store's own name.

Status is words, never a bar: Good · Half used (50%) · Running low (70%) · Almost finished (90%) ·
Last 5% left (95%) · Finished (credits), Live for customers · Paused (store). Stores have no daily cap
(they bought a package); at each of those steps a line goes to the store's activity, the workspace strip
and admin's Needs action. No sliders, carousels or rows that scroll sideways on admin or workspace
screens; lists wrap.

The Go Live player asks for the store login once, then keeps the screen signed in. It is laid out for
landscape LED walls and wall-mount TVs (store name, the portrait video in the middle, the greeting).

## Screen skeleton

1. Header: store name (logo or initial mark) + one global action (TV: Start over; tablet Try-On: End session).
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
Try-On · Western Try-On · AI Video · Go Live · Go Live player · Store collection · My own outfit ·
Start over · New customer · Credits.
