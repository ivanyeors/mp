# Adopt product slide section media onto Media Assets

## Context

Slice 16 migrated landing slots and blog featured images into the Media Asset library. Product learn-more slide section configs and the ambassadors slide-in gallery still pointed at hard-coded `/public` paths (32 deferred + 4 landing-overlap paths). User story 44 asks for Asset references where feasible so learn-more media is library-managed; story 46 requires a written decision if deferred.

Slide-ins are client components that import static TypeScript configs. Vercel’s filesystem is read-only at runtime, so replace-everywhere cannot rewrite config files in production the way it updates `site_settings` / DB rows for landing.

## Decision

**Adopt** slide and ambassadors gallery images onto Media Assets:

1. Ingest each inventoried `/public` path (idempotent `public:<path>` tags; reuse Assets already created for landing overlaps).
2. Resolve `src` through a committed map (`lib/media/slide-media-resolved.json`) keyed by public path → `{ src: hostedUrl, assetId }`.
3. Configs and ambassadors call `slideImage(publicPath, props)` so fresh envs fall back to `/public` until migrate runs.
4. Usage resolver scans the resolved map as consumer type `slide_media` (delete guard).

**Ceiling (ponytail):** live replace-everywhere does not rewrite the committed map on Vercel. Changing a slide image means re-running the slide migrate (or editing the map + redeploy). Upgrade path: dual-write map into `site_settings` and resolve at render via a small client fetch/context.

## Consequences

- Learn-more and ambassadors images load from Supabase hosted Assets after migrate.
- Assets show as used (`slide_media`) so delete is blocked while referenced.
- No slide-in shell / layout changes beyond media source wiring.
- Slice 16 `DEFERRED_PUBLIC_PATHS` becomes the adopted inventory (empty deferred list).

## Considered options

- **Defer with ADR only** — rejected; paths are finite, files exist, ingest path already proven in slice 16.
- **36× `site_settings` keys + runtime fetch** — correct for live replace, but more shell/plumbing than needed for first adopt; left as upgrade path.
- **Bake hosted URLs inline in each config file** — noisier diffs; map keeps one codegen target.
