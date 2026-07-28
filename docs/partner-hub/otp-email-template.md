# OTP + magic-link auth email (HITL dashboard step)

The shared Sign in (`components/auth/login-form.tsx`) now supports entering a
6-digit code as an alternative to clicking the magic link. `verifyOtp` works
today because Supabase always generates the token — **but the code is only
visible to the user once the hosted email template renders it.**

Auth email templates are **not** in this repo (no `supabase/config.toml`, no
`supabase/templates/`); they live in the Supabase hosted dashboard. So this is
a one-time manual change.

## What to do

Supabase dashboard → **Authentication → Email Templates → Magic Link** — make
the body carry **both** the code and the link so one email serves both paths:

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

No code deploy is required for this step; it takes effect on the next auth email.
Google OAuth uses no email template and is unaffected.
