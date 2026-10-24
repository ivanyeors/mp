# 11 — Sign-off: staging, real test cards, both locales, a handset

**Type:** HITL
**Blocked by:** 04, 05, 09, 10
**User stories:** all
**Labels:** `qa`, `needs-triage`, `P1`

## Goal

A person who did not build this walks every path on staging, on a phone, in English and Chinese. The money each path moves must match what the screens said.

## Script

### Operator

1. Open *Costings → Service fees* from the sidebar without being told where it is. Note how long it took.
2. Change Measurement (Premium) to $55 and the re-adjustment fee to $35. Save. Check the Audit Log.
3. Open the premium slide-in, the warranty page, the configurator's *Have us measure you* link and the customisation booking page. All four show $55 / $35.
4. Put the fees back.

### Measurement fee

5. **Guest, self-measured Premium:** hold → the Stripe amount has **no** fee. Accept → one order line.
6. **Staff assist mode, working-as profile, Premium:** the preview Ballpark shows *Measurement service (Premium) $50* → hold for build + $50 → assign → the assigned email shows the row → accept → two order lines summing to the subtotal → the receipt shows both.
7. **Same with Basic → upsold to Premium:** the fee is $50.
8. **Staff-measured bolster:** the fee is $30.
9. **In-store measurement** (Results list → *Send to Telegram* → assign → *Request payment*): the Balance payment includes the fee.
10. **Correct "Measured by"** from staff to customer before assign → the fee disappears from `final_amount`.
11. **Free shipping:** a build just under `free_above` plus the fee does **not** ship free.
12. **Post-sale:** the **Order** with a service line is not in the ship queue; RMA refuses the service line; Analytics shows *Services*.

### Re-adjustment

13. **Signed out → Readjust:** the gate shows. Sign in → back to the picker.
14. **A Premium pillow bought within 60 days:** *Complimentary until …* → book → the event shows the pillow, order and *Complimentary* to **Staff**.
15. **The same pillow again:** *$30 · free visit used*. Pay with `4242…` → **Order** confirmed, receipt, event created.
16. **Cancel the free visit by WhatsApp:** the pillow quotes *Complimentary* again.
17. **Basic pillow:** $30. **Mbolster:** $30. **Not listed:** $30, flagged for proof in the **Admin Panel**.
18. **Abandon a checkout:** after 30 minutes the **Order** is cancelled, the slot is free and no Google invite was ever sent.
19. **Decline card** `4000 0000 0000 0002`: no **Order** confirmed, no event, and the slot is released at expiry.
20. **Two tabs claim the last free visit at once:** one succeeds, the other re-quotes $30.
21. **Staff:** *Mark attended* on a paid booking → its **Order** `delivered`. *No-show* on a free one → still used.

### Platform

22. Every page above at 375 px with no horizontal scroll, in en-US and zh-CN.
23. Check against the live Dashboard (not the code) that `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.expired` are subscribed on the production webhook endpoint.

## Acceptance criteria

- [ ] Every step passes, or has a linked follow-up issue with a reason.
- [ ] Stripe test-mode amounts match the on-screen totals for steps 5–9 and 15, to the cent.
- [ ] The owner confirms the operator found *Service fees* unaided (step 1) and approves the copy (slice 10).
