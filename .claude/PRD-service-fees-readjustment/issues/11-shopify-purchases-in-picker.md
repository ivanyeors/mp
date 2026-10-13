# 11 — Shopify purchases in the picker (email on the mirror, backfill, match by email)

**Type:** AFK, plus a HITL scope check before building
**Blocked by:** 07
**User stories:** 18
**Labels:** `enhancement`, `needs-triage`, `P3`, `area:shopify`
**Deferrable.** *My pillow isn't listed* (slices 07/08) is the working fallback.

## Goal

A customer who bought a Premium Mpillow on Shopify last month signs in with the same email and sees that pillow in the picker, with *Complimentary until …*, instead of being sent down *not listed* at $30.

## Why it is not simply there

- **No email in the mirror.** `shopify_orders` and `shopify_order_lines` store no email or customer reference (`supabase/migrations/20260715013000_shopify_order_mirror_schema.sql:8-44`).
- **Ingest drops it.** The catch-up already fetches full order payloads (`lib/shopify/orders.ts:88-118`, `status=any` plus `since_id`), but the email is discarded when the mirror row is built (`lib/shopify/order-mirror-ingest.ts:309-344`).
- **Payloads are partial.** `shopify_processed_orders.payload` keeps raw webhook bodies, but only since webhook go-live (`app/api/shopify/webhook/route.ts:167-172`).

## HITL scope check (before any code)

Confirm on the Shopify app:

- that it can read the customer email on orders (Shopify protected customer data, Level 2);
- that it has `read_all_orders`, which is needed for orders older than 60 days. These are irrelevant to the free window but matter for "list all my pillows".

Record both in the slice notes. If email is not readable, close this slice as *won't do*. *Not listed* stays the path.

## Scope

- **Migration:** `alter table shopify_orders add column if not exists email text`, plus an index on `lower(email)`.
- **Ingest:** keep `order.email` (lower-cased) at ingest. **Backfill** existing rows by re-fetching through the existing catch-up, keyed on mirror ids already present.
- **Picker:** `listReadjustablePurchases` (slice 06) adds mirror lines where `lower(shopify_orders.email) = lower(customer.email)` and `mapping_kind in ('pillow','bolster')`:
  - **Tier and size:** from `shopify_variant_mappings` → `pillow_products(kind, size)`. A line with no mapping is listed as *"Pillow (Shopify)"* with no tier, so it is charged.
  - **`paid_at`:** from `shopify_orders.paid_at`.
  - **Source:** `purchase_source = 'shopify'`, `shopify_order_line_id` set.
- **Eligibility:** `evaluateReadjustment` treats `shopify` like `platform`. The CHECK in slice 06 that restricts complimentary to `platform` is widened to `platform` and `shopify`. The partial unique index gains a `shopify_order_line_id` twin.
- **Privacy:** the email column is server-only. The mirror tables are not exposed to `authenticated` today; keep it that way.

## Acceptance criteria

- [ ] Scope check recorded. Proceed only if email is readable.
- [ ] New mirror rows carry the email, and backfilled rows match the Shopify Admin for a 20-order sample.
- [ ] A customer whose email matches a Shopify Premium order paid 10 days ago sees it with *Complimentary until …*, and can book it free once.
- [ ] A Shopify line with no variant mapping is listed and charged, never free.
- [ ] No customer can read `shopify_orders.email` through any client.
