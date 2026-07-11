# Slice 06 — Staging QA signoff checklist (all three flows + in-store save)

Type: HITL
Parent: PRD `configurator-contact-forms` (`.claude/PRD-configurator-contact-forms/configurator-contact-forms-prd.md`)
Triage: needs-triage
User stories covered: 52

## What to build

Human staging verification checklist (no new product code). Confirm the full path works before calling the PRD done.

### Checklist

- [ ] **Forms:** add option, edit en-US/zh-CN labels, reorder, archive; Other cannot be deleted; active list updates on configurator.
- [ ] **mp-config:** preview requires email, mobile, Discovery source; Other requires free text; authorize writes Result columns; Stripe cancel restore still works if already in product.
- [ ] **mp-basic:** same contact + Discovery source rules and persistence.
- [ ] **mbolster-config:** same contact + Discovery source rules and persistence.
- [ ] **In-store Save without purchasing** (Mpillow): same required fields and Result persistence.
- [ ] **Results detail:** phone, Discovery source label, Other text visible next to email.
- [ ] **zh-CN route:** Discovery source options show zh-CN labels when set.
- [ ] **Permission:** non–page-builder cannot mutate Forms.

## Acceptance criteria

- [ ] Checklist completed on staging with notes for any failures.
- [ ] Blockers filed or fixed before PRD marked done.

## Blocked by

- [`.claude/PRD-configurator-contact-forms/issues/03-forms-admin.md`](03-forms-admin.md)
- [`.claude/PRD-configurator-contact-forms/issues/04-preview-contact-hold.md`](04-preview-contact-hold.md)
- [`.claude/PRD-configurator-contact-forms/issues/05-results-detail-contact.md`](05-results-detail-contact.md)
