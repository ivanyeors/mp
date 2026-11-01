# 14 — Sign-off: the owner sends three of the plan's emails on production

**Issue:** not filed
**Type:** HITL
**Status:** not started
**Blocked by:** 02, 04, 06, 07, 08, 09 (10 and 11 if built by then)
**Labels:** `needs-triage`, `P2`, `area:email`

## Goal

The owner sends the right email to the right people, end to end, and sees what came back.

## Steps

1. Check out on production with the box ticked; the Customer shows *subscribed · at checkout*.
2. Build *Bought a pillow · Didn't buy Mbolster · Delivered over 30 days* on Customers, save it as
   a Segment, and *Email this Segment*.
3. Add *Bought in the last 14 days* as an exclusion. *Check who it goes to* shows the exclusion
   and the rest period by name.
4. Read the fit checks; fix one (add a Chinese version, or a *Ships to* filter).
5. Send a test, then a Wave of 25.
6. Click the email as a test customer; the send shows the click. Unsubscribe from it; the
   campaign shows the unsubscribe.
7. If slice 10 is built: set *We miss you* to keep sending with a cap of 10, and read the next
   day's Wave on its page.

## Acceptance criteria

- [ ] Every step works on production, on a phone and a desktop.
- [ ] Bounces and spam reports stay under the pause rule's lines.
