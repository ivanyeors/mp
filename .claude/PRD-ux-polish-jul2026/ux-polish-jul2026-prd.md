# PRD: UX Polish + Pre-order (Jul 2026)

Status: Draft (needs-triage)
Source: Grill session Jul 2026 + product feedback
ADR: `docs/adr/0005-pre-order-authorization-hold.md`
Glossary: `CONTEXT.md` (**Pre-order**, **Customer preference**, **Authorization hold**, **Result**, **Order**)

## Problem Statement

Shoppers and Staff hit a pile of small but high-friction mobile and customise issues:

- Configurator exit confirmation shows a corner **X** that overlaps **Stay** on mobile.
- Mbolster FAQ (i) uses a fixed corner close; height entry cannot type a decimal point; the customise form still demands a **cover** though inventory/Configure only offer **Bolster Case** (and protector on the BOM).
- When stock cannot fulfill now, the hold path still allows “Low stock” picks but does not communicate **Pre-order**, waiting time, or follow-up — and nothing persists on the **Result**.
- Landing header utilities crowd the logo; Profile sits on the right; hero CTAs cover the product on mobile.
- Science of Sleep measurement cards lay out image beside text instead of stacking text under the image.
- Excess bottom padding and dock hide-on-scroll leave the dock missing at page end.
- Mobile pages can still side-scroll; pinch-zoom should eventually feel app-like after layout is fixed.
- Admin Panel needs a full mobile UX/UI pass; Orders date filters do not drive a real **sales** report (`paid_at`).

Stripe “not set” on deploy was an env ops fix (out of scope for code).

## Solution

Ship one PRD of vertical polish + **Pre-order** (ADR 0005):

- Exit and Mbolster FAQ dialogs: no overlapping corner X; FAQ close sits below the accordion.
- Mbolster: case-only **Customer preference** (auto-select when one eligible case); height draft string while typing; no Cover Style.
- **Pre-order** on Mpillow + Mbolster: live CTA + waiting-time i18n section when preference stock or composed sellable buildable is 0; sticky mode on the **Result**; automated restock email to `held`/`assigned` Pre-order Results; new sessions flip back to **Proceed** when stock recovers.
- Landing: Profile left (signed-in); logo not eaten by utilities; mobile hero CTAs lowered inside the same hero image container.
- Science of Sleep: same MeasureTile — image on top, text below.
- Dock: show near page end; trim double bottom padding; then overflow fixes, then site-wide pinch-zoom lock.
- Full `/settings/*` mobile usability pass; Orders list + summary filtered by **`paid_at`**.

## User Stories

1. As a mobile visitor exiting a configurator, I want Stay and Exit without a corner X overlapping Stay, so that I can dismiss cleanly.
2. As a desktop visitor, I want existing desktop exit behavior preserved unless the shared exit dialog is used, so that desktop is not redesigned for free.
3. As a mobile visitor opening Mbolster FAQ (i), I want the close control below the FAQ accordion, so that it does not fight the content as a fixed overlay.
4. As a visitor entering height in meters, I want to type digits and a decimal point without the field resetting, so that I can enter values like 1.68.
5. As a visitor on Mbolster preview, I want only Bolster Case as a **Customer preference**, so that the form matches inventory/Configure.
6. As a visitor on Mbolster when exactly one eligible case exists, I want it auto-selected, so that I am not forced through an empty choice.
7. As a visitor on Mbolster, I do not want a Cover Style picker or “Choose a cover” gate, so that authorize is not blocked by a non-existent preference.
8. As an operator in Configure, I want bolster BOM categories to stay Bolster Case / Protector / packaging (no cover), so that customise and Configure stay aligned.
9. As a visitor whose required preference is out of stock or whose recommended composed sellable is not buildable, I want the CTA to say Pre-order and see a waiting-time section, so that I understand delay before I authorize.
10. As a visitor when stock is available, I want the normal hold CTA (**Proceed**), so that Pre-order copy does not linger after restock.
11. As a visitor placing a Pre-order hold, I want my **Result** to remember Pre-order mode, so that status and Admin Panel stay honest after Stripe.
12. As a Pre-order shopper after restock, I want an automatic email saying stock is back and I can Sign in later to track my customisation (**Result**) status, so that I am not left waiting silently.
13. As a shopper who never Pre-ordered, I do not want restock Pre-order emails, so that mail stays relevant.
14. As a developer, I want Pre-order trigger logic in a small testable module, so that live CTA and hold create agree.
15. As a developer, I want restock notification to be idempotent for `held`/`assigned` only, so that expired/declined/captured Results are not spammed.
16. As a signed-in Customer on landing, I want Profile on the left of the header, so that brand stays centered and utilities are balanced.
17. As a guest, I want the left header empty (Sign in stays on the dock Menu), so that we do not add a second Sign-in door.
18. As a mobile visitor, I want header utilities not to overlap the logo, so that the brand remains readable.
19. As a mobile visitor on the hero, I want Customise and Book appointment lower inside the same hero image container, so that more of the product is visible.
20. As a desktop visitor on the hero, I want the current layout unchanged, so that desktop composition is preserved.
21. As a mobile visitor in Science of Sleep measurement cards, I want the diagram above the title and description, so that each card reads cleanly.
22. As a mobile visitor scrolling marketing pages, I want less empty bottom padding, so that content sits closer to the dock.
23. As a mobile visitor at the end of the page, I want the app dock visible, so that Home and configs remain reachable.
24. As a mobile visitor mid-page, I still want hide-on-scroll-down / show-on-scroll-up behavior, so that reading chrome stays quiet.
25. As a visitor in a configurator past welcome, I want the dock to stay hidden as today, so that wizard chrome is unchanged.
26. As a mobile visitor, I want pages not to side-scroll from wide components, so that layouts stay one column.
27. As a product owner, I want overflow/font fixes first, then a site-wide pinch-zoom lock, so that the PWA feels like a web app after layout is stable.
28. As Staff on any Admin Panel page on a phone, I want stacked, touch-friendly UI without page side-scroll, so that ops work is usable on mobile.
29. As Staff on Orders, I want a date range to filter sales by **`paid_at`**, so that list and summary cards form a period sales report.
30. As Staff, I want unpaid Orders without `paid_at` excluded from that sales window, so that the report means money recognized.
31. As a QA tester, I want staging checklists for Pre-order, Mbolster height/FAQ, landing mobile, dock end-of-page, and Settings mobile, so that device sign-off is repeatable.
32. As a domain expert, I want glossary and ADR 0005 respected, so that Pre-order is not confused with **Order** or soft “low stock.”

## Implementation Decisions

### Modules (deep where it pays)

| Module | Responsibility | Test? |
|--------|----------------|-------|
| **Pre-order trigger** | Pure function: given preference stock + composed buildable → `{ isPreOrder: boolean }` (soft low-stock ignored) | **Yes** |
| **Pre-order Result persistence** | Hold create writes sticky Pre-order mode; Results/Admin can read it | **Yes** (persist shape / mapping) |
| **Pre-order restock notifier** | On inventory recovery, find matching `held`/`assigned` Pre-order Results, send email once, mark notified | **Yes** |
| **Bolster preference policy** | Case-only preferences; no cover lines; auto-select single eligible case | **Yes** |
| **Height draft input** | Draft display string while typing; normalize on blur/Continue | **Yes** (draft vs normalize rules) |
| **Orders paid_at range** | List + dashboard honor `date_from`/`date_to` on `paid_at` | **Yes** |
| **Dock end-of-page visibility** | Hide on scroll-down; show on scroll-up, near top, or near document bottom | **No** (device QA) |
| **MeasureTile layout** | Column: image then text (same component) | **No** |
| **Landing header / hero mobile** | Profile left; logo clearance; CTAs lowered in hero container (mobile only) | **No** |
| **Exit / FAQ dialog chrome** | `hideClose` + inline FAQ close below accordion | **No** (extend existing chrome check if cheap) |
| **Viewport sequence** | (1) overflow + ≥16px inputs (2) then `maximumScale` / `userScalable` lock | **No** |
| **Settings mobile pass** | Full `/settings/*` stacking, touch targets, contained table scroll | **No** (checklist) |

### Technical clarifications

1. **Customer preference:** Mpillow = cover + case; Mbolster = case only (`bolster_case`). Protector stays on **Composed sellable** BOM.
2. **Pre-order CTA:** **Proceed** (in stock) vs **Pre-order** (trigger) — never “Purchase” for the hold path.
3. **Waiting-time copy:** fixed i18n (en-US / zh-CN); not Admin-editable in v1.
4. **Restock email:** automated only; recipients = Pre-order Results in `held` or `assigned`; idempotent.
5. **Stripe env missing on deploy:** ops; not a code slice in this PRD.
6. **Orders sales report:** filter by `paid_at`; v1 = filtered list + summary cards (no CSV requirement).
7. **Dock:** policy A — end-of-page show + existing hide/show; configurator `dock-hidden` unchanged.
8. **Zoom:** overflow first, then site-wide pinch lock (web-app feel); intentional a11y tradeoff.
9. **Settings:** full `/settings/*` mobile usability pass (not priority-pages-only).
10. **Science of Sleep:** fix MeasureTile internal layout only; keep carousel/section shell.
11. **No new soft-reserve;** extends ADR 0002 via ADR 0005.

### Schema / API

- Persist Pre-order mode on the **Result** at hold create (column or equivalent stable field).
- Idempotency marker for restock notice (on Result or side table).
- Hold API: accept bolster preference lines without cover; reject/ignore cover for bolster.
- Orders list + dashboard: apply `date_from` / `date_to` to `paid_at`.
- Restock notifier hook from inventory balance / buildable updates (implementation may use existing sync/cron patterns).

## Testing Decisions

### What makes a good test

- Assert external behavior of pure helpers and API contracts (trigger true/false, date filter, draft height normalization, preference policy).
- Do not snapshot React trees or assert Tailwind class strings in JSDOM.
- Device/visual items are staging checklists, not unit tests.

### Modules to test

| Module | Automated |
|--------|-----------|
| Pre-order trigger | Yes |
| Pre-order persist mapping / hold payload flag | Yes |
| Restock notifier selection + idempotency | Yes |
| Bolster preference policy | Yes |
| Height draft normalize rules | Yes |
| Orders `paid_at` range helper/query | Yes |
| UI chrome / dock / header / MeasureTile / Settings layout | No — staging |

### Prior art

- `lib/configurator/hold-cancel-restore.check.ts`
- `lib/authorization-hold/__tests__/`
- `components/configurator/configurator-mobile-chrome.check.ts`
- Money-flow / Results tests under `lib/results/__tests__/`

## Out of Scope

- Setting `STRIPE_SECRET_KEY` on Vercel (ops; already fixed by operator when missing).
- Separate Pre-order operator queue or SLA track.
- Manual restock-email button in v1.
- Admin-editable waiting-time CMS.
- CSV/PDF export for Orders sales report.
- Soft-reserving inventory on hold.
- Calling held **Results** “Orders” in customer copy.
- Desktop hero redesign; adding header Sign-in for guests.
- Replacing Science of Sleep carousel with a different section type.
- Marketing copy rewrites unrelated to Pre-order / CTA labels.

## Further Notes

- Single backlog PRD (grill decision B): Pre-order lives as vertical slices here, not a separate PRD.
- Publish issues locally under `.claude/PRD-ux-polish-jul2026/issues/` with triage `needs-triage` (repo convention; no external tracker required).
- CONTEXT.md glossary and flagged ambiguities were updated during the grill; keep them in sync when slices land.
