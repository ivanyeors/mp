---
name: easyship
description: Read or change the Easyship account configuration (tracking email/page branding, default addresses, custom boxes, shipping rules, webhook) through the platform's settings API, which is the source of truth and pushes to Easyship. Use when the user asks to change anything in Easyship, sync Easyship, or check what Easyship holds.
---

# Easyship settings

The platform row (`api_configs` slug `easyship`) is the source of truth. Never call the Easyship
API directly to change config — write through the platform endpoint so the DB and Easyship stay
equal and the sync report is recorded.

## Endpoint

`/api/settings/easyship` — auth is either a Staff session with `shipping`, or
`Authorization: Bearer $EASYSHIP_SYNC_TOKEN`. Prod base `https://custom.mpillow.com`; local
`http://localhost:3000` (local never registers the webhook — the origin is not public).

| Call | Does |
|---|---|
| `GET` | saved settings + last sync report + webhook endpoint |
| `GET ?live=1` | same, plus a read-only snapshot of what Easyship holds now |
| `PUT` body=full settings | validate → save → push to Easyship → return `report` |
| `POST` body=`{"action":"sync"}` | re-push saved settings unchanged |
| `GET /reference` | ids the rule editor needs: countries, courier services, boxes, addresses, stores, categories (`?refresh=1` busts the 1h cache) |

The body shape is `EasyshipSettingsSchema` in `lib/easyship/schema.ts`; rule condition/action
option keys are `RULE_CONDITIONS` / `RULE_ACTIONS` there. `PUT` is whole-document: GET first,
edit the JSON, PUT it back.

## Agent recipe

```bash
# tokens come from the environment; never echo them
curl -s -H "Authorization: Bearer $EASYSHIP_SYNC_TOKEN" https://custom.mpillow.com/api/settings/easyship > /tmp/es.json
jq '.settings.tracking_email.footnote = "Thanks from Mpillow"' /tmp/es.json | jq '.settings' > /tmp/es-next.json
curl -s -X PUT -H "Authorization: Bearer $EASYSHIP_SYNC_TOKEN" -H "content-type: application/json" \
  --data @/tmp/es-next.json https://custom.mpillow.com/api/settings/easyship | jq '.ok, .report.steps[] | select(.action != "unchanged")'
```

Report `steps[].action` is one of created / updated / deleted / unchanged / activated /
deactivated / skipped / error. `ok:false` means at least one `error` step; the save still landed.

## Gotchas

- Boxes and shipping rules not in the saved settings are **deleted** in Easyship on sync. Import
  from live (`GET ?live=1` → `importFromLive` in `lib/easyship/schema.ts`, or the page's button) before the first PUT.
- Addresses match by line 1 + postal code + country + company. Only addresses with a default flag are imported; strays stay untouched.
- A rule whose conditions/actions change is deleted and recreated (new Easyship id).
- `match_country` takes numeric Easyship country ids, not alpha-2 — use `/reference`.
- `allowed_statuses: []` leaves Easyship unchanged (clear it in the dashboard).
- The webhook receiver (`app/api/shipping/easyship/webhook/route.ts`, from the live-rates work) verifies with `EASYSHIP_WEBHOOK_SECRET`, else the signing secret captured on sync.
