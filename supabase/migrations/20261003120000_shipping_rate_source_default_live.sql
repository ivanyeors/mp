-- New shipping methods default to live courier rates (Shipping › Couriers slice 02).
-- Existing rows keep their rate_source; only the default for new inserts changes.
alter table shipping_methods alter column rate_source set default 'easyship';
