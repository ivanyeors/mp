import { supabaseAdmin } from "@/lib/supabase/server";
import { selectAll, selectAllIn } from "@/lib/supabase/select-all";
import { sgMonthRange, type SgMonthRange } from "./sg-calendar";
import { buildSalesReport, latestChargeAt, type SalesReport, type SoldLine, type SoldOrder } from "./sold-lines";

type AdminClient = ReturnType<typeof supabaseAdmin>;

function money(n: unknown): number {
  const v = typeof n === "number" ? n : Number.parseFloat(String(n ?? ""));
  return Number.isFinite(v) ? v : 0;
}

function moneyOrNull(n: unknown): number | null {
  if (n == null || n === "") return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

const LENGTHS = new Set(["short", "medium", "long"]);

function lengthLabel(length: string): string {
  return length.charAt(0).toUpperCase() + length.slice(1);
}

function itemLabel(item: { name: string | null; size: string | null } | undefined, fallback: string): string {
  if (!item?.name) return fallback;
  return item.size ? `${item.name} (${item.size})` : item.name;
}

type ItemRow = { id: number; name: string | null; size: string | null; category: string | null };

async function loadItems(admin: AdminClient, ids: number[]): Promise<Map<number, ItemRow>> {
  const rows = await selectAllIn(ids, (chunk) =>
    admin.from("items").select("id,name,size,category").in("id", chunk).order("id"),
  );
  return new Map((rows as ItemRow[]).map((r) => [Number(r.id), r]));
}

type PlatformItemRow = {
  id: string;
  order_id: string;
  variant_id: string | null;
  kind: string | null;
  service_key: string | null;
  product_title: string | null;
  quantity: number;
  total_price: number | string | null;
  unit_cost: number | string | null;
  total_cost: number | string | null;
  returned_quantity: number | null;
  snap_type: string | null;
  snap_result: string | null;
  snap_size: string | null;
  snap_tier: string | null;
  snap_length: string | null;
  snap_bolster: string | null;
};

type VariantRow = {
  id: string;
  item_id: number | null;
  pillow_product_id: number | null;
  option1: string | null;
  products: { product_type: string | null } | { product_type: string | null }[] | null;
};

type ChargeRow = { id: string; order_id: string; occurred_at: string };

const stripeCharges = (admin: AdminClient) =>
  admin
    .from("order_payments")
    .select("id,order_id,occurred_at")
    .eq("type", "charge")
    .not("stripe_object_id", "is", null);

async function loadSoldOrders(admin: AdminClient, range: SgMonthRange): Promise<SoldOrder[]> {
  const inPeriod = (await selectAll(() =>
    stripeCharges(admin)
      .gte("occurred_at", range.from.toISOString())
      .lt("occurred_at", range.toExclusive.toISOString())
      .order("id"),
  )) as ChargeRow[];
  if (!inPeriod.length) return [];
  const charges = (await selectAllIn(
    inPeriod.map((c) => String(c.order_id)),
    (chunk) => stripeCharges(admin).in("order_id", chunk).order("id"),
  )) as ChargeRow[];
  const soldAtByOrder = latestChargeAt(charges.map((c) => ({ orderId: String(c.order_id), at: c.occurred_at })));
  const from = range.from.getTime();
  const to = range.toExclusive.getTime();
  const candidates = [...soldAtByOrder.entries()]
    .filter(([, at]) => {
      const t = Date.parse(at);
      return t >= from && t < to;
    })
    .map(([id]) => id);
  if (!candidates.length) return [];

  const orders = (await selectAllIn(candidates, (chunk) =>
    admin.from("orders").select("id").not("paid_at", "is", null).in("id", chunk).order("id"),
  )) as Array<{ id: string }>;
  if (!orders.length) return [];
  const ids = orders.map((o) => String(o.id));

  const [margins, items] = await Promise.all([
    selectAllIn(ids, (chunk) =>
      admin.from("order_margins").select("order_id,cogs,gross_margin").in("order_id", chunk).order("order_id"),
    ) as Promise<Array<{ order_id: string; cogs: unknown; gross_margin: unknown }>>,
    selectAllIn(ids, (chunk) =>
      admin
        .from("order_items")
        .select(
          "id,order_id,variant_id,kind,service_key,product_title,quantity,total_price,unit_cost,total_cost,returned_quantity," +
            "snap_type:customization_snapshot->>product_type,snap_result:customization_snapshot->>result_id," +
            "snap_size:customization_snapshot->>assigned_size,snap_tier:customization_snapshot->>assigned_tier," +
            "snap_length:customization_snapshot->>assigned_length,snap_bolster:customization_snapshot->>bolster_variant",
        )
        .in("order_id", chunk)
        .order("id"),
    ) as unknown as Promise<PlatformItemRow[]>,
  ]);

  const variantIds = [...new Set(items.map((i) => i.variant_id).filter((v): v is string => !!v))];
  const [variants, pillowProducts] = await Promise.all([
    selectAllIn(variantIds, (chunk) =>
      admin
        .from("product_variants")
        .select("id,item_id,pillow_product_id,option1,products(product_type)")
        .in("id", chunk)
        .order("id"),
    ) as unknown as Promise<VariantRow[]>,
    selectAll(() => admin.from("pillow_products").select("id,kind,size").order("id")) as Promise<
      Array<{ id: number; kind: string | null; size: string | null }>
    >,
  ]);
  const variantById = new Map(variants.map((v) => [String(v.id), v]));
  const pillowById = new Map(pillowProducts.map((p) => [Number(p.id), p]));
  const itemById = await loadItems(
    admin,
    variants.map((v) => v.item_id).filter((id): id is number => id != null).map(Number),
  );

  const marginByOrder = new Map(margins.map((m) => [String(m.order_id), m]));
  const linesByOrder = new Map<string, SoldLine[]>();

  for (const row of items) {
    const title = row.product_title || "Untitled line";
    const units = Math.max(0, Math.floor(Number(row.quantity ?? 0)));
    const gross = money(row.total_price);
    const totalCost = moneyOrNull(row.total_cost);
    const restocked = (moneyOrNull(row.unit_cost) ?? 0) * Math.max(0, Number(row.returned_quantity ?? 0));
    let cost: number | null = totalCost == null ? null : Math.max(0, totalCost - restocked);
    let line: Omit<SoldLine, "units" | "gross" | "cost">;

    if (row.kind === "service") {
      cost = cost ?? 0;
      line = { group: "service", key: `service:${row.service_key ?? "other"}`, label: title };
    } else {
      const variant = row.variant_id ? variantById.get(String(row.variant_id)) : undefined;
      const productType = variant
        ? (Array.isArray(variant.products) ? variant.products[0] : variant.products)?.product_type
        : null;
      const pillow = variant?.pillow_product_id != null ? pillowById.get(Number(variant.pillow_product_id)) : undefined;
      const length = (row.snap_length ?? row.snap_bolster ?? variant?.option1 ?? "").toLowerCase();

      if (pillow?.size) {
        const tier = pillow.kind === "premium" ? "premium" : "basic";
        line = { group: "pillow", key: `pillow:${tier}:${pillow.size}`, label: `Size ${pillow.size}` };
      } else if (!variant && row.snap_result && row.snap_type === "pillow" && row.snap_size) {
        const tier = row.snap_tier === "premium" ? "premium" : "basic";
        line = { group: "pillow", key: `pillow:${tier}:${row.snap_size}`, label: `Size ${row.snap_size}` };
      } else if ((productType === "bolster" || row.snap_type === "bolster") && LENGTHS.has(length)) {
        line = { group: "bolster", key: `bolster:${length}`, label: lengthLabel(length) };
      } else if (variant?.item_id != null) {
        const item = itemById.get(Number(variant.item_id));
        line = {
          group: "part",
          key: `item:${variant.item_id}`,
          label: itemLabel(item, title),
          category: item?.category ?? "other",
        };
      } else {
        line = { group: "unmapped", key: `unmapped:${title}`, label: title };
      }
    }

    const list = linesByOrder.get(String(row.order_id)) ?? [];
    list.push({
      ...line,
      units,
      gross,
      cost,
      uncostedReason: cost == null ? "No cost was recorded on the order line when it sold." : null,
    });
    linesByOrder.set(String(row.order_id), list);
  }

  return orders.map((o) => {
    const m = marginByOrder.get(String(o.id));
    const productRevenue = m ? money(m.gross_margin) + money(m.cogs) : 0;
    return {
      soldAt: soldAtByOrder.get(String(o.id))!,
      productRevenue,
      lines: linesByOrder.get(String(o.id)) ?? [],
    };
  });
}

export async function loadSalesReport(input: {
  from: string;
  to: string;
}): Promise<SalesReport & { fromMonth: string; toMonth: string }> {
  const range = sgMonthRange(input.from, input.to);
  const orders = await loadSoldOrders(supabaseAdmin(), range);
  return {
    ...buildSalesReport({ orders, months: range.months }),
    fromMonth: range.fromMonth,
    toMonth: range.toMonth,
  };
}
