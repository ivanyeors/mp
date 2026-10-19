# 03 — Apply, reconcile and roll back an import batch

**Type:** AFK
**Blocked by:** 02
**User stories:** 9, 10, 13
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:customers`, `area:db`

## Goal

Turn the dry-run plan into writes that are all-or-nothing per chunk, re-decided against live
rows, provably reconciled, and undoable.

## Write path

- **The writes go through one SQL function.** `--apply` calls
  `import_shopify_customers(batch_id uuid, rows jsonb)`: SECURITY DEFINER, executable by
  `service_role` only, taking chunks of 100 rows. Each chunk is one transaction.
- **The SQL function makes the final decision.** Between the dry run and the apply, a customer
  may have checked out or signed in. The function re-makes each row's decision against current
  rows (`insert … on conflict ((lower(email))) do nothing`, then the null-fill update). The
  TypeScript `planCustomerRow` is the *preview*; the function is the *authority*. A
  `supabase/tests/` assert file, in the style of `scripts/check-rbac-migrations.sh`, runs the
  same fixture rows through both and requires that they agree.
- **What a `create` writes:** a `customers` row (lowercased email, names, phone, locale
  `en-US`), a `migrated_customers` row with `created_by_import = true`, and the address with
  `is_default = true` (stored in `created_address_id`).
- **What a `merge` writes:** the null-fill on `customers`, a `migrated_customers` row with
  `created_by_import = false`, and the address only if the Customer had none.
- **Batch bookkeeping.** The batch row is inserted first. Its counts are written when the last
  chunk finishes, and then `applied_at` is set.
- **Failure handling.** A chunk that fails stops the run, and the script prints the batch id.
  Re-running the same file continues safely, because finished rows come back as
  `already_imported`.

## Reconcile

After apply, the script checks
`rows_total = created + merged + already_imported + Σ skipped`. It exits non-zero, saying so
loudly, if they differ.

A second `--apply` of the same file must report `created = 0, merged = 0`.

## Rollback

`--rollback <batch_id>`, dry-run by default and `--apply` to execute.

- **Created rows.** Delete the `customers` row when it is still unclaimed (`auth_user_id is null`
  and `claimed_at is null`) **and** nothing references it: `orders`, `carts`, `wishlists`,
  `product_reviews`, `rma_requests`, `readjustment_bookings`, `mp_config_responses.customer_id`.
  The cascade removes `migrated_customers` and the address.
- **Merged rows.** Delete the `migrated_customers` row and the `created_address_id` address.
  Revert nothing on `customers`: the filled nulls are true facts about the person.
- **Kept rows.** A claimed or referenced row is kept and listed by count.
- Finally, set `rolled_back_at`.

## Defaults fix (PRD trap 3c)

- Move the `customer_addresses.country` column default `'MY'` → `'SG'` in a migration.
- Change the zod default in `lib/shop/customer-addresses.ts:22` to match.
- Before changing these, check that the address form always sends a country. If the form relies
  on the default, it is relying on a Malaysian default for a Singapore shop, which is the bug.

## Acceptance criteria

- [ ] Applying a fixture file on a fresh database gives the exact planned counts. A second apply
      gives `created = 0, merged = 0`.
- [ ] A row whose email gains a `customers` row between the dry run and the apply becomes a
      `merge`, not a duplicate and not an error.
- [ ] A merged row never has its `email`, `auth_user_id`, `tags`, `notes` or `total_*` changed.
      This is asserted in the SQL test.
- [ ] Rollback deletes created-and-unclaimed rows, keeps claimed and referenced rows, and reports
      both counts.
- [ ] The `country` default is `'SG'` in the DB and in the zod schema.
- [ ] `import_shopify_customers` cannot be executed by `anon` or `authenticated`.
- [ ] `./scripts/graphify update .` is run in the same commit.
