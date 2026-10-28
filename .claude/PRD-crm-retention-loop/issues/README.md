# CRM retention loop: vertical slices (issues)

A tracer-bullet breakdown of the PRD (`../crm-retention-loop-prd.md`). Each slice is a thin,
demoable path through the layers it touches.

- **Triage label:** `needs-triage` (all slices)
- **Tracker:** [#336](https://github.com/ivanyeors/mp/issues/336) is the PRD issue. Each slice is a
  sub-issue, and its row below links it.
- **Owner decisions:** see the PRD. Decisions 1 (thresholds) and 4 (the funnel, 2026-10-28) are
  settled; slice 09 waits on the owner confirming the ADR 0029 amendment.
- **Definitions:** stages, signals and metrics are in [`../lifecycle-and-metrics.md`](../lifecycle-and-metrics.md).

## Slices

| # | Title | Type | Status | Blocked by |
|---|-------|------|--------|------------|
| [01](01-crm-sidebar-group.md) · [#337](https://github.com/ivanyeors/mp/issues/337) | One CRM group in the sidebar, in loop order | AFK | **built** | none |
| [02](02-hand-off-links.md) · [#338](https://github.com/ivanyeors/mp/issues/338) | Hand-offs: every page in the loop links to the next | AFK | **built** (`claude/crm-loop-handoffs-dropoff`) | 01 |
| [03](03-lifecycle-stage.md) · [#339](https://github.com/ivanyeors/mp/issues/339) | A lifecycle stage on every Customer: Lead, New, Loyal, At risk, Lost | AFK | **built** (`claude/crm-loop-handoffs-dropoff`), reworked into the funnel 2026-10-28 | none (decisions 1 and 4 settled) |
| [04](04-stage-chips.md) · [#340](https://github.com/ivanyeors/mp/issues/340) | Stage chips above the Customers list, counted live | AFK | not started | 03 |
| [05](05-next-step-on-customer.md) · [#341](https://github.com/ivanyeors/mp/issues/341) | The next step on the Customer | AFK | not started | 03 |
| [06](06-retention-numbers.md) · [#342](https://github.com/ivanyeors/mp/issues/342) | The scorecard: is the loop working? | AFK | not started | 03 |
| [07](07-stage-playbooks.md) · [#343](https://github.com/ivanyeors/mp/issues/343) | Playbooks: a ready-written campaign for each stage | AFK, then HITL | not started | 02, 03 |
| [08](08-signoff.md) · [#344](https://github.com/ivanyeors/mp/issues/344) | Sign-off: the owner walks the loop on production | HITL | not started | 01–07, 09, 10 |
| [09](09-shopify-order-history.md) · [#345](https://github.com/ivanyeors/mp/issues/345) | Shopify-era order history, settled once, for the same lifecycle | AFK, then HITL | not started | owner confirms the ADR 0029 amendment |
| [10](10-ask-why-they-left.md) · [#346](https://github.com/ivanyeors/mp/issues/346) | Ask why they left, and close the loop | part 1 AFK, part 2 HITL | **part 1 built** (`claude/crm-loop-handoffs-dropoff`) | none (part 1) |
| [11](11-why-they-unsubscribe.md) | Ask why they unsubscribe, and keep it on the Lost Customer | AFK, then HITL | not started | 03 |

## Dependency graph

```mermaid
graph TD
  s01[01 CRM sidebar group]
  s02[02 Hand-off links]
  d12[Owner decision 1: thresholds, settled]
  d29[Owner confirms ADR 0029 amendment]
  s09[09 Shopify-era order history]
  s10[10 Ask why they left]
  s11[11 Why they unsubscribe]
  d4[Owner decision 4: the funnel, settled]
  s03[03 Lifecycle stage]
  s04[04 Stage chips]
  s05[05 Next step]
  s06[06 Scorecard]
  s07[07 Playbooks]
  s08[08 Sign-off · HITL]

  s01 --> s02
  d12 --> s03
  d4 --> s03
  s03 --> s11
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
