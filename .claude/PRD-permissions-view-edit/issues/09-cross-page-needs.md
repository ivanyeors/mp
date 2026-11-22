# Slice 09 — Cross-page needs: Review SLA, product pickers on Page FAQs and Discounts

Type: AFK
Parent: PRD `permissions-view-edit`
Triage: blocked on the owner's decision 6 for Review SLA; the pickers can start now
Status: todo
User stories covered: 8
Owner review: code. The Discounts editor is under `app/*/settings/discounts/**`, a money path, so the `reviewer` subagent checks that part.

## What to build

1. **Review SLA.** Today the section sits on General (`api-configs`) but reads and saves through `/api/results/sla-settings`, which requires `results`. A Manager without `api-configs` can't reach it; a role with `api-configs` but not `results` sees the form and gets 403.
   - Decision 6, proposed: move `components/settings/review-sla-section.tsx` to the Results page, server-read like the rest of Results, guarded by `results`.
   - Alternative: keep it on General and render it only when the server page finds `results`.
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
- [ ] Review SLA: a role with `results` and not `api-configs` can open and save it; a role with `api-configs` and not `results` never sees it.
- [ ] Shown failing on the old code (the picker test gets an empty list, or a 403 from the fetch).
- [ ] Preview screenshots of Page FAQs and the Discount editor as a role without `products`.

## Blocked by

- Owner decision 6, for the Review SLA half.
