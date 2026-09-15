# 15: Supabase hygiene: function `search_path`, anon execute, policy initplan, leaked passwords

**Type:** HITL. One dashboard toggle; the rest is one migration.
**Blocked by:** none
**User stories:** 43, 44
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`

## Goal

Both Supabase advisor reports (security and performance) come back without WARN-level findings.

## The gap, precisely

From `get_advisors` on project `irgxjthamhiaolvdfgar`, 2026-09-15.

**Security (WARN)**
- `function_search_path_mutable` on:
  - `public.set_updated_at`
  - `public.generate_order_number`
  - `public.increment_coupon_usage`. Slice 09 rewrites it; coordinate so its new definition sets `search_path` too.
  - `public.assert_placement_template_is_filling`
  - `public.reject_partner_payout_update`
- `anon_security_definer_function_executable`: `public.current_customer_id()` can be run by `anon` through `/rest/v1/rpc/current_customer_id`.
- `authenticated_security_definer_function_executable`: `current_customer_id()` and `is_admin_user()`. These are used inside RLS policies, so **authenticated must keep execute**. Only revoke from `anon` and `public`.
- `auth_leaked_password_protection`: off.

**Performance (WARN)**
- `auth_rls_initplan` on:
  - `customers_data`: "Allow users to view their own data", "Allow authenticated users to insert their own data", "Allow users to update their own data"
  - `customers`: "Customers can read own record"

**Info only (no work):**
- 16 tables have RLS on and no policies. That is intentional for service-role-only tables.
- 81 unused indexes. Revisit after traffic.

## Scope

- **Migration** `supabase/migrations/<ts>_advisor_hygiene.sql`:
  - `alter function … set search_path = public` for the 4 functions not rewritten by slice 09.
  - `revoke execute on function public.current_customer_id() from anon, public;`
  - Recreate the 4 policies with `(select auth.uid())` in place of `auth.uid()`. The logic stays identical.
- **Apply** with `supabase db push`, **never** the MCP `apply_migration` (it desyncs the migration ledger; see the memory).
- **HITL:** Supabase dashboard → Auth → turn on leaked password protection.

## Acceptance criteria

- [ ] `get_advisors` for security shows no `function_search_path_mutable`, no `anon_security_definer_function_executable` and no `auth_leaked_password_protection`.
- [ ] `get_advisors` for performance shows no `auth_rls_initplan`.
- [ ] A signed-in customer can still read their own `customers` row and addresses on preview (the account page loads).
- [ ] `supabase migration list` shows local and remote in sync after the push.
