import { NextRequest, NextResponse } from 'next/server'
import { shopifyListActiveProductsWithVariants } from '@/lib/shopify/products'

export const runtime = 'nodejs'

type PillowSize = 'XS' | 'S' | 'M' | 'L' | 'XL'
type BolsterSize = 'S' | 'M' | 'L'
type BolsterVariant = 'short' | 'medium' | 'long'

type SuggestedMapping =
  | {
      kind: 'pillow'
      shopifyVariantId: number
      productTitle: string
      variantTitle: string | null
      sku: string | null
      size: PillowSize
      pillowKind: 'basic' | 'premium'
      options: { option1: string | null; option2: string | null; option3: string | null }
    }
  | {
      kind: 'bolster'
      shopifyVariantId: number
      productTitle: string
      variantTitle: string | null
      sku: string | null
      size: BolsterSize
      bolsterVariant: BolsterVariant
      options: { option1: string | null; option2: string | null; option3: string | null }
    }

type UnmatchedVariant = {
  shopifyVariantId: number
  productTitle: string
  variantTitle: string | null
  sku: string | null
  options: { option1: string | null; option2: string | null; option3: string | null }
  reason: string
}

const PILLOW_SIZES: PillowSize[] = ['XS', 'S', 'M', 'L', 'XL']
const BOLSTER_SIZES: BolsterSize[] = ['S', 'M', 'L']

function normalizeOption(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s : null
}

function detectPillowSize(opts: Array<string | null>): PillowSize | null {
  const normalized = opts.map(o => (o ? o.trim().toUpperCase() : null))
  for (const sz of PILLOW_SIZES) {
    if (normalized.includes(sz)) return sz
  }
  return null
}

function detectBolsterSize(opts: Array<string | null>): BolsterSize | null {
  const normalized = opts.map(o => (o ? o.trim().toUpperCase() : null))
  // Direct match (ideal: option is exactly "S" | "M" | "L")
  for (const sz of BOLSTER_SIZES) {
    if (normalized.includes(sz)) return sz
  }
  // Fuzzy match: option might be "Size S (0.8m)" / "Size M (1.0m)" / "Size L (1.2m)"
  for (const o of normalized) {
    if (!o) continue
    const m = o.match(/\bSIZE\s*([SML])\b/)
    if (m?.[1] && m[1] !== undefined) {
      const candidate = m[1] as string
      if (candidate === 'S' || candidate === 'M' || candidate === 'L') return candidate as BolsterSize
    }
    // fallback: look for standalone S/M/L token
    const t = o.match(/\b([SML])\b/)
    if (t?.[1] && t[1] !== undefined) {
      const candidate = t[1] as string
      if (candidate === 'S' || candidate === 'M' || candidate === 'L') return candidate as BolsterSize
    }
  }
  return null
}

function bolsterSizeToVariant(size: BolsterSize): BolsterVariant {
  if (size === 'S') return 'short'
  if (size === 'M') return 'medium'
  return 'long'
}

function isBasicOrPremiumPillowProduct(title: string): boolean {
  const t = title.toLowerCase()
  return t.includes('basic mpillow') || t.includes('premium mpillow')
}

function detectPillowKind(title: string): 'basic' | 'premium' {
  const t = title.toLowerCase()
  return t.includes('premium mpillow') ? 'premium' : 'basic'
}

function isBolsterProduct(title: string): boolean {
  const t = title.toLowerCase()
  return t.includes('mbolster')
}

export async function GET(_req: NextRequest) {
  try {
    void _req
    const products = await shopifyListActiveProductsWithVariants({ limit: 250 })

    const suggestions: SuggestedMapping[] = []
    const unmatched: UnmatchedVariant[] = []

    for (const p of products) {
      const productTitle = p.title
      const isPillow = isBasicOrPremiumPillowProduct(productTitle)
      const isBolster = isBolsterProduct(productTitle)
      if (!isPillow && !isBolster) continue

      for (const v of p.variants ?? []) {
        const option1 = normalizeOption(v.option1)
        const option2 = normalizeOption(v.option2)
        const option3 = normalizeOption(v.option3)
        const opts = [option1, option2, option3]

        if (isPillow) {
          const size = detectPillowSize(opts)
          if (!size) {
            unmatched.push({
              shopifyVariantId: v.id,
              productTitle,
              variantTitle: v.title ?? null,
              sku: v.sku ?? null,
              options: { option1, option2, option3 },
              reason: 'No pillow size (XS/S/M/L/XL) found in options',
            })
            continue
          }
          suggestions.push({
            kind: 'pillow',
            shopifyVariantId: v.id,
            productTitle,
            variantTitle: v.title ?? null,
            sku: v.sku ?? null,
            size,
            pillowKind: detectPillowKind(productTitle),
            options: { option1, option2, option3 },
          })
          continue
        }

        if (isBolster) {
          const size = detectBolsterSize(opts)
          if (!size) {
            unmatched.push({
              shopifyVariantId: v.id,
              productTitle,
              variantTitle: v.title ?? null,
              sku: v.sku ?? null,
              options: { option1, option2, option3 },
              reason: 'No bolster size (S/M/L) found in options',
            })
            continue
          }
          suggestions.push({
            kind: 'bolster',
            shopifyVariantId: v.id,
            productTitle,
            variantTitle: v.title ?? null,
            sku: v.sku ?? null,
            size,
            bolsterVariant: bolsterSizeToVariant(size),
            options: { option1, option2, option3 },
          })
        }
      }
    }

    // Provide SQL you can paste into Supabase to apply mappings.
    const pillowValues = suggestions
      .filter((s): s is Extract<SuggestedMapping, { kind: 'pillow' }> => s.kind === 'pillow')
      .map(s => `(${s.shopifyVariantId}, 'pillow', '${s.size}', '${s.pillowKind}')`)
      .join(',\n  ')
    const bolsterValues = suggestions
      .filter((s): s is Extract<SuggestedMapping, { kind: 'bolster' }> => s.kind === 'bolster')
      .map(s => `(${s.shopifyVariantId}, 'bolster', '${s.bolsterVariant}')`)
      .join(',\n  ')

    const sqlParts: string[] = []
    if (pillowValues) {
      sqlParts.push(
        [
          'insert into shopify_variant_mappings (shopify_variant_id, kind, pillow_size, pillow_kind)',
          'values',
          `  ${pillowValues}`,
          'on conflict (shopify_variant_id) do update set kind=excluded.kind, pillow_size=excluded.pillow_size, pillow_kind=excluded.pillow_kind;',
          '',
        ].join('\n'),
      )
    }
    if (bolsterValues) {
      sqlParts.push(
        [
          'insert into shopify_variant_mappings (shopify_variant_id, kind, bolster_variant)',
          'values',
          `  ${bolsterValues}`,
          'on conflict (shopify_variant_id) do update set kind=excluded.kind, bolster_variant=excluded.bolster_variant;',
          '',
        ].join('\n'),
      )
    }

    return NextResponse.json({
      ok: true,
      matched: suggestions.length,
      unmatched: unmatched.length,
      suggestions,
      unmatchedVariants: unmatched,
      mappingSql: sqlParts.join('\n'),
      matchRules: {
        pillowProducts: ['Basic Mpillow', 'Premium Mpillow'],
        bolsterProducts: ['Mbolster'],
        pillowSizes: PILLOW_SIZES,
        bolsterSizes: BOLSTER_SIZES,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to suggest mappings'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}


