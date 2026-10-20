# 03 — Apply, reconcile and undo an import batch from the Admin Panel

**Issue:** [#267](https://github.com/ivanyeors/mp/issues/267) (parent #264)
**Type:** AFK
**Status:** built in `e15f787` on `claude/shopify-migration-plan-izv7fo`
**Blocked by:** 02
**User stories:** 9, 10, 13, 15
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`

## Goal

Turn the preview into writes that are all-or-nothing per chunk, re-decided against live rows,
provably reconciled, resumable if the tab closes, and undoable. All of it from the same Admin
Panel page, by the owner.

## Write path

- **The writes go through one SQL function.**
  `import_shopify_customers(batch_id uuid, start_index int, rows jsonb)` is SECURITY DEFINER and
  executable by `service_role` only. It takes chunks of 100 rows, and each chunk is one
  transaction.
- **The SQL function makes the final decision.** Between the preview and the apply, a customer
  may have checked out or signed in. The function re-makes each row's decision against current
  rows (`insert … on conflict ((lower(email))) do nothing`, then the null-fill update).
  - The TypeScript `planCustomerRow` is the *preview*; the function is the *authority*.
  - A `supabase/tests/` assert file, in the style of `scripts/check-rbac-migrations.sh`, runs the
    same fixture rows through both and requires that they agree.
- **What a `create` writes:** a `customers` row (lowercased email, names, phone, locale
  `en-US`), a `migrated_customers` row with `created_by_import = true`, and the address with
  `is_default = true` (stored in `created_address_id`).
- **What a `merge` writes:** the null-fill on `customers`, a `migrated_customers` row with
  `created_by_import = false`, and the address only if the Customer had none.
- **The counts are the server's.** The function adds each chunk's outcomes to the batch row
  itself. The browser only displays them.

## The page: Import, progress, resume

These build on slice 02's preview.

1. **Import N customers.** The button sits under the preview. It names the count that would be
   created and merged, and asks the operator to type `IMPORT` to confirm. An *Import without
   addresses* checkbox gives the conservative import (PRD, Risks). The batch records the choice.
2. **Start.** `startShopifyImport({ fileName, sha256, rowsTotal })` inserts the batch row with
   the actor's user id and **Staff** profile.
3. **Chunks.** The browser sends chunks of 100 to `applyShopifyImportChunk(batchId, startIndex, rows)`,
   which calls `assertAdmin("customer-import")` and then the SQL function. A progress bar shows
   rows done out of rows total.
4. **In-order guard.** The function locks the batch row and refuses a chunk whose `start_index`
   is not the batch's `rows_done`. Two tabs on the same batch therefore cannot double-apply, and
   a retried chunk that already landed is refused rather than counted twice.
5. **Finish.** `finishShopifyImport(batchId)` reconciles (below), sets `applied_at`, and calls
   `recordAdminAction` with `customer_import.apply`, the batch id, and **counts only, no PII**.
6. **Resume.** A batch that never finished shows on the page as *"Import stopped at 1,200 of
   3,400. Pick the same file to continue."* When the operator picks a file with the same
   SHA-256, the page continues from `rows_done`. A different file cannot resume that batch.
7. **Same file twice.** If an applied batch already has this SHA-256, the page says *"This file
   was imported on {date} by {Staff}"*, and shows the preview with the Import button disabled.

## Reconcile

At finish, `rows_total = created + merged + already_imported + Σ skipped` must hold. If it
does not, the batch stays unapplied and the page shows the mismatch in red, so it is never
quietly accepted.

Importing a fresh export that contains the same people reports `created = 0, merged = 0`.

## Import history and Undo

Below the uploader, the page lists the batches: file name, date, who ran it, the four counts,
and the state (*applied*, *stopped*, *undone*).

**Undo** works per batch. It is a preview first, then a typed confirmation:

- **Created rows.** Delete the `customers` row when it is still unclaimed (`auth_user_id is null`
  and `claimed_at is null`) **and** nothing references it: `orders`, `carts`, `wishlists`,
  `product_reviews`, `rma_requests`, `readjustment_bookings`, `mp_config_responses.customer_id`.
  The cascade removes `migrated_customers` and the address.
- **Merged rows.** Delete the `migrated_customers` row and the `created_address_id` address.
  Revert nothing on `customers`: the filled nulls are true facts about the person.
- **Kept rows.** A claimed or referenced row is kept, and the preview lists the count:
  *"312 will be removed. 41 are kept, because they have signed up or bought since."*
- Both functions are SECURITY DEFINER, so each gets `revoke execute … from anon, authenticated`
  (`20260917033807:39-40`), and is called with the service role only.
- The undo runs through a second SECURITY DEFINER function,
  `undo_shopify_import(batch_id)`, then sets `rolled_back_at` and records
  `customer_import.undo` (counts only).

## Defaults fix (PRD trap 3c)

`'MY'` is the default in four places, and all four move to `'SG'`:

- the `customer_addresses.country` column default, in a migration (`0028_ecommerce.sql:251`);
- the customer zod schema (`lib/shop/customer-addresses.ts:22`);
- the Staff route's zod schema (`app/api/shop/customers/[id]/addresses/route.ts:16`);
- the customer address form's starting value, which it always sends
  (`app/[lang]/account/addresses/addresses-client.tsx:51`). Changing only the defaults would
  leave every new address from the form Malaysian.

Existing rows keep the country they were saved with. This slice does not rewrite them.

## Acceptance criteria

- [x] Importing a fixture file on a fresh database gives the exact previewed counts. Importing
      it again gives `created = 0, merged = 0`.
- [x] A row whose email gains a `customers` row between the preview and the apply becomes a
      `merge`, not a duplicate and not an error.
- [x] A merged row never has its `email`, `auth_user_id`, `tags`, `notes` or `total_*` changed.
      This is asserted in the SQL test.
- [x] Closing the tab mid-import and picking the same file resumes from `rows_done`, and the
      finished batch reconciles. A chunk sent twice is refused, not counted twice.
- [x] Undo removes created-and-unclaimed rows, keeps claimed and referenced rows, and reports
      both counts.
- [x] `admin_audit_log` holds one row per apply and per undo, with counts and no customer PII (the
      Staff member's own `actor_email` is written, as `recordAdminAction` always does).
- [x] The `country` default is `'SG'` in the DB and in the zod schema.
- [x] `import_shopify_customers` and `undo_shopify_import` cannot be executed by `anon` or
      `authenticated`.
- [x] `./scripts/graphify update .` is run in the same commit.

## Build notes

**What was built.**

- `supabase/migrations/20261020110000_customer_import_apply.sql`: the write path, all of it in
  SQL functions executable by the service role only.
  - `import_shopify_customers(batch, start_index, rows)` re-decides each row in
    `planCustomerRow`'s order against live rows, writes it, and adds the outcomes to the batch.
  - `finish_shopify_import(batch)` reconciles under the batch lock, then stamps `applied_at`.
  - `preview_shopify_import_undo(batch)` and `undo_shopify_import(batch)` share one plan,
    `customer_import_undo_plan(batch)`.
- `lib/customer-migration/apply.ts` (pure): `applyPayload` (the file-wide duplicate marks),
  `readApplyChunk` and `importRows` (the server's re-read), `readStartInput`, `reconcile`, the
  answer readers, and `runShopifyImport` (chunks of 100 from `rows_done`, resume, finish).
  `lib/customer-migration/batches.ts` (pure): the history view, batch state and same-file lookup.
  `preview.ts` now exports `pickFields` and `takeChunk` (`chunkRows` is built on it).
- `app/[lang]/settings/customers/import/`:
  - `actions.ts` gains `startShopifyImport`, `applyShopifyImportChunk`, `finishShopifyImport`,
    `previewShopifyImportUndo` and `undoShopifyImport`, each behind `assertAdmin("customer-import")`.
  - `history.ts` reads the batches with who ran them, and `page.tsx` passes them in.
  - `import-client.tsx` gains the Import step (count, *Import without addresses*, export date,
    typed `IMPORT`), the progress bar, the same-file guard, *Continue*, the stopped-import
    notice, the history with states, mismatches in red, and Undo (preview, then typed `UNDO`).
    Each history row is `id="batch-<id>"`, for slice 12's links.
- `'MY'` → `'SG'`: `20261020110100_customer_addresses_country_sg.sql`,
  `lib/shop/customer-addresses.ts`, `app/api/shop/customers/[id]/addresses/route.ts` and
  `app/[lang]/account/addresses/addresses-client.tsx`. Existing rows are untouched.

**Migrations.** `20261020110000_customer_import_apply.sql` and
`20261020110100_customer_addresses_country_sg.sql`. Both were applied with every migration to
a fresh Postgres 16 (Supabase stubs and default grants), and the three import migrations were
re-applied (idempotent). The assert files below then passed on that full-schema database and
on `scripts/check-customer-import-sql.sh`'s throwaway cluster. As the service role, the
functions run end to end.

**Tests.**

- `supabase/tests/customer-import/`, run by `./scripts/check-customer-import-sql.sh` in the
  style of `check-rbac-migrations.sh`. It uses a minimal fixture schema, applies the migrations
  twice, and runs the asserts. Each assert file is one transaction that rolls back, so it also
  runs against a full-schema database. `seed.sql` seeds the shared fixture.
  - `assert-agreement.sql` runs `cases.json`'s rows through `import_shopify_customers` in two
    chunks and requires the TS preview's outcomes row for row. It also asserts that:
    - merges never change `email`, `auth_user_id`, `tags`, `notes` or `total_*`, and fill only
      nulls;
    - a create writes the right row, with an `is_default` address, tags and note on
      `migrated_customers` only, and a country as given;
    - no auth user is created;
    - a resent or out-of-place chunk is refused and counts nothing;
    - finish reconciles, and the CHECK refuses an unreconciled `applied_at`;
    - a re-run creates 0, merges 0, and changes not one row;
    - a second live batch for one file fails;
    - a Customer created between the preview and the apply becomes a merge;
    - malformed chunks are refused.
  - `assert-undo.sql`: the tab closes after chunk 1, and the batch resumes from `rows_done`
    and reconciles. Since the import, one row has signed in, one ordered, one has a Result and
    one gained a Staff address. The undo preview is then `removed 1, unlinked 3, kept 4`, and the
    undo does exactly that. Two more cases are kept: a reference from an unlisted (cascading)
    table, and a Claimed merge. A second undo does nothing, and the file imports again.
  - `assert-restore.sql`: an undo restores customers, addresses, `migrated_customers` and
    `auth.users` row for row, apart from the null-fills it keeps by design. A creates-only
    batch restores every column.
  - `assert-grants.sql`: no function is executable by `anon`, `authenticated` or PUBLIC;
    the definer ones pin `search_path`; the client roles hold no table privilege.
  - `assert-defaults.sql`: the `'SG'` default.
- `lib/customer-migration/__tests__/sql-agreement.test.ts` builds `cases.json` from the TS
  fixture (`AGREEMENT_SEED`, `AGREEMENT_EXPORT` in `fixtures.ts`): the rows exactly as the
  server would send them, and the preview's outcomes. It fails if the committed file drifts.
  Regenerate with `UPDATE_SQL_CASES=1`.
- `lib/customer-migration/__tests__/apply.test.ts` drives the browser flow against an in-memory
  stand-in for the SQL function. It covers:
  - the previewed counts, then `0/0` on a re-import;
  - the late Customer becoming a merge;
  - duplicates across chunks;
  - 5,000 rows in ≤ 100-row, < 1 MB chunks;
  - a tab closing and resuming;
  - a lost answer refused and not counted twice;
  - refusals and mismatches;
  - the input, start and answer readers, and the history helpers.
- `app/[lang]/settings/customers/import/__tests__/apply-actions.test.ts`:
  - every action checks `customer-import` and touches nothing without it;
  - the batch insert carries who ran it;
  - one `rpc` per chunk, with no PII back;
  - one audit row per apply and per undo, counts only, and none on a re-finish, a mismatch or
    a second undo;
  - typed `IMPORT` and `UNDO` are re-checked on the server.
- `import-render.test.tsx`: the Import step, the same-file guard, *Continue*, the stopped
  notice, the history (states, counts, Undo, `#batch-<id>`), mismatch in red, and an unreadable
  or empty history.
- `lib/shop/__tests__/address-country-default.test.ts`: `'SG'` in both zod schemas (through
  the Staff route to the row it writes), the form and the migration.
- `preview-action.test.ts`'s static guard narrows. The page, client, history and
  `lib/customer-migration/*` still never write. `actions.ts` inserts only the batch and calls
  only the five named SQL functions. The preview's own body still only reads. `page-gate`
  mocks the history.

**Deviations, and why.**

- **`exported_at` is on the batch.** `customer_import_batches.exported_at date not null` holds
  the operator's date field, which starts at `file.lastModified` as a local date. The server
  accepts 2015-01-01 up to tomorrow by UTC, since Singapore is ahead. Each `migrated_customers`
  row copies it. NOT NULL with no default is safe because nothing wrote a batch before this
  slice.
- **More SQL functions than the two named.**
  - `finish_shopify_import` makes the reconcile atomic under the batch lock. It also checks
    that `migrated_customers` holds `created` and `merged` rows for the batch.
  - The undo preview and the shared plan.
  - `customer_import_skipped_total`, used by a CHECK (`applied_reconciles`), so the database
    itself refuses `applied_at` on a batch that does not reconcile.
- **Referenced is read from the catalog, not a fixed list.**
  - **`wishlists`, in the slice's list, was dropped by `0029`.** A fixed list would name a
    missing table.
  - Every foreign key to `customers` counts. That includes CRM tables that cascade
    (`customer_notes`, follow-ups), which would otherwise delete Staff work silently.
  - Also counted: `mp_config_responses.customer_id` (no FK), and an address the import did
    not write.
  - **A later slice whose import writes per-customer rows must add its table to the exclusion
    in `customer_import_undo_plan`.** Slice 07's consent events are the likely one.
- **A Claimed merged row is kept** (ADR 0028 e: "never a row that has been Claimed"). The slice
  unlinks every merged row. This matters only once slice 05 stamps `claimed_at`. A merged
  Customer whose login predates the import is still unlinked.
- **One live batch per file.** A partial unique index on `file_sha256 where rolled_back_at is
  null` enforces two rules in the database: the same file is not imported twice, and a stopped
  file is resumed, not restarted. Undo frees the file for slice 04's "Undo; import again".
- **`undo_counts jsonb`** on the batch, so the history shows "312 removed, 41 kept" without
  reading the audit log.
- **Serialisation.**
  - Import and undo share one transaction-level advisory lock, so two batches never decide
    the same person at once.
  - Undo also locks the created Customers `FOR UPDATE` before deciding. An Order arriving
    mid-undo therefore waits, then fails its FK, rather than losing its Customer.
- **`startShopifyImport` takes more input:** `{ fileName, sha256, rowsTotal, withAddresses,
  exportedAt, confirmation }`. The server re-checks the typed `IMPORT`, and undo re-checks
  `UNDO`.
- **Resume is one click.** After the preview, *Continue from row N* resumes, with no second typed
  confirmation; it does not start by itself.
- **On a refusal**, if the batch is ahead (a lost answer, or a second tab), the runner moves
  on from the server's `rows_done`. Any other refusal or error stops the run, and the page says
  to pick the same file. Two tabs on one batch leapfrog, and each chunk lands once.
- **File-wide duplicates travel as `{ i, skip }` with no cells.** The server honours only the
  two file-level reasons from the browser, and re-finds in-chunk duplicates itself.
- **A merge's added address is `is_default`:** the Customer had none.
- **The audit payload** is `rows_total`, `created`, `merged`, `already_imported` and `skipped`
  (with `skipped_by_reason`) for apply, and the undo counts for undo. `entity_type` is
  `customer_import_batch`. The file name is left out, because an operator-chosen name could
  carry PII.

**Merging the integration branch** (with CRM 02, 13 and 14, and migration 05) raised no textual
conflict, but it did raise one in meaning. Slice 05's `assert-05-claim.sql` inserted a batch
without `exported_at`, which is now NOT NULL, so its fixture now passes a date.

The undo plan picks up the merged foreign keys by itself. Those are `customer_notes`,
`customer_emails`, `customer_preference_events`, `customer_whatsapp` and `coupons.customer_id`.
None of them is written when a Customer is created, so an unreferenced created row still
undoes. The assert files pass on the merged schema.

**For ops and the owner.** Nothing new. Slice 04 rehearses this on a branch. For slice 12:
batches gain `exported_at` and `undo_counts`, and created rows an undo kept still point their
`migrated_customers.batch_id` at the undone batch. `./scripts/check-customer-import-sql.sh`
needs a local Postgres and is not in CI.
