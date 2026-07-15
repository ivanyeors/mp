# Slice 14 — Expanded node dig-in (replace side panel)

Type: AFK  
Parent: PRD `prospect-journey-analytics` (`.claude/PRD-prospect-journey-analytics/prospect-journey-analytics-prd.md`)  
Triage: needs-triage  
User stories covered: 19 (amended), 7 (exit share), plus dig-in UX from grill Jul 2026  
Glossary: `CONTEXT.md` — **Expanded node**, **Section expand**, exit section anchor links

## What to build

Replace the node-click **side / split drawer** with in-place **Expanded node** dig-in. Slice 07’s side panel stays historical proof; do not reopen 07.

- Click page node → grow that node’s chrome in place (taller); show dig-in inside the node; outer Analytics Card size unchanged
- Remove `DetailPanel` / overlay drawer (and Converted overlay); **Converted** expands in place with Converted fields
- **Drop-off** stays non-expandable; section children after **Section expand** stay compact (no dig-in)
- Dig-in content: median dwell, exit sections, dwell samples, sample paths, return timeline, **exit section share %** of that page’s drop-offs, **outbound top transitions** (to → count)
- Exit sections render as storefront **anchor links** `{origin}/{lang}{path}#{sectionId}` (Admin `[lang]`); open new tab
- Storefront: set HTML `id` equal to `data-section` / `data-step` on tagged surfaces so hashes scroll
- **Split fetch**: node click must not refetch the transition graph; thin `getProspectJourneyNodeDetail` (or equivalent) with same filters; graph reloads only on date/filters/**Section expand**/Include converted

## Acceptance criteria

- [x] Page node click expands that node in place; no slide-in / split drawer
- [x] Canvas click / Esc / close collapses Expanded node and clears selection
- [x] Dig-in shows the agreed content set including exit share % and outbound transitions
- [x] Exit section rows are live storefront links with Admin lang; matching `id`s exist on tagged sections
- [x] Converted expands in place; Drop-off and section children do not open dig-in
- [x] Selecting a node does not reload graph nodes/edges (detail-only fetch)

## Proof

- Check: `npx tsx lib/analytics/journey/expanded-node.check.ts` (+ updated `loops-chrome.check.ts`, `analytics-ui.check.ts`)
- Live DB: `npx tsx --env-file=.env.local lib/analytics/journey/slice-14.smoke.ts` — Home dig-in exits `#pick-your-mpillow` @ 100% share, outbound Drop-off/Shop, graph load `detail === null`
- Storefront: home / PDP / checkout / Result / configurators set `id` equal to `data-section` / `data-step`

## Blocked by

- Slice 07 — Unique-node loops + custom node chrome + side panel (shipped; this slice supersedes dig-in UX only)
- Slice 06 / 11 — Section tags (need stable section ids for anchors)

## Notes

- Supersedes PRD story 19 “side panel” wording → **Expanded node**
- Do not conflate with **Section expand** (`expandPath`)
