# Paired build — issue index

Parent PRD: `.claude/PRD-paired-build/paired-build-prd.md` · ADR 0026

| # | Slice | Type | Status | Blocked by | User stories |
|---|-------|------|--------|------------|--------------|
| 01 | Schema + pure pair rules | AFK | done | — | 9–11 |
| 02 | Hold creates a Paired build under one Checkout; pair-aware attach; shipping once | AFK | done | 01 | 4, 8 |
| 03 | Pair-aware decline / cancel / expiry / delete | AFK | done | 01 | 7, 10 |
| 04 | Accept: one capture, one Order | AFK | done | 01 | 6, 7, 11 |
| 05 | Status page, emails, admin link | HITL | hitl-review | 02–04 | 6, 7, 9 |
| 06 | Configurator stepper (1 Mpillow · 2 Mbolster, skippable) | HITL | hitl-review | 02 | 1–3, 5 |
| 07 | Wire `uses_bolster → route-mbolster` on the Premium graph and publish | HITL (Staff) | todo | 01–06 merged + migration `20261020004221_result_paired_build` applied | 1 |

Slice 07 is the rollout gate: until it is published, no shopper reaches the stepper.

## Proof (2026-10-19)

- `pnpm vitest run` — 3350 passed, including `lib/results/__tests__/paired-build.test.ts`,
  `pair-ending.test.ts`, `app/api/results/hold/__tests__/paired.test.ts`, the Paired build block in
  `app/api/results/[id]/accept/__tests__/exactly-once.test.ts`, and the pair attach cases in
  `app/api/stripe/webhook/__tests__/result-hold-amount.test.ts`.
- `npx tsx lib/configurator/paired-mbolster.check.ts` — stepper rules and wiring.
- Not yet exercised in a browser or against live Stripe: this container has no Supabase or Stripe
  credentials. Slices 05/06 need a human pass on a preview deploy before slice 07 is published.
