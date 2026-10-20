# 03 — Apply, reconcile and undo an import batch from the Admin Panel

**Type:** AFK
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
- The undo runs through a second SECURITY DEFINER function,
  `undo_shopify_import(batch_id)`, then sets `rolled_back_at` and records
  `customer_import.undo` (counts only).

## Defaults fix (PRD trap 3c)

- Move the `customer_addresses.country` column default `'MY'` → `'SG'` in a migration.
- Change the zod default in `lib/shop/customer-addresses.ts:22` to match.
- Before changing these, check that the address form always sends a country. If the form relies
  on the default, it is relying on a Malaysian default for a Singapore shop, which is the bug.

## Acceptance criteria

- [ ] Importing a fixture file on a fresh database gives the exact previewed counts. Importing
      it again gives `created = 0, merged = 0`.
- [ ] A row whose email gains a `customers` row between the preview and the apply becomes a
      `merge`, not a duplicate and not an error.
- [ ] A merged row never has its `email`, `auth_user_id`, `tags`, `notes` or `total_*` changed.
      This is asserted in the SQL test.
- [ ] Closing the tab mid-import and picking the same file resumes from `rows_done`, and the
      finished batch reconciles. A chunk sent twice is refused, not counted twice.
- [ ] Undo removes created-and-unclaimed rows, keeps claimed and referenced rows, and reports
      both counts.
- [ ] `admin_audit_log` holds one row per apply and per undo, with counts and no email or name.
- [ ] The `country` default is `'SG'` in the DB and in the zod schema.
- [ ] `import_shopify_customers` and `undo_shopify_import` cannot be executed by `anon` or
      `authenticated`.
- [ ] `./scripts/graphify update .` is run in the same commit.
