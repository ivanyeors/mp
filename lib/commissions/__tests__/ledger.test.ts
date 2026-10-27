import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeSupabaseAdmin, type FakeDb } from "@/lib/supabase/__tests__/fake-admin";
import {
  createHeldCommissionsForOrder,
  voidCommissionsForRma,
  type CommissionItemInput,
} from "@/lib/commissions/ledger";

/**
 * The commission ledger under the Referral Partner Agreement's Schedule
 * (ADR 0034): one flat commission per Qualifying Sale — an order holding at
 * least one customised premium pillow — and its reversal when an RMA refunds
 * an Eligible Product. Expectations come from the spec, not the code.
 *
 * The in-memory admin is lib/supabase/__tests__/fake-admin plus an `upsert`
 * that behaves as Postgres does with the `commissions` table's unique indexes
 * (supabase/migrations 20260728020000 and 20261027120000): one row per
 * order_item_id, one `basis = 'order'` row per order_id, `ON CONFLICT … DO
 * NOTHING` for `ignoreDuplicates`, and the column defaults a row would get.
 */

type Row = Record<string, unknown>;

const UNIQUE: Record<string, Array<{ cols: string[]; where?: (r: Row) => boolean }>> = {
  commissions: [
    { cols: ["order_item_id"] },
    { cols: ["order_id"], where: (r) => r.basis === "order" },
  ],
};
const DEFAULTS: Record<string, Row> = {
  commissions: { status: "held", basis: "unit", released_at: null, voided_at: null },
};

function adminFor(db: FakeDb): SupabaseClient {
  const base = fakeSupabaseAdmin(db);
  return {
    from(table: string) {
      const q = base.from(table);
      return Object.assign(q, {
        upsert(row: Row, opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
          const rows = (db[table] ??= []);
          const target = (opts.onConflict ?? "id").split(",").map((c) => c.trim());
          // ON CONFLICT needs a full (non-partial) unique index on exactly these columns.
          const arbiter =
            target.join() === "id" ||
            (UNIQUE[table] ?? []).some((u) => !u.where && u.cols.join() === target.join());
          if (!arbiter) {
            return Promise.resolve({
              data: null,
              error: { message: "there is no unique or exclusion constraint matching the ON CONFLICT specification" },
            });
          }
          const clash = rows.find((r) => target.every((c) => r[c] === row[c]));
          if (clash) {
            if (!opts.ignoreDuplicates) Object.assign(clash, row);
            return Promise.resolve({ data: null, error: null });
          }
          const full = { ...DEFAULTS[table], ...row };
          for (const u of UNIQUE[table] ?? []) {
            if (u.where && !u.where(full)) continue;
            if (rows.some((r) => (!u.where || u.where(r)) && u.cols.every((c) => r[c] === full[c]))) {
              return Promise.resolve({
                data: null,
                error: { message: `duplicate key value violates unique constraint on (${u.cols.join(", ")})` },
              });
            }
          }
          rows.push({ id: `${table}-${rows.length + 1}`, ...full });
          return Promise.resolve({ data: null, error: null });
        },
      });
    },
  } as unknown as SupabaseClient;
}

const ORDER = "0a0a0a0a-0000-4000-8000-000000000001";
const OTHER_ORDER = "0a0a0a0a-0000-4000-8000-000000000002";
const PARTNER = "9e9e9e9e-0000-4000-8000-000000000001";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const snapshot = (over: Row = {}) => ({
  result_id: "res-1",
  product_type: "pillow",
  assigned_tier: "premium",
  ...over,
});

/** A goods line from a customisation's premium pillow: an Eligible Product. */
const premium = (n: number, over: Partial<CommissionItemInput> = {}): CommissionItemInput => ({
  id: id(n),
  kind: "goods",
  total_price: 200,
  customization_snapshot: snapshot({ result_id: `res-${n}` }),
  ...over,
});
const basicPillow = (n: number): CommissionItemInput =>
  premium(n, { customization_snapshot: snapshot({ result_id: `res-${n}`, assigned_tier: "basic" }) });
const bolster = (n: number): CommissionItemInput =>
  premium(n, { customization_snapshot: snapshot({ result_id: `res-${n}`, product_type: "bolster", assigned_tier: null }) });
const shopLine = (n: number): CommissionItemInput => ({ id: id(n), kind: "goods", total_price: 40, customization_snapshot: null });
const legacyPremium = (n: number): CommissionItemInput =>
  premium(n, { customization_snapshot: { product_type: "pillow", assigned_tier: "premium" } });
const serviceLine = (n: number): CommissionItemInput => premium(n, { kind: "service" });

const partnerRow = (over: Row = {}): Row => ({
  id: PARTNER,
  name: "Spine Clinic",
  commission_pool: 50,
  commission_choice: null,
  commission_choice_next: null,
  commission_choice_next_from: null,
  customer_discount_enabled: false,
  ...over,
});

let db: FakeDb;
let admin: SupabaseClient;

beforeEach(() => {
  db = { partners: [partnerRow()], commissions: [] };
  admin = adminFor(db);
});
afterEach(() => {
  vi.useRealTimers();
});

const create = (items: CommissionItemInput[], over: { deliveredAt?: string | null; amount?: number | null; orderId?: string } = {}) =>
  createHeldCommissionsForOrder(admin, {
    orderId: over.orderId ?? ORDER,
    partnerId: PARTNER,
    items,
    deliveredAt: over.deliveredAt === undefined ? null : over.deliveredAt,
    ...(over.amount !== undefined ? { amount: over.amount } : {}),
  });

const commissions = () => db.commissions ?? [];

describe("createHeldCommissionsForOrder — one held commission per Qualifying Sale", () => {
  it("an order with a customised premium pillow earns one held 'order' row and returns true", async () => {
    expect(await create([premium(1)])).toBe(true);
    expect(commissions()).toHaveLength(1);
    expect(commissions()[0]).toMatchObject({
      order_id: ORDER,
      order_item_id: id(1),
      partner_id: PARTNER,
      basis: "order",
      status: "held",
      product_type: "pillow",
      commission_amount: 50,
    });
  });

  it.each<[string, CommissionItemInput[]]>([
    ["a shop order (no customisation)", [shopLine(1), shopLine(2)]],
    ["a Result order holding only a basic pillow", [basicPillow(1)]],
    ["a Result order holding only a bolster", [bolster(1)]],
    ["a basic pillow and a bolster", [basicPillow(1), bolster(2)]],
    ["a legacy shop premium pillow line without result_id", [legacyPremium(1)]],
    ["a service line carrying a premium pillow snapshot", [serviceLine(1)]],
    ["no items at all", []],
  ])("%s → false, nothing written", async (_label, items) => {
    expect(await create(items)).toBe(false);
    expect(commissions()).toHaveLength(0);
  });

  it("an eligible pillow among non-eligible lines still qualifies the order", async () => {
    expect(await create([shopLine(1), bolster(2), premium(3), basicPillow(4)])).toBe(true);
    expect(commissions()).toHaveLength(1);
    expect(commissions()[0]).toMatchObject({ order_item_id: id(3), basis: "order", status: "held" });
  });

  it("two premium pillows in one order still make ONE row (per order, not per unit)", async () => {
    expect(await create([premium(1), premium(2)])).toBe(true);
    expect(commissions()).toHaveLength(1);
    expect(commissions()[0].commission_amount).toBe(50);
  });

  it("the row sits on the eligible item with the lowest id, whatever order the items arrive in", async () => {
    // id(1) is a bolster (lowest id overall, not eligible); id(2) is the lowest eligible.
    await create([premium(5), premium(2), bolster(1), premium(3)]);
    expect(commissions()).toHaveLength(1);
    expect(commissions()[0].order_item_id).toBe(id(2));
  });

  it("a second call (webhook redelivery) changes nothing", async () => {
    await create([premium(3), premium(2)], { deliveredAt: null });
    const before = structuredClone(commissions());
    // Even if the items arrive in another order and the partner's terms moved on.
    db.partners = [partnerRow({ commission_choice: 10 })];
    expect(await create([premium(2), premium(3)], { deliveredAt: null })).toBe(true);
    expect(commissions()).toEqual(before);
  });

  it("redelivery with a fixed amount does not overwrite the first row", async () => {
    await create([premium(1)], { amount: 30 });
    await create([premium(1)], { amount: 45 });
    expect(commissions()).toHaveLength(1);
    expect(commissions()[0].commission_amount).toBe(30);
  });

  it("separate orders each get their own row", async () => {
    await create([premium(1)], { orderId: ORDER });
    await create([premium(2)], { orderId: OTHER_ORDER });
    expect(commissions().map((c) => c.order_id).sort()).toEqual([ORDER, OTHER_ORDER].sort());
  });
});

describe("createHeldCommissionsForOrder — commission_amount", () => {
  it("is the amount the hold fixed, when given (not the partner's terms today)", async () => {
    db.partners = [partnerRow({ commission_pool: 50, commission_choice: null })];
    await create([premium(1)], { amount: 30 });
    expect(commissions()[0].commission_amount).toBe(30);
  });

  it("a fixed amount of 0 is still the amount given", async () => {
    await create([premium(1)], { amount: 0 });
    expect(commissions()[0].commission_amount).toBe(0);
  });

  it("without an amount: pool 50, no pick → 50", async () => {
    await create([premium(1)]);
    expect(commissions()[0].commission_amount).toBe(50);
  });

  it("without an amount: pool 50, pick 30 → 30", async () => {
    db.partners = [partnerRow({ commission_choice: 30 })];
    await create([premium(1)]);
    expect(commissions()[0].commission_amount).toBe(30);
  });

  it("without an amount: reads Postgres numerics as strings", async () => {
    db.partners = [partnerRow({ commission_pool: "60.00", commission_choice: "35.50" })];
    await create([premium(1)]);
    expect(commissions()[0].commission_amount).toBe(35.5);
  });

  it("without an amount: a pool lowered below the pick pays the pool", async () => {
    db.partners = [partnerRow({ commission_pool: 25, commission_choice: 30 })];
    await create([premium(1)]);
    expect(commissions()[0].commission_amount).toBe(25);
  });

  it("without an amount: a waiting pick counts from its day, by the Singapore calendar", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    db.partners = [
      partnerRow({ commission_choice: 30, commission_choice_next: 20, commission_choice_next_from: "2026-10-31" }),
    ];
    // 15:30Z on 30 Oct is 23:30 on 30 Oct in Singapore: the old pick.
    vi.setSystemTime(new Date("2026-10-30T15:30:00Z"));
    await create([premium(1)], { orderId: ORDER });
    // 16:30Z on 30 Oct is 00:30 on 31 Oct in Singapore: the waiting pick.
    vi.setSystemTime(new Date("2026-10-30T16:30:00Z"));
    await create([premium(2)], { orderId: OTHER_ORDER });
    const byOrder = new Map(commissions().map((c) => [c.order_id, c.commission_amount]));
    expect(byOrder.get(ORDER)).toBe(30);
    expect(byOrder.get(OTHER_ORDER)).toBe(20);
  });
});

describe("createHeldCommissionsForOrder — release_at", () => {
  it("is deliveredAt + 30 days", async () => {
    await create([premium(1)], { deliveredAt: "2026-10-01T10:00:00.000Z" });
    const releaseAt = commissions()[0].release_at as string;
    expect(Date.parse(releaseAt)).toBe(Date.parse("2026-10-31T10:00:00.000Z"));
  });

  it("is null while the order is not delivered", async () => {
    await create([premium(1)], { deliveredAt: null });
    expect(commissions()[0].release_at).toBeNull();
  });
});

describe("voidCommissionsForRma — what a refund reverses", () => {
  const RMA = "rma-1";
  // ORDER: two customised premium pillows (P1, P2), a bolster (B), a legacy shop
  // premium pillow (L). The order row sits on P1.
  const P1 = id(1);
  const P2 = id(2);
  const B = id(3);
  const L = id(4);
  // OTHER_ORDER: old per-unit rows on a premium pillow (U1) and a bolster (U2), and
  // its own order row on U1.
  const U1 = id(11);
  const U2 = id(12);

  const line = (lineId: string, orderId: string, item: CommissionItemInput) => ({
    id: lineId,
    order_id: orderId,
    kind: item.kind,
    customization_snapshot: item.customization_snapshot,
  });
  const commissionRow = (rowId: string, orderId: string, itemId: string, over: Row = {}) => ({
    id: rowId,
    order_id: orderId,
    order_item_id: itemId,
    partner_id: PARTNER,
    product_type: "pillow",
    basis: "order",
    status: "held",
    commission_amount: 50,
    voided_at: null,
    ...over,
  });

  beforeEach(() => {
    db.order_items = [
      line(P1, ORDER, premium(1)),
      line(P2, ORDER, premium(2)),
      line(B, ORDER, bolster(3)),
      line(L, ORDER, legacyPremium(4)),
      line(U1, OTHER_ORDER, premium(11)),
      line(U2, OTHER_ORDER, bolster(12)),
    ];
    db.commissions = [
      commissionRow("c-order", ORDER, P1),
      commissionRow("c-unit-1", OTHER_ORDER, U1, { basis: "unit", commission_amount: 20 }),
      commissionRow("c-unit-2", OTHER_ORDER, U2, { basis: "unit", product_type: "bolster", commission_amount: 10 }),
    ];
    db.rma_request_items = [];
  });

  const refund = (...itemIds: string[]) => {
    db.rma_request_items = itemIds.map((itemId, i) => ({ id: `ri-${i}`, rma_request_id: RMA, order_item_id: itemId }));
    return voidCommissionsForRma(admin, RMA);
  };
  const row = (rowId: string) => commissions().find((c) => c.id === rowId)!;

  it("refunding the line the order row sits on voids it", async () => {
    await refund(P1);
    expect(row("c-order").status).toBe("void");
    expect(row("c-order").voided_at).toBeTruthy();
  });

  it("refunding another Eligible Product in the order voids the order row on a different line", async () => {
    await refund(P2);
    expect(row("c-order").status).toBe("void");
    expect(row("c-order").voided_at).toBeTruthy();
  });

  it("refunding only a non-eligible line (a bolster in the same order) leaves the order row held", async () => {
    await refund(B);
    expect(row("c-order").status).toBe("held");
    expect(row("c-order").voided_at).toBeNull();
  });

  it("refunding a legacy shop premium pillow (no result_id) leaves the order row held", async () => {
    await refund(L);
    expect(row("c-order").status).toBe("held");
  });

  it("does not touch another order's rows", async () => {
    await refund(P2);
    expect(row("c-unit-1").status).toBe("held");
    expect(row("c-unit-2").status).toBe("held");
  });

  it("old per-unit rows: the row on the refunded line is voided, the other line's row stays", async () => {
    await refund(U2);
    expect(row("c-unit-2").status).toBe("void");
    expect(row("c-unit-1").status).toBe("held");
    expect(row("c-order").status).toBe("held");
  });

  it("old per-unit rows: refunding the eligible line voids its row, and the other unit row stays", async () => {
    await refund(U1);
    expect(row("c-unit-1").status).toBe("void");
    expect(row("c-unit-2").status).toBe("held");
  });

  it("an eligible refund voids the order's 'order' row even beside old unit rows of that order", async () => {
    db.commissions!.push(commissionRow("c-order-2", OTHER_ORDER, id(13)));
    await refund(U1);
    expect(row("c-order-2").status).toBe("void");
    expect(row("c-unit-2").status).toBe("held");
  });

  it("already-void rows are untouched", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T03:00:00Z"));
    row("c-order").status = "void";
    row("c-order").voided_at = "2026-09-01T00:00:00.000Z";
    await refund(P1, P2);
    expect(row("c-order")).toMatchObject({ status: "void", voided_at: "2026-09-01T00:00:00.000Z" });
  });

  it("running the same refund twice keeps the first void time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T03:00:00Z"));
    await refund(P2);
    const first = row("c-order").voided_at;
    expect(first).toBeTruthy();
    vi.setSystemTime(new Date("2026-10-28T03:00:00Z"));
    await refund(P2);
    expect(row("c-order").voided_at).toBe(first);
  });

  it("an RMA with no refunded items changes nothing", async () => {
    const before = structuredClone(commissions());
    await voidCommissionsForRma(admin, "rma-empty");
    expect(commissions()).toEqual(before);
  });
});
