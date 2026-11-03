# The label is made when the order is paid, and the order ships when the courier collects it

Status: Accepted (2026-11-03). Supersedes the label consequence of ADR 0043 and the "a label
ships the order" rule of ADR 0020.

Staff should not have to make labels. A paid order that ships by courier should already have its
label waiting, a PDF to print and stick on the box.

## Context

- A courier label carries the courier's barcode and tracking number, and the courier issues them
  only when the label is paid for. No courier accepts a label made without them. So making a label
  means buying it: Easyship charges the courier's fee to its account when the label is made.
- Until now Staff made each label by hand ("Buy courier label"), and making it marked the order
  shipped and emailed the customer. A label made at payment would then tell a customer their
  made-to-order pillow had shipped before anyone had made it.
- Labels can be cancelled, with the fee refunded to the Easyship account, until the courier has the
  parcel (`POST /shipments/{id}/cancel`).

## Decision

- **The label is made at payment.** Once a shop checkout is confirmed (Stripe webhook) or a
  **Result** is accepted into an **Order**, `autoCreateOrderLabel` (`lib/shipping/auto-label.ts`)
  makes the label after the response, through `after()`, so a slow courier never holds up the
  payment. It uses the customer's courier only: the one they paid for at checkout, else the one
  their live **Shipping method** picks from today's rates (`preselectCourier`, ADR 0043).
- **It does not choose a courier for the customer.** No label is made when the method charges a
  flat price (it names no courier), when the courier the customer paid for is not offered today,
  when no courier serves the parcel, or when Easyship refuses. A `label_not_made` timeline event
  says why, and Staff make it with **Create label**. An order that ships nothing (a self-collect, a
  service-only order, Easyship not connected) is skipped without a note. An order with a shipment
  is left alone, so a replayed payment or Staff racing it cannot make two.
- **The order ships when the courier collects it.** A label stores the label, the courier and the
  tracking, and does not change the order's status. The first courier status that only a
  collected parcel can have (in transit, out for delivery, a delivery attempt, delivered) marks
  the order shipped and sends the shipping email, once (`markOrderShippedByCourier`, claimed on
  `shipped_at`). No separate "in transit" email goes with it. Customers see tracking only once
  shipped, as before.
- **A full refund cancels the label** while the courier has not collected the parcel
  (`cancelOrderLabel`). The shipment is cleared, so the label cannot be printed and a reinstated
  order can get a new one. When Easyship refuses, the timeline tells Staff to cancel it there and
  not send the parcel.
- In the Admin Panel the action is **Create label**, and the PDF is **Print label**. Nothing there
  says "buy".

## Consequences

- Every paid courier order costs its label fee at payment, including orders later cancelled; a
  full refund gets the fee back unless the parcel has left. A partial refund keeps the label.
- Flat-price methods get no automatic label. Standard and Express need to be live methods pinned
  to their courier for their labels to be made.
- "Shipped" needs Easyship's tracking webhook. Without it, Staff mark orders shipped by hand.
- Staff-made orders, and orders paid any other way, get no automatic label; Staff create it.
- A made-to-order pillow's label can wait weeks on the shelf. Easyship lets a label be cancelled
  for six months; this assumes the courier still honours it when it is collected.
