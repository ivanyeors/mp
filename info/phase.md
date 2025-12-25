# Goal (what we’re building)
    - Platform is source of truth for all inventory (parts + “buildable” finished goods).
    - Shopify shows availability and sends sales events.
    - Any Shopify sale (main product or part) updates Supabase inventory transactions, then Shopify inventory is pushed back to match:
        - Main products → platform buildable
        - Parts → platform on_hand

## What to do next (phased plan)

# Phase A — Decide which parts are “sellable” in Shopify
    From your list:
    Sellable / should be synced as parts:
    - Linen Case (variants)
    - Waterproof Inner Protector (variants)
    - Fillings (variants)
    - Cover sheets (variants)
    - Ear Comfort Pad (no variants)
    - Cervical Neck Support (no variants)

    Not sellable (keep only in BOM, do not create Shopify products):
    - Packaging (vacuum bag, laundry net)

# Phase B — Make a SKU scheme that guarantees perfect mapping
    Because Shopify variant IDs are annoying to hunt, the easiest is: SKU contains the platform items.id.
    Use this SKU format for every Shopify part variant:
        - MP-ITEM-<id>
        - Example: MP-ITEM-1024

Optional (human-readable, not used by the system):
        MP-ITEM-<id>-<shortlabel>
        Example: MP-ITEM-1024-CASE-XS-NWL

Key rule: the mapping only needs the numeric <id> to be present and stable.

# Phase C — Create/adjust Shopify “part” products to match platform items
    - For each part family (e.g. “Linen Case”):
        - Create a Shopify product (or reuse existing).
        - For each variant that should have distinct inventory, set its SKU to the platform item id:
        - Variant “XS / Natural White Linen” → SKU MP-ITEM-<items.id for that exact variant>
        - Variant “M / Deep Blue Linen” → SKU MP-ITEM-<items.id for that exact variant>

    - For “no variants” parts:
        Use a single variant “Default” with SKU MP-ITEM-<id>

# Phase D — Add part mappings into shopify_variant_mappings
    You already have support for this:
    - kind='part' with item_id=<items.id>

    Once mapped:
    - /api/shopify/sync will update those part variants using inventory_balances.on_hand
    - Shopify part sales will decrement the correct items.id via the webhook and keep everything consistent

# Phase E — Automation / safety (strongly recommended)
    - Set SHOPIFY_SYNC_TOKEN and require Authorization: Bearer ... for sync endpoints (prevents anyone from hitting them publicly).
    - Add a Vercel Cron to call /api/shopify/sync every 1–5 minutes (keeps Shopify always accurate even if webhook retry timing is weird).
