-- Customer-visible: the label's courier transit window, for the shipping email.
alter table orders
  add column if not exists shipping_min_days integer check (shipping_min_days is null or shipping_min_days >= 0),
  add column if not exists shipping_max_days integer check (shipping_max_days is null or shipping_max_days >= 0);
