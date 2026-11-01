# 09 — The right version: fit checks and a Variable

**Issue:** not filed
**Type:** AFK
**Status:** **built** (2026-10-31)
**Blocked by:** 04, 05 (the columns the checks read)
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:email`

## Goal

Before a Wave, the page says where the email and its people do not match. The demo: *14 of 60
read Chinese and this email has no Chinese version* and *9 of 60 ship outside Singapore and this
email offers an in-store visit*.

## What to build

- **Fit checks**, computed over the Wave's planned people, shown in the send checklist beside the
  content checks (`lib/email-campaigns/content-checks.ts`). Advisory: each names a filter or an
  exclusion that would fix it, and none blocks the Wave.
  - Chinese readers (`locale = 'zh-CN'`) and no Chinese version.
  - Each Variable: how many will read its fallback words.
  - In-store wording (a link to `/appointments`, or the words *studio*, *in-store*, *fitting*,
    *re-adjustment*) to people whose *Ships to* is not Singapore or is unknown.
  - A products block showing a class some recipients already bought (*12 already own an
    Mbolster*).
  - People who bought in the last 14 days.
- **One Variable** in `lib/email-campaigns/variables.ts`, with fallback words:
  - **Your pillow**: the latest purchased pillow as the shop names it (*Premium Mpillow, size M*).
  - ~~**Points expire on**~~: dropped 2026-10-31. Points never expire (ADR 0030 decision 17), and
    `points_expires_on()` is gone (`20261031032017_points_never_expire.sql`).
- The sender reads the value per recipient in `readCampaignCandidates`; nothing new reaches
  the browser except the preview's sample.

## As built (2026-10-31)

- **`lib/email-campaigns/fit-checks.ts`**, pure: `campaignFitChecks(email, recipients, facts)`
  over `RecipientFacts` (locale, *Ships to*, what they bought, their latest purchase, and the
  Variables' details). Five checks, each advice (`advisory: true`), listed only when it has
  something to say, each naming the filter that fixes it as the Customers list's chip (*filter
  its Segment to “Ships to Singapore”, or leave out Segments of “Ships outside Singapore” and
  “Ships to an unknown country”*; for a campaign to everyone subscribed or the imported, *send
  it to a Segment of “Ships to Singapore”*):
  - `fit_chinese`: readers of Chinese and no 中文 version (*translate it*, or *Reads English*).
    It replaces the plan's language line in that case; with a version the line stays.
  - `fit_fallbacks`: per Variable used, in the email's order, who reads its fallback words.
    *Your pillow* names *Bought Premium Mpillow or Basic Mpillow*, *Points balance* *Has
    points*; a name has no filter, so the line asks Staff to check the words read well.
  - `fit_in_store`: a link to `/appointments` (in any language, a *Book a fitting* button
    included) or the words *studio*, *in-store*, *fitting*, *re-adjustment* (not
    *well-fitting*), in a block, the subject or the preview line, to people who ship outside
    Singapore or to an unknown country, counted apart. The issue names the first such block.
  - `fit_already_own`: an Mpillow or an Mbolster the email offers, once each, against the
    overview's `bought`; *Didn't buy …* fixes it. **Changed from the issue:** pillows and
    Mbolsters are not shop products (`isShopCatalogProduct`), so a products block cannot show
    one and the demo's *12 already own an Mbolster* comes from a *Customise an Mbolster* button
    (*Customise an Mpillow* counts either Tier). A products block's classes are still read
    (`productClasses`: `product_type`, its Variants' pillow products' `kind`), for the day one
    is listed. **Accessories are not checked**: one accessory is not another.
  - `fit_recent`: bought in the last 14 days. The filters count a last order in months, so the
    fix is *leave out a Segment of “Last order within a month”*, the nearest there is.
- **Where they run:** `planWave` reads the planned people's facts once
  (`readRecipientFacts`: `admin_customer_overview`'s `RECIPIENT_FACT_COLUMNS`, then their pillow
  lines) and each product's class, and returns them as `WavePlanResult.fit`. A read that fails is
  one line of advice (`fit_unread`), never a held wave. The editor lists them with the email's
  advice in *Ready to send?* and *The email* (a block's beside it), and the plan says *Recommended:
  N things about who it goes to*. They stay until the plan is checked again.
- **Your pillow** (`your_pillow`): the latest pillow purchase line (`customer_purchase_lines`,
  `product_type = 'pillow'`), as *Premium Mpillow, size M*; *Mpillow* when its Tier is not
  recorded; in the 中文 version *Premium Mpillow（尺寸 M）*, names in English letters. Fallback
  *your pillow* / *您的枕头*. A Variable's `value` now takes the language.
- **Where it is read (changed from the issue):** not in `readCampaignCandidates`, which reads
  the whole audience, but once per batch in `sendCampaignBatch` (`readLatestPillows`), and only
  for an email that says it (`usesYourPillow`), as the images and products are. A failed read
  stops the batch before anyone is claimed. The preview and a test use the sample customer's.
- The AI writer's and translator's prompts name `{your_pillow}` with the other Variables.

## Acceptance criteria

- [x] The checks are pure functions over a list of recipient facts, tested case by case
  (`lib/email-campaigns/__tests__/fit-checks.test.ts`; in the sender, `sender-fit.test.ts`).
- [x] No check reads a review, a rating or a note: `RECIPIENT_FACT_COLUMNS` and
  `PILLOW_LINE_COLUMNS` name none, and a row's other columns are dropped (tested).
