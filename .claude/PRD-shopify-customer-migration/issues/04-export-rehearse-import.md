# 04 — Export from Shopify, rehearse, then import into production from the Admin Panel

**Type:** HITL
**Blocked by:** 03, 12; owner decisions 1 and 7
**User stories:** 2, 8, 14, 15
**Labels:** `ops`, `needs-triage`, `P2`, `area:customers`

## Goal

Real data goes into production once: rehearsed, backed up, and with nothing in git or in a
shared folder that should not be. The owner can run every step from a browser.

## Steps

1. **Export.** Shopify Admin → Customers → **Export** → *All customers* → **Plain CSV file**
   (not "CSV for Excel"). A large export arrives by email.
2. **Store it.** Keep it in Downloads or another private folder. It never goes into the repo,
   Google Drive, Slack, Telegram or the Media library. **Do not open it in Excel or Numbers.**
   Saving it again strips the leading zero from Singapore postal codes.
3. **Record the header row in this issue**, with no data rows. The import page shows it after
   picking the file. If it differs from the PRD's expected columns, update `shopify-csv.ts` and
   ADR 0026 (a) before going on.
4. **Preview.** Paste the outcome counts, skip reasons and repair counts here (counts only).
   Check the buyers vs subscribers split against what Shopify's customer list shows.
5. **Rehearse** on a deployment whose Supabase is a branch or a staging project, never
   production. If Vercel preview deployments share the production database, rehearse with
   `npm run dev` against a Supabase branch instead.
   - Import; reconcile passes.
   - Pick the same file again; the page reports it was already imported.
   - Close the tab mid-import, then resume.
   - Undo; import again.
   - Spot-check 20 random customers in Admin Panel → Customers against Shopify: name, address,
     country `SG`, postal code with its zero, the *Shopify* badge, and *No account*.
6. **Back up production.** Confirm point-in-time recovery is on for the plan, or take a dump of
   `customers` and `customer_addresses` before applying.
7. **Import into production** from Admin Panel → Customers → Import from Shopify. Record the
   batch id and the counts here (counts only).
8. **Smoke-test the claim and the status.** Sign in to the live site with the owner's own
   Shopify-customer email.
   - You should land on the imported row, with the address present and no duplicate row.
   - In the Admin Panel, that row now shows *Signed up* with today's date (slice 12).
   - If slice 05 is live, the voucher appears.
9. **Keep the file** (still private) until slice 10, which needs a fresh export for the delta
   anyway. Then destroy it.

## Acceptance criteria

- [ ] The header row is recorded here, and the import page accepted it unmodified (or the parser
      was updated first).
- [ ] The rehearsal shows reconcile, the same-file guard, resume and undo, all on a
      non-production database.
- [ ] A production backup was confirmed before the import.
- [ ] The production batch reconciles, and its id and counts are recorded here.
- [ ] The owner's own sign-in lands on the imported row, and the Admin Panel shows it as
      *Signed up*.
- [ ] `git status` shows no export file anywhere.
