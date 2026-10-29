# 04 — The editor: drag blocks into the email, see the real email beside it, one shared component

**Issue:** [#358](https://github.com/ivanyeors/mp/issues/358) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** AFK
**Status:** partial: the 375px and 1280px screenshots need a session with the real app. Clicking a block in the preview selects its card: slice 05 marks every block with `data-block-id` in every render, so the preview stays the test send's HTML (joined in wave 3). The Dark toggle is joined to slice 15's `forceDark` (wave 2 merge)
**Blocked by:** 03
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:email`

## Goal

A marketer builds an EDM by dragging blocks into it and writing in them, and sees the real email
as they go. The demo: drag *Buttons* from the palette to between the heading and the text (and
*Image + text* once slice 06 lands), write in it, drag it above the heading, press ⌘Z, switch the
preview to *Mobile* and *Dark*, read the inbox row, press ⌘S. The editor is today's campaign
editor, enhanced (PRD decision 1): same page, same Send card, one editor.

## What to build

### Shared parts, in `components/block-editor/` (PRD decision 1)

Built once, with no email code in them, so other pages can use them (Email templates in slice 14;
Blogs and Page Builder later). Nothing in this folder imports `lib/email*` or
`lib/email-campaigns/*`; a test checks it.

| Part | What it does |
|---|---|
| `BlockEditor` | The column of blocks, the drop indicator, selection, the block menu (*Move up*, *Move down*, Duplicate, Delete), `+` between blocks and `/` in an empty text line. Given a **block catalogue**: each type's icon, label, one-line description, empty value, its form and its options. |
| `BlockPalette` | The palette beside the column, with tabs supplied by the page (here: Blocks, Starters in slice 08, Variables in slice 13). Every item can be dragged into the column or added with a click or Enter. |
| `useEditorHistory` | Undo and Redo over any value: at least 100 steps, a typing burst counted as one step, a drag or a paste as one. |
| `RichText` | The TipTap 3 text input, given which marks it allows and which Variables it offers. Emits a flat list of runs; a page maps them to its own model. |
| `useUnsavedGuard` | ⌘S, the leave-page guard and in-browser recovery of unsaved edits. |
| `AiButton` | The ✨ button and its labelled loading states, used by slices 09, 10 and 17. |

The campaign page supplies the email-specific half, in `app/[lang]/settings/campaigns/blocks/`:
the block catalogue for the content model (slice 03), each block's form and placeholders, and
the mapping from `RichText` runs to the content's runs.

### The campaign page

`campaign-editor.tsx` keeps its route, header, Send card and audience controls; its message box
and button fields are replaced by the `BlockEditor`. Two tabs: **Write** and **Send**. *Send*
holds today's Send a test, Ready to send? and Send cards, unchanged (`PRD-campaign-send-flow`).
*Write* is three columns on a laptop:

- **A header bar**: back, the campaign name (editable inline), the status badge, Undo, Redo,
  Clear all (slice 01, now also clearing the blocks back to an empty email), ✨ Generate
  (slice 09), Save.
- **Left, the palette** (`BlockPalette`): the **Blocks** tab lists every block type with its
  icon and one line (*Image + text: a photo beside a few lines*). Drag one into the email:
  a line shows where it will land, always between two blocks or at the end. Click or Enter adds
  it after the selected block.
- **Middle, the email**:
  - *From* (read-only, from the sending setup), *Subject* and *Preview line*, each with a live
    character count and a placeholder. The subject turns amber past 60 characters (*"may be cut
    off on phones"*); the preview line suggests 40–90.
  - *Start with "Hi first name,"* (today's switch).
  - **The blocks**: each a card showing its content as it will read, editable in place, with
    its empty fields on their placeholders (PRD decision 7). A drag handle on every card
    (`@dnd-kit/react`, with the existing `lib/dnd/sortable-move.ts`) reorders it.
  - **The selected block's options** open under it (alignment, button style, spacer size, image
    width): presets only, no colour, font or size pickers (PRD decision 2).
- **Right, the preview** (sticky): the server-rendered email in a sandboxed iframe, re-rendered
  400 ms after the last change, with toggles:
  - *Desktop* (600px column) · *Mobile* (375px);
  - *Light* · *Dark* (the shell's own dark rules, as Apple Mail and Outlook.com apply them;
    slice 15);
  - an **Inbox row** above it: sender name, subject and preview line as Gmail lists them, cut
    where Gmail on a phone cuts them.
  Clicking a block in the preview selects its card.
- **Text blocks** use `RichText` with a tiny schema: paragraph, bullet list, bold, italic, link,
  and Variables (slice 03's first name here; slice 13's palette and the rest later). A floating
  toolbar on selection: **B**, *I*, Link, • List. Pasting keeps only what the schema allows
  (pasting from Word or a website brings words, bold, italic, links and lists, nothing else).
  TipTap's own JSON is never stored (ADR 0036).

**Editing safety:**

- Undo and Redo over the whole email (⌘Z, ⇧⌘Z; Ctrl on Windows) through `useEditorHistory`, for
  every change including Clear all, a drag, a dropped Starter and an AI result.
- ⌘S saves. Leaving with unsaved changes asks first (the browser's `beforeunload`, and the
  in-app back link). Unsaved edits are also kept in the browser, so a crashed tab offers
  *"Restore your unsaved changes from 4:12 pm?"* (PRD decision 4: Save stays explicit).
- A locked campaign shows the same layout read-only: no palette, no drag, *Duplicate to change it*.

**Phones.** Below `lg` the palette becomes an *Add* sheet (tap to add after the selected block;
drag is not needed on a phone), and *Write* and *Preview* become a toggle at the top. Save sits
in the sticky bottom bar (`MobileStickyActionBar`). Every control is at least 44px.

**Accessibility.** Every drag has a keyboard way: the palette's items add with Enter, a card
moves with *Move up* / *Move down* or with dnd-kit's keyboard sensor, and moves are announced
(*"Image + text moved to position 2 of 6"*). Every icon button has a name. After an insert, focus
goes into the new block; after a delete, to the block above.

## Acceptance criteria

- [ ] A marketer can drag every block type from the palette to any position, reorder by drag and
  by keyboard, duplicate and delete, and undo and redo each.
- [ ] The preview matches what the test send delivers (same renderer, same HTML).
- [ ] Pasting rich content from a web page leaves only allowed formatting.
- [ ] Nothing in `components/block-editor/` imports email code (a test reads the imports).
- [ ] At 375px nothing scrolls sideways and every action is reachable.
- [ ] The *Send* tab behaves exactly as before (its tests pass unchanged).

## Verify

```bash
npx vitest run components/block-editor "app/[lang]/settings/campaigns" lib/email-campaigns
npm run typecheck && npm run lint
```

Component tests for drag-in from the palette, insert, move, undo/redo and the TipTap → runs
mapping (including a paste fixture); the import-boundary test; a visual check at 375px and
1280px with screenshots in the PR.
