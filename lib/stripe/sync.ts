import { getStripe } from "./client";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Product, ProductVariant } from "@/lib/types/ecommerce";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

/**
 * Sync a product to Stripe. Creates or updates the Stripe Product,
 * then creates/updates Stripe Prices for all variants.
 * Returns the updated product with stripe IDs populated.
 */
export async function syncProductToStripe(productId: string) {
  const stripe = getStripe();
  const admin = supabaseAdmin();

  // Load product with variants and images
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
    .slice(0, 8); // Stripe max 8 images

  let stripeProductId = product.stripe_product_id;

  if (stripeProductId) {
    // Update existing Stripe product
    await stripe.products.update(stripeProductId, {
      name: title,
      description: description || undefined,
      images: images.length ? images : undefined,
    });
  } else {
    // Create new Stripe product
    const stripeProduct = await stripe.products.create({
      name: title,
      description: description || undefined,
      images: images.length ? images : undefined,
      metadata: { supabase_product_id: productId },
    });
    stripeProductId = stripeProduct.id;

    // Save stripe_product_id
    await admin
      .from("products")
      .update({ stripe_product_id: stripeProductId })
      .eq("id", productId);
  }

  // Sync variant prices
  const variants = (product.product_variants ?? []) as ProductVariant[];
  const variantResults: { id: string; stripe_price_id: string }[] = [];

  for (const variant of variants) {
    const priceId = await syncVariantPrice(stripeProductId, variant);
    variantResults.push({ id: variant.id, stripe_price_id: priceId });

    // Save stripe_price_id on variant
    await admin
      .from("product_variants")
      .update({ stripe_price_id: priceId })
      .eq("id", variant.id);
  }

  return { stripe_product_id: stripeProductId, variants: variantResults };
}

/**
 * Create a new Stripe Price for a variant.
 * Stripe Prices are immutable — if price changes, we create a new one and archive the old.
 */
async function syncVariantPrice(stripeProductId: string, variant: ProductVariant): Promise<string> {
  const stripe = getStripe();
  const unitAmount = Math.round(variant.price * 100); // Convert to cents

  // If variant already has a stripe_price_id, check if price matches
  if (variant.stripe_price_id) {
    try {
      const existingPrice = await stripe.prices.retrieve(variant.stripe_price_id);
      if (
        existingPrice.unit_amount === unitAmount &&
        existingPrice.currency === variant.currency.toLowerCase()
      ) {
        return variant.stripe_price_id; // Price unchanged, reuse
      }
      // Price changed — archive old price
      await stripe.prices.update(variant.stripe_price_id, { active: false });
    } catch {
      // Price not found, create new
    }
  }

  // Create new price
  const variantName = variant.title || variant.sku || "Default";
  const price = await stripe.prices.create({
    product: stripeProductId,
    unit_amount: unitAmount,
    currency: variant.currency.toLowerCase(),
    metadata: {
      supabase_variant_id: variant.id,
      variant_title: variantName,
    },
  });

  return price.id;
}

/**
 * Create a Stripe Payment Link for a product's default (first) variant.
 */
export async function createPaymentLink(productId: string) {
  const stripe = getStripe();
  const admin = supabaseAdmin();

  // Get product with first variant
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
  if (!defaultVariant.stripe_price_id) {
    throw new Error("Default variant has no Stripe Price ID. Sync to Stripe first.");
  }

  // Deactivate old payment link if exists
  if (product.stripe_payment_link_id) {
    try {
      await stripe.paymentLinks.update(product.stripe_payment_link_id, { active: false });
    } catch {
      // Ignore if already inactive
    }
  }

  // Create new payment link
  const paymentLink = await stripe.paymentLinks.create({
    line_items: [{ price: defaultVariant.stripe_price_id, quantity: 1 }],
    metadata: { supabase_product_id: productId },
  });

  // Save to DB
  await admin
    .from("products")
    .update({
      stripe_payment_link: paymentLink.url,
      stripe_payment_link_id: paymentLink.id,
    })
    .eq("id", productId);

  return { url: paymentLink.url, id: paymentLink.id };
}

/**
 * Deactivate a Stripe Payment Link.
 */
export async function deactivatePaymentLink(paymentLinkId: string) {
  const stripe = getStripe();
  await stripe.paymentLinks.update(paymentLinkId, { active: false });
}
