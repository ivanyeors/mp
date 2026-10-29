# 06 — Image + text: two columns that stack on a phone, in every inbox

**Issue:** [#360](https://github.com/ivanyeors/mp/issues/360) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** AFK
**Status:** not started
**Blocked by:** 05
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:email`

## Goal

The classic EDM row: a photo on one side, a heading, two lines and a link on the other. The
demo: the owner adds *Image + text*, flips the image to the right, and on a phone the image sits
above the words, in Gmail's app too.

## What to build

- A block type `split`: an image (as slice 05's `image`, alt required), `side: "left" | "right"`,
  and a heading, a text block (the same runs) and an optional button.
- **One column primitive** in `lib/email/components.ts`, `columns([...], { stackBelow: 480 })`,
  built the hybrid way: inline-block `div`s with `max-width` that fall to one column by width
  alone, inside MSO ghost tables (`<!--[if mso]>`) that keep two columns in classic Outlook.
  Media queries only refine it: Gmail's apps ignore them for non-Google accounts.
- Two buttons side by side (slice 03) and the products grid (slice 07) use the same primitive.
- On a phone the image always comes first, whichever side it is on.

## Acceptance criteria

- [ ] Two columns at 600px; one column at 375px, image first, in Gmail (web, iOS, Android),
  Apple Mail and new Outlook; two columns held in classic Outlook (slice 12's matrix).
- [ ] The text side keeps 16px body text and line-height 1.5 when stacked.
- [ ] The rendered row stays under 3 KB of HTML, so a six-row email is far from Gmail's clip.
- [ ] Light and dark need no setting: the column's classes are in the shell's dark list and pass
  slice 15's coverage test.

## Verify

```bash
npx vitest run lib/email
```

Renderer snapshots for left and right, with and without a button, light and dark; a size
assertion.
