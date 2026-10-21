# 06 — Retire the Welcome-back voucher

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** 05
**User stories:** underpins 7, 12
**Labels:** `enhancement`, `needs-triage`, `P3`, `area:admin`, `area:checkout`

## Goal

The owner has deleted the voucher feature (decision 14). After slice 05, nothing issues a
Welcome-back voucher and no customer sees one. Remove what is left, so the code has one
incentive, not a live one and a dead one. Staff surfaces show Claim bonus and points facts in
place of voucher facts.

Coupons go back to being bearer codes only. Any future code-based incentive is an ordinary
Discounts code, with no customer binding.

## Scope

**SQL**

- **Drop:**
  - `welcome_voucher_state()` and `admin_welcome_voucher_summary`
    (`20261020121100_welcome_voucher_state.sql`);
  - the six `welcome_voucher_*` settings.
- **Rebuild the views from scratch.** Earlier migrations could redefine them in place only
  because each one kept every column and added new ones at the end. Postgres refuses to drop or
  reorder a view column that way (`20261020200100_customer_overview_claim_and_voucher.sql:5-13`).
  Removing a column therefore means `drop view` and `create view` in one migration, together
  with anything that depends on the views.
  - In `admin_customer_overview`, `welcome_voucher_state` becomes `points_available` and
    `claim_bonus_at`.
  - In `admin_customer_migration_summary`, the four voucher columns become `claim_bonuses`,
    `migrated_points_spent`, `points_orders` and `points_revenue`.
- **`coupons.customer_id`, `issued_for`, their check and their two indexes.**
  - Drop them only if no row has `issued_for` set.
  - Otherwise the migration raises and names the count, and the owner decides.
  - The voucher was never switched on in production, so the expected count is 0.

**TypeScript**

- **Checkout:** remove the bound-coupon branch of `validateCoupon` and its error copy
  (`lib/ecommerce/discounts.ts:35-36,234-243`).
- **The rule moves, it is not deleted.** Points spending uses the same rule, so move
  `mayUseBoundCoupon` (`:46-55`) to `lib/points/` as `mayUseAccountValue`.
- **Delete the voucher modules:**
  - `lib/customer-migration/welcome-voucher.ts` and `welcome-voucher-terms.ts`;
  - `components/account/welcome-voucher-card.tsx`;
  - the Discounts welcome-voucher card and its API (`app/[lang]/settings/discounts/welcome-voucher-card.tsx`,
    `app/api/settings/discounts/welcome-voucher/route.ts`);
  - the account-bound filter in `lib/ecommerce/admin/coupons.ts:25-46`.
- **CRM filter.** `VOUCHER_FILTERS` (`lib/crm/customer-filters.ts:58`, with its parse, URL, chip
  and query) becomes a Points filter: *Has points* or *No points*.
- **Saved Segments.** They store the old URL params as JSON at `filters_version` 1
  (`lib/crm/segment-rules.ts:41,157-163`).
  - Bump the version to 2.
  - Add an upgrade that drops `voucher` from saved Segments.
  - Add a test that a version-1 Segment still loads.
- **Staff cards:**
  - the Migration card (`lib/customer-migration/overview.ts:28-31,52-59,83-86`;
    `app/[lang]/settings/customers/migration-card.tsx`) shows the new summary columns;
  - the From Shopify card's voucher row (`overview.ts:145-153,212-235`;
    `customer-account-cards.tsx:33-60,387`) becomes "Claim bonus: granted on <date>".
- **Timeline.** Its voucher events (`lib/crm/timeline/sources/account.ts:17-19,27-43,88-103`)
  become one Claim bonus event, read from the ledger.
- **Email registry.** Remove both `account.welcome_voucher*` entries.

**Docs and tests**

- Delete the **Welcome-back voucher** entry from CONTEXT.md.
- Update `assert-05-claim.sql` and `assert-06-welcome.sql`.
- Delete `bound-coupon.test.ts`, and both `bound-voucher.test.ts` files, after porting their
  account-binding cases to the points checkout tests.

## Acceptance criteria

- [ ] `rg -i "welcome.?voucher|welcome_back|issued_for"` finds nothing outside migrations,
      ADRs and PRDs.
- [ ] A saved Segment written with `voucher=` still opens and returns the same Customers, minus
      that filter.
- [ ] The Customer overview view test (`lib/crm/__tests__/customer-overview-view.test.ts`) passes
      with the new columns.
- [ ] Every coupon test that is not about binding passes unchanged.
- [ ] `./scripts/graphify update .` is run in the same commit, followed by
      `./scripts/graphify label . --missing-only`, because a subsystem is removed.
