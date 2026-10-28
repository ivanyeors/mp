# 02 — The words and the decision: glossary entries and ADR 0036

**Issue:** [#356](https://github.com/ivanyeors/mp/issues/356) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** AFK (docs; the owner approves with the PRD)
**Status:** not started
**Blocked by:** none. Lands with or before slice 03.
**Labels:** `documentation`, `needs-triage`, `P2`, `area:email`

## Goal

Every new noun has one name before any code uses it, and the reason the email is built from our
own blocks (not a hosted editor, not HTML) is recorded where the next person will look.

## What to write

**`CONTEXT.md` → Email marketing:**

- **Email campaign** — amended. Today: "a subject, an inbox preview line, a plain-text body and at
  most one button". Becomes: a subject, a preview line and a list of **Email blocks**. Campaigns
  written before the editor keep their plain-text body and are shown and sent as they always
  were. Every other line of the entry (ledger, waves, the lock, duplicates) stands.
- **Email block** — one typed part of an Email campaign: heading, text, buttons, image, hero,
  image + text, products, divider or spacer. Its type is from a list in code; Staff fill in its
  words, image, link and a few preset options, never its HTML, fonts or colours. _Avoid_:
  "section" (a pillow filling's compartment, and the landing page's **Landing section**);
  "module", "row", "component"; an HTML block (there is none, on purpose).
- **Starter** — a ready-made list of Email blocks a new campaign can start from (*Product
  launch*, *Care tips*…), with placeholder words to replace. Defined in code. The CRM's
  **Playbooks** are Starters that also choose an audience. _Avoid_: "template" (an **Email
  template** is the words of a platform email; a Starter is the start of a campaign).
- **Merge field** — a value filled in per recipient when the email is sent; v1 has one, *first
  name*, and it always carries the words to use when a customer has none ("there").
  _Avoid_: "merge tag", "variable", "placeholder" (a Starter's placeholder is text Staff must
  replace before sending).
- **AI draft** — words Claude wrote for a campaign from the subject and the brief Staff gave it,
  shown for Staff to use, change or discard. It is never saved or sent until Staff do so.
  Blocks from it are marked *Drafted with AI* until a person edits or confirms them.
  _Avoid_: "AI-generated email" (no email is generated without a person); calling the brief a
  prompt in the UI.

**`docs/adr/0036-campaign-email-is-typed-blocks.md`:**

- *Context:* the plain-text editor, the owner's request (2026-10-28), the options weighed
  (PRD *Options considered*).
- *Decision:* a campaign's content is versioned JSON of typed Email blocks, validated by one Zod
  schema on every write (Staff's and Claude's alike) and rendered only on the server, by our own
  table-based components in `lib/email/`. TipTap is used only as the input for a text block, and
  what it produces is mapped into our own model; its JSON is never stored. No hosted editor, no
  MJML, no HTML block.
- *Consequences:* the brand's layout, dark mode and footer stay in code; Claude writes into the
  same schema; a new block type is a code change; legacy plain-text campaigns keep their
  renderer forever, because a started campaign must keep sending the email it started with.

## Acceptance criteria

- [ ] `CONTEXT.md` has the five entries above, each with an _Avoid_ line.
- [ ] ADR 0036 is listed in `docs/adr/README.md`.
- [ ] `PRD-email-marketing`'s *Not in v1* line about images and a rich-text editor points here.
- [ ] `./scripts/graphify update .` run and `graphify-out/` committed with the docs.
