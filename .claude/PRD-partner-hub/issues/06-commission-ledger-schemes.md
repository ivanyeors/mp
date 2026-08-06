## Parent

PRD: Partner Hub — #70

## What to build

The **Commission** ledger (ADR 0015), end to end. On capture of an attributed Order, create `held` commission rows for its pillow/bolster units — never add-ons, shipping, or tax — priced by the partner's **Commission scheme** (flat $ or % base, per product type; a default scheme plus per-partner overrides, edited only in the Admin Panel). Release happens exactly when the RMA **Return window** closes (30 days after `delivered_at`; in-store handover sets `delivered_at` at handover). An RMA **refund** resolution voids that item's commission; exchange/replacement keep it. Attributed Orders get a partner-source badge in the Orders table (like the existing Source badge — no money workflows in Orders rows). Admin scheme editor lives on the new Partner commissions page (minimal shell here; payout workflow arrives in a later slice).

## Acceptance criteria

- [ ] Attributed Order capture creates held commissions with correct amounts from the partner's scheme (default and override both demoable)
- [ ] Commission releases when the return window closes; the release date is derived from `delivered_at`, never `paid_at`
- [ ] RMA refund on an item voids exactly that item's commission; exchange/replacement leave it held/released
- [ ] Non-pillow/bolster lines never generate commission
- [ ] Orders table shows the partner-source badge on attributed rows only
- [ ] Scheme editing is Staff-only and invisible in Partner Hub

## Blocked by

- #74
