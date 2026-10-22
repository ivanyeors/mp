-- One-time claim for the Stripe webhook's stock deduction: the delivery that
-- sets it deducts; a concurrent or redelivered event sees it set and skips.
alter table orders add column if not exists inventory_deducted_at timestamptz;
grant select (inventory_deducted_at) on public.orders to authenticated;

-- Paid Orders already deducted. A flagged one stays open so a retry can deduct.
update orders
set inventory_deducted_at = paid_at
where paid_at is not null
  and not needs_attention
  and inventory_deducted_at is null;
