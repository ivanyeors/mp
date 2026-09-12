# Assisted customisation 01: Domain glossary and ADR — Assist link, Assisted customisation, Balance payment

Tracker: not yet filed (published locally)
Parent: PRD `staff-assisted-customisation` (`.claude/PRD-staff-assisted-customisation/staff-assisted-customisation-prd.md`)
Status: **Built on `feat/staff-assisted-customisation` (f6ecc4f2), unmerged.**
Criteria verified against the code, its unit tests and the `.check.ts`
self-checks. Anything needing live Stripe, a real inbox or a real database is
marked `[~]` and belongs to slice 08.
User stories covered: underpins all

## Parent

PRD: Staff-Assisted Customisation — a link instead of a card

## What to build

Three nouns and one amended decision, written before any code, because every later slice is a sentence about them and because two of the three sit dangerously close to terms that already exist.

**The collision that makes this slice necessary.** `CONTEXT.md` already defines **Staff assist mode** (extra controls on the customisation preview, shared in-store device, **Staff** operating it) and **Partner-assisted customisation** (the configurator launched from **Partner Hub**, partner's device, card taken up front). This initiative adds a third thing that is neither: the customer is alone, on their own device, and no card is taken at all. Without a name of its own it will be called "staff assist" in a commit message within a week, and the `_Avoid_` lines are the part that does the work.

**Assist link** — `/mp-config?assist=<code>`, a reusable per-**Staff** code held on `admin_users`. Server-resolved; the id it resolves to is never accepted from the client. Revoked by rotating the code. *Avoid*: confusing it with a **Referral** `?ref` / `?partner` code, which attributes **Commission** — an **Assist link** attributes nothing and pays nobody.

**Assisted customisation** — a **Customisation session** a **Staff** member originates via an **Assist link**: the customer answers on their own device and submits with no card; **Staff** compose the build in the **Admin Panel**; the customer pays the final price, and the **Result** becomes an **Order**. *Avoid*: **Staff assist mode** (shared device, **Staff** at the controls); **Partner-assisted customisation** (partner's device, **Authorization hold** taken up front); calling the unpaid submission an **Order**.

**Balance payment** — the immediate-capture Stripe Checkout that settles a **Result**: the amount above an **Authorization hold**, or the whole total when there is none. Generalises what the code currently calls a top-up. *Avoid*: renaming the `topup_*` columns (in-flight rows depend on them); calling a full payment a "top-up" in customer-facing copy.

**Source** gains a fourth value, `staff_assisted`, alongside `manual`, `online_customization` and `online_purchase`. The column is free text with no check constraint, so this is a documentation and labelling change, not a migration.

**ADR 0016** records the amendment to ADR 0002 — authorize-then-capture stays the default and stops being the only path — and states the rule that the money slices implement: a **Result** with no **Authorization hold** settles by **Balance payment**, keyed on the absence of a hold rather than on the new **Source** value. ADR 0002 gets a pointer forward, because its own closing line ("in-store measurement-only Results may omit a payment intent") is the loose end this ties off.

Demoable outcome: a reader of `CONTEXT.md` can say, without opening any code, how an **Assisted customisation** differs from **Staff assist mode** and from **Partner-assisted customisation**, and what happens to a **Result** that has no hold.

## Acceptance criteria

- [x] `CONTEXT.md` defines **Assist link**, **Assisted customisation** and **Balance payment**, each with an `_Avoid_` line naming the terms it is most likely to be confused with.
- [x] The **Source** entry in `CONTEXT.md` lists `staff_assisted` and says what originates it.
- [x] The relationships section records that an **Assisted customisation** takes no **Authorization hold**, and that its **Result** reaches **Order** through a **Balance payment**.
- [x] `docs/adr/0016-deferred-payment-for-assisted-builds.md` exists with Context / Decision / Consequences, and names `capture` as the sole remaining guard against an **Order** without money.
- [x] ADR 0002 points forward to 0016 rather than being edited to pretend it always said this.
- [x] No code change and no schema change in this slice.

## Blocked by

None — start here.
