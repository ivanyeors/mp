# 07 — Playbooks: a ready-written campaign for each stage

**Issue:** not filed
**Type:** AFK, then HITL (owner approves the words)
**Status:** not started
**Blocked by:** 02, 03
**Labels:** `enhancement`, `needs-triage`, `P3`, `area:admin`, `area:email`

## Goal

The owner starts the right campaign for a stage without a blank page. The demo: *New campaign →
Second purchase* opens a draft written for customers with one Order, its Audience the *New*
Segment.

## Playbooks

| Playbook | Audience | What it says | Never |
|---|---|---|---|
| Second purchase | *New*, 60 days after delivery | How to care for their Mpillow, the Mbolster that pairs with it | a discount code |
| Thank you | *Loyal* | A first look at what is new, their points and milestone | a discount code |
| We miss you | *At risk* | What is new since their last Order, their points balance and expiry | a review request |
| Welcome back | *Lapsed* | The re-adjustment service, what changed, how to reach us | a review request |

## What to build

- Each playbook as a draft beside `FIRST_CAMPAIGN_DRAFT` (`lib/email-campaigns/rules.ts`), passing
  `CampaignDraftSchema`, with `pointsCheck` respected.
- *New campaign* offers the playbooks as starting points; each opens its stage's Segment (slice
  04's) as the Audience.
- Everything else is the existing send flow: test, readiness, waves within Resend's plan.

## Acceptance criteria

- [ ] No playbook mentions a review, a rating or an aftercare message.
- [ ] Only `subscribed` Customers receive any of them (checked at send, as today).
- [ ] The owner has approved each playbook's words before it is offered.
