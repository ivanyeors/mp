# 06 — The scorecard: is the loop working?

**Issue:** not filed
**Type:** AFK
**Status:** **headline built** (2026-11-01); the other metrics not started
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

## As built so far (2026-11-01): the headline

- `admin_returning_customer_cohorts()` (migration `20261101081512`), server-only: by
  first-purchase month (Singapore), the first-time customers, and how many came back within 12
  months for an attended re-adjustment, for a second Purchase, and either. A Purchase is what the
  Customer overview counts (a goods line on a counted Order), so a refunded Order or a
  re-adjustment fee never is. Counts only; the card writes the rates.
- `lib/crm/returning-customers.ts` decides what may be a rate: a month whose 12 months are over
  for all of it, with 20 or more people. A month still inside its window is *still open*: counts
  so far, never a rate.
- A *Returning customers* card under the lifecycle chart on Customers (`customers`): the headline
  sentence for the latest closed month, then the closed months with their rates and the open
  months with their counts. Purchases on this site only until slice 09 imports the Shopify-era
  orders, and the card says so.
- **Tests:** `supabase/tests/crm/assert-06-returning-customers.sql` (within and after 12 months,
  attended versus booked, refunded and fee Orders, the Singapore month boundary, someone who did
  both counted once); `lib/crm/__tests__/returning-customers.test.ts`.
- **Still to build:** the other metrics (M9 to M25 and the funnel half on Analytics), and links
  from a number to the list that makes it.

## Acceptance criteria

- [x] Every rate shows its counts; under 20 in a denominator, counts only. (The headline.)
- [x] Cohorts younger than the window are marked *still open*, never shown as a low rate. (The
  headline.)
- [ ] Shopify-era purchases count once slice 09 has imported them, and the card says from when.
- [x] Nothing here decides who receives a Review request.
