# PRD: Guest Result Ownership — the Result id stops being a password

Status: Code complete — slices 01–09 merged (#118; Stripe follow-up #119), `pnpm run ci` green, Sizing photo RLS migration applied to production 2026-09-10. Remaining work is human-only and tracked on the `mp` GitHub Project under #120 (#121 verification, #122 sign-off, #123 ops, #124 backfill).
Source: Auth trace of the customisation flow (Sep 2026), started from the question "why can't we just `requireAdmin` these two routes?" — answered by tracing every caller, then falsified by an adversarial pass that found two larger holes than the three the trace started with. All findings confirmed against the committed source, not inferred.
ADRs: `docs/adr/0002-authorize-then-capture-customised-goods.md` (the **Result** money path this protects — hold, assign, accept, capture), `docs/adr/0014-config-reference-photos.md` (**Customisation session** id is the **Result** id, which is exactly why one leaked id opens several doors), `docs/adr/0010-rules-engine-single-recommendation-authority.md` (the suggestion payload that guests currently receive in full)
Glossary: `CONTEXT.md` — **Result**, **Customisation session**, **Authorization hold**, **Staff**, **Staff assist mode**, **Admin Panel**; new terms **Draft Result**, **Result access token**, **Owner**
Decisions taken before drafting: (a) scope is the customisation-flow endpoints keyed on a **Result** id, plus the one order-keyed sibling that leaks the same measurement blob — not the wider ungated-route surface, which is a different risk class; (b) enforcement ships on deploy with no feature flag, so slice order carries the safety instead; (c) abuse controls on the open create path are in scope, at the cheap per-instance tier the repo already uses; (d) reuse `authorizeResultAccess`, never write a second ownership checker.

## Problem Statement

Several endpoints in the customisation flow treat the **Result** id as the entire credential.
Knowing a `mp_config_responses.id` is enough to read that customer's contact details, their
measurements including health-adjacent answers, the money on their **Authorization hold**, their
linked order's total and tracking number — and to overwrite any of it.

The ids are not guessable. They are also not secret. The same id appears in the customer's own
configurator URL, in the assign email, in the `?config=` handoff to `/mp-maker`, and in the
Telegram message posted to the staff group. Anyone who ever saw one of those keeps working
access indefinitely, because nothing about the id expires or rotates.

Three failure classes, in ascending order of severity as the investigation went on:

- **The read leaks a full staff payload.** `GET /api/mp-config/responses/[id]` has no gate at all.
  It returns `customer_email`, `customer_phone`, the measurement blob (name, gender, age group,
  blood pressure level, acid reflux, ear discomfort), `authorized_amount`, `final_amount`,
  `payment_intent_id`, the linked order's status, total and tracking number, the BOM lines for the
  recommended product, and the rules-engine reasons with the graph version that produced them.
  A guest configurator needs four of those fields. It gets all of them.

- **The write is unrestricted by status.** `POST /api/mp-config/responses` upserts on a
  client-supplied id with no gate and no check on what state the row is in. It can rewrite the
  measurements of a **Result** whose pillow has already been built and paid for. Worse, its
  `persistContact` branch rewrites `customer_email` on a `held` **Result** — and when **Staff**
  later assign that **Result**, the assign email carrying its **Result access token** goes to
  whoever set the address. A read-only leak becomes an account takeover of the customer's own
  status page.

- **The body-photo table needs no endpoint at all.** `mp_config_response_photos` still carries the
  four wide-open row-level-security policies it was created with in 2024 — select, insert, update
  and **delete**, each `using (true)`. The September 2026 hardening pass dropped exactly these
  policies for the sibling tables and skipped this one. The publishable Supabase key ships inside
  the browser bundle, so the customers' front and side body photos can be listed, altered or
  deleted straight through PostgREST without touching a single route we control. No amount of
  route-gating closes this; it is the single highest-severity item in the initiative and the
  smallest diff in it.

A fourth, found last: `GET /api/shop/orders/[id]/mp-config-link` returns the same measurement
blob for any order id, while the `POST` and `DELETE` on the very same file both require **Staff**.
It is the same leak wearing a different id.

None of this was negligence. The routes predate `authorizeResultAccess`, and the obvious fix —
`requireAdmin` — would return 403 to every real customer mid-customisation, because the guest
configurator is a legitimate caller of all of them. The gate has to prove *ownership*, not
staff-ness, and until now there was nothing for a guest to prove ownership *with*: the **Result
access token** is minted at the **Authorization hold**, long after the configurator has already
saved and re-read the row several times.

## Solution

From a **shopper** perspective: nothing changes. Measurements autosave, the recommendation
appears, photos upload, the hold works, the status page works. The only observable difference is
that a stranger holding a copy of their link can no longer read their contact details or body
photos, and can no longer redirect their status-page link to themselves.

From a **Staff** perspective: nothing changes either. Every **Admin Panel** surface keeps the
payload it has today, **Staff assist mode** keeps working on the shared in-store device, and
**Staff** keep the ability to edit measurements, "measured by" and **Location** on **Results**
that are already `held` — which guests lose.

From a developer perspective: the **Result** id stops being a bearer token and becomes just an
identifier. Ownership is proved with the **Result access token** that already exists, checked by
the `authorizeResultAccess` helper that already exists, in the same shape the three sibling
**Result** routes already use. One new concept — the **Draft Result** — turns "is this row still
editable by its guest?" into a single null check on a column we already store, which is what lets
the largest piece of risk reduction ship as a guard with no client change and no migration.

What ships:

1. Three glossary entries — **Draft Result**, **Result access token**, **Owner** — because every
   later slice is a sentence about one of them.
2. A migration revoking public access to the body-photo table, and the deletion of a photo-read
   endpoint that has no callers.
3. A status guard: non-**Staff** callers may only write a **Draft Result**.
4. Minting the **Result access token** when the draft is created rather than at hold.
5. The configurator storing that token, sending it, and — critically — starting a fresh session
   when the server says its stored id is no longer its own.
6. The ownership gate itself, plus a redacted payload so an **Owner** sees their own data and not
   the **Staff** view of it.
7. The same ownership rule on photo writes.
8. The order-keyed sibling leak closed.
9. A rate limit on the one path that must stay open, and a structural test so the next route added
   to this folder cannot repeat the mistake.
10. A human pass through the whole guest journey, including the Stripe-cancel return that the
    adversarial review identified as the most likely thing to break.

## User Stories

### Domain and glossary

1. As a developer, I want **Draft Result**, **Result access token** and **Owner** defined in `CONTEXT.md`, so that the guard conditions in code read as sentences about the domain rather than as null checks on columns.
2. As a developer, I want **Draft Result** defined precisely as a **Result** whose status is null, so that "may a guest still write this row?" has exactly one answer and one implementation.
3. As a developer, I want **Owner** defined as "holds the **Result access token**, or is a signed-in **Customer** matching the row", so that the two ways of proving ownership never drift into two different checks.

### Closing what needs no endpoint

4. As a **Customer**, I want my front and side body photos to be unreadable by anyone but me and **Staff**, so that a leaked link or a copied publishable key cannot expose photographs of my body.
5. As a **Customer**, I want my body photos to be undeletable by strangers, so that nobody can destroy the evidence **Staff** need to build my pillow.
6. As a developer, I want the body-photo table's row-level security to match the sibling tables hardened in September 2026, so that the exception that was skipped stops being an exception.
7. As a developer, I want a photo-read endpoint with no callers deleted rather than gated, so that we secure code we keep and delete code we do not.

### Protecting Results that are no longer drafts

8. As a **Customer**, I want the measurements behind a pillow that has already been built to be unchangeable from the configurator, so that what **Staff** made and what the record says can never disagree.
9. As a **Customer**, I want my contact email on a **Result** with a live **Authorization hold** to be unchangeable by a stranger, so that the assign email carrying my **Result access token** can never be redirected away from me.
10. As an operator, I want the **Location** on a live **Result** to be unchangeable from outside the **Admin Panel**, so that origin attribution and its reporting stay trustworthy.
11. As **Staff**, I want to keep editing "measured by", **Location** and measurements on `held` **Results**, so that the guard that stops guests does not stop the people whose job it is.

### Giving guests something to prove ownership with

12. As a **Customer**, I want a **Result access token** minted the moment my draft is first saved, so that my browser can prove the row is mine on every request that follows.
13. As a **Customer**, I want that token stored per configurator variant, so that using both `/mp-config` and `/mp-basic` does not silently invalidate one of them.
14. As a **Customer**, I want the configurator to start a fresh session when the server tells it the stored id is no longer mine, so that returning after an **Authorization hold** never leaves me with a form that cannot save.
15. As a **Customer** who abandoned Stripe checkout and came back, I want my next measurement to save into a new **Result**, so that I am not silently editing — or blocked by — the one I already authorized.
16. As a **Customer** on a browser without `crypto.randomUUID`, I want my draft to save, so that an id the server rejects as malformed stops silently discarding my work.
17. As a **Customer** whose draft predates this change, I want to keep working, so that a deploy does not throw away measurements I am part-way through typing.

### Seeing only what is mine

18. As a **Customer**, I want the configurator to receive only my measurements, whether the draft is finalised, and the recommended size and tier, so that a leaked link cannot expose more than the page itself needed.
19. As a **Customer**, I want my contact details left out of that payload, so that an id alone never yields an email address or a phone number.
20. As a **Customer**, I want the money on my **Result** — authorized amount, final amount, payment intent — left out, so that a leaked id says nothing about what I was charged.
21. As a **Customer**, I want my linked **Order**'s status, total and tracking number left out, so that an id from the configurator does not become a window onto my delivery.
22. As the business, I want BOM lines and the rules-engine reasoning left out of the guest payload, so that our bill of materials and recommendation logic are not published to anyone with a link.
23. As a developer, I want the guest payload built by a pure allowlist function, so that a column added to the query later cannot leak by default.

### Staff keep the view they have

24. As **Staff**, I want the **Admin Panel** **Result** detail to receive exactly the payload it receives today, so that redaction for guests costs me nothing.
25. As **Staff** using **Staff assist mode** on the shared in-store device, I want the configurator to keep working, so that in-store customisation is unaffected.
26. As a developer, I want the redaction applied in the route and not in the shared loader, so that the server-rendered **Admin Panel** page that calls that loader directly is untouched.
27. As **Staff**, I want the Telegram notification to keep attaching photos, so that the build team keeps receiving what it receives today.
28. As **Staff**, I want the linked-**Result** lookup on an **Order** to require the same permission as linking and unlinking do, so that reading is not weaker than writing on the same resource.

### Keeping it closed

29. As the business, I want the one endpoint that must stay open — creating a new draft — rate limited per IP, so that an open door is a narrow one.
30. As a developer, I want a test that walks this API folder per handler and fails on an ungated verb, so that the next route added here cannot repeat this class of mistake.
31. As a developer, I want the ownership gate unit-tested for **Staff**, **Owner** and stranger, so that the three outcomes are pinned before anyone refactors them.
32. As a developer, I want the guard tested against a stranger holding only a **Result** id, so that the exact attack this initiative exists to stop is the thing the suite asserts.
33. As a developer, I want the knowledge graph refreshed in the same commit, so that continuous integration's freshness gate passes and the graph does not go stale.

### Sign-off

34. As **Staff**, I want a human pass through the whole guest journey in both locales — autosave, recommendation, photo upload, save-without-purchasing, hold, Stripe cancel and return, assign email, status page — so that "no customer was broken" is observed rather than assumed.
35. As **Staff**, I want that pass to include a second browser holding only a **Result** id and confirm it is refused everywhere, so that the fix is demonstrated and not just deployed.

## Implementation Decisions

**A **Draft Result** is a **Result** whose status is null.** The create path never writes a status;
the hold route and in-store finalisation both write `held`. That makes a single null check the
complete answer to "may a guest write this row?", which is what allows the largest piece of risk
reduction to ship with no client change, no token and no migration. **Staff** bypass the check
entirely, because editing `held` rows is their job.

**Ownership is proved with the token that already exists, checked by the helper that already
exists.** `authorizeResultAccess` already handles guest-token or signed-in-**Customer** matching
and already gates the three sibling **Result** routes. This initiative extends that same helper to
the legacy routes that predate it, behind a thin wrapper that reports *which* audience was
recognised, because the payload differs by audience. Writing a second ownership checker is
explicitly rejected.

**The token starts being minted at draft creation.** It is currently minted in exactly one place —
the **Authorization hold** — which is why the id had to serve as the credential for everything
before that. The column, its partial unique index and its backfill already exist, so this is a
code change with no schema change.

**The hold keeps rotating the token.** Preserving it across the hold was considered and rejected:
once the row is `held` the status guard already blocks configurator writes, the customer continues
via the freshly emailed link, and rotation shortens the useful life of a leaked draft token. This
choice is what makes the client's rotate-on-refusal behaviour mandatory rather than cosmetic.

**The client must start a new session when the server refuses it.** The configurator's existing
"is this id already finalised?" check treats any failure as "keep the id". Once tokens rotate at
hold, a returning guest's stored token is stale, that check is refused, the id never rotates, and
every later write is refused too — permanently. Treating a refusal as "rotate the id" fixes it and
restores the invariant the code's own comment already claims. The stored token must also be keyed
per configurator variant, or the two variants overwrite each other's token while keeping separate
ids.

**Guests receive a redacted payload built from an allowlist.** Ownership alone is not enough,
because the shared loader returns the **Staff** view. The guest clients were traced exhaustively
and read four things; everything else is dropped. Building the projection as a pure allowlist
function — rather than deleting known-sensitive keys — means a column added to the query later is
excluded by default rather than included by default. The redaction lives in the route, not the
shared loader, because the server-rendered **Admin Panel** page calls that loader directly.

**Drafts that predate the change stay accessible, and deliberately do not get a token bound on
write.** Binding one would refuse the very browser tab that had just been allowed through. The
exposed population is finite and shrinks as those drafts age out; a scheduled backfill closes it
later, outside this PRD.

**Refusals are 403.** Both conventions exist in the codebase — one public route returns 404 to
resist enumeration — but the **Result** family uses 403 and these ids are random UUIDs, so
consistency wins over enumeration resistance that buys nothing here.

**Enforcement ships on deploy, so slice order carries the safety.** There is no feature flag. The
minting and client slices are additive and enforce nothing; the gate lands only once deployed
clients are already sending a token, and pre-deploy tabs are covered by the legacy allowance.

**Rate limiting stays at the tier the repo already uses.** The existing per-IP limiter on the
contact form is lifted into a shared module and applied to draft creation only. Its ceiling is
named honestly in the code: it is per-instance and dampens rather than stops a determined flood.
Shared-storage limiting would need a provider decision this PRD should not make.

## Testing Decisions

A good test here asserts an externally observable outcome of a request — the status code, and
which fields came back — not how the guard is wired internally. The repository already has all
three techniques this needs; none of them require new infrastructure.

**Tested: the payload projection.** A pure function, so it takes a fully populated row and asserts
the result against an explicit allowlist — including a case that adds an unexpected field to the
input and asserts it does not appear in the output, which is the property that makes the allowlist
worth having. Prior art for pure-function suites: `lib/spatial-fillings/__tests__/`.

**Tested: the status guard and the ownership gate.** Table-driven across status null, `held`,
`assigned` and `captured`, crossed with **Staff**, **Owner** and stranger. Prior art for the mock
harness is `lib/auth/__tests__/admin-guard.test.ts`, whose chainable Supabase stub and
`signedInAs`/`signedOut` helpers are copied rather than reinvented — including its habit of
clearing the bootstrap-email environment variable so the allowlist cannot silently pass a test.

**Tested: the route handlers themselves.** Imported directly and called with a real `Request`,
asserting the guard short-circuits before any database or network call — the technique documented
in `app/api/appointments/book/__tests__/route.test.ts`, which needs almost no mocks precisely
because the guard runs first.

**Tested by structural walk: that the folder stays closed.** A test in the shape of
`lib/auth/__tests__/settings-routes-guarded.test.ts`, but per HTTP verb rather than per file,
because the order-side leak in this very PRD was missed by a per-file scan: the file contained a
guard, just not on the verb that needed it.

**Not tested automatically:** the row-level-security change, which must be checked against a real
Supabase instance with the publishable key; the Stripe cancel-and-return journey, which needs a
real Checkout session; and email delivery of the assign link. These are the sign-off slice.

## Out of Scope

- **The wider ungated-route surface.** Partly addressed after the fact in #119, which closed the two
  genuinely unauthenticated Stripe write routes; #123 covers the Shopify pair's env-var condition.
  A per-handler sweep flags roughly sixty handlers. Most are
  legitimately public — catalogue reads, cart addressed by an httpOnly cookie — or gated inside a
  helper the scan cannot see, such as the cron secret check and webhook signature verification. A
  handful look genuinely wrong: the Stripe sync, payment-link and test-checkout routes, and the
  Shopify sync and mapping-apply routes. They are a different risk class with different blast
  radii and deserve their own PRD rather than being smuggled into this one.
- **The shared maker-config store.** Anonymous upsert keyed on a name, but the table holds design
  scratch data with no personal information — considered and explicitly deprioritised during
  drafting.
- **Backfilling tokens onto pre-existing drafts** (#124), and removing the legacy allowance that
  goes with them. It is a follow-up for after the client change has been live long enough that no pre-deploy
  tab plausibly remains; doing it now would break exactly the sessions the allowance protects.
- **Durable, shared-storage rate limiting.** Effective across instances, but it introduces
  infrastructure this repository does not have and a provider choice that should be made
  deliberately rather than as a side effect of a security fix.
- **Moving authentication into the proxy layer.** `/api` is excluded there at both the skip list
  and the matcher; every API route remains its own trust boundary, which is what the structural
  test then enforces.
- **The latent tier-key mismatch in the configurator.** The server emits `tier` on the suggestion
  while the client type declares `kind`, so two reads are permanently undefined and a fallback
  chain dead-ends. It is pre-existing, unrelated to ownership, and "fixing" it inside this work
  would change what gets held and priced. Recorded here so the next reader does not tidy it up
  mid-slice.

## Further Notes

Measured while drafting: the ownership helper this PRD leans on is already used by three routes;
the body-photo table has four public policies and zero legitimate browser-side readers; the photo
read endpoint has zero callers anywhere in the repository; and the guest clients read exactly four
fields out of a payload with more than twenty.

The two most severe findings both came from the adversarial pass rather than the initial trace,
and both were confirmed by reading the source rather than inferred. That is the argument for
ordering slice 02 first: it is the smallest diff in the initiative and closes more than all the
route work combined, because it closes a door that does not go through a route at all.

The riskiest thing here is not the gate — it is the client. Enforcement ships without a flag, so
slices 04 and 05 must be deployed and confirmed before 06 lands. The specific failure to watch for
is a customer who abandons Stripe checkout and returns: without the rotate-on-refusal change their
configurator is permanently unable to save, and it fails quietly, as a save-status indicator that
never leaves "error".

See [`issues/README.md`](issues/README.md) for the vertical slice breakdown and build order.
