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
- `{{ .ConfirmationURL }}` — Supabase's own link (→ `/auth/callback`), in the
  templates other than the two below.
- **Magic Link** and **Confirm signup** link to our own page instead:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}`.

Both are present in every template so the code and the link always travel
together — except **Reauthentication**, which Supabase renders without a
`{{ .ConfirmationURL }}`; that one is code-only and carries no button.

### Why the sign-in emails link to `/auth/confirm` (PRD-campaign-audiences slice 03)

Sign in is also the sign-up: the Customer tab and the footer's "Get our
emails" send these two emails, and the click is what proves the address,
makes the account and records any marketing consent. `{{ .ConfirmationURL }}`
had two faults for that:

- **Mail filters spend it.** Corporate filters (Outlook Safe Links and the
  like) open every link to check it. Supabase's link verifies on open, so the
  filter uses up the one-time token, and the person's click — and the code in
  the same email — then fail as expired.
- **It only works in the browser that asked.** The PKCE link needs a verifier
  cookie from the browser where the email was typed, so opening it on a phone
  fails.

`/auth/confirm` (app/auth/confirm/page.tsx) spends nothing when opened. It
shows one button; pressing it verifies `token_hash` on the server, on any
device, then finishes the sign-in as the callback does (`completeSignIn`).
`{{ .RedirectTo }}` is the return address the form asked for
(`/auth/callback?next=…&as=…&consent=…&lang=…`); the page reads who is
signing in, where to and any consent from it, escaped or not.

Until the two new files are pasted into the dashboard, the old templates keep
working through `/auth/callback`, which reads the same return address.

**Change Email Address** additionally uses `{{ .Email }}` (the current address)
and `{{ .NewEmail }}`. With "Secure email change" on — Supabase's default — the
email goes to *both* addresses and both must be confirmed before the change
takes effect, which is why the copy says so.

Google OAuth uses no email template and is unaffected.
