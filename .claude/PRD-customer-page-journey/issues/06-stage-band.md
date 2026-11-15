# 06 — The Lifecycle stage band under the map

**Issue:** not filed
**Type:** AFK
**Status:** specified, not started
**Blocked by:** 04
**Labels:** `enhancement`, `area:admin`

## Goal

Under the map, a band shows which Lifecycle stage the Customer was in through each chapter:
*New* from the first purchase, *At risk* from twelve months after the last.

## What to build

- A server read of the dated facts the stage is computed from: each counted purchase with a
  goods line, each attended Re-adjustment booking, the fitting that dates a Shopify-era
  purchase, and when they unsubscribed.
- A pure `stageHistory(datedFacts, now)` that replays `lifecycleStage` at each fact and at each
  threshold (12 and 24 months after the last activity), returning `{ stage, from }` segments.
- The last segment must equal the overview's stage. A check runs both over the same Customers,
  as `lifecycle-stage.check.ts` does.
- The band, drawn under the map on the same time positions as the stops.

## Why it waits

The overview's SQL is the authority for the stage. A second reading of the same facts in
TypeScript has to be held equal to it by a test against a database, which this slice needs and
slices 01 to 05 do not.
