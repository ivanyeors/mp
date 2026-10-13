# 10 — Policy copy that reads its numbers from Costings and stops contradicting itself

**Type:** HITL (owner approves wording)
**Blocked by:** 02
**User stories:** 4
**Labels:** `content`, `needs-triage`, `P2`, `area:marketing`

## Goal

Every place on the website that quotes a service fee or the complimentary rule says the same thing, and the numbers in it come from **Costings → Service fees**. An operator who changes $30 to $35 never leaves the site advertising $30.

## What is wrong today

| Where | Says | Problem |
|---|---|---|
| `lib/i18n/messages/en-US.ts:270-274` `pricingNotes` | *"Customisation charge for every hour: $50"*, *"Readjustment charge: $30 within 60 days of purchase"* | Hourly billing, which the business no longer charges; and $30 *inside* the window, the opposite of the policy |
| `en-US.ts:313-315` `commitmentReadjustment*` | *"one-time complimentary visit within the initial 60 days post-purchase … $30 applies"* | Correct, but hard-coded `$30` and `60` |
| `en-US.ts:317-318` `commitmentWarrantyDescription` | *"(readjustment fees apply)"* | Fine |
| `zh-CN.ts:257-261, 298-302` | Mirrors both English versions, contradiction included | Same |
| `components/marketing/returns-warranty-page.tsx:47, 61, 355-375` | Basic *"$30 per adjustment"*; Premium *"1 free adjustment within 60 days, then $30"*; Mbolster unspecified | Hard-coded English, not i18n; Mbolster missing |
| `lib/product-slide-sections/resolve-slide-content.ts:227, 280` | Consumes the strings above | Must pass values through |

## Scope

- **Placeholders.** Replace the literals with placeholders: `{readjustmentFee}`, `{measurementPremium}`, `{measurementBasic}`, `{freeVisits}`, `{freeWindowDays}`. Resolve them server-side from `loadServicePrices` and `loadReadjustmentPolicy` wherever the strings render: the slide-in resolver and the warranty page. The warranty page is a server component, so read directly; keep it out of client bundles.
- **Proposed wording** (en-US; owner to approve, zh-CN to follow):
  - `pricingNotes[0]`: *"Measurement service: {measurementPremium} (Premium) · {measurementBasic} (Basic and Mbolster) — only when our team measures you"*
  - `pricingNotes[1]`: *"Re-adjustment: one free visit within {freeWindowDays} days of purchase (Premium), then {readjustmentFee} per visit"*
  - `pricingNotes[2]` (doorstep): unchanged. It is out of scope and stays copy.
  - Warranty page, Mbolster: *"{readjustmentFee} per re-adjustment at our service centre."*
  - Warranty page, all tiers: *"Sign in and pick your pillow when you book. Your order is your proof of purchase."* This replaces *"Proof of purchase must be presented"*, which slices 07–09 make obsolete for platform orders.
- **Re-check the trust strip** (`en-US.ts:250` *"60-day readjustment"*) once `{freeWindowDays}` is interpolated.
- **SEO and FAQ text** that quotes the policy: `lib/page-faq/defaults.ts:129, 276`, `lib/faq/defaults.ts:264`, `lib/seo/guides-content.ts:46`, `lib/seo/llms-index.ts:34`, `lib/reviews/draft-reply.ts:40, 71`. Update the facts. Interpolate where the string is rendered at request time, and leave a `// numbers mirror service_prices` comment where it is static (llms index, review-reply prompt).

## Acceptance criteria

- [ ] No `$30`, `$50` or `60 days` literal about these services remains in `en-US.ts`, `zh-CN.ts` or `returns-warranty-page.tsx` (grep test).
- [ ] Changing the re-adjustment fee to $35 in *Costings → Service fees* shows $35 on the premium slide-in, the warranty page and the FAQ on next render.
- [ ] en-US and zh-CN state the same rule: Premium gets one free visit within the window, everything else pays.
- [ ] The owner approves the final en-US and zh-CN wording in the PR (HITL).
