# Slice 15 — Dig-in viz polish + Section expand on-node chrome

Type: AFK  
Parent: PRD `prospect-journey-analytics` (`.claude/PRD-prospect-journey-analytics/prospect-journey-analytics-prd.md`)  
Triage: needs-triage  
User stories covered: 4–5, 19 (dig-in viz), grill Jul 2026  
Glossary: `CONTEXT.md` — **Section expand**, **Expanded node**, **Time on page**, **Routes**

## What to build

Polish dig-in + Section expand chrome. Do not reopen slice 14.

1. **Section expand on-node**
   - Move Expand/Collapse off the toolbar strip of `Expand {path}` buttons
   - Dedicated **chevron / Sections** control on expandable page nodes; `stopPropagation` so it does not open dig-in
   - **Node body click** → **Expanded node** (unchanged)
   - **Section expand** and **Expanded node** independent; at most one `expandPath` at a time
   - Toolbar above graph stays filters-only

2. **Time on page** (was “Dwell samples”)
   - Rename UI to **Time on page**
   - **Line histogram** of per-Visit page dwells; bin width **10s**; X **0 → max**
   - Axis **caps at 10m** with final **≥10m** overflow bin; median/mean on raw samples
   - Reference: **median** solid vertical line, **mean** dotted; tiny legend
   - No campaign trend chart

3. **Routes** (was “Sample paths”)
   - Rename UI to **Routes**
   - Aggregate identical Visit page sequences; ranked **bar chart** by count
   - Idle: bars + short rank only; hover tooltip = full route via `labelPath` + count
   - Default top **5**; dig-in chevron expands to top **10**
   - Dig-in payload: ranked `{ pathSeq, count }[]` (replace anonymous first-N `samplePaths` samples for this UI)

4. **Return timeline** — leave text list (deferred viz)

## Acceptance criteria

- [x] No toolbar “Expand {path}” strip; Section expand only via on-node chevron
- [x] Body click opens dig-in; chevron toggles Section expand without opening dig-in
- [x] Section expand + Expanded node can both be open; only one expandPath at a time
- [x] Dig-in shows **Time on page** line histogram with 10s bins, 0→max, 10m cap + overflow, median solid + mean dotted
- [x] Dig-in shows **Routes** bar chart: top 5, expand to 10; path text only on hover via `labelPath`
- [x] Aggregates return ranked route counts (not uncounted sample list) for dig-in
- [x] Return timeline still a list; no new return chart

## Proof

- Unit: `npx tsx lib/analytics/journey/dig-in-viz.check.ts` + `slice-15.check.ts` (+ section / expanded-node / loops-chrome)
- Live: `npx tsx --env-file=.env.local lib/analytics/journey/slice-14.smoke.ts` (routes payload)

## Blocked by

- Slice 14 — Expanded node dig-in (shipped)
- Slice 06 — Section expand API (`expandPath`) already exists

## Notes

- Decisions captured in `CONTEXT.md` flagged ambiguities (grill Jul 2026)
- GTM/GA: Admin graph remains DB-only (ADR 0007); out of scope for this slice
