---
paths:
  - "lib/i18n/**"
  - "components/sections/**"
  - "components/marketing/**"
  - "components/product-sections/**"
  - "lib/product-slide-sections/**"
  - "lib/landing-sections.ts"
  - "lib/seo/**"
---

# Storefront copy

- Write to the personas and copy rules in `docs/marketing-page/persona.md`:
  lead with customisation and cervical fit, and stay claim-safe: support,
  alignment, comfort, fit, less strain, sleep quality. Never relieve, treat,
  cure, heal, correct or rehab; never pain-free, orthopaedic pillow,
  clinically proven or doctor-recommended; never a medical condition as who a
  product is for. The banned list is `lib/claims.ts`; `pnpm checks
  lib/claims.check.ts` fails on any of it in the message files.
- Retired phrasing is listed under Marketing in `CONTEXT.md` ("Science of
  Sleep" is gone from every surface).
- Sections and slide-ins follow `docs/marketing-page/sections.md` and
  `product-slide-sections.md`.
