# 07 — Playbooks: a ready-written campaign for each stage

**Issue:** not filed
**Type:** AFK, then HITL (owner approves the words)
**Status:** **built** as drafts (2026-11-01); offered once the owner approves each one's words
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
| Welcome back | *At risk · Lapsed* | The re-adjustment service, what changed, how to reach us | a review request |

## What to build

- Each playbook as a **Starter** (PRD-campaign-email-editor slice 08), an entry in
  `PLAYBOOK_STARTERS` (`lib/email-campaigns/starters.ts`): its blocks, its finished words
  (`words`: name, subject, preview line) and its stage's Segment (`audience: { audience:
  "segment", segment: "<the Segment's name>" }`), passing `CampaignDraftSchema` once started, with
  `pointsCheck` respected. The sign-in invitation (`INVITATION_STARTER`) is the pattern.
- *New campaign*'s Start panel and the editor's Starters tab already offer every Starter; each
  Playbook opens its stage's Segment (slice 04's) as the Audience, or leaves the Segment to
  choose when none has that name. *Welcome back* needs the *Lapsed* sub-status as a filter: the Stage filter
  chooses it since PRD-campaign-audiences slice 04 (`stage=at-risk:lapsed`, 2026-10-31).
- Everything else is the existing send flow: test, readiness, waves within Resend's plan.

## As built (2026-11-01)

- **`PLAYBOOK_DRAFTS`** in `lib/email-campaigns/starters.ts`: the four, each with its name,
  subject, preview line and blocks written in full, from `MPILLOW_FACTS` only. None offers a
  discount, asks for a review or rating, or carries an aftercare message; *Thank you* and *We miss
  you* speak of points, so they wait for points to be live, as every campaign that does. Points
  never expire (2026-10-31), so *We miss you* says so instead of an expiry date.
- **The approval gate:** `APPROVED_PLAYBOOKS` (empty). Only an approved draft is in
  `PLAYBOOK_STARTERS`, and so in the Start panel and the palette. Approving one is adding its id.
- **Audiences:** each names its stage's Segment and the Customers query that saves it, so Staff
  save it once under that name and the Playbook finds it:

  | Playbook | Segment name | Customers query |
  |---|---|---|
  | Second purchase | New · delivered over 60 days ago | `stage=new&delivered=over:60` |
  | Thank you | Loyal | `stage=loyal` |
  | We miss you | At risk · 12 to 24 months | `stage=at-risk&last_order=within:24` |
  | Welcome back | At risk · Lapsed | `stage=at-risk:lapsed`, and *Include unengaged* on |

- **Welcome back** is the win-back: started, it ticks *Include unengaged*
  (PRD-campaign-audiences slice 12).
- **Tests:** `lib/email-campaigns/__tests__/playbooks.test.ts` (each saves as written once its
  Segment is chosen; every Segment query parses; no discount, review, rating or aftercare words;
  which wait for points; only approved drafts offered).

## Acceptance criteria

- [x] No playbook mentions a review, a rating or an aftercare message.
- [x] Only `subscribed` Customers receive any of them (checked at send, as today).
- [ ] The owner has approved each playbook's words before it is offered. The gate is built; the
  approval is the owner's.
