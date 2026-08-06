-- Editable Partner Agreement copy (#87). Additive/prod-safe per ADR 0012: a nullable
-- markdown column on the existing singleton partners_page row. NULL falls back to
-- DEFAULT_AGREEMENT_MD in lib/partners/types (mirrors the DEFAULT_WORK_WITH_US
-- pattern), so an unset column still renders the seeded placeholder. Edited in the
-- Admin Panel (Partners → Agreement tab), saved via the existing partners-page PATCH.
--
-- The agreement VERSION stays a code constant (AGREEMENT_VERSION in
-- lib/partner-application); editing copy here does NOT bump it, so a wording tweak
-- never force-re-accepts approved partners. Bump the constant deliberately for that.
alter table partners_page add column if not exists agreement_md text;
