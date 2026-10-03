# A live shipping method with no courier quote is hidden, never charged a fallback

Supersedes the "fail open on outages" decision in ADR 0020. A **Shipping method** priced by live
courier rates that gets no quote, whether from an outage, a missing token, an unreadable settings
row, no rates, or rates in the wrong currency, is left out of the options for that cart and
address. It is never charged its `base_rate`. Flat methods are unaffected.

## Context

ADR 0020 let a live method charge its `base_rate` as a **Fallback rate** whenever live rates
could not be fetched, and a global "Live rates for shoppers" switch turned every live method into
its fallback. In practice the fallback was a number Staff typed once and never revisited. It
undercharged far addresses and overcharged near ones, the same failure that led to live rates.
Flat methods were also described as a fallback, though nothing ties them to a courier.

## Decision

- **No quote, no option.** `priceMethod` returns null for a live method whenever the rates are
  missing, failed, empty, or in another currency. The checkout route already refuses a method it
  cannot price (400), so a stale page cannot buy one at a guessed price.
- **No switch.** The "Live rates for shoppers" switch and the `disabled` rates reason are gone.
  A live method is live whenever the courier account can quote. Label purchase never read the
  switch. The `shipping_settings.easyship_enabled` column is left in place, unread, and is
  dropped in a later migration.
- **Live is the default.** The new-method form opens on live courier rates, and the
  `shipping_methods.rate_source` column default is `'easyship'`. Existing rows keep theirs.
- **Staff are warned.** The Methods page says "If couriers can't be reached, checkout shows no
  shipping option." whenever no active flat method exists.

## Consequences

- An outage with only live methods active means checkout offers no shipping option until the
  couriers answer again. One active flat method keeps the store selling.
- The method form hides `base_rate` for live methods, so a new live method saves `base_rate` 0.
  **Results** still price shipping from `base_rate` at hold, assign, finish and accept (ADR 0020,
  Consequences). A live method offered on the customisation flow therefore needs a `base_rate`
  set while it is flat, or those holds charge no shipping. Live-pricing Results is still a
  separate slice.
