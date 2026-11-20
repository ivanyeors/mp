import { getStripe } from "./client";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { ProductVariant } from "@/lib/types/ecommerce";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { loadVariantLabels, withPricingBlock, type VariantLabel } from "./variant-labels";
import {
  stripePriceIdColumn,
  stripePriceIdOf,
  stripeProductIdColumn,
  stripeProductIdOf,
} from "./mode";

const STRIPE_TAX_CODE = process.env.STRIPE_TAX_CODE || "txcd_33080301";

const STRIPE_TAX_BEHAVIOR: "exclusive" | "inclusive" = "exclusive";

export async function syncProductToStripe(productId: string) {
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
      if ((err as { code?: string }).code !== "resource_missing") throw err;
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

  for (const variant of variants) {
    const priceId = await syncVariantPrice(stripeProductId, variant, labels.get(variant.id));
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
  }

  return { stripeProductId, variants: variantResults };
}

// ponytail: best-effort + synchronous. Ceiling: if Stripe is down the DB edit still saves but
// `stripe_price_id` stays stale until the next edit or a manual "Sync to Stripe". Upgrade path:
// enqueue a background retry.
export async function syncProductToStripeSafe(
  productId: string
): Promise<{
  synced: boolean;
  error?: string;
  result?: Awaited<ReturnType<typeof syncProductToStripe>>;
}> {
  try {
    const result = await syncProductToStripe(productId);
    return { synced: true, result };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Stripe sync failed";
    console.error(`[stripe/auto-sync] product ${productId}:`, error);
    return { synced: false, error };
  }
}

async function syncVariantPrice(
  stripeProductId: string,
  variant: ProductVariant,
  label?: VariantLabel,
): Promise<string> {
  const stripe = getStripe();
  const unitAmount = Math.round(variant.price * 100);
  const variantName = variant.title || variant.sku || "Default";
  const nickname = label?.nickname ?? variantName;
  const metadata = label?.metadata ?? {
    supabase_variant_id: variant.id,
    variant_title: variantName,
  };

  const existingPriceId = stripePriceIdOf(variant);
  if (existingPriceId) {
    try {
      const existingPrice = await stripe.prices.retrieve(existingPriceId);
      if (
        existingPrice.unit_amount === unitAmount &&
        existingPrice.currency === variant.currency.toLowerCase() &&
        existingPrice.tax_behavior === STRIPE_TAX_BEHAVIOR
      ) {
        if (existingPrice.nickname !== nickname) {
          await stripe.prices.update(existingPriceId, { nickname, metadata });
        }
        return existingPriceId;
      }
      await stripe.prices.update(existingPriceId, { active: false });
    } catch {}
  }

  const price = await stripe.prices.create({
    product: stripeProductId,
    unit_amount: unitAmount,
    currency: variant.currency.toLowerCase(),
    tax_behavior: STRIPE_TAX_BEHAVIOR,
    nickname,
    metadata,
  });

  return price.id;
}

export async function createPaymentLink(productId: string) {
  const stripe = getStripe();
  const admin = supabaseAdmin();

  const { data: product } = await admin
    .from("products")
    .select("*, product_variants(*)")
    .eq("id", productId)
    .single();

  if (!product) throw new Error("Product not found");

  const variants = ((product.product_variants ?? []) as ProductVariant[])
    .filter((v) => v.is_active)
    .sort((a, b) => a.position - b.position);

  if (!variants.length) throw new Error("Product has no active variants");

  const defaultVariant = variants[0];
  const defaultPriceId = stripePriceIdOf(defaultVariant);
  if (!defaultPriceId) {
    throw new Error("Default variant has no Stripe Price ID. Sync to Stripe first.");
  }

  if (product.stripe_payment_link_id) {
    try {
      await stripe.paymentLinks.update(product.stripe_payment_link_id, { active: false });
    } catch {}
  }

  const paymentLink = await stripe.paymentLinks.create({
    line_items: [{ price: defaultPriceId, quantity: 1 }],
    metadata: { supabase_product_id: productId },
  });

  await admin
    .from("products")
    .update({
      stripe_payment_link: paymentLink.url,
      stripe_payment_link_id: paymentLink.id,
    })
    .eq("id", productId);

  return { url: paymentLink.url, id: paymentLink.id };
}

export async function deactivatePaymentLink(paymentLinkId: string) {
  const stripe = getStripe();
  await stripe.paymentLinks.update(paymentLinkId, { active: false });
}
