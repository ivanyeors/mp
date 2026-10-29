-- Email campaigns built from typed blocks (PRD-campaign-email-editor slice 03;
-- ADR 0036).
--
-- A campaign's email is either its typed Email blocks, `content`, which every
-- new campaign is, or the plain-text `body` of a campaign written before the
-- block editor, which keeps it and its renderer for good (decision 5). Never
-- both, never neither.
--
-- `content` is versioned JSON: { "v": 1, "blocks": [...], "fallbacks": {...} }.
-- The database cannot see inside it well, so its full check is one Zod schema
-- in code (lib/email-campaigns/content.ts `CampaignContentSchema`), run on
-- every write; here it is held to its version and a size (Gmail clips an email
-- long before this). A block campaign's button is a block, so the one-button
-- columns stay for legacy campaigns and a block campaign leaves them null.
--
-- The lock (20261021100000): once the first wave is planned the content is
-- fixed, so the trigger now refuses a change to `content` too.
--
-- Server-only, as the table is. Idempotent.

alter table public.email_campaigns add column if not exists content jsonb null;

alter table public.email_campaigns alter column body drop not null;

alter table public.email_campaigns drop constraint if exists email_campaigns_body_or_content;
alter table public.email_campaigns add constraint email_campaigns_body_or_content
  check ((body is null) <> (content is null));

alter table public.email_campaigns drop constraint if exists email_campaigns_content_shape;
alter table public.email_campaigns add constraint email_campaigns_content_shape check (
  content is null or (
    jsonb_typeof(content) = 'object'
    and content->>'v' = '1'
    and jsonb_typeof(content->'blocks') = 'array'
    and pg_column_size(content) < 256000
  )
);

alter table public.email_campaigns drop constraint if exists email_campaigns_content_no_button;
alter table public.email_campaigns add constraint email_campaigns_content_no_button check (
  content is null or (button_target is null and button_label is null and button_url is null)
);

comment on column public.email_campaigns.content is
  'The email as typed Email blocks: {"v":1,"blocks":[...],"fallbacks":{...}}, checked by CampaignContentSchema on every write. Null for a campaign written before the block editor, which has body.';

-- Content is fixed once the first wave is planned; the name, archiving and
-- the lock itself stay writable. updated_at follows every change.
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
    or new.locked_at is distinct from old.locked_at
  ) then
    raise exception 'This campaign has started sending, so its email and audience cannot change. Duplicate it to send a changed one.'
      using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
