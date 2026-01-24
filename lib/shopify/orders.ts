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
  currency?: string | null
  line_items: Array<{
    id: number
    title?: string | null
    sku: string | null
    quantity: number
    variant_id: number | null
    price?: string | null
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
  // Include line_items.price for revenue aggregations.
  qs.set('fields', 'id,name,created_at,financial_status,fulfillment_status,currency,line_items')
  if (args?.createdAtMin) qs.set('created_at_min', args.createdAtMin)
  if (args?.createdAtMax) qs.set('created_at_max', args.createdAtMax)

  const json = (await shopifyFetch(`/orders.json?${qs.toString()}`, { method: 'GET' })) as {
    orders?: ShopifyOrderLite[]
  }

  return (json.orders ?? []).filter((o): o is ShopifyOrderLite => !!o && typeof o.id === 'number' && Array.isArray(o.line_items))
}

function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null
  const parts = linkHeader.split(',').map((p) => p.trim())
  for (const part of parts) {
    // Example: <https://{shop}.myshopify.com/admin/api/{ver}/orders.json?...&page_info=...>; rel="next"
    if (!part.includes('rel="next"')) continue
    const m = part.match(/<([^>]+)>/)
    return m?.[1] ?? null
  }
  return null
}

async function shopifyFetchAbsolute(url: string, init?: RequestInit) {
  const env = getShopifyEnv()
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
    return { json, headers: res.headers }
  }

  throw new Error('Shopify API 429 Too Many Requests: Exceeded retry attempts')
}

export async function shopifyListPaidOrdersPaginated(args?: {
  createdAtMin?: string
  createdAtMax?: string
  // Safety valve to avoid fetching unbounded order history.
  maxPages?: number
  pageSize?: number
}): Promise<ShopifyOrderLite[]> {
  const env = getShopifyEnv()
  const pageSize = Math.max(1, Math.min(250, Math.floor(args?.pageSize ?? 250)))
  const maxPages = Math.max(1, Math.min(20, Math.floor(args?.maxPages ?? 10)))

  const qs = new URLSearchParams()
  qs.set('status', 'any')
  qs.set('financial_status', 'paid')
  qs.set('limit', String(pageSize))
  qs.set('fields', 'id,name,created_at,financial_status,fulfillment_status,currency,line_items')
  if (args?.createdAtMin) qs.set('created_at_min', args.createdAtMin)
  if (args?.createdAtMax) qs.set('created_at_max', args.createdAtMax)

  let nextUrl: string | null = `https://${env.shopDomain}/admin/api/${env.apiVersion}/orders.json?${qs.toString()}`
  const out: ShopifyOrderLite[] = []

  for (let page = 1; page <= maxPages && nextUrl; page += 1) {
    const { json, headers } = await shopifyFetchAbsolute(nextUrl, { method: 'GET' })
    const parsed = json as { orders?: ShopifyOrderLite[] }
    const orders = (parsed.orders ?? []).filter(
      (o): o is ShopifyOrderLite => !!o && typeof o.id === 'number' && Array.isArray((o as ShopifyOrderLite).line_items),
    )
    out.push(...orders)

    const link = headers.get('link')
    nextUrl = parseNextLink(link)
  }

  return out
}


