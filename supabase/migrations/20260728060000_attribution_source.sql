-- Attribution source (#80, ADR 0015): persist HOW a referral was attributed
-- (assist | typed | link) so the hub can apply the PDPA masking rule —
-- partner-ASSISTED referrals show FULL customer details (for verification),
-- link/code referrals show a MASKED identity only. The winning source was
-- computed at hold and discarded before; this keeps it.
--
-- Additive/prod-safe (mirrors 20260728010000_referral_rail.sql): deployed code
-- ignores an unknown column, so the migration is invisible to production.
-- Nullable; existing rows stay null → masked by default (the PDPA-safe default).

alter table mp_config_responses
  add column if not exists attribution_source text;

alter table orders
  add column if not exists attribution_source text;
