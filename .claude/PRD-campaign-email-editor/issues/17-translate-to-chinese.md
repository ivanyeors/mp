# 17 — ✨ Translate to Chinese: a 中文 version for customers who use the site in Chinese

**Issue:** [#374](https://github.com/ivanyeors/mp/issues/374) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** AFK
**Status:** partial: built and tested against a fake client; the eval's 10 translations still need one run with a real key and the owner's read, and the editor's 中文 mode a look in a browser
**Blocked by:** 09 (the shared client, facts and checks), 13 (Variables kept through a
translation), 16 (the settings)
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:email`

## Goal

The owner's "English first / but have a translate button to translate into Chinese with the same
AI api" (PRD decision 11). The demo: the owner finishes an English campaign, presses **✨
Translate to Chinese**, and the editor switches to **中文** with every heading, paragraph, button
label, alt text, the subject and the preview line in Chinese, around the same hero, products and
buttons. They change one line, send themselves a 中文 test, and the Send card says *"214 of
1,830 customers read the site in Chinese and will get the 中文 version."*

## What to build

**The model** (in `content`, so the schema, the size check and the lock cover it):

- `content.translations["zh-CN"] = { subject, preheader, fallbacks, blocks: { [blockId]: words } }`.
  **Only words are translated**: a heading's text, a text block's runs, button labels, alt text,
  a hero's or an image + text's heading, line and button label. Everything else (block order,
  images, products, button targets, links, options) comes from the English, so there is one
  layout and two sets of words.
- Each translated block keeps a fingerprint of the English words it was made from, so the editor
  knows when the English has changed since.
- Block campaigns only; a legacy plain-text campaign has no 中文 version.

**In the editor:**

- A **Language** switch, *English · 中文*, above the email, and **✨ Translate to Chinese**
  (`AiButton`) beside it. The first press makes the whole 中文 version; later presses offer
  *Translate what changed* or *Translate everything again*. Each is one change Undo removes, as
  in slice 09: never saved, never sent (PRD decision 9).
- In **中文**, words are edited as in English; the layout is not: the palette is hidden, blocks
  don't drag, and options are read-only, with *"The layout is shared with English. Change it
  there."* The preview and inbox row show the 中文 email.
- A block added in English shows in 中文 as *Not translated yet*, with ✨ on that block; a block
  whose English changed shows *English changed since this was translated*, with **Translate
  again** and **Keep** (Keep marks it current).
- The 中文 fallbacks for Variables (*您* for a first name, say) sit with the English ones.
- **Remove the 中文 version**, in the Language switch's menu, sends English to everyone again.

**The call** (`lib/email-campaigns/ai-translate.ts`, server-only):

- The shared client and facts (slice 09), with the model and the **whole drafts** effort from
  the AI writing settings (slice 16). Same rate limit, same audit entry shape
  (`email_campaign.ai_translate`).
- Structured output built from the words-only shapes of the content schema: block ids in, the
  same block ids out. Links and Variables travel as numbered markers, not URLs or codes, and code
  puts them back, so Claude never reads or writes a URL.
- **Checks in code**, like slice 09's: the same block ids; in each block, the same Variables and
  the same number of links, in the same order; the schema's lengths; and the guardrails in
  Chinese: no health words (a Chinese list beside `BANNED_CLINICAL` in `lib/i18n/copy-bands.ts`:
  治疗, 治愈, 疗效, 缓解, 康复, 处方, 临床, 医生推荐), no prices or offers the English did not
  have, no review request, no Shopify. Product and brand names are written as the 中文 site
  writes them (a short glossary in `mpillow-facts.ts`).

**Rendering and sending:**

- The renderer takes a language: for `zh-CN`, the words come from the translation and the
  shell's fixed words (the greeting, the footer, the unsubscribe link's label) from a zh-CN set
  beside the English. The email font stack gains the Chinese system fonts (PingFang SC,
  Microsoft YaHei, Noto Sans SC) after Figtree.
- The sender already knows each recipient's `locale` (`lib/email-campaigns/sender.ts`). A
  recipient whose locale is `zh-CN` gets the 中文 version when the campaign has one; everyone
  else, and everyone when it has none, gets English. One ledger row per recipient, as today.
- **The Send card** counts the audience by language when a wave is planned and says how many get
  each. *Send a test* asks which language.
- **The checks** (slice 11) run on both versions; an untranslated or out-of-date block (not kept)
  blocks the wave, naming it.

## Acceptance criteria

- [ ] ✨ Translate fills every block's words, the subject, the preview line and the fallbacks,
  keeping every block id, link and Variable (tested with a fake client, and in the eval).
- [ ] A translation that drops or adds a link or Variable, or uses a banned word, is refused with
  the block named, and nothing in the editor changes.
- [ ] Changing the layout in English changes the 中文 email's layout; changing a word in English
  marks that block out of date in 中文.
- [ ] A `zh-CN` recipient gets the 中文 email and every other recipient the English one, in one
  wave; a campaign without a 中文 version sends English to all, as today.
- [ ] The lock covers the 中文 version: a started campaign's Chinese words cannot change.

## Verify

```bash
npx vitest run lib/email lib/email-campaigns lib/ai lib/i18n "app/[lang]/settings/campaigns"
npm run typecheck && npm run lint
```

Renderer snapshots in 中文, light and dark; a sender test with a mixed-language audience; the
slice 09 eval gains 10 translations (one with a link and two Variables, one whose English
words try to give Claude instructions), read by the owner.
