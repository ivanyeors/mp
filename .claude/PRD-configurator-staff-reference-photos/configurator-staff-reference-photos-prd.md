# PRD — Staff reference-photo upload for the customisation forms

## Problem Statement

When staff assist a customer through a custom **Mpillow** (`mp-config`) or **Mbolster**
(`mbolster-config`) build, they have no way to attach reference imagery to the job — photos
of the customer's current pillow, their posture, a sample build, a measurement laid out on a
table. Today the build team only receives the two **Sizing photos** (front / side) that the
*customer* self-uploads, which are stored as base64 data URLs and pushed to a Telegram group.
Anything the assisting staff member sees in person is lost, or gets described in free-text
notes. There is no staff-facing way to say "here's what I'm looking at — build to this."

## Solution

Add a **staff-only Reference photo** upload to both customisation forms, sitting directly
above the Contact section. It is visible only when an approved admin is signed in (the same
gate that already reveals **Staff assist**). Staff can add multiple images, see preview
thumbnails, and delete any of them. Images are compressed server-side and stored against the
**Customisation session**, then surfaced to the build team two ways: appended to the existing
Telegram notification (pillow), and shown in a **Reference photos** gallery on the Result
detail page (both products).

This is a **new, separate feature** from the customer **Sizing photos**; that flow
(front/side, data URLs, Telegram) is left untouched. It deliberately reuses the existing
server-side image pipeline (Sharp → WebP → `media` bucket) rather than adding new
compression or storage machinery, but keeps these images **out of the Media Asset library**
(the browsable DAM at `/settings/media`) for privacy and clutter reasons.

Scope is the upload feature only. A broader visual redesign of the configurator's left panel
(Staff assist → toolbar, richer suggestion card) is a **separate, mockup-first follow-up**
and is not part of this PRD.

## User Stories

1. As an assisting staff member, I want an image upload form on the custom **Mpillow** page,
   so that I can attach reference photos to the build I'm helping with.
2. As an assisting staff member, I want the same upload form on the custom **Mbolster** page,
   so that both customisation products are covered.
3. As an assisting staff member, I want the upload form to appear directly above the Contact
   section, so that it sits naturally in the finish step I'm already filling in.
4. As an assisting staff member, I want to upload **multiple** images at once, so that I can
   capture several angles or references without repeating the flow.
5. As an assisting staff member, I want a **preview thumbnail** for each uploaded image, so
   that I can confirm what I attached at a glance.
6. As an assisting staff member, I want to **delete** an image I attached by mistake, so that
   only the right references go to the build team.
7. As an assisting staff member, I want images compressed before storage, so that large phone
   photos don't bloat storage or slow anything down.
8. As an assisting staff member, I want a clear error if I exceed the image count or a file is
   too large, so that I understand why an upload was refused.
9. As an assisting staff member, I want a clear error if a file can't be processed as an image,
   so that I can retry with a supported photo.
10. As a signed-out visitor or non-admin customer, I want to **not** see the upload form, so
    that the feature stays an internal staff tool.
11. As a signed-out visitor or non-admin customer, I want the existing customer **Sizing
    photo** (front/side) step to keep working exactly as before, so that nothing I rely on
    changes.
12. As an admin, I want my uploaded **Reference photos** to **not** appear in the Media Asset
    library, so that customer imagery doesn't clutter or leak into the marketing DAM.
13. As a build-team member, I want a pillow's **Reference photos** delivered in the same
    Telegram notification as the **Sizing photos**, so that I get everything for a build in one
    place without a new tool.
14. As a build-team member, I want to see a **Reference photos** gallery on the Result detail
    page, so that I can review the images later for both **Mpillow** and **Mbolster** jobs.
15. As an assisting staff member, I want my uploaded images to persist if I reload the
    configurator, so that I don't lose attachments mid-session.
16. As an assisting staff member on **Mbolster**, I want my references to still reach the build
    team even though bolster has no Telegram step, so that the Result-detail gallery is a
    reliable fallback.
17. As a developer, I want the upload API gated by the same admin check that reveals **Staff
    assist**, so that form visibility and write access can never disagree.
18. As a developer, I want compression, storage-path building, and the row write behind one
    small module, so that the image-handling logic is testable in isolation.
19. As a developer, I want the count/size/mime limits enforced by a pure guard, so that the
    refusal rules are locked down by tests.
20. As an operator, I want reference and sizing images kept as distinct concepts in the
    glossary, so that the two photo features aren't confused in future work.

## Implementation Decisions

**Concept / glossary**
- **Reference photo** — staff-uploaded imagery attached to a **Customisation session**;
  distinct from the customer **Sizing photo** (front/side). Both are added to CONTEXT.md.
- **Customisation session** — the id images hang off. For **Mpillow** it is the existing
  `responseId` (the **Result**/response id). For **Mbolster**, which has no response record,
  the client mints a session UUID up front, persists it in the existing hold draft, and passes
  it as the `responseId` when the hold is created — so the Result id equals the session id for
  both products and the gallery needs no extra join column.

**Schema / migration** (additive; prod-safe)
- New table `config_upload(id, session_id, storage_path, hosted_url, mime_type, byte_size,
  width, height, created_at)`, indexed by `(session_id, created_at)`. RLS: service-role only
  — all access flows through the server API. No column is added to any existing table.

**Modules**
- **`config-upload`** — the deep module. `saveConfigUpload({ sessionId, bytes, originalName })`
  optimizes the bytes (reusing the existing Sharp `optimizeImageForWeb`), uploads under a
  per-session folder in the existing `media` bucket, and inserts one `config_upload` row —
  deliberately **not** registering a Media Asset (so it stays out of the DAM). Also
  `listConfigUploads(sessionId)` and `deleteConfigUpload(id)` (removes the storage object and
  the row).
- **`assertUploadAllowed(existingCount, fileSize, mimeType)`** — a pure guard encoding the
  limits (≤10 images per session, ≤15 MB per file, image mimes only); throws a typed refusal
  otherwise. Called by the route so the same rules cover count, size, and type.
- **Reference-photo upload UI** — a self-contained staff-only component rendered above the
  Contact fields on both forms: an `image/*` multi-file input with drag-drop (borrowing the
  drop-zone pattern from the existing media picker), a thumbnail grid with per-item delete and
  an uploading state, and toast errors. It hydrates from `listConfigUploads` on mount.
- **Telegram append** — the existing pillow media-group send (fired when a response is marked
  final) also fetches the session's `config_upload` rows and appends their hosted URLs as
  photo items, batching into additional media-group calls past Telegram's 10-item cap.
- **Result-detail gallery** — the Result detail read is extended to return the session's
  reference images, rendered as a read-only **Reference photos** gallery.

**Gate**
- Visibility reuses the existing `staffAssist` flag computed by the page server component from
  `getAdminContext()`. The upload API gates every handler on `getAdminContext()` being
  non-null — the *exact* check behind `staffAssist`. A permission-scoped guard is
  intentionally not used, because the `staff`/`viewer` roles that `staffAssist` admits do not
  hold the `media` permission, and gating on it would let the form show but refuse writes.

**API contracts**
- `POST /api/config-uploads` (multipart: `sessionId` + one file) → `assertUploadAllowed` →
  `saveConfigUpload` → returns the stored image (id, hosted URL, dims).
- `GET /api/config-uploads?sessionId=` → the session's images for hydration.
- `DELETE /api/config-uploads?id=` → removes storage object + row.
- The Result-detail GET is extended to include `referenceImages` for the requested id
  (id = session id); no new read path is invented for the gallery.

**Privacy note**
- The `media` bucket is public, so hosted URLs are reachable by anyone holding the
  (unguessable) URL — identical to all existing media, and required so Telegram can reference
  images by URL. "Private" here means **not listed in the DAM**, not access-controlled bytes.
  This is captured in an ADR.

**Docs**
- CONTEXT.md gains **Reference photo**, **Sizing photo**, and **Customisation session** terms
  and cross-links them.
- One ADR records the two hard-to-reverse choices: reference photos bypass the Media Asset
  DAM, and the shared `session_id` where **Mbolster** reuses `responseId`.

## Testing Decisions

Good tests here assert **external behavior**, not implementation details — feed inputs, assert
outputs — following the existing `lib/media-assets` / `lib/appointments` unit-test style (no
framework beyond the current runner, no fixtures).

Modules to test (confirmed with the developer):
- **`assertUploadAllowed`** — accepts a valid image under the count and size limits; rejects
  the 11th image, an over-15 MB file, and a non-image mime, each with the expected typed
  refusal. This is the pure guard for the refusal contract in user stories 8–9.
- **`saveConfigUpload`** — given image bytes it produces an optimized (WebP) object, a
  per-session storage path, and a `config_upload` row carrying the returned dimensions/size —
  and does **not** create a Media Asset (the DAM-bypass contract). Prior art: the media-assets
  ingest/optimize tests.

Telegram batching, the upload component, and the Result-detail gallery are verified by the
manual staging QA sign-off issue rather than automated tests.

## Out of Scope

- **The Image #2 redesign** — Staff assist → toolbar and the richer/expandable suggestion
  card. Deferred to a separate, mockup-first round.
- **Changing the customer Sizing-photo flow** — front/side capture, its data-URL storage, and
  its Telegram delivery all stay exactly as they are.
- **Browser-side compression** — compression is server-side only; the browser uploads the raw
  file. A client pre-resize is a known future option if mobile upload times hurt.
- **Bolster Telegram delivery** — bolster has no "mark final" Telegram step, so its references
  reach the build team via the Result-detail gallery only this round.
- **Image editing, reordering, captions, or albums** — thumbnails + delete only.
- **Surfacing reference photos in the Media Asset library** — deliberately excluded.

## Further Notes

- Reuse over rebuild: the Sharp `optimizeImageForWeb` pipeline, the `media` bucket, the admin
  `getAdminContext()` gate, the media-picker drop-zone pattern, the pillow Telegram media-group
  send, and the Result-detail read all already exist. The only net-new backend is the thin
  `config-upload` module + its route.
- `accept="image/*"` is used deliberately: iOS converts HEIC → JPEG on web upload, so the
  server rarely sees HEIC; anything Sharp still can't decode is refused with a clear error via
  `assertUploadAllowed` / the optimize step.
- The equal-id trick (**Mbolster** passing its session UUID as `responseId` at hold) is what
  lets one gallery query serve both products with no extra column; it is the main
  non-obvious decision and is recorded in the ADR.
- Branch hygiene: build on a fresh branch off `main`. New migrations are not auto-applied —
  apply locally and stage explicitly.
