## Parent

PRD: Partner Hub — #70

## What to build

**Partner-assisted customisation**, end to end. A "Customise for a customer" entry in Partner Hub opens the existing mp-config / mbolster-config with partner context — no duplicated form. Differences from the guest flow: recommendation shows **size only** (no Filling Template surface), **Add-on** cards and the cross-flow **Upsell card** are hidden, and the finish panel is co-branded — "[Partner name] × Mpillow" with the partner's uploaded logo beside the Mpillow logo and partner-personalised description. The customer enters their own card for the **Authorization hold** on the partner's device. The partner session stamps the Referral with **assist priority** (outranks typed codes and link stamps). Explicitly not Staff assist mode: no x-ray editors, no admin tools.

## Acceptance criteria

- [ ] Hub entry launches each configurator in partner context; same questions/photos as the guest flow
- [ ] Co-branded finish panel renders partner logo + name; generic add-on copy replaced
- [ ] No filling-template recommendation, no add-on cards, no upsell card anywhere in the assisted run
- [ ] Completed assisted hold → Result attributed to the partner with assist priority (beats a conflicting link stamp)
- [ ] Guest and Staff-assist flows are pixel-unchanged when no partner context is present
- [ ] Customer's card funds the hold; nothing is charged to the partner

## Blocked by

- #74
