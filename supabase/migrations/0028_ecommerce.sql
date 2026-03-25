-- ============================================================
-- E-Commerce System
-- ============================================================

-- Enums
create type product_status as enum ('draft', 'active', 'archived');
create type product_type as enum ('pillow', 'bolster', 'accessory', 'bundle');
create type order_status as enum ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');
create type discount_type as enum ('percentage', 'fixed_amount', 'free_shipping');
create type review_status as enum ('pending', 'approved', 'rejected');

-- ============================================================
-- CATEGORIES (hierarchical)
-- ============================================================
create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references categories(id) on delete set null,
  slug        text not null,
  content     jsonb not null default '{}',
  image_url   text,
  position    integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index idx_categories_slug on categories(slug);
create index idx_categories_parent on categories(parent_id);
create index idx_categories_position on categories(position);

drop trigger if exists trg_categories_updated_at on categories;
create trigger trg_categories_updated_at
before update on categories
for each row execute procedure set_updated_at();

alter table categories enable row level security;
create policy "Public read active categories" on categories
  for select using (is_active = true);
create policy "Service role full access categories" on categories
  for all using (true) with check (true);

-- ============================================================
-- PRODUCTS
-- ============================================================
create table if not exists products (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null,
  product_type          product_type not null default 'pillow',
  status                product_status not null default 'draft',
  content               jsonb not null default '{}',
  category_id           uuid references categories(id) on delete set null,
  featured              boolean not null default false,
  tags                  text[] not null default '{}',
  stripe_product_id     text,
  stripe_payment_link   text,
  stripe_payment_link_id text,
  published_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index idx_products_slug on products(slug);
create index idx_products_status on products(status);
create index idx_products_category on products(category_id);
create index idx_products_featured on products(featured) where featured = true;
create index idx_products_tags on products using gin(tags);

drop trigger if exists trg_products_updated_at on products;
create trigger trg_products_updated_at
before update on products
for each row execute procedure set_updated_at();

alter table products enable row level security;
create policy "Public read active products" on products
  for select using (status = 'active');
create policy "Service role full access products" on products
  for all using (true) with check (true);

-- ============================================================
-- PRODUCT OPTIONS
-- ============================================================
create table if not exists product_options (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  name        text not null,
  position    integer not null default 0,
  values      jsonb not null default '[]'
);

create index idx_product_options_product on product_options(product_id, position);

alter table product_options enable row level security;
create policy "Public read product_options" on product_options
  for select using (true);
create policy "Service role full access product_options" on product_options
  for all using (true) with check (true);

-- ============================================================
-- PRODUCT VARIANTS
-- ============================================================
create table if not exists product_variants (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references products(id) on delete cascade,
  sku                text,
  title              text,
  option1            text,
  option2            text,
  option3            text,
  price              numeric(10,2) not null check (price >= 0),
  compare_at_price   numeric(10,2) check (compare_at_price is null or compare_at_price >= 0),
  cost_price         numeric(10,2) check (cost_price is null or cost_price >= 0),
  currency           text not null default 'MYR',
  stock_quantity     integer not null default 0,
  track_inventory    boolean not null default true,
  weight_grams       integer,
  image_url          text,
  is_active          boolean not null default true,
  position           integer not null default 0,
  stripe_price_id    text,
  item_id            bigint references items(id) on delete set null,
  pillow_product_id  bigint references pillow_products(id) on delete set null,
  shopify_variant_id bigint,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index idx_product_variants_sku on product_variants(sku) where sku is not null;
create index idx_product_variants_product on product_variants(product_id);
create index idx_product_variants_position on product_variants(product_id, position);

drop trigger if exists trg_product_variants_updated_at on product_variants;
create trigger trg_product_variants_updated_at
before update on product_variants
for each row execute procedure set_updated_at();

alter table product_variants enable row level security;
create policy "Public read active product_variants" on product_variants
  for select using (is_active = true);
create policy "Service role full access product_variants" on product_variants
  for all using (true) with check (true);

-- ============================================================
-- PRODUCT IMAGES
-- ============================================================
create table if not exists product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  variant_id  uuid references product_variants(id) on delete set null,
  url         text not null,
  alt_text    text,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index idx_product_images_product on product_images(product_id, position);
create index idx_product_images_variant on product_images(variant_id) where variant_id is not null;

alter table product_images enable row level security;
create policy "Public read product_images" on product_images
  for select using (true);
create policy "Service role full access product_images" on product_images
  for all using (true) with check (true);

-- ============================================================
-- COLLECTIONS
-- ============================================================
create table if not exists collections (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null,
  collection_type text not null default 'manual' check (collection_type in ('manual', 'auto')),
  content         jsonb not null default '{}',
  image_url       text,
  rules           jsonb default '[]',
  sort_order      text default 'manual',
  is_active       boolean not null default true,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index idx_collections_slug on collections(slug);

drop trigger if exists trg_collections_updated_at on collections;
create trigger trg_collections_updated_at
before update on collections
for each row execute procedure set_updated_at();

alter table collections enable row level security;
create policy "Public read active collections" on collections
  for select using (is_active = true);
create policy "Service role full access collections" on collections
  for all using (true) with check (true);

create table if not exists collection_products (
  collection_id uuid not null references collections(id) on delete cascade,
  product_id    uuid not null references products(id) on delete cascade,
  position      integer not null default 0,
  primary key (collection_id, product_id)
);

create index idx_collection_products_product on collection_products(product_id);

alter table collection_products enable row level security;
create policy "Public read collection_products" on collection_products
  for select using (true);
create policy "Service role full access collection_products" on collection_products
  for all using (true) with check (true);

-- ============================================================
-- CUSTOMERS
-- ============================================================
create table if not exists customers (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  first_name   text,
  last_name    text,
  phone        text,
  locale       text not null default 'en-US' check (locale in ('en-US', 'zh-CN')),
  tags         text[] not null default '{}',
  notes        text,
  total_orders integer not null default 0,
  total_spent  numeric(12,2) not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index idx_customers_email on customers(lower(email));

drop trigger if exists trg_customers_updated_at on customers;
create trigger trg_customers_updated_at
before update on customers
for each row execute procedure set_updated_at();

alter table customers enable row level security;
create policy "Service role full access customers" on customers
  for all using (true) with check (true);

-- ============================================================
-- CUSTOMER ADDRESSES
-- ============================================================
create table if not exists customer_addresses (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  label        text,
  recipient    text not null,
  line1        text not null,
  line2        text,
  city         text not null,
  state        text,
  postal_code  text not null,
  country      text not null default 'MY',
  phone        text,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_customer_addresses_customer on customer_addresses(customer_id);

drop trigger if exists trg_customer_addresses_updated_at on customer_addresses;
create trigger trg_customer_addresses_updated_at
before update on customer_addresses
for each row execute procedure set_updated_at();

alter table customer_addresses enable row level security;
create policy "Service role full access customer_addresses" on customer_addresses
  for all using (true) with check (true);

-- ============================================================
-- CARTS
-- ============================================================
create table if not exists carts (
  id          uuid primary key default gen_random_uuid(),
  token       text not null,
  customer_id uuid references customers(id) on delete set null,
  currency    text not null default 'MYR',
  expires_at  timestamptz not null default (now() + interval '30 days'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index idx_carts_token on carts(token);
create index idx_carts_customer on carts(customer_id) where customer_id is not null;
create index idx_carts_expires on carts(expires_at);

drop trigger if exists trg_carts_updated_at on carts;
create trigger trg_carts_updated_at
before update on carts
for each row execute procedure set_updated_at();

alter table carts enable row level security;
create policy "Service role full access carts" on carts
  for all using (true) with check (true);

-- ============================================================
-- CART ITEMS
-- ============================================================
create table if not exists cart_items (
  id         uuid primary key default gen_random_uuid(),
  cart_id    uuid not null references carts(id) on delete cascade,
  variant_id uuid not null references product_variants(id) on delete cascade,
  quantity   integer not null check (quantity > 0),
  added_at   timestamptz not null default now(),
  unique (cart_id, variant_id)
);

create index idx_cart_items_cart on cart_items(cart_id);
create index idx_cart_items_variant on cart_items(variant_id);

alter table cart_items enable row level security;
create policy "Service role full access cart_items" on cart_items
  for all using (true) with check (true);

-- ============================================================
-- SHIPPING METHODS
-- ============================================================
create table if not exists shipping_methods (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null,
  content    jsonb not null default '{}',
  base_rate  numeric(10,2) not null default 0 check (base_rate >= 0),
  free_above numeric(10,2),
  currency   text not null default 'MYR',
  countries  text[] not null default '{MY}',
  is_active  boolean not null default true,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_shipping_methods_slug on shipping_methods(slug);

drop trigger if exists trg_shipping_methods_updated_at on shipping_methods;
create trigger trg_shipping_methods_updated_at
before update on shipping_methods
for each row execute procedure set_updated_at();

alter table shipping_methods enable row level security;
create policy "Public read active shipping_methods" on shipping_methods
  for select using (is_active = true);
create policy "Service role full access shipping_methods" on shipping_methods
  for all using (true) with check (true);

-- ============================================================
-- COUPONS
-- ============================================================
create table if not exists coupons (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null,
  discount_type      discount_type not null,
  discount_value     numeric(10,2) not null check (discount_value > 0),
  currency           text not null default 'MYR',
  min_order_amount   numeric(10,2),
  max_discount       numeric(10,2),
  usage_limit        integer,
  usage_count        integer not null default 0,
  per_customer_limit integer default 1,
  starts_at          timestamptz,
  expires_at         timestamptz,
  applies_to         jsonb,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (
    (discount_type = 'percentage' and discount_value <= 100) or
    discount_type != 'percentage'
  )
);

create unique index idx_coupons_code on coupons(upper(code));

drop trigger if exists trg_coupons_updated_at on coupons;
create trigger trg_coupons_updated_at
before update on coupons
for each row execute procedure set_updated_at();

alter table coupons enable row level security;
create policy "Service role full access coupons" on coupons
  for all using (true) with check (true);

-- ============================================================
-- ORDERS
-- ============================================================
create table if not exists orders (
  id                 uuid primary key default gen_random_uuid(),
  order_number       text not null,
  customer_id        uuid references customers(id) on delete set null,
  email              text not null,
  phone              text,
  status             order_status not null default 'pending',
  currency           text not null default 'MYR',
  subtotal           numeric(12,2) not null check (subtotal >= 0),
  shipping_amount    numeric(12,2) not null default 0 check (shipping_amount >= 0),
  tax_amount         numeric(12,2) not null default 0 check (tax_amount >= 0),
  discount_amount    numeric(12,2) not null default 0 check (discount_amount >= 0),
  total              numeric(12,2) not null check (total >= 0),
  shipping_address   jsonb not null,
  billing_address    jsonb,
  shipping_method_id uuid references shipping_methods(id) on delete set null,
  coupon_id          uuid references coupons(id) on delete set null,
  coupon_code        text,
  notes              text,
  internal_notes     text,
  payment_method     text,
  payment_reference  text,
  paid_at            timestamptz,
  tracking_number    text,
  tracking_url       text,
  shipped_at         timestamptz,
  delivered_at       timestamptz,
  cancelled_at       timestamptz,
  shopify_order_id   bigint,
  stripe_session_id  text,
  locale             text not null default 'en-US',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index idx_orders_order_number on orders(order_number);
create index idx_orders_status on orders(status);
create index idx_orders_email on orders(lower(email));
create index idx_orders_customer on orders(customer_id) where customer_id is not null;
create index idx_orders_created on orders(created_at desc);
create index idx_orders_stripe_session on orders(stripe_session_id) where stripe_session_id is not null;

drop trigger if exists trg_orders_updated_at on orders;
create trigger trg_orders_updated_at
before update on orders
for each row execute procedure set_updated_at();

alter table orders enable row level security;
create policy "Service role full access orders" on orders
  for all using (true) with check (true);

-- Order number auto-generation: MP-YYYYMMDD-XXXX
create sequence if not exists order_number_seq start with 1;

create or replace function generate_order_number()
returns trigger as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := 'MP-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('order_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_orders_generate_number on orders;
create trigger trg_orders_generate_number
before insert on orders
for each row execute procedure generate_order_number();

-- ============================================================
-- ORDER ITEMS
-- ============================================================
create table if not exists order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  variant_id    uuid references product_variants(id) on delete set null,
  sku           text not null,
  product_title text not null,
  variant_title text,
  image_url     text,
  quantity      integer not null check (quantity > 0),
  unit_price    numeric(12,2) not null check (unit_price >= 0),
  total_price   numeric(12,2) not null check (total_price >= 0),
  created_at    timestamptz not null default now()
);

create index idx_order_items_order on order_items(order_id);
create index idx_order_items_variant on order_items(variant_id) where variant_id is not null;

alter table order_items enable row level security;
create policy "Service role full access order_items" on order_items
  for all using (true) with check (true);

-- ============================================================
-- ORDER TIMELINE (audit trail)
-- ============================================================
create table if not exists order_timeline (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders(id) on delete cascade,
  event_type text not null,
  message    text,
  metadata   jsonb default '{}',
  created_at timestamptz not null default now()
);

create index idx_order_timeline_order on order_timeline(order_id, created_at);

alter table order_timeline enable row level security;
create policy "Service role full access order_timeline" on order_timeline
  for all using (true) with check (true);

-- ============================================================
-- PRODUCT REVIEWS
-- ============================================================
create table if not exists product_reviews (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  order_id    uuid references orders(id) on delete set null,
  author_name text not null,
  rating      integer not null check (rating >= 1 and rating <= 5),
  title       text,
  body        text,
  status      review_status not null default 'pending',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_product_reviews_product on product_reviews(product_id);
create index idx_product_reviews_status on product_reviews(status);

drop trigger if exists trg_product_reviews_updated_at on product_reviews;
create trigger trg_product_reviews_updated_at
before update on product_reviews
for each row execute procedure set_updated_at();

alter table product_reviews enable row level security;
create policy "Public read approved reviews" on product_reviews
  for select using (status = 'approved');
create policy "Service role full access product_reviews" on product_reviews
  for all using (true) with check (true);

-- ============================================================
-- WISHLISTS
-- ============================================================
create table if not exists wishlists (
  id          uuid primary key default gen_random_uuid(),
  token       text not null,
  customer_id uuid references customers(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create unique index idx_wishlists_token on wishlists(token);
create index idx_wishlists_customer on wishlists(customer_id) where customer_id is not null;

alter table wishlists enable row level security;
create policy "Service role full access wishlists" on wishlists
  for all using (true) with check (true);

create table if not exists wishlist_items (
  id          uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references wishlists(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  variant_id  uuid references product_variants(id) on delete cascade,
  added_at    timestamptz not null default now()
);

create index idx_wishlist_items_wishlist on wishlist_items(wishlist_id);

alter table wishlist_items enable row level security;
create policy "Service role full access wishlist_items" on wishlist_items
  for all using (true) with check (true);

-- ============================================================
-- VARIANT STOCK VIEW (bridges to existing inventory system)
-- ============================================================
create or replace view variant_stock as
select
  pv.id as variant_id,
  pv.product_id,
  pv.sku,
  case
    when pv.track_inventory = false then 999999
    when pv.pillow_product_id is not null then
      coalesce((select buildable from product_buildable pb where pb.product_id = pv.pillow_product_id), 0)
    when pv.item_id is not null then
      coalesce((select on_hand from inventory_balances ib where ib.item_id = pv.item_id), 0)
    else pv.stock_quantity
  end as stock_available
from product_variants pv;

-- ============================================================
-- SEED DATA
-- ============================================================

-- Default categories
insert into categories (slug, content, position) values
  ('pillows', '{"en-US":{"name":"Pillows","description":"Custom-fit pillows for every sleeper"},"zh-CN":{"name":"枕头","description":"为每位睡眠者定制的枕头"}}', 0),
  ('bolsters', '{"en-US":{"name":"Bolsters","description":"Support bolsters for comfort"},"zh-CN":{"name":"抱枕","description":"舒适支撑抱枕"}}', 1),
  ('accessories', '{"en-US":{"name":"Accessories","description":"Pillow accessories and extras"},"zh-CN":{"name":"配件","description":"枕头配件和附加产品"}}', 2);

-- Default shipping methods
insert into shipping_methods (slug, content, base_rate, free_above, position) values
  ('standard', '{"en-US":{"name":"Standard Shipping","description":"5-7 business days","estimated_days":"5-7 days"},"zh-CN":{"name":"标准配送","description":"5-7个工作日","estimated_days":"5-7天"}}', 10.00, 150.00, 0),
  ('express', '{"en-US":{"name":"Express Shipping","description":"1-3 business days","estimated_days":"1-3 days"},"zh-CN":{"name":"快速配送","description":"1-3个工作日","estimated_days":"1-3天"}}', 25.00, null, 1);
