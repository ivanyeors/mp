export type FeedVariant = {
  id: string;
  sku: string | null;
  title: string | null;
  option1: string | null;
  price: number;
  compare_at_price: number | null;
  currency: string;
  track_inventory: boolean;
  image_url: string | null;
  is_active: boolean;
  position: number;
  stock_available?: number;
};

export type FeedProduct = {
  id: string;
  slug: string;
  product_type: string;
  status: string;
  title: string;
  description: string;
  categoryName?: string | null;
  images: { url: string; variant_id: string | null; position: number }[];
  variants: FeedVariant[];
};

export type FeedItem = {
  id: string;
  item_group_id: string;
  title: string;
  description: string;
  link: string;
  image_link: string;
  additional_image_link: string;
  availability: "in_stock" | "out_of_stock";
  price: string;
  sale_price: string;
  brand: string;
  condition: "new";
  identifier_exists: "no";
  product_type: string;
  size: string;
};

export const FEED_COLUMNS: (keyof FeedItem)[] = [
  "id",
  "item_group_id",
  "title",
  "description",
  "link",
  "image_link",
  "additional_image_link",
  "availability",
  "price",
  "sale_price",
  "brand",
  "condition",
  "identifier_exists",
  "product_type",
  "size",
];

const TYPE_LABELS: Record<string, string> = {
  pillow: "Custom pillows",
  bolster: "Custom bolsters",
  accessory: "Pillow accessories",
  bundle: "Bundles",
};

export function plainText(s: string, max: number): string {
  const t = s
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*_`>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

const money = (n: number, currency: string) => `${n.toFixed(2)} ${currency.toUpperCase()}`;

export function variantAvailable(v: FeedVariant): boolean {
  return !v.track_inventory || (v.stock_available ?? 0) > 0;
}

export type FeedSkip = { productSlug: string; variantId?: string; reason: string };

export function buildFeedItems(
  products: FeedProduct[],
  opts: { productUrl: (slug: string) => string; brand?: string },
): { items: FeedItem[]; skipped: FeedSkip[] } {
  const items: FeedItem[] = [];
  const skipped: FeedSkip[] = [];

  for (const p of products) {
    if (p.status !== "active") continue;
    const variants = p.variants.filter((v) => v.is_active).sort((a, b) => a.position - b.position);
    if (!variants.length) {
      skipped.push({ productSlug: p.slug, reason: "no active variants" });
      continue;
    }
    const images = [...p.images].sort((a, b) => a.position - b.position);
    const description = plainText(p.description || p.title, 5000);

    for (const v of variants) {
      if (!(v.price > 0)) {
        skipped.push({ productSlug: p.slug, variantId: v.id, reason: "no price" });
        continue;
      }
      const image = v.image_url || images.find((i) => i.variant_id === v.id)?.url || images[0]?.url;
      if (!image) {
        skipped.push({ productSlug: p.slug, variantId: v.id, reason: "no image" });
        continue;
      }
      const variantLabel = v.title && v.title.toLowerCase() !== "default title" ? v.title : null;
      const onSale = v.compare_at_price !== null && v.compare_at_price > v.price;
      items.push({
        id: v.sku?.trim() || v.id,
        item_group_id: p.id,
        title: plainText(variantLabel && variants.length > 1 ? `${p.title} – ${variantLabel}` : p.title, 150),
        description,
        link: `${opts.productUrl(p.slug)}?variant=${encodeURIComponent(v.id)}`,
        image_link: image,
        additional_image_link: images
          .map((i) => i.url)
          .filter((u) => u !== image)
          .slice(0, 10)
          .join(","),
        availability: variantAvailable(v) ? "in_stock" : "out_of_stock",
        price: money(onSale ? v.compare_at_price! : v.price, v.currency),
        sale_price: onSale ? money(v.price, v.currency) : "",
        brand: opts.brand ?? "Mpillow",
        condition: "new",
        identifier_exists: "no",
        product_type: [TYPE_LABELS[p.product_type] ?? p.product_type, p.categoryName].filter(Boolean).join(" > "),
        size: plainText(v.option1 ?? variantLabel ?? "", 100),
      });
    }
  }
  return { items, skipped };
}

export function toTsv(items: FeedItem[]): string {
  const cell = (s: string) => s.replace(/[\t\r\n]+/g, " ");
  return [FEED_COLUMNS.join("\t"), ...items.map((i) => FEED_COLUMNS.map((c) => cell(i[c])).join("\t"))].join("\n") + "\n";
}
