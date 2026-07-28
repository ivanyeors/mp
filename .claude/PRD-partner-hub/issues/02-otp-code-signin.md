## Parent

PRD: Partner Hub — #70

## What to build

Upgrade the shared passwordless **Sign in** (all roles — not a partner fork): the auth email carries **both** a 6-digit OTP code and the existing magic link (one template), and the login form gains a code-entry step that verifies the code (`verifyOtp` path) as an alternative to clicking the link. Google OAuth unchanged. This unblocks cross-device sign-in (read code on phone, type on the device you're on) and is the same mechanism later used by backup-email verification.

## Acceptance criteria

- [ ] Requesting email sign-in sends one email containing a 6-digit code and the magic link
- [ ] Entering the code on the login form creates the same session as clicking the link (role resolution unchanged for Customer/Staff/Partner)
- [ ] Wrong/expired code shows a clear inline error and allows resend
- [ ] Magic-link path and Google OAuth continue to work exactly as before
- [ ] Works on the storefront locale routes like the current form

## Blocked by

None - can start immediately
