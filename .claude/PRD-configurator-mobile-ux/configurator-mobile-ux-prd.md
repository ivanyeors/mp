# PRD: Configurator Mobile UX

Status: Draft (needs-triage)
Source: Grill session + plan `config_mobile_ux_prd_5d686d8f` (Jul 2026)

## Problem Statement

Visitors customising an **Mpillow** or **Mbolster** on a phone struggle with the full-page configurator: demographic answers hide behind dropdown Selects that are awkward on touch; side padding wastes horizontal space; animated Particles/RetroGrid keep burning CPU after Get Started; exit uses a top-right X plus a Sonner toast that feels broken as a “popup”; incomplete fields silently disable Continue instead of showing where to fix; and cancelling Stripe Checkout for an **Authorization hold** often dumps them back at welcome instead of the cover/case customisation screen they left.

Desktop is largely fine. The pain is mobile usability, visual clarity, and not losing progress when backing out of payment.

## Solution

From the visitor’s perspective:

- Single-choice questions (gender, age group, blood pressure, bed firmness) become tappable full-width option rows — the same language as Cover Style — while multi-select answers stay pill chips.
- On mobile, after Get Started the flow is a calm solid background (no particle/grid effects), with tighter side padding and a bottom Close control that opens a proper centered exit confirmation.
- Tapping Continue / Customise with incomplete answers highlights the wrong or empty fields.
- Cancelling Stripe returns them to the customisation/preview screen with their **Customer preference** and hold-prep choices intact so they can try again.

From the developer’s perspective: shared single-select rows, mobile-only chrome/perf tweaks, a small validation helper, client persistence so hold cancel restores preview, and CTA copy aligned to the product family — without adding Mbolster demographic questions or changing desktop exit/bg behavior.

## User Stories

1. As a visitor on Mpillow full config, I want gender choices as full-width option rows, so that I can tap once without opening a dropdown.
2. As a visitor on Mpillow full config, I want age group choices as full-width option rows, so that I can scan and select on a phone.
3. As a visitor on Mpillow full or basic config, I want blood pressure choices as full-width option rows, so that the “few more questions” step matches Cover Style.
4. As a visitor on Mpillow full or basic config, I want bed firmness choices as full-width option rows, so that I do not use a Select for a short list.
5. As a visitor on desktop Mpillow config, I want the same option rows instead of Selects, so that one selection pattern is maintained across breakpoints.
6. As a visitor answering sleep pain areas, I want pill chips to remain multi-select, so that single-select rows and multi-select chips stay visually distinct.
7. As a visitor answering sleep position type (multi), I want pill chips unchanged, so that existing multi-select UX is not regressed.
8. As a visitor on Mbolster config, I do not want new gender/age/BP/bed firmness questions, so that bolster customisation stays height- and sleep-position-based.
9. As a mobile visitor after Get Started on Mpillow, I want Particles and RetroGrid gone and a solid background, so that the wizard feels faster and calmer.
10. As a mobile visitor after Get Started on Mbolster, I want Particles/DotPattern gone and a solid background, so that post-welcome steps are lighter.
11. As a desktop visitor on either configurator, I want animated backgrounds unchanged, so that desktop atmosphere is preserved.
12. As a mobile visitor on the welcome step, I still want the existing welcome atmosphere if present, so that Get Started remains the moment effects stop.
13. As a mobile visitor mid-wizard, I want less horizontal padding, so that cards and option rows use more of the screen.
14. As a mobile visitor on preview/customisation, I want tighter side padding, so that cover/case and shipping controls are not squeezed by excess gutter.
15. As a desktop visitor, I want existing padding unchanged, so that large-screen layout does not shift.
16. As a mobile visitor past welcome, I want a bottom Close control in the same language as other mobile popups, so that exit is obvious and thumb-reachable.
17. As a mobile visitor, I do not want a top-right X, so that progress chrome is cleaner and exit has one clear affordance.
18. As a mobile visitor tapping Close, I want a centered confirmation dialog, so that exit is not a toast that looks broken.
19. As a mobile visitor in the exit dialog, I want clear Stay vs Exit actions, so that I do not lose a session by accident.
20. As a desktop visitor, I want the top-right X and existing toast exit confirm unchanged, so that desktop exit behavior is not redesigned in this PRD.
21. As a visitor on full Mpillow at the additional-questions step, I want the primary CTA labeled Customise, so that language matches entering customisation rather than “generating results.”
22. As a visitor on Basic Mpillow at that step, I want the primary CTA labeled Continue, so that basic flow language stays simple.
23. As a visitor on Mbolster mid-wizard, I want Continue labels where advance is needed, so that bolster copy stays consistent.
24. As a visitor who has not entered anything on a step, I want the primary CTA disabled, so that empty steps do not invite pointless taps.
25. As a visitor who has entered something on a step, I want the primary CTA enabled, so that I can attempt to continue and see what is still missing.
26. As a visitor who taps Continue with incomplete required fields, I want those fields to show an error state, so that I know what to fix.
27. As a visitor who taps Customise with incomplete additional questions, I want blood pressure / bed firmness (and other required answers) highlighted, so that I am not blocked silently.
28. As a visitor who fixes an errored field, I want that field’s error to clear, so that feedback stays accurate.
29. As a visitor with an invalid measurement, I want an error on that field when I submit, so that wrong values are visible in place.
30. As a visitor on Mbolster with missing height or sleep position, I want field-level errors on submit once the step is partially filled, so that bolster validation matches Mpillow.
31. As a visitor on preview missing cover, case, email, or shipping, I want those areas to show error state on authorize attempt, so that toasts alone are not the only signal.
32. As a visitor who cancels Stripe Checkout for an Authorization hold on Mpillow, I want to land on the preview/customisation screen, so that I do not restart the wizard.
33. As a visitor who cancels Stripe on Mbolster, I want to land on the preview/customisation screen, so that cover/case and shipping choices remain.
34. As a visitor returning from hold cancel, I want my Customer preference (cover/case), add-ons, shipping, and email preserved when possible, so that retry is one tap away.
35. As a visitor returning from hold cancel, I want a light indication that payment was cancelled, so that I understand why I am back.
36. As a visitor who uses browser back from Stripe when cancel URL applies, I want the same restore behavior, so that back and cancel feel consistent.
37. As a visitor on desktop who cancels Stripe, I want the same preview restore behavior, so that the flow bug is fixed on every device even when chrome changes are mobile-only.
38. As a visitor who exits via Close/Exit, I want session clear behavior preserved (return to start/home as today), so that intentional abandon still resets.
39. As a visitor on mp-basic, I want the same single-select rows, mobile chrome, validation, and cancel restore as full Mpillow where those steps exist, so that basic is not a second-class path.
40. As a developer, I want a shared single-select option-row control styled like Cover Style, so that gender/age/BP/firmness do not fork CSS.
41. As a developer, I want pill chips reserved for multi-select only, so that selection affordances stay consistent.
42. As a developer, I want mobile bg/Close/padding gated by breakpoint, so that desktop layout and effects stay untouched for those concerns.
43. As a developer, I want Mpillow wizard step + preview selections persisted enough to restore preview after hold cancel, so that cancel URL is not a soft restart.
44. As a developer, I want a small validation helper with an automated check, so that hybrid enablement and required-field maps do not regress silently.
45. As a developer, I want automated tests for hold-cancel restore logic, so that Stripe cancel → preview stays reliable.
46. As a QA tester, I want a staging mobile checklist for Mpillow and Mbolster, so that device sign-off is repeatable.
47. As a product owner, I want Mbolster limited to shared chrome and restore (no new demographics), so that scope stays honest to the bolster domain model.
48. As a visitor using yes/no Tabs (ear discomfort, acid reflux, uses bolster), I want those controls unchanged in this PRD, so that only former Selects move to option rows.
49. As a visitor on the Cover Style picker itself, I want that control unchanged except as the visual reference, so that preference picking is not redesigned here.
50. As a visitor authorizing payment, I want Stripe Checkout itself unchanged, so that only cancel return behavior is in scope.

## Implementation Decisions

### Modules

| Module | Responsibility |
|--------|----------------|
| **Single-select option rows** | Shared control matching Cover Style (`ComponentOptionButton` language): full-width bordered row, selected = primary border + check; used for gender, age group, blood pressure, bed firmness on mp-config / mp-basic |
| **Configurator mobile chrome** | Below `md`: tighter side padding (`p-4`→`px-3`, card `p-8`→`p-5` as baseline); bottom Close (OverlayDismissButton-style); no top X; solid `bg-background` after welcome (unmount Particles/RetroGrid/DotPattern). Desktop: keep effects, padding, top X |
| **Step validation helper** | Hybrid CTA enablement; on submit build field error map; clear errors as values become valid; usable from Mpillow and Mbolster steps + preview authorize |
| **Mobile exit Dialog** | Centered modal on mobile only for exit confirm; desktop keeps toast |
| **Hold-cancel restore** | Persist/restore preview step + selections for Mpillow; harden Mbolster; `?hold_cancelled=1` opens preview with optional cancelled notice |

### Technical clarifications

1. **Selection language:** Cover-style rows = single-select. Pill chips = multi-select only.
2. **CTA copy:** Full Mpillow additional-questions primary = `Customise`. Basic = `Continue`. Mbolster advance = `Continue`.
3. **BG effects:** Mobile-only change after Get Started. Welcome may keep effects. Desktop unchanged.
4. **Stripe cancel destination:** Preview / customisation (Customer preference + hold prep), not welcome and not the additional-questions step.
5. **No Mbolster demographics:** Shared chrome, validation patterns, and restore only.
6. **No new CONTEXT.md terms / no ADR:** UI and client persistence; domain terms already exist (Customer preference, Authorization hold, Result).
7. **Primary surfaces:** `mp-config-client`, `mbolster-config-client`, shared option-row + validation helpers; hold `cancelUrl` already points at config paths — client must honor restore.

### Schema / API

No schema changes required. Hold cancel URL already returns to configurator with `hold_cancelled=1`. Client persistence is local (localStorage/session) unless an existing response id already covers measurement reload.

## Testing Decisions

### What makes a good test

- Test external behavior of helpers (validation enablement rules, error map for incomplete required fields; restore payload → preview step), not React tree snapshots or pixel layout.
- Do not unit-test Particles unmount or Tailwind padding classes in JSDOM.

### Modules to test

| Module | Automated? | Rationale |
|--------|------------|-----------|
| Step validation helper | **Yes** | Hybrid enablement + error map — high regression risk |
| Hold-cancel restore logic | **Yes** | Stripe cancel path — high regression risk |
| Single-select option rows | **No** | Visual; covered by staging QA |
| Mobile chrome / exit Dialog | **No** | Visual/device; staging QA |
| CTA copy strings | **No** | Trivial; staging QA |

### Prior art

- Small assert/check files co-located with helpers (repo pattern: `*.check.ts` / focused unit tests under `lib/`).
- Authorization-hold and checkout tests exist for server cancel URL shape; client restore is new coverage.

## Out of Scope

- Adding gender, age, blood pressure, or bed firmness to Mbolster
- Redesigning Cover Style / case pickers, add-on chips, or shipping method UI beyond error highlighting
- Changing multi-select pill chip design
- Desktop animated backgrounds, desktop exit modal, or moving desktop Close to the bottom
- Stripe Checkout page UI, pricing, or hold amount logic
- i18n expansion beyond the CTA strings touched in this work (unless existing message keys already cover them)
- mp-maker operator UI

## Further Notes

- Vertical slices live in `.claude/PRD-configurator-mobile-ux/issues/`.
- Safe-area for bottom Close should follow existing slide-in footer patterns (`--safe-bottom`) so Close clears the home indicator.
- When implementing restore, prefer the minimum persistence that returns the user to preview with preferences intact; do not rebuild a full offline form framework.
