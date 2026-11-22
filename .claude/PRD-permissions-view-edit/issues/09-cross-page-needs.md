# Slice 09 — Cross-page needs: Review SLA, product pickers on Page FAQs and Discounts

Type: AFK
Parent: PRD `permissions-view-edit`
Triage: ready (owner decision 6: Review SLA moves to Results)
Status: todo
User stories covered: 8
Owner review: code. The Discounts editor is under `app/*/settings/discounts/**`, a money path, so the `reviewer` subagent checks that part.

## What to build

1. **Review SLA.** Today the section sits on General (`api-configs`) but reads and saves through `/api/results/sla-settings`, which requires `results`. A Manager without `api-configs` can't reach it; a role with `api-configs` but not `results` sees the form and gets 403.
   - Owner decision 6: move `components/settings/review-sla-section.tsx` from General to the Results page, server-read like the rest of Results and guarded by `results` (its saves by `results-edit` once slice 07 lands).
   - General no longer renders it.
2. **Product pickers.** Page FAQs (`components/settings/page-faqs-panel.tsx:113`) and the Discount editor (`discounts/[id]/discount-editor-client.tsx:333`) fetch `/api/shop/products`, which requires `products`. Without it, the picker shows an empty list and no error.
   - Each server page (`faq/page.tsx`, `discounts/[id]/page.tsx`) reads the minimal product list (id, title, status) under its own guard and passes it as a prop.
   - The client fetches go. No new API.
3. **Audit the rest.** For each cross-page need listed in the PRD research (Customers › Create order needs `orders`, Results › Link customer needs `customers-edit`, Appointments › service fees, the image picker…), decide one of:
   - **intended**: the action belongs to the other page, so its button hides without that key;
   - **fix**: same as the pickers.
   Write the list into this issue as it is worked.

## Acceptance criteria

- [ ] Test: Page FAQs renders its product picker with products for a role holding `faq` but not `products` (props, no fetch).
- [ ] Test: the Discount editor does the same for `discounts` without `products`.
- [ ] Review SLA is on the Results page. A role with `results` and not `api-configs` can open and save it. General no longer contains it, which is checked by a render test of the General page.
- [ ] Shown failing on the old code (the picker test gets an empty list, or a 403 from the fetch).
- [ ] Preview screenshots of Page FAQs and the Discount editor as a role without `products`.

## Blocked by

None.
