# A campaign's email is typed blocks, rendered by our own components and written in one shared editor

Status: Accepted (PRD `campaign-email-editor`, owner decisions 2026-10-29)

## Context

An **Email campaign** today is a subject, an inbox preview line, a plain-text body and at most one
button (`app/[lang]/settings/campaigns/campaign-editor.tsx`, `lib/email/campaigns.ts`). The body
has a small syntax (a blank line for a paragraph, `- ` for a bullet, `## ` for a heading, a bare
`https://` address for a link), and `renderComposedCampaignEmail` lays it out inside
`renderEmailShell`. Plain text was deliberate: "Staff type plain text, never HTML, so nothing they
type becomes markup" (PRD-email-marketing). It sends safely and writes poorly: no image, no hero,
no product, no second button, and nothing to start from but one fixed email typed in as real
words.

The owner asked on 2026-10-28 for proper EDMs, an editor a marketer can use, and AI that writes
from the title. The answers on 2026-10-29 settled the shape: build our own editor by enhancing the
current one, and do not duplicate it but make it components other pages can use; fixed styling
that is right in light and dark by itself; **Variables** dragged into the words; drag-and-drop
blocks, with ready-made layouts (**Starters**) made of the same blocks; AI in the editor only,
with a person pressing Send; English first, with a button to translate into Chinese.

Every page that needs one grows its own editor today: Campaigns a textarea, Email templates a
form of fields with `{order_number}` typed by hand, Blogs a Markdown editor.

The options weighed (PRD *Build or embed*):

- **Hosted builders** (Unlayer, Beefree). The editor loads from their CDN, the design is their
  proprietary JSON, and HTML export runs in the browser or on a paid API. Our layout, dark mode
  and footer would live in someone else's product.
- **Easy Email** (MJML). Peer-depends on React 18 and marks React 19, which we run, unsupported.
- **GrapesJS with MJML.** A web-page-builder UX, about 600 KB of JavaScript, and MJML's blocks
  instead of ours.
- **`@react-email/editor`.** MIT and promising, but young (1.0 in April 2026, over a hundred
  releases since), and export needs a live editor instance, so it would be a second renderer
  beside ours. Worth a look again in 2027.
- **Our own block list, our own renderer, TipTap inside text blocks.** The shell
  (`lib/email/base.ts`) and the components (`lib/email/components.ts`) already handle classic
  Outlook, dark mode (Outlook.com's `[data-ogsc]` included) and the unsubscribe footer. TipTap 3
  is MIT and maps to whatever model we give it. `@dnd-kit/react` is already a dependency.

Claude's structured outputs fill a Zod schema, but cannot take a recursive schema or carry length
limits, so whatever model the editor writes must be flat and must be checked in code.

## Decision

- **The content is versioned JSON of typed Email blocks.** A campaign's `content` is
  `{ v: 1, blocks: [...] }` (with each Variable's fallback words). A block's type comes from a
  list in code: heading, text, buttons, image, hero, image + text, products, divider, spacer. A
  text block's words are a flat list of runs (words that may be bold, italic or a link, or a
  Variable), never a tree, so one schema serves the editor, the database and Claude.
- **One Zod schema checks every write,** Staff's and Claude's alike, with the limits in it: the
  database cannot see well inside JSON and structured output cannot carry lengths. The database
  checks only what it can: the version, the size, and that a campaign has exactly one of `body`
  and `content`.
- **Rendered only on the server, by our own table-based components in `lib/email/`,** inside the
  shell, so the logo, fonts, dark mode and the footer with its unsubscribe link do not move.
  Every string is escaped and every link goes through `safeUrl`; an unknown type or field throws.
  The editor's preview is that server HTML in a sandboxed frame, not a second renderer.
- **Presets, not styles.** Staff choose alignment, image width, a primary or secondary button and
  a spacer size. There is no font, colour or size picker: the shell's design tokens are the brand.
  Every block's dark-mode rules live in the shell's one list (`darkRules()`), emitted for
  `prefers-color-scheme` and for `[data-ogsc]` as today, and a test fails any block class with no
  dark rule.
- **The editor is today's campaign editor, enhanced.** There is no second campaign page. Its
  editing parts (the block list and palette, drag and drop, undo and redo, placeholders, the text
  input with Variables, the ✨ button) are shared components in `components/block-editor/` that
  import nothing from `lib/email*` or `lib/email-campaigns/*`, so other pages can use them; a test
  checks the boundary. A page hands them its own block types and Variables.
- **TipTap is the text input only.** It allows paragraphs, bullets, bold, italic, links and
  Variables, so a paste keeps nothing else, and what it produces is mapped into our own runs. Its
  JSON is never stored.
- **No hosted editor, no MJML, no HTML block.** Nothing Staff type, and nothing Claude writes,
  becomes markup.

## Consequences

- The brand's layout, dark mode and footer stay in code. No campaign can break them, and a fix to
  the shell reaches every email at once.
- Claude writes into the same schema. An **AI draft** is parsed exactly as Staff's words are, with
  its lengths and the guardrails checked in code, and reaches the editor as one change a person
  keeps or undoes; it is never saved or sent by itself.
- A new block type is a code change: a schema entry, a renderer with its dark rules, a form and
  tests, reviewed in a pull request. Starters are code for the same reason. Staff cannot add a
  block or a style, and an HTML block is never the shortcut.
- A page that needs an editor adopts the shared one rather than writing its own. Email templates
  take its text input and Variables first; Blogs, the Page Builder and others can move onto it
  later, each move planned with that page.
- Legacy plain-text campaigns keep their renderer and their words forever, because a started
  campaign must keep sending the email it started with. `body`, the button columns and
  `renderComposedCampaignEmail` stay while any campaign uses them; their words, order and links
  never change, and their plain-text part stays the same byte for byte. Their HTML gains the
  shell's light and dark improvements, as every email does. An unsent legacy draft can be
  converted to blocks; a started one cannot.
- The lock that fixes a started campaign's email covers `content`, its **Chinese version**
  included; a changed email is still a duplicate.
- We own the editor's hard parts (drag and drop, undo, paste) and every new block's rendering in
  classic Outlook, Gmail and Apple Mail. Columns stack without media queries, through one column
  primitive, and the owner's inbox matrix checks each block before it ships.
