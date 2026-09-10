# Slice 08 — Close the order-keyed sibling leak

Type: AFK
Parent: PRD `guest-result-ownership` (`.claude/PRD-guest-result-ownership/guest-result-ownership-prd.md`)
Triage: needs-triage
User stories covered: 28

## What to build

A two-line fix for the same leak wearing a different id, found by the adversarial pass rather than
the original trace.

**The hole.** `GET /api/shop/orders/[id]/mp-config-link` has no guard. Given any order id it
returns the linked **Results** including the full `data` blob — name, gender, age group, blood
pressure, acid reflux, ear discomfort, all four measurements and free-text notes. The `POST` and
`DELETE` handlers *in the same file* both call `requireAdmin("orders")`. Reading is weaker than
writing on the same resource, which is almost always a mistake rather than a decision.

**The fix.** `requireAdmin("orders")` at the top of the `GET`, matching its own siblings. Its only
caller is the **Admin Panel** order detail client, which already runs behind a **Staff** session,
so nothing customer-facing is affected.

**Why it is in this PRD at all.** It is outside the three configurator endpoints this initiative
was scoped to, and that was flagged explicitly when the plan was approved. It is here because it
leaks the same data class this PRD exists to protect, reached by an id from a different family —
and leaving it open would make the sign-off claim ("a stranger with an id cannot read a customer's
measurements") false.

**Why the first sweep missed it.** A per-file scan for a guard finds one in this file, because two
of its three handlers have one. Only a per-handler scan catches it. That is the direct reason
slice 09's structural test walks verbs rather than files.

Demoable outcome: a signed-out request to the order's linked-**Result** endpoint returns 401
instead of a customer's measurements, and the **Admin Panel** order detail still lists linked
**Results**.

## Acceptance criteria

- [ ] `GET /api/shop/orders/[id]/mp-config-link` calls `requireAdmin("orders")` before any data
      access, matching the `POST` and `DELETE` in the same file.
- [ ] A signed-out request is refused; a **Staff** request returns the current payload unchanged.
- [ ] The **Admin Panel** order detail still lists linked **Results** and still supports linking
      and unlinking.
- [ ] `pnpm ci` passes.
- [ ] `./scripts/graphify update .` run and the refreshed graph committed alongside the code.

## Blocked by

- Slice 01 (glossary only; otherwise independent and can be built at any point)
