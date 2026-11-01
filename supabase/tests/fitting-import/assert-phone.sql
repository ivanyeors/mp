-- ADR 0042 c: a row with no email is matched by mobile. public.phone_e164 must
-- give normalizePhone's E.164 for every fixture phone (phone-cases.json,
-- written by lib/fitting-import/__tests__/phone-e164-agreement.test.ts).

\set cases `cat supabase/tests/fitting-import/phone-cases.json`
select set_config('t.cases', :'cases', false) \g /dev/null
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select c->>'phone' as phone, c->>'e164' as e164
      from jsonb_array_elements((current_setting('t.cases'))::jsonb->'expected') c
  loop
    assert public.phone_e164(r.phone) is not distinct from r.e164,
      format('phone_e164(%L) = %L, normalizePhone gives %L', r.phone, public.phone_e164(r.phone), r.e164);
    n := n + 1;
  end loop;
  assert n > 30, 'phone-cases.json did not load';
end $$;

select 'assert-phone ok';
