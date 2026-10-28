# 06 — The scorecard: is the loop working?

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** 03
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:analytics`

## Goal

The owner sees whether customers come back, and where the loop leaks. The demo: a *Returning
customers* card reads *Of customers who first bought in March, 31% came back within 12 months
(re-adjustment 22%, second purchase 14%)*, above a table of the metrics, each by monthly cohort.

## What to build

The metrics in [`../lifecycle-and-metrics.md`](../lifecycle-and-metrics.md#success-metrics),
in this order:

1. **The headline:** Returning customer rate by first-purchase month, split into came back for a
   re-adjustment and came back to buy.
2. **After the first purchase:** M9 to M25 that need no new data: returns, reviews, re-adjustment
   uptake, check-up response, more than one pillow, Mbolster attach, repeat purchase rate (Adobe's
   formula), second purchase within 12 months, one-time buyers, time to second purchase,
   customers by stage, win-back, campaign to purchase, imported customers, points, spend per
   customer.
3. **Before the first purchase:** M3, M4, M5 and M8 from the journey tables and Results, beside
   the existing M1 and M6 on Analytics.

How:

- Server-only SQL functions, one per metric family, each returning the cohort rows the card
  draws. Each metric's numerator and denominator are returned, never only the rate.
- A *Returning customers* card on Customers (list tab) with `customers`, and the funnel half on
  Analytics with `analytics`.
- Each number links to the list that makes it, where one exists: *one-time buyers* opens the
  Customers list filtered to it.

## Acceptance criteria

- [ ] Every rate shows its counts; under 20 in a denominator, counts only.
- [ ] Cohorts younger than the window are marked *still open*, never shown as a low rate.
- [ ] Shopify-era purchases count once slice 09 has imported them, and the card says from when.
- [ ] Nothing here decides who receives a Review request.
