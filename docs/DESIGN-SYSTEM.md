# TryFocus design system

Every surface (TryFocus admin, client workspace, Go Live player, TV, tablet, phone) follows these rules.
Shared components live in `src/components/ui.tsx`; colour and type tokens live in `src/app/globals.css`.

## Choice hierarchy (customer surfaces)

Choices are always asked in this order, and each level has its own control. A control type is never
reused for another level, so a shopper can always tell which choice matters more.

| Level | Question | Options | Control |
|---|---|---|---|
| 0 | Which experience? | Try-On · Live Mirror · AI Video | `NavTabs` (underlined tabs in the header) |
| 1 | What are you trying? | Store collection · My own outfit | Two large picture cards, a step of its own |
| 2 | Who is it for? | Women · Men · Boys · Girls | `Segmented` (grey track, white pill), only for this |
| 3 | Which category / what is it? | Sarees, Kurtis… or the own-outfit type | Plain text list (sidebar on TV, underlined text row on tablet/phone) |
| 4 | Which piece? | Product cards | Image cards with a 1–5 badge, the only image tiles |

Try-On steps, shown with `StepProgress`:
- Store collection: Store or own → Your photo (with Who) → Pick outfits → Your looks
- My own outfit: Store or own → Your photo (with Who) → Your outfit → Your look

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
