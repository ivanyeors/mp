# PRD — Campaign email editor: proper EDMs, built from blocks, drafted with Claude

**Status:** planned (2026-10-28). Nothing built yet; slices in `issues/`, tracked as
[#354](https://github.com/ivanyeors/mp/issues/354) and its sub-issues #355–#364, #366, #367. Owner decisions 1–10
below are recommendations awaiting the owner's yes; the questions under *Open* need answers
before the slices that name them.
**Builds on:** `PRD-email-marketing` (Admin Panel → **Email campaigns**, #296),
`PRD-campaign-send-flow` (waves inside Resend's plan, the Send card), `PRD-media-asset-library`
(the Media Library and its picker), `PRD-page-builder-redesign` (the editor-with-live-preview
pattern), and the review-reply drafts in `lib/reviews/draft-reply.ts` (Claude, already
configured in production). It changes how a campaign is *written*. It adds no second sender, no
second ledger, no new permission and no new secret.
**Owner request (2026-10-28):**
> "have a clear all button in the new campaign page. we also need to find a way or rethink and
> redesign our email campaign editor to enable us or a marketing person to be able to send
> proper EDMs with all the full features of allowing them to send proper EDMs. It's just text.
> But let's enhance the feature we can use as a marketer sending our EDMs, ux, ui, and it should
> also be "AI" enabled, linked our claude's API to "generate" content based on the title (have a
> cool AI generate button) in the text area? structure my thoughts, think and research online,
> and find the best design approach to this. create prd and issues before building"

## The request, structured

| # | What was asked | What it means here | Slices |
|---|---|---|---|
| 1 | **Clear all** on New campaign | One button that empties the email, with Undo. Small and independent: it can ship first, on today's editor. | 01 |
| 2 | **Proper EDMs, not just text** | Images and a hero, image beside text, product cards, more than one button, dividers and spacing, all in the brand's layout, rendering right in Gmail, Outlook and Apple Mail, on a phone and in dark mode. | 03, 05, 06, 07 |
| 3 | **Better UX and UI for a marketer** | Write like a document (formatting, `/` to insert, drag to reorder), see the real email beside it (desktop, mobile, dark, the inbox row), start from something (Starters, past campaigns), and be stopped before a broken email goes out. | 04, 08, 11 |
| 4 | **AI that generates from the title** | ✨ *Generate draft*: Claude writes the email from its subject and an optional brief, into the same blocks the marketer edits. Then smaller helpers: subject ideas, rewrite a block. Always reviewed by a person, never sent by AI, never inventing offers or health claims. | 09, 10 |

One principle runs through all four: **freedom in the words, the pictures and the order;
none in the layout code.** The marketer chooses what to say and show; the platform guarantees
how it renders.

## Problem statement

The Email campaigns page sends safely (consent, ledger, waves inside Resend's plan) but writes
poorly. A campaign is a subject, a preview line, a plain-text box and one button
(`app/[lang]/settings/campaigns/campaign-editor.tsx`, `lib/email/campaigns.ts`):

- **It can't show anything.** No images, no hero, no product, no second button, no columns. A
  launch or a seasonal promotion reads like a support reply. Every e-commerce ESP's block set
  starts with exactly what is missing (Research, *What a proper EDM holds*).
- **It is written in a syntax.** Paragraphs are blank lines, bullets are `- `, headings are
  `## `, links are bare `https://` addresses shown as `mpillow.com/…`. There is no bold, no link
  text, no way to see structure while typing except a preview that re-renders after a pause.
- **It starts from one fixed email.** *New campaign* opens on the Shopify customers'
  invitation; anything else means deleting it field by field (the owner's Clear all).
- **Nobody can write fast.** There is no starting point but that invitation and *Duplicate*, and
  no help with the words. Claude already drafts Google review replies in this codebase; the
  campaign editor, where words matter most, has none.
- **Its safety is tuned for plain text.** The plain-text design was deliberate: "Staff type plain
  text, never HTML, so nothing they type becomes markup" (`PRD-email-marketing`). Any redesign has
  to keep that guarantee while adding images, links and layout.

## Research

What leading tools and email-engineering sources say, and what this plan takes from each. Two
research passes, 2026-10-28; links are to the sources.

### How editors are built

- **Two shapes.** Commerce ESPs still ship drag-and-drop canvases: Mailchimp's *new* builder
  is drag-and-drop with per-block styling, undo and pre-send checks
  ([Mailchimp](https://mailchimp.com/help/compare-mailchimps-email-builders/)); Klaviyo has
  sections, 1–4 columns and "universal content"
  ([Klaviyo](https://help.klaviyo.com/hc/en-us/articles/4407911841435-Guide-to-the-email-template-editor));
  Customer.io's Design Studio is a canvas
  ([docs](https://docs.customer.io/messaging/design-studio/emails/visual-editor)). Newer tools
  converge on a **vertical flow of typed blocks**, inserted with `/` or `+`, with a side
  inspector and global styles: Resend Broadcasts ("inspired by Notion… slash commands",
  [Resend](https://resend.com/blog/send-marketing-emails-with-resend-broadcasts)), Kit
  ([release](https://convertkit.nextplease.io/item/15277)), beehiiv, and Loops' 2025 redesign
  ([changelog](https://loops.so/changelog/editor-redesign)). MailerLite added a Notion-style
  editor in 2026 but still sends layout-heavy campaigns to drag-and-drop
  ([MailerLite](https://www.mailerlite.com/blog/new-email-editors)).
- **No study says which is faster.** What is documented is the cost of free canvases:
  builders that "export bloated HTML" contribute to Gmail clipping
  ([The Spot](http://thespotforpardot.com/2026/09/23/the-hidden-problems-with-html-email-builders-and-how-we-solved-them-for-account-engagement/)),
  and free layout produces designs faster than a team can review them
  ([Volanea](https://www.volanea.com/glossary/editor-drag-drop)).

  → *A canvas's one advantage, free layout, is exactly what a locked brand switches off. This
  plan uses the block flow: typed blocks, `/` and `+` to insert, drag to reorder, presets in an
  inspector, and the live preview beside it (decision 1). It is also the shape of our own Page
  Builder, which marketers here already use.*

### Build or embed

| Option | Why not, or why |
|---|---|
| Unlayer, Beefree (hosted builders) | The editor loads from their CDN; the design is their proprietary JSON; HTML export runs in the browser or a paid API ($250–$3,000 a month for white-label and server export) ([Unlayer](https://unlayer.com/pricing), [Beefree](https://developers.beefree.io/pricing-plans)). Our layout, dark mode and footer would live in someone else's product. |
| Easy Email (MJML) | Peer-depends on React 18; its open-source tier marks React 19 unsupported ([repo](https://github.com/zalify/easy-email-editor)). We run React 19. |
| GrapesJS + MJML | A web-page-builder UX, ~600 KB of JS, MJML's own blocks ([repo](https://github.com/GrapesJS/mjml)). |
| `@react-email/editor` | MIT and promising, but 1.0 shipped in April 2026 with 119 releases since, and export needs a live editor instance, so it would be a second renderer beside ours ([docs](https://react.email/docs/editor/api-reference/compose-react-email)). Worth a look again in 2027. |
| **Our own block list + our renderer + TipTap inside text blocks** | **Chosen.** The shell in `lib/email/base.ts` and the components in `lib/email/components.ts` already solve Outlook, dark mode (including Outlook.com's `[data-ogsc]`) and the unsubscribe footer. TipTap 3 is MIT and renders to anything we map it to ([static renderer](https://tiptap.dev/docs/editor/api/utilities/static-renderer)); we use it only as the text input, with a five-mark schema. `@dnd-kit/react` is already a dependency. |

→ *Decision 1. The content is versioned JSON of typed blocks, validated by one schema and
rendered only on the server by our own components. It is also what lets Claude write an email:
it fills the same schema (below).*

### What a proper EDM holds

Klaviyo's blocks: text, image, split, button, header bar, divider, social, spacer, product,
coupon, table, HTML, review quote, video, 1–4 columns
([Klaviyo](https://help.klaviyo.com/hc/en-us/articles/4407911841435-Guide-to-the-email-template-editor)).
Mailchimp adds product (up to 4), discount code and survey
([Mailchimp](https://mailchimp.com/help/compare-mailchimps-email-builders/)). E-commerce layout
guidance: product grids two-up on desktop and one-up on mobile, 4–6 products at most, one main
call to action ([Excelohunt](https://excelohunt-site.pages.dev/blog/email-design-best-practices-ecommerce)).

→ *v1 blocks: heading, text, buttons (one or two), image, hero, image + text, products (up to
three), divider, spacer. The logo header and the footer (socials, unsubscribe) stay locked in the
shell. Later: offer code, testimonial, 3–4 columns, saved sections. Never: an HTML block.*

### What the renderer must respect

- **Gmail clips over 102 KB**, and the clip hides the footer's unsubscribe link; hosted images
  count only as their URL ([Suped](https://www.suped.com/knowledge/email-deliverability/troubleshooting/why-is-gmail-not-clipping-my-emails-over-102kb)).
  → *Warn at 85 KB, refuse at 100 KB, measured on the HTML actually sent (slice 11).*
- **Columns must stack without media queries**: Gmail's apps ignore them for non-Google
  accounts ([caniemail](https://www.caniemail.com/features/css-at-media/)), so use hybrid
  fluid columns with MSO ghost tables for classic Outlook
  ([Litmus](https://www.litmus.com/blog/understanding-responsive-and-hybrid-email-design/)).
  Classic Outlook is supported until at least 2029
  ([Petri](https://petri.com/microsoft-classic-outlook-for-windows-2029/)).
  → *One column primitive, used by image + text, two buttons and the product grid (slice 06).*
- **Images:** absolute URLs, a 2× source shown at its `width`, a 600px column
  ([Email on Acid](https://www.emailonacid.com/blog/article/email-development/mobile-optimization-retina-images-in-email)).
  Our Media Library stores **WebP** masters (`lib/media-assets/optimize.ts`); classic Outlook
  shows no WebP, and Gmail converts it ([caniemail](https://www.caniemail.com/features/image-webp/)).
  → *Each placed image gets one email rendition, 1,200px JPEG or PNG (slice 05).*
- **Alt text on every image**, empty alt and `role="presentation"` for decorative ones; real
  headings in order; descriptive link text; 16px body text
  ([Litmus](https://www.litmus.com/blog/ultimate-guide-accessible-emails)). The 60/40
  image-to-text rule is folklore past ~500 characters of text
  ([Email on Acid](https://www.emailonacid.com/blog/article/email-development/does_text_to_image_ratio_affect_deliverability/)),
  but an image-only email is still a risk.
  → *Alt text is required; an image-heavy email with almost no words gets an advisory.*
- **Dark mode** falls into no-change, partial-invert and full-invert clients; Gmail iOS fully
  inverts and cannot be controlled ([Litmus](https://www.litmus.com/blog/the-ultimate-guide-to-dark-mode-for-email-marketers)).
  → *Never text over an image (decision 6); the preview has a Dark toggle using the shell's own
  dark rules.*
- **Market share, Sept 2026:** Apple 76.6%, Gmail 16.1%, Outlook desktop 3.5% of opens
  ([Litmus](https://www.litmus.com/email-client-market-share)).
  → *Test in all three (slice 12); Apple Mail is where most customers read.*

### Marketer UX worth copying

- **See it as the customer will:** desktop and mobile preview
  ([Mailchimp](https://mailchimp.com/help/compare-mailchimps-email-builders/)), a dark preview
  ([React Email](https://react.email/docs/changelog)), and the **inbox row**: Gmail on a phone
  cuts the subject near 35 characters and the preview near 45
  ([Courier](https://www.courier.com/tools/mobile-inbox-preview-generator)); aim for 40–90
  characters of preview text ([Knak](https://knak.com/blog/email-preview-text/)); live subject
  feedback ([Mailchimp](https://mailchimp.com/features/subject-line-helper)).
- **Start from something:** template galleries (Mailchimp 250+), reusable sections (Litmus
  partials, Klaviyo universal content).
- **Undo over confirm** for anything reversible; confirm only what can't be undone, and name the
  consequence ([NN/g](https://www.nngroup.com/articles/confirmation-dialog/)). Customer.io added
  "Reset message content" in April 2026
  ([Customer.io](https://docs.customer.io/release-notes/2026-04-23-reset-email-content/)).
  → *Clear all is an Undo toast, not a dialog (decision 7).*
- **Merge fields need a fallback**; a broken "Hi ," is worse than none
  ([Drip](https://www.drip.com/email-marketing-glossary/merge-tags)).
- **Check before send:** links, images, size ([Mailchimp](https://mailchimp.com/help/preview-and-test-your-email-campaign/),
  [Resend](https://resend.com/docs/dashboard/broadcasts/editor)).

### How email tools ship AI writing

| Tool | Where | What it returns |
|---|---|---|
| Klaviyo | in the Subject field; Composer (beta) is a chat agent | up to 3 subject lines; Composer: subject, copy, design and audience, staged for review ([help](https://help.klaviyo.com/hc/en-us/articles/5051278887835), [Composer](https://klaviyo.com/solutions/ai/ai-email-copy-generator)) |
| Mailchimp | *Write with AI* on Paragraph, Heading and Button blocks | suggestions to add; *Edit with AI*: tone, shorten, lengthen, fix ([help](https://mailchimp.com/help/use-inline-content-generation)) |
| beehiiv | `/AI` | a preview with Insert, Discard, Regenerate ([help](https://www.beehiiv.com/support/article/15882638374551-Using-AI-features-in-the-beehiiv-post-editor.md)) |
| Kit | sparkle by the subject | 5 subject lines from the body ([help](https://help.kit.com/en/articles/10627360-how-to-use-kit-s-ai-subject-line-generator)) |
| HubSpot | *Generate* in Subject and Preview text | 2 suggestions, *More like this*, at most 5 regenerations ([KB](https://knowledge.hubspot.com/marketing-email/generate-subject-lines-and-preview-text-for-marketing-emails)) |

- **Patterns:** subject lines are the most common AI surface; body copy comes block by block;
  Klaviyo retired one-shot whole-email drafting for an agent that stages work for review. Brand
  voice is set once (Klaviyo's Voice tab, [help](https://help.klaviyo.com/hc/en-us/articles/35873068949147)).
- **Design guidance:** label AI content and let people revert it
  ([Carbon for AI](https://carbondesignsystem.com/guidelines/carbon-for-ai/)); make it easy to
  dismiss, edit and recover (Microsoft HAX G8, G9, [HAX](https://www.microsoft.com/en-us/haxtoolkit/library/));
  show two loading stages, processing then generation, with words not just a spinner
  ([Cloudscape](https://cloudscape.design/patterns/genai/genai-loading-states/)); refine controls
  need labels ("Shorter", "Warmer"), not bare icons
  ([NN/g](https://www.nngroup.com/articles/prompt-controls-genai/)).
- **Claude:** structured outputs return typed JSON from a Zod schema (`zodOutputFormat`,
  `output_config.format`); no `minLength`/`maxLength` and no recursive schemas, so code checks
  lengths; output is not guaranteed on `refusal` or `max_tokens`
  ([docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)). Streaming
  sends the JSON as it is written ([SDK example](https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/examples/structured-outputs-streaming.ts)).
  To limit invented facts, restrict Claude to the facts given
  ([docs](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations));
  treat pasted text as data ([docs](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks)).
  Opus 5.5 is $4 / $20 per million tokens in and out
  ([pricing](https://platform.claude.com/docs/en/about-claude/pricing)): an estimated
  US$0.05–0.09 per draft (3k in, 2–4k out with thinking; to be measured).
- **Claims:** Singapore's advertising code bars misleading by exaggeration or omission, prices
  included ([ASAS](https://asaswebsite.azurewebsites.net/Resources/CPFTA)); HSA regulates by
  intended purpose, and "relieve or manage health conditions" is device language
  ([HSA](https://www.hsa.gov.sg/announcements/how-medical-devices-are-regulated-by-hsa/)).

  → *✨ Generate draft is one button with a short brief, returns the editor's own blocks into a
  review panel (never straight into the email), offers pick-one subject lines, and is followed by
  labelled refine actions. Claude gets only the brand's facts, never customers, and code checks
  every draft for prices, offers, health claims and review requests (decisions 9 and 10).*

## Solution: what the marketer sees

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ ← Email campaigns   December cooling launch  [Draft]   ↶ ↷   Clear all  ✨ Generate  Save │
│  [ Write ]  [ Send ]                                                               │
├──────────────────────────────────────────┬────────────────────────────────────────┤
│ From  Mpillow <hello@hello.mpillow.com>  │  Inbox  ▸ Mpillow · Sleep cooler this… │
│ Subject  Sleep cooler this December  42  │         Our FibreCool covers are back… │
│ Preview line  Our FibreCool covers…  61  │  [Desktop|Mobile]   [Light|Dark]       │
│ ☑ Start with "Hi first name,"            │ ┌────────────────────────────────────┐ │
│                                          │ │            mpillow logo            │ │
│ ⠿ ▣ Hero      [photo] Sleep cooler…      │ │  ┌──────────────────────────────┐  │ │
│ ⠿ ¶ Text      Hi there, December in…     │ │  │          hero photo          │  │ │
│        +                                 │ │  └──────────────────────────────┘  │ │
│ ⠿ ◧ Image + text  [photo] | Why it…      │ │  Sleep cooler this December        │ │
│ ⠿ ▤ Products  FibreCool · Neck Support   │ │  …                                 │ │
│ ⠿ ⎕ Buttons   [Shop the covers]          │ │  [ Shop the covers ]               │ │
│        +   (or type / in a text line)    │ │  footer · unsubscribe              │ │
└──────────────────────────────────────────┴────────────────────────────────────────┘
```

1. **Start.** *New campaign* asks how to begin: **Blank**, **✨ Write with AI**, a **Starter**
   (*Product launch*, *Care tips*, *Event*, *A short note*, the sign-in invitation, and later the
   CRM's Playbooks), or **a past campaign** (slice 08).
2. **Write.** Subject and preview line with live counts and the inbox row. Blocks in a list:
   `/` or `+` to insert, a handle to drag, a menu to move, duplicate or delete; text with bold,
   italic, links, bullets and *first name*; images from the Media Library with alt text; presets
   for alignment, width and button style (slices 03–07).
3. **See.** The real email beside the list, re-rendered as they type: desktop or mobile, light or
   dark. Click a block in the preview to edit it (slice 04).
4. **Get help.** ✨ *Generate draft* writes the whole email from the subject and a brief; ✨ on the
   subject suggests lines; ✨ on a block rewrites it shorter, warmer or clearer. Every suggestion
   is shown before it changes anything, and every change can be undone (slices 09, 10).
5. **Undo anything.** ⌘Z and ⇧⌘Z for every change, Clear all included. Save is explicit (⌘S),
   leaving with unsaved changes asks first, and a crashed tab offers to restore them (slice 04).
6. **Check, test, send.** The *Send* tab is today's send flow, unchanged, with one more
   checklist step, **The email**: links answer, images have alt text and are Outlook-safe, the
   email is under Gmail's clip, no Starter placeholder is left, no banned claim, products still
   listed (slice 11).

## Decisions

Recommendations; the owner confirms or changes each before its slices start.

1. **Build our own block editor; embed nobody's.** Content is `{ v: 1, blocks: [...] }` JSON,
   validated by one Zod schema on every write, rendered only on the server by `lib/email/`.
   TipTap is the input for text blocks only; its JSON is never stored. No HTML block, ever.
   Recorded as ADR 0036 (slice 02).
2. **Brand-locked styling.** Presets only (alignment, image width, button primary or secondary,
   spacer size). No font, colour or size pickers: the shell's design tokens
   (`lib/email/theme.ts`, mirroring `app/globals.css`) are the brand.
3. **Products are priced by the shop at send.** A product block stores ids; the price, photo and
   name are read when the email is rendered, from the Storefront product that Costings prices
   (ADR 0001). A started campaign's product choice is fixed; its prices follow the shop, as an
   order email's data does. An unlisted product fails the wave's checks by name.
4. **Save stays explicit,** with ⌘S, a leave-page guard and in-browser recovery of unsaved edits.
   Autosave would write an audit entry per pause; the audit log records each save today
   (`PRD-email-marketing`, *Who can use it*). Revisit if the marketer misses it.
5. **Legacy campaigns keep their renderer.** Campaigns written as plain text keep `body` and
   render through `renderComposedCampaignEmail` byte for byte; a started campaign must keep
   sending the email it started with. An unsent legacy draft can be converted to blocks.
6. **No text on images.** A hero is the image, then its heading, line and button as real text.
   Text in or over an image is lost with images off, unreadable in some dark modes, and fragile
   in classic Outlook.
7. **Clear all is Undo, not a dialog, and keeps the audience.** It clears what the email says
   (name, subject, preview line, blocks, button) and keeps who it goes to and the greeting
   switch. Nothing is saved until Save, so an Undo toast is enough (NN/g).
8. **Starters live in code,** like Email templates' layouts: reviewed in a pull request, rendered
   by the real renderer, tested against the schema. Staff-saved templates and reusable sections
   are later.
9. **AI drafts land in a review panel, not in the email.** ✨ *Generate draft* needs a subject
   of 3 or more words; it shows the draft block by block as it arrives, with pick-one subject
   and preview lines, then **Use this draft** (undoable), **Try again** or **Discard**. Blocks
   from a draft are marked *Drafted with AI* until a person edits or confirms them; the send
   checklist counts them as an advisory.
10. **Claude Opus 5.5, effort `medium`, server-side fallbacks on, as review replies use;**
    10 drafts per 10 minutes and 60 a day per Staff member; `low` effort for refine actions. An
    eval on 25 briefs (slice 09) confirms or lowers the effort before merge. Claude receives the
    brand facts, the subject, the brief and picked product names, **never a customer**.

### AI guardrails (decision 10, in code as well as in the prompt)

- Facts only from one shared `lib/ai/mpillow-facts.ts`, lifted out of the review-reply prompt so
  both say the same things.
- No price, percentage, discount, code, date, guarantee or offer unless Staff typed it word for
  word; prices come from product blocks, never from Claude.
- Comfort, fit and sleep, never health: no treat, cure, relieve, therapy, rehab, clinically,
  doctor-recommended (`checkBannedClinical`, the landing page's check).
- Never a review or rating request; never Shopify or "our move"; no `Re:`/`Fwd:`, no all-caps
  subject, no false urgency; points only while points are live (`pointsCheck`).
- No URLs from Claude: button targets come from a fixed list; links are Staff's.
- The brief is data in tags, JSON-encoded; Claude has no tools. Every draft is in the audit log
  with the serving model and token counts, never the brief's text.

## Rules it keeps

Unchanged from `PRD-email-marketing` and `PRD-campaign-send-flow`; a change to any is a change
to those plans.

- Only `subscribed` Customers receive a campaign, checked in SQL at each send; suppression is
  shared; one ledger, `customer_campaign_sends`; campaign mail only through the campaign
  transport, with `List-Unsubscribe` and `List-Unsubscribe-Post`.
- The lock: once the first wave is planned, the content cannot change (the trigger now covers
  `content`); a changed email is a duplicate.
- Waves inside Resend's plan, the pause lines, the confirmation dialog: untouched.
- Never ask for a review in a campaign; aftercare messages are not campaigns.
- Nothing names Shopify or a move to customers (owner, 2026-10-21). No new work depends on
  Shopify (`CLAUDE.md`).
- The `campaigns` permission gates every action, the AI ones included.

## Not in this plan

- **Scheduling, automation and sending without the page open** (decided upstream).
- **Open and click tracking, revenue per campaign** (`PRD-email-marketing`, *Not in v1*).
- **An offer-code block.** A block that shows a real **Discount code** from Discounts, checked
  live at send, is the natural next block; it needs its own rules (which codes, expiry inside the
  wave window). Until then Claude never writes an offer, and Staff type one only in words.
- **Staff-saved templates, synced sections, 3–4 columns, testimonials, video thumbnails.**
- **Chinese campaigns.** v1 writes and drafts English only (*Open*, B).
- **A chat agent** that plans audiences and sends (Klaviyo Composer's shape). AI here writes
  words a person reviews; it never chooses an audience or starts a wave.
- **Images generated by AI.** Staff choose photos from the Media Library.

## Open: questions for the owner

- **A. Decisions 1–10.** Confirm, or say which to change.
- **B. English only for v1?** The site is bilingual; campaigns and AI drafts would be English.
- **C. The Spam Control Act.** It governs *unsolicited* bulk commercial email (subject `<ADV>`
  label, unsubscribe, sender details) ([IMDA](https://imda.gov.sg/infocomm-regulation-and-guides/unsolicited-communications/best-practices-for-organisations)).
  Campaigns go only to Customers who agreed, so they are not unsolicited, and they carry the
  unsubscribe link and our details anyway. Confirm no `<ADV>` label is wanted.
- **D. AI spend.** About US$0.05–0.09 a draft (estimate; slice 09 measures it). Set a monthly
  spend limit in the Anthropic Console that suits you.

## Testing

- **Pure tests** (vitest): the content schema (limits, refusals of markup and unknown types),
  the renderer per block (snapshots, light and dark, plain-text part, size), legacy campaigns'
  HTML unchanged, the column primitive, renditions, the usage resolver, Starters, content
  checks, the AI request shape and validators against a fake client, the rate limit.
- **SQL asserts:** the one-of check on `body`/`content`, the size check, the lock on `content`.
- **Component tests:** Clear all and Undo, insert / move / undo in the editor, the TipTap → runs
  mapping with a paste fixture, the Generate panel's states.
- **An eval** for AI drafts (slice 09): 25 briefs, every output through the guardrail checks,
  ten read by the owner.
- **The owner's inbox matrix** (slice 12): Gmail web, iOS and Android; Outlook classic, new and
  .com; Apple Mail macOS and iOS; Yahoo; light and dark.

## Slices

See [`issues/README.md`](issues/README.md): twelve vertical slices, 01 shippable now.
