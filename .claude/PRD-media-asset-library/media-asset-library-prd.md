# PRD: Media Asset Library

Status: Draft (needs-triage)
Source: Grill-with-docs session (Jul 2026) + plan `media-asset-library-prd`

## Problem Statement

Marketing and commerce staff manage images, videos, and documents across many surfaces — landing page slots, blogs, products, categories, partners, page builder sections, and hard-coded product slide configs — but there is no unified digital asset library.

Today the Settings → Media page lists files in a Supabase Storage bucket with no persistent metadata, no support for videos or PDFs, and no Google Drive integration. Staff cannot paste a Drive link and get a fast, optimized preview on the site. Usage tracking only covers blogs and landing slots; products, categories, partners, and page builder references are invisible. Many live URLs still point at static `/public` files or hard-coded config paths, not a managed library.

Adding or replacing media is fragmented: upload in one place, pick via a separate ImagePicker, hunt for Drive files outside the app, and guess whether an old file is safe to delete.

## Solution

Build a phased **Media Asset Library** — a modular, reusable DAM centered on the Settings → Media page and an upgraded Asset picker used across admin consumers.

**Scope 1 — Library core:** Introduce **Media Asset** as a first-class record. Staff upload images (auto-optimized for web), import from Google Drive via paste-link or in-app browser (Shared Drives the workspace account can access), and register video/PDF Assets as Drive-linked references with in-library preview. Manage rename, alt text, delete, used/unused status, and last-used timestamps. Upgrade the picker to return Asset id + hosted URL for hybrid adoption.

**Scope 2 — Organization:** Add folders and tags; filter and browse by kind (image, video, PDF) and organization metadata.

**Scope 3 — Full DAM:** Expand replace-everywhere and dual-write Asset ids across consumers; migrate `/public` marketing images and adopt product slide section configs onto Assets where practical.

**Locked behaviors:**

- Drive ingest uses workspace OAuth as **`sg@mpillow.com`** (`GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` + Drive scopes). Appointments stay on **`admin@mpillow.com`** (`GOOGLE_OAUTH_REFRESH_TOKEN`). Company media lives in Shared Drives reachable by `sg@`.
- Drive import is **one-time** — after download the Asset is app-owned; Drive URL kept for provenance, Open in Drive, and manual re-import.
- **Images only** are copied into Supabase `media` and normalized (WebP master, long-edge cap); **`next/image`** handles responsive delivery.
- **Video and PDF** Assets store Drive links + preview metadata; not copied into app storage.
- **Hybrid references:** new attachments prefer Asset id; legacy URL strings still count toward usage.
- **Used** = currently attached anywhere known (drafts count); **order snapshots do not count**. **Last used** = last attach/replace/save that referenced the Asset.

## User Stories

### Scope 1 — Library core

1. As a marketing staff member, I want a single Media library page for all company media, so that I am not hunting across bucket listings and Drive tabs.
2. As a marketing staff member, I want to upload an image from my computer, so that landing and product imagery is hosted on our app for fast load times.
3. As a marketing staff member, I want uploaded images automatically optimized for web and mobile (smaller file size, modern format), so that pages load quickly without manual compression.
4. As a marketing staff member, I want to paste a Google Drive file link and see a preview before importing, so that I know I picked the right asset.
5. As a marketing staff member, I want to browse Shared Drives and folders from inside the Media page and select files to import, so that I do not need to copy links from Drive separately.
6. As a marketing staff member, I want image imports from Drive downloaded into our platform once, so that the live site never depends on Drive latency or permissions at view time.
7. As a marketing staff member, I want video and PDF files from Drive registered in the library without copying large files into our bucket, so that I can catalog and link them efficiently.
8. As a marketing staff member, I want to preview videos and PDFs from the library (thumbnail or embed), so that I can confirm content without opening Drive.
9. As a marketing staff member, I want to rename a Media Asset and set alt text, so that the library stays organized and accessible.
10. As a marketing staff member, I want to open the original Drive file from an imported Asset, so that I can edit the source in Drive when needed.
11. As a marketing staff member, I want to delete an Asset that is not in use, so that I can clean up obsolete files safely.
12. As a marketing staff member, I want delete blocked (or warned) when an Asset is still attached somewhere, so that I do not break live pages.
13. As a marketing staff member, I want to see whether each Asset is used or unused, so that I know what is safe to remove.
14. As a marketing staff member, I want to see where a used Asset is attached (landing, blog, product, etc.), so that I understand impact before changing it.
15. As a marketing staff member, I want to see when an Asset was last attached or saved in a consumer, so that I can spot stale creative.
16. As a marketing staff member, I want to search the library by name, so that I find files quickly in a large collection.
17. As a marketing staff member, I want to filter the library to used-only or unused-only, so that I can focus on cleanup or active assets.
18. As a marketing staff member, I want the existing landing-slot override UI on the Media page to keep working, so that I can assign hero and section images without a separate workflow.
19. As a marketing staff member, I want to pick a Media Asset from a Browse dialog when editing a product, so that product images come from the library.
20. As a marketing staff member, I want the same Browse dialog on blogs, categories, partners, and page builder image fields, so that all admin surfaces share one picker.
21. As a marketing staff member, I want the picker to return both Asset id and display URL, so that new saves track usage while old URL-only rows still work during migration.
22. As a store operator with the `media` permission, I want upload and delete restricted to authorized staff, so that the library is not tampered with by everyone.
23. As a developer, I want a `media_assets` table as the registry of record, so that metadata and usage are not inferred from storage filenames alone.
24. As a developer, I want a backfill that registers existing Supabase bucket files as Assets, so that the current gallery is not lost on launch.
25. As a developer, I want image ingest to produce a normalized WebP master (long-edge cap, quality target), so that storage and CDN bytes are predictable.
26. As a developer, I want storefront and admin image tags to use `next/image` against hosted URLs, so that responsive sizes and formats are automatic at serve time.
27. As a developer, I want a Drive connector module that lists Shared Drives, folders, and files and resolves paste URLs, so that UI and import logic share one API.
28. As a developer, I want Drive access via a dedicated `sg@mpillow.com` refresh token (same OAuth client as appointments), so that we do not build per-staff Google login and appointments stay on `admin@`.
29. As a developer, I want a Drive import orchestrator that branches on MIME kind (image → download+optimize+Asset; video/PDF → link Asset), so that import rules stay in one place.
30. As a developer, I want a usage resolver that scans landing settings, blogs, page builder, products, categories, and partners for Asset ids and hosted URLs, so that used/unused is accurate for hybrid refs.
31. As a developer, I want `last_used_at` updated when a consumer attaches or replaces an Asset, so that last-used reflects admin activity not page views.
32. As a developer, I want order item image snapshots excluded from usage, so that historical orders do not block deletion forever.
33. As a developer, I want unit tests on the Asset registry, image optimize contract, import kind branching, and usage resolver, so that core logic is verifiable without live Drive.

### Scope 2 — Organization

34. As a marketing staff member, I want to assign Assets to folders, so that I can group campaigns, products, or shoots.
35. As a marketing staff member, I want to browse the library by folder, so that I find related files together.
36. As a marketing staff member, I want to tag Assets with free-form labels, so that I can cross-cut folders (e.g. "hero", "2026-campaign").
37. As a marketing staff member, I want to filter by media kind (image, video, PDF), so that I see only the type I need.
38. As a marketing staff member, I want to combine kind, folder, tag, and usage filters, so that I can narrow a large library quickly.
39. As a developer, I want folder and tag metadata on the Asset model without changing ingest rules, so that organization is additive.

### Scope 3 — Full DAM

40. As a marketing staff member, I want replace-everywhere to update all references when I swap one Asset URL for another across blogs and landing slots, so that bulk updates are one action.
41. As a marketing staff member, I want replace-everywhere extended to products, categories, partners, and page builder, so that I am not manually re-picking in each editor.
42. As a marketing staff member, I want landing slots to store Asset ids alongside URLs, so that slot assignments track usage reliably.
43. As a marketing staff member, I want legacy `/public` marketing images migrated into the Asset library, so that one system owns all managed creative.
44. As a marketing staff member, I want product slide section configs to reference Assets instead of hard-coded `/public` paths where feasible, so that learn-more slide media is editable from the library.
45. As a developer, I want a migration script or admin job that imports known `/public` paths as Assets and rewrites consumers, so that migration is repeatable and auditable.
46. As a developer, I want an ADR or documented decision if slide-in config adoption is deferred, so that future readers know why `/public` paths remain.
47. As an operator running staging signoff, I want a checklist covering upload, Drive paste, Drive browser, video/PDF link, usage badges, picker on products, folders/tags, and replace, so that all three scopes are verified before production.

## Implementation Decisions

Phased delivery across three scopes. Deep modules (simple interface, testable in isolation):

### Module 1 — Media Asset registry

- New `media_assets` table: id, kind (`image` | `video` | `pdf` | `link`), display name, alt_text nullable, hosted_url nullable (Supabase public URL for images), drive_file_id nullable, drive_url nullable, mime_type, byte_size nullable, width/height nullable for images, folder_id nullable (scope 2), tags text[] nullable (scope 2), created_at, updated_at, last_used_at nullable, created_by staff id nullable.
- CRUD API (admin `media` permission): list with search/filters, get, create (internal), update (rename/alt/folder/tags), delete (guard via usage resolver).
- Backfill job: list existing `media` bucket objects → create Asset rows with hosted_url and inferred kind image.
- Does not perform storage I/O or Drive calls — delegates to modules 2–4.

### Module 2 — Image ingest & optimize

- Input: raw bytes + original filename/MIME.
- Process: Sharp (or equivalent already in stack) → resize if long edge exceeds cap (e.g. 2400px), strip EXIF, encode WebP (~quality 80).
- Output: upload to Supabase `media` bucket, return public URL + dimensions + byte size.
- Used by direct upload and Drive image import path in module 4.
- Contract test: output is WebP, under size cap, dimensions within bounds.

### Module 3 — Drive connector

- Same OAuth client id/secret; separate refresh token for Drive as `sg@mpillow.com` (`drive.readonly` or `drive` if download requires it). Appointments token stays `admin@`.
- Ops prerequisite (HITL slice 02): enable Drive API, consent Drive as `sg@`, confirm Shared Drive membership for `sg@`.
- Operations: resolve paste URL → file id + metadata; list Shared Drives; list folder children (folders + files); download file bytes for import; fetch thumbnail link for preview where available.
- No Asset writes — pure I/O adapter.

### Module 4 — Drive import orchestrator

- Input: Drive file id or resolved URL + optional display name override.
- Branch: image MIME → download → module 2 → create Asset with hosted_url + drive provenance; video/PDF → create Asset with drive_url + kind, no hosted copy.
- One-time import only; store `imported_at`; manual "Re-import from Drive" action on Asset detail re-runs download for images (replaces hosted file, new bytes).
- Duplicate detection: same drive_file_id → reject or offer link to existing Asset.

### Module 5 — Usage resolver

- Input: Asset id and/or hosted_url.
- Scan consumers: `site_settings` landing keys, `blog_posts` (image_url + content URLs), `landing_sections` JSONB, `product_images`, `product_variants.image_url`, `categories.image_url`, `partners.logo_url`, partners page JSONB.
- Output: list of `{ consumer, label, record_id }`; boolean used; exclude `order_items.image_url`.
- On attach/replace/save hooks from consumers and replace API: set `last_used_at = now()`.
- Expand replace-everywhere (scope 3) to additional tables when dual-writing Asset ids.

### Module 6 — Asset picker

- Replaces/extends current ImagePicker dialog: list Assets, search, filter by kind/usage (and folder/tag in scope 2).
- Select returns `{ assetId, url, alt? }` for hybrid consumers.
- Image-only mode for fields that only accept images; all-kinds mode for internal doc/video pickers if needed later.

### Module 7 — Media library UI

- Evolve Settings → Media page: grid/list, upload dropzone, Drive URL input + Import, "Select from Drive" dialog (module 3 lists), detail sheet (metadata, usage list, Open in Drive, delete, re-import).
- Keep landing-slot assignment section; wire to Asset picker.
- Badges: kind, used/unused, last used relative time.

### Module 8 — Organization (scope 2)

- `media_folders` table (id, name, parent_id nullable) or flat folder names on Asset — prefer simple flat folders v1.
- Tags: text array on Asset; filter UI on library and picker.
- Kind filter: image | video | pdf.

### Module 9 — Consumer adoption & migration (scope 3)

- Dual-write `media_asset_id` on landing slot settings keys where schema allows (or parallel site_settings keys).
- Extend replace API to products, categories, partners, page builder.
- Migration: inventory `/public/images/**` and known landing paths → import as Assets → rewrite consumer URLs.
- Product slide section configs: evaluate each config file; adopt Asset ids or document deferral (HITL decision in slice 17).

Schema changes (summary):

- `media_assets` (+ optional `media_folders` scope 2).
- Optional `media_asset_id` columns or JSONB fields on consumers (scope 3, phased).
- No change to mp-config customer photo tables (out of scope).

API contracts (summary):

- `GET/POST/PATCH/DELETE /api/media/assets` (or evolve existing `/api/media` to Asset-centric).
- `GET /api/media/assets/[id]/usage`.
- `POST /api/media/import/drive` (paste or file id).
- `GET /api/media/drive/browse?driveId=&folderId=`.
- `POST /api/media/replace` extended in scope 3.
- Admin-only mutations; list may remain admin-only (fix current public list gap).

Architectural decisions:

- Hybrid references until all consumers adopt Asset ids.
- No Drive sync; no per-staff OAuth.
- No video/PDF hosting in Supabase in this PRD.
- Workspace Google identity matches Calendar pattern — not staff session Google login.

Recommended build order: see issues README (slices 01–18).

## Testing Decisions

What makes a good test: assert external, observable behavior (inputs → persisted Asset, URLs, usage map), not HTTP client or UI internals. Prefer small vitest or `*.check.ts` files consistent with `lib/shopify/sync-scope.check.ts` and `lib/**/__tests__/`.

Modules to test (confirmed):

- **Module 1 — Media Asset registry:** create/update/delete rules; kind validation; backfill idempotency shape.
- **Module 2 — Image ingest & optimize:** output format WebP; dimension cap; byte size reduced vs naive PNG/JPEG input fixture.
- **Module 4 — Drive import orchestrator:** MIME branch — image path invokes ingest; video/PDF path creates link-only Asset without hosted_url.
- **Module 5 — Usage resolver:** detects URL and Asset id references across fixture rows; excludes order snapshots; last_used_at update on attach hook.

Not unit-testing Drive HTTP (module 3) or full picker UI (module 6–7) — covered in staging E2E slice 18.

Prior art: existing media usage route patterns, `sync-scope.check.ts`, vitest tests under `lib/**/__tests__/`.

## Out of Scope

- Per-staff Google OAuth login in Settings.
- Continuous sync with Google Drive (keep-in-sync flag).
- Hosting full video files or large PDFs in Supabase Storage.
- "Last used" from storefront analytics or page views.
- mp-config customer response photos (Postgres data URLs + Telegram) — separate system.
- Third-party DAM (Cloudinary, Bynder, etc.).
- Image CDN transforms beyond Next.js Image + ingest-time WebP master.
- Folders/tags in scope 1 (deferred to scope 2).
- Full consumer Asset-id migration in scope 1 (deferred to scope 3).

## Further Notes

- Domain glossary terms (**Media Asset**, kinds, used/unused, last used, Drive provenance) land in slice 01 (`CONTEXT.md` Marketing section).
- Consider ADR `0004-media-asset-hybrid-references.md` if hybrid ref + one-time Drive import needs explicit rationale for future readers.
- **ADR `0004-slide-config-asset-adoption.md`:** product slide configs + ambassadors gallery adopted onto Assets via committed resolved map (`slideImage` + migrate). Live replace-everywhere for slides deferred (ops re-migrate / upgrade to site_settings).
- Ops slice 02 must complete before Drive connector integration tests against live API.
- Existing `GET /api/media` unauthenticated listing should be closed or restricted when Asset API ships.
- **Slice 18:** closed — `GET /api/media` and `GET /api/media/usage` require admin `media`; full E2E matrix in `OPS-CHECKLIST.md` §7 (`SMOKE_OK 14/14`).
- Env: `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` (`sg@` Drive); keep `GOOGLE_OAUTH_REFRESH_TOKEN` for `admin@` Calendar/Contacts.
