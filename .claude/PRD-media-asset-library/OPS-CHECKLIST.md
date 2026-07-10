# Ops checklist — Media Asset Library (Drive)

HITL slice 02. Complete before Drive paste/browse import works in staging/prod.

## 1. Google Cloud — Drive API

1. Same GCP project as Calendar/Contacts OAuth (`admin@mpillow.com`).
2. Enable **Google Drive API**:
   - https://console.developers.google.com/apis/api/drive.googleapis.com
3. OAuth consent screen → add scope (minimum):
   - `https://www.googleapis.com/auth/drive.readonly`
   - Use `https://www.googleapis.com/auth/drive` only if readonly cannot download Shared Drive files.
4. Re-consent as `admin@mpillow.com` so the refresh token includes Drive scopes.
5. Update `GOOGLE_OAUTH_REFRESH_TOKEN` (and client id/secret if rotated) in staging then production.
   - Same vars as appointments — no new secret names.

## 2. Shared Drives

1. Confirm `admin@mpillow.com` is a member of company Shared Drives that hold marketing media.
2. Files owned only by `sg@…` personal My Drive are **not** reachable — move/copy into Shared Drives.
3. Record at least one production Shared Drive here after smoke test:

| Name | Drive id | Notes |
|------|----------|-------|
| _TBD_ | _TBD_ | Fill after first successful `drives.list` |

## 3. Smoke test (after re-consent)

With env loaded locally or via a one-off script:

1. Refresh access token from `GOOGLE_OAUTH_REFRESH_TOKEN`.
2. `drives.list` — at least one Shared Drive visible.
3. `files.list` on a known folder (`supportsAllDrives=true`, `includeItemsFromAllDrives=true`).
4. Download one small test image bytes.
5. Resolve a paste URL (`/file/d/{id}/…` or sharing link) → file id + metadata.

## 4. Env reference

See `.env.example` `GOOGLE_OAUTH_*` block — Drive scope is documented there. No duplicate Drive-specific secrets.

## 5. Signoff

- [ ] Drive API enabled on GCP project
- [ ] Refresh token re-consented with Drive scope
- [ ] Staging env updated
- [ ] Shared Drive name/id recorded above
- [ ] Smoke steps 1–5 pass
- [ ] Production env updated (after staging OK)
