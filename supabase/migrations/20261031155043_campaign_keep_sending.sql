-- Keep sending (PRD-campaign-audiences slice 10; ADR 0040 (6)).
--
-- A campaign whose first Wave a person sent may keep sending: the daily job
-- (chained onto /api/cron/results-sla, no third cron) runs one Wave a day for
-- it, labelled `daily-YYYY-MM-DD` (Singapore's date), of at most its daily
-- cap, to people who joined its Audience and have not had it. It goes through
-- the same claim_marketing_campaign_send() as a Staff Wave, so consent,
-- suppression and the Rest period apply exactly as they do there. Nothing new
-- is sent: email_campaigns_guard() keeps a started campaign's email and
-- Audience fixed, and these columns are not among the ones it freezes.
--
--   keep_sending                on or off; off by default, and only on a
--                               started campaign (`locked_at`)
--   keep_sending_daily_cap      the most one day's Wave sends, 1 to 100
--   keep_sending_paused_at      paused, by a person or by the daily job
--   keep_sending_paused_reason  why the daily job paused it; null when a
--                               person did
--   keep_sending_segments       the filters of the Segment it sends to and of
--                               each it leaves out, as they were when a person
--                               turned it on or resumed it, keyed by Segment
--                               id: `{ "<id>": { "filters": {...},
--                               "filters_version": n } }`. When any differs
--                               from the Segment now, the daily job pauses the
--                               campaign rather than send to an Audience
--                               nobody approved. Null with no Segment.
--
-- Idempotent.

alter table public.email_campaigns
  add column if not exists keep_sending boolean not null default false,
  add column if not exists keep_sending_daily_cap int not null default 20,
  add column if not exists keep_sending_paused_at timestamptz null,
  add column if not exists keep_sending_paused_reason text null,
  add column if not exists keep_sending_segments jsonb null;

alter table public.email_campaigns drop constraint if exists email_campaigns_keep_sending_started;
alter table public.email_campaigns add constraint email_campaigns_keep_sending_started
  check (not keep_sending or locked_at is not null);

alter table public.email_campaigns drop constraint if exists email_campaigns_keep_sending_daily_cap_range;
alter table public.email_campaigns add constraint email_campaigns_keep_sending_daily_cap_range
  check (keep_sending_daily_cap between 1 and 100);

alter table public.email_campaigns drop constraint if exists email_campaigns_keep_sending_paused_reason;
alter table public.email_campaigns add constraint email_campaigns_keep_sending_paused_reason
  check (keep_sending_paused_reason is null
         or (keep_sending_paused_at is not null and length(keep_sending_paused_reason) between 1 and 500));

alter table public.email_campaigns drop constraint if exists email_campaigns_keep_sending_segments_shape;
alter table public.email_campaigns add constraint email_campaigns_keep_sending_segments_shape
  check (keep_sending_segments is null or jsonb_typeof(keep_sending_segments) = 'object');

comment on column public.email_campaigns.keep_sending is
  'Kept sending (PRD-campaign-audiences slice 10): the daily job sends one Wave a day of at most keep_sending_daily_cap to people who join the Audience. Only on a started campaign.';
comment on column public.email_campaigns.keep_sending_segments is
  'The Segments'' filters a person approved when turning keep sending on or resuming it, keyed by Segment id. The daily job pauses the campaign when one differs from the Segment now.';
