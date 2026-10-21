-- Reviews on every Customer (PRD customer-crm slice 12; ADR 0028 (k)): Google
-- reviews that Staff link to a Customer.
--
-- Google gives a review only a display name, a photo and an anonymous flag,
-- never an email (lib/google/business-profile.ts). A name is not an identity,
-- so the code only suggests a Customer (lib/crm/review-match.ts) and a person
-- decides. Only a Staff action inserts into customer_google_reviews (README,
-- seventh hazard): link_google_review() below is the one statement that does,
-- and it is called only from the Admin Panel routes that check
-- `customers-edit` (lib/crm/google-review-links.ts). The Google sync never
-- calls it; lib/crm/__tests__/google-review-links-guard.test.ts asserts both.
--
-- customer_google_reviews: a Staff-confirmed link. The primary key is the
--   review, so a review belongs to at most one Customer; linking it a second
--   time does nothing and returns the link that holds it.
--   how = 'suggestion' (Link on a suggested match) or 'manual' (Find
--   customer…, for someone we never asked).
-- customer_google_review_rejections: *Not them*, and every unlink. A rejected
--   pair is never suggested again; linking that same pair later removes it.
--
-- google_review_match_candidates(review ids, customer): who could have written
--   each unlinked, named review, by timing alone, prefiltered to Customers who
--   share at least one name token with the reviewer. The pure
--   suggestGoogleReviewMatches() decides: it applies the same windows and the
--   name rules, and every rule it has needs a shared token, so the prefilter
--   only keeps the rows small. Its windows (lib/crm/review-match.ts):
--     - a Review request sent within 45 days before the review ("asked on" is
--       the earlier sent_at of the email and the WhatsApp ledger rows for
--       aftercare.review_request, CRM slice 07);
--     - an Order delivered within 90 days before it.
--   The review's own date is review_created_at, or when we stored it.
--   Rejected pairs come back flagged (rejected), so a first name shared with a
--   rejected Customer still counts as shared. A Customer already linked to a
--   review is flagged too (linked_elsewhere): Google allows one review per
--   account.
--
-- crm_name_tokens(text): the SQL twin of nameTokens() in review-match.ts:
--   accents stripped (NFD, combining marks removed), lower case, the same
--   separator characters, split on spaces.
--
-- Nothing here is read by the Review request job (README, sixth hazard): who
-- is asked never depends on a review.
--
-- Server-only: RLS on with no policy, nothing granted to anon or
-- authenticated; the functions are executable by the service role only.
--
-- Idempotent.

create table if not exists public.customer_google_reviews (
  google_review_id     uuid primary key references public.google_reviews(id) on delete cascade,
  customer_id          uuid not null references public.customers(id) on delete cascade,
  how                  text not null check (how in ('suggestion', 'manual')),
  -- The profile the Staff member was working as; null on a shared login where
  -- nobody chose, or once the profile is gone.
  linked_by_profile_id uuid null references public.mp_staff(id) on delete set null,
  linked_at            timestamptz not null default now()
);

-- The Customer detail's Reviews card, the overview and the timeline.
create index if not exists idx_customer_google_reviews_customer
  on public.customer_google_reviews (customer_id);
-- The Weekly summary's *Google reviews linked* count.
create index if not exists idx_customer_google_reviews_linked_at
  on public.customer_google_reviews (linked_at);

alter table public.customer_google_reviews enable row level security;
revoke all on public.customer_google_reviews from anon, authenticated;

create table if not exists public.customer_google_review_rejections (
  google_review_id       uuid not null references public.google_reviews(id) on delete cascade,
  customer_id            uuid not null references public.customers(id) on delete cascade,
  rejected_by_profile_id uuid null references public.mp_staff(id) on delete set null,
  rejected_at            timestamptz not null default now(),
  primary key (google_review_id, customer_id)
);

create index if not exists idx_customer_google_review_rejections_customer
  on public.customer_google_review_rejections (customer_id);

alter table public.customer_google_review_rejections enable row level security;
revoke all on public.customer_google_review_rejections from anon, authenticated;

comment on table public.customer_google_reviews is
  'A Google review Staff confirmed belongs to a Customer (CRM slice 12). Only link_google_review() inserts, from a customers-edit route. Server-only.';
comment on table public.customer_google_review_rejections is
  'Not them: a Google review and a Customer Staff said do not belong together. Never suggested again. Server-only.';

-- ─── Names ───────────────────────────────────────────────────────────────────

create or replace function public.crm_name_tokens(p_name text)
returns text[]
language sql
immutable
parallel safe
set search_path = public
as $$
  select coalesce(
    array_remove(
      string_to_array(
        btrim(regexp_replace(
          lower(regexp_replace(normalize(coalesce(p_name, ''), NFD), '[̀-ͯ]', '', 'g')),
          '[\s.,;:!?''"’‘“”()\[\]{}/\\|&+_*@#~-]+', ' ', 'g')),
        ' '),
      ''),
    '{}'::text[]);
$$;

revoke execute on function public.crm_name_tokens(text) from public, anon, authenticated;
grant execute on function public.crm_name_tokens(text) to service_role;

-- ─── Candidates ──────────────────────────────────────────────────────────────

create or replace function public.google_review_match_candidates(
  p_review_ids  uuid[] default null,
  p_customer_id uuid default null
)
returns table (
  google_review_id uuid,
  customer_id      uuid,
  first_name       text,
  last_name        text,
  email            text,
  asked_at         timestamptz,
  clicked_at       timestamptz,
  delivered_at     timestamptz,
  rejected         boolean,
  linked_elsewhere boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with reviews as (
    select g.id,
           coalesce(g.review_created_at, g.created_at) as at,
           crm_name_tokens(g.reviewer_name) as tokens
      from google_reviews g
     where (p_review_ids is null or g.id = any (p_review_ids))
       and not g.reviewer_is_anonymous
       and not exists (select 1 from customer_google_reviews l where l.google_review_id = g.id)
  ),
  asked as (
    select s.customer_id, min(s.sent_at) as asked_at
      from (
        select e.customer_id, e.sent_at
          from customer_emails e
         where e.template = 'aftercare.review_request'
           and e.entity_id = e.customer_id
           and e.status = 'sent'
           and e.sent_at is not null
        union all
        select w.customer_id, w.sent_at
          from customer_whatsapp w
         where w.template = 'aftercare.review_request'
           and w.entity_id = w.customer_id
           and w.status = 'sent'
           and w.sent_at is not null
      ) s
     group by s.customer_id
  ),
  pairs as (
    select r.id as review_id, r.at, r.tokens, a.customer_id
      from reviews r
      join asked a on a.asked_at <= r.at and a.asked_at >= r.at - interval '45 days'
    union
    select r.id, r.at, r.tokens, o.customer_id
      from reviews r
      join orders o on o.customer_id is not null
                   and o.delivered_at <= r.at
                   and o.delivered_at >= r.at - interval '90 days'
  ),
  named as (
    select p.review_id, p.at, c.id as customer_id, c.first_name, c.last_name, c.email
      from pairs p
      join customers c on c.id = p.customer_id
     where (crm_name_tokens(c.first_name) || crm_name_tokens(c.last_name)) && p.tokens
  )
  select n.review_id,
         n.customer_id,
         n.first_name,
         n.last_name,
         n.email,
         a.asked_at,
         rr.first_clicked_at,
         (select max(o.delivered_at)
            from orders o
           where o.customer_id = n.customer_id
             and o.delivered_at <= n.at
             and o.delivered_at >= n.at - interval '90 days'),
         exists (select 1
                   from customer_google_review_rejections x
                  where x.google_review_id = n.review_id
                    and x.customer_id = n.customer_id),
         exists (select 1 from customer_google_reviews l where l.customer_id = n.customer_id)
    from named n
    left join asked a on a.customer_id = n.customer_id
    left join customer_review_requests rr on rr.customer_id = n.customer_id
   -- One Customer: only the reviews they could have written, with every other
   -- candidate of those reviews (a first name is unique only among them all).
   where p_customer_id is null
      or exists (select 1 from named m where m.review_id = n.review_id and m.customer_id = p_customer_id);
$$;

revoke execute on function public.google_review_match_candidates(uuid[], uuid) from public, anon, authenticated;
grant execute on function public.google_review_match_candidates(uuid[], uuid) to service_role;

-- ─── Staff actions ───────────────────────────────────────────────────────────

-- Link a review to a Customer. One statement claims the review: when it is
-- already linked, nothing changes and the link that holds it comes back with
-- linked = false. A new link also clears a rejection of that same pair.
create or replace function public.link_google_review(
  p_google_review_id uuid,
  p_customer_id      uuid,
  p_how              text,
  p_profile_id       uuid
)
returns table (
  linked               boolean,
  customer_id          uuid,
  how                  text,
  linked_by_profile_id uuid,
  linked_at            timestamptz
)
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v public.customer_google_reviews%rowtype;
begin
  insert into public.customer_google_reviews as l (google_review_id, customer_id, how, linked_by_profile_id)
  values (p_google_review_id, p_customer_id, p_how, p_profile_id)
  on conflict on constraint customer_google_reviews_pkey do nothing
  returning l.* into v;

  if v.google_review_id is not null then
    delete from public.customer_google_review_rejections x
     where x.google_review_id = p_google_review_id
       and x.customer_id = p_customer_id;
    return query select true, v.customer_id, v.how, v.linked_by_profile_id, v.linked_at;
    return;
  end if;

  return query
    select false, l.customer_id, l.how, l.linked_by_profile_id, l.linked_at
      from public.customer_google_reviews l
     where l.google_review_id = p_google_review_id;
end;
$$;

-- Unlink a review from the Customer it is linked to. The pair is recorded as
-- rejected, so it is not suggested again. False when that link does not exist.
create or replace function public.unlink_google_review(
  p_google_review_id uuid,
  p_customer_id      uuid,
  p_profile_id       uuid
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = public
as $$
begin
  delete from public.customer_google_reviews l
   where l.google_review_id = p_google_review_id
     and l.customer_id = p_customer_id;
  if not found then
    return false;
  end if;
  insert into public.customer_google_review_rejections (google_review_id, customer_id, rejected_by_profile_id)
  values (p_google_review_id, p_customer_id, p_profile_id)
  on conflict (google_review_id, customer_id) do nothing;
  return true;
end;
$$;

-- *Not them*. Refused for a pair that is linked (unlink it instead):
-- 'rejected' when recorded (or already was), 'linked' when refused.
create or replace function public.reject_google_review_match(
  p_google_review_id uuid,
  p_customer_id      uuid,
  p_profile_id       uuid
)
returns text
language plpgsql
volatile
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1 from public.customer_google_reviews l
     where l.google_review_id = p_google_review_id
       and l.customer_id = p_customer_id
  ) then
    return 'linked';
  end if;
  insert into public.customer_google_review_rejections (google_review_id, customer_id, rejected_by_profile_id)
  values (p_google_review_id, p_customer_id, p_profile_id)
  on conflict (google_review_id, customer_id) do nothing;
  return 'rejected';
end;
$$;

revoke execute on function public.link_google_review(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.unlink_google_review(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.reject_google_review_match(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.link_google_review(uuid, uuid, text, uuid) to service_role;
grant execute on function public.unlink_google_review(uuid, uuid, uuid) to service_role;
grant execute on function public.reject_google_review_match(uuid, uuid, uuid) to service_role;

-- ─── The Reviews tab's list ──────────────────────────────────────────────────

-- Google reviews no Staff member has linked yet, for *Google reviews to
-- match* and *Other unlinked reviews* on Customers → Reviews. Its date is the
-- review's own, or when we stored it.
create or replace view public.admin_google_reviews_unlinked with (security_invoker = true) as
select
  g.id,
  g.star_rating,
  g.comment,
  g.reviewer_name,
  g.reviewer_is_anonymous,
  coalesce(g.review_created_at, g.created_at) as reviewed_at,
  g.status,
  g.google_reply is not null as has_google_reply
from public.google_reviews g
where not exists (select 1 from public.customer_google_reviews l where l.google_review_id = g.id);

revoke all on public.admin_google_reviews_unlinked from anon, authenticated;
