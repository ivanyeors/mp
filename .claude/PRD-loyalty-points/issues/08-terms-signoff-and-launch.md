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
  - points used are not refunded. A return refunds cash, up to the cash paid on the order;
  - the Claim bonus: S$10, for claiming within 3 months of our email;
  - expiry 24 months after the last purchase, with three reminders to customers who agreed to
    marketing email;
  - partner accounts neither earn nor spend points;
  - points cannot be cashed out, transferred or bought;
  - changes come with 30 days' notice and never reduce an existing balance.
- The copy is English, like every template today.

**Counsel** (not legal advice, for the owner to put to counsel):

- **Under the Consumer Protection (Fair Trading) Act:** is the terms page clear on the two
  exclusions (custom pillows, no refund of points used)?
- **Under the Spam Control Act:** is the Claim bonus email an account notice or a commercial
  message? If commercial, `claimOnSignIn` gates it on Marketing consent. The expiry reminders
  already go only to customers who agreed (owner decision 9).
- **Under the Payment Services Act:** do points stay a single-merchant loyalty scheme outside the
  e-money rules? The terms forbid buying, cashing out and transferring them.

**The accountant.**

- Points earned on a sale are a deferred liability under SFRS(I) 15. Ask whether a small-entity
  simplification applies.
- Agree which figure from the Settings → Points cost summary goes into the books, and how
  often.

**Production settings.** The owner checks the seeded defaults (1,000-point bonus, 3-month
window), sets `points_launch_at`, then turns on `points_enabled`.

**The live test, with a real card on production.**

1. A Staff account buys a S$45 cover and pays in full.
2. Staff add 1,000 points with a note.
3. A second order, of two items, uses S$10 of points.
4. Abandon a third Checkout with points and confirm they come back after it expires.
5. Return one item of the second order through an RMA. Confirm the refund is cash only and no
   points come back.
6. Confirm every ledger entry on the Customer detail.
7. Confirm that a partner's account shows no points control at checkout.

## Acceptance criteria

- [ ] The terms page is live and linked from all four places.
- [ ] Counsel's answers are recorded in ADR 0030, dated, and any gate they ask for is switched.
- [ ] The accountant's treatment is recorded in ADR 0030.
- [ ] The live test passes, and its Orders are refunded afterwards.
- [ ] The migration's issues README marks slice 09 as unblocked by points.
