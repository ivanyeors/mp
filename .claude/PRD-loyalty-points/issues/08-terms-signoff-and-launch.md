# 08 — Sign-off: the terms, counsel, the accountant, a live test, then launch

**Issue:** not filed
**Type:** HITL
**Status:** not started
**Blocked by:** 03, 04, 05
**User stories:** all
**Labels:** `documentation`, `needs-triage`, `P2`

## Goal

Points go live with written terms that state every rule, a reviewed classification for each
email, and a liability figure the accountant accepts. Only then may the migration's waves start
(migration slice 09).

## Scope

**The terms page.**

- `/[lang]/points` is linked from checkout, the Profile Points card, every points email and the
  footer.
- It states, in plain words:
  - the value (100 points = S$1) and the earn rate (3 per S$1 paid, before GST, not on
    shipping);
  - pending for 30 days after delivery;
  - spent in S$1 steps, from S$5, up to half the products' price;
  - shop orders only, and not on custom pillows;
  - points used are not refunded, and a returned item refunds its cash share;
  - the Claim bonus;
  - expiry 24 months after the last purchase, with three reminders;
  - points cannot be cashed out, transferred or bought;
  - changes come with 30 days' notice and never reduce an existing balance.
- The copy is English, like every template today.

**Counsel** (not legal advice, for the owner to put to counsel):

- **Under the Consumer Protection (Fair Trading) Act:** is the terms page clear on the two
  exclusions (custom pillows, no refund of points used)?
- **Under the Spam Control Act:** are the Claim bonus email and the expiry reminders account
  notices or commercial messages? Slice 07 has the one-condition switch for the reminders, and
  `claimOnSignIn` takes the same gate for the bonus email.
- **Under the Payment Services Act:** do points stay a single-merchant loyalty scheme outside the
  e-money rules? The terms forbid buying, cashing out and transferring them.

**The accountant.**

- Points earned on a sale are a deferred liability under SFRS(I) 15. Ask whether a small-entity
  simplification applies.
- Agree which figure from the Settings → Points cost summary goes into the books, and how
  often.

**Production settings.** The owner sets `points_launch_at`, `points_claim_bonus` and
`points_claim_bonus_until`, then turns on `points_enabled`.

**The live test, with a real card on production.**

1. A Staff account buys a S$45 cover and pays in full.
2. Staff add 2,000 points with a note.
3. A second order uses S$20 of points.
4. Abandon a third Checkout with points and confirm they come back after it expires.
5. Return one item through an RMA and confirm the refund is its cash share.
6. Confirm every ledger entry on the Customer detail.

## Acceptance criteria

- [ ] The terms page is live and linked from all four places.
- [ ] Counsel's answers are recorded in ADR 0030, dated, and any gate they ask for is switched.
- [ ] The accountant's treatment is recorded in ADR 0030.
- [ ] The live test passes, and its Orders are refunded afterwards.
- [ ] The migration's issues README marks slice 09 as unblocked by points.
