# Slice 04 — Direct image upload → optimize → storage → Asset

Type: AFK
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 2–3, 25–26
Modules: 1, 2, 7

## What to build

Complete upload path on Settings → Media page: file picker / drag-drop → image ingest module → Supabase `media` bucket → new Asset row.

- **Image ingest module:** accept bytes → normalize WebP master (long-edge cap ~2400px, quality ~80, strip EXIF) → upload → return URL + width + height + byte_size.
- Wire upload UI on Media page (replace legacy POST that only wrote to bucket without Asset).
- Display optimized preview in grid using `next/image` where applicable.
- Contract test: fixture JPEG/PNG in → WebP out, dimensions capped, smaller byte size than input.

## Acceptance criteria

- [x] Staff can upload an image; Asset appears in library with hosted_url and dimensions.
- [x] Stored file is WebP (or documented format) under size cap.
- [x] Upload requires admin `media` permission.
- [x] Image ingest module has automated contract test.

## Blocked by

- Slice 03 — Asset registry (`03-asset-registry-crud-backfill.md`)
