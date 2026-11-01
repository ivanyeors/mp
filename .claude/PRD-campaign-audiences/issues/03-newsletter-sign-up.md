# 03 — The sign-up is the Customer sign-in

**Issue:** not filed
**Type:** AFK
**Status:** built (2026-11-01). Owner to-do: paste two auth email templates into Supabase (below).
**Blocked by:** 02 (the migration), owner decision 6
**Labels:** `enhancement`, `needs-triage`, `P3`, `area:storefront`, `area:email`

## Goal

A visitor who is not ready to buy can still hear from us, and becomes a *Lead* we can email, the
moment they prove their address. Signing up is signing in: one page, one email, one click. Staff
sign in on a tab of their own, which never touches the customer list.

Redesigned on 2026-11-01 (ADR 0041). The first plan, a footer form with its own endpoint, signed
confirm link and confirm email, was dropped: the sign-in link already proves the address, and the
first sign-in already makes the Customer.

## What was researched

- **Magic links fail in two common ways.** Mail filters (Outlook Safe Links and the like) open
  every link to check it, which spends a one-time token before the person clicks; and a PKCE link
  only works in the browser that asked, so opening the email on a phone fails. The fix in
  Supabase's own SSR guide is a `token_hash` link to the site's `/auth/confirm`, verified on the
  server ([Supabase, PKCE flow for SSR](https://supabase.io/docs/guides/auth/server-side/email-based-auth-with-pkce-flow-for-ssr),
  [Supabase Next.js template](https://supabase.com/ui/docs/nextjs/password-based-auth)); a
  button on that page, rather than verifying on open, keeps a filter from spending it.
- **Always keep a second path.** A code in the same email as the link works on any device and
  when the link is spent ([UX guide](https://theuxshop-project.pages.dev/guides/passwordless-authentication-ux),
  [developer notes](https://hn.nuxt.dev/item/42627453)). Sign in already sends both.
- **One flow for new and returning people.** A passwordless "continue with email" does not need a
  separate sign-up; it also never says whether an address is known.
- **Consent is its own box, and a confirmed address is the double opt-in.** Guidance is to keep
  marketing consent apart from other agreements and confirm the address
  ([iubenda](https://www.iubenda.com/en/help/21996-gdpr-consent-forms-examples),
  [Publii](https://getpublii.com/blog/newsletter-opt-in-gdpr-compliance.html)). Pre-ticked boxes
  are weaker consent; the owner chose ticked by default (decision 1, ADR 0039), counsel to read.

## As built

- **Sign in (`/account/login`) has two tabs.** *Customer*, the default: "Sign in or create an
  account", Google, the email link and code, and the box, ticked by default, with the slice 02
  line. *Staff*: "Staff sign in", for the Admin Panel, no box. An Admin Panel destination or
  `?as=staff` opens Staff; otherwise this device's last tab does. The Partner Hub
  (`next=/partner…`) keeps its own single form, with no box.
- **One finish for every path** (`lib/auth/complete-sign-in.ts`), whether Google or the link
  (`/auth/callback`), the 6-digit code (`finishSignIn`) or the new confirm page:
  - *Staff*: on the team, into the Admin Panel; not on the team, signed out again and back to the
    Staff tab with "That email isn't on the Mpillow team…". Never a Customer, never consent.
  - *Customer*: the Customer is found or made now, in the page's language
    (`linkCustomerToAuthUser`, which also runs the Claim and adopts guest orders). Then the
    consent is recorded under its source: `sign_in` (the box) or `newsletter` (the footer), only
    for someone nobody has asked (`20261101031444_consent_sign_up.sql`). The box is not recorded
    for a Staff login on the Customer tab; their footer sign-up is.
  - A failure after the session exists is logged and never stops the sign-in.
- **The intent rides in the return address** (`/auth/callback?next=…&as=…&consent=…&lang=…`,
  `lib/auth/sign-in-intent.ts`), so it survives the email, a second device and Google.
- **"Get our emails" in the site footer** sends the same link and code with `newsletter`, then
  opens Sign in at the code step ("…to confirm your email and join our list"). Signed-in visitors
  see a link to their Profile instead.
- **A notice on the page they land on**: "You're on our email list", "You're already on our email
  list", or, after a footer sign-up by someone who unsubscribed, "You unsubscribed from our
  emails before" with **Email me again** (their own click, recorded as `account`).
- **The scanner-safe link** `/auth/confirm`: opening it spends nothing; its button verifies the
  `token_hash` on the server, on any device, and finishes as above. The Magic Link and Confirm
  signup templates link there and add one line saying signing in confirms an email sign-up.
- **Errors go back to the tab they came from**: an expired or spent link says to use the code or
  ask for a new one.

## Owner to-do

Paste `supabase/templates/magic-link.html` and `confirm-signup.html` into Supabase → Authentication
→ Email Templates (*Magic Link* and *Confirm signup*). Until then the old links keep working
through `/auth/callback`, but a filter-opened or other-device link still fails there. Check that
the Site URL is the live site.

## Acceptance criteria

- [x] No Customer row and no consent before the address is proven (link, code or Google).
- [x] The answer is the same for a known and an unknown email (Supabase's sign-in answers both alike).
- [x] ~~The confirm email counts against Resend's daily room~~ — superseded: the sign-up email is
      Supabase's sign-in email and does not pass through the campaign sender.
- [x] A Staff sign-in never makes a Customer or records consent; a non-team email is signed out
      and told why.
- [x] The box and the footer subscribe only someone nobody has asked; nothing re-subscribes
      someone who unsubscribed but their own click.
- [x] A new Customer takes the language of the page they signed up on.
