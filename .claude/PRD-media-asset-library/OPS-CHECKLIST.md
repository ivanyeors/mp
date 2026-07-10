# Ops checklist — Media Asset Library (Drive)

HITL slice 02. Complete before Drive paste/browse import works in staging/prod.

**Identity split (locked):**

| Role | Account | Env |
|------|---------|-----|
| Drive / media (main) | `sg@mpillow.com` | `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` |
| Calendar + Contacts (appointments) | `admin@mpillow.com` | `GOOGLE_OAUTH_REFRESH_TOKEN` (unchanged) |

Same OAuth client id/secret for both. Do **not** put Drive scopes on the appointments refresh token.

## 1. Google Cloud — Drive API

1. Same GCP project as Calendar/Contacts OAuth.
2. Enable **Google Drive API**:
   - https://console.developers.google.com/apis/api/drive.googleapis.com
3. OAuth consent screen → add scope (do not remove calendar/contacts):
   - `https://www.googleapis.com/auth/drive.readonly`
   - Use `https://www.googleapis.com/auth/drive` only if readonly cannot download Shared Drive files.
4. Skip **Drive UI Integration** / Open URL — not needed for API-only import.
5. Ensure `sg@mpillow.com` is a **Test user** if the OAuth app is in Testing.

## 2. Consent Drive as `sg@` (separate refresh token)

1. Open https://developers.google.com/oauthplayground  
2. Gear → **Use your own OAuth credentials** → paste `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`.  
3. Select **only**:
   - `https://www.googleapis.com/auth/drive.readonly`  
   (Do not include calendar/contacts here — those stay on `admin@`.)  
4. **Authorize APIs** → sign in as **`sg@mpillow.com`** → Accept.  
5. **Exchange authorization code for tokens** → copy `refresh_token`.  
6. Store as `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` in `.env.local`, then staging, then prod.  
7. Leave `GOOGLE_OAUTH_REFRESH_TOKEN` as the existing **`admin@`** appointments token.

If no refresh token is returned: https://myaccount.google.com/permissions → remove the app for `sg@` → repeat.

## 3. Shared Drives

1. Confirm `sg@mpillow.com` is a member of company Shared Drives that hold marketing media.
2. `admin@` does not need Drive membership for media import (supplement staff login only).
3. Files only in someone else's personal My Drive are **not** reachable — use Shared Drives.
4. Record at least one production Shared Drive after smoke test:

| Name | Drive id | Notes |
|------|----------|-------|
| Mpillow | `0AMgW7WI0ICkvUk9PVA` | https://drive.google.com/drive/folders/0AMgW7WI0ICkvUk9PVA — sole Shared Drive for import; smoke OK as `sg@` |

## 4. Smoke test (after Drive consent)

With `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` loaded:

1. Refresh access token from the **Drive** refresh token (not the appointments one).
2. `drives.list` — at least one Shared Drive visible to `sg@`.
3. `files.list` on a known folder (`supportsAllDrives=true`, `includeItemsFromAllDrives=true`).
4. Download one small test image bytes.
5. Resolve a paste URL (`/file/d/{id}/…`) → file id + metadata.
6. Sanity: appointments still work with unchanged `GOOGLE_OAUTH_REFRESH_TOKEN` (`admin@`).

## 5. Env reference

See `.env.example`. Two refresh tokens; one client id/secret.

## 6. Signoff (slice 02 — Drive ops)

- [x] Drive API enabled on GCP project
- [x] Drive scope on consent screen; Open URL / Drive UI integration skipped
- [x] `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` from `sg@` consent
- [x] `GOOGLE_OAUTH_REFRESH_TOKEN` still `admin@` (calendar + contacts)
- [x] Shared Drive name/id recorded above
- [x] Smoke steps 1–6 pass (local `.env.local`)
- [ ] Staging then production env updated (`GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN`)

## 7. Staging E2E signoff (slice 18)

User story 47. Run against the same Supabase + Drive env as `.env.local` (staging DB), with auth HTTP checks against `NEXT_PUBLIC_SITE_URL` (or `MEDIA_SMOKE_BASE_URL`).

**Executed:** 2026-07-10 — `SMOKE_OK 14/14` + vitest **73/73**.

**Automated runner:**

```bash
npx tsx --env-file=.env.local scripts/smoke-staging-e2e-signoff.ts
npx vitest run lib/media lib/media-assets lib/product-slide-sections
```

| # | Criterion | Proof script / notes | Result |
|---|-----------|----------------------|--------|
| 1 | Direct image upload → optimized Asset in grid | `smoke-direct-upload.ts` (WebP + live HEAD) | **PASS** |
| 2 | Paste Drive link → preview → import | `smoke-drive-import.ts` | **PASS** |
| 3 | Select from Drive → folder nav → import | `smoke-drive-browse-import.ts` | **PASS** |
| 4 | Video/PDF link import + preview | `smoke-drive-video-pdf.ts` | **PASS** |
| 5 | Rename, alt, Open in Drive, re-import | `smoke-drive-asset-detail.ts` | **PASS** |
| 6 | Used/unused badges + attachment list | `smoke-usage-resolver.ts` | **PASS** |
| 7 | Delete guard on used Asset | `smoke-drive-asset-detail.ts` (`force_deleted: ok`) | **PASS** |
| 8 | Asset picker on product + rolled-out consumer | `smoke-asset-picker-products.ts` + `smoke-asset-picker-rollout.ts` | **PASS** |
| 9 | Folder assign + filter | `smoke-media-folders.ts` | **PASS** |
| 10 | Tag + kind filter | `smoke-media-tags-kind.ts` | **PASS** |
| 11 | Replace-everywhere on test Asset | `smoke-replace-everywhere.ts` | **PASS** |
| 12 | Spot-check migrated `/public` (+ slides) | `smoke-migrate-public-images.ts` + `smoke-migrate-slide-images.ts` | **PASS** |
| 13 | Admin-only API auth (no public Asset list) | `smoke-media-auth.ts` — locked `GET /api/media` + `GET /api/media/usage` | **PASS** |

**Blockers / follow-ups:** none open for scope 1 core flows. Signoff fix: `GET /api/media` and `GET /api/media/usage` now require `media` admin (were public).

**UI spot-check (optional, Settings → Media):** grid shows upload + Drive paste + Select from Drive; detail sheet rename/alt; badges match usage smoke. API paths above cover the same code.

**Ops leftover (slice 02, not a library blocker):** staging/prod Vercel env still needs `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` if not already set.
