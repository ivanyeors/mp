# Slice 05 — Staging mobile QA signoff

Type: HITL
Parent: PRD `configurator-mobile-ux` (`.claude/PRD-configurator-mobile-ux/configurator-mobile-ux-prd.md`)
Triage: in-progress (checklist + AFK preflight ready; device matrix open)
User stories covered: 46–47, 49–50

## What to build

Human staging / device sign-off checklist for both configurators after slices 01–04. No new product features — verify end-to-end mobile UX and cancel restore; spot-check desktop unchanged chrome where specified.

## Acceptance criteria

- [ ] Mpillow full (mobile): option rows for gender/age/BP/firmness; Customise CTA; hybrid validation errors; bottom Close + centered exit dialog; solid bg after Get Started; tighter padding.
- [ ] Mpillow basic (mobile): same chrome/validation patterns; Continue CTA; cancel restore to preview.
- [ ] Mbolster (mobile): shared chrome (Close, bg, padding, exit dialog); no new demographic questions; Continue; cancel restore to preview.
- [ ] Multi-select pills and Cover Style picker still behave as before (not redesigned).
- [ ] Desktop: option rows present; bg effects and toast exit still as pre-PRD for those concerns; Stripe cancel still restores preview.
- [ ] Stripe Checkout itself unchanged aside from return-to-preview behavior.
- [ ] Sign-off notes recorded (device/browser matrix: at least one iOS Safari and one Android Chrome).

## Blocked by

- [01-single-select-rows-cta-copy.md](./01-single-select-rows-cta-copy.md) — done
- [02-mobile-chrome-close-bg-padding.md](./02-mobile-chrome-close-bg-padding.md) — done
- [03-step-validation-field-errors.md](./03-step-validation-field-errors.md) — done
- [04-stripe-cancel-restore-preview.md](./04-stripe-cancel-restore-preview.md) — done

---

## Preflight (AFK) — 2026-07-11

### Deploy gate (do this first)

Local `main` is **3 commits ahead of `origin/main`**. Production (`work.mpillow.com` / `mp-inv.vercel.app`) does **not** include slices 01–04 yet.

Commits to ship before device QA:

| SHA | Slice coverage |
|-----|----------------|
| `72a7e4a9` | 01 — single-select rows + CTA copy |
| `8aefb4d6` | 02 + 04 — mobile chrome + hold-cancel restore |
| `b30efd73` | 03 — step validation + field errors |

**Options:**

1. Push `main` → wait for production deploy, then QA on `https://work.mpillow.com` (or `https://mp-inv.vercel.app`).
2. Or push a branch / `vercel deploy` preview and QA that URL.
3. Or local: `npm run dev` + phone on same LAN / ngrok — Stripe cancel needs a public `cancelUrl` host that matches hold route origin.

Stripe test mode: use existing test keys; cancel Checkout (X / back) must hit `?hold_cancelled=1` on the configurator path.

### Automated checks (all ok)

```bash
npx tsx components/configurator/single-select-option-rows.check.ts
# → single-select-option-rows.check.ts: ok

npx tsx components/configurator/configurator-mobile-chrome.check.ts
# → configurator-mobile-chrome.check.ts: ok

npx tsx lib/configurator/step-validation.check.ts
# → step-validation.check.ts: ok

npx tsx lib/configurator/hold-cancel-restore.check.ts
# → hold-cancel-restore.check.ts: ok
```

### Code-audit wiring (AFK proxy — not a device pass)

| AC theme | Evidence |
|----------|----------|
| Option rows gender/age/BP/firmness | `SingleSelectOptionRows` in `mp-config-client.tsx`; mp-basic via `variantFromPathname` |
| Customise / Continue CTA | Full: `Customise`; basic: `Continue`; Mbolster advance: `Continue` |
| Hybrid validation | `hybridCtaEnabled` + `buildFieldErrorMap` + `fieldErrors` on mp + mbolster; option-row `invalid`/`error` |
| Mobile Close + exit Dialog | `ConfiguratorMobileCloseBar` + `ConfiguratorExitDialog` when `isMobile`; desktop `toast.message("Exit configuration?")` |
| Solid bg post-welcome (mobile) | Effects gated `!isMobile` / welcome-only on mobile |
| Tighter padding | `configuratorOuterPadClassName` / `configuratorCardPadClassName` |
| No Mbolster demographics | No gender/age/BP/firmness in `mbolster-config-client.tsx` |
| Hold cancel → preview | `hold-cancel-restore` draft + `?hold_cancelled=1`; server `cancelUrl` already appends flag |
| Cover Style / multi-select | Unchanged controls; pills still used for sleep pain / sleep position multi |
| Stripe Checkout UI | Out of scope — only cancel return path |

---

## Staging checklist (HITL)

Fill **Pass / Fail / N/A** and notes. Minimum matrix: **1× iOS Safari** + **1× Android Chrome**. Desktop spot-check once (any modern browser).

### Environment

| Field | Value |
|-------|-------|
| Base URL | _e.g. https://work.mpillow.com or preview URL_ |
| Build / commit | _SHA after push_ |
| Stripe mode | test / live |
| Tester | |
| Date | |

### Device matrix

| Device | OS | Browser | Result | Notes |
|--------|-----|---------|--------|-------|
| | iOS | Safari | | |
| | Android | Chrome | | |
| Desktop | | | | spot-check only |

### Paths

| Surface | Path |
|---------|------|
| Mpillow full | `/{lang}/mp-config` |
| Mpillow basic | `/{lang}/mp-basic` |
| Mbolster | `/{lang}/mbolster-config` |

### A. Mpillow full (mobile)

| # | Check | Pass? | Notes |
|---|-------|-------|-------|
| A1 | After Get Started: no Particles/RetroGrid; solid background | | |
| A2 | Tighter side padding vs old (cards/options use more width) | | |
| A3 | No top-right X; bottom Close visible (clears home indicator) | | |
| A4 | Close → centered Stay/Exit dialog (not toast) | | |
| A5 | Exit clears session → back at start | | |
| A6 | Gender / age = full-width option rows (tap replaces selection) | | |
| A7 | Empty step: primary CTA disabled | | |
| A8 | Partial fill: CTA on; submit shows per-field errors (incl. option-row border + helper) | | |
| A9 | Fixing a field clears that error only | | |
| A10 | BP / bed firmness = option rows; ear/acid/bolster Tabs unchanged | | |
| A11 | Sleep pain / sleep position = pill multi-select (unchanged) | | |
| A12 | Additional-questions primary CTA = **Customise** | | |
| A13 | Preview: Cover Style picker looks/behaves as before | | |
| A14 | Authorize with missing cover/case/email/shipping/address → field errors (not toast-only) | | |
| A15 | Start hold → cancel Stripe → land on **preview** with cover/case/shipping/email intact + light cancelled notice | | |

### B. Mpillow basic (mobile)

| # | Check | Pass? | Notes |
|---|-------|-------|-------|
| B1 | Same mobile chrome as full (Close, solid bg, padding, exit dialog) | | |
| B2 | Option rows + hybrid validation where those steps exist | | |
| B3 | Customize-step primary CTA = **Continue** (not Customise) | | |
| B4 | Hold cancel → preview restore (same pattern as full) | | |

### C. Mbolster (mobile)

| # | Check | Pass? | Notes |
|---|-------|-------|-------|
| C1 | Shared chrome: Close, solid bg post-welcome, padding, exit dialog | | |
| C2 | **No** gender/age/BP/bed firmness questions | | |
| C3 | Height / sleep-position: hybrid CTA + field errors | | |
| C4 | Advance CTAs = **Continue** | | |
| C5 | Cover Style / multi-select add-ons unchanged language | | |
| C6 | Hold cancel → preview with selections + cancelled notice | | |

### D. Desktop spot-check (any browser)

| # | Check | Pass? | Notes |
|---|-------|-------|-------|
| D1 | Option rows present (not Selects) for gender/age/BP/firmness | | |
| D2 | Animated backgrounds still run post-welcome | | |
| D3 | Top-right X → **toast** Stay/Exit (not centered Dialog) | | |
| D4 | Existing desktop padding unchanged feel | | |
| D5 | Stripe cancel still restores preview | | |

### E. Stripe Checkout scope

| # | Check | Pass? | Notes |
|---|-------|-------|-------|
| E1 | Checkout page UI / hold amount unchanged (only cancel return) | | |

### Sign-off

| Role | Name | Date | Verdict |
|------|------|------|---------|
| QA | | | Pass / Fail |
| Product (optional) | | | |

**Blockers / follow-ups:**

-

---

## HITL status

| Deliverable | Status |
|-------------|--------|
| Staging checklist + preflight notes | **Done** (this file) |
| AFK automated preflight (01–04 checks) | **Pass** |
| Code-audit wiring table | **Pass** (proxy only) |
| Deploy with 01–04 commits | **Open** — push/preview before phones |
| iOS Safari + Android Chrome matrix | **Open** — human only |
| AC checkboxes above | **Open** until matrix signed |
