-- Self-collect (CONTEXT.md): a shipping method that names the studio the
-- customer collects from instead of a courier delivering.
--
-- `collect_location_id` points at an own Location (`partners`, ADR 0012). A
-- method with one asks the configurator for no address: the Result and its Order
-- carry the studio's address with the customer as recipient, marked
-- `collect_location`, so no courier label is bought for it. Offered on
-- customisations only — the shop's checkout and quotes leave it out.
--
-- DEPLOY ORDER: apply AFTER the code that ships with it. Code before it lists
-- every active method everywhere, so the seeded row below would show in shop
-- checkout as a free delivery that asks for an address. The new code runs
-- against the old schema unchanged (no method reads as self-collect).

alter table shipping_methods
  add column if not exists collect_location_id uuid references partners(id) on delete restrict;

-- Nothing is couriered, so there is no live rate to quote.
alter table shipping_methods drop constraint if exists shipping_methods_collect_flat_check;
alter table shipping_methods add constraint shipping_methods_collect_flat_check
  check (collect_location_id is null or rate_source = 'flat');

-- One Self-collect method at the first own studio with an address. Free, SG.
insert into shipping_methods
  (slug, content, base_rate, free_above, currency, countries, is_active, position, rate_source, collect_location_id)
select
  'self-collect',
  jsonb_build_object(
    'en-US', jsonb_build_object(
      'name', 'Self-collect',
      'description', 'Collect your order from our studio',
      'estimated_days', ''
    ),
    'zh-CN', jsonb_build_object(
      'name', '门店自取',
      'description', '到我们的门店自取',
      'estimated_days', ''
    )
  ),
  0,
  null,
  'SGD',
  '{SG}',
  true,
  coalesce((select max(position) + 1 from shipping_methods), 0),
  'flat',
  studio.id
from (
  select id
  from partners
  where type = 'own' and nullif(trim(address), '') is not null
  order by position
  limit 1
) studio
on conflict (slug) do nothing;
