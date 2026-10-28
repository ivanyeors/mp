# 09 — ✨ Generate draft: Claude writes the email from its subject

**Issue:** [#363](https://github.com/ivanyeors/mp/issues/363) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** AFK
**Status:** not started
**Blocked by:** 03 (typed blocks), 04 (the editor). 07 for the optional product picker.
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:email`

## Goal

The owner types a subject, *"Sleep cooler this December: FibreCool covers are back"*, presses
**✨ Generate draft**, and in about fifteen seconds reads a whole email in the brand's voice:
two subject lines and two preview lines to choose from, a heading, three short paragraphs, a
bullet list and a button. They press *Use this draft*, change one sentence, send themselves a
test. Nothing was sent, saved or invented on their behalf.

## What to build

**Where it lives (PRD decision 9).**
- A **✨ Generate draft** button in the editor's empty state, the first thing a blank email
  offers, and in the editor's toolbar beside Clear all.
- It needs a subject (or, if the subject is empty, the campaign name) of at least 3 words.
  Otherwise it is disabled with *"Write a subject of at least 3 words, then Claude can draft the
  email from it."*
- Pressing it opens the **Generate panel**: a side sheet, full screen at 375px. Its inputs:
  - the subject, prefilled and editable;
  - *What's it about?* — optional, at most 500 characters;
  - *Goal* — Announce · Promotion · Bring them back · Care tips · Event. Optional;
  - *Products* — up to 3 Listed storefront products (slice 07's picker). Optional;
  - *Keep* — when the email already has blocks: *Replace the email* (default) or *Add below*.

**The call** (`lib/email-campaigns/ai-draft.ts`, server-only, behind a server action):
- **One shared Claude client** (`lib/ai/claude.ts`), lifted out of `lib/reviews/draft-reply.ts`
  with its credentials (`ANTHROPIC_API_KEY` locally, the Vercel OIDC federation rule in
  production, already configured for review replies). `draft-reply.ts` imports it; its behaviour
  is unchanged.
- **One set of brand facts** (`lib/ai/mpillow-facts.ts`), also lifted out of the review prompt,
  so both prompts state the same facts and only those.
- `claude-opus-5-5`, `output_config.effort: "medium"` (set explicitly; PRD decision 10),
  server-side fallbacks on (`server-side-fallback-2026-07-01`, `fallbacks: "default"`), as
  `draft-reply.ts` does.
- **Structured output.** `output_config.format` is a Zod schema (`zodOutputFormat`) built from
  the editor's own block types (slice 03): `{ subjects: string[3], preheaders: string[2],
  blocks: (heading | text | buttons | divider | products)[], reviewerNotes: string[] }`. Text
  runs may be bold or italic and may hold the *first name* Merge field, but carry no `href`.
  A button's `target` is chosen from the fixed list (sign in · shop · book a fitting · customise ·
  a picked product), and a products block may only name products Staff picked: never a URL the
  model writes. No images (Staff choose photos), no HTML, no footer, sender or unsubscribe: the
  renderer owns those. The content model is flat on purpose, because structured outputs take no
  recursive schema.
- The schema cannot enforce lengths, so code does: each block is re-parsed with the editor's own
  `EmailBlockSchema`, the same one a save uses. A draft that does not parse is retried once,
  then reported.
- **Streaming** with `client.beta.messages.stream(...)` and `finalMessage()` so a long answer
  never meets a function timeout. The panel shows two stages, *Reading your brief…* then
  *Writing the email…*, and renders each block in the panel's preview as soon as that block's
  JSON has closed and passes `EmailBlockSchema`. *Use this draft* is enabled only once the
  whole draft has parsed and passed the checks below.
- `stop_reason` is checked before reading content: `refusal` → *"Claude couldn't write this
  one. Try different words."*; `max_tokens` → retry once.

**Guardrails** (the system prompt says them; code checks them, like `checkReplyText`):
- Only the facts in `mpillow-facts.ts`. No prices, percentages, discounts, dates, guarantees,
  stock levels or offers unless they appear word for word in what Staff typed. Prices come from
  the product block (slice 07), never from the model.
- Comfort, fit and sleep, never health: no treat, cure, relieve, therapy, rehab, clinically,
  doctor-recommended. The output runs through `checkBannedClinical`
  (`lib/i18n/copy-bands.ts`), the check the landing page uses.
- Never ask for a review or a rating (Google's policy; PRD-email-marketing). Never name Shopify
  or a move (owner, 2026-10-21). No "Re:" or "Fwd:", no all-caps subject, no false urgency.
- Points only while points are live: the draft passes `mentionsPoints` / `pointsCheck` as a
  written campaign does.
- The brief is untrusted text: it goes in `<brief>` tags, JSON-encoded, and the system prompt
  says it is data, not instructions. Claude gets no tools.
- **No customer data ever reaches Claude.** Personalisation is the `{first name}` merge field,
  filled in at send.

**Limits and records:**
- Per Staff member, through `rateLimitExceeded` (`lib/rate-limit.ts`, counted in the database):
  10 drafts in 10 minutes, 60 a day. Over it: *"You've drafted a lot today. Try again after
  4:10 pm."*
- `campaigns` permission, checked first, like every campaign action.
- Each draft is in the audit log (`email_campaign.ai_draft`): the campaign, the model that
  served it, input and output tokens, and whether it was used. Never the brief's text.
- With Claude not configured, the button is replaced by *"AI drafting is off: set the Anthropic
  credentials in Vercel"* (the same check as `claudeConfigured()`).

**Accept, reject, undo:**
- The panel's buttons: **Use this draft**, **Try again**, **Discard**. Subject and preview line
  are pick-one choices.
- *Use this draft* snapshots the editor first and shows an Undo toast, the Clear all mechanism
  (slice 01). It never saves: Staff still press Save.
- Blocks from a draft carry a small **"Drafted with AI"** chip until Staff edit them or tick
  *Looks right*. The send checklist counts unchecked ones (slice 11; advisory, not blocking).

## Acceptance criteria

- [ ] With a subject of 3 or more words, a draft appears in the panel within the time measured
  in the eval (target: under 20 seconds), block by block.
- [ ] A draft never contains a price, a percentage, a discount or a code that Staff did not type,
  a banned clinical word, a review request, or a URL. The eval (below) holds this.
- [ ] *Use this draft* replaces (or adds below) and Undo restores the editor exactly.
- [ ] The 11th draft in 10 minutes is refused with the time it can run again.
- [ ] No request body contains a customer's name, email or order (tested on the built request).
- [ ] Review replies still draft exactly as before (their tests pass unchanged).

## Verify

```bash
npx vitest run lib/email-campaigns lib/ai lib/reviews "app/[lang]/settings/campaigns"
npm run typecheck && npm run lint
```

- Unit tests with a fake client: the request shape (model, effort, fallbacks, format, no PII),
  the validators, retry on a bad block, refusal and max_tokens handling, the rate limit.
- **An eval before merge** (`scripts/eval-campaign-drafts.ts`, run by hand with a real key):
  25 briefs (seasonal, product launch, care tips, bring-them-back, a brief that tries to inject
  instructions, a brief asking for "20% off" that Staff did type, one that did not). Every
  output must pass the guardrail checks; the owner reads ten and marks each usable or not. It
  also settles effort `medium` against `low` (PRD decision 10).
