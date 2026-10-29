# 12 — Sign-off: the owner builds a real EDM and checks it in every inbox

**Issue:** [#367](https://github.com/ivanyeors/mp/issues/367) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** HITL
**Status:** not started
**Blocked by:** 01–11, 13–17
**Labels:** `needs-triage`, `P2`, `area:admin`, `area:email`

## Goal

The owner, on production, makes a campaign the way the marketer will: from a Starter or ✨
Generate, with a hero image, a product block, two buttons and the customer's first name, in
English and in Chinese. It renders correctly in the inboxes customers use, in light and dark,
with no setting touched. Then a pilot wave goes out inside Resend's plan, and the AI's real cost
is measured (PRD *Open*, D).

## Steps

1. **Apply the migrations** from slices 03, 05 and 13 to production (05's makes the email
   renditions' table; no image can be placed without it). Confirm every existing campaign
   still opens with its words unchanged (the legacy plain-text path), and reads well in dark
   mode (slice 15).
2. **AI writing settings.** On Admin Panel → General → AI writing (slice 16), check the defaults
   (Opus 5.5, `medium` for drafts, `low` for quick actions, 10 in 10 minutes, 60 a day). The
   review-reply credentials already serve this (no new secret).
3. **Build the email.** On a phone and on a laptop:
   - start from *Product launch* by dragging it from the Starters tab, or ✨ Generate from a
     subject;
   - drag in a hero image from the Media Library, a product block and an image + text block;
   - drag *First name* into the subject and the first paragraph, and set its fallback;
   - Clear all and Undo (every field back on its placeholder, then back again); reorder by drag
     and by keyboard; Undo and Redo;
   - ✨ Translate to Chinese, read the 中文 version, change one line.
4. **Send a test** in each language to each of these, and check in light and dark:

   | Client | Check |
   |---|---|
   | Gmail web, Gmail iOS, Gmail Android | not clipped; images shown; columns stack on the phone |
   | Outlook for Windows (classic), new Outlook, Outlook.com | images shown (not WebP); buttons are buttons; columns hold |
   | Apple Mail macOS and iOS | dark mode keeps the logo, cut-out images and text readable |
   | Yahoo Mail | lands in the inbox |

   Each: *Show original* → SPF, DKIM and DMARC pass; Gmail's Unsubscribe works; every link opens;
   the first name shows (and the fallback, for a test address with no name).
5. **Pilot.** One wave of 25–50 to a Segment that includes Chinese-language customers, inside
   today's room. Wait 48 hours; read bounces, spam reports and sign-ins on the wave table.
6. **Cost.** Read the AI writing section's month-to-date use, and set a monthly spend limit in
   the Anthropic Console that suits it (*Open*, D).

## Done when

- [ ] Every row of the table above is ticked, in English and 中文, with a screenshot in this issue.
- [ ] The owner has drafted at least three emails with AI and kept at least two (the eval's bar,
  in real use), and translated at least one.
- [ ] The pilot's bounce and spam rates are under the pause lines (2%, 0.1%).
- [ ] The measured cost per draft is written in this issue, and *Open* D is closed in the PRD.
