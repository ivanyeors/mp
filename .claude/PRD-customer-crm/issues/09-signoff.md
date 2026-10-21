# 09 — Sign-off: the privacy check in production, a Staff walkthrough, and the first review requests

**Issue:** [#286](https://github.com/ivanyeors/mp/issues/286) (parent #277)
**Type:** HITL
**Blocked by:** 02, 03, 05, 06, 07, 10, 11, 12, 13, 14
**User stories:** all
**Labels:** `needs-triage`, `P2`, `area:admin`

## Steps

1. **Run the privacy check against production** with the owner's own customer login.
   - Call the database API with that session's key for `customers.notes`, `customers.tags`,
     `orders.internal_notes` and `customer_notes`. Each must be refused or return nothing.
   - Then open `/account`, every order, the addresses page and re-adjustment booking. All of
     them must still work.
   - Record the results here.
2. **Staff walkthrough.** Each Staff role (Owner, Manager, Staff) opens three real Customers.
   - The timeline shows only the kinds that role may see.
   - Add a note and a follow-up, and save a Segment.
   - Note anything confusing here, then fix it or file it.
3. **Counsel check, once.** Counsel reads:
   - the two emails and the two WhatsApp templates;
   - the Profile's WhatsApp opt-in wording;
   - whether a Staff note is enough evidence of consent for the check-up on WhatsApp;
   - whether the check-up email may drop its Marketing-consent condition (slice 08).

   Record the answers here.
4. **Turn on review requests.**
   - Set `google_review_url` to the *Ask for reviews* link from Google Business Profile, and
     check it opens the review form.
   - Read the final copy against Google's three rules (slice 07): everyone alike, an
     unconditional contact line, no incentive.
   - Switch on `review_requests_enabled`.
   - Watch the first run's report on the Aftercare card: sent, and skipped by reason.
   - Check one real request in the owner's inbox (or a Staff test order): it renders, the
     button opens Google's review form, the WhatsApp line opens the support chat, and it is not
     in spam.
   - Test the WhatsApp version on the owner's own number:
     - turn WhatsApp on in the owner's own Profile, and send the request;
     - check that the button opens the review form;
     - reply STOP, and check the reply, the open request on the Contact card, and that a
       second run sends nothing;
     - switch it off from the Admin Panel, and check the request closes.
   - Turn email off in the owner's Profile, and check the history line says *Profile*.
   - Flip one test Customer's switches from the Admin Panel, and check the history line.
5. **After 30 days, record:**
   - requests sent;
   - links opened;
   - Google reviews linked to asked Customers (slice 12);
   - *skipped: not marked delivered*. If this count is high, fix order delivery marking first,
     because the request depends on it.
6. **Match the first Google reviews.** If the Google review sync is live, work through
   *Google reviews to match* once. Record how many had a correct suggestion, as the measure of
   whether the matching rules need tuning.
7. **Telegram updates.** On the Telegram updates card (slice 14):
   - press *Send test*, and check the four types arrive marked TEST;
   - switch *New online Result to review* off, make a test online hold, and check nothing is
     posted; switch it back on, and check the next hold posts as before;
   - after a week, confirm that the daily and weekly posts went out on schedule with counts
     only.

## Acceptance criteria

- [ ] The production privacy check is recorded, and every check passes.
- [ ] Each role's walkthrough is recorded.
- [ ] The first review-request run is recorded, with one inbox check.
- [ ] The 30-day numbers are recorded and reported to the owner.
