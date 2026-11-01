-- ADR 0042 c: one person's rows find their Customer by mobile and name.
-- public.fitting_name_key must read every fixture name as nameKey does
-- (name-cases.json, written by
-- lib/fitting-import/__tests__/name-key-agreement.test.ts).

\set cases `cat supabase/tests/fitting-import/name-cases.json`
select set_config('t.cases', :'cases', false) \g /dev/null
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select c->>'name' as name, c->>'key' as key
      from jsonb_array_elements((current_setting('t.cases'))::jsonb->'expected') c
  loop
    assert public.fitting_name_key(r.name) is not distinct from r.key,
      format('fitting_name_key(%L) = %L, nameKey gives %L', r.name, public.fitting_name_key(r.name), r.key);
    n := n + 1;
  end loop;
  assert n > 10, 'name-cases.json did not load';
end $$;

select 'assert-name ok';
