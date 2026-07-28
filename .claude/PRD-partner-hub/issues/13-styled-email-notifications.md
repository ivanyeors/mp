## Parent

PRD: Partner Hub — #70

## What to build

The styled email layer + **Partner notifications**, end to end. Introduce one branded HTML base template (logo, typography, footer) and apply it to **all** outbound utility email — existing customer mails (order confirmed, shipping, refund, RMA, restock, contact) and the new partner set: application approved/rejected (restyle the plain versions from the queue slice), **"you just earned a referral"** at attributed capture (the delight moment), **milestone rung reached**, **payout made** (proof image attached/linked), and **re-accept terms**. Every email that mentions pending money includes the dated release information — never undated amounts.

## Acceptance criteria

- [ ] One shared HTML base renders correctly in major clients (Gmail, Outlook, Apple Mail — table-based, inline styles)
- [ ] All existing customer utility emails migrate to the base with copy unchanged
- [ ] All five partner events send styled emails via the existing transport layer with its idempotent-dispatch pattern
- [ ] Referral-earned email fires on attributed capture only (no email on void/decrement)
- [ ] Payout email includes or links the proof of payment
- [ ] Console/dev transport still previews all templates

## Blocked by

- #77, #79, #81
