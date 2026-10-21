-- The Customers list's search (CRM PRD slice 04; ADR 0027 (d)).
--
-- Search is one escaped `ilike` on the Customer overview's `search_text`,
-- never typed text in a PostgREST `.or()`. search_text is this exact
-- expression over customers, so a trigram index on it serves the
-- `%term%` match. The view's other joins do not touch these columns, so the
-- planner can filter customers first.
--
-- The expression must stay the view's (20261020200000 and every later
-- redefinition of admin_customer_overview), or the index stops matching.
-- pg_trgm lives in `extensions`, as for idx_customers_email_trgm.

create index if not exists idx_customers_search_text_trgm
  on public.customers
  using gin (lower(email || ' ' || coalesce(first_name, '') || ' ' || coalesce(last_name, '')) extensions.gin_trgm_ops);
