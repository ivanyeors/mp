# PRD: From a Result to a Customer, so a drop-off enters the CRM funnel

Status: slices 01–03 built (2026-11-15). Slices 04–06 specified, not started.
Source: owner request and audit, 2026-11-15. Decision record: ADR 0051.

## Problem statement

The owner, in their words: "When a customer fills up the form but drops off halfway, the results
get saved here, but there is no way for me to create this as a new customer or assign to an
existing customer. And also, I'm not able to put or assign this potential customer into the CRM
funnel."

What the audit found (code and production data, 2026-11-15):

| Fact | Where |
|---|---|
| A customisation made a **Customer** only when the marketing box was ticked, or at payment. *Save without purchasing* wrote email and mobile onto the Result and made no Customer. | `recordBoxConsentByEmail` (`lib/marketing-consent/consent.ts`); `app/api/mp-config/responses/route.ts` |
| No screen creates a Customer or ties a Result to one. `POST /api/shop/customers` exists; nothing calls it. | `lib/crm/customer-link.ts` (email match only) |
| Every Draft reads *Measurement only* and is counted under *Needs assign*. A guest's online Draft reads *In-store*: the column default is `manual`. | `lib/results/result-stage.ts` `bucketFor`; `results-client.tsx` `sourceLabel` |
| The CRM leaves Drafts out: the Customer timeline skips them, *Lead* has no sub-status, *Next step* has no rule for a Lead, and a Follow-up needs a Customer. | `lib/crm/timeline/sources/results.ts`; `lib/crm/next-step.ts` |
| Staff-measured Drafts get no reminder ("Staff follow those up themselves"), and Staff have no tool to. | `lib/draft-reminders/index.ts` |
| Production: 12 of the 18 rows under *Needs assign* were Drafts; 11 had no email and no mobile; 8 were measured by Staff. One held online Result had an email and no Customer. The same person showed twice, as a studio measurement and as a purchase, with nothing linking them. | read-only counts, 2026-11-15 |

## Owner decisions (2026-11-15)

1. An email that matches a Customer never creates another. A Customer who already bought may be
   trying it out again, or measuring someone they are with.
2. Email is a must; a mobile is encouraged, not required.
3. Staff may record marketing consent for the customer, ticked by default.

## Slices

See `issues/README.md`. In short:

| # | Slice | Status |
|---|---|---|
| 01 | Every email given in a customisation finds or creates its Customer; the box decides consent only | built |
| 02 | The Result's Customer panel: open, link to an existing Customer, or create one | built |
| 03 | Results queue: an *Unfinished* tab, *Online* for a guest's Draft, and where they stopped | built |
| 04 | Drafts in the CRM: on the timeline, *Lead* sub-statuses, a Next step for a Lead | specified |
| 05 | Staff follow a Draft up: *Send continue link*, *Copy link*, *Add follow-up* | specified (absorbs PRD-guest-email-first slice 03) |
| 06 | A Staff device asks the email (required) and mobile (encouraged) on the first question | specified |

## User stories

1. As Staff, a Result whose email belongs to a Customer shows that Customer and their stage.
2. As Staff, I can link a Result with no email to an existing Customer, found by name or email.
3. As Staff, I can create a Customer from a Result, with the name prefilled, an email I must give
   and a mobile I am encouraged to give.
4. As Staff, the marketing box on that panel is ticked by default, and it never re-subscribes
   someone who unsubscribed.
5. As Staff, linking a Result means *Request payment* and every Result email reach the Customer.
6. As Staff, a returning Customer who starts a new customisation is not made a new Customer, and
   their record is not overwritten by the Result's name: it may be for someone else.
7. As the owner, everyone who gives an email in a customisation is a *Lead* in the funnel, ticked
   box or not, and marketing still reaches only those who agreed.
8. As Staff, unfinished Drafts have their own tab, not mixed into *Needs assign*.
9. As Staff, a guest's online Draft reads *Online*, and every Draft says where it stopped.
10. As the owner, a guest's own email and a held Result's email are never re-pointed by Staff.

## Hazards

- **Creating a Customer is not consent** (ADR 0051 c). Every marketing send keeps reading
  `marketing_email`.
- **A link gives the Customer access.** A signed-in Customer is an **Owner** of a Result whose
  `customer_id` or email is theirs. The link is a person's decision, and audited.
- **No `.or()` with typed text** (ADR 0028 d): the search uses the Customers list's own search.

## Out of scope

- Merging two Customers (ADR 0028 rules it out).
- Appointment bookings without a ticked box (ADR 0051, consequences).
- A phone-only Customer (owner decision 2).
