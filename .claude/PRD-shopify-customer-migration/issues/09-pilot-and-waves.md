# 09 — Sign-off: DNS, a pilot of 50, then the waves

**Issue:** [#273](https://github.com/ivanyeors/mp/issues/273) (parent #264)
**Type:** HITL
**Blocked by:** 04, 08; owner decisions 2, 3, 4
**User stories:** all
**Labels:** `needs-triage`, `P2`, `area:email`

## Goal

Real inboxes, real customers, real vouchers redeemed. Grow the volume only as fast as the
numbers allow.

## Steps

1. **Set up DNS** for the sending subdomain: Resend's SPF and DKIM records, plus a DMARC record
   (start at `p=none` with reporting). Verify in Resend.
2. **Run the seed test.** Send each template, plus `welcome_voucher`, to the owner and two Staff
   at Gmail, Outlook and Yahoo. Check:
   - rendering on mobile and desktop;
   - the button lands on `/account/welcome` with the name;
   - sign-in claims, and the voucher shows;
   - **Gmail's own "Unsubscribe" button** works, which is the RFC 8058 one-click;
   - the footer link works;
   - the mail did not land in spam.
3. **Run the pilot** with 25–50 consented **buyers**, preferring recent and loyal customers.
   Wait 48 hours. Record here: sent, bounced, complained, clicked, claimed, vouchers redeemed.
   Confirm at least one real redemption at checkout.
4. **Send the waves, buyers first.** Choose sizes from the list size (owner decision 7). A
   sensible ramp is 200 → 500 → the remainder per day.
   - **Pause** a wave when bounces exceed 2% or complaints exceed 0.1%. Investigate the segment
     before resuming.
   - Subscribers who never bought go **last**, in smaller waves.
5. **Send the reminder** 7 days after each consented wave, once.
6. **Send the service notice** to the no-consent group once the announcement waves are done,
   only if owner decision 3 says so, and only with copy confirmed by counsel.
7. **Close the campaign** by setting `welcome_voucher_issue_until`. Vouchers already issued stay
   valid until their own expiry.

## Acceptance criteria

- [ ] SPF, DKIM and DMARC pass on a received message, checked in Gmail's *Show original*.
- [ ] The seed-test checklist is fully ticked, including Gmail's one-click unsubscribe.
- [ ] Pilot numbers are recorded, and a real redemption is confirmed.
- [ ] Every wave's numbers are recorded here. No wave ran while a pause condition held.
- [ ] Claim rate per wave is reported to the owner, who sets the target from the pilot.
