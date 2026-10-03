# Easyship account configuration is owned by the platform and pushed, never pulled

Everything we configure in the Easyship account — tracking email and page branding, default
sender/return/pickup/billing addresses, custom boxes, shipping rules and the webhook
registration — is stored as one JSON document in the `easyship` row of `api_configs` and
mirrored to Easyship on every save. Easyship is a projection of that row, the same way
storefront products are a projection of inventory.

## Decisions

- **One document, one endpoint.** `PUT /api/settings/easyship` is whole-document: validate,
  save, push, record the report. The settings page and any agent use the same call; there is no
  second write path and no partial-update API to keep consistent.
- **Push is a reconcile, not a replay.** The sync reads what Easyship holds and only writes the
  difference: addresses match by line 1 + postal code + country + company, boxes and rules by
  name, the webhook by endpoint. Custom boxes and rules absent from the document are deleted;
  addresses are never deleted (Easyship keeps a customer-address history there) and courier
  flat-rate boxes are Easyship's.
- **A rule whose clauses change is recreated.** Easyship exposes per-clause endpoints, but
  nothing of ours references rule ids, so delete-and-create is the smaller, safer diff.
- **Import seeds, it does not sync back.** "Import from Easyship" fills the editor from the live
  account for review; nothing is written until Save. There is no background pull, so a dashboard
  edit is overwritten on the next save — that is the point.
- **The webhook secret is captured on sync.** The receiver (`app/api/shipping/easyship/webhook`,
  from the live-rates work, PR #219) verifies Easyship's HS256 signature with
  `EASYSHIP_WEBHOOK_SECRET`, else the `secret_token` the API returned when the sync registered
  our webhook — so registering from the settings page needs no env change.
- **Agents are first-class writers.** `Authorization: Bearer $EASYSHIP_SYNC_TOKEN` opens the same
  endpoint as a `shipping` Staff session (`lib/auth/bearer-or-admin.ts`, shared with the Shopify
  sync guard).

## Consequences

- The API token stays in the environment; the DB row holds only configuration and the webhook
  secret (service-role RLS).
- The settings cannot be edited in two places without the platform winning. Staff must be told
  the dashboard is read-only for these areas.
- Shipment creation and rating are not covered; when they arrive they consume this document's
  addresses and boxes rather than storing their own.
