import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isListedShopProduct,
  PUBLIC_PRODUCT_COLUMNS,
  PUBLIC_VARIANT_COLUMNS,
  resolveProductContent,
  shopCardPrice,
} from "@/lib/ecommerce/products";
import { productPriceText, type CampaignBlockProduct, type CampaignBlockProducts } from "@/lib/email/campaign-blocks";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import type { Product, ProductImage, ProductVariant } from "@/lib/types/ecommerce";
import { productsIn, type CampaignContent } from "./content";

export interface UnlistedProduct {
  productId: string;
  title: string | null;
}

export interface CampaignProducts {
  products: CampaignBlockProducts;
  unlisted: UnlistedProduct[];
  error: string | null;
}

const NONE: CampaignProducts = { products: {}, unlisted: [], error: null };

export type ShopProductRow = Product & { product_variants: ProductVariant[] | null; product_images: ProductImage[] | null };
type ProductRow = ShopProductRow;

const CAMPAIGN_PRODUCT_SELECT = `${PUBLIC_PRODUCT_COLUMNS}, product_variants(${PUBLIC_VARIANT_COLUMNS}), product_images(id, url, alt_text, position, media_asset_id)`;

const reasonOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

const firstImage = (r: ProductRow) => [...(r.product_images ?? [])].sort((a, b) => a.position - b.position)[0] ?? null;

const titleOf = (r: ProductRow, locale: Locale) => resolveProductContent(r, locale).title?.trim() || r.slug;

export interface CampaignProductCard {
  id: string;
  title: string | null;
  photoUrl: string | null;
  price: string | null;
  listed: boolean;
}

export function shopProductCard(row: ProductRow, locale: Locale = DEFAULT_LOCALE): CampaignProductCard {
  const price = shopCardPrice(row.product_variants ?? []);
  const listed = Boolean(price) && isListedShopProduct(row);
  return {
    id: row.id,
    title: titleOf(row, locale),
    photoUrl: firstImage(row)?.url ?? null,
    price: listed && price ? productPriceText({ price: price.price, compareAt: price.compareAt, from: price.from, currency: price.currency }) : null,
    listed,
  };
}

export async function readCampaignProductCards(admin: SupabaseClient, ids: readonly string[]): Promise<CampaignProductCard[]> {
  if (!ids.length) return [];
  const { data, error } = await admin.from("products").select(CAMPAIGN_PRODUCT_SELECT).in("id", [...ids]);
  if (error) throw new Error(error.message);
  const rows = new Map(((data ?? []) as ProductRow[]).map((r) => [r.id, r]));
  return ids.map((id) => {
    const row = rows.get(id);
    return row ? shopProductCard(row) : { id, title: null, photoUrl: null, price: null, listed: false };
  });
}

export async function readCampaignProducts(
  admin: SupabaseClient,
  content: CampaignContent | null,
  { locale = DEFAULT_LOCALE }: { locale?: Locale } = {},
): Promise<CampaignProducts> {
  const ids = content ? productsIn(content) : [];
  if (!ids.length) return NONE;
  try {
    const { data, error } = await admin.from("products").select(CAMPAIGN_PRODUCT_SELECT).in("id", ids);
    if (error) throw new Error(error.message);
    const rows = new Map(((data ?? []) as ProductRow[]).map((r) => [r.id, r]));

    const unlinked = [...rows.values()].flatMap((r) => {
      const im = firstImage(r);
      return im && !im.media_asset_id && im.url ? [im.url] : [];
    });
    const assetByUrl = new Map<string, string>();
    if (unlinked.length) {
      const { data: assets, error: assetsError } = await admin.from("media_assets").select("id, hosted_url").in("hosted_url", unlinked);
      if (assetsError) throw new Error(assetsError.message);
      for (const a of (assets ?? []) as { id: string; hosted_url: string }[]) assetByUrl.set(a.hosted_url, a.id);
    }

    const products: Record<string, CampaignBlockProduct> = {};
    const unlisted: UnlistedProduct[] = [];
    for (const id of ids) {
      const row = rows.get(id);
      const title = row ? titleOf(row, locale) : null;
      const price = row ? shopCardPrice(row.product_variants ?? []) : null;
      if (!row || !title || !price || !isListedShopProduct(row)) {
        unlisted.push({ productId: id, title });
        continue;
      }
      const im = firstImage(row);
      const asset = im ? (im.media_asset_id ?? assetByUrl.get(im.url) ?? null) : null;
      products[id] = {
        title,
        slug: row.slug,
        image: asset ? { asset } : null,
        price: price.price,
        compareAt: price.compareAt,
        from: price.from,
        currency: price.currency,
      };
    }
    return { products, unlisted, error: null };
  } catch (err) {
    return { products: {}, unlisted: [], error: `The shop's products couldn't be read: ${reasonOf(err)}` };
  }
}

export function campaignProductPhotos({ products }: CampaignProducts): string[] {
  return [...new Set(Object.values(products).flatMap((p) => (p.image ? [p.image.asset] : [])))];
}

export function unlistedProductText({ title }: UnlistedProduct): string {
  return title ? `${title} is no longer in the shop: remove it or list it again` : "A product in the email is no longer in the shop: remove it";
}

export function campaignProductsProblem({ unlisted, error }: CampaignProducts): string | null {
  if (error) return error;
  return unlisted.length ? unlisted.map(unlistedProductText).join("; ") : null;
}
