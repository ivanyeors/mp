# 05: Result hold: re-submitting needs ownership, a retry never deletes, stable idempotency key

**Type:** AFK
**Blocked by:** none
**User stories:** 11, 12, 13
**Labels:** `bug`, `needs-triage`, `P0`, `area:checkout`

## Goal

Only the **Result**'s owner can re-submit it, and nothing a retry does can destroy it.

## The gap, precisely

`app/api/results/hold/route.ts`:
- **`:261-279`:** loads `input.responseId` with the service role and blocks only `assigned`, `accepted` and `captured`. There's no `authorizeResultAccess`. A `held` or draft Result is re-submittable by anyone who has its id.
- **`:~699`:** `.upsert(row, { onConflict: "id" })` writes:
  - `customer_email: input.email` (`:~674`)
  - a new `access_token` (`:~686`)
  - `payment_intent_id: null` (`:~672`)

  The new token is returned at `:~796-800`. The attacker now owns the Result, and the victim's **Authorization hold** is orphaned.
- **`:~755`:** the idempotency key is `result_hold_${resultId}`, but `successUrl` embeds the freshly minted token, so any re-submit within 24h sends different parameters and Stripe returns an idempotency error.
- **`:~759`:** the catch runs `.delete().eq("id", resultId)` and deletes the Result. That fires on a *legitimate* customer retry too.

The guard already exists: `authorizeResultAccess` / `requireResultAccess` in `lib/results/access.ts:7,49`. `app/api/mp-config/responses` uses it, and `lib/results/access.ts:82-86` documents exactly this attack.

## Scope

- **Ownership.** When `responseId` refers to an existing row, require `authorizeResultAccess`: the Result access token (header or body, as the responses route accepts it) or a signed-in owning Customer. Otherwise return 403 before any write, Stripe call or notification.
  - Keep the legacy allowance (`access_token == null && status == null`) exactly as `access.ts` defines it. Don't widen it.
- **Delete only your own row.** Track whether this request inserted the row. The failure path deletes only then, and otherwise restores or leaves the prior row.
- **Stable idempotency key.** Build it from parameters that don't change across a retry, e.g. `result_hold_${resultId}_${hash(amount, currency, email)}`, **and** stop putting a new token into `successUrl` on a re-submit by reusing the existing token for the owner.
- **Assisted flow.** The deferred and Staff-assisted path (`:280-299`) keeps its `source = 'staff_assisted'` trust boundary and gains the same ownership check.

## Acceptance criteria

- [ ] vitest: POST with an existing held Result's `responseId` and no token and no session returns 403, and the row is unchanged (email, token, `payment_intent_id`). Fails on today's code.
- [ ] vitest: the owner (valid token) re-submitting succeeds and keeps the same `access_token`.
- [ ] vitest: when Stripe session creation throws on a re-submit of an existing row, the row still exists afterwards.
- [ ] vitest: when Stripe throws on a brand-new submit, the just-inserted row is removed (today's cleanup is preserved).
- [ ] vitest: two identical owner re-submits produce the same idempotency key.
- [ ] No Telegram or email notification is sent on a 403 path.
