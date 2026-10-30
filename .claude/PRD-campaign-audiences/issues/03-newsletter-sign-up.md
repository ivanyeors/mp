# 03 — A sign-up for people who have not bought, double opt-in

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** 02 (the migration), owner decision 6
**Labels:** `enhancement`, `needs-triage`, `P3`, `area:storefront`, `area:email`

## Goal

A visitor who is not ready to buy can still hear from us, and becomes a *Lead* we can email. The
demo: an email typed into the footer, a confirm email, one click, and the Customer is *Lead ·
subscribed · sign-up*.

## What to build

- A footer field and button, English and Chinese, with the same one line as slice 02.
- `POST /api/newsletter`: zod, rate-limited as the drop-off endpoint is, a honeypot field. It
  always answers "Check your inbox" (never whether the email is known), and sends one confirm
  email through the **campaign** transport, at most once per address per day.
- The confirm link is signed (as the unsubscribe link is) and expires in 7 days. Opening it finds
  or creates the Customer and calls `set_marketing_email(..., 'subscribed', 'newsletter')`.
  An `unsubscribed` Customer is re-subscribed only by this click, which is their own action.
- Nothing is stored before the click: no row for an address nobody confirmed.

## Acceptance criteria

- [ ] No Customer row and no consent before the confirm click.
- [ ] The answer is the same for a known and an unknown email.
- [ ] The confirm email counts against Resend's daily room (`PRD-campaign-send-flow`).
