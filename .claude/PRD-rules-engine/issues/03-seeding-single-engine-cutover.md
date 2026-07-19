# Slice 03 — Seeding + single-engine cutover

Type: AFK
Parent: PRD `rules-engine` (`.claude/PRD-rules-engine/rules-engine-prd.md`)
Triage: needs-triage
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

- [ ] All three recommendation endpoints return graph-derived results with the graph version id attached; shop and in-store surfaces can no longer disagree on size
- [ ] Seed-equivalence tests pass: seeded graph outputs match legacy engine outputs for representative and boundary inputs
- [ ] Premium online path recommends premium tier product cards (no more hardcoded basic)
- [ ] A Result created after cutover carries the full recommendation record; filling snapshot remains null for guest holds
- [ ] Legacy engine code paths are deleted (except mp-maker), or unreachable behind the bootstrap guard with a ponytail comment

## Blocked by

- Slice 01 (schema + engine core). Slice 02 is not a blocker — seeds can be written as JSON.
