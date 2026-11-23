# A partner's other clinics are branch Location rows under its main row

Status: Accepted (2026-10-30)

## Context

A partner business is one row of the `partners` table (ADR 0012). That row is
both the **Location** customers book and Results record, and the partner
business: the **Partner account** links to it, and it holds the referral code,
the **Commission Pool**, the self-purchase rate, the logo, the write-up and
`visible`. It has one `address`, so a clinic group with three sites could list
only one of them, in the Admin Panel, in Partner Hub and on `/our-partners`.

## Decision

Each further clinic is a **branch**: its own `partners` row of type `partner`
with `parent_id` set to the main row (`on delete cascade`). The main row stays
the partner business and its first clinic. A branch carries only its place:

- `branch_name` (optional, "Novena"; the main row may have one too), `address`,
  `postal_code`, `bookable`, and `position` counted within the partner.
- The main row's `name` is copied onto it on every save and rename, so every
  **Location** reader shows the right partner without a join. A Location's
  display name is `name · branch_name` when the clinic has a name.
- It is saved `visible=false`, with no logo, website, write-up, referral code
  or Partner account. Whether it shows on `/our-partners` is the main row's
  `visible`. A new branch takes the main row's `bookable` (off for a new partner
  since 2026-11-23), and Staff can then turn each one on or off in
  Settings → Appointments.

Every clinic is therefore a real Location: a customer picks "Alignwell · Tampines"
in the booking picker, and Staff record a Result there. Readers that list
partner businesses (payouts, terms, self-purchase, milestones) filter on the
referral code or the Partner account, and a branch has neither, so they never
see one. `selectPartnerRows` drops branches, and `getPartners` attaches them to
their partner as `locations`, which the `/our-partners` card lists with a map
link for each.

One write path saves a partner's branches, `savePartnerBranches`, used by
the Admin Panel (`/api/partners`, `/api/partners/[id]`) and by Partner Hub
(`/api/partner/profile`). It sends the whole list: an id updates that branch,
no id adds one, and a branch left out is deleted. Every statement is scoped to
`parent_id = <main row>`, so Partner Hub can only touch the signed-in partner's
own clinics. An id that is not one of that partner's branches is refused (409),
not re-created. A branch that a Result or a booking points at cannot be
deleted, which is the same rule as any Location.

Branches are one level deep: the code refuses branches on a branch, and an own
studio has none, since each studio is already its own row.

## Considered options

- **A `partner_locations` table of addresses.** Rejected: a clinic customers
  book and Results record is a Location, and a second table of places is the
  separate `locations` table that ADR 0012 and `CONTEXT.md` rule out. Bookings
  and Results would then point at the business and lose which clinic.
- **A JSON array of addresses on the main row.** Rejected for the same reason,
  and it cannot be a foreign key target.
- **One unrelated `partners` row per clinic.** Rejected: each would need its own
  referral code, commission terms and Partner account, splitting one partner's
  money and milestones across rows.
- **Branch rows under the main row (chosen).** Every clinic is a Location, and
  the partner business stays one row.

## Consequences

- The `partners` table now holds three kinds of row: own studios, partner main
  rows and partner branches. A new reader that lists partner businesses must
  skip branches. Filtering on `referral_code`, the Partner account, or
  `parent_id is null` does that.
- The branch name copy is denormalised. Both rename paths (the Admin Panel and
  Partner Hub) copy it, and no other path renames a partner.
- `savePartnerBranches` runs a few statements with no transaction. Updates and
  inserts come before the delete, so a failure can leave one clinic too many,
  never one lost.
