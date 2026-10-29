# 02 — The words and the decision: glossary entries and ADR 0036

**Issue:** [#356](https://github.com/ivanyeors/mp/issues/356) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** AFK (docs; the owner approved the decisions on 2026-10-29)
**Status:** not started
**Blocked by:** none. Lands with or before slice 03.
**Labels:** `documentation`, `needs-triage`, `P2`, `area:email`

## Goal

Every new noun has one name before any code uses it, and the reasons are recorded where the
next person will look: the email is built from our own blocks (not a hosted editor, not HTML),
and its editor is one shared component, not one per page. The owner's own words settle two names:
**Variables** for what is filled in per recipient, and **placeholder** for the grey hint in an
empty field.

## What to write

**`CONTEXT.md` → Email marketing:**

- **Email campaign** — amended. Today: "a subject, an inbox preview line, a plain-text body and at
  most one button". Becomes: a subject, a preview line and a list of **Email blocks**, written in
  English, with an optional **Chinese version**. Campaigns written before the editor keep their
  plain-text body and are shown and sent as they always were. Every other line of the entry
  (ledger, waves, the lock, duplicates) stands.
- **Email block** — one typed part of an Email campaign: heading, text, buttons, image, hero,
  image + text, products, divider or spacer. Its type is from a list in code; Staff fill in its
  words, image, link and a few preset options, never its HTML, fonts or colours, and it is right
  in light and dark by itself. _Avoid_: "section" (a pillow filling's compartment, and the
  landing page's **Landing section**); "module", "row", "component"; an HTML block (there is
  none, on purpose).
- **Starter** — a ready-made layout: a list of Email blocks with placeholders for its words
  (*Product launch*, *Care tips*…). A campaign can start from one, or have one dragged into it;
  either way it becomes ordinary blocks, each movable, changeable and deletable. Defined in
  code. The CRM's **Playbooks** are Starters that also choose an audience. _Avoid_: "template"
  (an **Email template** is the words of a platform email; a Starter is the start of a campaign);
  "layout" on its own (the shell's layout is code, and nobody edits it).
- **Variable** — a value the platform fills in when an email is sent, shown to Staff as a chip
  they drag or insert into the words and written `{first_name}`. In an Email campaign it is a
  recipient's detail (*First name*, *Last name*, *Points balance*) with **fallback words** for a
  customer who has none, set once per campaign. In an **Email template** it is that email's own
  data, such as `{order_number}`. _Avoid_: "merge field", "merge tag"; "placeholder" (that is
  the hint text below).
- **Placeholder** — the grey hint an empty field shows (*e.g. Sleep cooler this December*). It
  is never saved, tested or sent; a required field still on its placeholder is empty. _Avoid_:
  for `{order_number}` (a Variable); for words typed in so that someone deletes them (there are
  none, on purpose: owner, 2026-10-29).
- **Chinese version** — a campaign's words in Simplified Chinese, for the Customers whose
  language is Chinese (`customers.locale = 'zh-CN'`). The same blocks, images, products,
  buttons and Variables as the English; only the words differ. Made with ✨ *Translate to
  Chinese* and edited by Staff. _Avoid_: "a second campaign" (it shares the campaign's audience,
  sends and lock); "localisation".
- **AI draft** — words Claude wrote for a campaign, from the subject and the brief Staff gave
  it, or a translation of its English. Written into the editor as one change Staff keep, change
  or undo; never saved or sent until Staff press Save and Send. Blocks from it are marked
  *Drafted with AI* until a person edits or keeps them. _Avoid_: "AI-generated email" (no email
  is generated without a person); calling the brief a prompt in the UI.
- **Email template** — amended: "with placeholders such as `{order_number}`" becomes "with
  Variables such as `{order_number}`". The code's `placeholders` field keeps its name.

**`docs/adr/0036-campaign-email-is-typed-blocks.md`:**

- *Context:* the plain-text editor, the owner's request (2026-10-28) and answers (2026-10-29),
  the options weighed (PRD *Build or embed*).
- *Decision:* a campaign's content is versioned JSON of typed Email blocks, validated by one Zod
  schema on every write (Staff's and Claude's alike) and rendered only on the server, by our own
  table-based components in `lib/email/`. The editor is today's campaign editor, enhanced; its
  editing parts are shared components in `components/block-editor/` that import nothing from
  `lib/email*`, so other pages can use them. TipTap is used only as the text input, and what it
  produces is mapped into our own model; its JSON is never stored. No hosted editor, no MJML,
  no HTML block. Every block's dark-mode rules live in the shell's one list.
- *Consequences:* the brand's layout, dark mode and footer stay in code; Claude writes into the
  same schema; a new block type is a code change; a page that needs an editor adopts the shared
  one rather than writing its own; legacy plain-text campaigns keep their renderer and their
  words forever, because a started campaign must keep sending the email it started with.

## Acceptance criteria

- [ ] `CONTEXT.md` has the eight entries above, each with an _Avoid_ line.
- [ ] ADR 0036 is listed in `docs/adr/README.md`.
- [ ] `PRD-email-marketing`'s *Not in v1* line about images and a rich-text editor points here.
- [ ] `./scripts/graphify update .` run and `graphify-out/` committed with the docs.
