-- Partner self-purchase (#82, ADR 0015): a signed-in partner buying pillows/
-- bolsters in their OWN account gets an admin-set partner rate (discount vs MSRP),
-- capped at an admin-set number of units. Self-purchases are UNATTRIBUTED
-- (orders.partner_id stays null), so commission (#77 guards on order.partner_id)
-- and milestone (#79) never fire — the better price IS the reward.
--
-- Additive/prod-safe per ADR 0012 expand pattern (add column if not exists,
-- service-role RLS already covers these tables). Deployed code never reads these
-- columns, so the migration is invisible to production. Zero cap by default =
-- feature off until an admin sets a rate + cap on a partner.

-- Rate + cap live beside the Commission scheme, keyed on the same partner the
-- Admin Panel selects (partners.id). Percent (0-100) or flat $ off per unit,
-- capped at self_purchase_unit_cap discounted units total across all self-purchases.
alter table partners
  add column if not exists self_purchase_kind     text
    check (self_purchase_kind in ('flat', 'percent')),
  add column if not exists self_purchase_amount   numeric(12,2) not null default 0
    check (self_purchase_amount >= 0),
  add column if not exists self_purchase_unit_cap  int not null default 0
    check (self_purchase_unit_cap >= 0);

-- Marker + allowance owner on a self-purchase order. self_purchase_partner_id is
-- DELIBERATELY NOT orders.partner_id: it identifies the buying partner for cap
-- tracking / reporting WITHOUT triggering commission or milestone (both key on
-- partner_id). self_purchase_units = how many units on this order got the discount;
-- consumed allowance = sum over the partner's prior paid, non-cancelled orders.
alter table orders
  add column if not exists self_purchase_partner_id uuid references partners(id) on delete set null,
  add column if not exists self_purchase_units       int not null default 0
    check (self_purchase_units >= 0);

create index if not exists idx_orders_self_purchase_partner
  on orders (self_purchase_partner_id) where self_purchase_partner_id is not null;
