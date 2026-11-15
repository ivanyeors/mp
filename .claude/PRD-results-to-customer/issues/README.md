# Results to Customer — vertical slices

Breakdown of `../results-to-customer-prd.md`. Published locally (no external issue tracker).

**Triage label:** `needs-triage` (04, 05, 06)

| # | Title | Type | Status | Blocked by |
|---|-------|------|--------|------------|
| 01 | Every email given in a customisation finds or creates its Customer | AFK | **built** (ADR 0051 a–c) | none |
| 02 | The Result's Customer panel: open, link or create | AFK | **built** (ADR 0051 d–g) | 01 |
| 03 | Results queue: *Unfinished* tab, *Online* label, where they stopped | AFK | **built** | none |
| 04 | Drafts in the CRM: timeline, *Lead* sub-statuses, Next step | AFK | needs-triage | 01, 02 |
| 05 | Staff follow a Draft up: continue link, copy link, follow-up | AFK | needs-triage | 02 |
| 06 | A Staff device asks the email on the first question | HITL | needs-triage | 01 |

## 01 — Every email finds or creates its Customer

`lib/crm/customisation-customer.ts`. The first question's email
(`POST /api/mp-config/responses` with `draftEmail`), *Save without purchasing*
(`persistContact`, which now also sends the box) and the hold (`/api/results/hold`) find the
Customer by email or create one, ticked or not. A found Customer is never changed; a created
one takes the name and mobile given. The box records `customisation` when ticked, as before.
Never fails the save.

## 02 — The Result's Customer panel

`app/[lang]/settings/results/[id]/result-customer-panel.tsx`, `POST /api/results/[id]/customer`.

- Matched: the Customer's name, email, mobile and **Lifecycle stage**, and *Open customer*.
- A Result with an email and no Customer: *Add as customer*.
- A Result with no email, or a Draft whose email Staff typed: *Link to existing* (search the
  Customers list's own search) or *Create customer* (name prefilled, email required, mobile
  encouraged), each with the marketing box ticked by default.
- The link writes `customer_id` and `customer_email`, fills a Customer's empty mobile, and is
  recorded as `result.customer_link` in the audit log. `customers-edit` and `results`.
- The Results row menu offers *Customer…*, which opens the Result on its panel.

## 03 — Results queue

- `bucketFor`: a Draft (`measurement_only`) goes to a new *Unfinished* tab, after *Stuck*.
  *Needs assign* is the build team's queue again.
- A guest's Draft (`data.configurator` set) reads *Online*, not *In-store*, and the *Online*
  source filter finds it. Display only: `source` is not written, since it authorises the no-card
  submit (`app/api/mp-config/responses/route.ts`).
- A Draft's status reads *Unfinished*, with *Stopped at …* from `resumeStepFor`.
- The name column shows the name first and the email under it.

## 04 — Drafts in the CRM

- The Customer timeline shows a Draft: "Started a customisation, stopped at …", naming the
  Result's name when it is not the Customer's (decision 1: measuring someone else).
- *Lead* sub-statuses from facts already stored: *Started* (a Draft), *Quoted* (assigned),
  *Quote lost* (declined, expired or cancelled), *Signed up*, *Subscribed*. The lifecycle doc's
  Engaged / Lead / Quoted stages, put on the Customer.
- Next step for a Lead with a Draft: "Unfinished customisation: send the continue link or add a
  follow-up". For a Customer past *Lead* with a new Draft: "Started another customisation".

## 05 — Staff follow a Draft up

PRD-guest-email-first slice 03, widened to Staff-measured Drafts now that slice 02 gives them an
email: *Send continue link* (a transactional *Finish your pillow* email, editable under Email
templates), *Copy link* for WhatsApp, and *Add follow-up* on the Customer, assigned to the Staff
member who measured them.

## 06 — Ask the email first on a Staff device

Owner decision 2 ("email is a must"). A Staff device asks the shopper's email (required) and
mobile (encouraged) on the first question, as a guest's does, so a studio Draft is never
name-only. HITL: the owner confirms it does not slow the studio, and whether a walk-in who will
not give an email can still be measured.
