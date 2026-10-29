# 08 — Starters: ready-made layouts built from the same blocks, to start from or drag in

**Issue:** [#362](https://github.com/ivanyeors/mp/issues/362) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** AFK
**Status:** not started
**Blocked by:** 04 (the editor and its palette)
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:email`

## Goal

*New campaign* opens empty (slice 01) and offers somewhere to start; the palette offers
ready-made layouts to drag in. A **Starter** is the owner's *ready-made layout* (PRD decision 8):
the same blocks the marketer drags in one by one, already arranged, with placeholders where the
words go. The demo: the owner picks *Product launch* and gets a hero, a heading, two paragraphs,
a product block and a button, each field on its placeholder, already looking like an Mpillow
EDM. They drag the button above the products, delete a paragraph, then drag *Care tips* from the
palette's **Starters** tab to the end of the email, and its blocks land there as ordinary blocks.

## What to build

- **The Start panel**, in an empty email (on *New campaign* and after Clear all): four choices as
  cards, each with a thumbnail rendered from the real renderer (not a screenshot): **Blank**,
  **✨ Write with AI** (slice 09), a **Starter**, or **a past campaign**. Typing in the email or
  dropping a block dismisses it. It replaces slice 01's *Use the sign-in invitation* button.
- **The palette's Starters tab** (`BlockPalette`, slice 04): every Starter with its thumbnail.
  Drag one into the email, or press Enter on it, and its blocks are inserted at that point, as
  one change that Undo removes.
- **A Starter is ordinary blocks.** Once in the email, nothing remembers which Starter it came
  from: every block moves, changes and deletes like any other. There is no locked region and no
  "detach".
- **Starters** (a glossary word, slice 02), in code, `lib/email-campaigns/starters.ts`, each a
  `CampaignContent` that passes `EmailBlockSchema`:
  - **Product launch** — hero, heading, text, products, button;
  - **Care tips** — heading, text, image + text, bullets, button;
  - **Event or fitting day** — hero, text, button (*Book a fitting*);
  - **A short note** — heading, text, button (closest to today's plain email);
  - **New website: sign in for points** — today's `FIRST_CAMPAIGN_DRAFT`, as blocks, with its
    audience (*Imported from Shopify, not signed in yet*). The one Starter with finished words,
    because it is a whole email someone picks on purpose, not a default to delete.
- **Placeholders, not sample words** (PRD decision 7). A Starter's words to write are empty fields
  with placeholders (*e.g. Our FibreCool covers are back*), shown in the editor and, dashed and
  muted, in the preview. A test send leaves them out. The send checks refuse a campaign whose
  required fields are still empty (slice 11), naming the block.
- **A past campaign**: the list of campaigns (archived included), newest first; picking one is
  today's *Duplicate*, landing in the editor as a new draft.
- **The CRM's Playbooks** (`PRD-crm-retention-loop` slice 07, #343) become Starters with an
  audience: *Second purchase*, *Thank you*, *We miss you*, *Welcome back*. That slice adds their
  words; this one gives them the place and the format. Its README is updated to say so.
- `?segment=<id>` from *Email this Segment* still opens an empty email to that Segment, with the
  Start panel offered.

## Acceptance criteria

- [ ] Every Starter renders through the real renderer, passes the schema, and has no price,
  offer or review request of its own.
- [ ] Dragging a Starter into an email inserts its blocks at the drop point; each can then be
  moved, changed or deleted, and Undo removes the whole insert.
- [ ] A Starter's empty fields show placeholders; a campaign with a required field still empty
  cannot be sent (checked at the wave).
- [ ] *A past campaign* never copies sends, waves or the lock: only content, audience and name.
- [ ] Thumbnails load lazily, and the Start panel and the Starters tab are usable at 375px.

## Verify

```bash
npx vitest run lib/email-campaigns "app/[lang]/settings/campaigns"
```

A test renders every Starter, parses it, and checks it for offers and for placeholder-only words
(the invitation excepted); a component test drops a Starter between two blocks and undoes it.
