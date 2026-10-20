-- Slices 02 and 03: the import's functions and tables are the service role's
-- alone. anon and authenticated can run none of the functions, which matters
-- most for the SECURITY DEFINER ones: they run as their owner.

do $$
declare
  fn   text;
  role text;
begin
  foreach fn in array array[
    'public.import_shopify_customers(uuid, integer, jsonb)',
    'public.finish_shopify_import(uuid)',
    'public.preview_shopify_import_undo(uuid)',
    'public.undo_shopify_import(uuid)',
    'public.customer_import_undo_plan(uuid)',
    'public.customer_import_skipped_total(jsonb)',
    'public.customer_import_preview_matches(text[], text[])'
  ] loop
    foreach role in array array['anon', 'authenticated', 'public'] loop
      assert not has_function_privilege(role, fn, 'execute'), format('%s can execute %s', role, fn);
    end loop;
    assert has_function_privilege('service_role', fn, 'execute'), format('service_role cannot execute %s', fn);
  end loop;

  foreach fn in array array['public.import_shopify_customers(uuid, integer, jsonb)', 'public.finish_shopify_import(uuid)',
                            'public.preview_shopify_import_undo(uuid)', 'public.undo_shopify_import(uuid)',
                            'public.customer_import_undo_plan(uuid)'] loop
    assert (select prosecdef from pg_proc where oid = fn::regprocedure), format('%s is SECURITY DEFINER', fn);
    assert (select proconfig from pg_proc where oid = fn::regprocedure) = '{search_path=public}',
      format('%s pins its search_path', fn);
  end loop;

  foreach fn in array array['public.customer_import_batches', 'public.migrated_customers'] loop
    foreach role in array array['anon', 'authenticated'] loop
      assert not has_table_privilege(role, fn, 'select, insert, update, delete'), format('%s can touch %s', role, fn);
    end loop;
  end loop;
end $$;

-- And the attempt itself is refused, signed in or not.
set role authenticated;
do $$ begin
  begin
    perform public.undo_shopify_import(gen_random_uuid());
    assert false, 'authenticated ran undo_shopify_import';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.import_shopify_customers(gen_random_uuid(), 0, '[]');
    assert false, 'authenticated ran import_shopify_customers';
  exception when insufficient_privilege then null;
  end;
end $$;
set role anon;
do $$ begin
  begin
    perform public.import_shopify_customers(gen_random_uuid(), 0, '[]');
    assert false, 'anon ran import_shopify_customers';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'customer import: grants ok';
