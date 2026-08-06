-- Repoint the partners-page CTA from the legacy "/support" default to the
-- self-serve partner apply flow (/partner/apply). The original seed
-- (20260706200000_partners.sql) hardcoded "/support", which overrides the code
-- default at runtime. Only touches locales still on the seeded value, so admin
-- customisations are preserved. Idempotent (re-run is a no-op).
update partners_page
set content = (
  select jsonb_object_agg(
    key,
    case
      when value->>'ctaButtonUrl' = '/support'
        then value || jsonb_build_object('ctaButtonUrl', '/partner/apply')
      else value
    end
  )
  from jsonb_each(content)
)
where exists (
  select 1 from jsonb_each(content) e
  where e.value->>'ctaButtonUrl' = '/support'
);
