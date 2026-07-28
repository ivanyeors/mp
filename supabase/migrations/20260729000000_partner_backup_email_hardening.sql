-- Partner Hub #75 hardening (adversarial-review fixes).
--
-- 1. Brute-force cap for the self-issued backup-email OTP: a per-row wrong-guess
--    counter the verify route increments, burning the pending code at the cap.
-- 2. A VERIFIED backup email is a sign-in identity (loadPartnerRow resolves it),
--    so it must be globally unique among verified rows — otherwise two rows could
--    claim the same address and the identity lookup (maybeSingle) would error.
--    The base index (#71) was non-unique; this adds the partial UNIQUE guarantee.
--
-- Additive/prod-safe per ADR 0012 expand pattern: deployed code never reads these.

alter table partner_users
  add column if not exists backup_email_otp_attempts int not null default 0;

create unique index if not exists idx_partner_users_backup_email_verified_unique
  on partner_users (lower(backup_email))
  where backup_email_verified;
