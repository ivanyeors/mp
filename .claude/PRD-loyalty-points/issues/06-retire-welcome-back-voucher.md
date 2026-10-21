# 06 — Retire the Welcome-back voucher

**Issue:** not filed
**Type:** AFK
**Status:** built
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

- [x] `rg -i "welcome.?voucher|welcome_back|issued_for"` finds nothing outside migrations,
      ADRs and PRDs. (`graphify-out/` still names the deleted files until the graph is rebuilt;
      see the last item.)
- [x] A saved Segment written with `voucher=` still opens and returns the same Customers, minus
      that filter.
- [x] The Customer overview view test (`lib/crm/__tests__/customer-overview-view.test.ts`) passes
      with the new columns.
- [x] Every coupon test that is not about binding passes unchanged.
- [ ] `./scripts/graphify update .` is run in the same commit, followed by
      `./scripts/graphify label . --missing-only`, because a subsystem is removed. **Not run in
      this build:** the integrator runs both when the slices are merged
      (`rm -rf graphify-out/cache` first, as CLAUDE.md says).

## Build notes

Built on top of `claude/admiring-ride-40h2o6` (`20261021160000_retire_welcome_voucher.sql`).

- **The guard first.** Before anything changes, the migration counts coupons with
  `customer_id` or `issued_for` set and raises if either is above 0, naming both counts
  (`object_not_in_prerequisite_state`, with a hint that the owner decides). It counts
  `customer_id` too, not only `issued_for`: dropping the column would silently turn any bound
  coupon into a bearer code anyone can use. Expected 0 in production.
- **SQL.** Drops `admin_welcome_voucher_summary`, `welcome_voucher_state()`, the six
  `welcome_voucher_*` settings, and from `coupons` the bound check, the `issued_for` check, both
  indexes, `issued_for` and `customer_id` (the foreign key goes with it). `drop view` is
  RESTRICT: the summary is dropped before the overview and recreated after it, and an unknown
  dependent fails the migration rather than vanishing (`pg_depend` shows the summary is the one
  dependent; nothing else uses the row types, and no function body names either view).
- **The rebuilt views.** `admin_customer_overview`: `welcome_voucher_state` becomes, in its
  place, `points_available` (the ledger's sum, as `points_balance()` counts `available`; 0 with
  none) and `claim_bonus_at` (the one `claim_bonus` entry's time), from one grouped join on
  `points_ledger`. Every other column and expression is kept, `search_text` included (its trigram
  index). `admin_customer_migration_summary`: the four voucher columns become `claim_bonuses`,
  `migrated_points_spent`, `points_orders` and `points_revenue`; the last three read one set of
  Orders: paid, by a Migrated customer, with `points_spent` above 0.
- **Privileges carried over.** The old views' table and column ACLs are read from `pg_class`
  into a session temp table before the drop and granted again after the create (a dropped
  column's grants are skipped), then `revoke all … from anon, authenticated` and `grant select …
  to service_role`. Checked by hand: extra grants (one with grant option, two column grants)
  survive exactly, and a second run of the file changes nothing.
- **Checkout.** `validateCoupon` loses the bound branch, `BOUND_COUPON_ERROR`,
  `mayUseBoundCoupon`, the email lookup and the `getSessionCustomerId` option (and its two
  callers). `mayUseAccountValue` (slice 04) is now the one account-binding rule. `Coupon` loses
  `customer_id` and `issued_for`.
- **Deleted.** `welcome-voucher.ts`, `welcome-voucher-terms.ts`, the account voucher card, the
  Discounts voucher card and its API route, the Discounts *Show account-bound vouchers* toggle
  and the `bound=show` filter, both `account.welcome_voucher*` registry entries, their samples
  and `renderWelcomeVoucherEmail`, and the tests of all of these.
- **CRM filter.** `voucher` becomes `points`: *Has points* (`points_available > 0`) or *No
  points* (`≤ 0`, so the two split every Customer), in the Filters panel and the summary chips.
- **Segments.** `SEGMENT_FILTERS_VERSION` is 2. `SEGMENT_UPGRADES[1]` drops `voucher`; a
  version-1 Segment is upgraded each time it is read and saved at 2 when Staff next update its
  filters. One case the spec did not settle: a Segment whose only filter was the voucher would
  read as no filter, every Customer, and a campaign Audience can be a Segment. It *needs review*
  instead, naming `voucher=…`.
- **Staff cards.** The Migration card shows *Claim bonus* (of imported), *Points spent* (points
  and S$) and *Revenue* from the paid orders that used points. The From Shopify card's voucher
  row becomes "Claim bonus: Granted on <date>", from the overview's `claim_bonus_at`.
- **Timeline.** `account.voucher_issued` becomes `account.claim_bonus`, read from
  `points_ledger` (`kind = 'claim_bonus'`), dated by the entry: "Claim bonus: 1,000 points
  (S$10.00)".
- **Tests.** `customer-overview-view.test.ts` lets a migration that drops the view rebuild it,
  and requires the rebuild to recreate the summary after the overview, without `cascade`, and to
  grant the service role. The account-binding table and the forged-body case are ported to
  `spend.test.ts` and `points.test.ts`. Segment tests for version 1 (loads, drops only the
  voucher, the voucher-only case, the same Customers as the list). `assert-06-welcome.sql` now
  asserts the new columns against the ledger and by hand, the card's four columns, the views'
  grants and invoker rights, and that nothing of the voucher is left; `assert-05-claim.sql`
  asserts that coupons bind to no Customer and the Claims write none.
