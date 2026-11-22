# Slice 11 — Staging QA signoff

Type: HITL
Parent: PRD `permissions-view-edit`
Triage: blocked by 03–10 and 12
Status: todo
User stories covered: all

## What to check

On stage.mpillow.com (staged build, live database), with three logins:

1. **Owner.** Everything works as before. On the Roles grid, Owner and Admin are locked, with every View and Edit ticked.
2. **A View-only role** (a custom role with View on every page, no Edit, no Costings). For each page in the sidebar:
   - It opens and shows its data, with inputs read-only and no change buttons.
   - There is no cost price or margin anywhere.
   - The tab rows it lacks (Roles, Couriers, Send) are hidden.
3. **A role with Edit on one page** (e.g. Orders View+Edit, Products View only):
   - Orders can be changed.
   - Products is read-only.
   - Page FAQs and Discounts pickers still list products when Products isn't held.
4. **Refund money.** A role with Orders and Returns Edit but no Refund money:
   - can fulfil orders, reject a refund request, and process a return up to "received";
   - sees no Refund, Approve refund, Cancel-and-refund or Issue refund button;
   - is refused if it tries a refund route directly.
   Do not send real refunds on staging (live Stripe); check the 403 only.

For each, record a screenshot and pass or fail per page in this issue. Fix the failures, then sign off.

## Acceptance criteria

- [ ] Every sidebar page checked for all three logins and recorded here.
- [ ] Owner signoff.
