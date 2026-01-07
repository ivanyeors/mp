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

export type ShopifyOrderLite = {
  id: number
  name?: string | null
  created_at?: string | null
  financial_status?: string | null
  fulfillment_status?: string | null
  line_items: Array<{
    id: number
    title?: string | null
    sku: string | null
    quantity: number
    variant_id: number | null
  }>
}

export async function shopifyListPaidOrders(args?: {
  limit?: number
  createdAtMin?: string
  createdAtMax?: string
}): Promise<ShopifyOrderLite[]> {
  const limit = Math.max(1, Math.min(250, Math.floor(args?.limit ?? 50)))
  const qs = new URLSearchParams()
  qs.set('status', 'any')
  qs.set('financial_status', 'paid')
  qs.set('limit', String(limit))
  // Keep payload small; line_items is needed for mapping.
  qs.set('fields', 'id,name,created_at,financial_status,fulfillment_status,line_items')
  if (args?.createdAtMin) qs.set('created_at_min', args.createdAtMin)
  if (args?.createdAtMax) qs.set('created_at_max', args.createdAtMax)

  const json = (await shopifyFetch(`/orders.json?${qs.toString()}`, { method: 'GET' })) as {
    orders?: ShopifyOrderLite[]
  }

  return (json.orders ?? []).filter((o): o is ShopifyOrderLite => !!o && typeof o.id === 'number' && Array.isArray(o.line_items))
}


