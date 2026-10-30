# 11 — Content checks before send: links, images, size, words

**Issue:** [#366](https://github.com/ivanyeors/mp/issues/366) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** AFK
**Status:** done
**Blocked by:** 03, 05. Extends `PRD-campaign-send-flow`'s checklist. Its Variable and 中文 rows
join when slices 13 and 17 land.
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:email`

## Goal

A richer email has more ways to go wrong in an inbox. Before a wave, the Send checklist checks
the email itself, not just the sending setup, and says what to fix in words. The demo: a
campaign with an image missing its alt text and a link to `http://` shows two crosses under
*The email*, each naming the block, and *Send* stays disabled until both are fixed.

## What to build

A pure `campaignContentChecks(content, rendered)` in `lib/email-campaigns/`, run on save (as
warnings beside the block), in *Ready to send?*, and again before each wave. The checks:

| Check | Blocks the wave? | Why |
|---|---|---|
| Every link and button is a full `https://` address that answers (HEAD, then GET; 2xx or 3xx) | yes | a dead link in a sent email cannot be fixed |
| Every image has alt text | yes | screen readers, and images off by default in some clients |
| Every image is an email rendition at an absolute https URL (slice 05) | yes | classic Outlook shows no WebP |
| The rendered HTML is under 100 KB (advisory from 85 KB) | yes | Gmail clips messages over 102 KB, and the clip hides the unsubscribe link |
| No required field still empty, on its placeholder (slices 01, 08) | yes | a placeholder is never sent, so an empty headline would send as nothing |
| Every Variable has fallback words, and *Points balance* only while points are live (slice 13) | yes | "Hi ," is worse than no greeting |
| The 中文 version, if there is one, has every block translated and passes every check above (slice 17) | yes | a Chinese reader would get a half-English email |
| No banned clinical words (`checkBannedClinical`) | yes | the claim rules of the landing page apply to email too |
| Points only while points are live (`pointsCheck`, today's rule, over every block) | yes | |
| Every product is still Listed (slice 07) | yes | |
| Subject over 60 characters | advisory | phones cut it off |
| No preview line | advisory | the inbox shows the start of the email instead |
| An email with images but under 300 characters of words | advisory | the 60/40 image rule is folklore, but an image-only email says nothing with images off and is a spam signal |
| Blocks still marked *Drafted with AI* (slice 09) | advisory | a person should read every line |

- In the Send card's checklist (`sendSteps`, `lib/email-campaigns/send-flow.ts`) these join as
  one step, **The email**, listing each failure with the block it is in; clicking one scrolls the
  editor to that block and selects it.
- The link check runs on the server with a 5-second timeout per URL, at most 20 URLs, and caches
  answers for 10 minutes; links to our own site are checked against the route list instead of
  fetched.

## Acceptance criteria

- [ ] Each blocking check, failing, keeps *Send to N people* disabled and names the block.
- [ ] Advisory checks never block, and say *Recommended:*.
- [ ] The size check measures the HTML the sender actually sends, not the preview.
- [ ] The checks run again at the wave, so a link that died since the save is caught.
- [ ] A Starter left with an empty headline fails by name (*"Block 2, Heading: still empty"*).

## Verify

```bash
npx vitest run lib/email-campaigns "app/[lang]/settings/campaigns"
```

One test per check, passing and failing, against fixture content; the link check with a fake fetch.
