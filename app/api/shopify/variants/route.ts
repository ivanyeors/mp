import { NextRequest, NextResponse } from 'next/server'
import { shopifyListActiveProductsWithVariants } from '@/lib/shopify/products'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest) {
  try {
    const products = await shopifyListActiveProductsWithVariants({ limit: 250 })
    const flattened = products.flatMap((p) =>
      (p.variants ?? []).map((v) => ({
        productId: p.id,
        productTitle: p.title,
        productHandle: p.handle ?? null,
        productStatus: p.status ?? null,
        variantId: v.id,
        variantTitle: v.title ?? null,
        sku: v.sku ?? null,
        option1: v.option1 ?? null,
        option2: v.option2 ?? null,
        option3: v.option3 ?? null,
      })),
    )
    return NextResponse.json({ ok: true, count: flattened.length, variants: flattened })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to list variants'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}


