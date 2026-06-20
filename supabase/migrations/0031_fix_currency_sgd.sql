-- Fix default currency from MYR to SGD across all e-commerce tables
-- Base currency for the business is SGD (Singapore Dollar)

-- product_variants
alter table product_variants alter column currency set default 'SGD';
update product_variants set currency = 'SGD' where currency = 'MYR';

-- carts
alter table carts alter column currency set default 'SGD';
update carts set currency = 'SGD' where currency = 'MYR';

-- shipping_methods
alter table shipping_methods alter column currency set default 'SGD';
update shipping_methods set currency = 'SGD' where currency = 'MYR';

-- coupons
alter table coupons alter column currency set default 'SGD';
update coupons set currency = 'SGD' where currency = 'MYR';

-- orders
alter table orders alter column currency set default 'SGD';
update orders set currency = 'SGD' where currency = 'MYR';
