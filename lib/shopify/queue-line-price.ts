/** Costings MSRP for a Shopify sales-queue line (product/part). */

export type QueueLinePriceKind = "pillow" | "bolster" | "part";

export function detectPremiumVariantFromTitle(title: string | null | undefined): "linen" | "fibrecool" {
  return String(title || "").toLowerCase().includes("fibrecool") ? "fibrecool" : "linen";
}

function parseMsrp(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const num = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(num) && num >= 0 ? num : null;
}

export function resolveShopifyQueueLineMsrp(args: {
  kind: QueueLinePriceKind;
  pillowSize: string | null;
  pillowKind: "basic" | "premium" | null;
  bolsterVariant: string | null;
  itemId: number | null;
  variantTitle: string | null;
  /** From selected BOM template; wins over title heuristic for premium UX. */
  templatePillowVariant: "linen" | "fibrecool" | null;
  pillowProductIdByKindSize: Map<string, number> | Record<string, number>;
  productMsrpByKey: Map<string, number | string | null> | Record<string, number | string | null>;
  itemMsrpById: Map<number, number | string | null> | Record<number, number | string | null>;
}): number | null {
  const getProduct = (key: string) => {
    const m = args.productMsrpByKey;
    return parseMsrp(m instanceof Map ? m.get(key) : m[key]);
  };
  const getItem = (id: number) => {
    const m = args.itemMsrpById;
    return parseMsrp(m instanceof Map ? m.get(id) : m[id]);
  };
  const getPillowId = (key: string) => {
    const m = args.pillowProductIdByKindSize;
    const v = m instanceof Map ? m.get(key) : m[key];
    return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
  };

  if (args.kind === "part" && args.itemId) return getItem(args.itemId);

  if (args.kind === "bolster" && args.bolsterVariant) {
    return getProduct(`product:bolster:${args.bolsterVariant}`);
  }

  if (args.kind === "pillow" && args.pillowSize) {
    const pk = args.pillowKind ?? "basic";
    const pillowProductId = getPillowId(`${pk}:${args.pillowSize}`);
    if (!pillowProductId) return null;
    if (pk === "premium") {
      const premiumVariant =
        args.templatePillowVariant ?? detectPremiumVariantFromTitle(args.variantTitle);
      return (
        getProduct(`product:pillow:${pillowProductId}:${premiumVariant}`) ??
        getProduct(`product:pillow:${pillowProductId}`)
      );
    }
    return getProduct(`product:pillow:${pillowProductId}`);
  }

  return null;
}
