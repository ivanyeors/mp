# 12 — Sign-off: the owner builds a real EDM and checks it in every inbox

**Issue:** [#367](https://github.com/ivanyeors/mp/issues/367) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** HITL
**Status:** not started
**Blocked by:** 01–11
**Labels:** `needs-triage`, `P2`, `area:admin`, `area:email`

## Goal

The owner, on production, makes a campaign the way the marketer will: from a Starter or ✨
Generate draft, with a hero image, a product block and two buttons. It renders correctly in the
inboxes customers use, in light and dark. Then a pilot wave goes out inside Resend's plan.

## Steps

1. **Apply the migration** from slice 03 to production. Confirm every existing campaign still
   opens and its preview is unchanged (the legacy plain-text path).
2. **Claude in production.** The review-reply credentials already serve this (no new secret).
   Set a monthly spend limit in the Anthropic Console if there is none.
3. **Build the email.** On a phone and on a laptop:
   - Start from *Product launch*, or ✨ Generate draft from a subject;
   - add a hero image from the Media Library, a product block, and an image + text block;
   - Clear all, Undo; reorder by drag and by keyboard; Undo and Redo.
4. **Send a test** to each of these, and check in light and dark:

   | Client | Check |
   |---|---|
   | Gmail web, Gmail iOS, Gmail Android | not clipped; images shown; columns stack on the phone |
   | Outlook for Windows (classic), new Outlook, Outlook.com | images shown (not WebP); buttons are buttons; columns hold |
   | Apple Mail macOS and iOS | dark mode keeps the logo and text readable |
   | Yahoo Mail | lands in the inbox |

   Each: *Show original* → SPF, DKIM and DMARC pass; Gmail's Unsubscribe works; every link opens.
5. **Pilot.** One wave of 25–50 to a Segment, inside today's room. Wait 48 hours; read bounces,
   spam reports and sign-ins on the wave table.

## Done when

- [ ] Every row of the table above is ticked, with a screenshot in this issue.
- [ ] The owner has drafted at least three emails with AI and kept at least two (the eval's bar,
  in real use).
- [ ] The pilot's bounce and spam rates are under the pause lines (2%, 0.1%).
