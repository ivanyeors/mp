import crypto from 'crypto'

export function verifyShopifyWebhookHmac(args: { rawBody: string; webhookSecret: string; hmacHeader: string | null }): boolean {
  const { rawBody, webhookSecret, hmacHeader } = args
  if (!hmacHeader) return false
  const digest = crypto.createHmac('sha256', webhookSecret).update(rawBody, 'utf8').digest('base64')

  const a = Buffer.from(digest, 'utf8')
  const b = Buffer.from(hmacHeader, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}


