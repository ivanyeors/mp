# PRD: Mobile UX/UI Optimization — Round 2 (Jul 2026)

Status: Draft (needs-triage)
Source: `/code-review xhigh` mobile UX/UI/layout audit (Jul 2026) — 15 verified findings across storefront funnel, shared primitives, configurator, and admin.
Follow-on to: `PRD-ux-polish-jul2026`, `PRD-configurator-mobile-ux`, `PRD-modal-safe-area`.
ADRs: `docs/adr/0009-xray-filling-visuals.md` (sunburst filling picker).
Glossary: `CONTEXT.md` (**Storefront product**, **Variant**, **Result**, **Composed sellable**, **Reference photo**, **Customisation session**, **Tier**).

## Problem Statement

The site had a first mobile pass (`ux-polish-jul2026`: overflow containment, safe-area, pinch-zoom lock, settings shell). That pass left a second tier of mobile friction that a fresh xhigh review surfaced — and most of it sits on the **revenue path** and on shared primitives that every screen inherits:

- **Touch targets are systematically small.** The base `Button` (36/32/36px for default/sm/icon) and `Input` (36px) primitives are all under the ~44px touch minimum with no mobile bump, so mis-taps compound app-wide. Several custom controls that bypass those primitives are worse: **Variant** swatches (~30px), appointment time-slots (36px, 3-across), cart/quantity controls.
- **iOS focus-zoom is re-triggered** in places that override or bypass the (correctly zoom-safe) `Input` primitive with 14px text: the cart coupon field, the quantity stepper (raw `type=number`), and the admin blog editor's raw inputs. The viewport jerks and forces a pinch-out mid-checkout and mid-editing.
- **The primary CTA is not sticky where it matters most.** The cart page pins its checkout CTA on mobile, but the final **checkout** step ("Pay with Stripe") and the **Storefront product** purchase panel do not — the shopper must scroll a long form to find the action that completes the funnel.
- **Dialogs overflow with no scroll.** `DialogContent` is viewport-centered with no `max-height`/internal scroll and no mobile bottom-sheet variant, so any edit dialog taller than the phone clips its top and bottom — the submit button can be unreachable.
- **Hover-only affordances are dead on touch.** The **Reference photo** remove control (`opacity-0 group-hover`), the app-dock item labels and magnify (mouse-only), and tooltip-only labels give touch users no way to act or no visible meaning — on, among others, the primary bottom nav.
- **Touch gestures shoppers expect are missing.** The product image gallery has no swipe/pinch and shows only the first images; the Apple-style card carousel's only nav arrows are near-invisible in dark mode and cards land mid-view with no snap.
- **Configurator picker and heavy effects.** The sunburst filling picker (ADR 0009) blooms wider than its narrow x-ray dive column on phones; `mp-maker` runs 100 particles + an interactive dot pattern with no `!isMobile` gate that the other configurators already use.
- **Media autoplays on cellular.** The home video section auto-loads and autoplays a full YouTube iframe on scroll-into-view with no click-to-play facade.
- **One admin editor has no mobile fallback.** The rules-engine workbench forces a three-panel row with a fixed 288px inspector; on a phone the canvas is an unusable ~70px sliver.

## Solution

One PRD of vertical mobile slices, ordered **altitude-first** (fix the shared primitive once rather than per-caller), then per-surface, each guarded by a `.check.ts` token-assert and signed off on a real-device matrix:

- **Primitives (highest blast radius):** give `Button`/`Input` a mobile min-height (≥44px on `max-md`) without disturbing desktop density; give `DialogContent` a mobile `max-height` + internal scroll (bottom-sheet affordance where natural).
- **iOS zoom sweep:** route the coupon field, quantity stepper, and blog editor inputs through the zoom-safe `Input` (or `text-base` on `max-md`); add a source-scan guard so no customer-facing input ships <16px on mobile again.
- **Sticky mobile CTA pattern:** extract the cart page's mobile sticky action bar into a shared, dock-clearing helper and apply it to the **checkout** Pay CTA and the **Storefront product** purchase panel.
- **Custom tap targets:** lift **Variant** swatches and appointment slots to ≥44px.
- **Touch affordance:** replace hover-only reveals with touch/focus-visible reveals (Reference photo remove); give app-dock items a visible label and adequate hit size on touch.
- **Gestures/media:** add swipe + pinch (and show all images) to the product gallery; fix carousel arrow contrast + scroll-snap; put a click-to-play facade on the home video on mobile.
- **Configurator:** clamp the sunburst filling picker to its container width; gate `mp-maker` background effects behind `!isMobile` (matching `mp-config`/`mbolster-config`).
- **Admin:** stack the rules-engine workbench (collapsible inspector) and make the blog editor usable on a phone.
- **Sign-off:** an `OPS-STAGING-QA.md` device matrix (iOS Safari + Android Chrome @ ~390px), Pass/Fail per slice, HITL.

## User Stories

1. As a mobile shopper, I want buttons and inputs large enough to tap accurately, so that I stop mis-hitting neighboring controls and retrying.
2. As a mobile shopper, I want icon-only actions (close, remove, edit) to be comfortably tappable, so that I can act with a thumb without zooming.
3. As a developer, I want the touch-target fix in the shared `Button`/`Input` primitives, so that every screen benefits from one change instead of per-component patches.
4. As a designer, I do not want desktop button density to change, so that the mobile min-height applies only below the `md` breakpoint.
5. As a mobile shopper applying a coupon, I want the field not to zoom the page when I focus it, so that the cart layout stays put and I do not pinch out.
6. As a mobile shopper editing quantity, I want to type or step the value without an iOS zoom, and with tappable +/- controls, so that I do not change the wrong amount.
7. As a developer, I want a guard that fails CI if a customer-facing input renders below 16px on mobile, so that iOS zoom regressions cannot ship.
8. As a mobile shopper at checkout, I want the "Pay with Stripe" action to stay reachable while I scroll the form, so that I can complete payment without hunting for the button.
9. As a mobile shopper on a **Storefront product** page, I want the Add-to-Cart action to remain reachable as I read specs, so that I can buy without scrolling back up.
10. As a developer, I want the mobile sticky action bar extracted into one shared, dock-clearing helper, so that checkout, cart, and product pages behave identically and clear the bottom dock and safe area.
11. As a mobile shopper choosing a **Variant** (size/**tier**/firmness), I want swatches at least 44px tall, so that I select the right option first time.
12. As a mobile visitor booking an appointment, I want time-slot buttons large enough to tap, so that I do not select the adjacent time.
13. As a mobile user opening an edit dialog taller than my screen, I want the dialog body to scroll with the submit button reachable, so that I am not stuck with clipped content.
14. As a mobile staff member uploading a **Reference photo**, I want the remove control visible without hovering, so that I can delete a wrong photo on a touch device.
15. As a mobile user of the bottom app-dock, I want each item to show a label and be large enough to tap, so that I know what each icon does and hit the right one.
16. As a mobile shopper on a product page, I want to swipe through product images and pinch to zoom, so that I can inspect the product as I would on any store.
17. As a mobile shopper, I want to reach every product image, not just the first few, so that I see the full gallery before buying.
18. As a mobile visitor using a card carousel, I want visible navigation controls (including in dark mode) and cards that snap into place, so that I can browse without cards stopping half-shown.
19. As a mobile visitor on the home page, I do not want a video to auto-stream on cellular data, so that I control data usage; I want a tap-to-play poster instead.
20. As a mobile visitor whose video I chose to play, I want it to start on tap, so that the facade adds no friction.
21. As a mobile customer or staff member customising a pillow, I want the sunburst filling picker to fit within its x-ray dive column, so that wedges do not overflow or overlap and I can tap the right filling family.
22. As a mobile user of `mp-maker`, I want background particle/dot effects disabled, so that scrolling and dragging stay smooth on a mid-range phone.
23. As a developer, I want `mp-maker` to gate effects behind `!isMobile` like `mp-config`/`mbolster-config`, so that the configurators are consistent and covered by the same check.
24. As a mobile staff member editing rule graphs, I want the workbench to stack (with a collapsible inspector), so that the canvas is usable instead of a thin sliver.
25. As a mobile staff member writing a blog post, I want form fields that do not zoom and an editor sized for the phone, so that authoring on mobile is workable.
26. As a QA reviewer, I want a device sign-off matrix (iOS Safari + Android Chrome @ ~390px) with Pass/Fail per slice, so that mobile fixes are verified on real hardware before release.
27. As a developer, I want each slice to ship a `.check.ts` token-assert guard, so that the mobile tokens (min-height, safe-area, `!isMobile` gates, text-base) cannot silently regress.
28. As a returning mobile shopper, I want the cart to remain the full-page experience on mobile (already the case via the cart-shell redirect), so that this PRD does not regress it.
29. As a mobile shopper removing a cart line, I want the remove control large enough that I do not accidentally open the product instead, so that editing the cart is safe.
30. As a designer, I want touch fixes to reuse the existing safe-area vars and `lib/sheet/safe-area` helpers, so that clearance stays consistent with the prior mobile pass.

## Implementation Decisions

**Ordering is altitude-first.** Shared primitives (Slices 1–2) land before per-surface work so downstream callers inherit the fix; the iOS-zoom sweep and the shared sticky-CTA helper follow, then per-surface slices, then admin, then sign-off.

Modules to build or modify (deep, testable units in **bold**):

- **`Button` / `Input` size tokens** (shared UI primitives): add a `max-md` min-height so default/sm/icon sizes reach ≥44px on mobile while desktop heights are unchanged. Interface (variant API) is unchanged; only the class tokens change.
- **`DialogContent` mobile behavior** (shared UI primitive): add mobile `max-height` + internal `overflow-y-auto` (and a bottom-sheet-style affordance where natural) without altering the desktop centered dialog. No API change for callers.
- **Zoom-safe input contract**: the `Input` primitive already ships `text-base` (16px) until `md`. Route the coupon field, the quantity stepper (currently a raw `type=number`), and the blog editor's raw inputs through `Input`, or apply `max-md:text-base`. Add a **source-scan guard** module that fails when a customer-facing input in the storefront renders below 16px on mobile.
- **`MobileStickyActionBar` helper** (new shared module, sibling to `lib/sheet/safe-area`): extract the cart page's mobile sticky bottom action bar into one component/util that pads for `--mobile-bottom-clearance` + `env(safe-area-inset-bottom)` and hides at `md`. Apply to the checkout Pay CTA and the purchase panel; the cart page adopts the shared version.
- **Touch-target lift for custom controls**: `Variant` swatch buttons and appointment time-slot buttons gain ≥44px min-height (they bypass `Button`, so the primitive fix does not cover them).
- **Touch-visible affordance**: replace `opacity-0 group-hover:opacity-100` on the **Reference photo** remove control with a touch/focus-visible reveal; give app-dock items a visible label and adequate hit size on touch (magnify remains a desktop enhancement).
- **Product gallery gestures** (`Storefront product` detail): add horizontal swipe + pinch-zoom on touch and render the full image set, not just the first few.
- **Carousel polish** (Apple-style cards): theme-aware arrow colors (visible in dark mode), `snap-x`/`snap-mandatory` on the track, trim the wasted right margin.
- **Media facade**: the YouTube-on-view component gains a click-to-play poster facade on mobile so no iframe auto-streams on cellular.
- **Sunburst filling picker sizing** (ADR 0009): the picker sizes to its x-ray dive column width (responsive `size`) instead of a fixed 220/200px, so it never overflows the column on phones.
- **`mp-maker` effect gate**: wrap `Particles`/`DotPattern` behind `!isMobile` (via `useIsMobile`) to match `mp-config`/`mbolster-config`; extend `configurator-mobile-chrome.check.ts` to assert the gate.
- **Rules-engine workbench layout**: `max-md` column stacking with a collapsible/toggled inspector so the ReactFlow canvas is usable on mobile.
- **Blog editor mobile**: zoom-safe fields (covered by the zoom sweep) + a responsive editor height/toolbar.

No schema changes. No API contract changes. Reuse existing infra: `hooks/use-mobile.ts` (`useIsMobile`, 768px), `lib/sheet/safe-area.ts`, and the `--safe-*` / `--mobile-*` CSS vars in `app/globals.css`.

## Testing Decisions

A good test here asserts **observable mobile behavior/tokens**, not implementation details: the presence/absence of the Tailwind tokens that encode the mobile contract (min-height, `max-md:text-base`, safe-area padding, `!isMobile` gates), and static render output for chrome pieces — never internal state.

- **Per-slice `.check.ts` token-asserts** (project convention — see `components/ui/mobile-overflow.check.ts`, `components/settings/settings-mobile.check.ts`, `components/configurator/configurator-mobile-chrome.check.ts`): each slice ships (or extends) a `.check.ts` that `assert.match`/`assert.doesNotMatch` on the relevant source, run via `npx tsx …check.ts`. Prior art is the exact pattern already used for the earlier mobile slices.
- **`renderToStaticMarkup` asserts** for shared chrome (the sticky action bar, dialog), mirroring `configurator-mobile-chrome.check.ts`.
- **One vitest test** for the real logic: the zoom-safe input source-scan (asserts no customer-facing storefront input renders <16px on mobile). Prior art: existing `vitest` suites and `lib/sheet/__tests__`.
- **`OPS-STAGING-QA.md` device matrix** (iOS Safari + Android Chrome @ ~390px), one row per slice, Pass/Fail/N/A, HITL sign-off before release — mirroring `PRD-ux-polish-jul2026/OPS-STAGING-QA.md`. Real devices required for Pass; responsive-mode is smoke-only.

Modules explicitly tested: `Button`/`Input` tokens, `DialogContent` mobile, `MobileStickyActionBar`, the zoom-safe source scan, the `mp-maker` effect gate, and the sunburst sizing.

## Out of Scope

- Anything the first mobile pass already fixed and guards (page overflow containment, pinch-zoom lock, safe-area shell, settings admin shell rows in `settings-mobile.check.ts`) — do not re-solve.
- The mobile **cart** experience: already a full-page redirect via `cart-shell` on mobile; not a popover. No change.
- **Sizing photo** capture and any configurator business logic, pricing (**Costings**/**MSRP**), or **Result**/hold flows — visual/interaction only.
- Desktop layout/density changes; net-new features; adding UI dependencies (carousel/gallery gestures use existing libs or a few lines, not a new package).
- A full admin/settings mobile re-pass beyond the two named editors (rules-engine workbench, blog editor).

## Further Notes

- The dominant theme is **altitude**: two primitive slices (`Button`/`Input`, `Dialog`) plus one shared `MobileStickyActionBar` are the highest-leverage work — do them first.
- Verified-and-refuted during the review (kept here so they are not re-raised): the mobile cart is a full page, not the popover; home/marquee/carousel overflow is already contained; the `Input` primitive itself is already zoom-safe (the zoom bugs are overrides/bypasses); most admin tables already use the shadcn `Table` overflow wrapper.
- Reference-photo work is recent (`PRD-configurator-staff-reference-photos`, merged PR #52); the remove-affordance fix belongs to that surface's `config_upload` **Reference photo** flow.
- Priority: customer-facing funnel slices are P1-worthy at triage; shared primitives are high-reach; staff/admin editor slices are lower priority.
