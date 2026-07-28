## Parent

PRD: Partner Hub — #70

## What to build

**Partner self-purchase**, end to end. A signed-in partner buying pillows/bolsters in their own account gets their admin-set partner rate (discount vs MSRP), capped at an admin-set number of units; both values live beside the Commission scheme in the Admin Panel. Self-purchases earn **no commission** and **never count toward the Milestone track** — the better price is the whole reward. Purchases beyond the cap fall back to normal pricing. The partner's own referral link used anonymously (not signed in) still follows the normal commission model.

## Acceptance criteria

- [ ] Signed-in partner sees partner pricing on commissionable units up to the cap; over-cap units price normally
- [ ] Self-purchase generates zero commission rows and zero milestone units
- [ ] Discount rate and cap editable per partner in the Admin Panel only
- [ ] Anonymous purchase via the partner's own link still attributes and pays commission normally
- [ ] Remaining self-purchase allowance visible to the partner in the hub

## Blocked by

- #77
