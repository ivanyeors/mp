# Slice 01 — Domain glossary: Media Asset terms in CONTEXT

Type: AFK
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 33 (partial), language for all scopes

## What to build

Add Marketing / admin glossary entries to root `CONTEXT.md` for the Media Asset Library domain. Terms must match locked grill decisions and stay decoupled from implementation detail.

Minimum entries:

- **Media Asset** — first-class library record for a managed photo, video, PDF, or external link; not a raw bucket object alone.
- **Asset kind** — `image` | `video` | `pdf` | `link`.
- **Hosted URL** — Supabase public URL for image Assets served on the site.
- **Drive provenance** — original Google Drive file id/URL stored for Open in Drive and manual re-import; one-time import, no sync.
- **Used / unused** — used = currently referenced by a known consumer (drafts count); order snapshots excluded.
- **Last used** — timestamp of last attach/replace/save in a consumer, not storefront page views.

Document relationship: Media Asset Library is separate from **Product slide section config** media props (code config) until scope 3 adoption.

## Acceptance criteria

- [ ] `CONTEXT.md` contains the glossary entries above with _Avoid_ notes where terms collide (e.g. "media" on landing vs Media Asset).
- [ ] Entries align with PRD locked decisions (hybrid refs, one-time Drive import, images hosted / video-PDF linked).
- [ ] No implementation file paths in glossary text.

## Blocked by

None — can start immediately.
