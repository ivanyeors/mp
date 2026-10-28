# 09 — Shopify-era order history, settled once, for the same lifecycle

**Issue:** not filed
**Type:** AFK, then HITL (the owner exports and imports the file)
**Status:** not started
**Blocked by:** the owner confirming the amendment to ADR 0029 decision 10
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:db`, `area:migration`

## Goal

A customer who bought on the old shop goes through the same lifecycle as one who bought here
(owner, 2026-10-27). The demo: a Migrated customer who bought two Premium Mpillows in 2024 shows
*Loyal · Repeat purchases* until 2025, then *At risk*, with *more than one pillow* set.

## Why

`migrated_customers` holds a Shopify-era order count and total spent, and nothing else. No
dates, so no customer can be At risk; no products, so *bought a pillow* is unknown. The
Shopify order mirror has no customer fields. `CLAUDE.md`: Shopify-era facts become this
platform's data, settled once, during the migration.

## What to build

- **Stop counting twice.** Slice 03 adds `migrated_customers.shopify_orders_count` to a Migrated
  customer's purchases, with no dates (`lifecycle_undated`). The change that reads the imported
  orders into `purchases` and `last_purchase_at` removes that count in the same migration, and
  `lib/crm/lifecycle-stage.check.ts` gains the case.
- **One table, staff-only** (RLS on, no policy, nothing granted to `anon` or `authenticated`):
  `customer_imported_orders`, one row per Shopify-era order: Customer, Shopify order name, date
  paid, amount, amount refunded, and its lines, each with its product class and quantity.
- **Customers → Import from Shopify gains a second file**, the orders export, under the same
  `customer-import` permission and the same pattern: the browser reads the file and sends only the
  columns used, the server re-validates, one SQL function writes, idempotent and reversible by
  batch. An order is matched to a Customer by its email, as the customer import matches. An
  order with no match is counted and named in the preview, never creating a Customer.
- **Product class** from each line's SKU, settled once at import into Premium, Basic, Mbolster or
  accessory. The preview lists every SKU it cannot place, and the owner assigns each before the
  import applies.
- **The lifecycle reads it.** `purchases` and `last_purchase_at` (slice 03) and
  `customer_purchase_lines` include imported orders, so stages, signals and metrics treat them
  as earlier purchases.

## What does not change

- Customers never see imported orders: not in `/account`, not on an order page (ADR 0029
  decision 10, customer side).
- Imported orders earn no points, pay no commission, deduct no stock and are never fulfilled.
  They are history.
- Nothing reads Shopify after the import. The order mirror stays the Analytics input it is.

## Acceptance criteria

- [ ] Re-importing the same file changes nothing; undoing a batch removes exactly its rows.
- [ ] A refunded Shopify order is not a purchase.
- [ ] A Migrated customer's stage, *bought* and *more than one pillow* read the imported orders.
- [ ] No column of the new table is readable with a customer's key.
