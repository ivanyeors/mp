# Paired build — issue index

Parent PRD: `.claude/PRD-paired-build/paired-build-prd.md` · ADR 0026

| # | Slice | Type | Status | Blocked by | User stories |
|---|-------|------|--------|------------|--------------|
| 01 | Schema + pure pair rules | AFK | in-progress | — | 9–11 |
| 02 | Hold creates a Paired build under one Checkout; pair-aware attach; shipping once | AFK | in-progress | 01 | 4, 8 |
| 03 | Pair-aware decline / cancel / expiry / delete | AFK | in-progress | 01 | 7, 10 |
| 04 | Accept: one capture, one Order | AFK | in-progress | 01 | 6, 7, 11 |
| 05 | Status page, emails, admin link | HITL | in-progress | 02–04 | 6, 7, 9 |
| 06 | Configurator stepper (1 Mpillow · 2 Mbolster, skippable) | HITL | in-progress | 02 | 1–3, 5 |
| 07 | Wire `uses_bolster → route-mbolster` on the Premium graph and publish | HITL (Staff) | todo | 01–06 shipped + migration applied | 1 |

Slice 07 is the rollout gate: until it is published, no shopper reaches the stepper.
