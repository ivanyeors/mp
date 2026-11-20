# Points are a dollar offset kept in an append-only ledger, earned on what was kept and spent only on shop orders

Status: Accepted (PRD `loyalty-points`, 2026-10-21)

Customers buy a pillow every two to four years and accessories in between. The Shopify migration
needed a reason to sign in, and the Welcome-back voucher (ADR 0029 (g)) gave one only at the
**Claim**. It existed once, did nothing after it was spent, and could never reach anyone who
claimed while it was switched off. This record replaces it with **Points**: a balance each
**Customer** earns on what they pay for and spends as dollars off a later shop **Order**, with a
one-time **Claim bonus** for Migrated customers.

## Context

- **Discounts already sum into one.** Partner self-purchase pricing is added to the coupon's
  discount and sent to Stripe as one `amount_off` coupon (`app/api/shop/checkout/route.ts`;
  `lib/stripe/checkout.ts`). The Order keeps one `discount_amount`. Tax and the paid-time
  reconcile agree with whatever that sum is.
- **Coupons reserve nothing.** `usage_count` moves only after payment. ADR 0029 (j) accepted that
  for a one-use voucher bound to one person; a balance can be spent twice from two tabs.
- **Results take no discount.** Every pricer of a custom pillow hard-codes `discountAmount: 0`,
  Accept writes `discount_amount: 0`, and `planCapture` refuses an amount of zero or less.
- **Refunds already pay cash only,** each capped at `amount_captured − amount_refunded`, and an
  RMA refunds a returned line at its `unit_price` up to the cash left.
- **Partner commission waits 30 days after delivery** (`lib/rma/eligibility.ts`,
  `lib/commissions`), so most refunds land before it is released.
- **The daily job has room for runners but not for a third cron** (`vercel.json`); Aftercare
  chains onto `results-sla`. `customer_emails` sends each email once per (Customer, template,
  entity).
- **The customer can read their own `customers` row** (ADR 0029 (d)).

## Decisions

The owner's decisions of 2026-10-21, as the PRD lists them:

1. Points are a dollar offset and nothing else: 100 points = S$1, spent as money off a purchase.
   No tiers, no catalogue, no cashing out, transferring or buying.
2. They are earned on purchases, plus a one-time Claim bonus for Migrated customers.
3. The earn rate is ~~3~~ 1 point per S$1 (amended 2026-11-08, below).
4. They are spent on shop orders only. Results earn but cannot take them.
5. GST does not count.
6. Only Orders paid from launch earn.
7. Points used are never refunded; a partial return treats them as spent on what was kept.
8. ~~The balance expires 24 months after the last purchase, with reminders 3, 2 and 1 months
   before.~~ Retired 2026-10-31: points never expire (amendment below).
9. ~~Reminders go only to customers who agreed to marketing email.~~ Retired with 8.
10. The Claim bonus is 1,000 points (S$10).
11. Its window is 3 months from the customer's first campaign email, or from the first wave if we
    never emailed them; there is no calendar end date.
12. Partners neither earn nor spend points.
13. Partner commission stays on the full price.
14. The voucher feature is deleted; any future code-based incentive is an ordinary Discounts
    code.
15. Nothing is built for Shopify.

The rules that implement them, (a) to (r), are the PRD's *Rules* section, unchanged:

- **Value.** (a) 100 points = S$1 is a constant in code, never a setting. (b) A balance is always
  shown in points and dollars.
- **Earning.** (c) `floor(rate × (subtotal − discount_amount − amount_refunded))`, floored at 0.
  (d) Pending for 30 days after `delivered_at` (`paid_at` for service-only Orders), then one
  `earn` entry from the daily job. (e) Shop, Result and paid Re-adjustment Orders paid since
  `points_launch_at`; never a partner's self-purchase or a partner Customer's Order.
- **Claim bonus.** (f) Granted once, if the Claim fell inside the window. (g) A Claim before
  launch is granted at the next sign-in.
- **Spending.** (h) A signed-in, non-partner Customer checking out with their own account email.
  (i) In 100-point steps from 500, at most half the products' price after any coupon, never
  shipping. (j) Reserved by one SQL function holding a row lock on the Customer; given back when
  the Checkout expires or its payment fails. (k) Shop orders only.
- **Refunds and adjustments.** (l) Refund code does not change. (m) A refund after release claws
  back `floor(rate × refund)`, no more than earned or available. (n) Staff adjust with a reason;
  never for a partner.
- **Expiry.** ~~(o) The whole balance, 24 months after the last paid Order or the Claim bonus.
  (p) Reminders at 3, 2 and 1 months, to `subscribed` Customers only, once per clock.~~ Retired
  2026-10-31: points never expire (amendment below).
- **Storage and partners.** (q) `points_ledger` is append-only and server-only; the balance is
  never a column on `customers`. (r) A Customer is a partner when an approved `partner_users` row
  holds their login or their email (or verified backup email), matched as `loadPartnerRow`
  matches. `is_partner_customer` is the one answer.

## Considered options

- **Keep the voucher.** Rejected. It exists only at the Claim, and rewards nothing after it.
- **Expire each earning 12 or 24 months after it was earned.** Rejected. Pillows are bought every
  two to four years, so batch expiry wipes most pillow-earned points before the customer returns,
  and it needs first-in-first-out lots.
- **Spend on Results in v1.** Rejected. It changes the hold amount, six pricers, the hold endings
  and the capture plan. Earning on Results is kept: it reads only the paid Order.
- **A balance column on `customers`.** Rejected. The customer can read their own row, and a stored
  total drifts from its history.
- **No reservation, as coupons have none.** Rejected for a balance: two tabs could spend it twice.
- **Split points across order lines so a return refunds its points share.** Rejected by the owner.
  A return refunds cash first and the points stay spent, which needs no refund change.
- **Account-bound coupons as the incentive.** Rejected by the owner (decision 14).
- **Points for partners.** Rejected by the owner: partners have milestone tiers.

## Consequences

- One ledger explains every balance; Staff corrections are new `adjust` entries with a reason.
- Checkout gains a reservation and two release points; refunds are untouched.
- The Shopify migration's incentive is the Claim bonus (ADR 0029 (g), amended 2026-10-21).
- Counsel and the accountant review the terms and the liability before launch (PRD slice 08);
  their answers are added here, dated.

## Amendment (2026-10-23): bonus milestones

The owner wants points to make customers buy more: once a customer has earned a certain number of
points, we add more, and the Profile shows it as a progress bar with the milestones on it.

**Decision 16.** Customers get a one-time bonus as the points they earn from orders add up, on a
ladder the owner sets (PRD slice 09). Decision 1 stands: a milestone is not a tier. Nothing about
earning or spending changes after it, nothing is taken away, and the bonus is the whole reward.

- **(s) The ladder.** Up to five milestones, each a number of points earned and a bonus, both in
  multiples of 100 and climbing, in one setting (`points_milestones`). Missing, blank or
  malformed is no milestones, never a default, so a bonus is only granted on a ladder that was
  saved.
- **(t) What counts.** Every `earn` less every `clawback`. Counting the balance would set a
  customer back for using points, so spending and expiry don't. The Claim bonus, Staff
  adjustments and milestone bonuses don't move the bar.
- **(u) One bonus per milestone reached,** numbered from 1, held unique per Customer, so changing
  the ladder never pays a milestone twice.
- **(v) A bonus is never taken back,** even if a refund later takes the customer below its
  milestone.
- **(w) The daily job grants them** right after it releases earned points, only while points are
  live, under the per-Customer lock, and never to a partner. Pending points show on the bar but
  count only once written, so a bonus never rests on an order that can still be returned.

**Considered.**

- *Counting the balance:* rejected, because it punishes spending.
- *A yearly reset:* rejected, because pillows are bought every two to four years.
- *Granting at payment:* rejected, because a return inside the window would leave the bonus
  behind.
- *Keying a bonus on its number of points rather than its place on the ladder:* rejected,
  because raising a milestone would then pay customers already past the old one a second time.

**Consequences.** The ledger has an eighth kind, `milestone_bonus`, and a `milestone` column.
The cost summary counts the bonuses. The terms gained a section and are dated 23 October 2026.
The partner **Milestone track** is unchanged and separate.

## Amendment (2026-10-31): points never expire

The owner removed expiry from the points system: no expiry date, anywhere.

**Decision 17.** Points never expire. A balance is kept however long it is between orders. This
retires decision 8 (the 24-month clock) and decision 9 (its reminders), and rules (o) and (p).

- **Nothing expires a balance.** `expire_points`, `expire_due_points`, the clock
  (`points_clock`, `points_expires_on`) and the daily job's expiry step are gone, and the ledger
  has no `expire` kind.
- **Nobody is reminded.** The three `points.expiry_*` emails, their copy and their registry
  entries are gone. The check-up reminder keeps its consent gate (`requireMarketingConsent`),
  which no other email now shares.
- **No date is shown.** `points_balance()` returns `available` and `pending` only. The Profile
  says the points don't expire; the Staff card, the terms and the Staff guide show no date.
- **No setting.** `points_expiry_months` is gone from `site_settings`, `points_settings()` and
  Settings → Discounts → Points, and the cost summary loses its `expired` lines.

**Why it was safe to delete rather than wind down.** When this was decided, production had points
switched off, an empty ledger, no expiry email sent and no saved copy for one. Nothing had
expired, so nothing is reinstated. The migration (`20261031032017_points_never_expire.sql`)
refuses to run on a database that does hold an `expire` entry, because the ledger is
append-only and those points would have to be given back with `adjust` entries first.

**Considered.**

- *Keep expiry but set it very long (say 120 months):* rejected. The owner asked for no expiry
  date, and a far-off date is still a date to explain, remind about and carry as a liability
  rule.
- *Keep the `expire` kind for history:* rejected. No entry of that kind exists, and keeping it
  would let code write one again.

**Consequences.** The terms gained a "Points don't expire" section and are dated 31 October 2026.
The change only adds to what customers keep, and points were not yet live. The liability points create no longer
shrinks through expiry, so what customers hold only falls when they spend or a refund claws
back: the accountant should know (slice 08). The CRM's *Lapsed* sub-status still starts at 24
months without a purchase: it was set when points expired at 24 months, and is a separate
retention rule that this amendment does not change.

## Amendment (2026-11-08): points for past purchases

The owner wants customers imported from the old shop to start with points for what they already
bought there, not only with the Claim bonus.

**Decision 18.** A **Migrated customer** is given **Past-purchase points** once: the earn rate ×
their Shopify-era spend (`migrated_customers.shopify_amount_spent`), rounded down. This narrows
decision 6 ("only Orders paid from launch earn"): Orders are unchanged, and the Shopify era is
settled once from what the platform already holds, as `CLAUDE.md` directs for Shopify-era facts.
It is built on the Shopify export the customer import stored, and reads nothing from Shopify, so
decision 15 stands.

The owner's choices, 2026-11-08:

- **(x) Staff give them, in one run,** from Settings → Discounts → Points: a preview first (how
  many customers, how many points and what they are worth, the median and the largest), then a
  confirmation, then the run. The run sends the preview's numbers back, and the database grants
  only if they are still the numbers (`grant_past_purchase_points`), so what Staff confirmed is
  what is granted. Not gated on points being on: with points off, customers see nothing until
  launch.
- **(y) Once per Customer,** held unique (`points_ledger_one_past_purchases`). Running it again
  grants only customers imported since. A run is not reversible in one step: the ledger is
  append-only, so a correction is an `adjust` entry.
- **(z) They never count towards a Milestone bonus.** Rule (t) counts `earn` less `clawback`;
  this is a ledger kind of its own, `past_purchases`. Partners get none (rule r).

**Considered.**

- *At each customer's Claim, with the Claim bonus:* rejected by the owner. It would have kept what
  is owed down to customers who come back, but balances would only appear at sign-in.
- *Counting them towards milestones:* rejected by the owner. In production, at 3 points per S$1,
  1,258 customers would have passed the first milestone at once, adding 173,600 points (about
  S$1,736); at 1, fewer.
- *Writing them as `earn` entries:* rejected. `earn` is one per Order, and milestones count it.
- *Excluding shipping:* not possible. The export's spend is one total per customer, shipping
  included, so a past purchase earns on a little more than an Order here would.

**What it costs.** In production on 2026-11-08: 1,613 Migrated customers with spend,
793,094 points at 1 per S$1 (about S$7,931; it was 2,379,749, about S$23,797, at 3). Half the
grants are 458 points (S$4.58) or fewer, and the largest is 8,445 (S$84.45). No partner had
Shopify-era spend. The accountant should
know before the run: it is a liability from the day it is given (slice 08).

**Consequences.** The ledger has a ninth kind, `past_purchases`, labelled "Points for past
purchases" on the Staff card with the spend in its note. The cost summary counts the grants. The
terms gained a "Points for past purchases" section and are dated 8 November 2026; counsel reviews
it with the rest before launch. The Staff guide's launch checklist gives the points before
launch, so a customer's balance is there at their first sign-in.

## Amendment (2026-11-08): the earn rate is 1 point per S$1

The owner lowered the earn rate, for Orders and Past-purchase points alike: "make the points
earned $1 spent = 1 point". A point is still worth S$0.01: "100 points for $1 a user can use".

**Decision 3, amended.** The earn rate is 1 point per S$1: 1% back on what the customer pays
for, before GST, and the rate Past-purchase points are worked out at. It is still a setting
(`points_earn_per_dollar`), changed by Staff on Settings → Discounts → Points; rules (a) and (b)
are unchanged, so nothing saved in points changes what it is worth.

- `20261108100200_points_earn_one.sql` moves the saved rate from 3 to 1, and only from 3, so a
  rate Staff saved since is theirs. A missing or malformed rate reads as 1, in SQL
  (`points_settings()`) and in TypeScript (`POINTS_DEFAULTS`).
- Points were off with no launch date, so no Order earned at 3, and nothing is given back or
  re-earned.

**Considered.**

- *5 points per S$1 (5% back):* the owner's first change that day, replaced before it was
  applied.
- *5 for past purchases only, 3 for Orders:* offered with it; the owner chose one rate for both.
- *A point worth S$0.10 (10 points = S$1, so 10% back at 1 point per S$1):* chosen, then
  withdrawn by the owner the same day. 100 points = S$1 stays.

**What it costs.** Customers get 1% back, and the milestone ladder is reached later: the first
milestone (1,000 points) after about S$1,000 spent, not S$334, and a customer at the last one
(10,000 points, about S$10,000 spent) has 1.32% back, not 3.96%. The bonuses are worth what they
were (S$1 to S$20) but take three times the spend; the owner may want to look at the ladder
again on the same page. The Claim bonus (1,000 points, S$10) and the fewest points used at once
(500, S$5) are unchanged, so the Claim bonus is now what S$1,000 of Orders earns. Past-purchase
points are about S$7,931 (above). The terms and the Staff guide read the rate from the settings,
so they say 1 point once it is saved. The accountant should know the new rate before launch
(slice 08).

## Amendment (2026-11-17): the Welcome bonus, flower points, and the Explore page's claim

The owner wants a launch page (`/explore`) that gives people a reason to make their account
before the new site opens at 23:59 on 31 December 2026, Singapore time: a countdown, "Claim my
points", and a number of bonuses that visibly runs down (owner, 2026-11-16 and 2026-11-17). The
Claim bonus (decision 10) only ever reached Migrated customers.

**Decision 18.** A Customer who is not a Migrated customer gets a one-time **Welcome bonus** when
they claim on the Explore page. Its size falls on published dates, and each step has a limited
number to give. A Migrated customer gets the Claim bonus and Past-purchase points as before, and
never both: their emails already promise them 3 months, so theirs is neither capped nor reduced.

- **(x) The ladder** is one setting (`points_welcome_steps`), "until|points|allocation" steps,
  seeded with the owner's schedule: 1,000 until the end of November, 800 until 14 December, 600
  until the opening, 500 through January, each with 500 to give, and nothing from 1 February. A
  missing or malformed value is no ladder and no bonus, never a default.
- **(y) The open step** is the first whose time has not come and whose allocation is not used
  up. A step that runs out hands over to the next one early; what a step did not give away lapses
  with it. SQL alone decides (`welcome_bonus_standing`), so the page and the grant cannot
  disagree.
- **(z) Every number shown is the count.** The page's "left" is the allocation less the entries
  in the ledger, on a bar that only goes down. Nothing is made up, rounded for effect or reset
  (CCS, 18 May 2026: no false urgency).
- **(aa) One per Customer**, held unique, under a lock so two claims at once never exceed an
  allocation. Never a partner (rule r). Granted while points are on, launched or not, as the
  Claim bonus is.
- **(ab) The value is shown after the claim, not before** (owner, 2026-11-16): the offer says
  points; the balance that follows says points and dollars, as rule (b) requires of a balance.

**Decision 19.** Pressing Claim is the consent to marketing email, said in a line under the
button at a readable size, with no box (owner, 2026-11-16; PDPC advisory guidelines, 29 April
2026: an offer may be conditional on consent, and consent is an action). It is recorded under its
own source, `explore_claim`, which acts as the boxes do (ADR 0039): it subscribes only someone
nobody has asked and never unsubscribes anyone. Someone who unsubscribed gets their points and an
"Email me again" link, recorded as `account`.

**Decision 20.** On some Singapore days (about two in five, the same for everyone, fixed for the
day) the Explore page's cliff grows three to five flowers. A signed-in Customer who picks one
gets 1 to 5 points, once per flower per day: at most 25 points (S$0.25) a day. Only while points
are live, never a partner, and the database chooses the days, the flowers and the points, so the
page cannot be made to pay more. Signed out, a flower says to sign in.

**Considered.**

- *One pool of 2,000 bonuses for the whole ladder:* rejected, because a bar that starts at 2,000
  barely moves in the first weeks. Each step has its own 500.
- *The Welcome bonus for Migrated customers too:* rejected. They would hold two welcomes, and the
  cap would break a promise already emailed to them.
- *A box, ticked or not, under the button:* rejected by the owner. The PDPC calls pre-ticked
  boxes "not appropriate"; a press under a line that says what it agrees to is the cleaner
  consent.
- *Flowers that bloom at random in the visitor's browser:* rejected. Anything the page decides,
  a script can decide; the days and the picks are the database's.
- *Rain from a worldwide weather service:* the free ones forbid commercial use or need
  attribution on the page. Rain is Singapore's own gauges (NEA, on data.gov.sg, open licence);
  elsewhere the sky stays dry.

**What it costs.** At most 2,000 Welcome bonuses: S$5,000 at 1,000 points, S$4,000 at 800,
S$3,000 at 600 and S$2,500 at 500, so S$14,500 if every one is claimed and spent. Flowers cost at
most S$0.25 per Customer per day they visit, on about two days in five. Settings → Discounts →
Points counts both. The accountant should know before the page is advertised (slice 08).

**Consequences.** The ledger has two more kinds, `welcome_bonus` (with `welcome_step`) and
`explore_flower`; consent has a thirteenth source. The terms gained two sections and are dated
17 November 2026. Points must be switched on before the page is advertised (owner, 2026-11-16);
with points off the page offers sign-in only and promises nothing. The ladder has no editor yet:
changing it is a change to the setting's row.

## Amendment (2026-11-17, later the same day): the budget, flowers as an Easter egg, and the way in

The owner set what the Explore page may give away, and how people reach it (owner, 2026-11-17).

**Decision 21. The Welcome bonus costs at most S$1,000**, divided equally between the ladder's
four steps: S$250 (25,000 points) each. The dates and the points stay; each step gives as many
bonuses as S$250 buys at its size, rounded down: 1,000 points × 25 until the end of November,
800 × 31 until 14 December, 600 × 41 until the opening, 500 × 50 through January. That is 99,400
points (S$994) if every one is claimed, and never more, because the allocation is what the grant
counts (decision 18 (y), (aa)). Applied as `points_welcome_steps` by
`20261117144229_explore_points_budget.sql`; nothing had been claimed under the old allocations.

**Decision 22. Flowers are an Easter egg**, worth at most S$5 (500 points) to each Customer who
finds them, ever, on any day the cliff blooms, before the launch or after. A pick gives 1 to 3 points
(was 1 to 5), and the flower is then gone for that Customer until a random time 24 to 36 hours
later, when it grows back (owner, 2026-11-17: "flowers clicked will only reappear at random after
24hrs"; `regrows_at`, `20261117153541_explore_flower_regrow.sql`). Before, it came back at the next
Singapore midnight, minutes later for a pick at 23:50. The pick
that reaches 500 gives what is left of it, and after that the Customer's flowers never give points
again (`pick_explore_flower` answers `spent`; `explore_flowers` says no points). The cap is on top
of decision 21's S$1,000 and is each Customer's own. A lock per Customer makes two picks at once
count one after the other, so it holds.

On the page, a picked flower goes and its petals drift down to the grass, lie there a moment and
fade; then a popup shows the points it held. Signed out, the popup is a plain sign-in ("Sign in or
create your account", no flower, no hint), and the sign-in comes back to `/explore?flower=N`, where
the page picks that same flower for them. The database still chooses the days, the flowers and the
points.

Nothing hints at the flowers before one is picked (owner, 2026-11-17: "it's supposed to be Easter
eggs"): not the signed-out popup, not a message after a pick that gave nothing (only "A flower for
you"), and not the points terms, which drop the flowers section decision 20 added. The surprise
popup after a pick, and the customer's own points history, are the only places it shows.

**Decision 23. The way in.** Until the launch, someone who arrives at the home page of mpillow.com
or www.mpillow.com is sent to `/explore` (307, not cached; `lib/routing/explore-entry.ts`). Only
an arrival is: a typed address, a bookmark or a link from another site. A click on the site itself
(`Sec-Fetch-Site: same-origin`, or a Referer from the same host) reaches the home page, so Explore's
logo still leads home. A signed-out visitor is sent every time they arrive (owner, 2026-11-20); a
signed-in one once per browser session (owner, 2026-11-18): opening Explore sets
`mp_explore_seen`, a session cookie on the parent domain, and while the browser keeps it a
signed-in arrival goes to the home page. Once per session had first applied to everyone, but
browsers rarely end a session (Chrome's "continue where you left off", phone browsers), so for a
signed-out visitor it meant once ever. Signed in means a Supabase sign-in cookie is present; the
proxy reads both cookies without a query, and a prefetch does not set `mp_explore_seen`.
custom.mpillow.com, previews and localhost keep their home page. From 23:59
on 31 December the redirect stops, and Explore says the site is live with an "Enter Mpillow" button
to the home page. From then it offers no claim (owner, 2026-11-17): a visitor gets "Sign up or sign
in", a plain sign-in that goes on to the home page, and someone signed in gets only "Enter Mpillow".
Both hosts are still the Shopify store until their DNS moves (slice 10 of the
customer migration), so the redirect takes effect only from then.

**What it costs now.** At most S$994 in Welcome bonuses, plus at most S$5 per Customer who finds
the flowers. Settings → Discounts → Points counts both, as before.
