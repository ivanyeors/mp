-- Locations: additive columns on `partners` (ADR 0012). No rename — prod-safe.
-- `type` discriminates Mpillow studios ('own') from partner clinics ('partner').
-- Existing rows default to 'partner' (correct); own studios never render on /our-partners.

alter table partners
  add column if not exists type text not null default 'partner'
    check (type in ('own','partner')),
  add column if not exists address text,
  add column if not exists postal_code text;

create index if not exists idx_partners_type on partners (type);
