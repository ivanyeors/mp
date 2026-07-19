# Rules Engine — issue index

Parent PRD: `.claude/PRD-rules-engine/rules-engine-prd.md`

| # | Slice | Type | Status | Blocked by | User stories |
|---|-------|------|--------|------------|--------------|
| 01 | Rule graph schema + evaluation & validation core | AFK | done | — | 5, 8–11, 13, 14, 16, 18 |
| 02 | Workbench canvas (React Flow, palette, test panel, versions) | HITL | needs-triage | 01 | 1–4, 6, 7, 12, 15 |
| 03 | Seeding + single-engine cutover | AFK | needs-triage | 01 | 16–19, 36, 37 |
| 04 | Configurator inputs: inches default, all required | AFK | done | 01 | 20–23 |
| 05 | Preview recommendation display + assign hint upgrade | AFK | needs-triage | 03, 04 | 24–29 |
| 06 | Flow route: upsell/cross-sell + carry-over + journey | HITL | needs-triage | 03, 05 | 11, 30–35 |
| 07 | X-ray read-only preview upgrade | AFK | needs-triage | 05, spatial PRD slice 07 | 38, 39 |

Parallelizable after 01: slices 02, 03, 04 are independent of each other.

External dependency: spatial PRD (`.claude/PRD-staff-assist-spatial-fillings/`) — soft on its slice 01 (templates work legacy-flat), hard on its slice 07 only for our slice 07.
