# 09 — ✨ Generate: Claude writes the email from its subject, inside the editor

**Issue:** [#363](https://github.com/ivanyeors/mp/issues/363) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** AFK
**Status:** not started
**Blocked by:** 03 (typed blocks), 04 (the editor), 16 (the AI writing settings). 07 for the
optional product picker.
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:email`

## Goal

The owner types a subject, *"Sleep cooler this December: FibreCool covers are back"*, presses
**✨ Generate**, and watches the email write itself into the editor in the brand's voice: a
heading, three short paragraphs, a bullet list and a button, with three subject lines and two
preview lines to pick from under their fields. They press *Keep*, change one sentence, send
themselves a test. Everything happened in the editor (PRD decision 9): nothing was saved, sent or
invented on their behalf, and *Send* is still theirs to press.

## What to build

**Where it lives: the editor, and only the editor (PRD decision 9).**

- A **✨ Generate** button (`AiButton`, slice 04) in the editor's header, and in an empty email as
  the Start panel's *✨ Write with AI* (slice 08). In an empty text block, a small *✨ Write this
  from the subject* fills that one block.
- It needs a subject (or, if the subject is empty, the campaign name) of at least 3 words.
  Otherwise it is disabled with *"Write a subject of at least 3 words, then Claude can draft the
  email from it."*
- Pressing it opens a **popover under the button**, not a separate page or panel. Its inputs:
  - *What's it about?* — optional, at most 500 characters, with a placeholder (*e.g. The
    FibreCool cover is back in all sizes; it keeps the pillow cool on warm nights*);
  - *Goal* — Announce · Promotion · Bring them back · Care tips · Event. Optional;
  - *Products* — up to 3 Listed storefront products (slice 07's picker). Optional;
  - when the email already has blocks: *Replace the email* (default) or *Add below*.
- **The result goes straight into the email.** Blocks appear in the editor as they arrive, each
  as soon as its JSON has closed and passes `EmailBlockSchema`, with the preview following.
  Subject and preview line suggestions appear as pick-one chips under their fields; picking one
  fills the field.
- While it writes, a bar above the new blocks shows two stages, *Reading your brief…* then
  *Writing the email…*, and **Stop**. When it finishes, the bar offers **Keep**, **Try again**
  and **Undo**. The whole result is one change in the editor's history: Undo (or ⌘Z) puts the
  email back exactly as it was before ✨.
- It never saves and never sends. AI has no path to the Send tab, the audience or the waves;
  Save and Send are the person's buttons, as for any edit.

**The call** (`lib/email-campaigns/ai-draft.ts`, server-only, behind a server action):

- **One shared Claude client** (`lib/ai/claude.ts`), lifted out of `lib/reviews/draft-reply.ts`
  with its credentials (`ANTHROPIC_API_KEY` locally, the Vercel OIDC federation rule in
  production, already configured for review replies). `draft-reply.ts` imports it; its behaviour
  is unchanged.
- **One set of brand facts** (`lib/ai/mpillow-facts.ts`), also lifted out of the review prompt,
  so both prompts state the same facts and only those.
- **Model, effort and limits from the AI writing settings** (slice 16, `readAiWritingSettings`):
  by default `claude-opus-5-5` with `output_config.effort: "medium"`, set explicitly. Server-side
  fallbacks on (`server-side-fallback-2026-07-01`, `fallbacks: "default"`), as `draft-reply.ts`
  does. With AI writing switched off in the settings, the button is not shown.
- **Structured output.** `output_config.format` is a Zod schema (`zodOutputFormat`) built from
  the editor's own block types (slice 03): `{ subjects: string[3], preheaders: string[2],
  blocks: (heading | text | buttons | divider | products)[], reviewerNotes: string[] }`. Text
  runs may be bold or italic and may hold the *first name* Variable (the other Variables are
  Staff's to place), but carry no `href`. A button's `target` is chosen from the fixed list (sign
  in · shop · book a fitting · customise · a picked product), and a products block may only name
  products Staff picked: never a URL the model writes. No images (Staff choose photos), no HTML,
  no footer, sender or unsubscribe: the renderer owns those. The content model is flat on
  purpose, because structured outputs take no recursive schema.
- The schema cannot enforce lengths, so code does: each block is re-parsed with the editor's own
  `EmailBlockSchema`, the same one a save uses. A draft that does not parse is retried once,
  then reported in the bar.
- **Streaming** with `client.beta.messages.stream(...)` and `finalMessage()` so a long answer
  never meets a function timeout.
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
- **No customer data ever reaches Claude.** Personalisation is the *first name* Variable,
  filled in at send.

**Limits and records:**

- Per Staff member, through `rateLimitExceeded` (`lib/rate-limit.ts`, counted in the database),
  at the limits in the AI writing settings (by default 10 in 10 minutes, 60 a day). Over it:
  *"You've drafted a lot today. Try again after 4:10 pm."*
- `campaigns` permission, checked first, like every campaign action.
- Each call is in the audit log (`email_campaign.ai_draft`): the campaign, the model that served
  it, input and output tokens, and whether it was kept. Never the brief's text. Slice 16's
  usage read-out counts these.
- With Claude not configured, the button is replaced by *"AI writing is off: set the Anthropic
  credentials in Vercel"* (the same check as `claudeConfigured()`).

**Marked until a person has read it:** blocks Claude wrote carry a small **"Drafted with AI"**
chip until Staff edit them or press *Keep*. The send checklist counts any left (slice 11;
advisory, not blocking).

## Acceptance criteria

- [ ] With a subject of 3 or more words, blocks start appearing in the editor within the time
  measured in the eval (target: the whole draft under 20 seconds).
- [ ] A draft never contains a price, a percentage, a discount or a code that Staff did not type,
  a banned clinical word, a review request, or a URL. The eval (below) holds this.
- [ ] One Undo after a draft (kept or not) restores the editor exactly as it was before ✨.
- [ ] ✨ never saves the campaign, never writes `content`, and never reaches a send action (tested
  on the server action: it returns blocks and nothing else).
- [ ] The model and effort sent are the ones in the AI writing settings; changing them there
  changes the next call.
- [ ] Past the per-10-minute limit, the next call is refused with the time it can run again.
- [ ] No request body contains a customer's name, email or order (tested on the built request).
- [ ] Review replies still draft exactly as before (their tests pass unchanged).

## Verify

```bash
npx vitest run lib/email-campaigns lib/ai lib/reviews "app/[lang]/settings/campaigns"
npm run typecheck && npm run lint
```

- Unit tests with a fake client: the request shape (model and effort from settings, fallbacks,
  format, no PII), the validators, retry on a bad block, refusal and max_tokens handling, the
  rate limit.
- **An eval before merge** (`scripts/eval-campaign-drafts.ts`, run by hand with a real key):
  25 briefs (seasonal, product launch, care tips, bring-them-back, a brief that tries to inject
  instructions, a brief asking for "20% off" that Staff did type, one that did not). Every
  output must pass the guardrail checks; the owner reads ten and marks each usable or not. It
  also settles the default effort, `medium` against `low` (PRD decision 10), and records the
  cost per draft for *Open* D.
