-- Atomic coupon usage increment (Slice 10)
create or replace function increment_coupon_usage(coupon_id uuid)
returns void
language sql
as $$
  update coupons set usage_count = usage_count + 1 where id = coupon_id;
$$;
