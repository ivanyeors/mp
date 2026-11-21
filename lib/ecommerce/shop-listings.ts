import { supabaseAdmin } from "@/lib/supabase/server";
import { repriceFromCostings } from "@/lib/shop/price-sync";
import type { StripeWarning } from "@/lib/shop/stripe-warnings";
import {
  CUSTOM_COMPOSED_PRODUCT_TYPES,
  isListedShopProduct,
} from "@/lib/ecommerce/products";
import { addSizesToProduct, publishAccessoryFamily, type AccessoryFamilyItem } from "./from-inventory";
import {
  SHOP_LISTABLE_ITEM_CATEGORIES,
  checkPushPrices,
  compareFamilies,
  familyKey,
  familyPushState,
  familyTitle,
  isShopListableCategory,
  listingBlocker,
  mainProductId,
  sizeSortKey,
  sizesToPush,
  toCents,
  type ConfirmedPrice,
  type FamilySize,
  type InventoryFamily,
  type PriceCheckFailure,
  type ShopProductListing,
} from "./inventory-families";

export {
  SHOP_LISTABLE_ITEM_CATEGORIES,
  compareFamilies,
  familyKey,
  familyTitle,
  type InventoryFamily,
  type ShopProductListing,
};

type ItemRow = { id: number; name: string; category: string; size: string | null };

type ProductStatus = "draft" | "active" | "archived";

async function loadFamilySizes(items: ItemRow[]): Promise<{
  sizes: Map<number, FamilySize>;
  products: Map<string, { slug: string; status: ProductStatus }>;
}> {
  const admin = supabaseAdmin();
  const ids = items.map((i) => i.id);

  const [{ data: prices }, { data: variants }] = await Promise.all([
    admin.from("item_prices").select("item_id, cost_price, msrp").in("item_id", ids),
    admin.from("product_variants").select("item_id, product_id").in("item_id", ids),
  ]);

  const priceByItem = new Map(
    ((prices ?? []) as Array<{ item_id: number; cost_price: string | number | null; msrp: string | number | null }>).map(
      (p) => [p.item_id, { costCents: toCents(p.cost_price), msrpCents: toCents(p.msrp) }],
    ),
  );
  const productByItem = new Map(
    ((variants ?? []) as Array<{ item_id: number; product_id: string }>).map((v) => [v.item_id, v.product_id]),
  );

  const productIds = [...new Set(productByItem.values())];
  const products = new Map<string, { slug: string; status: ProductStatus }>();
  if (productIds.length > 0) {
    const { data } = await admin.from("products").select("id, slug, status").in("id", productIds);
    for (const p of (data ?? []) as Array<{ id: string; slug: string; status: ProductStatus }>) {
      products.set(p.id, { slug: p.slug, status: p.status });
    }
  }

  const sizes = new Map<number, FamilySize>();
  for (const item of items) {
    const price = priceByItem.get(item.id);
    const productId = productByItem.get(item.id) ?? null;
    sizes.set(item.id, {
      itemId: item.id,
      size: item.size,
      costCents: price?.costCents ?? null,
      msrpCents: price?.msrpCents ?? null,
      productId: productId && products.has(productId) ? productId : null,
    });
  }
  return { sizes, products };
}

function toFamilies(
  items: ItemRow[],
  sizes: Map<number, FamilySize>,
  products: Map<string, { slug: string; status: ProductStatus }>,
): InventoryFamily[] {
  const byKey = new Map<string, { category: string; name: string; sizes: FamilySize[] }>();
  for (const item of items) {
    const key = familyKey(item.category, item.name);
    const family = byKey.get(key) ?? { category: item.category, name: item.name, sizes: [] };
    family.sizes.push(sizes.get(item.id)!);
    byKey.set(key, family);
  }

  return [...byKey.entries()]
    .map(([key, f]): InventoryFamily => {
      const sorted = [...f.sizes].sort((a, b) => sizeSortKey(a.size) - sizeSortKey(b.size));
      const productId = mainProductId(sorted);
      const product = productId ? products.get(productId) : undefined;
      return {
        key,
        category: f.category,
        name: f.name,
        title: familyTitle(f.category, f.name),
        sizes: sorted,
        push: familyPushState(sorted),
        productId,
        productSlug: product?.slug ?? null,
        productStatus: product?.status ?? null,
      };
    })
    .sort(compareFamilies);
}

export async function listInventoryFamilies(): Promise<InventoryFamily[]> {
  const { data } = await supabaseAdmin()
    .from("items")
    .select("id, name, category, size")
    .eq("is_active", true)
    .in("category", SHOP_LISTABLE_ITEM_CATEGORIES as unknown as string[]);

  const items = (data ?? []) as ItemRow[];
  if (items.length === 0) return [];
  const { sizes, products } = await loadFamilySizes(items);
  return toFamilies(items, sizes, products);
}

export type PushResult =
  | {
      ok: true;
      productId: string;
      slug: string;
      title: string;
      created: boolean;
      added: number;
      productStatus: ProductStatus;
      stripeWarnings: StripeWarning[];
    }
  | { ok: false; error: string; status: number; reason?: PriceCheckFailure["reason"] };

export async function pushFamilyToProducts(
  itemIds: number[],
  confirmed: ConfirmedPrice[],
): Promise<PushResult> {
  if (itemIds.length === 0) return { ok: false, error: "No items given", status: 400 };
  const admin = supabaseAdmin();

  const { data: first } = await admin
    .from("items")
    .select("id, name, category, size")
    .eq("id", itemIds[0]!)
    .eq("is_active", true)
    .maybeSingle();
  if (!first) {
    return { ok: false, error: "This item was removed from Inventory. Reload and try again.", status: 404 };
  }
  const { category, name } = first as ItemRow;
  if (!isShopListableCategory(category)) {
    return { ok: false, error: "Fillings, packaging and other build parts are not sold on their own.", status: 400 };
  }

  const { data: familyRows } = await admin
    .from("items")
    .select("id, name, category, size")
    .eq("is_active", true)
    .eq("category", category)
    .eq("name", name);
  const items = (familyRows ?? []) as ItemRow[];
  const inFamily = new Set(items.map((i) => i.id));
  if (itemIds.some((id) => !inFamily.has(id))) {
    return { ok: false, error: "Those items are not one family. Reload and try again.", status: 400 };
  }

  const { sizes, products } = await loadFamilySizes(items);
  const family = toFamilies(items, sizes, products)[0]!;
  const toPush = sizesToPush(family.sizes);

  const failure = checkPushPrices(category, toPush, confirmed);
  if (failure) {
    return {
      ok: false,
      error: failure.message,
      status: failure.reason === "changed" || failure.reason === "nothing_to_push" ? 409 : 400,
      reason: failure.reason,
    };
  }

  const pushIds = new Set(toPush.map((s) => s.itemId));
  const pushing: AccessoryFamilyItem[] = items
    .filter((i) => pushIds.has(i.id))
    .map((i) => ({ id: i.id, name: i.name, size: i.size, category: i.category }));

  if (!family.productId) {
    const result = await publishAccessoryFamily(pushing, family.title, { status: "draft" });
    if (!result.ok) return result;
    return {
      ok: true,
      productId: result.productId,
      slug: result.slug,
      title: family.title,
      created: true,
      added: result.variantIds.length,
      productStatus: "draft",
      stripeWarnings: result.stripeWarnings,
    };
  }

  const result = await addSizesToProduct(family.productId, pushing);
  if (!result.ok) return result;
  return {
    ok: true,
    productId: result.productId,
    slug: result.slug,
    title: family.title,
    created: false,
    added: result.variantIds.length,
    productStatus: family.productStatus ?? "draft",
    stripeWarnings: result.stripeWarnings,
  };
}

type ProductRow = {
  id: string;
  slug: string;
  status: ProductStatus;
  product_type: string;
  is_auto_generated: boolean | null;
  category_id: string | null;
  published_at: string | null;
  content: Record<string, { title?: string }> | null;
  product_variants: Array<{ id: string; price: number | string | null; is_active: boolean }> | null;
  product_images: Array<{ url: string; position: number | null }> | null;
};

function productTitle(row: Pick<ProductRow, "content" | "slug">): string {
  const content = row.content ?? {};
  return content["en-US"]?.title ?? content["en"]?.title ?? Object.values(content)[0]?.title ?? row.slug;
}

const PRODUCT_SELECT =
  "id, slug, status, product_type, is_auto_generated, category_id, published_at, content, product_variants(id, price, is_active), product_images(url, position)";

export async function listShopProducts(): Promise<ShopProductListing[]> {
  const admin = supabaseAdmin();
  const [{ data, error }, { data: categories }] = await Promise.all([
    admin
      .from("products")
      .select(PRODUCT_SELECT)
      .in("status", ["draft", "active"])
      .not("product_type", "in", `(${CUSTOM_COMPOSED_PRODUCT_TYPES.join(",")})`),
    admin.from("categories").select("id, slug, content"),
  ]);
  if (error) throw new Error(error.message);

  type CategoryRow = { id: string; slug: string; content: Record<string, { name?: string }> | null };
  const categoryName = new Map(
    ((categories ?? []) as CategoryRow[]).map((c) => [
      c.id,
      c.content?.["en-US"]?.name ?? c.content?.["en"]?.name ?? c.slug,
    ]),
  );

  return ((data ?? []) as ProductRow[])
    .map((row): ShopProductListing => {
      const variants = row.product_variants ?? [];
      const selling = variants.some((v) => v.is_active) ? variants.filter((v) => v.is_active) : variants;
      const prices = selling.map((v) => toCents(v.price)).filter((c): c is number => c != null && c > 0);
      const images = [...(row.product_images ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      return {
        id: row.id,
        slug: row.slug,
        title: productTitle(row),
        productType: row.product_type,
        status: row.status === "active" ? "active" : "draft",
        isAutoGenerated: Boolean(row.is_auto_generated),
        listed: isListedShopProduct({ ...row, product_variants: variants }),
        categoryName: row.category_id ? categoryName.get(row.category_id) ?? null : null,
        thumbnailUrl: images[0]?.url ?? null,
        variantCount: selling.length,
        priceMinCents: prices.length ? Math.min(...prices) : null,
        priceMaxCents: prices.length ? Math.max(...prices) : null,
        blocker: listingBlocker({ isAutoGenerated: Boolean(row.is_auto_generated), variants }),
      };
    })
    .sort(
      (a, b) =>
        (a.categoryName ?? "￿").localeCompare(b.categoryName ?? "￿") || a.title.localeCompare(b.title),
    );
}

export type SetListedResult =
  | { ok: true; listed: boolean; title: string; stripeWarnings: StripeWarning[] }
  | { ok: false; error: string; status: number; stripeWarnings?: StripeWarning[] };

export async function setProductListed(productId: string, listed: boolean): Promise<SetListedResult> {
  const admin = supabaseAdmin();
  const load = async () =>
    (await admin.from("products").select(PRODUCT_SELECT).eq("id", productId).maybeSingle()).data as ProductRow | null;

  let product = await load();
  if (!product) return { ok: false, error: "Product not found", status: 404 };
  const title = productTitle(product);

  if ((CUSTOM_COMPOSED_PRODUCT_TYPES as readonly string[]).includes(product.product_type)) {
    return { ok: false, error: "Pillows and bolsters are sold through the configurator.", status: 400 };
  }
  if (product.status === "archived") {
    return { ok: false, error: "This product is archived. Restore it in the product editor first.", status: 409 };
  }

  if (!listed) {
    if (product.status !== "draft") {
      const { error } = await admin.from("products").update({ status: "draft" }).eq("id", productId);
      if (error) return { ok: false, error: error.message, status: 500 };
    }
    return { ok: true, listed: false, title, stripeWarnings: [] };
  }

  let stripeWarnings: StripeWarning[] = [];
  if (product.is_auto_generated) {
    stripeWarnings = await repriceFromCostings({ id: productId, name: title });
    product = (await load()) ?? product;
  }

  const variants = product.product_variants ?? [];
  const blocker = listingBlocker({ isAutoGenerated: Boolean(product.is_auto_generated), variants });
  if (blocker) return { ok: false, error: blocker, status: 400, stripeWarnings };

  if (!variants.some((v) => v.is_active)) {
    const { error } = await admin.from("product_variants").update({ is_active: true }).eq("product_id", productId);
    if (error) return { ok: false, error: error.message, status: 500, stripeWarnings };
  }

  const update: Record<string, unknown> = { status: "active" };
  if (!product.published_at) update.published_at = new Date().toISOString();
  const { error } = await admin.from("products").update(update).eq("id", productId);
  if (error) return { ok: false, error: error.message, status: 500, stripeWarnings };

  return { ok: true, listed: true, title, stripeWarnings };
}
