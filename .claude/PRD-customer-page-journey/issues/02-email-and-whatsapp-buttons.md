# 02 — Email and WhatsApp buttons that open Gmail and WhatsApp

**Issue:** not filed
**Type:** AFK, then HITL (the owner tests the links on their own phones)
**Status:** **built** (2026-11-15)
**Blocked by:** 01
**Labels:** `enhancement`, `area:admin`

## Goal

One press from a Customer to a message addressed to them, in the app Staff already use. The
demo: press Email on a laptop and Gmail opens a new message to the customer from
`sg@mpillow.com` with `admin@mpillow.com` on Cc.

## What to build

- `lib/crm/contact-links.ts`, pure and tested: the link for each channel on each device.

  | Device | Email | WhatsApp |
  |---|---|---|
  | Computer | `mail.google.com/mail/?authuser=<mailbox>&view=cm&fs=1&to=&cc=&su=&body=` | `web.whatsapp.com/send?phone=&text=` |
  | iPhone, iPad | `googlegmail:///co?to=&cc=&subject=&body=`, then `mailto:` if Gmail did not open | `wa.me/<number>?text=` |
  | Android | `mailto:<to>?cc=&subject=&body=` | `wa.me/<number>?text=` |

- The mailbox and the Cc are two constants in `lib/contact.ts` (owner decision 4).
- Buttons in the header and on Contact details: Email, Copy; WhatsApp, Call, Copy. WhatsApp and
  Call show only for a valid mobile.
- **"Sent it?"** After a link opens, the page asks once: *Sent it* saves a Customer note by the
  Staff member (*Emailed them from Gmail*, or *Messaged them on WhatsApp*, with the text when
  there was one); *Didn't send* closes it. Staff without `customers-edit` are not asked.
- A link's text stops at 1,800 characters, with the whole text still on Copy.

## As built (2026-11-15)

- `lib/crm/contact-links.ts` and its tests, as specified. `STAFF_MAILBOX` and `STAFF_MAIL_CC` are
  in `lib/contact.ts`.
- `customer-shortcuts.tsx`: one provider for the page, so the header, Contact details and the
  composer open the same links. A computer opens a new tab; an iPhone tries the Gmail app and
  falls back to `mailto:` if the page is still showing after 1.5 seconds.
- "Sent it?" is a toast that waits. *Sent it* posts a Customer note through the existing notes
  route (so the Audit Log entry and the author are the note's own); the Journey reads again.
- **Not built:** a per-device preview of the link, as the mock had. The line under a draft says
  where the button opens on this device.

## Acceptance criteria

- [ ] Each device builds the link in the table, with every value percent-encoded.
- [ ] A Singapore mobile stored as 8 digits opens as `65…`.
- [ ] No link is built for an invalid mobile.
- [ ] Nothing is sent by the platform, and nothing is logged unless Staff press *Sent it*.

## HITL

- [ ] On an iPhone with Gmail, an iPhone without it, and an Android phone, the buttons open a
  filled-in message.
- [ ] WhatsApp Web in the shop's browser is linked to the support line.
