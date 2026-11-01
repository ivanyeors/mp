# Architecture decision records

One file per decision, numbered in the order the decisions were made. A new record takes the next
free number and adds its line here. A record that changes an earlier one says so, and the earlier
one is amended to point at it.

| ADR | Decision |
|---|---|
| [0001](0001-costings-single-price-source.md) | Costings is the single source of sell price; products are an inventory projection |
| [0002](0002-authorize-then-capture-customised-goods.md) | Authorize-then-capture for customised goods |
| [0003](0003-fillings-only-in-filling-templates.md) | Fillings live only in Filling Templates |
| [0004](0004-slide-config-asset-adoption.md) | Adopt product slide section media onto Media Assets |
| [0005](0005-pre-order-authorization-hold.md) | Pre-order on authorization hold when inventory cannot fulfill now |
| [0006](0006-analytics-db-channel-facts.md) | Analytics reads DB channel facts; Shopify Admin API is ingest-only |
| [0007](0007-first-party-journey-analytics.md) | First-party journey analytics: DB source of truth, Prospect-default transition graph |
| [0008](0008-spatial-filling-placements.md) | Spatial filling placements; pack list derived |
| [0009](0009-xray-filling-visuals.md) | X-ray filling visuals: clipped fluid SVG, legible piece count |
| [0010](0010-rules-engine-single-recommendation-authority.md) | Rules Engine is the single recommendation authority |
| [0011](0011-returns-rma-lifecycle.md) | Returns/RMA is an item-level request with an explicit lifecycle |
| [0012](0012-locations-unified-partner-model.md) | A Location is the partners table extended with a type, not a new table |
| [0013](0013-custom-multi-location-booking.md) | Booking is first-party with a Location picker, writing to Google Calendar via events.insert |
| [0014](0014-config-reference-photos.md) | Staff reference photos live in the media bucket but bypass the DAM, keyed by a shared session id |
| [0015](0015-partner-referral-attribution-commission.md) | Partner referrals: single-credit closer-wins attribution, delivery-aligned commission release, clinic-margin framing |
| [0016](0016-deferred-payment-for-assisted-builds.md) | Deferred payment for Results with no authorization hold |
| [0017](0017-assisted-finish-after-assignment.md) | The finish of an Assisted customisation comes after assignment |
| [0018](0018-filling-template-size-membership.md) | Filling Templates are scoped by size membership, not one size key |
| [0019](0019-physical-fit-model.md) | The x-ray has a physical fit model: measurements in millimetres, fit derived on read |
| [0020](0020-easyship-live-shipping-rates.md) | Shipping is priced live through Easyship, re-priced on the server, and labelled from the order |
| [0021](0021-easyship-settings-source-of-truth.md) | Easyship account configuration is owned by the platform and pushed, never pulled |
| [0022](0022-live-shipping-has-no-fallback.md) | A live shipping method with no courier quote is hidden, never charged a fallback |
| [0023](0023-rbac-roles-are-data-permissions-are-code.md) | Admin Panel RBAC: roles are data, permissions are code |
| [0024](0024-services-priced-in-costings.md) | Services are priced in Costings as non-inventory rows; a paid service is an Order line |
| [0025](0025-soft-cut-display-physics.md) | The cross-section draws a soft-body settle; the fit model still decides where everything goes |
| [0026](0026-paired-build-one-hold.md) | A Paired build is two Results under one Authorization hold, accepted together into one Order |
| [0027](0027-size-keyed-template-outputs-and-any-combine.md) | A Template output may hold one template per size, and a Combine may OR its branches |
| [0028](0028-customer-crm.md) | The Customer CRM reads the facts the platform already records, and sends no marketing |
| [0029](0029-shopify-customer-migration.md) | Shopify customers are imported as Customer rows, never as accounts, and claimed by signing in |
| [0030](0030-loyalty-points.md) | Points are a dollar offset kept in an append-only ledger, earned on what was kept and spent only on shop orders |
| [0031](0031-delivery-countries-are-the-methods-countries.md) | The store delivers to the countries its shipping methods list, checked against live courier coverage |
| [0032](0032-customisations-quote-live-shipping.md) | Customisations price shipping live, and the Result keeps the rate it was quoted |
| [0033](0033-one-checkout-code-and-discounts-on-results.md) | One checkout code field, and discount codes on customisations |
| [0034](0034-commission-pool-partner-share-customer-discount.md) | Partner commission follows the agreement's Schedule: a flat pool per qualifying order, the partner's share, and a customer discount Staff turn on |
| [0035](0035-google-reviews-through-places-until-business-profile.md) | Google reviews reach Telegram through the Places API until the Business Profile API is approved |
| [0036](0036-campaign-email-is-typed-blocks.md) | A campaign's email is typed blocks, rendered by our own components and written in one shared editor |
| [0037](0037-partner-branch-locations.md) | A partner's other clinics are branch Location rows under its main row |
| [0038](0038-staff-refunds-full-items-or-amount.md) | Staff refund an Order in full, by its lines, or by an amount, and a charge correction needs no return |
| [0039](0039-marketing-consent-by-default.md) | Imported customers start subscribed, and the checkout box is ticked by default |
| [0040](0040-campaign-audiences-read-the-crm.md) | Campaign audiences read the CRM, and one claim rule decides who receives |
| [0041](0041-sign-up-is-the-customer-sign-in.md) | The sign-up is the Customer sign-in, and Staff sign in on their own tab |
| [0042](0042-google-form-fitting-records.md) | Google Form fittings are imported as Fitting records on the Customer, one person's visits on one Customer; the customer sees their own, without the photos |
