-- Assist link (PRD staff-assisted-customisation, slice 02).
--
-- One reusable code per Staff member, minted lazily on first request. Most
-- Staff will never send a link, and a column full of live credentials nobody
-- asked for is a liability — so this is a nullable column plus a partial unique
-- index, the shape 0045_result_customer_access.sql used for access_token: a
-- table full of nulls costs nothing and a duplicate code is impossible.

alter table admin_users
  add column if not exists assist_code text;

comment on column admin_users.assist_code is
  'Assist link code for /mp-config?assist=<code>. Null until the Staff member first asks for their link (lib/assist-link ensureAssistCode).';

-- Resolution is case-insensitive (ilike), so uniqueness must be too — otherwise
-- two codes differing only in case could both exist and the resolver could not
-- tell them apart. Mirrors idx_admin_users_email on admin_users(lower(email)).
create unique index if not exists uq_admin_users_assist_code
  on admin_users (lower(assist_code))
  where assist_code is not null;

-- The attribution half of source = 'staff_assisted': which Staff member's
-- Assist link produced this Draft Result. Written server-side on CREATE ONLY,
-- from a re-resolved code — a Staff id is never accepted from a client.
alter table mp_config_responses
  add column if not exists assisted_by_admin_id uuid references admin_users(id) on delete set null;

comment on column mp_config_responses.assisted_by_admin_id is
  'admin_users.id resolved from the ?assist= code at Draft Result creation. Set only alongside source = ''staff_assisted''; never rewritten by a later update.';

create index if not exists idx_mp_config_responses_assisted_by_admin
  on mp_config_responses (assisted_by_admin_id)
  where assisted_by_admin_id is not null;
