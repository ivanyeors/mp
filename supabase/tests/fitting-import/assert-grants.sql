-- ADR 0039: the Fitting import's tables and functions are the service role's
-- alone. anon and authenticated can run none of the functions, which matters
-- most for the SECURITY DEFINER ones: they run as their owner.

do $$
declare
  fn   text;
  role text;
begin
  foreach fn in array array[
    'public.import_fitting_rows(uuid, integer, jsonb)',
    'public.finish_fitting_import(uuid)',
    'public.preview_fitting_import_undo(uuid)',
    'public.undo_fitting_import(uuid)',
    'public.fitting_import_undo_plan(uuid)',
    'public.fitting_import_skipped_total(jsonb)',
    'public.fitting_import_preview_matches(text[], text[], text[])',
    'public.fitting_source_key(text)',
    'public.phone_e164(text)'
  ] loop
    foreach role in array array['anon', 'authenticated', 'public'] loop
      assert not has_function_privilege(role, fn, 'execute'), format('%s can execute %s', role, fn);
    end loop;
    assert has_function_privilege('service_role', fn, 'execute'), format('service_role cannot execute %s', fn);
  end loop;

  foreach fn in array array['public.import_fitting_rows(uuid, integer, jsonb)', 'public.finish_fitting_import(uuid)',
                            'public.preview_fitting_import_undo(uuid)', 'public.undo_fitting_import(uuid)',
                            'public.fitting_import_undo_plan(uuid)'] loop
    assert (select prosecdef from pg_proc where oid = fn::regprocedure), format('%s is SECURITY DEFINER', fn);
    assert (select proconfig from pg_proc where oid = fn::regprocedure) = '{search_path=public}',
      format('%s pins its search_path', fn);
  end loop;

  foreach fn in array array['public.fitting_import_batches', 'public.customer_fittings'] loop
    assert (select relrowsecurity from pg_class where oid = fn::regclass), format('%s has RLS on', fn);
    assert not exists (select 1 from pg_policies where schemaname || '.' || tablename = fn), format('%s has no policy', fn);
    foreach role in array array['anon', 'authenticated'] loop
      assert not has_table_privilege(role, fn, 'select, insert, update, delete'), format('%s can touch %s', role, fn);
    end loop;
  end loop;
end $$;

-- And the attempt itself is refused, signed in or not.
set role authenticated;
do $$
begin
  begin
    perform 1 from public.customer_fittings;
    assert false, 'authenticated read customer_fittings';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.undo_fitting_import(gen_random_uuid());
    assert false, 'authenticated ran undo_fitting_import';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'assert-grants ok';
