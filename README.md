This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Shopify inventory sync (buildable → Shopify)

This repo can keep Shopify variant inventory in sync with the platform’s computed availability:
- **Shopify → Platform**: Shopify order webhook decrements component inventory via existing inventory actions.
- **Platform → Shopify**: The platform computes “buildable” counts and sets Shopify variant inventory to match.

### Required environment variables

Set these in **Vercel** (and optionally in `.env.local` for local dev):
- `SHOPIFY_SHOP_DOMAIN` (e.g. `your-store.myshopify.com`)
- `SHOPIFY_ADMIN_ACCESS_TOKEN` (Admin API access token, typically starts with `shpat_...`)
- `SHOPIFY_WEBHOOK_SECRET` (webhook signing secret)
- `SHOPIFY_API_VERSION` (optional, default `2025-07`)
- `SHOPIFY_LOCATION_ID` (optional; if omitted we auto-pick the first active location)
- `SHOPIFY_SYNC_TOKEN` (optional; if set, `/api/shopify/sync` requires `Authorization: Bearer <token>`)

### Webhook

Create a Shopify webhook for `orders/paid` and point it to:
- `POST /api/shopify/webhook`

### Mapping (no SKU dependency)

To avoid breaking changes while SKUs are being renamed, mapping is done by **Shopify Variant ID**.

Create rows in Supabase table `shopify_variant_mappings`:
- `kind='pillow'` with `pillow_size` in `XS|S|M|L|XL`
- `kind='bolster'` with `bolster_variant` in `short|medium|long`
- `kind='part'` with `item_id` pointing to `items.id` (optional)

### Manual sync endpoint

Trigger a sync (buildable → Shopify inventory):
- `POST /api/shopify/sync`

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
