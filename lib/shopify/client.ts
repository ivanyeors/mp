import { getShopifyEnv } from './env'

type ShopifyJson = Record<string, unknown> | Array<unknown>
type ShopifyErrorResponse = { errors?: unknown }

async function shopifyFetch(path: string, init?: RequestInit) {
  const env = getShopifyEnv()
  const url = `https://${env.shopDomain}/admin/api/${env.apiVersion}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      'X-Shopify-Access-Token': env.adminAccessToken,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })
  const text = await res.text()
  const json = text ? (JSON.parse(text) as ShopifyJson) : null
  if (!res.ok) {
    const msg =
      typeof json === 'object' && json && 'errors' in (json as ShopifyErrorResponse)
        ? String((json as ShopifyErrorResponse).errors)
        : text
    throw new Error(`Shopify API ${res.status} ${res.statusText}: ${msg}`)
  }
  return json
}

export async function shopifyGetPrimaryLocationId(): Promise<string> {
  const env = getShopifyEnv()
  if (env.locationId) return env.locationId
  const json = (await shopifyFetch('/locations.json', { method: 'GET' })) as { locations?: Array<{ id: number; active?: boolean }> }
  const locations = (json.locations ?? []) as Array<{ id: number; active?: boolean }>
  const loc = locations.find(l => l.active !== false) ?? locations[0]
  if (!loc?.id) throw new Error('No Shopify locations found')
  return String(loc.id)
}

export async function shopifyGetVariantInventoryItemId(variantId: string): Promise<string> {
  const json = (await shopifyFetch(`/variants/${variantId}.json`, { method: 'GET' })) as { variant?: { inventory_item_id?: number } }
  const inventoryItemId = json.variant?.inventory_item_id
  if (!inventoryItemId) throw new Error(`Missing inventory_item_id for variant ${variantId}`)
  return String(inventoryItemId)
}

export async function shopifySetInventoryLevel(args: {
  locationId: string
  inventoryItemId: string
  available: number
}): Promise<void> {
  await shopifyFetch('/inventory_levels/set.json', {
    method: 'POST',
    body: JSON.stringify({
      location_id: Number(args.locationId),
      inventory_item_id: Number(args.inventoryItemId),
      available: Math.max(0, Math.floor(args.available)),
    }),
  })
}


