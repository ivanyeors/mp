## Parent

PRD: Partner Hub — #70

## What to build

Vitest spec suites for the identity modules — **authored by an agent that did not implement them** (owner directive: implementation and tests must not share an author, so tests encode the PRD/glossary spec, not the implementation's assumptions). Modules: **partner-auth** (context resolution, Staff > Partner > Customer precedence, additive access, 7-day absolute cap, backup-email identity resolution) and **partner-application** (status machine `pending → approved | rejected`, agreement versioning, re-accept trigger on version bump). Test external behavior only — inputs → outcomes on public interfaces; prior art: the RMA `canTransition` suites and locations/booking lib suites.

## Acceptance criteria

- [ ] Suites written from the PRD/CONTEXT.md spec by a different agent than the implementers of #71/#73/#76
- [ ] partner-auth: precedence, 7-day cap boundary (exactly 7 days vs stale), backup-email identity, non-partner rejection all covered
- [ ] partner-application: every legal and illegal status transition, `agreed_version` recording, re-accept trigger covered
- [ ] No implementation internals asserted (storage shapes, call order)
- [ ] Full vitest run green alongside existing suites

## Blocked by

- #71, #73, #76
