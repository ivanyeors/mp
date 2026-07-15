# Slice 06 — Section tracer: home tags + expand/collapse

Type: AFK  
Parent: PRD `prospect-journey-analytics` (`.claude/PRD-prospect-journey-analytics/prospect-journey-analytics-prd.md`)  
Triage: needs-triage  
User stories covered: 4, 5, 7, 25, 48

## What to build

Section-level Drop-off diagnosis starting on home.

- Add stable `data-section` markers on home (meaningful blocks only)
- Tracker emits `section_view` via IntersectionObserver
- Persist section on events; Drop-off can record last section
- Admin graph: expand a page node → section child nodes; collapse restores page-only

## Acceptance criteria

- [x] Home sections fire section_view into DB when in view
- [x] Drop-off Visit can store last section when available
- [x] Staff can expand/collapse home (or page) into section nodes in the journey UI
- [x] Untagged pages still work at page-level only

## Proof (2026-07-15)

- `npx tsx lib/analytics/journey/section.check.ts` — tags, IO tracer, ingest parse, drop-off section, expand/collapse pure logic
- Live DB (`scripts/_tmp-section06-signoff.mts`): 3× `section_view` → Visit `drop_off_section=pick-your-mpillow`; expand `/` yields `/#hero→/#size-matters`; collapse stays page-only

## Notes

- Home tags: `data-section={section.slug}` wrapper on landing blocks in `app/[lang]/page.tsx`
- Tracker: IntersectionObserver (25% visible, once per section per navigation)
- Admin: `expandPath` on `getProspectJourneyTransitions` + Expand/Collapse in `ProspectJourneyCard`

## Blocked by

- Slice 02 — Page-view tracer
- Slice 03 — Visit lifecycle + Drop-off sink
