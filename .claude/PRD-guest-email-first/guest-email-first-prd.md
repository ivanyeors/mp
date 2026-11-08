# PRD: A guest's email first, so every Draft Result can be followed up

Status: Slice 01 built (2026-11-07). Slices 02–05 need triage.
Source: owner request, 2026-11-07. Decision record: ADR 0049.

## Problem statement

The owner, in their words: when a shopper finishes the questionnaire and sees their results but
does not click through to Stripe, the Result still appears in the Admin Panel, but there is no
way to send them a payment request link, or to email or market to them, because they have not
given an email yet.

What the code did:

| Fact | Where |
|---|---|
| The Mpillow configurators save a **Draft Result** (`status` null) from the first keystroke on the first question, and autosave every answer after it. | `upsertToDb` in `app/[lang]/mp-config/mp-config-client.tsx`; `POST /api/mp-config/responses` |
| Drafts are listed in Results with everything else. | `lib/results/admin/responses-list.ts` |
| The email was asked only on the preview's contact step, after the recommendation and price are shown. | `components/configurator/preview-contact-fields.tsx` |
| `customer_email` was written only by the hold, or by *Save without purchasing* (`persistContact`). | `app/api/results/hold/route.ts`, the responses route |
| *Request payment* needs an assigned build and an email: the Results menu says "Only an assigned build can be paid for" / "No customer email on file". | `results-client.tsx`, `/api/results/[id]/request-payment` |
| Marketing reaches a **Customer**, and a customisation made one only at the hold, when the box was ticked (ADR 0039). | `recordBoxConsentByEmail()` |
| **Mbolster** saves no Result before its hold, and the hold requires an email, so it has no email-less Drafts. | `mbolster-config-client.tsx` |

So the gap is Mpillow (full and Basic): a guest can leave a Draft, with a recommendation and a
price on their screen, that Staff can see and cannot reach.

## Research: where to ask

| Placement | What the evidence says | For us |
|---|---|---|
| Before the first question | Lowest start rate; ConvertFlow finds a pre-result gate "captures more emails but loses 30–50% of finishers". | Catches people who stop part-way, including at the tape measure. Costs some starts. |
| After the questions, before the result | Vendors' best opt-in: Octane AI 45–55%, Qzzr 35–55% (their own averages); 3–5× post-result, per Interact as quoted. | Catches everyone who would see a price. Misses everyone who stops earlier. |
| After the result | Fewest emails, better list quality, more add-to-cart. | Is today's behaviour, and is the problem. |
| Email first in checkout | Shopify puts it at the top of step 1, and only counts a checkout as abandoned once an email exists, because that is what makes recovery possible. | The same reasoning applies to a configurator that sells a made-to-order product. |

Caveats: almost every number above is a quiz vendor's, for lead-magnet quizzes, not a controlled
test; the one controlled test found (Americans for Prosperity moving capture to before the quiz)
did not publish its result table in what we could read. Lazy-registration guidance says ask once
the person has a reason to give the data. Singapore's PDPA wants the purpose stated where the
data is collected, and marketing consent separate from it; ADR 0039 records the owner's accepted
risk on the ticked-by-default box.

## Decision (slice 01, ADR 0049)

Ask on the first question, "Tell us about yourself", beside the name, for anyone on no Admin
Panel login. Why first rather than just before the result:

1. **It closes the gap the owner named, completely.** No guest Draft exists without an email, so
   nothing in Results is unreachable.
2. **The tape measure is where people leave**, long before the result. Measuring needs a tape and
   often a second person; those people are the most worth a follow-up.
3. **It is a purchase, not a lead magnet.** The shopper has opened a configurator for a custom
   pillow and read *What to expect*; the question already asks their name.
4. **One field and one honest sentence** about why, no new step.

What it costs is starts. Slice 05 measures it, and the fallback is moving the same field to just
before the result, which is a small change.

Scope of slice 01:

- Guests (no Admin Panel login) on `/mp-config` and `/mp-basic`: the first question asks the
  email (required, prefilled for a signed-in Customer), with the checkout's marketing box.
- No guest Draft is saved before that Continue; the Continue saves it with the email, and a failed
  save keeps them on the question.
- `POST /api/mp-config/responses` takes `draftEmail` (+ `marketingEmail`), writes `customer_email`
  on a Draft only, and records the box as `customisation` after the save.
- An Mbolster hand-off into Mpillow starts on the first question for a guest.
- The contact step's email is the same state, prefilled. Staff devices, finish links and Staff
  re-configurations are unchanged.

## User stories

1. As a guest, I am asked my name and email on the first question, with one line on why.
2. As a guest, I cannot start the measurements without an email shaped like an address.
3. As a signed-in Customer, my email is already filled in.
4. As a guest, the marketing box under my email is the same one I see at checkout, ticked by
   default; unticking it on either step unticks both.
5. As a guest, my email is filled in on the contact step, and I can still change it there.
6. As a guest coming from Mbolster into Mpillow, I am asked the same first question.
7. As Staff, every guest Draft in Results shows an email.
8. As Staff, a guest who left the box ticked is a subscribed Lead I can reach from Campaigns,
   even if they never reached the hold.
9. As Staff on my own device, my configurator is unchanged: the shopper's email is asked at the
   end, and my login's email is never used.
10. As the owner, a held Result's email can never be changed by a configurator save.

## Slices

See `issues/README.md`.

## Out of scope for slice 01

- Mbolster's own flow (no Draft before its hold; the hold already requires an email).
- A link that lets the shopper reopen their own Draft on another device (slice 02).
- Any automatic email to a guest who stops (slice 04).
- Backfilling Drafts saved before this change.

## Sources

- [Octane AI: Lead generation](https://www.octaneai.com/solutions/lead-generation)
- [Qzzr: Quiz lead generation (2026 guide)](https://qzzr.com/blog/insights/quiz-lead-generation-how-to-capture-leads-without-the-hard-sell/)
- [ConvertFlow: How to fix ecommerce quiz funnel drop-off](https://www.convertflow.com/blog/how-to-fix-ecommerce-quiz-funnel-drop-off-in-2026)
- [Should the email gate come before or after quiz results?](https://emaillistvalidation.com/blog/email-gate-before-or-after-quiz-results/)
- [NextAfter: Email capture before a quiz (Economic Freedom Quiz)](https://www.nextafter.com/?p=16183)
- [GrowthSuite: When should I ask for email addresses in the process?](https://www.growthsuite.net/questions/when-should-i-ask-for-email-addresses-in-the-process)
- [Abandoned cart vs abandoned checkout (Shopify's definition)](https://blockifyapp.com/blog/abandoned-cart-vs-abandoned-checkout/)
- [ui-patterns.com: Lazy registration](https://ui-patterns.com/patterns/LazyRegistration)
- [PDPC: Obligations for email direct marketing](https://www.pdpc.gov.sg/-/media/files/pdpc/pdf-files/resource-for-organisation/obligations_edm_01.pdf)
- [Singapore Legal Advice: PDPA consent requirements](https://singaporelegaladvice.com/law-articles/pdpa-consent-requirements-business-comply/)
