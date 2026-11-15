# 01 — Layout: header, Contact details, rail rows, three large tabs

**Issue:** not filed
**Type:** AFK
**Status:** **built** (2026-11-15)
**Blocked by:** none
**Labels:** `enhancement`, `area:admin`

## Goal

Every section of a Customer is one press away. The demo: open a Customer on a laptop and reach
their pillow, their reviews and their points without scrolling.

## What to build

- **Tabs:** a `size="lg"` for the `line` variant in `components/ui/tabs.tsx`: 48 px tall, 16 px
  semibold labels, an icon, a count badge, a 3 px underline. Nothing else about the component
  changes, including collapse-to-menu.
- **The page:** header (name, stage, one line of numbers, Email, WhatsApp, Note, Follow-up,
  Create order), the Next step line, a left rail, and three tabs: Journey, Pillow and fittings,
  Reviews. The tab row stays in view while the page scrolls.
- **On a phone** the three tabs share the width and the middle label reads *Pillow*, so the row
  never folds into a menu. The rail comes first, then the tabs.
- **`?tab=`** holds the open tab; Journey is the default and is left out of the address.
- **Contact details** replaces *Customer info* and *Contact and sign-in*: email and mobile with
  their facts, and name, mobile and tags behind *Edit*.
- **Rail rows:** Sign-in, Addresses, Preferences (the aftercare switches and Marketing consent),
  Points, How they found us. Each opens in place and loads its content the first time.
- Order history, Notes, Follow-ups, Timeline and From Shopify cards go (slice 04 replaces them).

## As built (2026-11-15)

- `size="lg"` on `TabsList` (`components/ui/tabs.tsx`), `line` only: 48 px, 16 px semibold, 3 px
  underline. `tabs-mobile.test.ts` still holds the row's guards.
- `customer-detail-client.tsx`: header with the five buttons, the numbers as one line (what the
  Stats strip held, with the same hover notes), Next step, the rail, and three tabs that stay
  mounted so each keeps what it loaded. The rail sits left of the tabs from `@4xl`, above them
  below that.
- `?tab=` is read on the server (`lib/crm/customer-tabs.ts`) and changed in the browser with
  `history.replaceState`, so changing tab does not read the page again.
- **Contact details** (`ContactCard` in `customer-account-cards.tsx`): email and mobile with their
  facts and buttons; *Edit* swaps the rows for the name, mobile and tags form. How they sign in
  moved to the Sign-in row (`SignInFacts`).
- `rail-rows.tsx`: a row mounts its content the first time it opens and keeps it. The cards
  inside are the cards the page already had, with their frame and title taken off.
- The Reviews tab shows a count of reviews on record once they load.
- **Tests:** `customer-detail-render.test.tsx`, `contact-card-render.test.tsx`,
  `account-status-render.test.tsx`.
- **Not done:** on a phone the rail is above the tabs, so the tabs are about two screens down.
  Moving the rail into a fourth *Details* tab on phones would fix that; it was not in the
  approved mock, so it is left for the owner to choose.

## Acceptance criteria

- [ ] No horizontal scroll at 390 px; the tab row is three tabs, never a menu.
- [ ] Every control that existed still exists: edit name, mobile and tags; add an address; adjust
  points; the aftercare switches; a support unsubscribe; change pillow; re-adjust; link, unlink
  and reject a review; create an order.
- [ ] Without `customers-edit` no edit control renders.
- [ ] `?tab=reviews` opens on Reviews.
