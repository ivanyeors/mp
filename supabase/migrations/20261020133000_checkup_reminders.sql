-- Check-up reminders (PRD-customer-crm slice 08, ADR 0027 f, g, h): a yearly
-- "time for a re-adjustment" for a Premium Mpillow, which says plainly that the
-- visit is paid and states the fee.
--
-- No table of its own. The sends go in the two existing ledgers, under
-- template `aftercare.checkup_<n>m` (the milestone, in months after delivery)
-- with entity_id = the Order, so each milestone goes at most once per Order per
-- channel, guarded by each ledger's unique key:
--   - email in customer_emails (20261020112000), retried while attempts < 3;
--   - WhatsApp in customer_whatsapp (20261020114000), never retried.
-- Both unique keys lead with customer_id, which is how the job reads a
-- Customer's check-ups. The daily job is lib/aftercare/checkup-server.ts,
-- chained onto results-sla.
--
-- Coverage (Premium Mpillow only) is read from customer_purchase_lines
-- (20261020122000), and the fee from service_prices (20261013100000) at send
-- time; nothing here stores either.
--
-- The settings are site_settings keys (publicly readable, which is fine for
-- these: neither describes a customer):
--   checkup_reminders_enabled  'true' | 'false', seeded 'false'
--   checkup_months             months after delivery, and between reminders,
--                              seeded 12
--
-- Idempotent.

insert into public.site_settings (key, value) values
  ('checkup_reminders_enabled', 'false'),
  ('checkup_months', '12')
on conflict (key) do nothing;
