# Every email given in a customisation is a Customer, and Staff link or create one from a Result

Status: Accepted (PRD `results-to-customer`, owner decisions 2026-11-15). Amends ADR 0039 and
ADR 0049 on one point: a **Customer** no longer waits for the marketing box.

## Context

The owner, 2026-11-15: a customer fills in the form and drops off half way, the Result is saved
in Results, but there is no way to create them as a new Customer or assign them to an existing
one, and no way to put them in the CRM funnel.

What the code did:

- A **Customer** was created by a customisation only when the marketing box was ticked
  (`recordBoxConsentByEmail` returned before looking anyone up when it was not). An email given
  on the first question with the box unticked, *Save without purchasing* (which writes email and
  mobile onto the Result and nothing else), and a card hold with the box unticked left a person
  Staff could see in Results and could not find on Customers. One held online Result in
  production was in exactly that state.
- The Admin Panel had no way to create a Customer (`POST /api/shop/customers` existed and nothing
  called it) and no way to tie a Result to one. A Result linked to a Customer only by an equal
  email (`lib/crm/customer-link.ts`).
- A Staff device asks the shopper's email on the last step (ADR 0049), so a studio measurement
  that stops before it has a name and nothing else. On 2026-11-15, 11 of the 12 Drafts in
  production had no email and no mobile; 8 were measured by Staff.
- The **Lifecycle stage** reads only Customers, so none of these people were in the funnel.

## Decisions

Owner, 2026-11-15:

1. "If the email matched our database then it should not be a new customer created; if they
   already bought previously it could either just be them trying it out or trying it for another
   person that they are with."
2. "Email is a must, and have mobile encouraged to add."
3. Staff may record marketing consent for the customer, "and if it's a customer, marketing consent
   is checked by default".

What they mean in the code:

- **(a) An email given in a customisation finds its Customer, or creates one.** The first
  question's email, *Save without purchasing* and the hold each find the **Customer** whose email
  it is (ignoring case), or create one with no login, ticked or not
  (`lib/crm/customisation-customer.ts`). One created this way who has bought nothing is a
  *Lead*. It never fails the save, the hold or the request.
- **(b) A Customer found by the email is never changed by it.** Not their name, not their
  mobile. A Customer who has bought before and starts another customisation may be measuring
  someone they are with, so the Result's name is not theirs to take. Their **Lifecycle stage**
  stays what their purchases make it: a new Draft never moves anyone back to *Lead*. A Customer
  created here takes the name and mobile given with the email, the whole name in `first_name`,
  as the fitting import does (ADR 0042 c).
- **(c) The box decides consent, and only consent.** Ticked, it records `customisation` as
  before, subscribing only someone nobody has asked; unticked, it records nothing. Creating the
  Customer is not consent: campaigns, Draft reminders and every other marketing send still read
  `marketing_email`.
- **(d) Staff link a Result to a Customer, or create one, from the Result.** The Result page's
  Customer panel shows the Customer the Result belongs to, with their stage. A Result with no
  email can be linked to an existing Customer (search by name or email) or to a new one. A new
  Customer needs an email; the mobile is asked for and encouraged, not required (decision 2). A
  Result whose email has no Customer yet (from before this decision) can be added as one.
- **(e) Staff record the box for the customer, ticked by default** (decision 3). The panel shows
  the customisation's own marketing box, ticked, and records it as `customisation`, the same box
  a Staff device's contact step records today. It subscribes only someone nobody has asked: never
  someone who unsubscribed, never against an earlier choice. The action is in the audit log.
- **(f) What the link writes, and what it may not.** Linking sets the Result's `customer_id`, and
  its `customer_email` to the Customer's, so *Request payment* and every Result email reach them.
  A Staff link fills the Customer's mobile only when they have none. It is allowed while the
  Result has no email, or on a **Draft Result** whose email Staff typed (no `data.configurator`):
  the email a guest gave on the first question, and a held Result's, are where that Result's
  emails and **Result access token** already go, and are never re-pointed.
- **(g) Who.** `customers-edit` and `results` together: it changes a Customer and a Result.

## Considered options

- **A Customer per Result**, even when the email is already known. Rejected by decision 1: one
  person, one Customer, as the fitting import decided (ADR 0042 c).
- **Fill the found Customer's name and mobile from the Result** (ADR 0042 c fills a null name or
  mobile). Rejected for the customer's own saves by decision 1: the Result may be for someone
  else, and an unsigned guest save should change no one's record. Kept for Staff, mobile only,
  where a person confirms who it is.
- **A phone-only Customer** for the studio Drafts with a mobile and no email. Rejected by
  decision 2; `customers.email` stays required.
- **A new consent source for Staff** (`staff_entry`). Not needed: it is the customisation's own
  box, which a Staff device already records as `customisation`, and the audit log says who.

## Consequences

- Leads grow by everyone who gives an email, not only those who leave the box ticked. The
  Customers list, the *Lead* count and Telegram's *new customers* count rise with them;
  marketing reach does not.
- A studio Draft with only a name still has no Customer until Staff link one. Asking the email
  earlier on a Staff device is the PRD's slice 06.
- Appointments keep their own rule (`recordBoxConsentByEmail`): a booking makes a Customer only
  when its box is ticked. Bringing them in line is a separate decision.
- A Customer can now see, once signed in, a Result Staff linked to them. That is the point, and
  why the link is a person's decision and is audited.

## Related

- [ADR 0039 — Marketing consent by default](0039-marketing-consent-by-default.md): the box, its
  sources and the never-resubscribe rule, unchanged.
- [ADR 0049 — Guest email on the first question](0049-guest-email-on-the-first-question.md): the
  email this decision now always turns into a Customer.
- [ADR 0028 — Customer CRM](0028-customer-crm.md) and `PRD-crm-retention-loop`: the
  **Lifecycle stage** these Customers enter as *Lead*.
- [ADR 0042 — Google Form fitting records](0042-google-form-fitting-records.md): one person, one
  Customer, matched by email.
