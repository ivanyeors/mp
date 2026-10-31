-- A partner with several clinics: one Location per clinic (ADR 0037).
--
-- The partner's main row stays the partner business: the Partner account links
-- to it, and it holds the referral code, commission terms, logo, write-up and
-- `visible`. Each further clinic is a **branch**: its own `partners` row of
-- type 'partner' whose `parent_id` is the main row, so it is a real Location a
-- customer can book and a Result can record. A branch carries only its place:
-- `branch_name`, `address`, `postal_code`, `bookable` and its order among the
-- partner's branches (`position`). It is saved `visible=false`, with no logo,
-- website or write-up and no referral code, so every reader that lists partner
-- businesses (by referral code or Partner account) never sees it; the code
-- copies the main row's name onto it so a Location reader needs no join.
--
-- `branch_name` is the clinic's own name ("Novena", "Fortune Centre"), on the
-- main row too. A Location's display name is "<name> · <branch_name>" when set.
--
-- Additive and nullable (ADR 0012 expand pattern): deployed code never reads
-- these columns, and with no branch rows nothing changes for it.
--
-- Deleting the main row deletes its branches. A branch a Result or a
-- Re-adjustment booking points at still blocks the delete, as any Location does.

alter table partners
  add column if not exists parent_id uuid references partners(id) on delete cascade,
  add column if not exists branch_name text;

alter table partners drop constraint if exists partners_parent_not_self;
alter table partners
  add constraint partners_parent_not_self check (parent_id is null or parent_id <> id);

create index if not exists idx_partners_parent_id
  on partners (parent_id)
  where parent_id is not null;

comment on column partners.parent_id is
  'Set on a branch: another clinic of the partner whose main row this is (ADR 0037). Null on a main row and on own studios.';
comment on column partners.branch_name is
  'The clinic''s own name, e.g. "Novena". Shown after the partner''s name when set.';
