import fs from 'node:fs/promises'
import path from 'node:path'

function requireEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

function getEnv() {
  return {
    shopDomain: requireEnv('SHOPIFY_SHOP_DOMAIN'),
    adminAccessToken: requireEnv('SHOPIFY_ADMIN_ACCESS_TOKEN'),
    apiVersion: process.env.SHOPIFY_API_VERSION || '2025-07',
    locationId: process.env.SHOPIFY_LOCATION_ID || null,
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function shopifyFetchJson(pathname, init) {
  const env = getEnv()
  const url = `https://${env.shopDomain}/admin/api/${env.apiVersion}${pathname}`
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
    const json = text ? JSON.parse(text) : null
    if (!res.ok) {
      const msg = json && typeof json === 'object' && 'errors' in json ? String(json.errors) : text
      throw new Error(`Shopify API ${res.status} ${res.statusText}: ${msg || 'Unknown error'}`)
    }
    return { json, headers: res.headers }
  }

  throw new Error('Shopify API 429 Too Many Requests: Exceeded retry attempts')
}

function parseLinkHeader(link) {
  // Example:
  // <https://{shop}/admin/api/2025-07/products.json?limit=250&page_info=...>; rel="next"
  const out = {}
  const parts = String(link || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  for (const p of parts) {
    const m = p.match(/^<([^>]+)>\s*;\s*rel="([^"]+)"$/)
    if (!m) continue
    out[m[2]] = m[1]
  }
  return out
}

async function getPrimaryLocationId() {
  const env = getEnv()
  if (env.locationId) return env.locationId
  const { json } = await shopifyFetchJson('/locations.json', { method: 'GET' })
  const locations = (json?.locations ?? []).map((l) => ({ id: l.id, active: l.active }))
  const active = locations.find((l) => l.active !== false) ?? locations[0]
  if (!active?.id) throw new Error('No Shopify locations found')
  return String(active.id)
}

async function listAllActiveProducts() {
  const fields = [
    'id',
    'title',
    'handle',
    'status',
    'variants',
    'options',
  ].join(',')

  const products = []
  let nextUrl = null

  // First page
  {
    const { json, headers } = await shopifyFetchJson(
      `/products.json?status=active&limit=250&fields=${encodeURIComponent(fields)}`,
      { method: 'GET' },
    )
    products.push(...(json?.products ?? []))
    const link = headers.get('link')
    const parsed = parseLinkHeader(link)
    nextUrl = parsed.next ?? null
  }

  // Cursor pagination
  while (nextUrl) {
    const u = new URL(nextUrl)
    const pathnameWithQuery = `${u.pathname}${u.search}`
    const { json, headers } = await shopifyFetchJson(pathnameWithQuery, { method: 'GET' })
    products.push(...(json?.products ?? []))
    const link = headers.get('link')
    const parsed = parseLinkHeader(link)
    nextUrl = parsed.next ?? null
  }

  return products
}

async function fetchInventoryLevels({ locationId, inventoryItemIds }) {
  // Shopify supports multiple inventory_item_ids; keep batches small to be safe.
  const byId = new Map()
  const batchSize = 50

  for (let i = 0; i < inventoryItemIds.length; i += batchSize) {
    const batch = inventoryItemIds.slice(i, i + batchSize)
    const qs = new URLSearchParams({
      location_ids: String(locationId),
      inventory_item_ids: batch.join(','),
    })
    const { json } = await shopifyFetchJson(`/inventory_levels.json?${qs.toString()}`, { method: 'GET' })
    for (const level of json?.inventory_levels ?? []) {
      const iid = level?.inventory_item_id
      const available = level?.available
      if (iid !== undefined && iid !== null) {
        byId.set(String(iid), typeof available === 'number' ? available : Number(available))
      }
    }
    // light pacing
    await sleep(150)
  }

  return byId
}

function formatMoney(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

function uniq(arr) {
  return Array.from(new Set(arr))
}

function buildCurrentSection(product) {
  const title = product?.title ?? '(Untitled)'

  const variants = Array.isArray(product?.variants) ? product.variants : []
  const variantLines = variants.map((v) => {
    const vid = v?.id ?? null
    const vTitle = v?.title ?? null
    const sku = v?.sku ?? null
    const option1 = v?.option1 ?? null
    const option2 = v?.option2 ?? null
    const option3 = v?.option3 ?? null
    const price = formatMoney(v?.price ?? null)
    const compareAt = formatMoney(v?.compare_at_price ?? null)
    const inventory = v?._mp_inventory_available ?? null
    return { vid, vTitle, sku, option1, option2, option3, price, compareAt, inventory }
  })

  const prices = uniq(variantLines.map((v) => v.price).filter(Boolean))
  const msrpSummary =
    prices.length === 0 ? '—' : prices.length === 1 ? `${prices[0]}` : 'Varies by variant (see below)'

  const variantTitles = variantLines
    .map((v) => {
      const label = v.vTitle || [v.option1, v.option2, v.option3].filter(Boolean).join(' / ') || (v.vid ? String(v.vid) : 'Variant')
      const idSuffix = v.vid ? ` (variantId ${v.vid})` : ''
      return `${label}${idSuffix}`
    })
    .filter(Boolean)

  const skus = variantLines.map((v) => {
    const label = v.vTitle || (v.vid ? String(v.vid) : 'Variant')
    const idSuffix = v.vid ? ` (variantId ${v.vid})` : ''
    return v.sku ? `${label}${idSuffix}: ${v.sku}` : `${label}${idSuffix}: —`
  })
  const inv = variantLines.map((v) => {
    const label = v.vTitle || (v.vid ? String(v.vid) : 'Variant')
    const idSuffix = v.vid ? ` (variantId ${v.vid})` : ''
    return `${label}${idSuffix}: ${Number.isFinite(v.inventory) ? v.inventory : '—'}`
  })

  const priceByVariant =
    prices.length <= 1
      ? []
      : variantLines.map((v) => {
          const p = v.price ?? '—'
          const c = v.compareAt ? ` (compare_at: ${v.compareAt})` : ''
          const label = v.vTitle || (v.vid ? String(v.vid) : 'Variant')
          const idSuffix = v.vid ? ` (variantId ${v.vid})` : ''
          return `${label}${idSuffix}: ${p}${c}`
        })

  return [
    '### (Currrent product / accessories)',
    `- product listing name: ${title}`,
    `- list price (MSRP): ${msrpSummary}`,
    ...(priceByVariant.length ? ['  - per-variant prices:', ...priceByVariant.map((l) => `    - ${l}`)] : []),
    '- variants:',
    ...(variantTitles.length ? variantTitles.map((t) => `  - ${t}`) : ['  - —']),
    '- SKUs:',
    ...(skus.length ? skus.map((s) => `  - ${s}`) : ['  - —']),
    '- inventory:',
    ...(inv.length ? inv.map((s) => `  - ${s}`) : ['  - —']),
    '',
  ].join('\n')
}

function buildUpdatedPlaceholderSection(product) {
  const title = product?.title ?? '(Untitled)'
  return [
    '### (Updated product / accessories)',
    `- product listing name: ${title}`,
    '- list price (MSRP):',
    '- variants:',
    '- SKUs:',
    '- inventory:',
    '',
  ].join('\n')
}

function buildProductHeader(product) {
  const title = product?.title ?? '(Untitled)'
  const handle = product?.handle ?? null
  const pid = product?.id ?? null
  return `## ${title}${pid ? ` (ID ${pid})` : ''}${handle ? ` — \`${handle}\`` : ''}`
}

function keyForProduct(product) {
  const handle = product?.handle ? String(product.handle) : ''
  if (handle) return `handle:${handle.toLowerCase()}`
  const pid = product?.id ? String(product.id) : ''
  return pid ? `id:${pid}` : `title:${String(product?.title ?? '').toLowerCase()}`
}

function extractUpdatedSectionsByProduct(markdown) {
  const text = String(markdown || '')
  const blocks = text.split(/\n(?=##\s)/g)
  const map = new Map()
  for (const block of blocks) {
    const headerLine = block.split('\n')[0] ?? ''
    if (!headerLine.startsWith('## ')) continue
    const handleMatch = headerLine.match(/—\s*`([^`]+)`\s*$/)
    const idMatch = headerLine.match(/\(ID\s+(\d+)\)/)
    const key = handleMatch?.[1]
      ? `handle:${String(handleMatch[1]).toLowerCase()}`
      : idMatch?.[1]
        ? `id:${String(idMatch[1])}`
        : `title:${headerLine.replace(/^##\s*/, '').toLowerCase()}`

    const idx = block.indexOf('### (Updated product / accessories)')
    if (idx >= 0) {
      map.set(key, block.slice(idx).trimEnd() + '\n')
    }
  }
  return map
}

async function main() {
  const args = process.argv.slice(2)
  const outIdx = args.indexOf('--out')
  const outPath = outIdx >= 0 ? args[outIdx + 1] : 'info/GET-from-shopify.md'
  const merge = args.includes('--merge')

  const locationId = await getPrimaryLocationId()
  const products = await listAllActiveProducts()

  // Collect inventory item IDs
  const inventoryItemIds = []
  for (const p of products) {
    for (const v of p?.variants ?? []) {
      const iid = v?.inventory_item_id
      if (iid !== undefined && iid !== null) inventoryItemIds.push(String(iid))
    }
  }
  const uniqueInventoryItemIds = uniq(inventoryItemIds)
  const inventoryByItemId = await fetchInventoryLevels({ locationId, inventoryItemIds: uniqueInventoryItemIds })

  // annotate variants with inventory
  for (const p of products) {
    for (const v of p?.variants ?? []) {
      const iid = v?.inventory_item_id
      v._mp_inventory_available = iid !== undefined && iid !== null ? inventoryByItemId.get(String(iid)) ?? null : null
    }
  }

  const lines = []
  const abs = path.isAbsolute(outPath) ? outPath : path.join(process.cwd(), outPath)
  let updatedByProductKey = new Map()
  if (merge) {
    try {
      const existing = await fs.readFile(abs, 'utf8')
      updatedByProductKey = extractUpdatedSectionsByProduct(existing)
    } catch {
      // no existing file; fall back to overwrite behavior
      updatedByProductKey = new Map()
    }
  }

  lines.push('# Shopify export (active products)')
  lines.push('')
  lines.push(`- Generated at: ${new Date().toISOString()}`)
  lines.push(`- Location ID used for inventory: ${locationId}`)
  lines.push('')
  lines.push('> Note: Prices shown are whatever is currently set in Shopify for each variant. Inventory is `available` at the chosen location.')
  lines.push('> IDs: `(ID …)` in the header is the **Shopify product ID**; each variant line includes `(variantId …)`.')
  lines.push('')

  // Stable sort for readability
  const sorted = [...products].sort((a, b) => String(a?.title ?? '').localeCompare(String(b?.title ?? '')))
  for (const p of sorted) {
    const header = buildProductHeader(p)
    const currentSection = buildCurrentSection(p)
    const key = keyForProduct(p)
    const updatedSection = updatedByProductKey.get(key) ?? buildUpdatedPlaceholderSection(p)

    lines.push([header, '', currentSection, updatedSection.trimEnd(), '',].join('\n'))
  }

  const final = lines.join('\n')
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, final, 'utf8')
  process.stdout.write(`Wrote ${sorted.length} products to ${abs}\n`)
}

main().catch((err) => {
  console.error(err?.stack || String(err))
  process.exitCode = 1
})








