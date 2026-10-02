-- Easyship live shipping rates and label fulfilment (ADR 0020).
--
-- A shipping method keeps its flat `base_rate`, which is still what flat methods
-- charge and is now also the fallback an Easyship method charges when live rates
-- cannot be fetched. `rate_source = 'easyship'` turns a method into a live-rate
-- method: the courier is picked from Easyship's rates by `easyship_strategy`, then
-- marked up and rounded before `free_above` and free-shipping coupons apply.
--
-- DEPLOY ORDER: apply before (or with) the code that ships with it. Checkout and
-- the storefront work against either schema, but the Settings method editor
-- writes the new shipping_methods columns and fails until they exist.

-- ------------------------------------------------------------------
-- 1. Shipping methods: rate source, courier strategy, markup
-- ------------------------------------------------------------------
alter table shipping_methods
  add column if not exists rate_source text not null default 'flat',
  add column if not exists easyship_strategy text not null default 'cheapest',
  add column if not exists easyship_courier_service_id text,
  add column if not exists markup_percent numeric(6,2) not null default 0,
  add column if not exists markup_fixed numeric(10,2) not null default 0,
  add column if not exists rate_rounding numeric(6,2) not null default 0;

alter table shipping_methods drop constraint if exists shipping_methods_rate_source_check;
alter table shipping_methods add constraint shipping_methods_rate_source_check
  check (rate_source in ('flat', 'easyship'));

alter table shipping_methods drop constraint if exists shipping_methods_easyship_strategy_check;
alter table shipping_methods add constraint shipping_methods_easyship_strategy_check
  check (easyship_strategy in ('cheapest', 'fastest', 'best_value', 'courier'));

-- A pinned courier needs its id; the other strategies choose one per quote.
alter table shipping_methods drop constraint if exists shipping_methods_courier_pin_check;
alter table shipping_methods add constraint shipping_methods_courier_pin_check
  check (easyship_strategy <> 'courier' or nullif(trim(easyship_courier_service_id), '') is not null);

alter table shipping_methods drop constraint if exists shipping_methods_markup_check;
alter table shipping_methods add constraint shipping_methods_markup_check
  check (
    markup_percent between -100 and 500
    and markup_fixed between -1000 and 1000
    and rate_rounding between 0 and 100
  );

-- ------------------------------------------------------------------
-- 2. Shipping settings: one row, server-only
-- ------------------------------------------------------------------
-- The Easyship API token and webhook secret are environment variables, never
-- rows. What lives here is what Staff edit in Settings → Shipping: where parcels
-- leave from, how each product type is boxed, and how quotes are presented.
create table if not exists shipping_settings (
  id                      boolean primary key default true check (id),
  easyship_enabled        boolean not null default false,
  origin_address          jsonb not null default '{}'::jsonb,
  -- Box and packed weight per product type; a variant's own weight_grams wins.
  packages                jsonb not null default '{
    "pillow":    {"length_cm": 70, "width_cm": 45, "height_cm": 20, "weight_grams": 1500},
    "bolster":   {"length_cm": 60, "width_cm": 25, "height_cm": 25, "weight_grams": 1200},
    "accessory": {"length_cm": 35, "width_cm": 25, "height_cm": 8,  "weight_grams": 400}
  }'::jsonb,
  incoterms               text not null default 'DDU' check (incoterms in ('DDU', 'DDP')),
  insure_shipments        boolean not null default false,
  hs_code                 text not null default '940490',
  item_category           text not null default 'home_decor',
  handling_days           integer not null default 0 check (handling_days between 0 and 30),
  quote_ttl_minutes       integer not null default 30 check (quote_ttl_minutes between 5 and 1440),
  estimate_declared_value numeric(10,2) not null default 150 check (estimate_declared_value > 0),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

insert into shipping_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists trg_shipping_settings_updated_at on shipping_settings;
create trigger trg_shipping_settings_updated_at
before update on shipping_settings
for each row execute procedure set_updated_at();

-- RLS on with no policies: only server code (service role) reads or writes it.
alter table shipping_settings enable row level security;
revoke all on public.shipping_settings from anon, authenticated;

-- ------------------------------------------------------------------
-- 3. Rate quotes: Easyship responses cached per destination and parcels
-- ------------------------------------------------------------------
-- The checkout page and the checkout route build the same parcels for the same
-- cart, so they hash to the same cache_key and the shopper is charged the rate
-- they were shown, without the client ever sending a price.
create table if not exists shipping_rate_quotes (
  id          uuid primary key default gen_random_uuid(),
  cache_key   text not null,
  country     text not null,
  postal_code text,
  parcels     jsonb not null,
  rates       jsonb not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_shipping_rate_quotes_cache_key
  on shipping_rate_quotes (cache_key, expires_at desc);
create index if not exists idx_shipping_rate_quotes_expires_at
  on shipping_rate_quotes (expires_at);

alter table shipping_rate_quotes enable row level security;
revoke all on public.shipping_rate_quotes from anon, authenticated;

-- ------------------------------------------------------------------
-- 4. Orders: the courier, as the customer may see it
-- ------------------------------------------------------------------
-- Customers read their own orders with `select *` (lib/shop/customer-orders.ts),
-- so only customer-safe columns go on `orders`: the courier's name and its
-- latest tracking status. What the courier costs us and the label live in
-- order_shipments, which only server code can read.
alter table orders
  add column if not exists shipping_courier text,
  add column if not exists shipping_tracking_status text;

create table if not exists order_shipments (
  order_id              uuid primary key references orders(id) on delete cascade,
  -- What the shopper chose at checkout, and what that rate cost us then.
  courier_service_id    text,
  quoted_carrier_cost   numeric(10,2) check (quoted_carrier_cost is null or quoted_carrier_cost >= 0),
  -- The label. `pending:<uuid>` while a purchase is in flight (the claim that
  -- stops two Staff buying two labels for one order).
  easyship_shipment_id  text unique,
  label_state           text,
  label_url             text,
  carrier_cost          numeric(10,2) check (carrier_cost is null or carrier_cost >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

drop trigger if exists trg_order_shipments_updated_at on order_shipments;
create trigger trg_order_shipments_updated_at
before update on order_shipments
for each row execute procedure set_updated_at();

alter table order_shipments enable row level security;
revoke all on public.order_shipments from anon, authenticated;

-- ------------------------------------------------------------------
-- 5. Page builder: the Delivery estimator is an addable custom section
-- ------------------------------------------------------------------
-- Restoring a snapshot removes custom sections added after it; the new type is
-- added to that list so a restored page does not keep a section it never had.
create or replace function public.restore_landing_snapshot(snapshot_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  snap   jsonb;
  staged integer := 0;
begin
  select sections into snap
  from public.landing_page_publishes
  where id = snapshot_id;

  if snap is null then
    raise exception 'Snapshot % not found', snapshot_id using errcode = 'no_data_found';
  end if;

  -- Restoring replaces any pending draft; the caller confirms that first.
  perform public.discard_landing_draft();

  -- Stage only sections that actually differ, so the pending count and the Publish
  -- summary describe the real change instead of listing the whole page.
  with entries as (
    select
      e->>'slug'                          as slug,
      e->>'section_type'                  as section_type,
      (e->>'position')::int               as position,
      (e->>'visible')::boolean            as visible,
      coalesce(e->'content', '{}'::jsonb) as content
    from jsonb_array_elements(snap) as e
  )
  update public.landing_sections s
  set draft_content  = en.content,
      draft_position = en.position,
      draft_visible  = en.visible,
      updated_at     = now()
  from entries en
  where s.slug = en.slug
    and s.section_type = en.section_type
    and (s.content  is distinct from en.content
      or s.position is distinct from en.position
      or s.visible  is distinct from en.visible);

  get diagnostics staged = row_count;

  -- Anything live but absent from the snapshot was added after it, so restoring means
  -- removing it again — but only sections that could have been added through the builder.
  -- A built-in introduced by a later migration must never be destroyed by restoring an
  -- older snapshot, and could not be re-created through the UI.
  update public.landing_sections s
  set draft_deleted = true,
      updated_at    = now()
  where s.section_type in (
      'custom_text_image', 'custom_full_width_image', 'custom_video',
      'custom_rich_text', 'featured_products', 'shop_cta', 'faq',
      'delivery_estimator'
    )
    and not exists (
      select 1 from jsonb_array_elements(snap) as e where e->>'slug' = s.slug
    );

  return staged;
end;
$$;

revoke all on function public.restore_landing_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.restore_landing_snapshot(uuid) to service_role;
