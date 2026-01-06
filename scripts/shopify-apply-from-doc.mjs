import fs from 'node:fs/promises'

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
    return json
  }
  throw new Error('Shopify API 429 Too Many Requests: Exceeded retry attempts')
}

async function getPrimaryLocationId() {
  const env = getEnv()
  if (env.locationId) return env.locationId
  const json = await shopifyFetchJson('/locations.json', { method: 'GET' })
  const locations = (json?.locations ?? []).map((l) => ({ id: l.id, active: l.active }))
  const active = locations.find((l) => l.active !== false) ?? locations[0]
  if (!active?.id) throw new Error('No Shopify locations found')
  return String(active.id)
}

async function shopifyGetVariantInventoryItemId(variantId) {
  const json = await shopifyFetchJson(`/variants/${variantId}.json`, { method: 'GET' })
  const iid = json?.variant?.inventory_item_id
  if (!iid) throw new Error(`Missing inventory_item_id for variant ${variantId}`)
  return String(iid)
}

async function shopifyUpdateVariant(variantId, patch) {
  // PATCHable: price, compare_at_price, sku (and more, but we keep it minimal).
  const payload = { variant: { id: Number(variantId), ...patch } }
  return await shopifyFetchJson(`/variants/${variantId}.json`, { method: 'PUT', body: JSON.stringify(payload) })
}

async function shopifySetInventoryLevel({ locationId, inventoryItemId, available }) {
  await shopifyFetchJson('/inventory_levels/set.json', {
    method: 'POST',
    body: JSON.stringify({
      location_id: Number(locationId),
      inventory_item_id: Number(inventoryItemId),
      available: Math.max(0, Math.floor(Number(available))),
    }),
  })
}

function normalizeLabel(label) {
  return String(label || '')
    .replace(/\(variantId\s+\d+\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function extractVariantIdFromLabel(label) {
  const m = String(label || '').match(/\(variantId\s+(\d+)\)/i)
  return m?.[1] ? String(m[1]) : null
}

function parseMoneyOrNull(raw) {
  const s = String(raw || '').trim()
  if (!s || s === '—') return null
  const num = Number.parseFloat(s)
  if (!Number.isFinite(num) || num < 0) return null
  return num.toFixed(2)
}

function parseIntOrNull(raw) {
  const s = String(raw || '').trim()
  if (!s || s === '—') return null
  const n = Number.parseInt(s, 10)
  if (!Number.isFinite(n)) return null
  return n
}

function splitBlocks(markdown) {
  return String(markdown || '').split(/\n(?=##\s)/g)
}

function extractDocLocationId(markdown) {
  const m = String(markdown || '').match(/^\-\s*Location ID used for inventory:\s*(\d+)\s*$/m)
  return m?.[1] ? String(m[1]) : null
}

function extractHeaderInfo(block) {
  const headerLine = (block.split('\n')[0] ?? '').trim()
  const handleMatch = headerLine.match(/—\s*`([^`]+)`\s*$/)
  const idMatch = headerLine.match(/\(ID\s+(\d+)\)/)
  return {
    headerLine,
    handle: handleMatch?.[1] ? String(handleMatch[1]) : null,
    productId: idMatch?.[1] ? String(idMatch[1]) : null,
  }
}

function extractSectionLines(block, sectionTitle) {
  const lines = block.split('\n')
  const startIdx = lines.findIndex((l) => l.trim() === sectionTitle)
  if (startIdx < 0) return []
  const out = []
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const l = lines[i]
    if (l.startsWith('## ')) break
    if (l.trim().startsWith('### ')) break
    out.push(l)
  }
  return out
}

function parseCurrentVariantMap(currentLines) {
  // We parse variantId from anywhere in the "Current" section, and optionally capture current values.
  const byLabel = new Map() // normalized label -> { variantId, label, price, compareAt, sku, inventory }
  const seenVariantId = new Set()

  const ensure = (label, variantId) => {
    const key = normalizeLabel(label)
    if (!key || !variantId) return null
    if (seenVariantId.has(String(variantId)) && !byLabel.has(key)) {
      // allow same variantId reused if label differs, but we prefer stable label keys
    }
    const prev =
      byLabel.get(key) ??
      { variantId: String(variantId), label: String(label || ''), price: null, compareAt: null, sku: null, inventory: null }
    prev.variantId = String(variantId)
    if (!prev.label) prev.label = String(label || '')
    byLabel.set(key, prev)
    seenVariantId.add(String(variantId))
    return prev
  }

  // per-variant prices: " - <label> (variantId 123): 170.00 (compare_at: 90.00)"
  // SKUs:              " - <label> (variantId 123): ABC"
  // inventory:         " - <label> (variantId 123): 46"
  for (const line of currentLines) {
    const m = line.match(/^\s*-\s*(.+?)\s*\(variantId\s+(\d+)\)\s*:\s*(.+?)\s*$/i)
    if (!m) continue
    const label = m[1]?.trim()
    const variantId = m[2]?.trim()
    const rhs = m[3]?.trim()
    const row = ensure(label, variantId)
    if (!row) continue

    // Try parse money + compare_at
    const moneyMatch = rhs.match(/^(\d+(?:\.\d+)?)\s*(?:\(compare_at:\s*(\d+(?:\.\d+)?)\s*\))?\s*$/i)
    if (moneyMatch) {
      row.price = parseMoneyOrNull(moneyMatch[1])
      row.compareAt = moneyMatch[2] ? parseMoneyOrNull(moneyMatch[2]) : null
      continue
    }

    // Try parse inventory int (allow negatives in current)
    const invMatch = rhs.match(/^-?\d+$/)
    if (invMatch) {
      row.inventory = Number.parseInt(rhs, 10)
      continue
    }

    // Otherwise treat as SKU string (may be —)
    row.sku = rhs === '—' ? null : rhs
  }

  return byLabel
}

function parseUpdatedDesired(updatedLines) {
  const desiredByLabel = new Map() // normalized label -> { label, variantId, price, compareAt, sku, inventory }
  let mode = null // 'prices' | 'skus' | 'inventory'

  for (const rawLine of updatedLines) {
    const line = rawLine.trimEnd()
    const t = line.trim()
    if (t === '- SKUs:') {
      mode = 'skus'
      continue
    }
    if (t === '- inventory:') {
      mode = 'inventory'
      continue
    }
    if (t === '- variants:') {
      mode = 'variants'
      continue
    }
    if (t === '- list price (MSRP):' || t.startsWith('- list price (MSRP):')) {
      // ignore summary line; we use per-variant pricing rows instead
      continue
    }
    if (t === '- product listing name:' || t.startsWith('- product listing name:')) continue

    // per-variant prices are nested bullets:
    // "    - XS / ...: 170.00 (compare_at: 90.00)"
    if (/^\s*-\s*per-variant prices:/i.test(t)) {
      mode = 'prices'
      continue
    }

    const m = line.match(/^\s*-\s*(.+?)\s*:\s*(.+?)\s*$/)
    if (!m) continue
    const label = m[1]?.trim()
    const rhs = m[2]?.trim()
    const key = normalizeLabel(label)
    if (!key) continue

    const prev =
      desiredByLabel.get(key) ??
      {
        label: String(label || ''),
        variantId: extractVariantIdFromLabel(label),
        price: undefined,
        compareAt: undefined,
        sku: undefined,
        inventory: undefined,
      }
    if (!prev.variantId) prev.variantId = extractVariantIdFromLabel(label)

    if (mode === 'prices') {
      const moneyMatch = rhs.match(/^(\d+(?:\.\d+)?)\s*(?:\(compare_at:\s*(\d+(?:\.\d+)?)\s*\))?\s*$/i)
      if (moneyMatch) {
        prev.price = parseMoneyOrNull(moneyMatch[1])
        prev.compareAt = moneyMatch[2] ? parseMoneyOrNull(moneyMatch[2]) : null
        desiredByLabel.set(key, prev)
      }
      continue
    }

    if (mode === 'skus') {
      // Support user writing "— SKU" to show current blank + desired sku.
      const cleaned = rhs.replace(/^—\s*/, '').trim()
      prev.sku = cleaned ? cleaned : null
      desiredByLabel.set(key, prev)
      continue
    }

    if (mode === 'inventory') {
      const inv = parseIntOrNull(rhs)
      prev.inventory = inv
      desiredByLabel.set(key, prev)
      continue
    }
  }

  return desiredByLabel
}

function scoreCandidate(missingKey, candidateKey) {
  // Simple token overlap score, biased toward substring matches.
  const a = String(missingKey || '')
  const b = String(candidateKey || '')
  if (!a || !b) return 0
  if (b.includes(a)) return 10 + a.length / 10
  const aTokens = new Set(a.split(/[^a-z0-9]+/g).filter(Boolean))
  const bTokens = new Set(b.split(/[^a-z0-9]+/g).filter(Boolean))
  let inter = 0
  for (const t of aTokens) if (bTokens.has(t)) inter += 1
  return inter
}

function suggestForMissing(missingKey, currentMap) {
  const candidates = []
  for (const [k, v] of currentMap.entries()) {
    const score = scoreCandidate(missingKey, k)
    if (score <= 0) continue
    candidates.push({ key: k, score, label: v.label, variantId: v.variantId })
  }
  candidates.sort((x, y) => y.score - x.score)
  return candidates.slice(0, 5)
}

function buildPlan({ markdown, onlyHandles }) {
  const blocks = splitBlocks(markdown)
  const docLocationId = extractDocLocationId(markdown)
  const products = []

  for (const block of blocks) {
    const headerLine = (block.split('\n')[0] ?? '').trim()
    if (!headerLine.startsWith('## ')) continue
    const info = extractHeaderInfo(block)
    if (onlyHandles?.length && info.handle && !onlyHandles.includes(info.handle)) continue

    const currentLines = extractSectionLines(block, '### (Currrent product / accessories)')
    const updatedLines = extractSectionLines(block, '### (Updated product / accessories)')
    const currentMap = parseCurrentVariantMap(currentLines)
    const desiredMap = parseUpdatedDesired(updatedLines)

    const actions = []
    const missing = []

    for (const [labelKey, desired] of desiredMap.entries()) {
      // If the Updated line includes an explicit variantId, use it directly (no label matching required).
      if (desired.variantId) {
        actions.push({
          labelKey,
          variantId: String(desired.variantId),
          current: currentMap.get(labelKey) ?? null,
          desired,
        })
        continue
      }
      const cur = currentMap.get(labelKey)
      if (!cur?.variantId) {
        missing.push({ labelKey, suggestions: suggestForMissing(labelKey, currentMap) })
        continue
      }
      actions.push({
        labelKey,
        variantId: cur.variantId,
        current: cur,
        desired,
      })
    }

    products.push({
      headerLine: info.headerLine,
      handle: info.handle,
      productId: info.productId,
      docLocationId,
      actions,
      missing,
    })
  }

  return { docLocationId, products }
}

function formatPlanSummary(plan) {
  let totalVariants = 0
  let totalMissing = 0
  for (const p of plan.products) {
    totalVariants += p.actions.length
    totalMissing += p.missing.length
  }
  return { totalProducts: plan.products.length, totalVariants, totalMissing }
}

async function applyPlan({ plan, apply, doPrices, doSkus, doInventory, locationId }) {
  const inventoryItemIdCache = new Map() // variantId -> inventoryItemId
  let updatedVariants = 0
  let updatedInventory = 0
  let skipped = 0
  let processed = 0
  const startedAt = Date.now()

  for (const product of plan.products) {
    for (const a of product.actions) {
      const variantId = a.variantId

      const variantPatch = {}
      if (doPrices && a.desired.price !== undefined) {
        // Shopify expects strings like "170.00"
        if (a.desired.price !== null) variantPatch.price = a.desired.price
        if (a.desired.compareAt !== undefined) {
          // allow null to clear compare_at_price
          variantPatch.compare_at_price = a.desired.compareAt
        }
      }
      if (doSkus && a.desired.sku !== undefined) {
        variantPatch.sku = a.desired.sku
      }

      const needsVariantUpdate = Object.keys(variantPatch).length > 0
      const needsInventoryUpdate = doInventory && a.desired.inventory !== undefined && a.desired.inventory !== null

      if (!needsVariantUpdate && !needsInventoryUpdate) {
        skipped += 1
        continue
      }

      if (!apply) {
        // dry-run: just print what we'd do
        const parts = []
        if (needsVariantUpdate) parts.push(`variant ${variantId} update ${JSON.stringify(variantPatch)}`)
        if (needsInventoryUpdate) parts.push(`inventory ${variantId} -> ${a.desired.inventory}`)
        console.log(`[dry-run] ${product.handle ?? product.productId ?? product.headerLine}: ${parts.join(' | ')}`)
        continue
      }

      const prefix = product.handle ?? product.productId ?? product.headerLine

      if (needsVariantUpdate) {
        await shopifyUpdateVariant(variantId, variantPatch)
        updatedVariants += 1
        console.log(`[apply] ${prefix}: updated variant ${variantId} (${Object.keys(variantPatch).join(', ')})`)
        // pacing: variant update is a write
        await sleep(650)
      }

      if (needsInventoryUpdate) {
        let inventoryItemId = inventoryItemIdCache.get(String(variantId))
        if (!inventoryItemId) {
          inventoryItemId = await shopifyGetVariantInventoryItemId(String(variantId))
          inventoryItemIdCache.set(String(variantId), inventoryItemId)
          await sleep(250)
        }
        await shopifySetInventoryLevel({ locationId, inventoryItemId, available: a.desired.inventory })
        updatedInventory += 1
        console.log(`[apply] ${prefix}: set inventory for variant ${variantId} -> ${a.desired.inventory}`)
        await sleep(650)
      }

      processed += 1
      if (processed % 25 === 0) {
        const elapsedSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
        console.log(`[apply] progress: ${processed} updates processed in ~${elapsedSec}s`)
      }
    }
  }

  return { updatedVariants, updatedInventory, skipped }
}

async function main() {
  const args = process.argv.slice(2)
  const inIdx = args.indexOf('--in')
  const inPath = inIdx >= 0 ? args[inIdx + 1] : 'info/GET-from-shopify.md'
  const apply = args.includes('--apply')
  const doPrices = args.includes('--prices') || (!args.includes('--prices') && !args.includes('--skus') && !args.includes('--inventory'))
  const doSkus = args.includes('--skus') || (!args.includes('--prices') && !args.includes('--skus') && !args.includes('--inventory'))
  const doInventory = args.includes('--inventory') || (!args.includes('--prices') && !args.includes('--skus') && !args.includes('--inventory'))

  const onlyIdx = args.indexOf('--only-handles')
  const onlyHandles = onlyIdx >= 0 ? String(args[onlyIdx + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : null

  const markdown = await fs.readFile(inPath, 'utf8')
  const plan = buildPlan({ markdown, onlyHandles })
  const summary = formatPlanSummary(plan)

  const locationId = plan.docLocationId || (await getPrimaryLocationId())

  console.log(`Doc: ${inPath}`)
  console.log(`Location ID: ${locationId} ${plan.docLocationId ? '(from doc)' : '(auto)'}`)
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`)
  console.log(`Will sync: ${doPrices ? 'prices ' : ''}${doSkus ? 'skus ' : ''}${doInventory ? 'inventory' : ''}`.trim())
  console.log(`Products: ${summary.totalProducts}, Variants referenced in Updated: ${summary.totalVariants}, Missing matches: ${summary.totalMissing}`)

  if (summary.totalMissing > 0) {
    console.log('--- Missing variant matches (Updated label not found in Current) ---')
    for (const p of plan.products) {
      if (!p.missing.length) continue
      console.log(p.headerLine)
      for (const m of p.missing) {
        console.log(`  - ${m.labelKey}`)
        const suggestions = Array.isArray(m.suggestions) ? m.suggestions : []
        if (suggestions.length) {
          for (const s of suggestions) {
            console.log(`    -> maybe: ${s.label} (variantId ${s.variantId})`)
          }
        }
      }
    }
    console.log('---')
  }

  const result = await applyPlan({ plan, apply, doPrices, doSkus, doInventory, locationId })
  console.log(`Done. updatedVariants=${result.updatedVariants} updatedInventory=${result.updatedInventory} skipped=${result.skipped}`)
  if (!apply) {
    console.log('Re-run with --apply to actually update Shopify.')
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err))
  process.exitCode = 1
})


