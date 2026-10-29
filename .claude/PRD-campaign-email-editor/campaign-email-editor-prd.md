# PRD — Campaign email editor: proper EDMs, built from blocks, drafted with Claude

**Status:** planned (2026-10-28); the owner's answers (2026-10-29) are folded in. The
decisions below are settled. Nothing built yet; slices are in `issues/`, tracked as
[#354](https://github.com/ivanyeors/mp/issues/354) and its sub-issues #355–#364, #366, #367
and, added with the answers, #370–#374. One question is still open (*Open*, D), and one
assumption needs the owner's confirmation (*Open*, E).
**Builds on:** `PRD-email-marketing` (Admin Panel → **Email campaigns**, #296),
`PRD-campaign-send-flow` (waves inside Resend's plan, the Send card), `PRD-media-asset-library`
(the Media Library and its picker), `PRD-page-builder-redesign` (the editor-with-live-preview
pattern), `PRD-email-templates` (the Email templates editor and its `{order_number}` values,
slice 14), and the review-reply drafts in `lib/reviews/draft-reply.ts` (Claude, already
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

**Owner answers (2026-10-29)**, to decisions 1–10 and questions A–D of the first draft:
> "Yeah, we should just build our own email editor, ( enhance on the current basic one we
> already have) don't duplicate the editors, components it and let it be used for other pages
> too. 2. Fixed and it must auto work for light/dark mode 3. Yes. Email builder need to have
> variables a user can drag and build into the email templates / edm 4. Yes 5. Yes enhance it
> for light/dark mode still 6. Agree 7. The clear all is to clear the "placeholder" as there is
> text auto generated. I'd rather you make then actually placeholder text instead of real text
> we delete 8. We need a drag drop block style for easy to use editor. Ready made Layouts
> should also follow the same so user can tweak them 9. AI button generated in the editor only
> all stays within editor user needs to press send 10. Make this a setting we can set in our
> general setting page. English first / but have a translate button to translate into Chinese
> with the same AI api. No <adv>. Not sure we will test later. Update first"

## The request, structured

| # | What was asked | What it means here | Slices |
|---|---|---|---|
| 1 | **Clear all** on New campaign, because it opens on words someone has to delete | New campaign opens **empty, with placeholder hints** in every field, never prefilled words. Clear all returns the email to those hints, with Undo. Small and independent: it ships first, on today's editor. | 01 |
| 2 | **Proper EDMs, not just text** | Images and a hero, image beside text, product cards, more than one button, dividers and spacing, all in the brand's layout, rendering right in Gmail, Outlook and Apple Mail, on a phone, and **in light and dark without anyone setting anything**. | 03, 05, 06, 07, 15 |
| 3 | **Better UX and UI for a marketer** | **Drag and drop**: blocks, Starters (the ready-made layouts) and **Variables** dragged from a palette into the email, then dragged to reorder. Formatting in place, the real email beside it (desktop, mobile, dark, the inbox row), and a stop before a broken email goes out. | 04, 08, 11, 13 |
| 4 | **AI that generates from the title** | ✨ *Generate* in the editor: Claude writes the email from its subject and an optional brief, straight into the blocks, as one undoable change. Then smaller helpers: subject ideas, rewrite a block. Nothing is saved or sent by AI. The model and limits are settings on General. | 09, 10, 16 |
| 5 | **English first, a button to translate into Chinese** | ✨ *Translate to Chinese* makes the campaign's 中文 version with the same AI: the same layout with its words translated, sent to customers who use the site in Chinese. | 17 |
| 6 | **One editor, used by other pages too** | The block editor is one shared component with no email code in it. Campaigns use it first; Email templates use its text input and Variables next; other pages can adopt it rather than grow their own. | 04, 13, 14 |

Two principles run through all of it:

- **Freedom in the words, the pictures and the order; none in the layout code.** The
  marketer chooses what to say and show; the platform guarantees how it renders, light and dark.
- **One editor, not one per page.** Today's campaign editor is enhanced, not replaced by a second
  page, and its editing parts become shared components any Admin Panel page can use.

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
- **It starts from one fixed email, typed in as real words.** *New campaign* opens on the
  Shopify customers' invitation, filled into the fields as if someone had written it; anything
  else means deleting it field by field (the owner's Clear all). Hint text belongs in a
  placeholder, which disappears when you type and is never sent.
- **Nobody can write fast.** There is no starting point but that invitation and *Duplicate*, and
  no help with the words. Claude already drafts Google review replies in this codebase; the
  campaign editor, where words matter most, has none.
- **It speaks one language.** The site is English and Chinese, and every Customer has a
  `locale` that the campaign sender already reads for its links; the email itself is English
  for everyone.
- **Every page grows its own editor.** Campaigns have a plain textarea, Email templates a form
  of fields with `{order_number}` typed by hand, Blogs a Markdown editor. A better editor built
  only for campaigns would be one more; the owner asked for one that other pages can use.
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
  plan takes the commerce ESPs' drag and drop and the newer tools' block flow together: blocks
  and Starters are dragged from a palette into a single column of typed blocks and dragged to
  reorder; `/` and `+` insert from the keyboard; presets sit under the selected block; the live
  preview sits beside it (decisions 1 and 8). There is no free canvas: a block drops between
  blocks, never at an x and y. It is also the shape of our own Page Builder, which marketers
  here already use.*

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
it fills the same schema (below). The editing parts (the block list, the palette, drag and drop,
history, the text input with Variables, the ✨ button) are built once, as shared components that
know nothing about email.*

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
  → *Never text over an image (decision 6). Every block's dark rules join the shell's one list,
  emitted for `prefers-color-scheme` and Outlook.com's `[data-ogsc]` as today; images with
  transparency sit on a light plate so dark ink never vanishes; a test fails any block class
  without a dark rule; the preview has a Dark toggle using the shell's own rules (decision 2,
  slice 15).*
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
  → *Variables are chips dragged into the text, each with fallback words set once per campaign
  (decision 3, slice 13).*
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

  → *✨ Generate is one button in the editor with a short brief. It writes the editor's own
  blocks into the email as they arrive, as one change that Undo removes, labelled *Drafted with
  AI* until a person keeps or edits it; it offers pick-one subject lines and is followed by
  labelled refine actions. Nothing leaves the editor: AI never saves or sends. Claude gets only
  the brand's facts, never customers, and code checks every draft for prices, offers, health
  claims and review requests (decisions 9 and 10).*

## Solution: what the marketer sees

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Email campaigns  December cooling launch [Draft]   ↶ ↷   Clear all   ✨ Generate   Save│
│ [ Write ] [ Send ]                            Language [ English | 中文 ]  ✨ Translate  │
├────────────────────┬─────────────────────────────────┬───────────────────────────────────┤
│ [Blocks|Starters|  │ From     Mpillow <hello@…>      │ Inbox ▸ Mpillow · Mei Ling, sleep…│
│  Variables]        │ Subject  {First name}, sleep… 41│         Our FibreCool covers are… │
│ ⠿ ▬ Heading        │ Preview  Our FibreCool cover… 61│ [Desktop|Mobile]   [Light|Dark]   │
│ ⠿ ¶ Text           │                                 │ ┌───────────────────────────────┐ │
│ ⠿ ⎕ Buttons        │ ⠿ ▣ Hero   [photo] Sleep cool…  │ │         mpillow logo          │ │
│ ⠿ ▨ Image          │ ⠿ ¶ Text   Hi {First name}, De… │ │ ┌───────────────────────────┐ │ │
│ ⠿ ▣ Hero           │   ┄┄┄┄┄┄ drop here ┄┄┄┄┄┄       │ │ │        hero photo         │ │ │
│ ⠿ ◧ Image + text   │ ⠿ ◧ Image + text [photo] | Why… │ │ └───────────────────────────┘ │ │
│ ⠿ ▤ Products       │ ⠿ ▤ Products  FibreCool · Neck… │ │ Sleep cooler this December    │ │
│ ⠿ ― Divider        │ ⠿ ⎕ Buttons  [Shop the covers]  │ │ [ Shop the covers ]           │ │
│ ⠿ ␣ Spacer         │    +  (or type / in a text line)│ │ footer · unsubscribe          │ │
└────────────────────┴─────────────────────────────────┴───────────────────────────────────┘
```

1. **Start.** *New campaign* opens empty: every field shows a grey placeholder (*e.g. Sleep
   cooler this December*) that disappears as you type and is never saved or sent. The email
   offers four starts: **Blank**, **✨ Write with AI**, a **Starter** (*Product launch*, *Care
   tips*, *Event*, *A short note*, the sign-in invitation, and the CRM's Playbooks), or **a past
   campaign** (slices 01, 08).
2. **Build by dragging.** The palette beside the email has three tabs. **Blocks**: drag one to
   where it goes, between two blocks. **Starters**: drag a whole ready-made layout in, and it
   lands as ordinary blocks to change, move or delete. **Variables**: drag *First name*, *Last
   name* or *Points balance* into any text, the subject or the preview line. Every drag has a
   keyboard way: `/` in a text line, `+` between blocks, `{` for a Variable (slices 04, 08, 13).
3. **Write.** Subject and preview line with live counts and the inbox row; text with bold,
   italic, links and bullets; images from the Media Library with alt text; presets for
   alignment, width and button style (slices 03–07).
4. **See.** The real email beside the list, re-rendered as they type: desktop or mobile, light
   or dark, English or 中文, with Variables shown as a sample customer or as their fallbacks.
   Click a block in the preview to select it (slice 04).
5. **Get help, in the editor.** ✨ *Generate* writes the whole email from the subject and a
   brief, straight into the blocks; ✨ on the subject suggests lines; ✨ on a block rewrites it
   shorter, warmer or clearer; ✨ *Translate* makes the 中文 version. Each is one change that
   Undo removes. None saves or sends (slices 09, 10, 17).
6. **Undo anything.** ⌘Z and ⇧⌘Z for every change, Clear all and AI included. Save is explicit
   (⌘S), leaving with unsaved changes asks first, and a crashed tab offers to restore them
   (slice 04).
7. **Check, test, send.** The *Send* tab is today's send flow, unchanged, with one more
   checklist step, **The email**: links answer, images have alt text and are Outlook-safe, the
   email is under Gmail's clip, no required field is still a placeholder, every Variable has a
   fallback, no banned claim, products still listed, and the 中文 version complete if there is
   one (slice 11). Only a person presses *Send*.

Behind the scenes, the owner sets the AI's model and limits once, on **Admin Panel → General →
AI writing** (slice 16).

## Decisions

Settled with the owner on 2026-10-29. Each names the slices it governs.

1. **One editor, ours, enhanced in place and shared.** Today's campaign editor
   (`campaign-editor.tsx`) grows into the block editor; there is no second campaign page. Its
   editing parts are built once in `components/block-editor/` and import nothing from
   `lib/email*`: the block list and palette, drag and drop, undo and redo, placeholders, the
   text input with Variables, and the ✨ button with its loading states. A page hands it its own
   block types and Variables. Campaigns use it first (slice 04); Email templates use its text
   input and Variables (slice 14); Blogs, Page Builder and others can move onto it later instead
   of growing editors of their own. Content is `{ v: 1, blocks: [...] }` JSON, validated by one
   Zod schema on every write, rendered only on the server by `lib/email/`. TipTap is the text
   input only; its JSON is never stored. No HTML block, ever. Recorded as ADR 0036 (slice 02).
2. **Brand-locked styling that is right in light and dark by itself.** Presets only
   (alignment, image width, button primary or secondary, spacer size); no font, colour or size
   pickers: the shell's design tokens (`lib/email/theme.ts`, mirroring `app/globals.css`) are
   the brand. There is no dark-mode setting for anyone to get wrong: every block's dark rules
   join the shell's one list, images with transparency sit on a light plate, and a test fails
   any block whose classes have no dark rule (slice 15).
3. **Products are priced by the shop at send; Variables are dragged in.** A product block stores
   ids; the price, photo and name are read when the email is rendered, from the Storefront
   product that Costings prices (ADR 0001). A started campaign's product choice is fixed; its
   prices follow the shop. An unlisted product fails the wave's checks by name. **Variables**
   are recipient details (*First name*, *Last name*, *Points balance* while points are live)
   that Staff drag from the palette into any text, the subject or the preview line. Each has
   fallback words, set once per campaign, used when a customer has none. Email templates'
   `{order_number}`-style values become the same draggable Variables (slices 13, 14).
4. **Save stays explicit,** with ⌘S, a leave-page guard and in-browser recovery of unsaved edits.
   Autosave would write an audit entry per pause; the audit log records each save today
   (`PRD-email-marketing`, *Who can use it*).
5. **Legacy campaigns keep their renderer, and get the light and dark work.** Campaigns written
   as plain text keep `body` and `renderComposedCampaignEmail`: their words, order and links do
   not change (their plain-text part is the same byte for byte), so a started campaign keeps
   sending what it started with. Their HTML gains the shell's light and dark improvements, as
   every email does (slice 15). An unsent legacy draft can be converted to blocks.
6. **No text on images.** A hero is the image, then its heading, line and button as real text.
   Text in or over an image is lost with images off, unreadable in some dark modes, and fragile
   in classic Outlook.
7. **Placeholders, not prefilled words.** An empty field shows grey hint text, which is never
   saved, tested or sent. *New campaign* opens empty instead of on the invitation, which becomes
   a Starter (one click away until slice 08). **Clear all** returns the email to its
   placeholders, keeps the audience and the greeting switch, and offers Undo in a toast rather
   than a dialog, because nothing is saved until Save (NN/g). Starters use placeholders the same
   way, and the send checks refuse an email with a required field still empty (slices 01, 08, 11).
8. **Drag-and-drop blocks; Starters are made of the same blocks.** A palette beside the email
   holds Blocks, Starters and Variables. Drag one to the spot it goes; drag a block to reorder;
   every drag has a keyboard way. A Starter (the owner's *ready-made layout*) is not a locked
   template: dropped into an email, or opened from the Start panel, it becomes ordinary blocks
   that can each be moved, changed or deleted. Starters live in code: reviewed in a pull
   request, rendered by the real renderer, tested against the schema. Staff-saved Starters are
   later (slices 04, 08).
9. **AI works inside the editor, and only there.** ✨ Generate, the refine actions and ✨
   Translate write into the editor, never anywhere else: each result arrives as one change,
   with *Keep*, *Try again* and *Undo* beside it. Nothing is saved until Staff press Save, and
   nothing is sent until they press Send; AI has no reach into the Send tab, the audience or the
   waves. Blocks it wrote are marked *Drafted with AI* until a person edits or keeps them, and
   the send checklist counts any left as an advisory (slices 09, 10, 17).
10. **The AI's settings live on Admin Panel → General.** A new **AI writing** section: on or off,
    the model (from a list in code), the effort for whole drafts and for quick actions, and the
    per-Staff limits, with a read-out of this month's use and its estimated cost. Defaults: Opus
    5.5, `medium` for drafts, `low` for quick actions, 10 in 10 minutes and 60 a day per Staff
    member. Every change is audit-logged. Review replies keep their own settings in code until
    someone moves them here (slice 16).
11. **English first; ✨ Translate makes the 中文 version.** A campaign is written in English. ✨
    *Translate to Chinese* fills its 中文 version from the English with the same AI settings:
    the same blocks, images, products, buttons and Variables, with the words translated, then
    edited like any words. Customers whose language is Chinese (`customers.locale = 'zh-CN'`,
    which the sender already reads) receive the 中文 version; everyone else receives English. A
    campaign without a 中文 version sends English to everyone, as today (slice 17).
12. **No `<ADV>` label.** Campaigns go only to Customers who agreed to them, so they are not the
    unsolicited email the Spam Control Act's label is for; they carry the unsubscribe link and
    our details anyway.

### AI guardrails (in code as well as in the prompt)

- Facts only from one shared `lib/ai/mpillow-facts.ts`, lifted out of the review-reply prompt so
  both say the same things.
- No price, percentage, discount, code, date, guarantee or offer unless Staff typed it word for
  word; prices come from product blocks, never from Claude.
- Comfort, fit and sleep, never health: no treat, cure, relieve, therapy, rehab, clinically,
  doctor-recommended (`checkBannedClinical`, the landing page's check), and the same words in
  Chinese for a translation (治疗, 治愈, 康复, 处方, 临床 and the rest, slice 17).
- Never a review or rating request; never Shopify or "our move"; no `Re:`/`Fwd:`, no all-caps
  subject, no false urgency; points only while points are live (`pointsCheck`).
- No URLs from Claude: button targets come from a fixed list; links are Staff's. A translation
  keeps every link, button target and Variable of the English, checked in code.
- The brief is data in tags, JSON-encoded; Claude has no tools. Every AI call is in the audit
  log with the serving model and token counts, never the brief's text.
- The model, effort and limits come from the AI writing settings (decision 10), read on the
  server at each call. A stored value that no longer parses uses its default; a failed read
  turns AI writing off for that call, so a read error never turns on what the owner turned off.

## Rules it keeps

Unchanged from `PRD-email-marketing` and `PRD-campaign-send-flow`; a change to any is a change
to those plans.

- Only `subscribed` Customers receive a campaign, checked in SQL at each send; suppression is
  shared; one ledger, `customer_campaign_sends`; campaign mail only through the campaign
  transport, with `List-Unsubscribe` and `List-Unsubscribe-Post`.
- The lock: once the first wave is planned, the content cannot change (the trigger now covers
  `content`, its 中文 version included); a changed email is a duplicate.
- Waves inside Resend's plan, the pause lines, the confirmation dialog: untouched.
- Never ask for a review in a campaign; aftercare messages are not campaigns.
- Nothing names Shopify or a move to customers (owner, 2026-10-21). No new work depends on
  Shopify (`CLAUDE.md`).
- The `campaigns` permission gates every campaign action, the AI ones included; the AI writing
  settings sit behind the General page's own permission.
- No `<ADV>` in subjects (decision 12).

## Not in this plan

- **Scheduling, automation and sending without the page open** (decided upstream).
- **Open and click tracking, revenue per campaign** (`PRD-email-marketing`, *Not in v1*).
- **An offer-code block.** A block that shows a real **Discount code** from Discounts, checked
  live at send, is the natural next block; it needs its own rules (which codes, expiry inside the
  wave window). Until then Claude never writes an offer, and Staff type one only in words.
- **Staff-saved Starters, synced sections, 3–4 columns, testimonials, video thumbnails.**
- **Moving Blogs, Page Builder or other pages onto the shared editor.** The components are built
  so they can (decision 1); each move is its own change, planned with that page.
- **Languages beyond English and Chinese, and translating from Chinese into English.**
- **A chat agent** that plans audiences and sends (Klaviyo Composer's shape). AI here writes
  words a person reviews; it never chooses an audience or starts a wave.
- **Images generated by AI.** Staff choose photos from the Media Library.
- **Review replies on the AI writing settings.** They keep their code settings (decision 10).

## Open: questions for the owner

- **D. AI spend.** About US$0.05–0.09 a draft (an estimate). The owner will test it: slice 16
  shows this month's use and estimated cost, and slice 12 measures real drafts, after which a
  monthly spend limit can be set in the Anthropic Console.
- **E. Who receives the 中文 version (assumed).** Customers whose `locale` is `zh-CN` (the
  language they use the site in, recorded at sign-up and import). If the owner would rather
  choose per campaign (send the 中文 version to everyone, or to nobody), slice 17 adds that
  switch.

A, B and C were answered on 2026-10-29: decisions 1–12 above, English first with a Translate
button, and no `<ADV>` label.

## Testing

- **Pure tests** (vitest): the content schema (limits, refusals of markup and unknown types),
  the renderer per block (snapshots, light and dark, plain-text part, size), legacy campaigns'
  words unchanged, the column primitive, renditions, the usage resolver, Starters, Variables
  and their fallbacks, content checks, the AI request shape and validators against a fake
  client, the rate limit, the AI settings' parsing and defaults, and translation (every link,
  target and Variable kept).
- **A boundary test:** nothing in `components/block-editor/` imports `lib/email*` or
  `lib/email-campaigns/*` (decision 1).
- **A dark-rule coverage test:** every `mp-*` class a block renders has a rule in the shell's
  dark list (decision 2).
- **SQL asserts:** the one-of check on `body`/`content`, the size check, the lock on `content`.
- **Component tests:** placeholders and Clear all with Undo; insert, drag from the palette, move
  and undo in the editor; dropping a Starter and a Variable; the TipTap → runs mapping with a
  paste fixture; the ✨ button's states.
- **An eval** for AI drafts and translations (slices 09, 17): 25 briefs and 10 translations,
  every output through the guardrail checks, ten of each read by the owner.
- **The owner's inbox matrix** (slice 12): Gmail web, iOS and Android; Outlook classic, new and
  .com; Apple Mail macOS and iOS; Yahoo; light and dark; English and 中文.

## Slices

See [`issues/README.md`](issues/README.md): seventeen vertical slices, 01 shippable now.
