-- Partner Hub settings (#75): pending backup-email verification state.
--
-- We verify inbox ownership with a SELF-ISSUED code (not Supabase verifyOtp,
-- which would switch the session to the backup email's auth user). These three
-- additive columns hold the in-flight code while the partner confirms; on
-- success the route promotes `backup_email_pending` -> `backup_email` and sets
-- `backup_email_verified = true` (both already exist from #71) and clears these.
--
-- Additive/invisible per ADR 0012 expand pattern: deployed code never reads them.

alter table partner_users
  add column if not exists backup_email_pending text,
  add column if not exists backup_email_otp_hash text,
  add column if not exists backup_email_otp_expires_at timestamptz;
