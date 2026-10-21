# 01 — Glossary and ADR 0030: what a point is, and what it is not

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** the migration branch merging
**User stories:** underpins all
**Labels:** `documentation`, `enhancement`, `needs-triage`, `P2`, `area:checkout`

## Goal

Write the vocabulary down before any table is named. "Points" invites designs the owner ruled
out on 2026-10-21: tiers, a rewards shop, store credit that refunds as cash, and spending on
custom pillows. These terms close those doors.

## CONTEXT.md entries

Add a section `## Loyalty points (ADR 0030)`.

**Points** — a **Customer**'s balance, worth S$0.01 each (100 points = S$1), spent only as
money off a shop **Order**. Earned on what the customer pays for, and from a one-time **Claim
bonus**. Points cannot be cashed out, transferred, bought, or used on a **Result**, and points
used are never refunded. Partners neither earn nor spend them; their reward is the partner
milestone tiers.
_Avoid_ — "store credit", "wallet", "cashback" (each implies cash value or a refund), "rewards"
(there is no catalogue), "tier" or "member" for customers (a **Member** is **Staff**; tiers are
the partners').

**Points ledger** — the append-only record of every change to a balance (`points_ledger`): earn,
Claim bonus, spend, spend release, clawback, expiry and Staff adjustment. The balance is the sum
of the entries and is never stored on `customers`.
_Avoid_ — editing or deleting an entry. A correction is a new `adjust` entry with a reason.

**Pending points** — what a paid **Order** will earn once its return window closes, 30 days after
delivery. They are computed from the Order and are not in the ledger until then.
_Avoid_ — letting pending points be spent, or counting them in the balance.

**Claim bonus** — 1,000 points a **Migrated customer** receives once (`kind = 'claim_bonus'`),
when their **Claim** falls within 3 months of the first campaign email we sent them, or of the
first wave if we never emailed them. A customer who claimed before points existed receives it at
their next **Sign in**.
_Avoid_ — "welcome-back voucher" (deleted by this ADR), "sign-up bonus" (only Migrated customers
get it), a calendar end date (each customer's window is their own).

**Points expiry** — the whole balance expires 24 months after the customer's last paid Order, or
after their Claim bonus if that is later. A new purchase restarts the clock. Reminders go 3, 2
and 1 months before, only to customers with **Marketing consent**.
_Avoid_ — expiring points per batch, or describing expiry as fixed at earning time.

### Changed entries

- **Claim**: "issues the **Welcome-back voucher**" becomes "grants the **Claim bonus**".
- **Welcome-back voucher**: prefix it with "Deleted by ADR 0030; slice 06 removes the code."
  Slice 06 deletes the entry. Drop "points" from its _Avoid_ list now.

## ADR 0030 — Loyalty points

Record the owner's decisions 1–15 and rules (a)–(r) from the PRD, then these considered options:

- **Keep the voucher.** Rejected. It exists only at the Claim, so anyone claiming while it was off
  could never get one, and it rewards nothing after the first order.
- **Per-batch expiry (each earning expires 12 or 24 months after it was earned).** Rejected.
  Pillows are bought every two to four years, so batch expiry wipes most pillow-earned points
  before the customer returns. Expiring the whole balance on inactivity also removes any need
  for first-in-first-out lots.
- **Spending on Results in v1.** Rejected. It changes the hold amount, six pricers, the seven
  hold endings and the capture plan (PRD audit §2). Earning on Results is kept, because it reads
  only the paid Order.
- **The balance as a column on `customers`.** Rejected. The customer can read their own row, and
  a stored total drifts from its history.
- **Coupon-style "no reservation".** Rejected for points. ADR 0029 (j) accepted it for a
  one-person, one-use voucher, but a balance can be spent twice from two tabs.
- **Splitting points across order lines so a return refunds only its cash share.** Rejected by
  the owner. A return refunds cash first, and the points stay spent on what was kept. That
  needs no refund change, and it accepts that a kept item can end up paid wholly in points.
- **Account-bound coupons as the incentive.** Rejected by the owner. A code-based incentive uses
  the Discounts feature as it is, with no customer binding.
- **Points for partners.** Rejected by the owner. Partners have milestone tiers, so their
  accounts hold no points.

## Amendments to the migration

- **ADR 0029.** Add a dated line under decision (g): "2026-10-21: the incentive is the **Claim
  bonus** in points (ADR 0030); the Welcome-back voucher is deleted."
- **`PRD-shopify-customer-migration`.** Add the same line to *The incentive* and to *Open
  decisions* item 2 (voucher terms are replaced by the Claim bonus terms).
- **Its issues README.** Mark slice 05's voucher half as superseded by `PRD-loyalty-points`
  slices 05 and 06.

## Acceptance criteria

- [ ] CONTEXT.md has the five entries and the two changes above.
- [ ] `docs/adr/0030-loyalty-points.md` records decisions 1–15, rules (a)–(r) and the rejected
      options.
- [ ] ADR 0029, the migration PRD and its README carry the dated amendment.
- [ ] `./scripts/graphify update .` is run in the same commit.
