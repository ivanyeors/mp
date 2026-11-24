# A Staff order's pillow or bolster takes the cover and case Staff choose

Status: Accepted (owner, 2026-11-24).

Amends ADR 0057 (*Cover and case are the recipe's. Staff choose fillings only.*).

## Context

A pillow or bolster on a **Staff order** was built with the fillings Staff laid out and the
recipe's own cover and case (ADR 0057). A customer at the counter chooses those too, as they do
on the customisation preview: which cover, and which case fabric. Staff could not record it. The
workshop had no cover or case on the Order to build from, the wrong ones left stock, and a case
from a dearer fabric family was sold at the standard price.

The owner asked for it (2026-11-24): when a pillow or bolster is added to the order, also choose
its cover type.

## Decision

**A Staff order build carries its Customer preference, chosen by Staff: a pillow's cover and
case, a bolster's case. The recipe's are chosen until Staff pick another. The choice is priced
from Costings and is what the workshop builds and what leaves stock.**

- **What is offered** is what the customisation preview offers that size. A pillow: the active
  covers and cases for its size, and the recipe's own. A bolster: the recipe's case and the
  active bolster cases made for its length, and no cover (`preferenceCategoryAllowed`). The
  server refuses anything else, by name of what is wrong.
- **Price: Costings, through `priceComposedBuild` (ADR 0001).** The recipe's cover and case cost
  the Composed sellable's shelf MSRP, as before. Another case is priced on its fabric family's
  Costings row, and another cover or case in the same family by the difference between its MSRP
  and the standard one's, exactly as a Result is. A choice Costings cannot price is refused. Each
  **Ear Comfort Pad** placed inside is still charged on top. Staff never type an amount; the
  dialog shows what each option adds, and the quote is what is charged.
- **Where it is kept.** The line's `StaffBuildSnapshot.config_lines` (and the
  `customization_configs` row) holds the chosen cover and case, the recipe's included, at the
  recipe's quantity. `stockLinesForOrderItem` already swaps a chosen part for the recipe's part
  of the same role, so the stock check when the order is priced, the re-check before Checkout,
  the deduction, the restock and the cost at sale all follow the choice with no new code path.
  A build made before this ADR has empty `config_lines` and keeps the recipe's.
- **A spare case is still its own line.** The choice replaces the one the pillow comes with; it
  does not add a second.

## Considered options

- **Choose the cover only** — rejected. A bolster has no cover, so "cover type" on a bolster can
  only mean its case, and the case is the half of the choice that moves a pillow's price.
- **Sell the chosen cover or case as a separate accessory line** — rejected. The recipe's own
  would still leave stock and the customer would pay for two.
- **Charge the shelf price whatever is chosen** — rejected. Costings prices a fabric family on
  its own row; ignoring it sells the dearer case at the cheaper price (ADR 0001).

## Consequences

- `StaffOrderDraftSchema` builds gain `cover_item_id` and `case_item_id` (null means the
  recipe's). `GET /api/staff-orders/build-options` returns `covers` and `cases`, each with its
  stock and what it adds, and the defaults.
- The build dialog (*Build for …*) has a Cover and a Case picker beside the Filling Template; an
  option with no Costings price or no stock cannot be picked. The order line and the Order
  page's *Build snapshot* show the cover and case.
- `lib/pricing/pricing-surface.check.ts` requires `lib/staff-orders/builds.ts` to price through
  `priceComposedBuild`.
