# 04 — The editor: write on the left, the real email on the right

**Issue:** [#358](https://github.com/ivanyeors/mp/issues/358) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** AFK
**Status:** not started
**Blocked by:** 03
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:email`

## Goal

A marketer writes an EDM the way they write a document, and sees the real email as they type.
The demo: type `/` in an empty line, pick *Image + text*… (once slice 06 lands; *Buttons* until
then), drag it above the heading, press ⌘Z, switch the preview to *Mobile* and *Dark*, read the
inbox row, press ⌘S.

## What to build

**Layout.** The campaign page gets two tabs: **Write** and **Send**. *Send* holds today's Send a
test, Ready to send? and Send cards, unchanged (`PRD-campaign-send-flow`). *Write* is:

- **A header bar**: back, the campaign name (editable inline), the status badge, Undo, Redo,
  Clear all (slice 01, now also clearing the blocks), ✨ Generate draft (slice 09), Save.
- **Left, the email**:
  - *From* (read-only, from the sending setup), *Subject* and *Preview line*, each with a live
    character count. The subject turns amber past 60 characters (*"may be cut off on phones"*);
    the preview line suggests 40–90.
  - *Start with "Hi first name,"* (today's switch).
  - **The block list**: each block a card showing its content as it will read, editable in place.
    A hover or focus "+" between cards, and `/` at the start of an empty text line, open the
    block menu: the block types with an icon and one line each. A drag handle on every card
    (`@dnd-kit/react`, with the existing `lib/dnd/sortable-move.ts`), and *Move up* / *Move down*
    in each card's menu for keyboard and touch. The card's menu also has Duplicate and Delete.
  - **The selected block's options** open under it (alignment, button style, spacer size,
    image width): presets only, no colour, font or size pickers (PRD decision 2).
- **Right, the preview** (sticky): the server-rendered email in a sandboxed iframe, re-rendered
  400 ms after the last change, with toggles:
  - *Desktop* (600px column) · *Mobile* (375px);
  - *Light* · *Dark* (renders the shell's own dark rules, as Apple Mail and Outlook.com apply them);
  - an **Inbox row** above it: sender name, subject and preview line as Gmail lists them, cut
    where Gmail on a phone cuts them.
  Clicking a block in the preview selects its card on the left.
- **Text blocks** use **TipTap 3** with a tiny schema: paragraph, bullet list, bold, italic, link,
  and a *first name* Merge field node that asks for its fallback. A floating toolbar on
  selection: **B**, *I*, Link, • List, *Insert first name*. Pasting keeps only what the schema
  allows (pasting from Word or a website brings words, bold, italic, links and lists, nothing
  else). The editor's JSON is mapped to the content model's runs on every change; TipTap's own
  JSON is never stored (ADR 0036).

**Editing safety:**

- Undo and Redo over the whole email (⌘Z, ⇧⌘Z; Ctrl on Windows), at least 100 steps, for every
  change including Clear all, a drag and an AI draft.
- ⌘S saves. Leaving with unsaved changes asks first (the browser's `beforeunload`, and the
  in-app back link). Unsaved edits are also kept in the browser, so a crashed tab offers
  *"Restore your unsaved changes from 4:12 pm?"* (PRD decision 4: Save stays explicit).
- A locked campaign shows the same layout read-only, with *Duplicate to change it*.

**Phones.** Below `lg`, *Write* and *Preview* become a toggle at the top instead of two columns;
Save sits in the sticky bottom bar (`MobileStickyActionBar`). Every control is at least 44px.

**Accessibility.** Drag has the keyboard alternative above, and moves are announced
(*"Image + text moved to position 2 of 6"*). Every icon button has a name. After an insert, focus
goes into the new block; after a delete, to the block above.

## Acceptance criteria

- [ ] A marketer can insert, reorder (drag and keyboard), duplicate and delete every block type,
  and undo and redo each.
- [ ] The preview matches what the test send delivers (same renderer, same HTML).
- [ ] Pasting rich content from a web page leaves only allowed formatting.
- [ ] At 375px nothing scrolls sideways and every action is reachable.
- [ ] The *Send* tab behaves exactly as before (its tests pass unchanged).

## Verify

```bash
npx vitest run "app/[lang]/settings/campaigns" lib/email-campaigns
npm run typecheck && npm run lint
```

Component tests for insert, move, undo/redo and the TipTap → runs mapping (including a paste
fixture); a visual check at 375px and 1280px with screenshots in the PR.
