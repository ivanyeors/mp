import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { sellPillow, sellPart, receiveStock } from '@/app/settings/inventory/actions'

export const runtime = 'nodejs'

type TelegramUpdate = {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number; type: string; title?: string; username?: string; first_name?: string; last_name?: string }
    text?: string
  }
}

function getEnv(name: string): string {
  const val = process.env[name]
  if (!val) throw new Error(`Missing required env var: ${name}`)
  return val
}

function parseAllowedChats(): Set<number> {
  const raw = process.env.TELEGRAM_ALLOWED_CHATS || ''
  const ids = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(n => Number(n))
    .filter(n => Number.isFinite(n))
  return new Set(ids)
}

async function sendTelegramMessage(chatId: number, text: string) {
  const token = getEnv('TELEGRAM_BOT_TOKEN')
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
    cache: 'no-store',
  })
  if (!res.ok) {
    // Best-effort logging only
    console.error('Failed to send Telegram message', await res.text())
  }
}

function helpText(): string {
  return [
    'Commands:',
    '/help – show this help',
    '/stock <id|code> – current stock (item) or buildable (pillow)',
    '/in <id|code> <qty> – receive stock (parts only)',
    '/out <id|code> <qty> – stock out (parts) or sell (pillow)',
    '',
    'Codes:',
    'Pillow: mpxs | mps | mpm | mpl | mpxl',
    'Part (examples): mp.xs.cov | mb.s.cov | fil.6d.l',
  ].join('\n')
}

type ResolvedIdentifier =
  | { kind: 'item-id'; itemId: number }
  | { kind: 'item-code'; category: string; size?: string | null; subtype?: string | null }
  | { kind: 'product'; size: 'XS' | 'S' | 'M' | 'L' | 'XL' }

function mapSizeToken(tok: string): 'XS' | 'S' | 'M' | 'L' | 'XL' | null {
  const t = tok.toLowerCase()
  if (t === 'xs') return 'XS'
  if (t === 's') return 'S'
  if (t === 'm') return 'M'
  if (t === 'l') return 'L'
  if (t === 'xl') return 'XL'
  return null
}

function mapCategoryToken(tok: string): 'cover' | 'case' | 'protector' | 'filling' | null {
  const t = tok.toLowerCase()
  if (t === 'cov') return 'cover'
  if (t === 'cas') return 'case'
  if (t === 'pro') return 'protector'
  if (t === 'fil') return 'filling'
  return null
}

function mapFillingSubtype(two: string, three?: string): string | null {
  const a = two?.toLowerCase() || ''
  const b = (three || '').toUpperCase()
  if (!a) return null
  if (!/^\d+d$/.test(a)) return null
  const grade = a.toUpperCase() // e.g. 3D or 6D
  if (!b) return null
  if (b === 'S') return `${grade}-S`
  if (b === 'L') return `${grade}-L`
  if (b === 'L+' || b === 'LPLUS' || b === 'L-PLUS' || b === 'L_PLUS') return `${grade}-L+`
  return null
}

function parseIdentifier(raw: string): ResolvedIdentifier | null {
  const s = (raw || '').trim()
  if (!s) return null
  if (/^\d+$/.test(s)) return { kind: 'item-id', itemId: Number(s) }

  const lower = s.toLowerCase()
  // Pillow product code: mpxs|mps|mpm|mpl|mpxl
  if (/^mp(xs|s|m|l|xl)$/.test(lower)) {
    const sizeTok = lower.replace(/^mp/, '')
    const size = mapSizeToken(sizeTok)
    if (size) return { kind: 'product', size }
  }

  // Part codes
  const parts = lower.split('.')
  if (parts.length >= 2) {
    const [p1, p2, p3] = parts
    // filling: fil.6d.l
    if (p1 === 'fil') {
      const subtype = mapFillingSubtype(p2, p3)
      if (subtype) return { kind: 'item-code', category: 'filling', subtype, size: null }
      return null
    }
    // mp.xs.cov or mb.s.cov
    if ((p1 === 'mp' || p1 === 'mb') && p2 && p3) {
      const size = mapSizeToken(p2)
      const cat = mapCategoryToken(p3)
      if (size && cat && cat !== 'filling') return { kind: 'item-code', category: cat, size, subtype: null }
      return null
    }
  }
  return null
}

async function resolveItemId(admin: ReturnType<typeof supabaseAdmin>, ident: ResolvedIdentifier): Promise<number | null> {
  if (ident.kind === 'item-id') return ident.itemId
  if (ident.kind === 'item-code') {
    let q = admin.from('items').select('id').eq('category', ident.category)
    if (ident.size != null) q = q.eq('size', ident.size)
    if (ident.subtype != null) q = q.eq('subtype', ident.subtype)
    const { data, error } = await q.limit(1).maybeSingle()
    if (error) throw new Error(error.message)
    return data?.id ?? null
  }
  return null
}

async function handleCommand(chatId: number, text: string) {
  const [cmd, ...args] = text.trim().split(/\s+/)
  const name = cmd.toLowerCase()

  try {
    if (name === '/help' || name === '/start') {
      await sendTelegramMessage(chatId, helpText())
      return
    }

    if (name === '/whoami') {
      await sendTelegramMessage(chatId, `Chat ID: ${chatId}`)
      return
    }

    if (name === '/stock') {
      const admin = supabaseAdmin()
      const ident = parseIdentifier(args[0] || '')
      if (!ident) return sendTelegramMessage(chatId, 'Usage: /stock <id|code>')

      if (ident.kind === 'product') {
        const { data: product, error: pErr } = await admin.from('pillow_products').select('id,size').eq('size', ident.size).maybeSingle()
        if (pErr) throw new Error(pErr.message)
        if (!product) return sendTelegramMessage(chatId, `Unknown pillow size: ${ident.size}`)
        const { data: build, error: bErr } = await admin
          .from('product_buildable')
          .select('buildable')
          .eq('product_id', product.id)
          .maybeSingle()
        if (bErr) throw new Error(bErr.message)
        const buildable = build?.buildable ?? 0
        await sendTelegramMessage(chatId, `Pillow ${product.size}\nBuildable: ${buildable}`)
        return
      }

      const itemId = await resolveItemId(admin, ident)
      if (!itemId) return sendTelegramMessage(chatId, 'Item not found for given code')
      const { data: item, error: itemErr } = await admin
        .from('items')
        .select('id,category,name,subtype,size')
        .eq('id', itemId)
        .maybeSingle()
      if (itemErr) throw new Error(itemErr.message)
      const { data: bal, error: balErr } = await admin
        .from('inventory_balances')
        .select('on_hand')
        .eq('item_id', itemId)
        .maybeSingle()
      if (balErr) throw new Error(balErr.message)
      const onHand = bal?.on_hand ?? 0
      const label = item ? [item.category, item.name, item.subtype, item.size].filter(Boolean).join(' ') : `Item #${itemId}`
      await sendTelegramMessage(chatId, `${label}\nOn hand: ${onHand}`)
      return
    }

    if (name === '/in') {
      const admin = supabaseAdmin()
      const ident = parseIdentifier(args[0] || '')
      const qty = Number(args[1])
      if (!ident || !Number.isFinite(qty) || qty <= 0) return sendTelegramMessage(chatId, 'Usage: /in <id|code> <qty>')
      if (ident.kind === 'product') return sendTelegramMessage(chatId, 'Use /out for pillows. /in applies to parts only.')
      const itemId = await resolveItemId(admin, ident)
      if (!itemId) return sendTelegramMessage(chatId, 'Item not found for given code')
      await receiveStock({ itemId, quantity: qty })
      await sendTelegramMessage(chatId, `Received ${qty} of item ${itemId}`)
      return
    }

    if (name === '/out') {
      const admin = supabaseAdmin()
      const ident = parseIdentifier(args[0] || '')
      const qty = Number(args[1])
      if (!ident || !Number.isFinite(qty) || qty <= 0) return sendTelegramMessage(chatId, 'Usage: /out <id|code> <qty>')
      if (ident.kind === 'product') {
        const { data: product, error } = await admin
          .from('pillow_products')
          .select('id,size')
          .eq('size', ident.size)
          .maybeSingle()
        if (error) throw new Error(error.message)
        if (!product) return sendTelegramMessage(chatId, `Unknown pillow size: ${ident.size}`)
        await sellPillow({ productId: Number(product.id), quantity: qty })
        await sendTelegramMessage(chatId, `Sold ${qty} pillow(s) of size ${product.size}`)
        return
      }
      const itemId = await resolveItemId(admin, ident)
      if (!itemId) return sendTelegramMessage(chatId, 'Item not found for given code')
      await sellPart({ itemId, quantity: qty })
      await sendTelegramMessage(chatId, `Stocked out ${qty} of item ${itemId}`)
      return
    }

    // Only /stock, /in, /out are supported

    await sendTelegramMessage(chatId, 'Unknown command. Send /help for usage.')
  } catch (err: any) {
    console.error('Command error:', err)
    await sendTelegramMessage(chatId, `Error: ${err?.message || 'unexpected error'}`)
  }
}

export async function POST(req: NextRequest) {
  try {
    const secret = getEnv('TELEGRAM_WEBHOOK_SECRET')
    const header = req.headers.get('x-telegram-bot-api-secret-token')
    if (!header || header !== secret) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const allowed = parseAllowedChats()
    const update = (await req.json()) as TelegramUpdate
    const chatId = update?.message?.chat?.id
    const text = update?.message?.text || ''

    if (!chatId) return NextResponse.json({ ok: true }, { status: 200 })
    if (allowed.size > 0 && !allowed.has(chatId)) {
      // Ignore unauthorized chats silently
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    if (text.startsWith('/')) {
      await handleCommand(chatId, text)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error)
    // Always 200 to avoid retries, but log the error
    return NextResponse.json({ ok: true }, { status: 200 })
  }
}


