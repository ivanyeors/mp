# Slice 16 — Migrate `/public` marketing images into Asset library

Type: AFK
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 43, 45
Modules: 9, 2

## What to build

**Scope 3** — migrate static marketing images from `/public` into managed Assets.

- Inventory script: list known `/public` paths referenced by landing defaults, blogs, slide configs, and live site_settings.
- For each path: read file from repo or fetch deployed static URL → image ingest → create Asset → rewrite consumer to hosted_url (+ asset id where slice 15 landed).
- Idempotent migration command (tsx script or admin job) with dry-run mode.
- Document which paths migrated vs intentionally left static.

## Acceptance criteria

- [x] Known landing hero defaults that pointed at `/public` now use Supabase hosted Assets.
- [x] Dry-run reports planned changes; apply mode updates DB/settings without duplicating Assets on re-run.
- [x] Live landing pages render migrated images via optimized hosted URLs.
- [x] Migration log or README section lists migrated paths.

## How it works

- **Plan:** `lib/media/migrate-public.ts` — inventory + pure `planPublicMigration`.
- **Apply:** `lib/media/migrate-public-apply.ts` — ingest via `ingestImageAsset`, tag `public:<path>`, rewrite consumers.
- **CLI:** `npx tsx --env-file=.env.local scripts/migrate-public-images.ts --dry-run|--apply [--landing-only]`
- **Idempotency:** Assets tagged `public:/path` (lowercase); re-run reuses tags, skips already-hosted consumers.
- **Landing dual-write:** URL at `landing_*`, Asset id at `landing_*_asset_id` (slice 15).
- **Code defaults** in `app/[lang]/page.tsx` stay as `/public` fallbacks for fresh envs; live pages use `site_settings` overrides after migrate.
- **Deferred to slice 17:** product slide section configs + ambassadors slide-in gallery images.

## Proof

| Criterion | Proof |
|-----------|--------|
| Landing defaults → hosted Assets | 9 slots dual-written in `site_settings`; smoke `landing_dual_write: ok` / `landing_assets_tagged: ok` |
| Dry-run + idempotent apply | smoke `dry_run: ok` / `idempotent: ok`; re-apply `ingested: 0`, `landingWritten: 0` |
| Live landing via hosted URLs | settings values are `https://…/storage/v1/object/public/media/…`; usage `usage_after_migrate: ok` |
| Blogs rewritten | 75/75 `image_url` hosted + `media_asset_id` set; `blogs_relative: 0` |
| Unit tests | **59/59** (`lib/media` + `lib/media-assets`) |
| Smoke | **`SMOKE_OK`** (`scripts/smoke-migrate-public-images.ts`) |

## Migration log

### Migrated — landing slots (9)

| Slot | Public path | Consumer |
|------|-------------|----------|
| `landing_hero` | `/m-pillow-417953-web.webp` | site_settings + asset id |
| `landing_size_matters` | `/images/landing/size-matters.jpg` | site_settings + asset id |
| `landing_marquee` | `/3way-side-sleep.jpg` | site_settings + asset id |
| `landing_ambassadors` | `/images/landing/ambassadors-hero.webp` | site_settings + asset id |
| `landing_cervical_neck` | `/mpillow-cervical-neck.webp` | site_settings + asset id |
| `landing_basic_pillow` | `/basic-mpillow.webp` | site_settings + asset id |
| `landing_premium_pillow` | `/DarkMpillowImage-WEB.jpg` | site_settings + asset id |
| `landing_mbolster` | `/808907f4-ac2b-499a-ace6-69933883b2f5.webp` | site_settings + asset id |
| `landing_founder` | `/Darrenyeo-profileshoot_2.webp` | site_settings + asset id |

### Migrated — blog featured images (75)

All `blog_posts` rows whose `image_url` was `/images/blogs/*.jpg` → optimized Supabase hosted URL + `media_asset_id`.

### Intentionally left static (slice 17)

~~Ambassadors + slide configs~~ — **adopted in slice 17** (`SLIDE_PUBLIC_PATHS`, ADR 0004).

### Unreferenced `/public` files

Root `public/*.webp|jpg|png` not listed in landing defaults, blogs, or slide configs were **not** imported (inventory is reference-driven, not bucket-wide).

## Blocked by

- Slice 04 — Upload optimize (`04-direct-upload-optimize-asset.md`)
- Slice 15 — Replace + landing ids (`15-replace-everywhere-landing-asset-ids.md`)
