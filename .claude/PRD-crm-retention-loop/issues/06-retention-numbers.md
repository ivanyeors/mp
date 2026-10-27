# 06 — Retention numbers: do customers come back?

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** 03
**Labels:** `enhancement`, `needs-triage`, `P3`, `area:admin`, `area:analytics`

## Goal

The owner sees whether the loop works. The demo: a card reads *Repeat purchase rate 24% (first to
second Order) · 41% (second to third) · Median 210 days to a second Order*, beside the count of
customers by stage.

## What to build

- A server-only SQL function over counted Orders, with Adobe's formula: Customers with at least
  *x+1* paid Orders over Customers with at least *x*, for *x* = 1 and 2; and the median days
  between a Customer's first and second paid Order.
- A *Retention* card on Customers (the list tab, above the stage chips), with `customers`.
- Each number links to the list that makes it: *Bought once* is `stage=new`, and so on.

## Acceptance criteria

- [ ] Imported Shopify-era orders are not mixed into platform rates; the card says what it counts.
- [ ] With fewer than 20 Customers in a denominator, the rate shows the counts, not a percentage.
