import { resolveVariantCost } from '@/lib/shop/price-sync'
import { supabaseAdmin } from '@/lib/supabase/server'

export type MappingKind = 'pillow' | 'bolster' | 'part'

export type ShopifyVariantMapping = {
  shopify_variant_id: number
  kind: MappingKind
  pillow_size: string | null
  pillow_kind: 'basic' | 'premium' | null
  bolster_variant: string | null
  item_id: number | null
}

export type BomLine = { item_id: number; quantity: number }

export type CostingsContext = {
  mappingsByVariantId: Map<number, ShopifyVariantMapping>
  pillowProductIdByKindSize: Map<string, number>
  bomByPillowProductId: Map<number, BomLine[]>
  bomByBolsterVariant: Map<string, BomLine[]>
  costByItemId: Map<number, number>
}

export type ShopifyOrderLineLike = {
  id: number
  title?: string | null
  sku?: string | null
  quantity: number
  variant_id?: number | null
  price?: string | number | null
}

export type ShopifyOrderLike = {
  id: number
  name?: string | null
  currency?: string | null
  financial_status?: string | null
  created_at?: string | null
  processed_at?: string | null
  total_price?: string | number | null
  total_outstanding?: string | number | null
  line_items?: ShopifyOrderLineLike[]
  transactions?: Array<{
    status?: string | null
    kind?: string | null
    created_at?: string | null
    processed_at?: string | null
  }>
}

export type ShopifyRefundLineLike = {
  line_item_id?: number | null
  quantity?: number | null
  restock_type?: string | null
  subtotal?: string | number | null
}

export type ShopifyRefundLike = {
  id: number
  order_id: number
  created_at?: string | null
  processed_at?: string | null
  currency?: string | null
  transactions?: Array<{
    amount?: string | number | null
    status?: string | null
    kind?: string | null
  }>
  refund_line_items?: ShopifyRefundLineLike[]
}

export type MirrorOrderRow = {
  shopify_order_id: number
  name: string | null
  currency: string
  paid_at: string | null
  financial_status: string | null
  total_price: number
  amount_refunded: number
  synced_at: string
  updated_at: string
}

export type MirrorLineRow = {
  shopify_line_item_id: number
  shopify_order_id: number
  shopify_variant_id: number | null
  sku: string | null
  title: string | null
  quantity: number
  gross_revenue: number
  unit_cost: number | null
  total_cost: number | null
  mapping_kind: MappingKind | null
  is_others: boolean
  updated_at: string
}

export type MirrorRefundRow = {
  shopify_refund_id: number
  shopify_order_id: number
  amount: number
  currency: string
  refunded_at: string | null
}

export type SyncStateRow = {
  id: 1
  phase: 'backfill' | 'reconcile'
  cursor_token: string | null
  since_id: number | null
  last_success_at: string | null
  updated_at: string
}

export type SyncCursorPatch = {
  phase?: 'backfill' | 'reconcile'
  cursor_token?: string | null
  since_id?: number | null
  last_success_at?: string | null
}

type AdminClient = ReturnType<typeof supabaseAdmin>

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function toMoney(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(n) ? round2(n) : 0
}

function nowIso(now = new Date()): string {
  return now.toISOString()
}

const PAID_STATUSES = new Set(['paid', 'partially_refunded', 'refunded'])

export function isShopifyPaidFinancialStatus(status: string | null | undefined): boolean {
  return PAID_STATUSES.has(String(status ?? '').toLowerCase())
}

export function selectShopifyPaidAt(order: ShopifyOrderLike): string | null {
  if (!isShopifyPaidFinancialStatus(order.financial_status)) return null
  if (order.processed_at) return order.processed_at
  const saleTx = (order.transactions ?? []).find((t) => {
    const kind = String(t.kind ?? '').toLowerCase()
    const status = String(t.status ?? '').toLowerCase()
    return (kind === 'sale' || kind === 'capture') && (status === 'success' || status === '')
  })
  if (saleTx?.processed_at) return saleTx.processed_at
  if (saleTx?.created_at) return saleTx.created_at
  return order.created_at ?? null
}

export function resolveShopifyMappingUnitCost(
  mapping: ShopifyVariantMapping,
  ctx: Pick<
    CostingsContext,
    'pillowProductIdByKindSize' | 'bomByPillowProductId' | 'bomByBolsterVariant' | 'costByItemId'
  >,
): number | null {
  if (mapping.kind === 'part') {
    if (mapping.item_id == null) return null
    return resolveVariantCost(
      { item_id: mapping.item_id, pillow_product_id: null, option1: null },
      ctx.bomByPillowProductId,
      ctx.bomByBolsterVariant,
      ctx.costByItemId,
    )
  }
  if (mapping.kind === 'pillow' && mapping.pillow_size) {
    const pk = mapping.pillow_kind ?? 'basic'
    const pillowProductId = ctx.pillowProductIdByKindSize.get(`${pk}:${mapping.pillow_size}`) ?? null
    if (pillowProductId == null) return null
    return resolveVariantCost(
      { item_id: null, pillow_product_id: pillowProductId, option1: null },
      ctx.bomByPillowProductId,
      ctx.bomByBolsterVariant,
      ctx.costByItemId,
    )
  }
  if (mapping.kind === 'bolster' && mapping.bolster_variant) {
    return resolveVariantCost(
      { item_id: null, pillow_product_id: null, option1: mapping.bolster_variant },
      ctx.bomByPillowProductId,
      ctx.bomByBolsterVariant,
      ctx.costByItemId,
    )
  }
  return null
}

export function buildMirrorLineFromShopify(
  orderId: number,
  li: ShopifyOrderLineLike,
  ctx: CostingsContext,
  at = nowIso(),
): MirrorLineRow | null {
  const qty = Math.max(0, Math.floor(Number(li.quantity ?? 0)))
  if (!qty || typeof li.id !== 'number') return null

  const variantId = typeof li.variant_id === 'number' ? li.variant_id : null
  const mapping = variantId != null ? ctx.mappingsByVariantId.get(variantId) ?? null : null
  const unitCost = mapping ? resolveShopifyMappingUnitCost(mapping, ctx) : null
  const isOthers = mapping == null || unitCost == null
  const gross = round2(toMoney(li.price) * qty)

  return {
    shopify_line_item_id: li.id,
    shopify_order_id: orderId,
    shopify_variant_id: variantId,
    sku: li.sku ?? null,
    title: li.title ?? null,
    quantity: qty,
    gross_revenue: gross,
    unit_cost: isOthers ? null : round2(unitCost!),
    total_cost: isOthers ? null : round2(unitCost! * qty),
    mapping_kind: mapping?.kind ?? null,
    is_others: isOthers,
    updated_at: at,
  }
}

export function mergeFrozenMirrorLine(
  existing: MirrorLineRow | null | undefined,
  incoming: MirrorLineRow,
): MirrorLineRow {
  if (existing && !existing.is_others && existing.unit_cost != null) {
    return {
      ...incoming,
      unit_cost: existing.unit_cost,
      total_cost: existing.total_cost,
      mapping_kind: existing.mapping_kind,
      is_others: false,
    }
  }
  return incoming
}

export function planReResolveMirrorLines(
  lines: MirrorLineRow[],
  ctx: CostingsContext,
  opts?: { variantIds?: number[]; at?: string },
): MirrorLineRow[] {
  const at = opts?.at ?? nowIso()
  const filter =
    opts?.variantIds?.length ? new Set(opts.variantIds.filter((id) => Number.isFinite(id) && id > 0)) : null

  const patches: MirrorLineRow[] = []
  for (const line of lines) {
    if (!line.is_others && line.unit_cost != null) continue
    if (filter && (line.shopify_variant_id == null || !filter.has(line.shopify_variant_id))) continue

    const mapping =
      line.shopify_variant_id != null
        ? (ctx.mappingsByVariantId.get(line.shopify_variant_id) ?? null)
        : null
    const unitCost = mapping ? resolveShopifyMappingUnitCost(mapping, ctx) : null
    const isOthers = mapping == null || unitCost == null
    const nextUnit = isOthers ? null : round2(unitCost!)
    const nextTotal = isOthers ? null : round2(unitCost! * line.quantity)
    const nextKind = mapping?.kind ?? null

    if (
      line.is_others === isOthers &&
      line.unit_cost === nextUnit &&
      line.total_cost === nextTotal &&
      line.mapping_kind === nextKind
    ) {
      continue
    }

    patches.push({
      ...line,
      unit_cost: nextUnit,
      total_cost: nextTotal,
      mapping_kind: nextKind,
      is_others: isOthers,
      updated_at: at,
    })
  }
  return patches
}

export function planShopifyOrderMirrorUpsert(
  order: ShopifyOrderLike,
  ctx: CostingsContext,
  existing?: { paid_at?: string | null; lines?: Map<number, MirrorLineRow> },
  at = nowIso(),
):
  | { ok: true; order: MirrorOrderRow; lines: MirrorLineRow[] }
  | { ok: false; reason: 'not_paid' | 'invalid' } {
  if (!order || typeof order.id !== 'number') return { ok: false, reason: 'invalid' }
  if (!isShopifyPaidFinancialStatus(order.financial_status)) return { ok: false, reason: 'not_paid' }

  const paidAt = existing?.paid_at ?? selectShopifyPaidAt(order)
  const lines: MirrorLineRow[] = []
  for (const li of order.line_items ?? []) {
    const built = buildMirrorLineFromShopify(order.id, li, ctx, at)
    if (!built) continue
    const prev = existing?.lines?.get(built.shopify_line_item_id)
    lines.push(mergeFrozenMirrorLine(prev, built))
  }

  return {
    ok: true,
    order: {
      shopify_order_id: order.id,
      name: order.name ?? null,
      currency: String(order.currency ?? 'SGD'),
      paid_at: paidAt,
      financial_status: order.financial_status ?? null,
      total_price: toMoney(order.total_price),
      amount_refunded: 0,
      synced_at: at,
      updated_at: at,
    },
    lines,
  }
}

export function refundAmountFromPayload(refund: ShopifyRefundLike): number {
  const txs = refund.transactions ?? []
  if (txs.length) {
    let sum = 0
    for (const t of txs) {
      const kind = String(t.kind ?? '').toLowerCase()
      const status = String(t.status ?? '').toLowerCase()
      if (kind && kind !== 'refund') continue
      if (status && status !== 'success') continue
      sum += toMoney(t.amount)
    }
    if (sum > 0) return round2(sum)
  }
  let lineSum = 0
  for (const li of refund.refund_line_items ?? []) {
    lineSum += toMoney(li.subtotal)
  }
  return round2(lineSum)
}

export function isRestockSignal(restockType: string | null | undefined): boolean {
  const t = String(restockType ?? '').toLowerCase()
  return t === 'return' || t === 'cancel'
}

export type RefundApplyPlan = {
  refund: MirrorRefundRow
  alreadyApplied: boolean
  amountRefunded: number
  lineCostPatches: Array<{ shopify_line_item_id: number; total_cost: number }>
}

// ponytail: order-level refund amount + optional line total_cost trim on restock; line-level refund
// allocation table deferred if Analytics needs finer splits.
export function planShopifyRefundApply(args: {
  refund: ShopifyRefundLike
  existingRefundIds: Set<number>
  priorAmountRefunded: number
  lines: Map<number, Pick<MirrorLineRow, 'shopify_line_item_id' | 'unit_cost' | 'total_cost' | 'quantity'>>
}): RefundApplyPlan {
  const amount = refundAmountFromPayload(args.refund)
  const refundRow: MirrorRefundRow = {
    shopify_refund_id: args.refund.id,
    shopify_order_id: args.refund.order_id,
    amount,
    currency: String(args.refund.currency ?? 'SGD'),
    refunded_at: args.refund.processed_at ?? args.refund.created_at ?? null,
  }

  if (args.existingRefundIds.has(args.refund.id)) {
    return {
      refund: refundRow,
      alreadyApplied: true,
      amountRefunded: args.priorAmountRefunded,
      lineCostPatches: [],
    }
  }

  const lineCostPatches: RefundApplyPlan['lineCostPatches'] = []
  for (const rli of args.refund.refund_line_items ?? []) {
    if (!isRestockSignal(rli.restock_type)) continue
    const lineId = rli.line_item_id
    if (typeof lineId !== 'number') continue
    const line = args.lines.get(lineId)
    if (!line || line.unit_cost == null || line.total_cost == null) continue
    const restockQty = Math.max(0, Math.floor(Number(rli.quantity ?? 0)))
    if (!restockQty) continue
    const next = round2(Math.max(0, line.total_cost - line.unit_cost * restockQty))
    lineCostPatches.push({ shopify_line_item_id: lineId, total_cost: next })
    args.lines.set(lineId, { ...line, total_cost: next })
  }

  return {
    refund: refundRow,
    alreadyApplied: false,
    amountRefunded: round2(args.priorAmountRefunded + amount),
    lineCostPatches,
  }
}

export function planShopifySyncCursorAdvance(
  current: SyncStateRow,
  patch: SyncCursorPatch,
  at = nowIso(),
): SyncStateRow {
  const nextSince =
    patch.since_id != null
      ? Math.max(current.since_id ?? 0, patch.since_id)
      : current.since_id
  return {
    id: 1,
    phase: patch.phase ?? current.phase,
    cursor_token: patch.cursor_token !== undefined ? patch.cursor_token : current.cursor_token,
    since_id: nextSince,
    last_success_at:
      patch.last_success_at !== undefined ? patch.last_success_at : (current.last_success_at ?? at),
    updated_at: at,
  }
}

export async function loadShopifyMirrorCostingsContext(
  admin: AdminClient,
  variantIds: number[],
): Promise<CostingsContext> {
  const unique = Array.from(new Set(variantIds.filter((id) => Number.isFinite(id) && id > 0)))
  const [
    { data: mappings, error: mErr },
    { data: pillowProducts, error: pErr },
    { data: bomLines, error: bErr },
    { data: bolsterLines, error: blErr },
    { data: itemPrices, error: iErr },
  ] = await Promise.all([
    unique.length
      ? admin
          .from('shopify_variant_mappings')
          .select('shopify_variant_id,kind,pillow_size,pillow_kind,bolster_variant,item_id')
          .in('shopify_variant_id', unique)
      : Promise.resolve({ data: [] as ShopifyVariantMapping[], error: null }),
    admin.from('pillow_products').select('id,kind,size').eq('is_active', true),
    admin.from('bom_lines').select('product_id,item_id,quantity'),
    admin.from('bolster_bom_lines').select('variant,item_id,quantity'),
    admin.from('item_prices').select('item_id,cost_price'),
  ])
  if (mErr) throw new Error(mErr.message)
  if (pErr) throw new Error(pErr.message)
  if (bErr) throw new Error(bErr.message)
  if (blErr) throw new Error(blErr.message)
  if (iErr) throw new Error(iErr.message)

  const mappingsByVariantId = new Map<number, ShopifyVariantMapping>()
  for (const m of mappings ?? []) {
    mappingsByVariantId.set(Number(m.shopify_variant_id), {
      shopify_variant_id: Number(m.shopify_variant_id),
      kind: m.kind as MappingKind,
      pillow_size: m.pillow_size ?? null,
      pillow_kind: (m.pillow_kind as 'basic' | 'premium' | null) ?? null,
      bolster_variant: m.bolster_variant ?? null,
      item_id: m.item_id != null ? Number(m.item_id) : null,
    })
  }

  const pillowProductIdByKindSize = new Map<string, number>()
  for (const p of pillowProducts ?? []) {
    pillowProductIdByKindSize.set(`${String(p.kind || 'basic')}:${String(p.size)}`, Number(p.id))
  }

  const bomByPillowProductId = new Map<number, BomLine[]>()
  for (const b of bomLines ?? []) {
    const pid = Number(b.product_id)
    const list = bomByPillowProductId.get(pid) ?? []
    list.push({ item_id: Number(b.item_id), quantity: Number(b.quantity) })
    bomByPillowProductId.set(pid, list)
  }

  const bomByBolsterVariant = new Map<string, BomLine[]>()
  for (const b of bolsterLines ?? []) {
    const v = String(b.variant)
    const list = bomByBolsterVariant.get(v) ?? []
    list.push({ item_id: Number(b.item_id), quantity: Number(b.quantity) })
    bomByBolsterVariant.set(v, list)
  }

  const costByItemId = new Map<number, number>()
  for (const ip of itemPrices ?? []) {
    if (ip.cost_price == null) continue
    const c = Number.parseFloat(String(ip.cost_price))
    if (Number.isFinite(c)) costByItemId.set(Number(ip.item_id), c)
  }

  return {
    mappingsByVariantId,
    pillowProductIdByKindSize,
    bomByPillowProductId,
    bomByBolsterVariant,
    costByItemId,
  }
}

export type UpsertShopifyOrderMirrorResult =
  | { ok: true; skipped?: undefined; orderId: number; lineCount: number; paidAt: string | null }
  | { ok: true; skipped: true; reason: 'not_paid' | 'invalid' }

export async function upsertShopifyOrderMirror(
  payload: ShopifyOrderLike,
  opts?: { admin?: AdminClient; costCtx?: CostingsContext; now?: Date },
): Promise<UpsertShopifyOrderMirrorResult> {
  const admin = opts?.admin ?? supabaseAdmin()
  const at = nowIso(opts?.now)

  if (!payload || typeof payload.id !== 'number') {
    return { ok: true, skipped: true, reason: 'invalid' }
  }
  if (!isShopifyPaidFinancialStatus(payload.financial_status)) {
    return { ok: true, skipped: true, reason: 'not_paid' }
  }

  const variantIds = (payload.line_items ?? [])
    .map((li) => li.variant_id)
    .filter((v): v is number => typeof v === 'number')

  const costCtx = opts?.costCtx ?? (await loadShopifyMirrorCostingsContext(admin, variantIds))

  const { data: existingOrder } = await admin
    .from('shopify_orders')
    .select('paid_at,amount_refunded')
    .eq('shopify_order_id', payload.id)
    .maybeSingle()

  const lineIds = (payload.line_items ?? []).map((li) => li.id).filter((id) => typeof id === 'number')
  const existingLines = new Map<number, MirrorLineRow>()
  if (lineIds.length) {
    const { data: rows } = await admin
      .from('shopify_order_lines')
      .select(
        'shopify_line_item_id,shopify_order_id,shopify_variant_id,sku,title,quantity,gross_revenue,unit_cost,total_cost,mapping_kind,is_others,updated_at',
      )
      .in('shopify_line_item_id', lineIds)
    for (const r of rows ?? []) {
      existingLines.set(Number(r.shopify_line_item_id), r as MirrorLineRow)
    }
  }

  const plan = planShopifyOrderMirrorUpsert(
    payload,
    costCtx,
    { paid_at: existingOrder?.paid_at ?? null, lines: existingLines },
    at,
  )
  if (!plan.ok) return { ok: true, skipped: true, reason: plan.reason }

  const orderRow = {
    ...plan.order,
    amount_refunded: toMoney(existingOrder?.amount_refunded ?? 0),
  }

  const { error: oErr } = await admin.from('shopify_orders').upsert(orderRow, {
    onConflict: 'shopify_order_id',
  })
  if (oErr) throw new Error(oErr.message)

  if (plan.lines.length) {
    const { error: lErr } = await admin.from('shopify_order_lines').upsert(plan.lines, {
      onConflict: 'shopify_line_item_id',
    })
    if (lErr) throw new Error(lErr.message)
  }

  return {
    ok: true,
    orderId: payload.id,
    lineCount: plan.lines.length,
    paidAt: orderRow.paid_at,
  }
}

export type ApplyShopifyRefundResult =
  | { ok: true; alreadyApplied: true; orderId: number; amountRefunded: number }
  | { ok: true; alreadyApplied: false; orderId: number; amountRefunded: number }

export async function applyShopifyRefund(
  payload: ShopifyRefundLike,
  opts?: { admin?: AdminClient; now?: Date },
): Promise<ApplyShopifyRefundResult> {
  const admin = opts?.admin ?? supabaseAdmin()
  if (!payload || typeof payload.id !== 'number' || typeof payload.order_id !== 'number') {
    throw new Error('Invalid Shopify refund payload')
  }

  const { data: existingRefund } = await admin
    .from('shopify_order_refunds')
    .select('shopify_refund_id')
    .eq('shopify_refund_id', payload.id)
    .maybeSingle()

  const { data: order } = await admin
    .from('shopify_orders')
    .select('shopify_order_id,amount_refunded')
    .eq('shopify_order_id', payload.order_id)
    .maybeSingle()

  if (!order) {
    // ponytail: refund before order mirror — insert refund + ensure stub order later via catch-up.
    // Ceiling: orphan refund until paid order upsert; upgrade: enqueue order fetch by order_id.
    throw new Error(`shopify_orders missing for refund order_id=${payload.order_id}`)
  }

  const { data: lineRows } = await admin
    .from('shopify_order_lines')
    .select('shopify_line_item_id,unit_cost,total_cost,quantity')
    .eq('shopify_order_id', payload.order_id)

  const lines = new Map<
    number,
    Pick<MirrorLineRow, 'shopify_line_item_id' | 'unit_cost' | 'total_cost' | 'quantity'>
  >()
  for (const r of lineRows ?? []) {
    lines.set(Number(r.shopify_line_item_id), {
      shopify_line_item_id: Number(r.shopify_line_item_id),
      unit_cost: r.unit_cost != null ? Number(r.unit_cost) : null,
      total_cost: r.total_cost != null ? Number(r.total_cost) : null,
      quantity: Number(r.quantity),
    })
  }

  const existingIds = new Set<number>()
  if (existingRefund?.shopify_refund_id) existingIds.add(Number(existingRefund.shopify_refund_id))

  const plan = planShopifyRefundApply({
    refund: payload,
    existingRefundIds: existingIds,
    priorAmountRefunded: toMoney(order.amount_refunded),
    lines,
  })

  if (plan.alreadyApplied) {
    return {
      ok: true,
      alreadyApplied: true,
      orderId: payload.order_id,
      amountRefunded: plan.amountRefunded,
    }
  }

  const { error: rErr } = await admin.from('shopify_order_refunds').upsert(plan.refund, {
    onConflict: 'shopify_refund_id',
  })
  if (rErr) throw new Error(rErr.message)

  const { error: oErr } = await admin
    .from('shopify_orders')
    .update({
      amount_refunded: plan.amountRefunded,
      updated_at: nowIso(opts?.now),
    })
    .eq('shopify_order_id', payload.order_id)
  if (oErr) throw new Error(oErr.message)

  for (const patch of plan.lineCostPatches) {
    const { error } = await admin
      .from('shopify_order_lines')
      .update({ total_cost: patch.total_cost, updated_at: nowIso(opts?.now) })
      .eq('shopify_line_item_id', patch.shopify_line_item_id)
    if (error) throw new Error(error.message)
  }

  return {
    ok: true,
    alreadyApplied: false,
    orderId: payload.order_id,
    amountRefunded: plan.amountRefunded,
  }
}

export async function getShopifySyncState(admin: AdminClient = supabaseAdmin()): Promise<SyncStateRow> {
  const { data, error } = await admin.from('shopify_sync_state').select('*').eq('id', 1).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) {
    return {
      id: 1,
      phase: 'backfill',
      cursor_token: null,
      since_id: null,
      last_success_at: null,
      updated_at: nowIso(),
    }
  }
  return {
    id: 1,
    phase: (data.phase as 'backfill' | 'reconcile') ?? 'backfill',
    cursor_token: data.cursor_token ?? null,
    since_id: data.since_id != null ? Number(data.since_id) : null,
    last_success_at: data.last_success_at ?? null,
    updated_at: data.updated_at ?? nowIso(),
  }
}

export async function advanceShopifySyncCursor(
  patch: SyncCursorPatch,
  opts?: { admin?: AdminClient; now?: Date },
): Promise<SyncStateRow> {
  const admin = opts?.admin ?? supabaseAdmin()
  const current = await getShopifySyncState(admin)
  const next = planShopifySyncCursorAdvance(current, patch, nowIso(opts?.now))
  const { error } = await admin.from('shopify_sync_state').upsert(next, { onConflict: 'id' })
  if (error) throw new Error(error.message)
  return next
}

export async function reResolveShopifyLineCosts(opts?: {
  variantIds?: number[]
  admin?: AdminClient
  now?: Date
}): Promise<{ updated: number }> {
  const admin = opts?.admin ?? supabaseAdmin()
  const at = nowIso(opts?.now)
  const variantFilter = opts?.variantIds?.filter((id) => Number.isFinite(id) && id > 0)

  let q = admin
    .from('shopify_order_lines')
    .select(
      'shopify_line_item_id,shopify_order_id,shopify_variant_id,sku,title,quantity,gross_revenue,unit_cost,total_cost,mapping_kind,is_others,updated_at',
    )
    .or('is_others.eq.true,unit_cost.is.null')

  if (variantFilter?.length) {
    q = q.in('shopify_variant_id', variantFilter)
  }

  const { data: rows, error } = await q
  if (error) throw new Error(error.message)
  if (!rows?.length) return { updated: 0 }

  const lines = rows as MirrorLineRow[]
  const variantIds = Array.from(
    new Set(
      lines
        .map((l) => l.shopify_variant_id)
        .filter((v): v is number => typeof v === 'number' && v > 0),
    ),
  )
  const costCtx = await loadShopifyMirrorCostingsContext(admin, variantIds)
  const patches = planReResolveMirrorLines(lines, costCtx, {
    variantIds: variantFilter,
    at,
  })
  if (!patches.length) return { updated: 0 }

  const { error: uErr } = await admin.from('shopify_order_lines').upsert(patches, {
    onConflict: 'shopify_line_item_id',
  })
  if (uErr) throw new Error(uErr.message)
  return { updated: patches.length }
}
