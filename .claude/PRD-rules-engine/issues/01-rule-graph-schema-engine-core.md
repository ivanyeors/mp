# Slice 01 — Rule graph schema + evaluation & validation core

Type: AFK
Parent: PRD `rules-engine` (`.claude/PRD-rules-engine/rules-engine-prd.md`)
Triage: needs-triage
User stories covered: 5, 8, 9, 10, 11, 13, 14, 16, 18 (foundations)

## What to build

Thin end-to-end path: a **Rule graph** can persist, validate, publish, and evaluate — API round-trip proven with a hand-written graph JSON (no canvas yet).

- Migration: `rule_graphs` (flow `premium-mpillow|basic-mpillow|mbolster`, version, status `draft|published`, graph JSON, author, timestamps). One draft + immutable published versions per flow.
- Pure lib `lib/rules-engine/`: typed node/edge model (Input, Range, Match, Combine, terminals: Size output, Template output, Tier suggestion, Flow route, Fallback); per-flow **input catalog** (code-defined, all inputs required); `evaluate(graph, inputs)` returning resolved size/length, template id, tier suggestion, flow route, fired terminals, and trace — deterministic, no I/O.
- Publish validation as a pure function: DAG check, inputs belong to the flow catalog, Range bands contiguous + non-overlapping (authored in inches, stored canonical cm), every path terminates, Fallback reachable, Template outputs size-scoped, Flow route terminals have a same-flow fallback sibling. Errors reference node ids.
- Draft save / publish / list-versions / restore-to-draft API endpoints (Staff, `page-builder` perm).
- Vitest for evaluation + validation (prior art: `lib/shop/recommendation/__tests__/`).

## Acceptance criteria

- [x] A hand-written Premium graph JSON round-trips draft → publish → evaluate via the API and returns size + size-scoped template + trace
- [x] Publish rejects: cycle, band gap/overlap, unreachable Fallback, off-catalog input, wrong-size template, Flow route without same-flow fallback — each with the offending node id
- [x] Evaluation is deterministic (same inputs → same fired terminals) and refuses on a missing required input rather than defaulting
- [x] Published versions are immutable; restore-to-draft copies without mutating history

## Proof (2026-07-19)

- `npx vitest run lib/rules-engine` — 13 passed
- `npx tsx lib/rules-engine/slice-01.check.ts` — ok
- `npx tsx --env-file=.env.local lib/rules-engine/api-roundtrip.check.ts` — draft → publish → evaluate → restore; published immutable
- Migration `20260719180000_rule_graphs.sql` applied via `npm run db:push`

## Blocked by

None — can start immediately. (Template output references **Filling Templates** in legacy-flat or spatial form; spatial PRD slice 01 is not a hard blocker.)
