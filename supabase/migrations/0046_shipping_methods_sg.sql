-- Storefront and hold path default to Singapore; seed methods were MY-only.
alter table shipping_methods
  alter column countries set default '{SG}';

update shipping_methods
set countries = array_append(countries, 'SG')
where not ('SG' = any (countries));
