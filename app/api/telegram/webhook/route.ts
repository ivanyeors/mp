import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { currentOtp } from '@/lib/settings-auth'
import { sellPillow, sellPart, receiveStock, sellBolster } from '@/app/[lang]/settings/inventory/actions'

export const runtime = 'nodejs'

type TelegramUpdate = {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number; type: string; title?: string; username?: string; first_name?: string; last_name?: string }
    from?: { id: number; username?: string; first_name?: string; last_name?: string }
    text?: string
    reply_to_message?: { message_id: number; text?: string }
  }
  callback_query?: {
    id: string
    from: { id: number }
    message?: { message_id: number; chat: { id: number } }
    data?: string
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

type InlineKeyboardButton = { text: string; callback_data: string }
type InlineKeyboardMarkup = { inline_keyboard: InlineKeyboardButton[][] }
type ForceReplyMarkup = { force_reply: true; selective?: boolean }
type ReplyMarkup = InlineKeyboardMarkup | ForceReplyMarkup

async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: ReplyMarkup) {
  const token = getEnv('TELEGRAM_BOT_TOKEN')
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup }),
    cache: 'no-store',
  })
  if (!res.ok) {
    // Best-effort logging only
    console.error('Failed to send Telegram message', await res.text())
  }
}

async function editTelegramMessage(chatId: number, messageId: number, text: string, replyMarkup?: ReplyMarkup) {
  const token = getEnv('TELEGRAM_BOT_TOKEN')
  const res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, reply_markup: replyMarkup }),
    cache: 'no-store',
  })
  if (!res.ok) {
    console.error('Failed to edit Telegram message', await res.text())
  }
}

async function answerCallback(callbackId: string) {
  const token = getEnv('TELEGRAM_BOT_TOKEN')
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId }),
    cache: 'no-store',
  })
}

function makeQtyToken(action: 'in'|'out', target: string): string {
  // target examples:
  // product:XS
  // bol:short
  // item:cover:XS
  // fill:6D-L
  return `QTY|${action}|${target}`
}

async function requestQuantity(chatId: number, action: 'in'|'out', target: string, label: string) {
  const token = makeQtyToken(action, target)
  const prompt = `Enter quantity for ${action.toUpperCase()} – ${label}\n${token}`
  const replyMarkup: ForceReplyMarkup = { force_reply: true }
  await sendTelegramMessage(chatId, prompt, replyMarkup)
}

function helpText(): string {
  return [
    'Commands:',
    '/help – show this help',
    '/otp – generate OTP for work.mpillow.com',
    '/stock – interactive stock and actions',
    '/in – interactive stock-in (parts)',
    '/out – interactive stock-out/sell',
    '',
    'Codes:',
    'Pillow: mpxs | mps | mpm | mpl | mpxl',
    'Part (examples): mp.xs.cov | mb.s.cov | fil.6d.l',
  ].join('\n')
}

function normalizeTelegramCommand(cmdRaw: string): string {
  // In group chats Telegram can send commands like "/otp@MyBotName".
  // We only care about the base command.
  const cmd = (cmdRaw || '').trim().toLowerCase()
  if (!cmd) return ''
  const base = cmd.split('@')[0] || ''
  return base
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
  const a = (two || '').trim().toLowerCase()
  const rawB = (three || '').trim()
  if (!a) return null
  // Accept grades like 3d, 6d, 6d+
  const gradeBaseMatch = a.match(/^(\d+d)(\+)?$/)
  if (!gradeBaseMatch) return null
  const grade = (gradeBaseMatch[1].toUpperCase() + (gradeBaseMatch[2] ? '+' : '')) as '3D' | '6D' | '3D+' | '6D+'

  const b = rawB.toUpperCase()
  if (!b) return null

  // Keyword styles -> exact new names with parentheses
  if (b === 'ROUND' || b === 'RND') return `${grade} (Round)`
  if (b === 'FOLDED' || b === 'FOLD') return `${grade} (Folded)`

  // Size styles -> exact new names with parentheses
  if (b === 'S') return `${grade} (S)`
  if (b === 'M') return `${grade} (M)`
  if (b === 'L') return `${grade} (L)`
  if (b === 'XL') return `${grade} (XL)`
  if (b === 'L+' || b === 'LPLUS' || b === 'L-PLUS' || b === 'L_PLUS') return `${grade} (L)`

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
  const name = normalizeTelegramCommand(cmd)

  try {
    if (name === '/help' || name === '/start') {
      await sendTelegramMessage(chatId, helpText())
      return
    }

    if (name === '/otp') {
      const { code } = currentOtp()
      await sendTelegramMessage(chatId, String(code))
      return
    }

    if (name === '/whoami') {
      await sendTelegramMessage(chatId, `Chat ID: ${chatId}`)
      return
    }

    if (name === '/stock_menu') {
      const kb: InlineKeyboardMarkup = {
        inline_keyboard: [
          [ { text: 'Pillows', callback_data: 'pillows' } ],
          [ { text: 'Parts', callback_data: 'parts' } ],
        ],
      }
      await sendTelegramMessage(chatId, 'Select a category:', kb)
      return
    }

    if (name === '/stock') {
      if (!args.length) {
        const kb: InlineKeyboardMarkup = {
          inline_keyboard: [
            [ { text: 'Pillows', callback_data: 'pillows' } ],
            [ { text: 'Bolster', callback_data: 'bolster' } ],
            [ { text: 'Parts', callback_data: 'parts' } ],
          ],
        }
        await sendTelegramMessage(chatId, 'Select a category:', kb)
        return
      }
      const admin = supabaseAdmin()
      const ident = parseIdentifier(args[0] || '')
      if (!ident) return sendTelegramMessage(chatId, 'Usage: /stock')

      if (ident.kind === 'product') {
        const { data: product, error: pErr } = await admin
          .from('pillow_products')
          .select('id,size')
          .eq('size', ident.size)
          .eq('kind', 'basic')
          .maybeSingle()
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
      if (!args.length) {
        const kb: InlineKeyboardMarkup = { inline_keyboard: [ [ { text: 'Parts', callback_data: 'in:parts' } ] ] }
        await sendTelegramMessage(chatId, 'Stock In – select a category:', kb)
        return
      }
      const admin = supabaseAdmin()
      const ident = parseIdentifier(args[0] || '')
      const qty = Number(args[1])
      if (!ident || !Number.isFinite(qty) || qty <= 0) return sendTelegramMessage(chatId, 'Usage: /in')
      if (ident.kind === 'product') return sendTelegramMessage(chatId, 'Use /out for pillows. /in applies to parts only.')
      const itemId = await resolveItemId(admin, ident)
      if (!itemId) return sendTelegramMessage(chatId, 'Item not found for given code')
      await receiveStock({ itemId, quantity: qty })
      await sendTelegramMessage(chatId, `Received ${qty} of item ${itemId}`)
      return
    }

    if (name === '/out') {
      if (!args.length) {
        const kb: InlineKeyboardMarkup = { inline_keyboard: [ [ { text: 'Pillows', callback_data: 'out:pillows' } ], [ { text: 'Bolster', callback_data: 'out:bolster' } ], [ { text: 'Parts', callback_data: 'out:parts' } ] ] }
        await sendTelegramMessage(chatId, 'Stock Out – select a category:', kb)
        return
      }
      const admin = supabaseAdmin()
      const ident = parseIdentifier(args[0] || '')
      const qty = Number(args[1])
      if (!ident || !Number.isFinite(qty) || qty <= 0) return sendTelegramMessage(chatId, 'Usage: /out')
      if (ident.kind === 'product') {
        const { data: product, error } = await admin
          .from('pillow_products')
          .select('id,size')
          .eq('size', ident.size)
          .eq('kind', 'basic')
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
  } catch (err) {
    console.error('Command error:', err)
    const message = err instanceof Error ? err.message : 'unexpected error'
    await sendTelegramMessage(chatId, `Error: ${message}`)
  }
}

async function handleCallback(update: TelegramUpdate) {
  const cq = update.callback_query!
  const chatId = cq.message?.chat.id
  const messageId = cq.message?.message_id
  const data = cq.data || ''
  if (!chatId || !messageId) {
    await answerCallback(cq.id)
    return
  }
  const admin = supabaseAdmin()

  try {
    if (data === 'menu' || data === 'root') {
      const kb: InlineKeyboardMarkup = {
        inline_keyboard: [
          [ { text: 'Pillows', callback_data: 'pillows' } ],
          [ { text: 'Bolster', callback_data: 'bolster' } ],
          [ { text: 'Parts', callback_data: 'parts' } ],
        ],
      }
      await editTelegramMessage(chatId, messageId, 'Select a category:', kb)
      await answerCallback(cq.id)
      return
    }

    if (data === 'pillows') {
      const kb: InlineKeyboardMarkup = {
        inline_keyboard: [
          [ { text: 'XS', callback_data: 'pill:XS' }, { text: 'S', callback_data: 'pill:S' } ],
          [ { text: 'M', callback_data: 'pill:M' }, { text: 'L', callback_data: 'pill:L' } ],
          [ { text: 'XL', callback_data: 'pill:XL' } ],
          [ { text: '« Back', callback_data: 'menu' } ],
        ],
      }
      await editTelegramMessage(chatId, messageId, 'Pillows – choose size:', kb)
      await answerCallback(cq.id)
      return
    }

    if (data.startsWith('pill:')) {
      const size = data.split(':')[1] as 'XS'|'S'|'M'|'L'|'XL'
      const { data: product } = await admin
        .from('pillow_products')
        .select('id,size')
        .eq('size', size)
        .eq('kind', 'basic')
        .maybeSingle()
      let buildable = 0
      if (product) {
        const { data: buildRec } = await admin
          .from('product_buildable')
          .select('buildable')
          .eq('product_id', product.id)
          .maybeSingle()
        buildable = buildRec?.buildable ?? 0
      }
      const kb: InlineKeyboardMarkup = {
        inline_keyboard: [
          [ { text: 'Out', callback_data: `askqty:out:product:${size}` } ],
          [ { text: '« Back', callback_data: 'pillows' } ],
          [ { text: '« Main', callback_data: 'menu' } ],
        ],
      }
      await editTelegramMessage(chatId, messageId, `Pillow ${size}\nBuildable: ${buildable}\nSelect action:`, kb)
      await answerCallback(cq.id)
      return
    }

    if (data === 'parts') {
      const kb: InlineKeyboardMarkup = {
        inline_keyboard: [
          [ { text: 'Cover', callback_data: 'pcat:cover' }, { text: 'Case', callback_data: 'pcat:case' } ],
          [ { text: 'Protector', callback_data: 'pcat:protector' }, { text: 'Filling', callback_data: 'pcat:filling' } ],
          [ { text: '« Back', callback_data: 'menu' } ],
        ],
      }
      await editTelegramMessage(chatId, messageId, 'Parts – choose category:', kb)
      await answerCallback(cq.id)
      return
    }

    if (data === 'bolster') {
      const kb: InlineKeyboardMarkup = {
        inline_keyboard: [
          [ { text: 'Short (0.8m)', callback_data: 'bol:short' } ],
          [ { text: 'Medium (1.0m)', callback_data: 'bol:medium' } ],
          [ { text: 'Long (1.2m)', callback_data: 'bol:long' } ],
          [ { text: '« Back', callback_data: 'menu' } ],
        ],
      }
      await editTelegramMessage(chatId, messageId, 'Bolster – choose length:', kb)
      await answerCallback(cq.id)
      return
    }

    if (data.startsWith('bol:')) {
      const variant = data.split(':')[1] as 'short'|'medium'|'long'
      const { data: lines } = await admin
        .from('bolster_bom_lines')
        .select('item_id,quantity')
        .eq('variant', variant)
      const items = (lines ?? []).map(l => l.item_id)
      let buildable = 0
      if (items.length > 0) {
        const { data: bals } = await admin
          .from('inventory_balances')
          .select('item_id,on_hand')
          .in('item_id', items)
        const map = new Map<number, number>()
        ;(bals ?? []).forEach(r => map.set(Number(r.item_id), Number(r.on_hand)))
        const counts = (lines ?? []).map(l => {
          const onHand = Number(map.get(Number(l.item_id)) ?? 0)
          const qty = Math.max(1, Number(l.quantity))
          return Math.floor(onHand / qty)
        })
        buildable = counts.length ? Math.max(0, Math.min(...counts)) : 0
      }
      const label = variant === 'short' ? 'Short (0.8m)' : variant === 'long' ? 'Long (1.2m)' : 'Medium (1.0m)'
      const kb: InlineKeyboardMarkup = {
        inline_keyboard: [
          [ { text: 'Out', callback_data: `askqty:out:bol:${variant}` } ],
          [ { text: '« Back', callback_data: 'bolster' } ],
          [ { text: '« Main', callback_data: 'menu' } ],
        ],
      }
      await editTelegramMessage(chatId, messageId, `Bolster ${label}\nBuildable: ${buildable}\nSelect action:`, kb)
      await answerCallback(cq.id)
      return
    }

    if (data.startsWith('pcat:')) {
      const cat = data.split(':')[1]
      if (cat === 'filling') {
        // Load available filling subtypes from DB
        const { data: subs } = await admin.from('items').select('subtype').eq('category', 'filling').not('subtype', 'is', null)
        const unique = Array.from(new Set((subs || []).map(r => String(r.subtype))))
        const rows: InlineKeyboardButton[][] = []
        for (let i = 0; i < unique.length; i += 2) {
          const row: InlineKeyboardButton[] = [ { text: unique[i], callback_data: `fill:${unique[i]}` } ]
          if (unique[i+1]) {
            row.push({ text: unique[i+1], callback_data: `fill:${unique[i+1]}` })
          }
          rows.push(row)
        }
        rows.push([ { text: '« Back', callback_data: 'parts' } ])
        const kb: InlineKeyboardMarkup = { inline_keyboard: rows }
        await editTelegramMessage(chatId, messageId, 'Filling – choose subtype:', kb)
        await answerCallback(cq.id)
        return
      }
      // Sized categories
      const kb: InlineKeyboardMarkup = {
        inline_keyboard: [
          [ { text: 'XS', callback_data: `part:${cat}:XS` }, { text: 'S', callback_data: `part:${cat}:S` } ],
          [ { text: 'M', callback_data: `part:${cat}:M` }, { text: 'L', callback_data: `part:${cat}:L` } ],
          [ { text: 'XL', callback_data: `part:${cat}:XL` } ],
          [ { text: '« Back', callback_data: 'parts' } ],
        ],
      }
      await editTelegramMessage(chatId, messageId, `${cat[0].toUpperCase()}${cat.slice(1)} – choose size:`, kb)
      await answerCallback(cq.id)
      return
    }

    if (data.startsWith('part:')) {
      const [, cat, size] = data.split(':')
      const { data: item } = await admin.from('items').select('id').eq('category', cat).eq('size', size).maybeSingle()
      const itemId = item?.id
      let onHand = 0
      if (itemId) {
        const { data: bal } = await admin.from('inventory_balances').select('on_hand').eq('item_id', itemId).maybeSingle()
        onHand = bal?.on_hand ?? 0
      }
      const kb: InlineKeyboardMarkup = {
        inline_keyboard: [
          [ { text: 'In', callback_data: `askqty:in:item:${cat}:${size}` }, { text: 'Out', callback_data: `askqty:out:item:${cat}:${size}` } ],
          [ { text: '« Back', callback_data: `pcat:${cat}` } ],
          [ { text: '« Main', callback_data: 'menu' } ],
        ],
      }
      await editTelegramMessage(chatId, messageId, `${cat} ${size}\nOn hand: ${onHand}\nSelect action:`, kb)
      await answerCallback(cq.id)
      return
    }

    if (data.startsWith('fill:')) {
      const subtype = data.substring(5)
      const { data: item } = await admin.from('items').select('id').eq('category', 'filling').eq('subtype', subtype).maybeSingle()
      const itemId = item?.id
      let onHand = 0
      if (itemId) {
        const { data: bal } = await admin.from('inventory_balances').select('on_hand').eq('item_id', itemId).maybeSingle()
        onHand = bal?.on_hand ?? 0
      }
      const kb: InlineKeyboardMarkup = {
        inline_keyboard: [
          [ { text: 'In', callback_data: `askqty:in:fill:${subtype}` }, { text: 'Out', callback_data: `askqty:out:fill:${subtype}` } ],
          [ { text: '« Back', callback_data: 'pcat:filling' } ],
          [ { text: '« Main', callback_data: 'menu' } ],
        ],
      }
      await editTelegramMessage(chatId, messageId, `Filling ${subtype}\nOn hand: ${onHand}\nSelect action:`, kb)
      await answerCallback(cq.id)
      return
    }

    // askqty handlers
    if (data.startsWith('askqty:')) {
      const parts = data.split(':')
      // askqty:<action>:<target_type>:...
      const action = parts[1] as 'in'|'out'
      const targetType = parts[2]
      if (targetType === 'product') {
        const size = parts[3] as 'XS'|'S'|'M'|'L'|'XL'
        await requestQuantity(chatId, action, `product:${size}`, `Pillow ${size}`)
      } else if (targetType === 'bol') {
        const variant = parts[3] as 'short'|'medium'|'long'
        await requestQuantity(chatId, action, `bol:${variant}`, `Bolster ${variant}`)
      } else if (targetType === 'item') {
        const cat = parts[3]
        const size = parts[4]
        await requestQuantity(chatId, action, `item:${cat}:${size}`, `${cat} ${size}`)
      } else if (targetType === 'fill') {
        const subtype = parts.slice(3).join(':')
        await requestQuantity(chatId, action, `fill:${subtype}`, `Filling ${subtype}`)
      }
      await answerCallback(cq.id)
      return
    }

    // Unknown action: go to root
    const kb: InlineKeyboardMarkup = { inline_keyboard: [ [ { text: 'Pillows', callback_data: 'pillows' } ], [ { text: 'Bolster', callback_data: 'bolster' } ], [ { text: 'Parts', callback_data: 'parts' } ] ] }
    await editTelegramMessage(chatId, messageId, 'Select a category:', kb)
    await answerCallback(cq.id)
  } catch (err) {
    console.error('Callback error:', err)
    await answerCallback(cq.id)
  }
}

export async function GET() {
  const allowed = parseAllowedChats()
  return NextResponse.json({
    ok: true,
    hasBotToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    hasWebhookSecret: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    allowedChatsCount: allowed.size,
  })
}

export async function POST(req: NextRequest) {
  try {
    const allowed = parseAllowedChats()
    const update = (await req.json()) as TelegramUpdate
    const msgChatId = update?.message?.chat?.id
    const cbChatId = update?.callback_query?.message?.chat?.id
    const text = update?.message?.text || ''
    const replyText = update?.message?.reply_to_message?.text || ''

    const effectiveChatId = typeof cbChatId === 'number' ? cbChatId : msgChatId
    if (!effectiveChatId) return NextResponse.json({ ok: true }, { status: 200 })
    if (allowed.size > 0 && !allowed.has(effectiveChatId)) {
      console.warn('Telegram webhook rejected: chat not in TELEGRAM_ALLOWED_CHATS', effectiveChatId)
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    const header = req.headers.get('x-telegram-bot-api-secret-token')
    if (secret) {
      if (!header || header !== secret) {
        // Always 200 to avoid Telegram retries.
        // If the chat is allowlisted, proactively message it so the failure is visible.
        console.warn('Telegram webhook rejected: invalid secret token header')
        if (allowed.size > 0 && allowed.has(effectiveChatId)) {
          try {
            await sendTelegramMessage(
              effectiveChatId,
              `Webhook auth failed (secret token mismatch).\n` +
                `Fix: re-set the Telegram webhook with the same secret as TELEGRAM_WEBHOOK_SECRET.\n` +
                `Chat ID: ${effectiveChatId}`
            )
          } catch (e) {
            console.error('Failed to send webhook auth failure diagnostic', e)
          }
        }
        return NextResponse.json({ ok: true }, { status: 200 })
      }
    } else if (!secret && header) {
      // If a header is being sent but we don't have a configured secret, log it to help setup.
      console.warn('Telegram webhook: secret header received but TELEGRAM_WEBHOOK_SECRET is not set')
    }

    if (update.callback_query?.data) {
      await handleCallback(update)
    } else if (replyText.startsWith('Enter quantity for')) {
      // Parse embedded token on prior message
      const tokenMatch = replyText.match(/QTY\|([a-z]+)\|(.+)$/i)
      const qty = Number(text.trim())
      if (!tokenMatch || !Number.isFinite(qty) || qty <= 0) {
        // ignore
      } else {
        const action = tokenMatch[1] as 'in'|'out'
        const target = tokenMatch[2]
        const admin = supabaseAdmin()
        if (target.startsWith('product:')) {
          const size = target.split(':')[1] as 'XS'|'S'|'M'|'L'|'XL'
          const { data: product } = await admin
            .from('pillow_products')
            .select('id,size')
            .eq('size', size)
            .eq('kind', 'basic')
            .maybeSingle()
          if (product && action === 'out') {
            await sellPillow({ productId: Number(product.id), quantity: qty })
            await sendTelegramMessage(effectiveChatId, `Sold ${qty} pillow(s) of size ${product.size}`)
          }
        } else if (target.startsWith('bol:')) {
          const variant = target.split(':')[1] as 'short'|'medium'|'long'
          if (action === 'out') {
            await sellBolster({ quantity: qty, variant })
            await sendTelegramMessage(effectiveChatId, `Sold ${qty} bolster(s) ${variant}`)
          }
        } else if (target.startsWith('item:')) {
          const [, cat, size] = target.split(':')
          const { data: item } = await admin.from('items').select('id').eq('category', cat).eq('size', size).maybeSingle()
          const itemId = item?.id
          if (itemId) {
            if (action === 'in') await receiveStock({ itemId, quantity: qty })
            else await sellPart({ itemId, quantity: qty })
            await sendTelegramMessage(effectiveChatId, `${action === 'in' ? 'Received' : 'Stocked out'} ${qty} of item ${itemId}`)
          }
        } else if (target.startsWith('fill:')) {
          const subtype = target.substring(5)
          const { data: item } = await admin.from('items').select('id').eq('category', 'filling').eq('subtype', subtype).maybeSingle()
          const itemId = item?.id
          if (itemId) {
            if (action === 'in') await receiveStock({ itemId, quantity: qty })
            else await sellPart({ itemId, quantity: qty })
            await sendTelegramMessage(effectiveChatId, `${action === 'in' ? 'Received' : 'Stocked out'} ${qty} of item ${itemId}`)
          }
        }
      }
    } else if (text.startsWith('/')) {
      await handleCommand(effectiveChatId, text)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error)
    // Always 200 to avoid retries, but log the error
    return NextResponse.json({ ok: true }, { status: 200 })
  }
}


