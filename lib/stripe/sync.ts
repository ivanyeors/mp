import { getStripe } from "./client";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { ProductVariant } from "@/lib/types/ecommerce";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { loadVariantLabels, withPricingBlock, type VariantLabel } from "./variant-labels";
import { stripePriceIdColumn, stripePriceIdOf, stripeProductIdColumn, stripeProductIdOf } from "./mode";

const STRIPE_TAX_CODE = process.env.STRIPE_TAX_CODE || "txcd_33080301";

const STRIPE_TAX_BEHAVIOR: "exclusive" | "inclusive" = "exclusive";

function isResourceMissing(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "resource_missing";
}

export type StripeSyncResult = {
  stripeProductId: string;
  variants: { id: string; stripePriceId: string }[];
  notices: string[];
};

export type StripeSyncOutcome = {
  synced: boolean;
  error?: string;
  pricesInPlace: boolean;
  notices: string[];
  result?: StripeSyncResult;
};

export class StripeNeedsAttentionError extends Error {
  readonly notices: string[];

  constructor(attention: string[], notices: string[]) {
    super(`The new prices are in place, but Stripe needs attention: ${attention.join("; ")}`);
    this.name = "StripeNeedsAttentionError";
    this.notices = notices;
  }
}

export async function syncProductToStripe(productId: string): Promise<StripeSyncResult> {
  const stripe = getStripe();
  const admin = supabaseAdmin();

  const { data: product } = await admin
    .from("products")
    .select("*, product_variants(*), product_images(*)")
    .eq("id", productId)
    .single();

  if (!product) throw new Error("Product not found");

  const content = product.content?.[DEFAULT_LOCALE] ?? Object.values(product.content ?? {})[0] ?? {};
  const title = content.title || product.slug;
  const description = content.description || "";
  const images = ((product.product_images ?? []) as { url: string; position: number }[])
    .sort((a, b) => a.position - b.position)
    .map((img) => img.url)
    .slice(0, 8);

  const variantsForLabels = (product.product_variants ?? []) as ProductVariant[];
  const labels = await loadVariantLabels(admin, variantsForLabels as never);
  const describedPrice = withPricingBlock(
    description,
    variantsForLabels
      .map((v) => labels.get(v.id))
      .filter((l): l is VariantLabel => Boolean(l)),
  );

  const productIdColumn = stripeProductIdColumn();
  const priceIdColumn = stripePriceIdColumn();
  let stripeProductId = stripeProductIdOf(product);

  if (stripeProductId) {
    try {
      await stripe.products.update(stripeProductId, {
        name: title,
        description: describedPrice,
        images: images.length ? images : undefined,
        tax_code: STRIPE_TAX_CODE,
      });
    } catch (err) {
      if (!isResourceMissing(err)) throw err;
      stripeProductId = null;
    }
  }

  if (!stripeProductId) {
    const stripeProduct = await stripe.products.create({
      name: title,
      description: describedPrice || undefined,
      images: images.length ? images : undefined,
      tax_code: STRIPE_TAX_CODE,
      metadata: { supabase_product_id: productId },
    });
    stripeProductId = stripeProduct.id;

    const { error } = await admin
      .from("products")
      .update({ [productIdColumn]: stripeProductId })
      .eq("id", productId);
    if (error) {
      throw new Error(
        `Created Stripe product ${stripeProductId} but couldn't save its id: ${error.message}`,
      );
    }
  }

  const variants = (product.product_variants ?? []) as ProductVariant[];
  const variantResults: { id: string; stripePriceId: string }[] = [];
  const stripeNotices: string[] = [];

  try {
    for (const variant of variants) {
      const { priceId, archiveAfterSave } = await syncVariantPrice(
        stripeProductId,
        variant,
        stripeNotices,
        labels.get(variant.id),
      );
      variantResults.push({ id: variant.id, stripePriceId: priceId });

      const { error } = await admin
        .from("product_variants")
        .update({ [priceIdColumn]: priceId })
        .eq("id", variant.id);
      if (error) {
        throw new Error(
          `Couldn't save the Stripe price for variant ${variant.sku || variant.id}: ${error.message}`,
        );
      }

      if (archiveAfterSave) await archivePrice(archiveAfterSave, stripeNotices);
    }
  } catch (err) {
    if (!stripeNotices.length) throw err;
    throw new Error(`${errorMessage(err)}. Also in Stripe: ${stripeNotices.join("; ")}`);
  }

  if (stripeNotices.length) {
    throw new StripeNeedsAttentionError(stripeNotices, []);
  }

  return { stripeProductId, variants: variantResults, notices: [] };
}

// ponytail: best-effort + synchronous. Ceiling: if Stripe is down the DB edit still saves but
// `stripe_price_id` stays stale until the next edit or a manual "Sync to Stripe". Upgrade path:
// enqueue a background retry.
export async function syncProductToStripeSafe(productId: string): Promise<StripeSyncOutcome> {
  try {
    const result = await syncProductToStripe(productId);
    return {
      synced: true,
      pricesInPlace: true,
      notices: result.notices,
      result,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Stripe sync failed";
    console.error(`[stripe/auto-sync] product ${productId}:`, error);
    if (err instanceof StripeNeedsAttentionError) {
      return {
        synced: false,
        error,
        pricesInPlace: true,
        notices: err.notices,
      };
    }
    return { synced: false, error, pricesInPlace: false, notices: [] };
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function archivePrice(priceId: string, stripeNotices: string[]) {
  try {
    await getStripe().prices.update(priceId, { active: false });
  } catch (err) {
    if (isResourceMissing(err)) return;
    stripeNotices.push(
      `old price ${priceId} is still active and needs archiving in Stripe (${errorMessage(err)})`,
    );
  }
}

async function syncVariantPrice(
  stripeProductId: string,
  variant: ProductVariant,
  stripeNotices: string[],
  label?: VariantLabel,
): Promise<{ priceId: string; archiveAfterSave: string | null }> {
  const stripe = getStripe();
  const unitAmount = Math.round(variant.price * 100);
  const variantName = variant.title || variant.sku || "Default";
  const nickname = label?.nickname ?? variantName;
  const metadata = label?.metadata ?? {
    supabase_variant_id: variant.id,
    variant_title: variantName,
  };

  let archiveAfterSave: string | null = null;
  const existingPriceId = stripePriceIdOf(variant);
  if (existingPriceId) {
    let existingPrice: Awaited<ReturnType<typeof stripe.prices.retrieve>> | null = null;
    try {
      existingPrice = await stripe.prices.retrieve(existingPriceId);
    } catch (err) {
      if (!isResourceMissing(err)) archiveAfterSave = existingPriceId;
    }

    if (existingPrice) {
      if (
        existingPrice.active &&
        existingPrice.unit_amount === unitAmount &&
        existingPrice.currency === variant.currency.toLowerCase() &&
        existingPrice.tax_behavior === STRIPE_TAX_BEHAVIOR
      ) {
        if (existingPrice.nickname !== nickname) {
          try {
            await stripe.prices.update(existingPriceId, { nickname, metadata });
          } catch (err) {
            stripeNotices.push(`couldn't rename price ${existingPriceId} (${errorMessage(err)})`);
          }
        }
        return { priceId: existingPriceId, archiveAfterSave: null };
      }
      if (existingPrice.active) await archivePrice(existingPriceId, stripeNotices);
    }
  }

  const price = await stripe.prices.create({
    product: stripeProductId,
    unit_amount: unitAmount,
    currency: variant.currency.toLowerCase(),
    tax_behavior: STRIPE_TAX_BEHAVIOR,
    nickname,
    metadata,
  });

  return { priceId: price.id, archiveAfterSave };
}
