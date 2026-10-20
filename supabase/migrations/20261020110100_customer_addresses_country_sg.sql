-- A new address is Singaporean unless it says otherwise
-- (PRD-shopify-customer-migration, slice 03; PRD trap 3c).
--
-- `customer_addresses.country` has defaulted to 'MY' since 0028_ecommerce.sql,
-- left over from the MYR era: coupon currency moved to SGD in 0031, this did
-- not. The Shopify import writes country explicitly and never relies on it.
-- The two zod schemas and the account address form move to 'SG' in the same
-- slice, because the form always sends its starting value.
--
-- Existing rows keep the country they were saved with. Idempotent.

alter table public.customer_addresses alter column country set default 'SG';
