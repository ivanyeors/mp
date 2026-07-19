# Slice 03 — Seeding + single-engine cutover

Type: AFK
Parent: PRD `rules-engine` (`.claude/PRD-rules-engine/rules-engine-prd.md`)
Triage: done
User stories covered: 16, 17, 18, 19, 36, 37

## What to build

The published **Rule graph** becomes the single recommendation authority; legacy engines retire.

- Seed and publish v1 graphs reproducing today's behavior: Premium — in-store shoulder bands (≤36/≤40/≤46/≤52/>52 cm → XS–XL) → size, neck-trio ranges → that size's **Default Filling Template**; Basic — shoulder bands → size → Default Filling Template (no Flow route wired yet); Mbolster — height bands → length → Default Filling Template.
- Cut all three callers over to `evaluate()`: shop customize ballpark, in-store response suggestion GET, basic recommend endpoint. Fix the Premium flow resolving against premium **Composed sellables** (retires the online `kind: basic` bug); suggestion responses use **tier** language.
- **Bootstrap guard**: flows without a published graph fall back to legacy rules; guard removed once all three seeds are published (ponytail comment marks it until then).
- Retire `SIZE_MAP` body-type sizing, in-store shoulder-band inference, and basic recommend internals. mp-maker legacy `FILLING_SPECS` path untouched.
- **Recommendation record** persisted on the configurator response and copied to the **Result** at hold create: graph version id, fired terminals, resolved outputs, evaluation trace. Guest filling snapshot stays null (spatial PRD rule).
- Vitest: seed-equivalence (seeded graphs reproduce legacy outputs across the input space — the regression net for the cutover), recommendation-record lifecycle.

## Acceptance criteria

- [x] All three recommendation endpoints return graph-derived results with the graph version id attached; shop and in-store surfaces can no longer disagree on size
- [x] Seed-equivalence tests pass: seeded graph outputs match legacy engine outputs for representative and boundary inputs
- [x] Premium online path recommends premium tier product cards (no more hardcoded basic)
- [x] A Result created after cutover carries the full recommendation record; filling snapshot remains null for guest holds
- [x] Legacy engine code paths are deleted (except mp-maker), or unreachable behind the bootstrap guard with a ponytail comment

## Proof (2026-07-19)

- `npx vitest run lib/rules-engine lib/results/__tests__/slice-13-instore-review-only.test.ts` — 52+ passed (seed-equivalence, recommendation-record, evaluate/validate)
- `npx tsx lib/rules-engine/slice-03.check.ts` — ok
- `npx tsx lib/rules-engine/slice-01.check.ts` — ok
- Migration `20260719200000_recommendation_record.sql` applied via `npm run db:push`
- Seeds published: `npm run db:seed-rule-graphs` → premium / basic / mbolster v1
- Bootstrap guard remains in `recommendWithEngine` with ponytail comment for envs without seeds; unreachable once v1 is published

## Re-seed

```bash
npm run db:seed-rule-graphs           # no-op if published versions exist
npm run db:seed-rule-graphs -- --force  # publish next version from current Default Filling Templates
```

## Blocked by

- Slice 01 (schema + engine core). Slice 02 is not a blocker — seeds can be written as JSON.
