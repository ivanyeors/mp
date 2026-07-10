# Slice 15 — Replace-everywhere + dual-write Asset ids on landing slots

Type: AFK
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 40–42
Modules: 5, 9

## What to build

**Scope 3** — extend bulk replace and landing slot tracking.

- Evolve existing replace API: swap old hosted_url → new hosted_url across blogs, landing settings, products, categories, partners, page builder (not order snapshots).
- Optional: swap by Asset id when consumers store ids.
- Landing slot UI: when assigning hero/section image, persist `media_asset_id` alongside url in site_settings (new key suffix or JSON value shape — document migration).
- Replace-everywhere action on Asset detail: pick replacement Asset, run bulk update, refresh usage.

## Acceptance criteria

- [x] Replace updates references in all listed consumer types.
- [x] Landing slots store Asset id + url on save.
- [x] Usage resolver reflects new attachments after replace.
- [x] Order item snapshots unchanged by replace.

## Dual-write shape (landing slots)

- URL stays at `landing_*` (e.g. `landing_hero`) — public page / `getSiteSettings` unchanged.
- Asset id at companion key `landing_*_asset_id` (e.g. `landing_hero_asset_id`).
- `PUT /api/site-settings` accepts optional `media_asset_id`; `DELETE` clears both keys.
- Replace swaps both URL and companion id when `oldAssetId` / `newAssetId` provided.

## Proof

| Criterion | Proof |
|-----------|--------|
| Replace all consumers | `planReplaceEverywhere` + `runReplaceEverywhere`; smoke `replace_consumers: ok` |
| Landing dual-write | Media page `setSlotImage` → PUT with `media_asset_id`; smoke `landing_dual_write: ok` / `landing_ids_swapped: ok` |
| Usage after replace | smoke `old_unused: ok` / `usage_after_replace: ok` |
| Order snapshots | unit + smoke `order_exclusion: ok` |
| Unit tests | **52/52** (`lib/media` + `lib/media-assets`) |
| Smoke | **`SMOKE_OK`** (`scripts/smoke-replace-everywhere.ts`) |

## Blocked by

- Slice 10 — Usage resolver (`10-usage-resolver-v1.md`)
- Slice 12 — Picker roll-out (`12-asset-picker-rollout.md`)
