# OTP + magic-link auth email (HITL dashboard step)

The shared Sign in (`components/auth/login-form.tsx`) now supports entering a
6-digit code as an alternative to clicking the magic link. `verifyOtp` works
today because Supabase always generates the token — **but the code is only
visible to the user once the hosted email template renders it.**

Auth email templates are **not** in this repo (no `supabase/config.toml`, no
`supabase/templates/`); they live in the Supabase hosted dashboard. So this is
a one-time manual change.

## What to do

Supabase dashboard → **Authentication → Email Templates**. Edit the body so it
carries **both** the code and the link, using this snippet:

```html
<h2>Sign in to Marshmallow Pillow</h2>

<p>Enter this code:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:2px">{{ .Token }}</p>

<p>Or click to sign in:</p>
<p><a href="{{ .ConfirmationURL }}">Sign in</a></p>
```

- `{{ .Token }}` → the 6-digit code the login form's "Verify code" step accepts.
- `{{ .ConfirmationURL }}` → the existing magic link (→ `/auth/callback`). Leave
  it in place so the link path keeps working exactly as before.

### Which templates — edit ALL of these (not just Magic Link)

`signInWithOtp({ email })` runs with `shouldCreateUser` at its default (`true`),
so **which** template Supabase sends depends on whether an *auth* user already
exists for that address:

| Recipient | Template Supabase sends |
| --- | --- |
| Existing auth user (returning) | **Magic Link** |
| Brand-new address (first-time partner applicant, no auth user yet) | **Confirm signup** |
| Address you provisioned via `inviteUserByEmail` | **Invite user** |

Partners are matched by email and a first-time applicant has **no auth user
yet**, so they receive **Confirm signup** — not Magic Link. If only Magic Link
carries `{{ .Token }}`, first-time partners get an email with no visible code and
the "Verify code" box is unusable for them. **Paste the snippet above into
Confirm signup and Invite user too** (both expose `{{ .Token }}` and
`{{ .ConfirmationURL }}`).

No code deploy is required for this step; it takes effect on the next auth email.
Google OAuth uses no email template and is unaffected.
