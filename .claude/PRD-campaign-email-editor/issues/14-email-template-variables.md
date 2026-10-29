# 14 — Variables in Email templates: the shared text input, `{order_number}` dragged in as a chip

**Issue:** [#371](https://github.com/ivanyeors/mp/issues/371) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** AFK
**Status:** not started
**Blocked by:** 13 (`RichText` with Variables, the Variables palette)
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:email`

## Goal

The shared editor's first use outside campaigns (PRD decision 1), and the owner's "variables a
user can drag and build into the email templates" (decision 3). Today an Email template's words
are plain fields where the Owner types `{order_number}` by hand and finds out on save whether it
was spelled right. The demo: on *Admin Panel → Email templates → Order confirmed*, the owner
drags *Order number* from the Variables list into the subject, sees it as a chip, and the
preview fills it with the sample order. No email's saved words change.

## What to build

- In `email-copy-editor.tsx` (`PRD-email-templates`), each field's `Input` or `Textarea` becomes
  the shared `RichText` (`components/block-editor/`, slice 04) in **plain mode**: no bold,
  italic, links or lists, single-line or multi-line as the field is today (`isLong`). Its
  Variables are that email's own (`spec.placeholders`): each key becomes a chip with a label
  (`order_number` → *Order number*) and its description as the chip's tooltip.
- A **Variables** list beside the fields, using the same palette items as campaigns
  (`BlockPalette`'s Variables tab, slice 13): drag a chip into a field, click it to insert at the
  cursor, or type `{` in a field to choose one. Only this email's Variables are offered, so an
  unknown one can no longer be typed by mistake.
- **Storage does not change.** A field is still a string with `{order_number}` in it, saved to
  `email_template_copy` and validated by `parseEmailCopy` as today; the input turns `{name}` into
  a chip when it loads and back when it saves. No fallbacks: the platform always has these values.
- **Words for Staff:** the page says *Variables* where it says *placeholders* today, including
  the error (*"{x} is not a variable this email has."*). The code's `placeholders` field keeps
  its name (glossary, slice 02).
- Preview, *Reset to original*, *Send a test* and the audit entry: unchanged.

## Acceptance criteria

- [ ] For every Email template, loading its saved (or original) words into the editor and saving
  without a change writes identical strings (a round-trip test over every spec in the registry).
- [ ] A Variable dragged into a field is saved as `{key}` and rendered by the email's own data in
  the preview and the test send.
- [ ] Only the email's own Variables can be inserted; a typed-in unknown `{x}` still fails
  `parseEmailCopy` with the renamed message.
- [ ] Every drag has a keyboard way, and the page works at 375px.
- [ ] The Email templates tests pass, with only the renamed wording updated.

## Verify

```bash
npx vitest run components/block-editor lib/email "app/[lang]/settings/email-templates"
npm run typecheck && npm run lint
```
