-- Slice 03, PRD trap 3c: a new address is Singaporean unless it says otherwise.
-- Rolled back.

begin;
do $$
declare
  v_customer uuid;
begin
  assert (select column_default from information_schema.columns
           where table_schema = 'public' and table_name = 'customer_addresses' and column_name = 'country') = '''SG''::text',
    'customer_addresses.country defaults to SG';
  insert into public.customers (email) values ('defaults@example.com') returning id into v_customer;
  insert into public.customer_addresses (customer_id, recipient, line1, city, postal_code)
  values (v_customer, 'Defaults', '1 Default Road', 'Singapore', '238801');
  assert (select country from public.customer_addresses where customer_id = v_customer) = 'SG',
    'an address saved without a country is SG';
end $$;
rollback;

select 'customer import: defaults ok';
