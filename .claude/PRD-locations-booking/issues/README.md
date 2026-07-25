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
