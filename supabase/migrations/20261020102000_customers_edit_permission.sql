-- A view-only Customers permission (PRD customer-crm slice 10, ADR 0023).
--
-- `customers` keeps meaning "see the Customers page". The new catalog key
-- `customers-edit` (lib/auth/permissions.ts, `requires: ["customers"]`) guards
-- every change on it. Roles store closed key sets, with `requires` applied only
-- when a role is saved, so a new key reaches no existing role by itself. This
-- gives it to every custom role that holds `customers` today, so nobody who
-- could edit Customers loses it. Making a role view-only is then one untick on
-- Users & permissions → Roles.
--
-- Owner and Admin are `grants_all`: they hold every key already and are left
-- alone. A role that already holds `customers-edit` is skipped, so a re-run
-- never adds the key twice. A role without `customers` does not gain it.
--
-- The update fires trg_admin_roles_telegram_resync, which re-stamps those
-- roles' Telegram links; `customers-edit` is not a Telegram action, so their
-- effective actions are unchanged.

update admin_roles
   set permissions = array_append(permissions, 'customers-edit')
 where not grants_all
   and 'customers' = any(permissions)
   and not 'customers-edit' = any(permissions);
