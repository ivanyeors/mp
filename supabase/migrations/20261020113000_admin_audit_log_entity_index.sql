-- Customer timeline (PRD-customer-crm slice 03, ADR 0027 (b)).
--
-- The timeline is merged when it is read, and two of its facts live only in
-- admin_audit_log: a Staff cancel of a Result (`result.cancel` on
-- `mp_config_response`, app/api/results/[id]/cancel/route.ts) and Staff marking
-- a Re-adjustment visit (`readjustment.*` on `readjustment_booking`,
-- app/api/settings/readjustments/[id]/route.ts). Each Customer detail view
-- reads them by entity:
--
--   where entity_type = $1 and entity_id in (...) [and action ...]
--     and created_at <= $cursor order by created_at desc limit 50
--
-- The table had only a created_at index, so every view scanned the whole log,
-- which only grows. This index serves the read from the entity side.
--
-- Index only: no data, grants or policies change. Idempotent.

create index if not exists idx_admin_audit_log_entity
  on admin_audit_log (entity_type, entity_id, created_at desc);
