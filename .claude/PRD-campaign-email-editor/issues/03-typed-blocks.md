# 03 — Typed blocks end to end: saved, previewed, tested and sent

**Issue:** [#357](https://github.com/ivanyeors/mp/issues/357) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** AFK
**Status:** not started
**Blocked by:** 02
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:email`

## Goal

The tracer bullet. A new campaign is a list of Email blocks: a heading, a text block with bold
and a link, two buttons side by side, a divider. It saves, previews, sends a test and sends a
wave through the same sender, ledger and checks as today. Every campaign written before keeps
rendering byte for byte as it did (slice 15 later improves the shell's light and dark rules for
every email; the words, order and links of a legacy campaign never change, PRD decision 5). The
editor here is plain (add, edit, move up and down, delete); slice 04 makes it the drag-and-drop
editor.

## What to build

**The model** (`lib/email-campaigns/content.ts`, pure):

- `CampaignContent = { v: 1, blocks: EmailBlock[], fallbacks: { [variable]: string } }`, at most
  40 blocks, each with a stable `id`. `fallbacks` holds each Variable's fallback words, set once
  per campaign (*there* for first name).
- v1 core types (later slices add `image`, `hero`, `split`, `products`):

  | Type | Fields |
  |---|---|
  | `heading` | `level: 1 \| 2`, `text` (plain, ≤ 120) |
  | `text` | `paragraphs: Paragraph[]`: each `{ kind: "p" \| "bullets", runs: Run[] }` (or `items: Run[][]` for bullets) |
  | `buttons` | 1–2 of `{ label (≤ 40), target, style: "primary" \| "secondary" }` |
  | `divider` | — |
  | `spacer` | `size: "s" \| "m" \| "l"` |

- A **Run** is `{ text, bold?, italic?, href? }` or `{ var: VariableKey }`, a **Variable**. This
  slice's catalogue has one, `first_name`; slice 13 adds the rest and the drag-in palette. Flat,
  not recursive, so the same schema serves the editor, the database and Claude's structured
  output (which cannot take a recursive schema). The subject and preview line may hold
  Variables too, written `{first_name}` as Email templates write theirs (`placeholdersIn`,
  `lib/email/copy.ts`).
- A button's `target`: `sign_in` (the recipient's Claim link or account page, as today),
  `url` (https only), `shop` (`/shop`), `book_fitting` (`/appointments`), `customise_mpillow`
  (`/mp-config`), `customise_mbolster` (`/mbolster-config`), or a product (slice 07). Site
  targets are resolved by the sender to absolute URLs on the live origin with the campaign's
  UTMs, never typed.
- One Zod schema, `EmailBlockSchema` / `CampaignContentSchema`, with the limits in code (the
  database cannot see inside JSON well, and structured outputs cannot hold lengths).
- `mentionsPoints` reads every block's words, so `pointsCheck` keeps working.

**The database** (`2026110xxxxxxx_email_campaign_content.sql`, idempotent, server-only as today):

- `email_campaigns.content jsonb null`; `body` becomes nullable; a check that exactly one of
  `body` and `content` is set; `content->>'v' = '1'`; `pg_column_size(content) < 256000`.
- The lock trigger also refuses changes to `content` once `locked_at` is set.
- The button columns stay for legacy campaigns; a block campaign leaves them null.

**The renderer** (`lib/email/campaign-blocks.ts`, pure, server-only):

- Walks the blocks into the existing components (`heading`, `paragraphHtml`, `bulletList`,
  `button`, `divider`, `spacer`) inside `renderEmailShell`, so the logo, fonts, dark mode and the
  footer with its unsubscribe link are unchanged.
- Two buttons side by side: one table row of conditional-padding buttons that stack below 480px.
- Every string escaped; every `href` through `safeUrl`; a run's link text is its own words, not
  the URL. An unknown block type or field throws: nothing typed ever becomes markup.
- The plain-text part comes from the same blocks: headings, paragraphs, `- ` bullets, and
  `label: url` for links and buttons.
- Registered in the email registry as `campaign.blocks`, so `/dev/email-preview` shows a sample.

**The sender:** `renderCampaignEmail` picks the renderer by which column is set. A `sign_in`
button anywhere in the blocks resolves per recipient, exactly as the single button does today.
Each Variable is filled from the recipient (first name from the claim, as the greeting is
today), or with the campaign's fallback words when the customer has none.

**The editor (minimal):** new campaigns save `content`. The list has *Add block* (a menu of the
five types), a small form per block, ↑ / ↓, and Delete. A new block's fields are empty and show
placeholders (PRD decision 7, slice 01), never sample words. A legacy draft (body, not locked) shows
*Convert to blocks*, which turns its text into blocks with `parseCampaignBody` (it already splits
headings, paragraphs and bullets) and its button into a `buttons` block. A locked legacy
campaign stays read-only, as today.

**Duplicate** copies `content` (or `body`) as it is.

## Acceptance criteria

- [ ] A block campaign saves, previews, sends a test and sends a wave; the sends land in
  `customer_campaign_sends` as before.
- [ ] Every existing campaign's preview HTML is identical before and after this slice (a snapshot
  test over the fixtures, and a check on production after the migration: slice 12). Its
  plain-text part stays identical for good, through slice 15's shell changes too.
- [ ] Editing `content` on a locked campaign is refused by the trigger.
- [ ] A crafted payload with `<script>`, `javascript:` or an unknown type is refused by the
  schema, and the renderer throws on it if handed one directly.
- [ ] Converted legacy drafts render the same words as before.
- [ ] A text block with `{ var: "first_name" }` renders the recipient's first name, or the
  campaign's fallback words for a customer with none; an unknown Variable is refused by the
  schema.

## Verify

```bash
npx vitest run lib/email lib/email-campaigns "app/[lang]/settings/campaigns"
npm run typecheck && npm run lint
rm -rf graphify-out/cache && ./scripts/graphify update .
```

Plus `supabase/tests/email-marketing/assert-02-campaign-content.sql`: the one-of check, the size
check, and the lock on `content`.
