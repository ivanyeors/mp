-- Slice 04: staff-only internal note on an RMA request. Distinct from the
-- customer-visible `customer_note` and the `rma_status_events` timeline; written
-- by staff via the admin RMA detail and audited through recordAdminAction.
alter table rma_requests add column if not exists admin_note text;
