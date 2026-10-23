# The store delivers to the countries its shipping methods list, checked against live courier coverage

Status: Accepted (2026-10-22)

The storefront used to offer a fixed list of countries: six at checkout, seven in the delivery
checker, nine in the Couriers test, eighteen quick-add chips on the method form, and a main city
for ten. Easyship's own pages for its Singapore couriers (DHL Express, J&T Express, Ninja Van)
say each ships from Singapore to over 220 countries, so shipping worldwide was blocked by our
lists rather than by couriers.
This record makes the methods the only list, and makes the courier account answer which
countries it can actually serve.

## Decision

- **A Delivery country is a country an active Shipping method lists.** Checkout and the delivery
  checker offer exactly the union of active methods' `countries`
  (`GET /api/shop/shipping/countries`, `deliveryCountries`). Adding a country to a method offers
  it. There is no second list to keep in step.
- **One country catalog, in code.** `lib/shipping/countries.ts` holds every country a method can
  list (about 230: ISO codes, less the comprehensively sanctioned CU, IR, KP and SY and
  uninhabited territories), grouped into ten regions. Each has a main city, which a quote sends
  when the shopper has not given one, because Easyship refuses a blank city. Each also has a
  sample postal code, or null where the country has no postal codes in general use. The
  catalog replaces every hardcoded list and the old ten-city `QUOTE_CITY`.
- **No postal code where a country has none.** Hong Kong, the UAE, Qatar and others quote and
  check out with the postal code blank (`QuoteDestinationSchema`, the checkout address schema,
  `isPostalReady(postal, country)`). A country outside the catalog is assumed to have postal
  codes.
- **Coverage is checked live, never stored.** Settings → Shipping → Coverage quotes one boxed
  item to each country's main city and sample postal code through the existing test endpoint,
  four at a time, and shows which countries have a courier, the cheapest and fastest cost to
  us, and which methods already offer them. It can add the covered countries to a live method
  in one step. Courier reach changes with the account and the parcel, so a stored answer would
  go stale. Every checkout quotes its own address anyway (ADR 0022).
- **Far countries belong on live methods.** The coverage tool adds countries only to live
  methods. The method form warns when a flat method spans more than one region, because one
  price for Singapore and Brazil is the problem that live rates were introduced to fix
  (ADR 0020).

## Consequences

- A live method that lists a country no courier serves is hidden there, as before (ADR 0022).
  Listing "Worldwide" on a live method is safe. Listing it on a flat method charges the flat
  price everywhere.
- A sample postal code that a courier rejects shows as a failed row in the coverage check, not
  as "no courier". Staff can re-test that country with a real address under Couriers → Test a
  quote.
- Quotes made from a postal code alone send the country's main city with the shopper's postal
  code. That was already true for the ten listed countries. Couriers that check city against
  postal code (some United States and Canadian services) may refuse until the shopper's city is
  entered at checkout.
- Results are unchanged. Customisation orders still charge a method's `base_rate` and do not
  quote couriers (ADR 0020). The configurator's address still defaults to Singapore.
- International parcels go DDU by default (Settings → Shipping → Couriers → Customs & quotes),
  so the receiver pays any duties and import taxes. The storefront does not say so yet.
