# 15 — Light and dark, automatically: the shell, legacy campaigns and every block

**Issue:** [#372](https://github.com/ivanyeors/mp/issues/372) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** AFK
**Status:** not started
**Blocked by:** 03 (the first blocks). Later block slices (05, 06, 07) meet its rules as they land.
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:email`

## Goal

The owner's rule (PRD decisions 2 and 5): every email "must auto work for light/dark mode",
including the plain-text campaigns written before the editor, with no setting for anyone to
touch. The demo: the same campaign, legacy and block-built, opened in Apple Mail and Outlook.com
in dark mode, and in the editor's preview with *Dark* on: text, links, buttons, dividers, the
logo and a cut-out product photo all readable, and nothing white-on-white or black-on-black.

## What to build

- **One list, every block.** The shell's `darkRules()` (`lib/email/base.ts`) stays the single
  source, emitted twice as today: under `@media (prefers-color-scheme: dark)` and prefixed with
  `[data-ogsc]` for Outlook.com. Every `mp-*` class a block or component renders has its rule
  there: headings, text and links, both button styles side by side, dividers, spacers, panels,
  the column primitive (slice 06), product cards (slice 07), and the light plate for images with
  transparency (slice 05).
- **A coverage test** fails the build when a rendered class has no dark rule: it renders every
  block fixture and every legacy fixture, collects the `mp-*` classes, and checks each against
  the list (or against a short, commented list of classes that need no change in dark).
- **Colours that survive what can't be controlled.** Light colours inline, from the theme tokens
  (`lib/email/theme.ts`); dark colours from its `DARK` tokens. Links are always underlined, so
  they read in a client that inverts colours on its own (Gmail on iOS, which no rule reaches;
  Litmus, PRD *Research*). No meaning carried by colour alone.
- **Legacy campaigns.** Their body renders through the same shell and components, so they gain
  every fix here. Check their paragraphs, headings, bullets, links and single button in dark;
  fix gaps in the shared components. Their words, order and links never change: their
  plain-text part stays byte for byte (decision 5).
- **The preview's Dark toggle** (slice 04) renders the shell with a preview-only `forceDark`
  option that applies the same rule list unconditionally, so the preview shows exactly what the
  shell sends. `forceDark` can never reach a sent email (the sender has no way to pass it).
- **Every email benefits.** The shell is shared, so Email templates' emails get the same fixes;
  their tests pass, and `/dev/email-preview` gains the same Dark toggle.
- **No setting.** The editor has no dark-mode option, per block or per campaign.

## Acceptance criteria

- [ ] The coverage test passes for every block type and the legacy renderer, and fails when a
  class without a dark rule is added (tested with a deliberate fixture).
- [ ] Renderer snapshots per block in light and in `forceDark`.
- [ ] Every legacy fixture's plain-text part is identical before and after.
- [ ] `forceDark` is not a parameter of anything the sender calls (a type-level check).
- [ ] In slice 12's matrix, Apple Mail and Outlook.com dark show every block readable.

## Verify

```bash
npx vitest run lib/email lib/email-campaigns
npm run typecheck && npm run lint
```
