# 01 — Clear all: empty the email in one click, with Undo

**Issue:** [#355](https://github.com/ivanyeors/mp/issues/355) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** AFK
**Status:** not started
**Blocked by:** none (built on today's editor; slice 04 carries it into the block editor)
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:email`

## Goal

The owner opens *New campaign*, sees the ready-written invitation, and wants a blank page. Today
they delete the name, the subject, the preview line and fourteen lines of message one field at a
time, then reset the button. The demo: *New campaign → Clear all* empties the email at once, a
toast says *"Cleared the email. Undo"*, and Undo puts every word back.

## What to build

- A **Clear all** button (`Eraser` icon, `variant="outline"`, `size="sm"`) in the editor's header,
  beside Duplicate and Archive. It shows on *New campaign* and on every saved draft.
- It clears **what the email says**: the campaign name, the subject, the preview line, the message
  and the button (back to *No button*). It keeps **who it goes to** (the audience and Segment) and
  the greeting switch, which are settings, not words.
- **Undo, not a confirmation dialog** (PRD decision 7). Nothing is saved until Save, so the action
  is reversible: the editor keeps a snapshot, and a `sonner` toast with an *Undo* action restores
  it for 10 seconds. The toast is announced (`role="status"`). After a Save, Undo is gone.
- Disabled, with a tooltip saying why, when:
  - the campaign has started sending (*"Sending has started, so the email is fixed. Duplicate it to
    write a new one."*);
  - a wave is sending;
  - the email is already empty.
- Clearing a saved draft marks it unsaved; Save then validates as today (*"Write a subject."*).
- Keyboard: reachable in tab order, and works with Enter and Space. The toast's Undo is focusable.

## Acceptance criteria

- [ ] *New campaign → Clear all* leaves the name, subject, preview line and message empty and the
  button on *No button*; the audience and greeting are unchanged.
- [ ] *Undo* within 10 seconds restores every field exactly; the preview re-renders.
- [ ] A locked campaign's Clear all is disabled and says why.
- [ ] Clear all never writes to the database or the audit log by itself.
- [ ] It works at 375px: the header's buttons wrap, nothing scrolls sideways.

## Verify

```bash
npx vitest run "app/[lang]/settings/campaigns"
npm run typecheck && npm run lint
```

A component test renders the editor for a new campaign, a draft and a locked campaign, and checks
the button's state in each; one more presses it and then Undo.
