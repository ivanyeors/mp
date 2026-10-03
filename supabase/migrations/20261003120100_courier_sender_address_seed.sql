-- Shipping › Couriers slice 03: quotes and labels now ship from the courier
-- account doc's default sender address (api_configs[slug=easyship]
-- .config.settings.addresses[].default_for.sender), not
-- shipping_settings.origin_address. Carry the old ship-from address over once.
--
-- No-op when a default sender already exists, when the doc has no addresses
-- array yet, or when the old address is incomplete: a doc address that fails
-- AddressSchema (lib/easyship/schema.ts) would make the whole doc unreadable.
-- Text is truncated to the doc limits (company 27, contact 22, lines 35).

update api_configs c
set config = jsonb_set(
  c.config,
  '{settings,addresses}',
  (c.config #> '{settings,addresses}') || jsonb_build_array(jsonb_build_object(
    'line_1',         left(btrim(s.o->>'line_1'), 35),
    'line_2',         nullif(btrim(left(btrim(coalesce(s.o->>'line_2', '')), 35)), ''),
    'city',           left(btrim(s.o->>'city'), 200),
    'state',          nullif(btrim(left(btrim(coalesce(s.o->>'state', '')), 200)), ''),
    'postal_code',    nullif(btrim(left(btrim(coalesce(s.o->>'postal_code', '')), 20)), ''),
    'country_alpha2', upper(btrim(s.o->>'country_alpha2')),
    -- Company is required on the doc; the old address made it optional.
    'company_name',   left(coalesce(nullif(btrim(s.o->>'company_name'), ''), btrim(s.o->>'contact_name')), 27),
    'contact_name',   left(btrim(s.o->>'contact_name'), 22),
    'contact_phone',  left(btrim(s.o->>'contact_phone'), 20),
    'contact_email',  btrim(s.o->>'contact_email'),
    'default_for',    jsonb_build_object('sender', true, 'return', false, 'pickup', false, 'billing', false)
  ))
)
from (select origin_address as o from shipping_settings where id) s
where c.slug = 'easyship'
  and jsonb_typeof(c.config #> '{settings,addresses}') = 'array'
  and not exists (
    select 1
    from jsonb_array_elements(c.config #> '{settings,addresses}') a
    where a #>> '{default_for,sender}' = 'true'
  )
  and coalesce(btrim(s.o->>'contact_name'), '') <> ''
  and coalesce(btrim(s.o->>'contact_phone'), '') <> ''
  and coalesce(btrim(s.o->>'line_1'), '') <> ''
  and coalesce(btrim(s.o->>'city'), '') <> ''
  and btrim(s.o->>'contact_email') ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  and length(btrim(s.o->>'contact_email')) <= 50
  and btrim(s.o->>'country_alpha2') ~ '^[A-Za-z]{2}$';
