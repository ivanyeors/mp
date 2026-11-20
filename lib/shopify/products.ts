import { getShopifyEnv } from './env'

type ShopifyProductVariant = {
  id: number
  product_id?: number
  title?: string
  sku?: string | null
  option1?: string | null
  option2?: string | null
  option3?: string | null
  inventory_item_id?: number
}

export type ShopifyProduct = {
  id: number
  title: string
  handle?: string
  status?: 'active' | 'archived' | 'draft' | string
  variants?: ShopifyProductVariant[]
}

type ProductsResponse = { products?: ShopifyProduct[] }
type ProductResponse = { product?: ShopifyProduct }

async function shopifyRest(path: string, init?: RequestInit) {
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
  const json = text ? JSON.parse(text) : null
  if (!res.ok) {
    throw new Error(`Shopify API ${res.status} ${res.statusText}: ${text || 'Unknown error'}`)
  }
  return json
}

export async function shopifyListActiveProductsWithVariants(args?: { limit?: number }): Promise<ShopifyProduct[]> {
  const limit = Math.min(250, Math.max(1, args?.limit ?? 250))
  const json = (await shopifyRest(
    `/products.json?status=active&limit=${limit}&fields=id,title,handle,status,variants`,
    { method: 'GET' },
  )) as ProductsResponse
  return json.products ?? []
}

async function shopifyFindProductByHandle(handle: string): Promise<ShopifyProduct | null> {
  const json = (await shopifyRest(
    `/products.json?limit=250&fields=id,title,handle,status,variants`,
    { method: 'GET' },
  )) as ProductsResponse
  const all = json.products ?? []
  return all.find(p => String(p.handle || '').toLowerCase() === handle.toLowerCase()) ?? null
}

export async function shopifyUpsertCanonicalProduct(args: {
  handle: string
  title: string
  optionName: string
  optionValues: string[]
  skuPrefix?: string
}): Promise<ShopifyProduct> {
  const existing = await shopifyFindProductByHandle(args.handle)

  const variants = args.optionValues.map((v) => ({
    option1: v,
    ...(args.skuPrefix ? { sku: `${args.skuPrefix}${v.replace(/\s+/g, '').toUpperCase()}` } : {}),
  }))

  if (!existing) {
    const payload = {
      product: {
        title: args.title,
        handle: args.handle,
        status: 'active',
        options: [{ name: args.optionName, values: args.optionValues }],
        variants,
      },
    }
    const created = (await shopifyRest('/products.json', { method: 'POST', body: JSON.stringify(payload) })) as ProductResponse
    if (!created.product) throw new Error('Failed to create product')
    return created.product
  }

  const updatePayload = {
    product: {
      id: existing.id,
      title: args.title,
      handle: args.handle,
      status: 'active',
      options: [{ name: args.optionName, values: args.optionValues }],
    },
  }
  await shopifyRest(`/products/${existing.id}.json`, { method: 'PUT', body: JSON.stringify(updatePayload) })

  const refreshed = (await shopifyRest(
    `/products/${existing.id}.json?fields=id,title,handle,status,variants,options`,
    { method: 'GET' },
  )) as ProductResponse

  const product = refreshed.product ?? existing
  const existingValues = new Set((product.variants ?? []).map(v => String(v.option1 ?? '').trim()).filter(Boolean))
  const missing = args.optionValues.filter(v => !existingValues.has(v))
  for (const v of missing) {
    const createVariantPayload = {
      variant: {
        option1: v,
        ...(args.skuPrefix ? { sku: `${args.skuPrefix}${v.replace(/\s+/g, '').toUpperCase()}` } : {}),
      },
    }
    await shopifyRest(`/products/${existing.id}/variants.json`, { method: 'POST', body: JSON.stringify(createVariantPayload) })
  }

  const final = (await shopifyRest(
    `/products/${existing.id}.json?fields=id,title,handle,status,variants`,
    { method: 'GET' },
  )) as ProductResponse
  if (!final.product) throw new Error('Failed to load product after update')
  return final.product
}


