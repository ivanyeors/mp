# 04 — Export from Shopify, rehearse on a branch, import into production

**Type:** HITL
**Blocked by:** 03; owner decisions 1 and 7
**User stories:** 2, 8
**Labels:** `ops`, `needs-triage`, `P2`, `area:customers`

## Goal

Real data goes into production once: rehearsed, backed up, and with nothing on screen or in git
that should not be.

## Steps

1. **Export.** Shopify Admin → Customers → **Export** → *All customers* → **Plain CSV file**
   (not "CSV for Excel"). A large export arrives by email.
2. **Store it.** Save to `info/private/` (gitignored) or outside the repo. **Do not open it in
   Excel or Numbers.** Saving it again strips the leading zero from Singapore postal codes.
3. **Record the header row in this issue**, with no data rows. If it differs from the PRD's
   expected columns, update `shopify-csv.ts` and ADR 0026 (a) before going on.
4. **Dry run.** Paste the outcome counts, skip reasons and repair counts here. Check the buyers
   vs subscribers split against what Shopify's customer list shows.
5. **Rehearse on a Supabase branch or staging project:**
   - apply; reconcile passes;
   - apply again; `created = 0, merged = 0`;
   - roll back; apply again;
   - spot-check 20 random customers in Admin Panel → Customers against Shopify (name, address,
     country `SG`, postal code with its zero).
6. **Back up production.** Confirm point-in-time recovery is on for the plan, or take a dump of
   `customers` and `customer_addresses` before applying.
7. **Apply to production.** Record the batch id and the counts here (counts only).
8. **Smoke test the claim.** Sign in to the live site with the owner's own Shopify-customer
   email. You should land on the imported row, with the address present and no duplicate row. If
   slice 05 is live, the voucher appears.
9. **Keep the file** (still outside git) until slice 10, which needs a fresh export for the delta
   anyway. Then destroy it.

## Acceptance criteria

- [ ] The header row is recorded here, and the importer accepted it unmodified (or was updated
      first).
- [ ] The rehearsal shows reconcile, idempotent re-apply and rollback, all on a non-production
      database.
- [ ] A production backup was confirmed before the apply.
- [ ] The production batch reconciles, and its id and counts are recorded here.
- [ ] The owner's own sign-in lands on the imported row.
- [ ] `git status` shows no export file anywhere.
