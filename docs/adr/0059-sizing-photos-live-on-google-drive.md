# Sizing photos live on Google Drive; the database holds one only until it has moved

Status: Accepted (owner, 2026-11-26).

Amends ADR 0047 (*The server keeps it as WebP*): where the photo is kept, not how it is checked.

## Context

A customer's front and side **Sizing photos** were kept as WebP data URLs in
`mp_config_response_photos.data_url`, a few hundred KB a row, in a database with a 500 MB
limit, and were never deleted. Nobody saw them outside the Mpillow Telegram group. The owner wants
them somewhere people can look through, sorted by what the photo check found, so they can be
labelled and used to check the screening itself (evals).

## Decision

**Save to the database first, then move to Drive.**

- **The upload is unchanged for the customer.** `POST /api/mp-config/photos` checks the photo and
  saves it to the database exactly as before (ADR 0047). The customer never waits on Google.
- **Right after, the server moves it** (`after()`, `lib/results/sizing-photo-drive.ts`). It uploads
  the photo into the folder for its check result, compares Drive's MD5 with the bytes it sent, and
  only then clears `data_url`, keeping the Drive file id, the view, the check result and the dates.
  The clearing update only applies while the row is unchanged (`updated_at`): a photo the customer
  replaced during the copy keeps the new one, and the stale copy is trashed. When saving the id
  fails and the server cannot tell whether it was saved, the Drive copy is left where it is: a
  stray file beats a lost photo.
- **Folders under `PHOTO_EVAL_DRIVE_FOLDER`**, made by the app when missing:
  - `front`, `back`, `side`: photos that passed, by the view Claude saw. The front slot takes a
    photo from behind (ADR 0047), and it is filed as `back` (`screened_view`).
  - `unchecked`: kept while Claude could not be reached, or from before screening. When the submit
    re-check passes one, it moves to its view's folder, unless a person has already moved it; when
    it rejects one, the file is trashed with the row.
  A Drive file keeps its id when moved, so dragging photos between folders to label them never
  breaks the link.
- **No customer name on Drive.** Files are named `<Result id>-<view>.webp`, with the Result id and
  view as private app properties, so one Result's photos can be found on Drive.
- **Read back through the server only.** Telegram at submit downloads the photo with the server's
  token, as fitting photos are previewed (ADR 0042 f). A photo not yet moved is read from the
  database. Nothing is shared by link.
- **A daily catch-up** in `results-sla` moves up to 50 photos left behind, and posts to the
  Telegram group when a photo has still not moved an hour after its upload. A broken token fills
  the database again, so it must be noticed.
- **Deleting a Result trashes its photos on Drive.** The delete is refused when the photo list
  cannot be read, so no photos are left behind.
- **Its own token**, `GOOGLE_DRIVE_PHOTOS_OAUTH_REFRESH_TOKEN` for sg@mpillow.com, separate from
  the Media library's read-only `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN`. Without it, or without
  `PHOTO_EVAL_DRIVE_FOLDER`, nothing moves and photos stay in the database as before.
- **Rejected photos are still never stored** (ADR 0047). The failure folders the owner made
  (`front-cropped`, `back-cropped`, `side-cropped`, `other-view`, `no-person`) stay empty until
  the owner decides to keep rejected photos for evals, which also needs the customer told.

## Considered options

- **Drive as the first and only store.** Rejected: the customer's upload would wait on Google,
  and fail when Google or the token does.
- **A Supabase Storage bucket.** About 1 GB, shared with the Media library and Staff Reference
  photos: three times the room, but still a ceiling, and no folder people can label in.
- **Cloudflare R2.** A new vendor and account, while Drive is already connected and is where the
  eval folders are.

## Consequences

- Drive holds the only copy. Whoever can edit the folder can delete a customer's photo (Drive's
  trash keeps it 30 days). Keep edit access to very few people, never share it by link, and keep
  it out of folders the whole company can read.
- The photos use sg@mpillow.com's Workspace storage.
- If the Google app is External and in Testing, its refresh tokens expire after 7 days and the
  moves stop; the daily alert says so. It should be Internal.
- A submit reads up to two photos from Drive before posting to Telegram (10 s each at most). A
  photo Drive can't serve is left out, with a line in the message.
- A Result removed any other way (SQL by hand) leaves its photos on Drive, findable by their
  `response_id` app property.
- The migration (`20261126100000_sizing_photos_live_on_drive.sql`) must be applied before this
  code is deployed: the upload writes `screened_view`.

## Setting it up

1. On the OAuth consent screen of the project that holds `GOOGLE_OAUTH_CLIENT_ID`, check the user
   type is Internal, and that the Drive API is enabled.
2. Mint a refresh token for sg@mpillow.com the same way as the Media library's
   (`.claude/PRD-media-asset-library/OPS-CHECKLIST.md` section 2), with one scope:
   - `https://www.googleapis.com/auth/drive.file` (recommended: the app sees only the files it
     made). Then run `scripts/sizing-photos-to-drive.ts --new-root` and use the folder it prints,
     because a folder made by hand is not the app's; or
   - `https://www.googleapis.com/auth/drive`, to use the folder already made, at the cost of the
     app being able to read, change and delete everything in sg@mpillow.com's Drive.
3. Set `GOOGLE_DRIVE_PHOTOS_OAUTH_REFRESH_TOKEN` and `PHOTO_EVAL_DRIVE_FOLDER` in `.env.local` and
   on Vercel (Production).
4. Run the script with `--check`, then `--dry-run`, then with no flag to move the photos already
   in the database.
