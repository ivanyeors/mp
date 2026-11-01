-- The migration summary goes (owner, 2026-11-01): the Migration card on the
-- Customers page was its only reader, and the Customer lifecycle chart
-- replaced it (admin_customer_lifecycle_counts, 20261101020836).
--
-- admin_customer_migration_summary was the one view that read the Customer
-- overview, so a rebuild of the overview (drop view, create view) had to drop
-- and recreate it too. With it gone, nothing reads the overview but code.
--
-- RESTRICT (the default): the drop fails if anything still reads the view.
-- Code that read it before this change (getMigrationSummary) returns null on
-- a failed read and leaves its card out, so the order of deploy and drop does
-- not matter. Idempotent.

drop view if exists public.admin_customer_migration_summary;
