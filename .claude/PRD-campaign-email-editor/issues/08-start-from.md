# 08 — Start from: a blank email, a Starter, or a past campaign

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** 04 (the editor)
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:email`

## Goal

*New campaign* stops opening on one fixed invitation. It asks how to start: **Blank**,
**✨ Write with AI** (slice 09), a **Starter**, or **a past campaign**. The demo: the owner picks
*Product launch*, gets a hero, a heading, two paragraphs, a product block and a button, with
placeholder words to replace, and the email already looks like an Mpillow EDM.

## What to build

- **The Start panel** on *New campaign* (and in an empty email after Clear all): four choices as
  cards, each with a thumbnail rendered from the real renderer (not a screenshot).
- **Starters** (PRD decision 8; a new glossary word, slice 02): ready-made block layouts in code,
  `lib/email-campaigns/starters.ts`, each a `CampaignContent` that passes `EmailBlockSchema`:
  - **New website: sign in for points** — today's `FIRST_CAMPAIGN_DRAFT`, as blocks, with its
    audience (*Imported from Shopify, not signed in yet*);
  - **Product launch** — hero, heading, text, products, button;
  - **Care tips** — heading, text, image + text, bullets, button;
  - **Event or fitting day** — hero, text, button (*Book a fitting*);
  - **A short note** — heading, text, button (closest to today's plain email).

  A Starter's placeholder words are marked (`[Write the headline]`) and the send checks refuse a
  campaign that still has one (slice 11). Starters are code, like Email templates' layouts: the
  owner approves their words in review, not in a CMS.
- **A past campaign**: the list of campaigns (archived included), newest first; picking one is
  today's *Duplicate*, landing in the editor as a new draft.
- **The CRM's Playbooks** (`PRD-crm-retention-loop` slice 07, #343) become Starters with an
  audience: *Second purchase*, *Thank you*, *We miss you*, *Welcome back*. That slice adds their
  words; this one gives them the place and the format. Its README is updated to say so.
- `?segment=<id>` from *Email this Segment* still opens a blank email to that Segment, with the
  Start panel offered.

## Acceptance criteria

- [ ] Every Starter renders through the real renderer, passes the schema, and has no price,
  offer or review request of its own.
- [ ] A campaign still holding a `[placeholder]` cannot be sent (checked at the wave).
- [ ] *A past campaign* never copies sends, waves or the lock: only content, audience and name.
- [ ] Thumbnails load lazily and the panel is usable at 375px.

## Verify

```bash
npx vitest run lib/email-campaigns "app/[lang]/settings/campaigns"
```

A test renders every Starter, parses it, and checks it for placeholders and offers.
