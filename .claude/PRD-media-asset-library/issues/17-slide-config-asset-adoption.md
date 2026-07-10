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

## Decision

**Adopt** — see `docs/adr/0004-slide-config-asset-adoption.md`.

## Acceptance criteria

- [x] Written decision: adopt or defer with rationale in ADR or PRD addendum.
- [x] If adopt: all targeted config media resolves through Asset library; slide-ins render identically.
- [x] If defer: explicit list of remaining hard-coded paths and follow-up issue reference.
- [x] No landing page or slide-in shell changes beyond media source wiring.

## How it works

- **Inventory:** `SLIDE_PUBLIC_PATHS` (36) in `lib/media/slide-media.ts` — 32 former deferred + 4 landing overlaps.
- **Helper:** `slideImage(publicPath, props)` → hosted URL + `assetId` from `slide-media-resolved.json`, else `/public` fallback.
- **Apply:** `lib/media/migrate-slide-apply.ts` — ingest/reuse tagged Assets, write resolved JSON.
- **CLI:** `npx tsx --env-file=.env.local scripts/migrate-slide-images.ts --dry-run|--apply`
- **Usage:** resolver consumer type `slide_media` scans the resolved map.
- **Ceiling:** live replace-everywhere does not rewrite the committed map on Vercel (ADR upgrade path: site_settings).

## Proof

| Criterion | Proof |
|-----------|--------|
| ADR adopt decision | `docs/adr/0004-slide-config-asset-adoption.md` |
| 36 paths → Assets | smoke `slide_files` / `resolved_map` / `slide_assets_tagged` |
| Configs + ambassadors wired | `slideImage(...)` in configs + `ambassadors-slide-in.tsx` |
| Usage | smoke `usage_slide_media: ok` |
| Idempotent | smoke `idempotent: ok` |
| Live URL | smoke `live_url: ok` (HEAD 200) |
| Unit tests | `lib/media` + `lib/media-assets` + slide-media |
| Smoke | **`SMOKE_OK`** (`scripts/smoke-migrate-slide-images.ts`) |

## Content parity checklist

| Slide-in | Config / file | Status |
|----------|---------------|--------|
| Basic learn-more | `configs/basic-mpillow.ts` | wired via `slideImage` |
| Premium learn-more | `configs/premium-mpillow.ts` | wired via `slideImage` |
| Mbolster | `configs/mbolster.ts` | wired via `slideImage` |
| Cervical | `configs/cervical-neck-support.ts` | wired via `slideImage` |
| Ambassadors gallery | `ambassadors-slide-in.tsx` | wired via `slideImage` |

## Blocked by

- Slice 16 — Public migration (`16-migrate-public-images.md`)
