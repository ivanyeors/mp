# 09 — The right version: fit checks and a Variable

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** 04, 05 (the columns the checks read)
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:email`

## Goal

Before a Wave, the page says where the email and its people do not match. The demo: *14 of 60
read Chinese and this email has no Chinese version* and *9 of 60 ship outside Singapore and this
email offers an in-store visit*.

## What to build

- **Fit checks**, computed over the Wave's planned people, shown in the send checklist beside the
  content checks (`lib/email-campaigns/content-checks.ts`). Advisory: each names a filter or an
  exclusion that would fix it, and none blocks the Wave.
  - Chinese readers (`locale = 'zh-CN'`) and no Chinese version.
  - Each Variable: how many will read its fallback words.
  - In-store wording (a link to `/appointments`, or the words *studio*, *in-store*, *fitting*,
    *re-adjustment*) to people whose *Ships to* is not Singapore or is unknown.
  - A products block showing a class some recipients already bought (*12 already own an
    Mbolster*).
  - People who bought in the last 14 days.
- **One Variable** in `lib/email-campaigns/variables.ts`, with fallback words:
  - **Your pillow**: the latest purchased pillow as the shop names it (*Premium Mpillow, size M*).
  - ~~**Points expire on**~~: dropped 2026-10-31. Points never expire (ADR 0030 decision 17), and
    `points_expires_on()` is gone (`20261031032017_points_never_expire.sql`).
- The sender reads the value per recipient in `readCampaignCandidates`; nothing new reaches
  the browser except the preview's sample.

## Acceptance criteria

- [ ] The checks are pure functions over a list of recipient facts, tested case by case.
- [ ] No check reads a review, a rating or a note.
