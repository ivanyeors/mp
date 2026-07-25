# Staging device QA — Mobile UX/UI Optimization R2 (Jul 2026)

Parent PRD: #53. Branch: `feat/mobile-ux-r2`.

Matrix: iOS Safari + Android Chrome @ ~390px. Mark **Pass / Fail / N/A** on a **real device** (Safari Responsive Mode / Chrome device toolbar is smoke-only, not a Pass). File follow-up issues under #53 for any Fail.

**Automated gate (already green on the branch — see bottom):** `next build` ✓, `tsc --noEmit` ✓, 14/14 `.check.ts` token-asserts ✓, `input-zoom-safe` vitest 41/41 ✓. The device columns below verify the *rendered/interactive* behavior the token-asserts can't see.

| Issue | Slice | Auto | iOS | Android | Notes / what to physically verify |
|-------|-------|------|-----|---------|-----------------------------------|
| #54 | Button/Input ≥44px touch baseline | ✓ | | | Tap default/sm/icon buttons + inputs; no mis-taps; desktop density unchanged |
| #55 | Dialog mobile scroll | ✓ | | | Open a tall edit dialog; body scrolls, header + submit reachable; desktop dialogs (self-scrolling ones) unchanged |
| #56 | iOS zoom-safe input sweep | ✓ | | N/A | Focus cart coupon + quantity stepper + blog inputs on **iOS** — no page zoom-jerk |
| #57 | Shared MobileStickyActionBar | ✓ | | | Cart page mobile bar unchanged; clears app-dock + home indicator |
| #58 | Custom tap targets ≥44px | ✓ | | | Variant swatches, appointment slots (3-across), cart remove — all comfortably tappable, no adjacent mis-tap |
| #59 | Touch-visible affordances | ✓ | | | Reference-photo remove visible w/o hover + ≥44px; app-dock items show label + hit size on touch |
| #60 | Product gallery swipe + full set | ✓ | | | **Swipe** advances main image (regression-fixed: was blocked by touch-action); all images reachable |
| #61 | Carousel arrows + scroll-snap | ✓ | | | Arrows visible in **dark mode**; cards snap; no half-shown card / wasted margin |
| #62 | Home video click-to-play facade | ✓ | | | On mobile no iframe until tap (check network); tap plays; desktop autoplay-on-view intact |
| #63 | Sunburst filling picker sizing | ✓ | | | **HITL**: fits x-ray dive column @375px; center trigger tappable (see Known Issue below); pillow + bolster |
| #64 | mp-maker effects gated | ✓ | | | No Particles/DotPattern on mobile; smooth scroll/drag; desktop effects intact |
| #65 | Rules workbench mobile stack | ✓ | | | **HITL**: canvas usable (not a sliver); inspector collapsible drawer; node editing works |
| #66 | Sticky Pay-with-Stripe CTA | ✓ | | | Pay CTA pinned through the checkout form; submits real Stripe path; desktop unchanged |
| #67 | Sticky Add-to-Cart (PDP) | ✓ | | | Add-to-Cart pinned on mobile as you scroll specs; respects out-of-stock; **hidden at md by design** (see note) |
| #68 | Blog editor mobile | ✓ | | N/A | MDEditor ~60dvh (no 500px overflow); reduced toolbar tappable; inputs zoom-safe on iOS |

## Known issues / decisions to sign off (HITL)

1. **#67 — desktop sticky bar removed by design.** `main` showed the PDP add-to-cart sticky bar on *all* viewports; #67's AC says "hidden at md," so the shared bar is now mobile-only. The in-page purchase panel (buy box) is unchanged. **Confirm** dropping the desktop sticky bar is intended; if not, file a follow-up to add a desktop-visible variant.
2. **#63 — sunburst center trigger tap target.** The tap-to-open trigger is only ~28px even at full size (callers pass `holeRadius={18}`); on a narrow x-ray column it shrank to ~9px. We floored the diameter (`MIN_DIAMETER=140`) so it can't collapse, at the cost of a slight open-bloom overflow on sub-140px columns. Enlarging the trigger independent of the bloom is a **visual-design decision** — sign off the current floor or specify a larger trigger.
3. **#60 — pinch-zoom.** Not implemented: the global viewport meta (`user-scalable=false`) locks zoom site-wide, so the previous per-slice `touch-action:pinch-zoom` bought nothing and *broke* swipe — it was removed. Swipe + full image set are the delivered gestures. If pinch is required, it needs a transform-on-gesture handler (new scope).

## How to sign off

1. Deploy `feat/mobile-ux-r2` to staging; open on a real iPhone (Safari) + Android (Chrome) at a ~390px-class device.
2. Walk each row; mark **Pass / Fail / N/A**. iOS-only rows (#56, #68 zoom) are N/A on Android.
3. For each **Fail**, open a follow-up issue under #53 (page → repro → expected).
4. Incremental sign-off is fine as slices land. Sign off the three HITL decisions above explicitly.

## Automated verification (reproduce)

```
npm run build                                   # ✓ compiled, 371/371 pages
npx tsc --noEmit                                # ✓ no new errors
npx vitest run lib/shop/input-zoom-safe.test.ts # ✓ 41/41 — no storefront input <16px on mobile
# 14 token-asserts, e.g.:
npx tsx components/ui/touch-target-baseline.check.ts
npx tsx components/ui/mobile-sticky-action-bar.check.ts
# …see PRD "Testing Decisions" for the full list
```

## Sign-off status (#69)

- [x] Matrix present with a row per implementation slice (#54–#68)
- [x] Automated gate green (build / tsc / checks / vitest)
- [ ] iOS Safari + Android Chrome columns filled on real devices (HITL)
- [ ] Three HITL decisions above signed off
- [ ] Failures filed as follow-up issues under #53
- [ ] Sign-off recorded before release
