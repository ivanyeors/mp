---- MODULE Checkout ----
\* A toy checkout for the statechart selftest. It is not a model of this
\* site's code. One shopper, one pillow, a QR that stays on screen after the
\* hold on the pillow runs out. Fixed = FALSE has the bug; TRUE refunds.
CONSTANT Fixed
VARIABLES order, money, unit
vars == <<order, money, unit>>

Init == order = "cart" /\ money = "none" /\ unit = "free"

YouCheckOut ==
  /\ order = "cart"
  /\ order' = "paying"
  /\ unit' = "held"
  /\ UNCHANGED money

YouPay ==
  /\ order \in {"paying", "expired"}
  /\ money = "none"
  /\ money' = "taken"
  /\ UNCHANGED <<order, unit>>

HoldRunsOut ==
  /\ order = "paying"
  /\ order' = "expired"
  /\ unit' = "free"
  /\ UNCHANGED money

SomeoneElseBuys ==
  /\ order = "expired"
  /\ unit = "free"
  /\ unit' = "other"
  /\ UNCHANGED <<order, money>>

BankNotice ==
  /\ money = "taken"
  /\ order \in {"paying", "expired"}
  /\ IF order = "expired" /\ Fixed
     THEN /\ order' = "refunded"
          /\ money' = "returned"
          /\ UNCHANGED unit
     ELSE /\ order' = "paid"
          /\ unit' = (IF unit = "held" THEN "sold" ELSE unit)
          /\ UNCHANGED money

Done == order \in {"paid", "refunded"} /\ UNCHANGED vars

Next == YouCheckOut \/ YouPay \/ HoldRunsOut \/ SomeoneElseBuys \/ BankNotice \/ Done

Spec == Init /\ [][Next]_vars

\* Every paid order has a pillow set aside for it.
PaidOrderHasItsPillow == order = "paid" => unit = "sold"
====
