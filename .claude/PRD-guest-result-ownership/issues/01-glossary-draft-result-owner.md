# Slice 01 — Domain glossary: Draft Result, Result access token, Owner

Type: AFK
Parent: PRD `guest-result-ownership` (`.claude/PRD-guest-result-ownership/guest-result-ownership-prd.md`)
Triage: needs-triage
User stories covered: 1–3

## What to build

The shared language every later slice is written in. Three entries in `CONTEXT.md`, placed
next to the existing **Result** and **Customisation session** entries because they qualify them.

**Draft Result.** A **Result** whose `status` is null: measurements being typed into the
configurator, before any **Authorization hold** and before in-store finalisation. It is the only
state a guest may write. Name the discriminator explicitly — the create path never writes a
status, `/api/results/hold` writes `held`, and in-store finalisation writes `held` through
`buildInstoreReviewOnlyPatch` — so that the null check in code is recognisably this definition
and not an accident. `_Avoid_`: "unsaved" (a Draft Result is persisted); "unfinalised" (`is_final`
is a Telegram fact, not a lifecycle one); "cart".

**Result access token.** The `access_token` uuid on a **Result** — a bearer capability proving
"I am this **Result**'s customer" without a **Customer** sign-in. Note where it travels (the
status-page link in the held, assigned, reminder and restock emails) and that it is rotated at
every **Authorization hold**, because slice 05 exists entirely because of that rotation.
`_Avoid_`: Stripe `session_id`; the **Result** id itself, which is an identifier and, after this
PRD, not a credential.

**Owner.** Whoever may act on a **Result** without being **Staff**: a holder of the **Result
access token**, or a signed-in **Customer** whose id or email matches the row. Point at
`authorizeResultAccess` as the single implementation, so that the two ways of being an Owner can
never drift into two different checks. `_Avoid_`: "the customer" when you mean the Owner (a
**Staff** member assisting in store is not the Owner); "authenticated" (an Owner may be a guest).

**Why now.** The rest of the initiative is a set of guard conditions. Written against these three
terms they read as domain statements — "guests may only write a **Draft Result**", "an **Owner**
gets the Owner payload" — and the reviewer can check the sentence rather than the null check.

Demoable outcome: `CONTEXT.md` defines the three terms, and the guard conditions in slices 03 and
06 can be stated in one sentence each using only glossary words.

## Acceptance criteria

- [ ] `CONTEXT.md` defines **Draft Result**, **Result access token** and **Owner**, in the house
      entry format (bold term, definition, `_Avoid_:` line).
- [ ] **Draft Result** names `status IS NULL` as the discriminator and cites the three writers of
      `status` that make it true.
- [ ] **Result access token** records that it is rotated at every **Authorization hold**, and lists
      the emails that carry it.
- [ ] **Owner** names `authorizeResultAccess` as the single implementation of the check.
- [ ] Each entry carries an `_Avoid_:` line naming at least one term it must not be confused with.
- [ ] No code changes in this slice.

## Blocked by

None — can start immediately.
