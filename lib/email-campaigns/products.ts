/**
 * A campaign's products as the shop sells them now (PRD-campaign-email-editor
 * slice 07, decision 3).
 *
 * A products block, or a product button, holds only Storefront product ids.
 * Every render (the preview, the test send and each batch of a wave) reads
 * them here, through the shop's own select, so the email shows the name, the
 * first photo and the price the shop shows at that moment: the price is the
 * cheapest active Variant's, which Costings sets (ADR 0001), and never a
 * number of the campaign's. A started campaign's choice of products is fixed
 * with the rest of its content; its prices and photos follow the shop.
 *
 * A product that is no longer **Listed** (archived to draft, its Variants
 * all off) or no longer exists is left out of what the renderer gets, and
 * named in `unlisted`: the readiness check before each wave, and each batch,
 * refuse to send a dead link.
 *
 * Server only: it reads the database. The client is passed in, so a test can
 * hand it a fake.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isListedShopProduct,
  PUBLIC_PRODUCT_COLUMNS,
  PUBLIC_VARIANT_COLUMNS,
  resolveProductContent,
  shopCardPrice,
} from "@/lib/ecommerce/products";
import { productPriceText, type CampaignBlockProduct, type CampaignBlockProducts } from "@/lib/email/campaign-blocks";
import type { PreflightCheck } from "@/lib/customer-migration/wave-sender";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import type { Product, ProductImage, ProductVariant } from "@/lib/types/ecommerce";
import { productsIn, type CampaignContent } from "./content";

/** A product the email names that the shop does not sell now: its name, while it still exists. */
export interface UnlistedProduct {
  productId: string;
  title: string | null;
}

export interface CampaignProducts {
  /** Each Listed product, as the renderer takes it. */
  products: CampaignBlockProducts;
  unlisted: UnlistedProduct[];
  /** The shop could not be read at all: why, in words for Staff. */
  error: string | null;
}

const NONE: CampaignProducts = { products: {}, unlisted: [], error: null };

/** A product as the shop's select returns it: its columns, its Variants and its images. */
export type ShopProductRow = Product & { product_variants: ProductVariant[] | null; product_images: ProductImage[] | null };
type ProductRow = ShopProductRow;

/** The shop's own columns (lib/ecommerce/products.ts), and each photo's Media Asset, whose email rendition the email shows. */
const CAMPAIGN_PRODUCT_SELECT = `${PUBLIC_PRODUCT_COLUMNS}, product_variants(${PUBLIC_VARIANT_COLUMNS}), product_images(id, url, alt_text, position, media_asset_id)`;

const reasonOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The photo the shop card shows first. */
const firstImage = (r: ProductRow) => [...(r.product_images ?? [])].sort((a, b) => a.position - b.position)[0] ?? null;

/** Its name as the shop shows it in `locale`. */
const titleOf = (r: ProductRow, locale: Locale) => resolveProductContent(r, locale).title?.trim() || r.slug;

/** A product as the editor's card and picker show it (slice 07): what the email will, with the shop's own photo. */
export interface CampaignProductCard {
  id: string;
  /** Null for a product that no longer exists. */
  title: string | null;
  photoUrl: string | null;
  /** As the email writes it, `from SGD 39.00`; null when it is not Listed. */
  price: string | null;
  listed: boolean;
}

/** Pure — a shop row as the editor's card shows it. */
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

/** Each of `ids` as the editor's card shows it, in order; one that no longer exists has no title. Throws when the shop cannot be read. */
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

/**
 * Each product `content` shows or links to, as the shop sells it now, with
 * its first photo as a Media Asset (whose email rendition the sender reads
 * with the images'). Never throws: a failed read is `error`, and the caller
 * says so. Content with no product reads nothing.
 */
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

    // A photo added before the Media Library has only its address: its asset is the one hosted there.
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

/** Pure — the Media Assets of the products' photos, whose email renditions the sender reads with the blocks' images. */
export function campaignProductPhotos({ products }: CampaignProducts): string[] {
  return [...new Set(Object.values(products).flatMap((p) => (p.image ? [p.image.asset] : [])))];
}

/** Pure — one product the shop does not sell now, by name: what to do about it. */
export function unlistedProductText({ title }: UnlistedProduct): string {
  return title ? `${title} is no longer in the shop: remove it or list it again` : "A product in the email is no longer in the shop: remove it";
}

/** Pure — what stops a send for want of a product, or null: every one not in the shop, by name. */
export function campaignProductsProblem({ unlisted, error }: CampaignProducts): string | null {
  if (error) return error;
  return unlisted.length ? unlisted.map(unlistedProductText).join("; ") : null;
}

/**
 * The products as a check before a wave (its waves can span days, and a
 * product can be un-listed between them); null for an email with none.
 */
export async function productsCheck(admin: SupabaseClient, content: CampaignContent | null): Promise<PreflightCheck | null> {
  const count = content ? productsIn(content).length : 0;
  if (!count) return null;
  const read = await readCampaignProducts(admin, content);
  const problem = campaignProductsProblem(read);
  return {
    key: "products",
    ok: !problem,
    detail: problem ?? (count === 1 ? "the product in the email is in the shop" : `the ${count} products in the email are in the shop`),
  };
}
