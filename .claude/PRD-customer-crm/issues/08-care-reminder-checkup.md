# 08 — *(owner decision)* The periodic "time for a re-adjustment" reminder

**Type:** AFK
**Blocked by:** 07; owner decision 2 (with counsel)
**User stories:** 11
**Labels:** `enhancement`, `needs-triage`, `P3`, `area:customers`, `area:email`, `area:readjustment`

## Goal

Some months after delivery, a pillow owner hears that a re-adjustment would help. This one is
a **paid** visit (ADR 0024: after the free window, the fee applies). That makes it closer to
promotion than slice 07's reminder, and the route depends on how it is classified.

## The decision this waits on

Is it a service message about a product they own, or marketing? Counsel decides. The answer
picks one of two builds, and the other is closed.

### If it is a service message: build it here

- It reuses slice 07 whole: the same candidate query shape, the same `care_reminders_email`
  opt-out, the transactional transport and the `order_emails` ledger.
  - The template is `care.checkup_<months>m`, so each milestone sends once per Order.
- **Timing:** `delivered_at + care_checkup_months` (default 12). It skips anyone with a
  re-adjustment booked or attended in the previous `care_checkup_months`.
- **Coverage** is owner decision 2: Premium only, every Mpillow, or Mbolster too.
- **No offer**, and no price beyond *"the re-adjustment fee applies"* with a link to the
  Services page.

### If it is marketing: hand it to email marketing and close this slice

It becomes an automated flow in `PRD-email-marketing`:

- sent only to `subscribed` Customers;
- through the campaign transport;
- with one-click unsubscribe.

The CRM supplies its Segment, using slice 04's `bought` and `last_readjusted_at` filters.
Nothing is built here.

## Acceptance criteria

- [ ] The decision is recorded in this file and in ADR 0027, with the date and who decided.
- [ ] **Service route:** slice 07's tests, re-run with the check-up timing, pass. A Customer
      re-adjusted within the period is skipped.
- [ ] **Marketing route:** a line in `PRD-email-marketing` names this flow and its Segment, and
      this slice is closed as *moved*.
