-- Premium pillows are priced per case-fabric family, and the family is a column.
--
-- 20260912100000 deleted every premium price row on the belief that one
-- cover/case-EXCLUSIVE base per size would reproduce them. It does not. The nine
-- prices are hand-set and do not decompose: subtracting the cover and case MSRPs
-- from each pair leaves two different cores for the same size --
--
--   size  core from linen   core from fibrecool
--   XS    250               247
--   S     302               307
--   M     326               327
--   L     459               456
--   XL    532               -- (fibrecool XL has never been priced)
--
-- so the two prices per size are real, independent price points. They are
-- restored here, keyed on `variant` rather than parsed out of `key`.
--
-- `items.price_family` exists so the money path never sniffs a product name.
-- `/fibrecool/i` over a name works for today's three cases and fails silently the
-- first time someone adds a cooling fabric under another name -- it would price as
-- linen and undercharge by ~25. A column fails loudly instead: an unfamilied case
-- cannot be priced at all, and `priceComposedBuild` refuses rather than guessing.
--
-- Deliberately NOT reusing `items.subtype`: it feeds `itemLabel(name, subtype)` and
-- would change copy the shopper sees.

-- 0009 constrained a pillow row to `variant IS NULL`, so the historical premium
-- prices could only ever be told apart by a suffix on `key` — which is why
-- lib/shopify/pricing.ts and the Costings editor both parse names and keys to find
-- them. `variant` becomes the one place that fact lives. Pillow variants are left
-- unconstrained rather than enumerated: a new fabric is a Costings edit, not a
-- migration, and a typo'd family simply never matches a case and is never selected.
alter table product_prices drop constraint if exists product_prices_check;
alter table product_prices add constraint product_prices_check check (
  (kind = 'pillow' and product_id is not null)
  or (kind = 'bolster' and product_id is null and variant in ('short', 'medium', 'long'))
);

alter table items add column if not exists price_family text;

comment on column items.price_family is
  'Case fabric family selecting the Costings MSRP row (product_prices.variant). Pillow cases only.';

-- Only fabrics we actually price are tagged. An `else 'linen'` here would BE the
-- silent default this column exists to prevent — a future cooling fabric under
-- another name would price as linen and undercharge by ~25. Anything unmatched stays
-- NULL, cannot be priced, and refuses loudly at `priceComposedBuild`.
update items
   set price_family = case
         when name ilike '%fibrecool%' then 'fibrecool'
         when name ilike '%linen%' then 'linen'
       end
 where category = 'pillow_case'
   and price_family is null
   and (name ilike '%fibrecool%' or name ilike '%linen%')
   and id in (select item_id from item_prices where msrp is not null);

-- Nine premium price points. Each is the full selling price of that pillow with a
-- case of that family and the BOM's default cover -- the same shape as basic's
-- single row, which is why basic (170/190/220/270/360) needs no change.
--
-- XS linen previously lived under the unsuffixed key `product:pillow:6` while every
-- other size used `:linen`. Normalised here so `variant` is the only thing that
-- selects a row.
insert into product_prices (key, kind, product_id, variant, msrp, currency)
values
  ('product:pillow:6:linen',      'pillow',  6, 'linen',     340.00, 'SGD'),
  ('product:pillow:6:fibrecool',  'pillow',  6, 'fibrecool', 360.00, 'SGD'),
  ('product:pillow:7:linen',      'pillow',  7, 'linen',     400.00, 'SGD'),
  ('product:pillow:7:fibrecool',  'pillow',  7, 'fibrecool', 430.00, 'SGD'),
  ('product:pillow:8:linen',      'pillow',  8, 'linen',     430.00, 'SGD'),
  ('product:pillow:8:fibrecool',  'pillow',  8, 'fibrecool', 460.00, 'SGD'),
  ('product:pillow:9:linen',      'pillow',  9, 'linen',     580.00, 'SGD'),
  ('product:pillow:9:fibrecool',  'pillow',  9, 'fibrecool', 610.00, 'SGD'),
  ('product:pillow:10:linen',     'pillow', 10, 'linen',     680.00, 'SGD')
on conflict (key) do update
  set msrp = excluded.msrp,
      variant = excluded.variant,
      product_id = excluded.product_id,
      kind = excluded.kind,
      currency = excluded.currency;

-- XL Fibrecool (item 37) has no MSRP and no price row, so it is not sellable in XL.
-- That is the live state, recorded rather than papered over: pricing refuses a case
-- with no MSRP instead of treating it as free.

-- Drop the stale unsuffixed XS key now that :linen carries it.
delete from product_prices where key = 'product:pillow:6';
