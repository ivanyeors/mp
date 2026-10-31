-- Leave Segments out of a campaign's audience (PRD-campaign-audiences slice
-- 06): "Pillow owners, but not those who bought in the last 14 days, and not
-- Staff and test accounts".
--
-- email_campaigns.exclude_segment_ids holds at most 3 Segments, in the order
-- Staff chose them. Whatever the audience (*Everyone subscribed* included),
-- the people those Segments choose when a wave is planned are dropped before
-- the rule runs (lib/email-campaigns/sender.ts `planWave`). An exclusion can
-- only narrow: it never adds anyone, and an excluded Segment that is archived,
-- needs review or is gone refuses the wave, by name, rather than leaving
-- nobody out (lib/crm/segments.ts `resolveSegment`, never widened).
--
-- 1. The column: an array (no foreign key can hold one), so
--      - at most 3, no nulls (a check);
--      - never the Segment the campaign is sent to: leaving out everyone it
--        sends to is a mistake, not an audience (the check);
--      - no Segment twice, and every id a Segment when it is written (a
--        trigger: a check cannot hold a subquery). Segments are archived,
--        never deleted, by the app; one deleted by hand refuses the wave by
--        name.
-- 2. The lock (20261021100000, 20261029090701): once the first wave is
--    planned the audience is fixed, so the guard refuses a change to the
--    exclusions too. The rest of the guard is restated unchanged.
--
-- Server-only, as the table is. Idempotent.

-- ---------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------
alter table public.email_campaigns
  add column if not exists exclude_segment_ids uuid[] not null default '{}';

alter table public.email_campaigns drop constraint if exists email_campaigns_exclusions;
alter table public.email_campaigns add constraint email_campaigns_exclusions check (
  cardinality(exclude_segment_ids) <= 3
  and array_position(exclude_segment_ids, null) is null
  and (segment_id is null or not (segment_id = any (exclude_segment_ids)))
);

comment on column public.email_campaigns.exclude_segment_ids is
  'Segments whose Customers this campaign leaves out, at most 3, resolved when each wave is planned (PRD-campaign-audiences slice 06). Fixed with the audience once the first wave is planned.';

drop trigger if exists trg_email_campaigns_exclusions_exist on public.email_campaigns;
drop function if exists public.email_campaigns_exclusions_exist();

create or replace function public.email_campaigns_exclusions_check()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_missing uuid;
begin
  if cardinality(new.exclude_segment_ids)
     <> (select count(distinct x) from unnest(new.exclude_segment_ids) as x) then
    raise exception 'A Segment is left out twice.'
      using errcode = 'check_violation';
  end if;
  select x into v_missing
    from unnest(new.exclude_segment_ids) as x
   where not exists (select 1 from public.customer_segments s where s.id = x)
   limit 1;
  if v_missing is not null then
    raise exception 'A Segment to leave out does not exist (%).', v_missing
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.email_campaigns_exclusions_check() from public, anon, authenticated;

drop trigger if exists trg_email_campaigns_exclusions_check on public.email_campaigns;
create trigger trg_email_campaigns_exclusions_check
  before insert or update of exclude_segment_ids on public.email_campaigns
  for each row execute function public.email_campaigns_exclusions_check();

-- ---------------------------------------------------------------------
-- 2. The lock
-- ---------------------------------------------------------------------
-- Content and audience are fixed once the first wave is planned; the name,
-- archiving and the lock itself stay writable. updated_at follows every change.
create or replace function public.email_campaigns_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.locked_at is not null and (
       new.subject is distinct from old.subject
    or new.preheader is distinct from old.preheader
    or new.body is distinct from old.body
    or new.content is distinct from old.content
    or new.greeting is distinct from old.greeting
    or new.button_label is distinct from old.button_label
    or new.button_target is distinct from old.button_target
    or new.button_url is distinct from old.button_url
    or new.audience is distinct from old.audience
    or new.segment_id is distinct from old.segment_id
    or new.exclude_segment_ids is distinct from old.exclude_segment_ids
    or new.locked_at is distinct from old.locked_at
  ) then
    raise exception 'This campaign has started sending, so its email and audience cannot change. Duplicate it to send a changed one.'
      using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
