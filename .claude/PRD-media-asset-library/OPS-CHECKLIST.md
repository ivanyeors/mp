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

## 6. Signoff

- [x] Drive API enabled on GCP project
- [x] Drive scope on consent screen; Open URL / Drive UI integration skipped
- [x] `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` from `sg@` consent
- [x] `GOOGLE_OAUTH_REFRESH_TOKEN` still `admin@` (calendar + contacts)
- [x] Shared Drive name/id recorded above
- [x] Smoke steps 1–6 pass (local `.env.local`)
- [ ] Staging then production env updated (`GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN`)
