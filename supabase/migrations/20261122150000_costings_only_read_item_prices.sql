-- Cost prices are Costings data. /settings/costings reads item_prices from the
-- browser as the signed-in staff member, and "Staff read item_prices" let any
-- active staff member through (is_admin_user()), so a member without the
-- Costings permission (Marketing, for one) could read every item's cost
-- price. Every server path reads item_prices with the service role, which
-- bypasses RLS, so only that browser read changes.
--
-- admin_has_permission(key) mirrors permissionsForRoleRow in
-- lib/auth/permissions.ts: an active member whose role grants all, or whose
-- role's permissions hold the key.
--
-- Idempotent: safe to run more than once.

create or replace function public.admin_has_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users a
    join public.admin_roles r on r.id = a.role_id
    where a.auth_user_id = auth.uid()
      and coalesce(a.is_active, false)
      and (r.grants_all or perm = any (coalesce(r.permissions, '{}')))
  );
$$;

revoke all on function public.admin_has_permission(text) from public;
revoke all on function public.admin_has_permission(text) from anon;
grant execute on function public.admin_has_permission(text) to authenticated, service_role;

alter policy "Staff read item_prices" on public.item_prices
  using ((select public.admin_has_permission('costings')));
