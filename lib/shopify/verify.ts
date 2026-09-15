import crypto from 'crypto'
import { secretMatches } from '@/lib/auth/secret'

export function verifyShopifyWebhookHmac(args: { rawBody: string; webhookSecret: string; hmacHeader: string | null }): boolean {
  const { rawBody, webhookSecret, hmacHeader } = args
  const digest = crypto.createHmac('sha256', webhookSecret).update(rawBody, 'utf8').digest('base64')
  return secretMatches(digest, hmacHeader)
}


