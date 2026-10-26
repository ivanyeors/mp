# 03 — The send flow: checklist, a real confirmation, progress, and what next

**Issue:** not filed
**Type:** AFK
**Status:** built
**Blocked by:** 01
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:email`, `ux`

## Goal

Sending a campaign reads like a short checklist and ends with a confirmation the owner actually
reads. The demo:

1. The Send card shows four ticks: *Saved*, *Test sent*, *Every check passes*, *62 can go today*.
2. *Check who it goes to* says "312 can get it; 62 go now, and the other 250 in later waves (about
   3 more days at 100 a day)".
3. *Send to 62 people* opens a dialog naming the subject, From, Reply-To, audience and count, with
   Cancel focused. On the first wave it also needs "I sent myself a test and it looked right"
   ticked.
4. The bar fills with *Sent 20 of 62* (announced once per batch), then a result: "Sent 62. Come
   back after 3:40 pm tomorrow for the next 100."

## What to build

In `campaign-editor.tsx`, with the logic in pure helpers so it can be tested:

- **Checklist** (`sendSteps`): saved; test sent (from this page, this visit); every check; room
  today. A step that is not done says why and what to do. The test step is advice, not a block.
- **Plan summary:** eligible, buyers first, who is left out and why, and how many go now versus
  later (`waitingSummary`).
- **Confirmation dialog** (`SendConfirmDialog`), replacing `window.confirm`:
  - "Send to N people?", then subject, From, Reply-To, audience and count;
  - "This can't be undone. Each person gets it once";
  - on the first wave, "Sending locks this email; to change it later, duplicate it", and the
    required checkbox;
  - Cancel has the focus; the button is "Send to N people".
- **Progress:** a labelled progress bar, *Sent X of N · failed · skipped*, Stop, and "keep this
  page open". One polite live announcement per batch. The page already warns before you leave
  mid-wave.
- **Result:** what happened, why it stopped, and what next (`nextStepAfterWave`): retry the
  failed ones, wait for room (with the time), or send the next wave.
- **Phone:** while a plan is ready or a wave runs, the main action (Send or Stop) also sits in
  `MobileStickyActionBar`.
- **Defaults:** the wave size starts at what today's room allows (at most 50 for a first wave).
  The input's maximum is the room left.

## Acceptance criteria

- [x] No `window.confirm` is left on the send path.
- [x] The dialog states the From and Reply-To from the server's readiness, never typed.
- [x] The first-wave checkbox is required; later waves do not show it.
- [x] Focus starts on Cancel; Escape closes it; nothing is sent until the button is pressed.
- [x] The progress bar has a label and a value; the live region updates once per batch.
- [x] The result's next step matches the state: failed sends, no room, or room left.
- [x] Usable at 375px wide: the action stays reachable at the bottom.

## Verify

```bash
npx vitest run "app/[lang]/settings/campaigns"
```

Then open a campaign at 375px and at desktop width and walk the demo with the console transport.
