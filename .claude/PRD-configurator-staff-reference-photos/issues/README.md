# PRD — Staff reference-photo upload for the customisation forms

Parent PRD: [`../configurator-staff-reference-photos-prd.md`](../configurator-staff-reference-photos-prd.md)

Vertical-slice issues (tracer bullets). AFK unless marked HITL.

| # | Slice | Type | Blocked by |
|---|-------|------|-----------|
| 01 | Glossary + ADR (Reference/Sizing photo, session_id) | HITL | — |
| 02 | `config_upload` backend (schema + module + guard + API + tests) | AFK | 01 |
| 03 | Pillow reference-photo upload UI | AFK | 02 |
| 04 | Bolster reference-photo upload UI + session UUID | AFK | 02, 03 |
| 05 | Result-detail Reference photos gallery (both products) | AFK | 02 |
| 06 | Telegram append of reference photos (pillow) | AFK | 02 |
| 07 | Staging QA sign-off | HITL | 03, 04, 05, 06 |

Tracker: local only (no GitHub issues created for this PRD). Each issue carries `needs-triage`.
