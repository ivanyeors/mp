# CRM retention loop: vertical slices (issues)

A tracer-bullet breakdown of the PRD (`../crm-retention-loop-prd.md`). Each slice is a thin,
demoable path through the layers it touches.

- **Triage label:** `needs-triage` (all slices)
- **Tracker:** not filed yet. File the PRD as a parent issue and each slice as a sub-issue, then
  link them in the table below.
- **Owner decisions:** see the PRD. Slice 03 waits on decision 1 (thresholds); slice 09 on the
  owner confirming the ADR 0029 amendment.
- **Definitions:** stages, signals and metrics are in [`../lifecycle-and-metrics.md`](../lifecycle-and-metrics.md).

## Slices

| # | Title | Type | Status | Blocked by |
|---|-------|------|--------|------------|
| [01](01-crm-sidebar-group.md) | One CRM group in the sidebar, in loop order | AFK | **built** | none |
| [02](02-hand-off-links.md) | Hand-offs: every page in the loop links to the next | AFK | not started | 01 |
| [03](03-lifecycle-stage.md) | A lifecycle stage on every Customer, derived from their Orders | AFK | not started | owner decision 1 |
| [04](04-stage-chips.md) | Stage chips above the Customers list, counted live | AFK | not started | 03 |
| [05](05-next-step-on-customer.md) | The next step on the Customer | AFK | not started | 03 |
| [06](06-retention-numbers.md) | The scorecard: is the loop working? | AFK | not started | 03 |
| [07](07-stage-playbooks.md) | Playbooks: a ready-written campaign for each stage | AFK, then HITL | not started | 02, 03 |
| [08](08-signoff.md) | Sign-off: the owner walks the loop on production | HITL | not started | 01–07, 09, 10 |
| [09](09-shopify-order-history.md) | Shopify-era order history, settled once, for the same lifecycle | AFK, then HITL | not started | owner confirms the ADR 0029 amendment |
| [10](10-ask-why-they-left.md) | Ask why they left, and close the loop | AFK, then HITL | not started | none (on-site); 02 (Follow-up) |

## Dependency graph

```mermaid
graph TD
  s01[01 CRM sidebar group]
  s02[02 Hand-off links]
  d12[Owner decision 1: thresholds]
  d29[Owner confirms ADR 0029 amendment]
  s09[09 Shopify-era order history]
  s10[10 Ask why they left]
  s03[03 Lifecycle stage]
  s04[04 Stage chips]
  s05[05 Next step]
  s06[06 Scorecard]
  s07[07 Playbooks]
  s08[08 Sign-off · HITL]

  s01 --> s02
  d12 --> s03
  s03 --> s04
  s03 --> s05
  s03 --> s06
  s02 --> s07
  s03 --> s07
  s04 -. stage Segments .-> s07
  s02 --> s08
  s04 --> s08
  s05 --> s08
  s06 --> s08
  s07 --> s08
  d29 --> s09
  s09 -. dates for Shopify customers .-> s03
  s09 -. imported purchases .-> s06
  s02 -. Follow-up hand-off .-> s10
  s09 --> s08
  s10 --> s08
```

## Build order

1. **02 and 10's on-site question next.** Neither needs a decision. 10 starts collecting reasons
   now, so there is data by the time the scorecard reads it.
2. **03 once the owner sets the thresholds.** Everything after it reads the stage. Shopify
   customers are placed by count until 09 lands.
3. **09 once the owner confirms the ADR 0029 amendment.** It gives Shopify customers their dates.
4. **04, 05 and 06 in parallel.**
5. **07** once its words are approved; **08** closes the build.
