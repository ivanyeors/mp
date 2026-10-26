# 05 — Owner's check on production: status green, a test, the pilot inside the plan

**Issue:** not filed
**Type:** HITL
**Status:** waiting for the deploy of slices 01–04
**Blocked by:** 01, 02, 03, 04
**Labels:** `needs-triage`, `P1`, `area:email`, `ops`

## Goal

The owner confirms on custom.mpillow.com that the page sends through Resend, inside the free plan,
before the first real wave. Nothing in this slice is code.

## Already done (2026-10-22 to 2026-10-26)

- [x] `hello.mpillow.com` added in Resend with its DNS records and `_dmarc.hello`
  (`p=none`). Verification in Resend is the owner's to confirm.
- [x] Resend webhook to `https://custom.mpillow.com/api/email/resend-webhook` for
  `email.bounced` and `email.complained`.
- [x] Vercel, Production: `CAMPAIGN_RESEND_API_KEY` (Sensitive, Production only),
  `CAMPAIGN_EMAIL_FROM`, `CAMPAIGN_EMAIL_DOMAIN`, `UNSUBSCRIBE_SECRET`,
  `CAMPAIGN_RESEND_WEBHOOK_SECRET`, `SUPPORT_EMAIL`. `RESEND_API_KEY` removed;
  `EMAIL_PROVIDER=gmail` on every environment.
- [x] `20261021100000_email_campaigns.sql` is applied to production (checked 2026-10-26).

## Checks on production

1. [ ] **Email campaigns → Sending card:** every row ticked; *Today 0 of 100*.
2. [ ] **Run every check:** one-click unsubscribe and signed links pass.
3. [ ] **A test** to a Gmail, an Outlook and a Yahoo inbox:
   - it lands in the inbox, not spam;
   - Gmail's Unsubscribe button works;
   - the button signs in;
   - *Show original* shows SPF, DKIM and DMARC passing.
4. [ ] **Today** has gone up by the number of test addresses.
5. [ ] **The pilot:** 25–50 people, buyers first, from the dialog. The result says what next.
6. [ ] **48 hours later:** the Waves table shows bounces under 2% and spam under 0.1% before the
   next wave (migration slice 09's ramp).
