# 01 — Placeholders, not prefilled words: New campaign opens empty, and Clear all gets back there

**Issue:** [#355](https://github.com/ivanyeors/mp/issues/355) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** AFK
**Status:** done
**Blocked by:** none (built on today's editor; slice 04 carries both into the block editor)
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:email`

## Goal

The owner opens *New campaign* and today finds the invitation typed into every field, as if
someone had written it, and deletes it field by field. The owner's answer (PRD decision 7):
those words should be **placeholders**, grey hints that disappear as you type and are never
saved or sent. The demo: *New campaign* opens with empty fields showing *e.g. Sleep cooler this
December*; the owner types a subject and a few lines, presses **Clear all**, sees every field
back on its hint and a toast *"Cleared the email. Undo"*, and Undo puts their words back.

## What to build

**Placeholders.**

- `newCampaignDraft` returns an empty draft for every start (name, subject, preview line and
  message empty, no button, the greeting on), keeping today's default audience and the
  `?segment=<id>` case. `FIRST_CAMPAIGN_DRAFT` stays in `rules.ts`, no longer the default.
- Every field shows a placeholder, in the field's own `placeholder` attribute (muted text, as
  inputs already style it):

  | Field | Placeholder |
  |---|---|
  | Campaign name | *e.g. December cooling launch* (only Staff see it) |
  | Subject | *e.g. Sleep cooler this December* |
  | Preview line | *e.g. Our FibreCool covers are back, in every size* |
  | Message | *Write your message. Leave a blank line between paragraphs; start a line with - for a bullet.* |
  | Button label | *e.g. Shop the covers* |

- The preview shows an empty email's layout with the hints in place, dashed and muted, so the
  layout reads; a test send and every wave contain only what was typed. Saving with a required
  field empty is today's field error (*"Write a subject."*): a placeholder is never a value.
- **Use the sign-in invitation**, a text button under the message box, fills in today's
  invitation as real words (and its audience) for whoever wants it. Slice 08 turns it into a
  Starter and replaces this button with the Start panel.

**Clear all.**

- A **Clear all** button (`Eraser` icon, `variant="outline"`, `size="sm"`) in the editor's header,
  beside Duplicate and Archive, on *New campaign* and on every saved draft.
- It returns **what the email says** to its placeholders: the campaign name, the subject, the
  preview line, the message and the button (back to *No button*). It keeps **who it goes to**
  (the audience and Segment) and the greeting switch, which are settings, not words.
- **Undo, not a confirmation dialog** (PRD decision 7). Nothing is saved until Save, so the action
  is reversible: the editor keeps a snapshot, and a `sonner` toast with an *Undo* action restores
  it for 10 seconds. The toast is announced (`role="status"`). After a Save, Undo is gone.
- Disabled, with a tooltip saying why, when:
  - the campaign has started sending (*"Sending has started, so the email is fixed. Duplicate it to
    write a new one."*);
  - a wave is sending;
  - every field is already on its placeholder.
- Clearing a saved draft marks it unsaved; Save then validates as today.
- Keyboard: reachable in tab order, and works with Enter and Space. The toast's Undo is focusable.

## Acceptance criteria

- [ ] *New campaign* opens with every field empty and showing its placeholder; nothing of the
  invitation is in a field until *Use the sign-in invitation* is pressed.
- [ ] A placeholder is never saved, rendered into a test send or sent (tested on the saved row and
  the test email's HTML).
- [ ] *Clear all* returns every field to its placeholder and the button to *No button*; the
  audience and greeting are unchanged.
- [ ] *Undo* within 10 seconds restores every field exactly; the preview re-renders.
- [ ] A locked campaign's Clear all is disabled and says why.
- [ ] Clear all never writes to the database or the audit log by itself.
- [ ] It works at 375px: the header's buttons wrap, nothing scrolls sideways.

## Verify

```bash
npx vitest run lib/email-campaigns "app/[lang]/settings/campaigns"
npm run typecheck && npm run lint
```

A test of `newCampaignDraft` (empty for every start, the Segment case kept); a component test
renders the editor for a new campaign, a draft and a locked campaign, checks the placeholders and
the button's state in each, then presses Clear all and Undo.
