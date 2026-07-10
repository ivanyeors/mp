# Slice 17 — Adopt product slide section configs onto Assets (or defer)

Type: HITL
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 44, 46
Modules: 9

## What to build

**Scope 3** — evaluate and execute adoption of **Product slide section config** image `src` paths onto Media Assets, OR document a deliberate deferral.

HITL decision gate:

- **Adopt:** migrate `lib/product-slide-sections/configs/*.ts` hard-coded `/public` paths to Asset ids/urls; configs reference Asset registry; learn-more slide-ins unchanged in shell behavior.
- **Defer:** write ADR or PRD Further Notes entry explaining why code configs remain; list paths still on `/public`; no partial broken state.

If adopting:

- Map each config `src` to migrated Asset from slice 16 where possible.
- Update config types if needed to accept `assetId` + resolved url at build/runtime.
- Content parity checklist per product slide-in.

## Acceptance criteria

- [ ] Written decision: adopt or defer with rationale in ADR or PRD addendum.
- [ ] If adopt: all targeted config media resolves through Asset library; slide-ins render identically.
- [ ] If defer: explicit list of remaining hard-coded paths and follow-up issue reference.
- [ ] No landing page or slide-in shell changes beyond media source wiring.

## Blocked by

- Slice 16 — Public migration (`16-migrate-public-images.md`)
