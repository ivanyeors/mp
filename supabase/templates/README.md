# Supabase auth email templates

Supabase sends the auth emails (sign-in link, signup confirmation, invite,
password reset) itself, from templates stored in the **hosted dashboard** — not
from our code. Nothing in `lib/email/` runs for them.

These files exist so those emails still use the same branded design system as
every other Mpillow email. **The repo is the source of truth; the dashboard is a
copy you paste.**

## Regenerating

```bash
npx tsx scripts/build-auth-email-templates.ts
```

The generator renders each template through `renderEmailShell()`, so a change to
`lib/email/theme.ts` or `lib/email/base.ts` flows through here too. Re-run it
after any design-system change, then re-paste (below).

Do not hand-edit these files — the next regeneration overwrites them. Change the
copy in `scripts/build-auth-email-templates.ts` instead.

## Pasting into Supabase

Dashboard → **Authentication → Email Templates**. For each row below, paste the
file's contents into the **Message body** field:

| File | Dashboard template |
| --- | --- |
| `magic-link.html` | Magic Link |
| `confirm-signup.html` | Confirm signup |
| `invite-user.html` | Invite user |
| `reset-password.html` | Reset password |
| `change-email.html` | Change Email Address |
| `reauthentication.html` | Reauthentication |

Subject lines are configured separately in the dashboard and are not part of
these files.

### Paste all of them, not just Magic Link

`signInWithOtp({ email })` runs with `shouldCreateUser` at its default (`true`),
so which template Supabase sends depends on whether an *auth* user already
exists for that address:

| Recipient | Template Supabase sends |
| --- | --- |
| Existing auth user (returning) | **Magic Link** |
| Brand-new address (first-time partner applicant) | **Confirm signup** |
| Address provisioned via `inviteUserByEmail` | **Invite user** |

Partners are matched by email and a first-time applicant has **no auth user
yet**, so they receive **Confirm signup** — not Magic Link. If only Magic Link
carries the code, first-time partners get an email with no visible code and the
"Verify code" step in `components/auth/login-form.tsx` is unusable for them.

## Template variables

Each file keeps two Go placeholders that Supabase substitutes at send time.
They must stay literal — do not URL-encode or escape them:

- `{{ .Token }}` — the 6-digit code the login form's "Verify code" step accepts.
- `{{ .ConfirmationURL }}` — the magic link (→ `/auth/callback`).

Both are present in every template so the code and the link always travel
together — except **Reauthentication**, which Supabase renders without a
`{{ .ConfirmationURL }}`; that one is code-only and carries no button.

**Change Email Address** additionally uses `{{ .Email }}` (the current address)
and `{{ .NewEmail }}`. With "Secure email change" on — Supabase's default — the
email goes to *both* addresses and both must be confirmed before the change
takes effect, which is why the copy says so.

Google OAuth uses no email template and is unaffected.
