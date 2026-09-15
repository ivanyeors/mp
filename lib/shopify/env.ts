export type ShopifyEnv = {
  shopDomain: string
  adminAccessToken: string
  webhookSecret?: string
  apiVersion: string
  locationId?: string
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

export function getShopifyEnv(): ShopifyEnv {
  return {
    shopDomain: requireEnv('SHOPIFY_SHOP_DOMAIN'),
    adminAccessToken: requireEnv('SHOPIFY_ADMIN_ACCESS_TOKEN'),
    webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET,
    apiVersion: process.env.SHOPIFY_API_VERSION || '2025-07',
    locationId: process.env.SHOPIFY_LOCATION_ID,
  }
}

export function getShopifyWebhookSecret(): string {
  return requireEnv('SHOPIFY_WEBHOOK_SECRET')
}


