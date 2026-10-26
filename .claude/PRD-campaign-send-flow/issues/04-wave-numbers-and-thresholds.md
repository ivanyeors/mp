# 04 — Each wave's numbers against the pause lines

**Issue:** not filed
**Type:** AFK
**Status:** built
**Blocked by:** —
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:email`

## Goal

The owner sees, for each wave, whether it was healthy, and why sending is paused when it is.
The pause rule judges the latest wave of any campaign email (2% bounces, 0.1% spam reports), but
the page showed only campaign totals. The demo: wave w1 went out on Mon, 50 sent, 1 bounced
(2.0%), 0 spam, so it is under the line and OK. Wave w2 went out on Wed, 100 sent, 3 bounced
(3.0%), so it is over the line and paused, with "I've looked into it: send anyway" beside it.

## What to build

- `planWave` and `checkCampaignReadiness` already read every wave. The campaign page also passes
  this campaign's own waves (`readWaveStats(...).own`) to the editor.
- `waveRows(stats)` (pure): each wave's label, last send, sent, bounced and spam as counts and
  percentages, failed, and a `state` of `ok`, `over_bounce` or `over_spam`, from
  `PAUSE_BOUNCE_RATE` and `PAUSE_COMPLAINT_RATE`.
- A **Waves** table in the Send card: the numbers, a state badge with words, and the lines in the
  heading's tip. On a phone it shows one wave per card.
- **Ramp advice:** after the first wave, until 48 hours have passed, "Wait until <time> before
  the next wave, and look at the bounces and spam reports first" (migration slice 09). This is
  advice, not a block.

## Acceptance criteria

- [x] Percentages round as the pause rule reads them (1 of 50 is 2.0% and not over; 3 of 100 is
  3.0% and over).
- [x] A paused wave says which line it crossed, in words as well as colour.
- [x] No wave yet: the table is not shown.
- [x] The 48-hour advice shows only after a first wave, and only within 48 hours.

## Verify

```bash
npx vitest run "app/[lang]/settings/campaigns"
```
