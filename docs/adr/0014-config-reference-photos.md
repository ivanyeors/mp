# Staff reference photos live in the media bucket but bypass the DAM, keyed by a shared session id

Staff assisting a custom **Mpillow** or **Mbolster** build can attach **Reference
photos** to the **Customisation session**. They are compressed server-side (reusing
`optimizeImageForWeb` → WebP q80, ≤2400px) and uploaded to the existing public `media`
bucket under a per-session folder — but they are **not** registered as **Media Assets**,
so they never appear in the DAM (`/settings/media`).

All reference photos for a session are addressed by one `session_id` in the
`config_upload` table. For **Mpillow** that id is the configurator `responseId`. For
**Mbolster** — which has no response record until a hold — the client mints a UUID
upfront, persists it in the hold draft, and passes it as the `responseId` when the hold
is created. So for both products the **Result** id equals the session id, and the
Result-detail gallery finds a session's photos with **no extra column** on the Result.

## Why

Two hard-to-reverse choices, each with real alternatives:

**(1) Bucket, but not the DAM.** Reusing `ingestImageAsset` would have been less code, but
it registers a **Media Asset**, dumping every ad-hoc build snapshot into the curated asset
library and cluttering it for everyone. Reference photos are per-job operational context,
not reusable brand assets. We reuse the optimize→upload steps but insert a `config_upload`
row instead of a `media_asset`.

Privacy nuance: the `media` bucket is **public**, so a hosted URL is reachable by anyone who
has the (unguessable) URL — the same property as all existing media, and **required** so
Telegram can reference the image by URL. "Private" here means **not listed in the DAM**, not
access-controlled bytes. Write access is gated (admin-only API); read is by unguessable URL.

**(2) One shared `session_id`, bolster reuses `responseId`.** The alternatives were giving
bolster its own response record (a second write path and lifecycle to maintain) or adding a
join column to the Result/hold record (a schema change on a hot table, plus per-product
branching in the gallery read). Reusing `responseId` as the bolster session id makes the
Result id == session id uniformly, so one `listConfigUploads(id)` serves both products.

## Considered options

- **Register reference photos as Media Assets (DAM)** — rejected: clutters the curated
  library with per-job snapshots and couples an operational feature to asset governance.
- **A separate private bucket with signed URLs** — rejected as YAGNI: Telegram needs a
  plain URL, the bytes are low-sensitivity build references, and it adds a bucket + signing
  path for no requirement v1 asks for. Revisit if reference photos ever hold PII.
- **Give bolster its own response record / add a Result join column** — rejected: more write
  paths or a schema change on the Result, versus reusing the id bolster already needs at hold.
- **Bucket-without-DAM + shared session id (chosen)** — smallest change that reuses the whole
  existing image pipeline while keeping the DAM clean and the gallery read product-agnostic.

## Consequences

- Reference photos are invisible in `/settings/media`; there is no DAM lifecycle (usage,
  retire) for them — they live and die with their `config_upload` rows.
- Deleting a session's Result does not cascade to `config_upload` (no FK to a Result table,
  since bolster has none pre-hold); orphan rows are harmless and keyed only by session id.
- `assertUploadAllowed` (≤10 images/session, ≤15 MB/file, image mimes) and the admin gate
  live in the API layer; the bucket itself enforces nothing, so all access routes through
  `/api/config-uploads`.
- Telegram media groups cap at 10 items, so pillow "mark final" batches front/side **Sizing
  photos** + **Reference photos** across multiple `sendMediaGroup` calls when they exceed 10.
