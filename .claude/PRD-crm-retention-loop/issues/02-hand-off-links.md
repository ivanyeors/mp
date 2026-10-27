# 02 — Hand-offs: every page in the loop links to the next

**Issue:** see the README table
**Type:** AFK
**Status:** being built on `claude/crm-loop-handoffs-dropoff`
**Blocked by:** 01
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`

## Goal

Staff never copy an email address to find a person. The demo: from a Result, open its Customer;
from that Customer's Segment, *Email this Segment* opens a new campaign already pointed at it.

## What to build

- **Result → Customer.** The admin Result page (`/settings/results/[id]`) links the customer's
  email to `/settings/customers/<id>` with *Open customer*. The Customer is the Result's
  `customer_id` when that Customer exists; otherwise the one Customer whose email equals
  `customer_email`, case-insensitively, as `lib/results/owner.ts` matches. Two or more matches,
  or none, link nothing. Resolved on the server, only for Staff holding `customers`.
- **Return → Customer and Order.** The Return page (`/settings/rma/[id]`) links the email to the
  Customer (`rma_requests.customer_id`) for Staff holding `customers`, and the order number to
  `/settings/orders/<id>` for Staff holding `orders`. Without the key, plain text as today.
- **Segment → new campaign.** Each Segment chip's menu on Customers gains *Email this Segment*
  for Staff holding `campaigns` (the menu now shows with `customers-edit` **or** `campaigns`;
  *Rename* and *Archive* stay `customers-edit` only). It is not offered on a Segment that needs
  review. It opens `/settings/campaigns/new?segment=<id>`.
- **New campaign from a Segment.** `/settings/campaigns/new` reads `segment`. A live Segment
  (a uuid among `listSegments()`) starts a blank draft: the Segment's name as the campaign
  name, no subject, no body, no button, Audience *Segment* with it chosen. Anything else
  starts today's default draft.
- **Campaign → Segment.** Under the Segment field on a campaign, *See who is in it* links to the
  Customers list with that Segment's filters, for Staff holding `customers`.

## Acceptance criteria

- [ ] Each link appears only for Staff who can open its target; every target's guard is unchanged.
- [ ] A guest Result matched by email links to that Customer; an ambiguous email links nothing.
- [ ] `?segment=` with an archived, unknown or malformed id starts the default draft.
- [ ] No link carries anything in its URL beyond a record's id or a Segment's filters.

## Verify

```bash
pnpm exec vitest run lib/crm "app/[lang]/settings/campaigns" "app/[lang]/settings/customers"
```
