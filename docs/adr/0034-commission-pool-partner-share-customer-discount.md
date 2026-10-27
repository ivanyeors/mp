# Partner commission follows the agreement's Schedule: a flat pool per qualifying order, the partner's share, and a customer discount Staff turn on

Status: Accepted (2026-10-27)

## Context

The Referral Partner Agreement (owner's v1.0, loaded in Admin → Partners → Agreement) replaces the
per-unit commission schemes of ADR 0015 with one rule, its Schedule:

- **Commission Pool**: a flat S$50 per **Qualifying Sale**, once per order however many eligible
  products it holds (clause 6.4).
- **Eligible Product**: a customised premium pillow only. Basic pillows, bolsters and accessories
  earn nothing (clause 1.5).
- **Qualifying Sale**: attributed, paid, holding an Eligible Product, past its refund period, and
  with no Eligible Product refunded (clause 6.3).
- **Your Commission**: the pool, or any lower amount the partner picks in the Partner Portal. A
  changed pick starts the day after the next **Payout Date** (the last business day of a month),
  and the pick that applies to an order is the one in force the day the customer pays (clause 7.2).
- What the partner does not take is released to Mpillow, "and Mpillow decides how (if at all) to
  use it" (clause 7.2). Offers to customers are Mpillow's own (clause 5.1); a partner may not rebate
  (clause 5.2).
- Nothing is paid beyond the agreement (clause 7.8).

The owner asked for Staff to set each partner's commission when they approve them, and to turn a
discount for that partner's customers on or off, in the Admin Panel only.

## Decision

- **Per-partner terms on the `partners` row.** `commission_pool` (default 50, the Schedule's),
  the partner's `commission_choice` (null = the whole pool), a waiting change
  (`commission_choice_next`, `commission_choice_next_from`), and `customer_discount_enabled`. The
  rules are one pure module, `lib/partner-terms`.
- **Staff set the pool and the discount.** At approval (Partner applications → Approve opens a
  dialog, prefilled with the Schedule's S$50) and later per partner on Partner commissions →
  Partner terms. Approval also issues the Promo Code so the approval email can state it, the
  Territory and the pool, as the agreement's Approval Notice requires (clause 1.1).
- **The partner picks their share in the Partner Hub.** "Your commission" shows the pool, what they
  take, what their customers get, and any waiting change. A new pick waits for the day after the
  next Payout Date; picking what is in force cancels a waiting change. The partner never sees a
  discount control: whether their unused pool reaches customers is Mpillow's offer, not theirs.
- **The customer discount is the unused pool.** When Staff turn it on, a customer who types the
  partner's code gets `pool − partner's commission` off a customised premium pillow. The checkout
  code check shows it ("Referral code active … S$20 off") and the page total moves, as for a
  discount code. A referral link alone attributes but gives no discount, so the price shown is the
  price charged. A discount code and a partner discount never stack (one code per order).
- **The hold fixes both numbers.** It stores the partner's commission on the Result
  (`partner_commission`, clause 7.2: the day the customer pays) and the discount as the Result's
  `coupon_terms` (`fixed_amount`) with `coupon_code` = the Promo Code and `coupon_id` null. Every
  repricing already takes `coupon_terms` off the goods (ADR 0033), so assign, finish, request-payment,
  reconfigure and Accept follow without change, and nothing counts a coupon use. Commission and
  discount therefore always add up to the pool the hold saw.
- **One commission per Qualifying Sale.** `createHeldCommissionsForOrder` writes one `commissions`
  row (`basis = 'order'`, unique per order) when the order holds an Eligible Product, priced from
  the hold's `partner_commission`, or from the partner's terms that day when the Result has none.
  A shop order never qualifies. Release is unchanged (30 days after delivery).
- **A refunded eligible pillow voids the order's commission.** `voidCommissionsForRma` voids the
  order's row when any refunded line is an Eligible Product, whichever line the row sits on.
  Exchange and replacement still keep it.
- **Milestones pay no money.** The bar counts Qualifying Sales; crossing a rung records the perk
  only. No cash bonus, no rate bump (clause 7.8, and a flat rate has nothing to bump). The rung
  editor no longer asks for either.

## Considered options

- **Staff set the partner's share too** — rejected by the owner: clause 7.2 gives the pick to the
  partner, in the Portal.
- **A partner-side discount toggle** — rejected: it would make the discount the partner's offer,
  which clause 5.1/5.2 forbids.
- **New Result columns for the partner discount** — rejected: every repricing site would need to
  read them. Reusing `coupon_terms` with no coupon behind it gets all of them for free.
- **Discount on a referral link visit too** — deferred: the configurator does not know the
  visitor's link stamp, so the page would show one price and charge another.
- **Skipping public holidays in the Payout Date** — deferred: there is no holiday calendar in the
  platform. Staff pay by hand and can pay a day early.

## Consequences

- **Apply the migration before the code**: referral lookups, the hold and Accept select the new
  columns. Defaults keep every existing partner on S$50, taking all of it, with no discount.
- Per-unit rows written before this stay as they are (`basis = 'unit'`) and keep their old void rule.
  `commission_schemes` is no longer read or written.
- If Staff assign a basic pillow to a Result held as premium, the customer keeps the discount they
  authorised (ADR 0033: a held price never moves), and the order earns no commission.
- Partner-assisted runs still attribute nothing while the partner is signed in on the device, because
  the self-referral check (prod hardening slice 09) matches the partner's own session. That predates
  this change and is not changed here.
- Supersedes ADR 0015's scheme and milestone money rules; its attribution and release rules stand.
