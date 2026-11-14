-- What a Visit records about where it came from, beyond UTM and referrer
-- (ADR 0007 amendment 2026-11-13), and the indexes the Visitor → Customer
-- link reads by.
--
-- All frozen at Visit start with the rest of the Entry source. Nullable: every
-- Visit before this migration has none of them, and classification reads a
-- null as "not known".

alter table analytics_visits
  add column if not exists landing_path text,
  add column if not exists entry_content text,
  add column if not exists entry_term text,
  -- gclid | gbraid | wbraid | ttclid | msclkid | fbclid
  add column if not exists entry_click_id_kind text,
  add column if not exists entry_click_id text,
  -- The in-app browser the Visit started in: instagram, facebook, tiktok, …
  add column if not exists entry_app text;

-- A paid Order's Visit, and a Customer's Visitors, are found by these.
create index if not exists idx_analytics_visitors_customer_id
  on analytics_visitors (customer_id)
  where customer_id is not null;
create index if not exists idx_analytics_visitors_email
  on analytics_visitors (email)
  where email is not null;
create index if not exists idx_analytics_visits_converted_order_id
  on analytics_visits (converted_order_id)
  where converted_order_id is not null;
