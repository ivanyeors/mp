# 04 — The counter control: one button, and the async truth rendered honestly

**Type:** AFK
**Blocked by:** 03
**User stories:** 3, 4, 5, 7, 12
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:checkout`

## Goal

Put slice 03 in front of a **Staff** member standing beside a customer. The whole
interaction is about thirty seconds long, happens while two people watch, and its
failure modes are social as much as technical — so the interface has to be readable
at a glance and honest about what it does not yet know.

## Where it goes

`app/[lang]/settings/results/[id]/result-detail-client.tsx`, beside the existing
*Request payment* button at line 925. The two are siblings, deliberately:

> **Charge at the counter — SGD 460.00**  ·  *Request payment* (send a link instead)

Primary and secondary, not a segmented control or a mode toggle. **Staff** are
choosing between two instruments for the same money, and one of them is correct
almost every time they are standing next to a person. *Request payment* stays
exactly where it is and keeps working (story 11) — it is the fallback for a dead
reader, and slice 05 leans on it.

The amount is rendered **on the button**. It is the last thing **Staff** see before
the reader lights up and the number the customer has agreed to; making them read
it off a different part of the page is how the wrong build gets charged.

## Scope

### `GET /api/results/[id]/counter-charge`

Poll endpoint, `requireAdmin("results")`. Calls `readCounterState` from slice 03
and returns one discriminated state — never a partial or ambiguous shape:

```ts
type CounterState =
  | { state: "idle"; readers: ReaderSummary[]; amount: number; currency: string }
  | { state: "waiting_for_card"; paymentIntentId: string; readerId: string }
  | { state: "processing"; paymentIntentId: string }
  | { state: "approved"; paymentIntentId: string; amount: number }
  | { state: "declined"; paymentIntentId: string; reason: DeclineReason }
  | { state: "cancelled" }
  | { state: "reader_offline"; readerId: string; lastSeenAt: string | null }
  | { state: "unavailable"; why: "no_reader" | "not_assigned" | "already_sold" | "switched_off" };
```

`approved` is derived from the PaymentIntent being `succeeded` at Stripe, never
from the create call's 200.

### Client state machine

`idle → creating → waiting_for_card → processing → approved | declined | cancelled`

- Poll every **2s** while non-terminal; stop on terminal. Not SSE and not a
  websocket: this is a thirty-second interaction with one operator, so fifteen
  polls is the entire cost, and a reconnecting stream is more moving parts than the
  problem has.
- Cap at 90s, then show *Taking longer than expected* with the cancel action
  promoted — the reader's own timeout is around a minute, so the UI must not
  outlive it silently.
- The webhook is the source of truth; the poll is how the page learns. A page
  reloaded mid-payment resumes into the right state, because state is derived
  from Stripe and the **Result** row rather than held in React.

### What each state looks like

| State | Copy | Affordance |
|---|---|---|
| `idle` | **Charge at the counter — SGD 460.00** | Primary button; reader name beneath if more than one |
| `creating` | *Waking the reader…* | Disabled, spinner |
| `waiting_for_card` | **Ask for the card** · *Reader: Chai Chee counter* | Prominent; *Cancel* secondary |
| `processing` | *Authorising…* | No cancel — the card is committed |
| `approved` | **Approved · SGD 460.00** | *Complete the sale* → the existing accept action |
| `declined` | mapped copy, see below | **Try again** (reuses the intent) · *Send a link instead* |
| `cancelled` | *Cancelled — nothing was charged* | Back to `idle` |
| `reader_offline` | *The reader is offline. Last seen 2 hours ago.* | *Send a link instead* primary; retry secondary |
| `unavailable` | reason-specific | link to what is missing |

`processing` deliberately has no cancel. Between card presentment and the
authorization result there is nothing safe to cancel, and a cancel button that
cannot work is worse than none.

### Decline copy — the part that gets read out loud

Map Stripe's decline codes to something a shop assistant can say. Never render a
raw code as the primary message.

| Stripe | What **Staff** sees |
|---|---|
| `card_declined` / `generic_decline` | *The bank declined this card. Ask for another card, or send a payment link instead.* |
| `insufficient_funds` | *Not enough funds on this card.* |
| `incorrect_pin` / `pin_try_exceeded` | *Wrong PIN. Ask them to try again, or use another card.* |
| `card_not_supported` | *This card type isn't accepted. Visa, Mastercard and Amex work here.* |
| `expired_card` | *This card has expired.* |
| `processing_error` | *Something went wrong at the bank's end — try again.* |
| timeout / no card presented | *No card was presented. Start again when they're ready.* |
| anything else | *The payment didn't go through.* + the raw code in small print |

Keep the raw code available in small monospace beneath, so a support conversation
is not guesswork. The mapping table lives in
`lib/counter-payment/decline-copy.ts` and is unit-tested for total coverage of the
codes named above plus a fallback.

### Reader selection

One reader at the **Location** → no picker, name shown as context. Two or more → a
small select defaulting to the most recently used, persisted in `localStorage` per
admin. The point of story 12 is that **Staff** know which screen is about to light
up, which a label satisfies; a chooser only earns its place when there is a real
choice.

### Mobile

The **Admin Panel** is used on a handset in the shop. The counter control must be
reachable without horizontal scroll at 375px, the primary button must meet the
44px touch target the mobile UX PRD established, and `waiting_for_card` must be
legible at arm's length — that state is read while looking at a customer, not at
the phone.

## Acceptance criteria

- [ ] Full happy path against a simulated reader, driven from the UI: idle →
      approved → *Complete the sale* → **Order**.
- [ ] `approved` is never shown for a PaymentIntent that is not `succeeded` at
      Stripe. Asserted with a fake that returns 200 from create and a
      non-succeeded intent.
- [ ] Reloading the page mid-payment resumes into the correct state.
- [ ] Cancel from `waiting_for_card` cancels the **Reader action** and charges
      nothing.
- [ ] No cancel affordance exists in `processing`.
- [ ] Every decline code in the table renders its mapped copy; the raw code is
      present but secondary.
- [ ] *Try again* after a decline reuses the PaymentIntent id — verified by
      asserting Stripe saw no second create.
- [ ] `reader_offline` and every `unavailable` reason render without an
      unhandled-state fallthrough. A `CounterState` switch with no default that
      TypeScript proves exhaustive.
- [ ] Polling stops on terminal states and on unmount — no interval leak.
- [ ] *Request payment* is unchanged and still works.
- [ ] 375px: no horizontal scroll, 44px targets, `waiting_for_card` legible.
- [ ] `viewer` sees no counter control.

## Notes

The one-sentence test for this slice: **can an assistant who has never seen the
screen before take a payment while talking to a customer?** If a state needs
explaining, it is the copy that is wrong, not the assistant.
