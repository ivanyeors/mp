# 05 — The next step on the Customer

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** 03
**Labels:** `enhancement`, `needs-triage`, `P3`, `area:admin`

## Goal

Opening a Customer answers *what now?* The demo: a Customer delivered nine days ago reads *New ·
Review request goes in 5 days*; one last seen 14 months ago reads *At risk · Check-up was due in
March. Add a follow-up?*

## What to build

- A pure `nextStep(facts, now)` in `lib/crm/next-step.ts`, over facts the detail page already
  loads: stage, latest delivery, review request sent or due, check-up due, open follow-ups,
  marketing consent, points and their expiry. It returns one step, or none.
- Steps, first match wins:
  1. an open follow-up overdue → *Follow-up overdue*;
  2. an Order paid and not delivered → *Waiting on delivery*;
  3. review request due → *Review request goes on {date}* (it is automatic; nothing to press);
  4. check-up due and not booked → *Check-up due*, with *Add follow-up*;
  5. *At risk* and subscribed → *In the At risk Segment for the next campaign*;
  6. *At risk* and not subscribed → *Add follow-up* (a personal call, not marketing);
  7. points expiring within 3 months → *Points expire on {date}*.
- A *Next step* line at the top of the Customer detail, above the cards.

## Acceptance criteria

- [ ] No step ever suggests asking for a review (the request is automatic and goes to everyone
  alike) or offers a discount.
- [ ] The rules are pure and tested case by case.
- [ ] A Customer with nothing due shows no line.
