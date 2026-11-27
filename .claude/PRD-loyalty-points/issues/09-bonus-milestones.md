# 09 — Bonus milestones: a progress bar to one-time bonuses, for customers who keep coming back

**Issue:** not filed
**Type:** AFK
**Status:** built, and its migration applied to production (2026-10-23). Points are still off
**Blocked by:** 02, 03
**User stories:** 15, 16
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:account`, `area:admin`

## Goal

The owner wants points to make customers buy more: "when the user earns a certain amount of points,
then they will get additional points from us", shown on the Profile "like a progress bar UI, showing
milestones in the bar" (owner, 2026-10-23).

The demo: a customer who has earned 1,750 points from orders sees a bar with four milestones.
The first is ticked. The second is half filled, with "Earn 750 more points from orders to reach
2,500, and we'll add 300 points (S$3)." Their next order's points are released 30 days after
delivery, and the same daily run adds the 300.

## The idea, structured

**What a milestone is.** A number of points earned from orders and a bonus. Reaching it adds the
bonus to the balance once. It is not a tier:

- nothing about earning or spending changes after it;
- nothing is ever taken away;
- the bonus is the whole reward.

Decision 1 ("no tiers") stands. The partner **Milestone track** is a different thing: it counts
attributed units, and its rungs pay cash and raise a commission rate.

**Why points earned, not the balance.** If the balance counted, spending would set a customer back.
They would then be punished for using points, the thing the programme exists to get them to do.
Counting points earned keeps the bar a record of what they have bought.

**Why lifetime, with no resets.** Pillows are bought every two to four years. A yearly reset would
let almost nobody reach a milestone. The partner track has no resets for the same reason.

**Why the 30-day window still applies.** A bonus counts only points already written. A return
inside the window then never leaves a bonus behind. Pending points show on the bar, lighter, so
the customer sees each order move it straight away.

### Owner decision (2026-10-23), and the rules it adds to ADR 0030

16. **Bonus milestones.** Customers get a one-time bonus as the points they earn from orders add
    up, on a ladder the owner sets. The Profile shows it as a progress bar with the milestones on
    it.

- **(s) The ladder.**
  - Up to five milestones, each with a number of points earned and a bonus, both in multiples of
    100. Each milestone needs more points than the one before it.
  - They are held in one setting, `points_milestones`, as "points:bonus" pairs, edited on
    Settings → Discounts → Points.
  - A missing, blank or malformed value means no milestones. It never falls back to a default.
  - The seeded ladder is 1,000 → 100, 2,500 → 300, 5,000 → 800 and 10,000 → 2,000.
- **(t) What counts.** Every `earn` entry, less every `clawback`.
  - Spending and expiry don't set the bar back.
  - The Claim bonus, Staff adjustments and milestone bonuses don't move it.
  - Pending points count once they are written.
- **(u) How many bonuses.** A Customer holds one `milestone_bonus` for each milestone reached,
  numbered from 1, and never more.
  - Changing the ladder never pays a milestone twice. A customer holding two bonuses is owed a
    third only on reaching the third milestone of the ladder as it is then.
  - A new or lowered milestone is granted on the next daily run to everyone already past it.
- **(v) Never taken back.** A refund that takes a customer below a milestone leaves the bonus
  alone. The milestone still pays once.
- **(w) When.** The daily job grants bonuses right after it releases earned points, so a bonus
  lands on the same run as the points that reached it.
  - Nothing is granted while points are off or before the launch. The first run after they are
    live grants what is due.
  - Partners are never granted one (rule r).

## Scope

**SQL** (`20261023120000_points_milestones.sql`).

- **The setting.** `points_milestones` is seeded with the starting ladder. `points_milestones()`
  reads it, lowest first and numbered.
- **The ledger.**
  - `points_ledger` gains the kind `milestone_bonus` (positive) and a `milestone` column, set
    only on that kind.
  - `points_ledger_one_per_milestone` is unique on (Customer, milestone).
- **Progress.** `points_milestone_progress` holds what each Customer earned and the bonuses they
  hold.
- **The grant.**
  - `grant_milestone_bonuses_for(customer)` takes the per-Customer lock the other writers take.
  - `grant_due_milestone_bonuses(p_now)` is the daily sweep.
- **The summary.** `admin_points_summary` gains the bonuses given and their points.

**Daily job.** `runPointsMilestones` chains onto results-sla right after `runPointsEarn`. It
never throws.

**Customer surfaces.**

- **Profile, once live.** The Points card shows the bar (`components/account/milestone-bar.tsx`):
  - an equal stretch per milestone, filled by the points earned, with pending shown lighter;
  - the next bonus named above the bar, each milestone's points below it, and
    "N of M points earned from orders" under that;
  - the whole ladder, each milestone with its bonus, one tap away (redesigned 2026-11-27: the
    card leads with the balance, then the next bonus, and keeps the rules under "How points work").
- **Profile, before the launch.** The "Coming soon" card shows the ladder empty.
- **The terms page** gains a *Bonus milestones* section with the live ladder and rules t to v.
  The terms are now dated 23 October 2026. Points are not launched, so no 30 days' notice is owed.

**Staff surfaces.**

- **Discounts → Points.** A ladder editor: add, remove, at most five. Each row shows roughly what
  a customer spends to reach it and the share back by then. The cost summary counts milestone
  bonuses.
- **Customer detail → Points.** "N points earned from orders: X of Y bonus milestones reached",
  and the entries labelled "Milestone bonus".
- **Documentation.** Settings → Documentation → Mpillow Points explains milestones with the
  live ladder.

## Not in this slice

- **An email when a milestone is reached.** It would be a new customer email, and nothing is sent
  to customers yet. It goes through Email templates when the owner wants it.
- **A customer-facing points history.** It is still the biggest gap on the Profile, and separate
  from this.
- **Milestones on the order page or at checkout,** for example "this order takes you to your next
  milestone". It is a candidate once the bar is live.

## Acceptance criteria

- [x] **The setting.** `points_milestones()` and `parseMilestones` read every case in
      `milestone-cases.json` the same way. Malformed or blank is no milestones.
- [x] **The grant.**
  - [x] One bonus per milestone reached, lowest first, several in one run if one order crosses
        several.
  - [x] A re-run grants nothing, and two concurrent grants write once (dblink race).
  - [x] Spending and expiry don't set the bar back; a clawback does. A bonus is never taken back.
  - [x] A raised ladder grants nothing more. A lowered or longer one grants only the milestones
        not yet held, at today's bonuses.
  - [x] Nothing while points are off or before the launch, nothing for a partner, and nothing
        for the Claim bonus or Staff adjustments.
- [x] **The settings.** The schema refuses a ladder that doesn't climb, amounts that aren't
      multiples of 100, and more than five milestones. The ladder is saved as one row, blank for
      none.
- [x] **The Profile.** It shows the bar with the sentence to the next milestone and pending
      lighter, "every milestone" once all are reached, an empty ladder before the launch, and
      nothing without a ladder.
- [x] **Copy.** The terms list the ladder and rules t to v. The copy names no old platform.
- [x] **The daily job.** It runs the grant right after the release, once, on the job's clock,
      and reports a failure without stopping the jobs after it.
- [x] `./scripts/graphify update .` is run in the same commit.
- [x] Apply `20261023120000_points_milestones.sql` to production (2026-10-23, recorded as
      version `20261023120000`). It seeded the ladder and granted nothing, since points are off.

## Build notes

- **Production (2026-10-23).**
  - Before applying, both checks the migration replaces were confirmed to carry the names it
    drops (`points_ledger_kind_check`, `points_ledger_sign`).
  - Afterwards, checked on production:
    - `points_milestones()` returns the four seeded milestones;
    - the kind check includes `milestone_bonus`, and the unique index exists;
    - anon and authenticated can neither run the new functions nor read
      `points_milestone_progress`;
    - the ledger is still empty;
    - the security advisor reports nothing new.

- **SQL.** `assert-09-milestones.sql` passes against a local Postgres 16 with all 193 migrations.
  The asserts for slices 02, 03, 04, 05 and 07 still pass with the widened kind and sign checks.
- **Tests.**
  - `lib/points/__tests__/milestones.test.ts`: the shared cases, the seed, progress and cost.
  - `points.test.ts`: the settings schema and rows.
  - `terms.test.ts`.
  - `points-card-render.test.tsx`: the bar on both cards.
  - `earn.test.ts` and `points-jobs.test.ts`: the runner and the chain.
  - The Staff route test.
  - `lib/admin-docs/__tests__/points.test.ts`: the guide.
