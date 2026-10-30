// Sample data for Admin Panel → Analytics (and anything else that reads the
// catalog, stock ledger, BOM templates or orders). Item names are the real
// catalog's; every quantity, order, payment and answer is made up, seeded so
// each run draws the same pictures. Dates are the six Singapore months up to
// today, so the default period always has data.
//
// Scenarios: "empty-sales" leaves out every order, as production looks before
// its first Stripe sale.

const CATALOG =
  "1|Satin White|XS|cover|~2|Satin White|S|cover|~3|Satin White|M|cover|~4|Satin White|L|cover|~5|Satin White|XL|cover|~6|Natural White Linen|XS|pillow_case|~7|Natural White Linen|S|pillow_case|~8|Natural White Linen|M|pillow_case|~9|Natural White Linen|L|pillow_case|~10|Natural White Linen|XL|pillow_case|~11|Waterproof Inner|XS|pillow_protector|~12|Waterproof Inner|S|pillow_protector|~13|Waterproof Inner|M|pillow_protector|~14|Waterproof Inner|L|pillow_protector|~15|Waterproof Inner|XL|pillow_protector|~21|vacuum_ziplock|S|packaging|~22|vacuum_ziplock|L|packaging|~23|laundry_net|S|packaging|~24|laundry_net|L|packaging|~25|Colored|Bolster|bolster_case|~26|bolster_protector|Bolster|bolster_protector|~33|Fibrecool|S|pillow_case|~36|Fibrecool|L|pillow_case|~38|Premium - Measurement|Service|other|~39|Basic - Measurement|Service|other|~40|Re-adjustment|Service|other|~41|Ear Comfort Pad||accessories|~43|Deep Blue Linen|S|pillow_case|~44|Deep Blue Linen|M|pillow_case|~45|Deep Blue Linen|L|pillow_case|~53|Fibrecool|M|pillow_case|~55|6D|L|filling|~57|6D+|L|filling|~60|6D+|S|filling|~61|Cervical Neck Support|S|accessories|~62|Cervical Neck Support|M|accessories|~63|Cervical Neck Support|L|accessories|~64|Camel|S|bolster_case|~66|Cervical Neck Support|XS|accessories|~67|6D|S|filling|~68|6D|M|filling|~69|3D|S|filling|~70|3D Round|S|filling|~72|6D Round|S|filling|~73|6D Fold|S|filling|~74|6D|XL|filling|~75|Zip Lock Bag|S|packaging|~76|Zip Lock Bag|L|packaging|~84|Cotton|L|bolster_protector|~85|Camel|M|bolster_case|~86|Camel|L|bolster_case|~93|Slope Mattress||accessories|";

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The first instant of each of the last `n` Singapore months, oldest first, and their ends (capped at now). */
function sgMonths(now, n) {
  const sg = new Date(now.getTime() + 8 * 3600e3);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const y = sg.getUTCFullYear();
    const m = sg.getUTCMonth() - i;
    const start = new Date(Date.UTC(y, m, 1) - 8 * 3600e3);
    const next = new Date(Date.UTC(y, m + 1, 1) - 8 * 3600e3);
    out.push({ start, end: next > now ? now : next });
  }
  return out;
}

const at = (start, end, r) => new Date(start.getTime() + Math.floor(r() * Math.max(1, end.getTime() - start.getTime())));

export default function analytics({ scenario, now }) {
  const r = rng(36);
  const months = sgMonths(now, 6);
  const first = months[0].start;

  const items = CATALOG.split("~")
    .filter(Boolean)
    .map((s) => {
      const [id, name, size, category, subtype] = s.split("|");
      return { id: Number(id), name: name || null, size: size || null, category: category || null, subtype: subtype || null, cost_price: null, is_active: true };
    });

  // Stock ledger: an opening balance before the period, deliveries and use inside it.
  const inventory_transactions = [];
  let tx = 1;
  for (const item of items) {
    if (item.category === "other") continue;
    const scale = item.category === "filling" ? 900 : item.category === "packaging" ? 300 : 120;
    const opening = Math.round(scale * (0.3 + r()));
    inventory_transactions.push({ id: tx++, item_id: item.id, quantity_signed: opening, created_at: new Date(first.getTime() - 20 * 86400e3).toISOString(), reason: "opening" });
    for (const mo of months) {
      if (r() < 0.25) inventory_transactions.push({ id: tx++, item_id: item.id, quantity_signed: Math.round(scale * 0.3 * (0.5 + r())), created_at: at(mo.start, mo.end, r).toISOString(), reason: "purchase" });
      const used = Math.round(scale * 0.08 * r());
      if (used) inventory_transactions.push({ id: tx++, item_id: item.id, quantity_signed: -used, created_at: at(mo.start, mo.end, r).toISOString(), reason: "sale" });
    }
  }

  // Results answers (Customers tab).
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const mp_config_responses = [];
  for (let i = 1; i <= 60; i++) {
    const mo = months[Math.floor(r() * months.length)];
    mp_config_responses.push({
      id: `00000000-0000-4000-9000-${String(i).padStart(12, "0")}`,
      is_final: r() < 0.85,
      created_at: at(mo.start, mo.end, r).toISOString(),
      data: {
        gender: r() < 0.62 ? "female" : "male",
        ageGroup: pick(["18-24", "25-34", "25-34", "35-44", "35-44", "45-54", "45-54", "55-64", "65-plus"]),
        acidReflux: r() < 0.22 ? "yes" : "no",
        bedFirmness: pick(["soft", "medium-soft", "medium-soft", "firm"]),
        bloodPressureLevel: pick(["normal", "normal", "normal", "low-blood", "high-blood", "unsure"]),
        earDiscomfortSideSleep: r() < 0.35 ? "yes" : "no",
      },
    });
  }
  const drop_off_reasons = [];
  for (let i = 1; i <= 18; i++) {
    const step = pick(["configurator", "configurator", "checkout", "quote_decline"]);
    drop_off_reasons.push({
      id: `00000000-0000-4000-a000-${String(i).padStart(12, "0")}`,
      step,
      reason: pick(["size_or_feel", "try_in_person", "price", "price", "delivery", "just_looking", "changed_mind", "other"]),
      other_text: null,
      created_at: at(months[3].start, now, r).toISOString(),
    });
  }

  // BOM templates (Stock & builds → Product configuration).
  const bom_templates = [
    { id: 18, kind: "pillow", key: "M", name: "Deep Blue", pillow_kind: "premium", pillow_variant: "linen", updated_at: "2026-01-08T05:58:50Z" },
    { id: 15, kind: "pillow", key: "S", name: "Deep Blue", pillow_kind: "premium", pillow_variant: "linen", updated_at: "2026-01-08T05:58:41Z" },
    { id: 16, kind: "pillow", key: "S", name: "Fibrecool", pillow_kind: "premium", pillow_variant: "fibrecool", updated_at: "2026-01-08T05:58:25Z" },
    { id: 11, kind: "pillow", key: "M", name: "Natural White", pillow_kind: "premium", pillow_variant: "linen", updated_at: "2026-01-08T04:11:35Z" },
  ];
  const bom_template_lines = "18,23,1;18,21,1;18,13,1;18,3,2;18,72,2;18,73,2;18,67,3;18,60,3;18,68,1;18,55,2;18,57,2;18,44,1;11,23,1;11,21,1;11,8,1;11,13,1;11,3,2;11,72,2;11,73,2;11,67,3;11,60,3;11,68,1;11,55,2;11,57,2;16,23,1;16,21,1;16,2,2;16,12,1;16,70,1;16,67,2;16,73,2;16,60,2;16,68,3;16,57,2;16,33,1;16,75,1;15,23,1;15,21,1;15,2,2;15,12,1;15,70,1;15,67,2;15,73,2;15,60,2;15,68,3;15,57,2;15,43,1;15,75,1"
    .split(";")
    .map((s) => {
      const [template_id, item_id, quantity] = s.split(",").map(Number);
      return { template_id, item_id, quantity };
    });

  // Storefront products and Variants the sold lines point at.
  const products = [
    { id: "prod-pillow-basic", title: "Mpillow Basic", product_type: "pillow", status: "active" },
    { id: "prod-pillow-premium", title: "Mpillow Premium", product_type: "pillow", status: "active" },
    { id: "prod-bolster", title: "Mbolster", product_type: "bolster", status: "active" },
    { id: "prod-accessory", title: "Accessories", product_type: "accessory", status: "active" },
  ];
  const SIZES = ["XS", "S", "M", "L", "XL"];
  const pillow_products = [];
  const product_variants = [];
  const PILLOW_VARIANT = { basic: {}, premium: {} };
  let pp = 1;
  for (const kind of ["basic", "premium"]) {
    for (const size of SIZES) {
      pillow_products.push({ id: pp, kind, size });
      const id = `var-${kind}-${size}`;
      PILLOW_VARIANT[kind][size] = id;
      product_variants.push({ id, product_id: `prod-pillow-${kind}`, item_id: null, pillow_product_id: pp, option1: size, title: size });
      pp++;
    }
  }
  const BOLSTER = [
    { variant: "var-bolster-short", option1: "short", title: "Mbolster Short", price: 130, cost: 38 },
    { variant: "var-bolster-medium", option1: "medium", title: "Mbolster Medium", price: 190, cost: 44 },
    { variant: "var-bolster-long", option1: "long", title: "Mbolster Long", price: 230, cost: 52 },
  ];
  for (const b of BOLSTER) product_variants.push({ id: b.variant, product_id: "prod-bolster", item_id: null, pillow_product_id: null, option1: b.option1, title: b.title });
  const ADDONS = [
    { variant: "var-neck-s", item: 61, title: "Cervical Neck Support - S", price: 38, cost: 10 },
    { variant: "var-neck-m", item: 62, title: "Cervical Neck Support - M", price: 38, cost: 10 },
    { variant: "var-neck-l", item: 63, title: "Cervical Neck Support - L", price: 45, cost: 10 },
    { variant: "var-ear-pad", item: 41, title: "Ear Comfort Pad", price: 60, cost: 15 },
    { variant: "var-slope", item: 93, title: "Slope Mattress", price: 120, cost: 48 },
  ];
  for (const a of ADDONS) product_variants.push({ id: a.variant, product_id: "prod-accessory", item_id: a.item, pillow_product_id: null, option1: null, title: a.title });

  const PRICE = { basic: { XS: 170, S: 190, M: 220, L: 270, XL: 360 }, premium: { XS: 360, S: 400, M: 460, L: 580, XL: 680 } };
  const COST = { basic: { XS: 44, S: 48, M: 53, L: 61, XL: 72 }, premium: { XS: 78, S: 84, M: 92, L: 104, XL: 118 } };
  const NO_COST = [
    { title: "Custom embroidery", price: 25 },
    { title: "Gift box", price: 15 },
  ];

  // Orders paid through Stripe: a sale is dated by its latest charge.
  const orders = [];
  const order_items = [];
  const order_margins = [];
  const order_payments = [];
  if (scenario !== "empty-sales") {
    const s = rng(7);
    const size = () => {
      const x = s();
      return x < 0.1 ? "XS" : x < 0.3 ? "S" : x < 0.65 ? "M" : x < 0.9 ? "L" : "XL";
    };
    let line = 1;
    let pay = 1;
    let n = 0;
    months.forEach((mo, i) => {
      const count = 12 + i * 5;
      for (let k = 0; k < count; k++) {
        n++;
        const id = `ord_${String(n).padStart(4, "0")}`;
        const paidAt = at(mo.start, mo.end, s);
        const lines = [];
        const add = (l) =>
          lines.push({ id: `li_${line++}`, order_id: id, quantity: 1, returned_quantity: 0, customization_snapshot: null, variant_id: null, kind: "product", service_key: null, ...l });
        const x = s();
        const tier = s() < 0.55 ? "premium" : "basic";
        const sz = size();
        let isResult = false;
        if (x < 0.45) {
          isResult = true;
          add({
            product_title: `Customised Mpillow ${sz}`,
            total_price: PRICE[tier][sz],
            unit_cost: COST[tier][sz],
            total_cost: COST[tier][sz],
            customization_snapshot: { product_type: "pillow", result_id: `res_${n}`, assigned_size: sz, assigned_tier: tier },
          });
          add({
            kind: "service",
            service_key: `measurement_${tier}`,
            product_title: tier === "premium" ? "Premium measurement" : "Basic measurement",
            total_price: tier === "premium" ? 50 : 30,
            unit_cost: tier === "premium" ? 12 : null,
            total_cost: tier === "premium" ? 12 : null,
          });
        } else if (x < 0.75) {
          add({ variant_id: PILLOW_VARIANT[tier][sz], product_title: `Mpillow ${tier === "premium" ? "Premium" : "Basic"} Size ${sz}`, total_price: PRICE[tier][sz], unit_cost: COST[tier][sz], total_cost: COST[tier][sz] });
        } else if (x < 0.92) {
          const b = BOLSTER[Math.floor(s() * BOLSTER.length)];
          add({ variant_id: b.variant, product_title: b.title, total_price: b.price, unit_cost: b.cost, total_cost: b.cost });
        } else {
          const a = ADDONS[Math.floor(s() * ADDONS.length)];
          add({ variant_id: a.variant, product_title: a.title, total_price: a.price, unit_cost: a.cost, total_cost: a.cost });
        }
        if (s() < 0.3) {
          const a = ADDONS[Math.floor(s() * ADDONS.length)];
          add({ variant_id: a.variant, product_title: a.title, total_price: a.price, unit_cost: a.cost, total_cost: a.cost });
        }
        if (s() < 0.09) {
          const g = NO_COST[Math.floor(s() * NO_COST.length)];
          add({ product_title: g.title, total_price: g.price, unit_cost: null, total_cost: null });
        }
        const listed = lines.reduce((t, l) => t + Number(l.total_price), 0);
        const discount = s() < 0.15 ? 0.1 : 0;
        const refund = s() < 0.04 ? 0.5 : 1;
        const revenue = Math.round(listed * (1 - discount) * refund * 100) / 100;
        const cogs = lines.reduce((t, l) => t + (l.total_cost == null ? 0 : Number(l.total_cost)), 0);
        for (const l of lines) l.unit_price = l.total_price;
        order_items.push(...lines);
        order_margins.push({ order_id: id, cogs, gross_margin: Math.round((revenue - cogs) * 100) / 100 });
        // A Result paid in two parts: a Balance payment first, the hold captured at Accept.
        if (isResult && s() < 0.4) {
          order_payments.push({ id: `pay_${pay++}`, order_id: id, type: "charge", amount: Math.round(revenue * 50) / 100, currency: "sgd", stripe_object_id: `pi_bal_${n}`, occurred_at: new Date(paidAt.getTime() - 2 * 86400e3).toISOString() });
        }
        order_payments.push({ id: `pay_${pay++}`, order_id: id, type: "charge", amount: revenue, currency: "sgd", stripe_object_id: `pi_${n}`, occurred_at: paidAt.toISOString() });
        orders.push({
          id,
          order_number: `MP${String(1000 + n)}`,
          status: "paid",
          currency: "SGD",
          subtotal: listed,
          total: revenue,
          email: `customer${n}@example.com`,
          paid_at: paidAt.toISOString(),
          created_at: new Date(paidAt.getTime() - 3600e3).toISOString(),
        });
      }
    });
    // Paid on a cancelled Order: held for Staff, not a sale.
    order_payments.push({ id: `pay_${pay++}`, order_id: "ord_closed", type: "charge", amount: 220, currency: "sgd", stripe_object_id: "pi_closed", occurred_at: at(months[5].start, now, s).toISOString() });
    orders.push({ id: "ord_closed", order_number: "MP0999", status: "cancelled", currency: "SGD", total: 220, paid_at: null, created_at: months[5].start.toISOString() });
  }

  return {
    tables: {
      items,
      inventory_transactions,
      mp_config_responses,
      drop_off_reasons,
      bom_templates,
      bom_template_lines,
      products,
      product_variants,
      pillow_products,
      orders,
      order_items,
      order_margins,
      order_payments,
    },
    views: {
      // create view inventory_balances: the ledger summed per Item.
      inventory_balances: (t) => {
        const sum = new Map();
        for (const row of t.inventory_transactions ?? []) sum.set(row.item_id, (sum.get(row.item_id) ?? 0) + Number(row.quantity_signed));
        return [...sum].map(([item_id, on_hand]) => ({ item_id, on_hand }));
      },
    },
    rpc: {
      admin_orders_revenue_summary: ({ p_from, p_to }, { rows }) => {
        const paid = rows("orders").filter(
          (o) =>
            !["cancelled", "refunded"].includes(o.status) &&
            (!p_from || (o.paid_at && o.paid_at >= new Date(p_from).toISOString())) &&
            (!p_to || (o.paid_at && o.paid_at < new Date(p_to).toISOString())),
        );
        return [{ revenue_sum: paid.reduce((s, o) => s + Number(o.total ?? 0), 0), revenue_count: paid.length }];
      },
    },
  };
}
