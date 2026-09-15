import { NextRequest, NextResponse } from 'next/server'
import { requireSyncTokenOrAdmin } from '@/lib/shopify/route-auth'
import { shopifyUpsertCanonicalProduct } from '@/lib/shopify/products'

export const runtime = 'nodejs'

function bolsterSizeToInternalVariant(size: 'S' | 'M' | 'L'): 'short' | 'medium' | 'long' {
  if (size === 'S') return 'short'
  if (size === 'M') return 'medium'
  return 'long'
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireSyncTokenOrAdmin(req)
    if (denied) return denied

    // Canonical products:
    // - Pillows: XS,S,M,L,XL
    // - Bolsters: S,M,L (length variants)
    const pillow = await shopifyUpsertCanonicalProduct({
      handle: 'mp-pillow',
      title: 'Mpillow (Size)',
      optionName: 'Size',
      optionValues: ['XS', 'S', 'M', 'L', 'XL'],
      skuPrefix: 'MP-PILLOW-',
    })

    const bolster = await shopifyUpsertCanonicalProduct({
      handle: 'mp-bolster',
      title: 'Mpillow Bolster (Length)',
      optionName: 'Size',
      optionValues: ['S', 'M', 'L'],
      skuPrefix: 'MP-BOLSTER-',
    })

    const pillowVariants = (pillow.variants ?? []).map(v => ({ id: v.id, option1: v.option1 ?? null, sku: v.sku ?? null }))
    const bolsterVariants = (bolster.variants ?? []).map(v => ({ id: v.id, option1: v.option1 ?? null, sku: v.sku ?? null }))

    // Provide ready-to-run SQL for mappings
    const pillowSqlValues = ['XS', 'S', 'M', 'L', 'XL']
      .map((sz) => {
        const vid = (pillow.variants ?? []).find(v => String(v.option1 ?? '').trim() === sz)?.id
        return vid ? `(${vid}, 'pillow', '${sz}')` : null
      })
      .filter(Boolean)
      .join(',\n  ')

    const bolsterSqlValues = (['S', 'M', 'L'] as const)
      .map((sz) => {
        const vid = (bolster.variants ?? []).find(v => String(v.option1 ?? '').trim() === sz)?.id
        const internal = bolsterSizeToInternalVariant(sz)
        return vid ? `(${vid}, 'bolster', '${internal}')` : null
      })
      .filter(Boolean)
      .join(',\n  ')

    const mappingSql = [
      'insert into shopify_variant_mappings (shopify_variant_id, kind, pillow_size)',
      'values',
      `  ${pillowSqlValues}`,
      'on conflict (shopify_variant_id) do update set kind=excluded.kind, pillow_size=excluded.pillow_size;',
      '',
      'insert into shopify_variant_mappings (shopify_variant_id, kind, bolster_variant)',
      'values',
      `  ${bolsterSqlValues}`,
      'on conflict (shopify_variant_id) do update set kind=excluded.kind, bolster_variant=excluded.bolster_variant;',
      '',
    ].join('\n')

    return NextResponse.json({
      ok: true,
      products: {
        pillow: { id: pillow.id, handle: pillow.handle ?? null, title: pillow.title, variants: pillowVariants },
        bolster: { id: bolster.id, handle: bolster.handle ?? null, title: bolster.title, variants: bolsterVariants },
      },
      mappingSql,
      notes: [
        'This endpoint ensures the canonical products/variants exist and returns variant IDs.',
        'It does not delete extra variants; delete extras manually in Shopify if needed.',
      ],
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Catalog sync failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}


