# 11 — Content checks before send: links, images, size, words

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** 03, 05. Extends `PRD-campaign-send-flow`'s checklist.
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
| The rendered HTML is under 90 KB | yes | Gmail clips messages over 102 KB, and the clip hides the unsubscribe link |
| No `[placeholder]` left from a Starter (slice 08) | yes | |
| No banned clinical words (`checkBannedClinical`) | yes | the claim rules of the landing page apply to email too |
| Points only while points are live (`pointsCheck`, today's rule, over every block) | yes | |
| Every product is still Listed (slice 07) | yes | |
| Subject over 60 characters | advisory | phones cut it off |
| No preview line | advisory | the inbox shows the start of the email instead |
| More image than words (rendered text under ~25% of the email) | advisory | image-only email reads as spam and fails with images off |
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

## Verify

```bash
npx vitest run lib/email-campaigns "app/[lang]/settings/campaigns"
```

One test per check, passing and failing, against fixture content; the link check with a fake fetch.
