import { getStripe } from "./client";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { ProductVariant } from "@/lib/types/ecommerce";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { loadVariantLabels, withPricingBlock, type VariantLabel } from "./variant-labels";
import {
  hasPaymentLinkColumns,
  stripePaymentLinkColumns,
  stripePaymentLinkIdOf,
  stripePriceIdColumn,
  stripePriceIdOf,
  stripeProductIdColumn,
  stripeProductIdOf,
  type PaymentLinkRow,
} from "./mode";

const STRIPE_TAX_CODE = process.env.STRIPE_TAX_CODE || "txcd_33080301";

const STRIPE_TAX_BEHAVIOR: "exclusive" | "inclusive" = "exclusive";

function isResourceMissing(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "resource_missing";
}

export type StripeSyncResult = {
  stripeProductId: string;
  variants: { id: string; stripePriceId: string }[];
  notices: string[];
  paymentLinkCleared: boolean;
};

export type StripeSyncOutcome = {
  synced: boolean;
  error?: string;
  pricesInPlace: boolean;
  notices: string[];
  paymentLinkCleared: boolean;
  result?: StripeSyncResult;
};

export class StripeNeedsAttentionError extends Error {
  readonly notices: string[];
  readonly paymentLinkCleared: boolean;

  constructor(attention: string[], notices: string[], paymentLinkCleared: boolean) {
    super(`The new prices are in place, but Stripe needs attention: ${attention.join("; ")}`);
    this.name = "StripeNeedsAttentionError";
    this.notices = notices;
    this.paymentLinkCleared = paymentLinkCleared;
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

  const priceIdOfVariant = new Map(variantResults.map((v) => [v.id, v.stripePriceId]));
  const currentPriceIds = new Set(
    variants
      .filter((v) => v.is_active)
      .map((v) => priceIdOfVariant.get(v.id))
      .filter((id): id is string => Boolean(id)),
  );
  const notices: string[] = [];
  const paymentLinkCleared = await retireStalePaymentLink(
    productId,
    stripePaymentLinkIdOf(product),
    { currentPriceIds, stripeNotices, notices },
    true,
  );

  if (stripeNotices.length) {
    throw new StripeNeedsAttentionError(stripeNotices, notices, paymentLinkCleared);
  }

  return { stripeProductId, variants: variantResults, notices, paymentLinkCleared };
}

type LinkCheck = {
  currentPriceIds: Set<string>;
  stripeNotices: string[];
  notices: string[];
};

async function retireStalePaymentLink(
  productId: string,
  linkId: string | null,
  check: LinkCheck,
  mayFollowNewerLink: boolean,
): Promise<boolean> {
  if (!linkId) return false;
  const { currentPriceIds, stripeNotices } = check;

  let linePriceIds: (string | null)[];
  try {
    const lines = await getStripe().paymentLinks.listLineItems(linkId, { limit: 100 });
    linePriceIds = lines.data.map((line) => line.price?.id ?? null);
  } catch (err) {
    if (!isResourceMissing(err)) {
      stripeNotices.push(`couldn't check Stripe payment link ${linkId} (${errorMessage(err)})`);
      return false;
    }
    return clearPaymentLink(productId, linkId, check, mayFollowNewerLink, {
      done: `Stripe payment link ${linkId} is not in this Stripe account, so it was removed from the product; generate a new one if you need it`,
      stuck: `Stripe payment link ${linkId} is not in this Stripe account, but couldn't be removed from the product`,
    });
  }

  if (linePriceIds.every((id) => id !== null && currentPriceIds.has(id))) return false;

  try {
    await deactivatePaymentLink(linkId);
  } catch (err) {
    stripeNotices.push(
      `Stripe payment link ${linkId} still sells at a price this product no longer has and needs deactivating in Stripe (${errorMessage(err)})`,
    );
    return false;
  }
  return clearPaymentLink(productId, linkId, check, mayFollowNewerLink, {
    done: `Stripe payment link ${linkId} sold at a price this product no longer has, so it was deactivated; generate a new one`,
    stuck: `Stripe payment link ${linkId} was deactivated because it sold at a price this product no longer has, but the product still shows it`,
    deactivated: `Stripe payment link ${linkId} sold at a price this product no longer has, so it was deactivated`,
  });
}

async function clearPaymentLink(
  productId: string,
  linkId: string,
  check: LinkCheck,
  mayFollowNewerLink: boolean,
  say: { done: string; stuck: string; deactivated?: string },
): Promise<boolean> {
  const { stripeNotices, notices } = check;
  const column = stripePaymentLinkColumns();
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("products")
    .update({ [column.url]: null, [column.id]: null })
    .eq("id", productId)
    .eq(column.id, linkId)
    .select("id");
  if (error) {
    stripeNotices.push(`${say.stuck} (${error.message})`);
    return false;
  }
  if (data?.length) {
    notices.push(say.done);
    return true;
  }

  const { data: row, error: readError } = await admin
    .from("products")
    .select(column.id)
    .eq("id", productId)
    .single();
  if (readError) {
    stripeNotices.push(
      `couldn't read back the product's Stripe payment link after checking ${linkId} (${readError.message})`,
    );
    return false;
  }
  const nowLinkId = stripePaymentLinkIdOf(row as PaymentLinkRow | null);
  if (!nowLinkId) {
    notices.push(`${say.deactivated ?? `Stripe payment link ${linkId} is gone`}; it was already removed from the product`);
    return true;
  }
  if (say.deactivated) notices.push(`${say.deactivated}; the product now shows Stripe payment link ${nowLinkId}`);
  if (!mayFollowNewerLink) return false;
  return retireStalePaymentLink(productId, nowLinkId, check, false);
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
      paymentLinkCleared: result.paymentLinkCleared,
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
        paymentLinkCleared: err.paymentLinkCleared,
      };
    }
    return { synced: false, error, pricesInPlace: false, notices: [], paymentLinkCleared: false };
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

export async function createPaymentLink(productId: string) {
  const stripe = getStripe();
  const admin = supabaseAdmin();

  const { data: product } = await admin
    .from("products")
    .select("*, product_variants(*)")
    .eq("id", productId)
    .single();

  if (!product) throw new Error("Product not found");
  if (!hasPaymentLinkColumns(product)) {
    throw new Error(
      "This database has no payment link columns for Stripe test mode yet. Apply supabase/migrations/20261122094459_stripe_payment_link_per_mode.sql first.",
    );
  }

  const variants = ((product.product_variants ?? []) as ProductVariant[])
    .filter((v) => v.is_active)
    .sort((a, b) => a.position - b.position);

  if (!variants.length) throw new Error("Product has no active variants");

  const defaultVariant = variants[0];
  const defaultPriceId = stripePriceIdOf(defaultVariant);
  if (!defaultPriceId) {
    throw new Error("Default variant has no Stripe Price ID. Sync to Stripe first.");
  }

  await refuseOutOfDatePrice(defaultPriceId, defaultVariant);

  const oldLinkId = stripePaymentLinkIdOf(product);
  if (oldLinkId) await deactivatePaymentLink(oldLinkId);

  const paymentLink = await stripe.paymentLinks.create({
    line_items: [{ price: defaultPriceId, quantity: 1 }],
    metadata: { supabase_product_id: productId },
  });

  const column = stripePaymentLinkColumns();
  const { error } = await admin
    .from("products")
    .update({ [column.url]: paymentLink.url, [column.id]: paymentLink.id })
    .eq("id", productId);
  if (error) {
    throw new Error(
      `Created Stripe payment link ${paymentLink.id} but couldn't save it: ${error.message}`,
    );
  }

  return { url: paymentLink.url, id: paymentLink.id };
}

async function refuseOutOfDatePrice(priceId: string, variant: ProductVariant) {
  const syncFirst = `The default variant's Stripe price ${priceId} is out of date. Sync to Stripe first.`;
  let price: Awaited<ReturnType<ReturnType<typeof getStripe>["prices"]["retrieve"]>>;
  try {
    price = await getStripe().prices.retrieve(priceId);
  } catch (err) {
    if (isResourceMissing(err)) throw new Error(syncFirst);
    throw err;
  }
  if (
    !price.active ||
    price.unit_amount !== Math.round(variant.price * 100) ||
    price.currency !== variant.currency.toLowerCase()
  ) {
    throw new Error(syncFirst);
  }
}

async function deactivatePaymentLink(paymentLinkId: string) {
  const stripe = getStripe();
  try {
    await stripe.paymentLinks.update(paymentLinkId, { active: false });
  } catch (err) {
    if (isResourceMissing(err)) return;
    const link = await stripe.paymentLinks.retrieve(paymentLinkId).catch(() => null);
    if (link?.active === false) return;
    throw err;
  }
}
