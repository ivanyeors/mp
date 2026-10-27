# 02 — Hand-offs: every page in the loop links to the next

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** 01
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`

## Goal

Staff never copy an email address to find a person. The demo: from a Result, open its Customer;
from that Customer's Segment, *Email this Segment* opens a new campaign already pointed at it.

## What to build

- **Result → Customer.** The Result's contact block links the name or email to
  `/settings/customers/<id>`. The Customer is the Result's `customer_id`, else the Customer whose
  email matches `customer_email`, matched as `lib/results/owner.ts` does. Shown only to Staff
  holding `customers`; with no match, the email stays plain text.
- **Return → Customer and Order.** The Return's header links the email to the Customer
  (`rma_requests.customer_id`) and the order number to `/settings/orders/<id>`, each only for
  Staff holding `customers` or `orders`.
- **Segment → new campaign.** The Segment chip's menu on Customers gains *Email this Segment*,
  shown only with `campaigns`. It opens `/settings/campaigns/new?segment=<id>`. The new page
  reads `segment`, checks the Segment exists and is not archived, and starts a blank draft with
  that Segment as its Audience. An unknown id falls back to today's default draft.
- **Campaign → Segment.** On a campaign whose Audience is a Segment, the Segment's name links to
  the Customers list with its filters (`customerFilterParams`), for Staff holding `customers`.

## Acceptance criteria

- [ ] Each link appears only for Staff who can open its target; the target's guard is unchanged.
- [ ] A guest Result matched by email links to that Customer.
- [ ] `?segment=` with an archived or unknown id never selects it.
- [ ] No link carries customer data in its URL beyond the record's id.

## Verify

```bash
pnpm exec vitest run "app/[lang]/settings/campaigns" "app/[lang]/settings/customers" "app/[lang]/settings/results" "app/[lang]/settings/rma"
```
