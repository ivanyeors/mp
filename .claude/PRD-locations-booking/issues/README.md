# PRD — Locations, Result Location, SLA relocation & custom booking

Parent PRD: [`../locations-booking-prd.md`](../locations-booking-prd.md)

Vertical-slice issues (tracer bullets). AFK unless marked HITL.

| # | Slice | Type | Blocked by |
|---|-------|------|-----------|
| 01 | Glossary + ADRs | HITL | — |
| 02 | Unified `locations` schema + partner migration | AFK | 01 |
| 03 | Locations admin page | AFK | 02 |
| 04 | Result Location column | AFK | 02 |
| 05 | Results multi-select + bulk bar | AFK | 04 |
| 06 | Review SLA relocation | AFK | — (sequence after 05; same file) |
| 07 | Booking backend (slots + createEvent) | AFK | 01, 02 |
| 08 | Custom booking UI | AFK | 07 |
| 09 | Staging E2E sign-off | HITL | 03, 05, 06, 08 |

Tracker: local only (no GitHub issues created for this PRD).

## Status — all slices complete (2026-07-25)

01–08 built + proven (649 tests green); **09 approved by user** (sg@mpillow.com).
Branch `feat/locations-booking` fast-forward merged into local `main` (HEAD `3391bb54`).
Additive migrations already on prod. **Not yet deployed** — `git push origin main`
(the user's remaining step) triggers the Vercel prod deploy.
