import { getShopifyEnv } from './env'

type ShopifyJson = Record<string, unknown> | Array<unknown>
type ShopifyErrorResponse = { errors?: unknown }

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function shopifyFetch(path: string, init?: RequestInit) {
  const env = getShopifyEnv()
  const url = `https://${env.shopDomain}/admin/api/${env.apiVersion}${path}`
  const maxAttempts = 6
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetch(url, {
      ...init,
      headers: {
        'X-Shopify-Access-Token': env.adminAccessToken,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    })

    // Rate limit handling
    if (res.status === 429) {
      const retryAfterRaw = res.headers.get('retry-after')
      const retryAfterSeconds = retryAfterRaw ? Number.parseFloat(retryAfterRaw) : NaN
      const baseDelayMs = Number.isFinite(retryAfterSeconds) ? Math.ceil(retryAfterSeconds * 1000) : 750
      const jitterMs = Math.floor(Math.random() * 150)
      const backoffMs = baseDelayMs + jitterMs + (attempt - 1) * 250
      await sleep(backoffMs)
      continue
    }

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

  throw new Error('Shopify API 429 Too Many Requests: Exceeded retry attempts')
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

export async function shopifyUpdateVariant(args: {
  variantId: string
  price?: string | null
  compareAtPrice?: string | null
  sku?: string | null
}): Promise<void> {
  const patch: Record<string, unknown> = { id: Number(args.variantId) }
  if (args.price !== undefined) patch.price = args.price
  if (args.compareAtPrice !== undefined) patch.compare_at_price = args.compareAtPrice
  if (args.sku !== undefined) patch.sku = args.sku

  await shopifyFetch(`/variants/${args.variantId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ variant: patch }),
  })
}


