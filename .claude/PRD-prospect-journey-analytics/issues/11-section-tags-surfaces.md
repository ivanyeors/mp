# Slice 11 — Section tags: PDP, configurators, checkout/Result

Type: AFK  
Parent: PRD `prospect-journey-analytics` (`.claude/PRD-prospect-journey-analytics/prospect-journey-analytics-prd.md`)  
Triage: needs-triage  
User stories covered: 25, 48

## What to build

Extend section instrumentation beyond home using the same `data-section` / `data-step` contract.

- Product detail page sections
- mp-config, mp-basic, mbolster-config steps as sections
- Checkout / Result hold→accept path (page-level guaranteed; sections where natural)
- No Admin Panel tagging

## Acceptance criteria

- [x] PDP and configurator steps emit section_view / step events into DB — tags + tracker `data-step` alias proven (`section-surfaces.check.ts`); live DB emit still needs staging browse
- [x] Expand on those pages in Admin shows section nodes when data exists — fixture `section_view` rows for PDP/configurator/checkout/Result expand to section nodes (`section-surfaces.check.ts`)
- [x] Checkout/Result path contributes page (and section when tagged) to Drop-off diagnosis — tagged-surface fixtures attach `drop_off_section` counts (`section-surfaces.check.ts`); live path still needs staging

## Proof

- Check: `npx tsx lib/analytics/journey/section-surfaces.check.ts`
- Live smoke: `npx tsx --env-file=.env.local lib/analytics/journey/slice-11.smoke.ts`
- Tracker observes `[data-section], [data-step]`
- Surfaces: PDP, mp-config/mp-basic, mbolster-config, checkout, Result
- Fixture proof: PDP/configurator/checkout/Result section nodes expand and preserve `drop_off_section` counts
- Staging browser walk remains Slice 13 HITL

## Blocked by

- Slice 06 — Section tracer
