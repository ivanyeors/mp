# 11 — *(optional)* One complimentary re-adjustment for Migrated customers

**Type:** AFK
**Blocked by:** 05; owner decision 5
**User stories:** 7
**Labels:** `enhancement`, `needs-triage`, `P3`, `area:readjustment`

## Goal

Give Shopify-era pillow owners the strongest honest reason to claim an account. Booking a
**Re-adjustment** already requires **Sign in** (ADR 0024), so a free one is a reason to claim
that costs Staff time rather than margin, and brings the customer into a **Location**.

Build this only if the owner says yes. Until then, Shopify purchases stay "not listed" and are
charged the fee, exactly as ADR 0024 decided.

## Why it needs its own grant

The complimentary rule cannot reach these purchases today:

- `evaluateReadjustment` returns `unlisted` for any non-platform purchase
  (`lib/readjustment/eligibility.ts:78`).
- `readjustment_bookings` has a CHECK that binds `complimentary` to `purchase_source = 'platform'`
  (`20261013120000_readjustment_bookings.sql:47`).

Shopify orders stay unlinked, so there is no line to hang the free visit on. The grant is
therefore per **Customer**, not per pillow.

```sql
create table readjustment_grants (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  reason       text not null check (reason in ('shopify_migration')),
  granted_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_booking_id uuid null unique references readjustment_bookings(id),
  unique (customer_id, reason)
);
```

## Scope

- **Granting.** `claim_migrated_customer` (slice 05) also inserts the grant when
  `readjustment_grant_enabled` is set. The policy is one grant per Migrated customer, expiring
  with the voucher window (owner may change).
- **Eligibility.** `evaluateReadjustment` gains a grant input. For an `unlisted` purchase with
  `unlisted_where = 'online_before_accounts'`, an unused and unexpired grant returns
  `complimentary: true`. Owner decision 5 settles whether this covers Premium Mpillow only or
  every pillow. Every other path stays byte-identical.
- **Schema.** Relax the CHECK so that `complimentary` with `purchase_source = 'unlisted'` is
  allowed only when a grant is consumed. Consume it race-safely through the `unique` on
  `used_booking_id`. Cancelling or expiring the booking gives the grant back, mirroring how
  complimentary seats are returned today.
- **The visit.** Staff still check proof of purchase at the visit, as for every unlisted booking.
- **Docs.** Amend ADR 0024 with a dated line: Shopify orders stay unlinked, and a Migrated
  customer may hold one granted visit.

## Acceptance criteria

- [ ] A Migrated customer with a grant books one free "online before accounts" re-adjustment.
      The second booking is charged.
- [ ] A cancelled granted booking returns the grant.
- [ ] Non-migrated unlisted bookings and all platform bookings price exactly as before; the
      existing tests pass unchanged.
- [ ] `./scripts/graphify update .` is run in the same commit.
