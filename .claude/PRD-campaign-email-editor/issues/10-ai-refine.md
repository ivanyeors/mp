# 10 — ✨ Refine: subject-line ideas, a preview line, and rewriting one block

**Issue:** [#364](https://github.com/ivanyeors/mp/issues/364) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** AFK
**Status:** not started
**Blocked by:** 09 (the shared client, facts, schema checks and limits)
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:email`

## Goal

The owner has written the email themselves and wants help with the parts AI is best at. The
demo: the sparkle beside *Subject* offers five subject lines written from the email they wrote;
the sparkle on a paragraph offers *Shorter*, *Warmer*, *Clearer* and *Fix grammar*, and shows
the rewrite next to the original before anything changes.

## What to build

- **Subject ideas.** A ✨ button inside the Subject field. Claude reads the subject and the
  blocks (never customers) and returns 5 subject lines, each with its length. Each is a button
  that fills the field; *More ideas* asks again. Same guardrails as slice 09; subjects over 60
  characters are marked *"may be cut off on phones"*.
- **Preview line.** A ✨ button in the Preview line field: 2 suggestions written to follow the
  subject, not repeat it.
- **Rewrite a block.** On a heading or text block's toolbar: ✨ with labelled choices — Shorter,
  Warmer, Clearer, Fix grammar — and *Something else…* (one line, at most 120 characters, treated
  as data). The result shows beside the original with **Replace**, **Try again** and **Keep
  mine**. Replace is undoable (the editor's undo, slice 04).
- Lower cost per call: `output_config.effort: "low"`, a small schema, `max_tokens` sized to the
  block. These count toward the same per-Staff limit as slice 09, at a weight of one each.
- Labels are words, not just a sparkle (NN/g, *Prompt controls in GenAI*): every AI button has a
  visible or accessible name such as *"Suggest subject lines"*.

## Acceptance criteria

- [ ] Subject ideas never exceed 150 characters (the schema's limit) and pass the guardrails.
- [ ] A rewrite keeps every link and the `{first name}` merge field of the original.
- [ ] *Keep mine* leaves the block untouched; *Replace* is undone by Undo.
- [ ] Each control is keyboard-operable and announced by name.

## Verify

```bash
npx vitest run lib/email-campaigns lib/ai "app/[lang]/settings/campaigns"
```

The slice 09 eval gains 10 rewrite cases (including a block with a link and a merge field).
