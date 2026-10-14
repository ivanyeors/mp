import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Accept runs exactly once per Result (#172).
 *
 * The real POST handler against an in-memory table whose conditional update is a
 * genuine check-and-set, and whose every query yields a macrotask first, so two
 * `Promise.all` requests interleave through the same code the way two Vercel
 * invocations would. Only I/O is mocked: Stripe, the build loader, and the
 * commission / milestone / ledger / email writers. The lifecycle, capture plan,
 * settlement and snapshot are the real modules.
 */

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  db: {} as Record<string, Row[]>,
  writes: [] as Array<{ table: string; op: string }>,
  piStatus: "requires_capture",
  captureHold: vi.fn(),
  createHeldCommissionsForOrder: vi.fn(),
  applyMilestoneProgress: vi.fn(),
  loadAssignedBuild: vi.fn(),
  sessionsRetrieve: vi.fn(),
}));

const tick = () => new Promise((r) => setTimeout(r, 0));

function query(table: string) {
  let op = "select";
  let patch: Row | Row[] = {};
  const filters: Array<(r: Row) => boolean> = [];
  const run = async (): Promise<Row[]> => {
    await tick();
    // Everything below is synchronous: one query is one atomic step.
    const rows = (h.db[table] ??= []);
    if (op !== "select") h.writes.push({ table, op });
    if (op === "insert") {
      const inserted = (Array.isArray(patch) ? patch : [patch]).map((r) => ({
        id: `${table}-${rows.length + 1}`,
        ...r,
      }));
      rows.push(...inserted);
      return inserted;
    }
    const hit = rows.filter((r) => filters.every((f) => f(r)));
    if (op === "update") hit.forEach((r) => Object.assign(r, patch));
    if (op === "delete") h.db[table] = rows.filter((r) => !hit.includes(r));
    return hit;
  };
  const b = {
    select: () => b,
    update: (p: Row) => ((op = "update"), (patch = p), b),
    insert: (p: Row | Row[]) => ((op = "insert"), (patch = p), b),
    delete: () => ((op = "delete"), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
    in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), b),
    maybeSingle: async () => ({ data: (await run())[0] ?? null, error: null }),
    single: async () => ({ data: (await run())[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      run().then((data) => ({ data, error: null })).then(res, rej),
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({ from: (table: string) => query(table) }),
}));
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({
    paymentIntents: { retrieve: async (id: string) => ({ id, status: h.piStatus }) },
    checkout: { sessions: { retrieve: h.sessionsRetrieve } },
  }),
}));
vi.mock("@/lib/authorization-hold", async (orig) => ({
  ...(await orig<typeof import("@/lib/authorization-hold")>()),
  captureHold: h.captureHold,
  createTopUpCheckout: vi.fn(),
}));
vi.mock("@/lib/results/access", () => ({ authorizeResultAccess: async () => true }));
// importOriginal so the real ASSIGNED_BUILD_COLUMNS reaches the route: accept
// interpolates it into its select, and a mock that omits it fails at the query
// rather than at the concurrency behaviour under test.
vi.mock("@/lib/results/assigned-build", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/results/assigned-build")>()),
  loadAssignedBuild: h.loadAssignedBuild,
}));
vi.mock("@/lib/commissions/ledger", () => ({
  createHeldCommissionsForOrder: h.createHeldCommissionsForOrder,
}));
vi.mock("@/lib/milestones/ledger", () => ({ applyMilestoneProgress: h.applyMilestoneProgress }));
vi.mock("@/lib/ecommerce/money-ledger", () => ({
  recordLedgerEntry: vi.fn(),
  rollupOrderMoney: vi.fn(),
}));
vi.mock("@/lib/email/partner", () => ({ sendReferralEarnedEmail: vi.fn() }));

const { POST } = await import("@/app/api/results/[id]/accept/route");

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOKEN = "11111111-1111-4111-8111-111111111111";

const accept = (body: Row = {}) =>
  POST(
    new Request(`https://x.test/api/results/${ID}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: TOKEN, ...body }),
    }),
    { params: Promise.resolve({ id: ID }) },
  );

const count = (table: string) => h.db[table]?.length ?? 0;
const result = () => h.db.mp_config_responses[0];

/** An attributed, shipped, assigned Result whose hold covers the final total. */
const assignedRow = (extra: Row = {}): Row => ({
  id: ID,
  status: "assigned",
  source: "online_purchase",
  product_type: "pillow",
  assigned_size: "M",
  assigned_tier: "premium",
  assigned_length: null,
  filling_template_id: 7,
  preference_lines: [],
  addon_lines: [],
  shipping_method: "standard",
  shipping_address: { line1: "1 Road", city: "Singapore", postal_code: "000001", country: "SG" },
  authorized_amount: 120,
  final_amount: null,
  currency: "SGD",
  payment_intent_id: "pi_hold",
  topup_payment_intent_id: null,
  topup_paid_at: null,
  customer_email: "ada@x.test",
  customer_id: null,
  access_token: TOKEN,
  order_id: null,
  partner_id: "partner-1",
  ref_code: "REF1",
  attribution_source: "link",
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.db = { mp_config_responses: [assignedRow()] };
  h.writes = [];
  h.piStatus = "requires_capture";
  h.captureHold.mockImplementation(async () => {
    await tick();
    h.piStatus = "succeeded";
  });
  h.loadAssignedBuild.mockResolvedValue({
    ok: true,
    lines: [
      { item_id: 1, quantity: 1, role: "composed" },
      { item_id: 2, quantity: 2, role: "filling" },
    ],
    cogs: 30,
    pricing: { goods: 100, services: 0, subtotal: 100, shipping: 10, tax: 0, total: 110 },
    serviceLines: [],
    basePrice: 90,
    shortages: [],
    nameByItem: new Map(),
    fillingPlacements: [],
  });
});

describe("POST /api/results/[id]/accept — exactly once", () => {
  it("two concurrent accepts make one Order, one stock deduction and one commission", async () => {
    const responses = await Promise.all([accept(), accept()]);

    expect(count("orders")).toBe(1);
    expect(count("inventory_transactions")).toBe(2); // the two build lines, once
    expect(h.createHeldCommissionsForOrder).toHaveBeenCalledOnce();
    expect(h.applyMilestoneProgress).toHaveBeenCalledOnce();
    expect(h.captureHold).toHaveBeenCalledOnce();

    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(result()).toMatchObject({ status: "captured", order_id: "orders-1" });
  });

  it("two concurrent accepts on a no-hold Result settled by a top-up make one Order", async () => {
    h.db.mp_config_responses = [assignedRow({ payment_intent_id: null, authorized_amount: null })];
    h.sessionsRetrieve.mockResolvedValue({
      metadata: { result_id: ID, purpose: "result_topup" },
      payment_status: "paid",
      amount_total: 11000,
      payment_intent: "pi_topup",
    });

    await Promise.all([accept({ topupSessionId: "cs_1" }), accept({ topupSessionId: "cs_1" })]);

    expect(count("orders")).toBe(1);
    expect(count("inventory_transactions")).toBe(2);
    expect(h.createHeldCommissionsForOrder).toHaveBeenCalledOnce();
    expect(h.captureHold).not.toHaveBeenCalled();
  });

  it("a second accept after success returns the same Order and writes nothing", async () => {
    const first = await accept();
    const { orderId } = await first.json();
    expect(orderId).toBe("orders-1");

    const writesBefore = h.writes.length;
    vi.clearAllMocks();

    const second = await accept();
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ ok: true, orderId });
    expect(h.writes.length).toBe(writesBefore);
    expect(count("orders")).toBe(1);
    expect(h.captureHold).not.toHaveBeenCalled();
    expect(h.createHeldCommissionsForOrder).not.toHaveBeenCalled();
  });

  it("when capture fails the claim is handed back and a later accept succeeds", async () => {
    h.captureHold.mockRejectedValueOnce(new Error("card_declined"));

    const failed = await accept();
    expect(failed.status).toBe(502);
    expect(count("orders")).toBe(0);
    expect(result()).toMatchObject({ status: "assigned", order_id: null });

    const retry = await accept();
    expect(retry.status).toBe(200);
    expect(count("orders")).toBe(1);
    expect(result()).toMatchObject({ status: "captured", order_id: "orders-1" });
  });
});

describe("POST /api/results/[id]/accept — Service fee lines (ADR 0024)", () => {
  it("writes the Measurement service as its own line, so the Order's lines sum to its subtotal", async () => {
    h.db.mp_config_responses = [assignedRow({ authorized_amount: 170 })];
    h.loadAssignedBuild.mockResolvedValue({
      ok: true,
      lines: [
        { item_id: 1, quantity: 1, role: "composed" },
        { item_id: 2, quantity: 2, role: "filling" },
      ],
      cogs: 30,
      pricing: { goods: 100, services: 50, subtotal: 150, shipping: 10, tax: 0, total: 160 },
      serviceLines: [
        { key: "measurement_premium", label: "Measurement service (Premium)", msrp: 50, costPrice: null },
      ],
      basePrice: 90,
      shortages: [],
      nameByItem: new Map(),
      fillingPlacements: [],
    });

    const res = await accept();
    expect(res.status).toBe(200);

    const order = h.db.orders[0];
    const items = h.db.order_items;
    expect(items).toHaveLength(2);
    const [build, service] = items;
    expect(build).toMatchObject({ unit_price: 100, total_price: 100 });
    expect(build.kind).toBeUndefined(); // the column default: goods
    expect(service).toMatchObject({
      kind: "service",
      service_key: "measurement_premium",
      sku: "SERVICE-MEASUREMENT-PREMIUM",
      product_title: "Measurement service (Premium)",
      variant_id: null,
      quantity: 1,
      unit_price: 50,
      total_price: 50,
    });
    const lineSum = items.reduce((s, r) => s + Number(r.total_price), 0);
    expect(lineSum).toBe(order.subtotal);
    expect(order).toMatchObject({ subtotal: 150, total: 160 });
    // Only the build's lines move stock; a service is never deducted.
    expect(count("inventory_transactions")).toBe(2);
  });

  it("writes no fee line for a Result whose stored total was priced before the fee existed", async () => {
    // Assigned before Service fees shipped: final_amount 110 = today's 160 less the 50 fee.
    h.db.mp_config_responses = [assignedRow({ authorized_amount: 170, final_amount: 110 })];
    h.loadAssignedBuild.mockResolvedValue({
      ok: true,
      lines: [{ item_id: 1, quantity: 1, role: "composed" }],
      cogs: 30,
      pricing: { goods: 100, services: 50, subtotal: 150, shipping: 10, tax: 0, total: 160 },
      serviceLines: [
        { key: "measurement_premium", label: "Measurement service (Premium)", msrp: 50, costPrice: 8 },
      ],
      basePrice: 90,
      shortages: [],
      nameByItem: new Map(),
      fillingPlacements: [],
    });

    expect((await accept()).status).toBe(200);
    expect(h.db.order_items).toHaveLength(1);
    expect(h.db.orders[0]).toMatchObject({ subtotal: 100, total: 110 });
  });

  it("never writes a service's cost into the customer-readable snapshot", async () => {
    h.db.mp_config_responses = [assignedRow({ authorized_amount: 170 })];
    h.loadAssignedBuild.mockResolvedValue({
      ok: true,
      lines: [{ item_id: 1, quantity: 1, role: "composed" }],
      cogs: 30,
      pricing: { goods: 100, services: 50, subtotal: 150, shipping: 10, tax: 0, total: 160 },
      serviceLines: [
        { key: "measurement_premium", label: "Measurement service (Premium)", msrp: 50, costPrice: 8 },
      ],
      basePrice: 90,
      shortages: [],
      nameByItem: new Map(),
      fillingPlacements: [],
    });
    await accept();
    const snap = h.db.order_items[0].customization_snapshot as { service_lines: Array<{ costPrice: unknown }> };
    expect(snap.service_lines[0].costPrice).toBeNull();
  });

  it("writes exactly one line for a self-measured build, as before", async () => {
    await accept();
    expect(h.db.order_items).toHaveLength(1);
    expect(h.db.order_items[0]).toMatchObject({ unit_price: 100, total_price: 100 });
  });
});
