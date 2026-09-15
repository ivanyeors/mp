# 06: Accept a Result exactly once: a conditional claim before any side effect

**Type:** AFK
**Blocked by:** none
**User stories:** 14
**Labels:** `bug`, `needs-triage`, `P0`, `area:checkout`, `area:admin`

## Goal

However many times accept is pressed, or requests race, a Result produces one Order, one set of commissions and one stock deduction.

## The gap, precisely

`app/api/results/[id]/accept/route.ts`:
- **`:58`** `if (row.order_id)` and **`:66`** `status === "captured"`: both read before acting.
- **`:199-201`:** skips capture when the payment intent already succeeded, then **carries on**. A second request passes.
- **`:~260`:** inserts the Order unconditionally.
- **`:~375-398`:** commission and `applyMilestoneProgress`. `commissions` is unique on `order_item_id`, and each duplicate Order has new item ids, so commission doubles.
- **`:~417-424`:** stock transactions.
- **`:~438-445`:** stamps `order_id` with only `.eq("id", id)`.
- For a Result with no hold there is no capture step at all.

**Prior art in the same folder.** `app/api/results/[id]/finish/route.ts:141-150` guards on state:
```ts
.update({...}).eq("id", id).eq("status", "assigned").is("shipping_address", null).select("id")
```
and treats zero updated rows as a conflict.

## Scope

- **Claim first.** Before capture and before the Order insert, run a conditional update that marks the Result as being accepted. For example, set an `accepting_at` timestamp, or move status to an in-progress value, `.is("order_id", null)` and not already accepting, then `.select("id")`.
  - Zero rows means another request owns it: return the existing outcome (200 with the existing `order_id` if one is set, else 409).
  - Choose the smallest claim that needs no migration. If the existing status enum can't express "accepting", a nullable timestamp column is acceptable (migration).
- **Release on failure.** A failure after the claim but before the Order exists must release the claim, so accept can be retried.
- **Stamp idempotently.** The final `order_id` update keeps `.is("order_id", null)`.

## Acceptance criteria

- [ ] vitest: two concurrent accept calls on the same assigned Result produce exactly one `orders` row, one set of `stock_transactions` and one commission. Fails on today's code.
- [ ] vitest: a second accept after success returns the same `order_id` and writes nothing.
- [ ] vitest: when capture fails, a later accept can still succeed.
- [ ] If a migration is added, it is applied with `supabase db push` in the same sitting as the merge.
