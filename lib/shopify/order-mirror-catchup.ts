/**
 * Hobby-safe Shopify order-mirror catch-up.
 * Chained after results-SLA (same request) — not a third vercel.json cron.
 */

import {
  advanceShopifySyncCursor,
  getShopifySyncState,
  isShopifyPaidFinancialStatus,
  upsertShopifyOrderMirror,
  type SyncStateRow,
} from '@/lib/shopify/order-mirror-ingest'
import {
  shopifyFetchOrdersPage,
  type ShopifyOrderLite,
  type ShopifyOrdersPage,
} from '@/lib/shopify/orders'
import { supabaseAdmin } from '@/lib/supabase/server'

export type CatchupBudget = {
  /** Max Admin API pages this invoke. */
  maxPages?: number
  /** Soft wall-clock budget (ms); checked before each page. */
  maxMs?: number
  pageSize?: number
}

export type CatchupResult = {
  ok: true
  phase: SyncStateRow['phase']
  pages: number
  upserted: number
  skipped: number
  exhausted: boolean
  budgetHit: boolean
  since_id: number | null
  cursor_token: string | null
}

type FetchPage = (args: {
  pageInfo?: string | null
  sinceId?: number | null
  updatedAtMin?: string | null
  limit?: number
}) => Promise<ShopifyOrdersPage>

type UpsertFn = (order: ShopifyOrderLite) => Promise<{ ok: true; skipped?: true }>

const DEFAULT_MAX_PAGES = 3
const DEFAULT_MAX_MS = 8_000
const DEFAULT_PAGE_SIZE = 50

function toOrderLike(o: ShopifyOrderLite) {
  return {
    id: o.id,
    name: o.name,
    currency: o.currency,
    financial_status: o.financial_status,
    created_at: o.created_at,
    processed_at: o.processed_at,
    total_price: o.total_price,
    line_items: o.line_items,
  }
}

/**
 * Pull one budgeted burst: backfill (since_id / page_info) then reconcile (updated_at_min).
 * Advances cursor after every successful page so partial progress survives timeout.
 */
export async function runShopifyOrderMirrorCatchup(
  opts?: CatchupBudget & {
    fetchPage?: FetchPage
    upsert?: UpsertFn
    getState?: () => Promise<SyncStateRow>
    advance?: typeof advanceShopifySyncCursor
    now?: Date
  },
): Promise<CatchupResult> {
  const maxPages = Math.max(1, Math.min(20, Math.floor(opts?.maxPages ?? DEFAULT_MAX_PAGES)))
  const maxMs = Math.max(500, Math.floor(opts?.maxMs ?? DEFAULT_MAX_MS))
  const pageSize = Math.max(1, Math.min(250, Math.floor(opts?.pageSize ?? DEFAULT_PAGE_SIZE)))
  const started = Date.now()
  const now = opts?.now ?? new Date()
  const fetchPage = opts?.fetchPage ?? shopifyFetchOrdersPage
  const advance = opts?.advance ?? advanceShopifySyncCursor
  const getState = opts?.getState ?? (() => getShopifySyncState(supabaseAdmin()))
  const upsert: UpsertFn =
    opts?.upsert ??
    (async (order) => {
      const r = await upsertShopifyOrderMirror(toOrderLike(order))
      return r.skipped ? { ok: true, skipped: true } : { ok: true }
    })

  let state = await getState()
  let pages = 0
  let upserted = 0
  let skipped = 0
  let exhausted = false
  let budgetHit = false

  while (pages < maxPages) {
    if (Date.now() - started >= maxMs) {
      budgetHit = true
      break
    }

    const page =
      state.phase === 'backfill'
        ? await fetchPage({
            pageInfo: state.cursor_token,
            sinceId: state.cursor_token ? null : (state.since_id ?? 0),
            limit: pageSize,
          })
        : await fetchPage({
            pageInfo: state.cursor_token,
            updatedAtMin: state.cursor_token
              ? null
              : (state.last_success_at ?? '1970-01-01T00:00:00Z'),
            limit: pageSize,
          })

    pages += 1
    let maxId = state.since_id ?? 0
    for (const order of page.orders) {
      if (order.id > maxId) maxId = order.id
      if (!isShopifyPaidFinancialStatus(order.financial_status)) {
        skipped += 1
        continue
      }
      const r = await upsert(order)
      if (r.skipped) skipped += 1
      else upserted += 1
    }

    if (state.phase === 'backfill') {
      if (page.nextPageInfo) {
        state = await advance(
          { since_id: maxId, cursor_token: page.nextPageInfo, phase: 'backfill' },
          { now },
        )
      } else if (page.orders.length >= pageSize) {
        // Full page, no Link next — keep walking via since_id watermark.
        state = await advance(
          { since_id: maxId, cursor_token: null, phase: 'backfill' },
          { now },
        )
      } else {
        // History exhausted → reconcile from here on.
        state = await advance(
          {
            since_id: maxId,
            cursor_token: null,
            phase: 'reconcile',
            last_success_at: now.toISOString(),
          },
          { now },
        )
        exhausted = true
        break
      }
    } else {
      // reconcile
      if (page.nextPageInfo) {
        state = await advance(
          { since_id: maxId, cursor_token: page.nextPageInfo, phase: 'reconcile' },
          { now },
        )
      } else {
        state = await advance(
          {
            since_id: maxId,
            cursor_token: null,
            phase: 'reconcile',
            last_success_at: now.toISOString(),
          },
          { now },
        )
        exhausted = true
        break
      }
    }
  }

  if (pages >= maxPages && !exhausted) budgetHit = true

  return {
    ok: true,
    phase: state.phase,
    pages,
    upserted,
    skipped,
    exhausted,
    budgetHit,
    since_id: state.since_id,
    cursor_token: state.cursor_token,
  }
}
