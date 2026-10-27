import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";
import { customerFilterParams, parseCustomerFilters } from "@/lib/crm/customer-filters";
import type { CustomerOverviewRow, PurchaseClass } from "@/lib/crm/customer-overview";
import { SEGMENT_FILTERS_VERSION, parseSegmentFilters, segmentParams } from "@/lib/crm/segment-rules";

/**
 * CRM 05: Segments over the Customer overview, through the list's own filter
 * mapping. A Segment and the same filters in the URL return identical
 * Customers; one with a filter the schema no longer recognises counts and
 * resolves none; live names are unique; and `resolveSegment` yields every id
 * once, ordered by id, however it is paged.
 */

const h = vi.hoisted(() => ({ db: {} as FakeDb }));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const { listAdminCustomers } = await import("@/lib/ecommerce/admin/customers");
const {
  RESOLVE_PAGE_SIZE,
  SegmentNameTakenError,
  SegmentUnavailableError,
  archiveSegment,
  createSegment,
  listSegments,
  resolveSegment,
  updateSegment,
} = await import("@/lib/crm/segments");

const NOW = new Date("2026-10-21T04:00:00.000Z");
const MONTH = 30 * 24 * 3600 * 1000;

/** A deterministic id; `n` sorts the same way the uuid does. */
const customerId = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const segmentId = (n: number) => `5e000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const BOUGHT: PurchaseClass[][] = [[], ["premium"], ["basic"], ["premium", "mbolster"], ["accessory"]];

/** One overview row per Customer, varied on every filter a Segment can save. */
function overviewRow(n: number): Partial<CustomerOverviewRow> {
  const paidMonthsAgo = n % 7 === 0 ? null : (n % 30) + 1;
  return {
    id: customerId(n),
    email: `c${n}@x.test`,
    first_name: n % 11 === 0 ? "Mei" : `First${n}`,
    last_name: n % 13 === 0 ? "Tan" : `Last${n}`,
    tags: n % 9 === 0 ? ["vip"] : [],
    total_spent: (n % 20) * 50,
    created_at: new Date(Date.UTC(2025, 0, 1) + n * 3600_000).toISOString(),
    has_account: n % 2 === 0,
    from_shopify: n % 3 === 0,
    account_providers: n % 4 === 0 ? ["email", "google"] : n % 2 === 0 ? ["email"] : [],
    has_phone: n % 5 !== 0,
    phone_valid: n % 5 !== 0 && n % 10 !== 1,
    points_available: n % 6 === 0 ? 1000 : 0,
    claim_bonus_at: n % 6 === 0 ? "2026-10-01T00:00:00Z" : null,
    marketing_email: n % 5 === 0 ? "subscribed" : n % 5 === 1 ? "unsubscribed" : "not_subscribed",
    open_followups: n % 8 === 0 ? 1 : 0,
    last_paid_at: paidMonthsAgo == null ? null : new Date(NOW.getTime() - paidMonthsAgo * MONTH).toISOString(),
    // Slice 03: *Last order* reads purchases. Here every paid Order is one.
    last_purchase_at: paidMonthsAgo == null ? null : new Date(NOW.getTime() - paidMonthsAgo * MONTH).toISOString(),
    bought: BOUGHT[n % BOUGHT.length],
    last_readjusted_at: n % 4 === 1 ? "2026-01-10T02:00:00.000Z" : null,
    search_text: `c${n}@x.test ${n % 11 === 0 ? "mei" : `first${n}`} ${n % 13 === 0 ? "tan" : `last${n}`}`,
  };
}

/** `count` Customers, stored out of id order so ordering is the code's, not the fixture's. */
function customers(count: number) {
  const rows = Array.from({ length: count }, (_, i) => overviewRow(i + 1));
  return rows.map((_, i) => rows[(i * 7919) % count]!);
}

beforeEach(() => {
  h.db = {
    admin_customer_overview: customers(120),
    customer_segments: [],
    mp_staff: [{ id: "p-jess", name: "Jess", admin_user_id: "m-1", archived_at: null }],
  };
});

/** Every id the Customers list shows for `url`, page after page, as the list reads them. */
async function listIds(url: string): Promise<{ ids: string[]; total: number }> {
  const { filters } = parseCustomerFilters(new URLSearchParams(url));
  const ids: string[] = [];
  let total = 0;
  for (let page = 1; ; page++) {
    const res = await listAdminCustomers(customerFilterParams({ ...filters, page, limit: 20 }, { paging: true }));
    if (!res.ok) throw new Error(res.error);
    total = res.total;
    ids.push(...res.rows.map((r) => r.id));
    if (res.rows.length < 20) break;
  }
  return { ids, total };
}

async function resolveAll(id: string, pageSize?: number): Promise<{ ids: string[]; pages: number }> {
  const ids: string[] = [];
  let pages = 0;
  for await (const page of resolveSegment(id, { pageSize, now: NOW })) {
    ids.push(...page);
    pages++;
  }
  return { ids, pages };
}

/** Saves the list's `url` as a Segment, as *Save as Segment* does. */
async function saveFromUrl(name: string, url: string) {
  const { filters } = parseCustomerFilters(new URLSearchParams(url));
  // What the Segments row sends: the list's filters, as a Segment saves them.
  const input = parseSegmentFilters(segmentParams(filters));
  if (!input.ok) throw new Error(input.error);
  return createSegment(name, input.params, "p-jess", { now: NOW });
}

describe("a Segment and the same filters in the URL", () => {
  it.each([
    "bought=premium&last_order=over:12&readjusted=never",
    "source=shopify&account=no-account",
    "account=signed-up&google=linked",
    "google=not-linked&mobile=invalid",
    "mobile=missing",
    "points=has&followups=open",
    "points=none&source=shopify",
    "consent=subscribed&readjusted=never",
    "consent=not-subscribed",
    "bought=basic,accessory&min_spend=300",
    "last_order=within:6",
    "tags=vip",
    "search=mei",
    "search=tan&readjusted=ever",
  ])("return identical Customers: %s", async (url) => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    try {
      const list = await listIds(url);
      const segment = await saveFromUrl(`Segment ${url}`, url);
      const resolved = await resolveAll(segment.id);

      // Each filter set chooses some Customers, never all 120.
      expect(list.ids.length).toBeGreaterThan(0);
      expect(list.ids.length).toBeLessThan(120);
      expect(new Set(resolved.ids)).toEqual(new Set(list.ids));
      expect(resolved.ids).toHaveLength(list.ids.length);
      // The chip's live count is the list's total.
      expect(segment.count).toBe(list.total);
      expect((await listSegments({ now: NOW })).find((s) => s.id === segment.id)?.count).toBe(list.total);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("a Segment the schema no longer fully recognises", () => {
  const stored = (filters: unknown, version = 1) => {
    h.db.customer_segments.push({
      id: segmentId(9),
      name: "Old one",
      filters,
      filters_version: version,
      created_by_profile_id: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
      archived_at: null,
    });
    return segmentId(9);
  };

  it.each([
    [{ bought: "premium", region: "east" }, 1, ["region=east"]],
    [{ bought: "premium,pillowcase" }, 1, ["bought=premium,pillowcase"]],
    [{ bought: "premium" }, 3, ["bought=premium"]],
    [{ voucher: "issued" }, 1, ["voucher=issued"]],
  ])("%j (version %i) needs review, names %j, and is not counted", async (filters, version, ignored) => {
    stored(filters, version);
    const [row] = await listSegments({ now: NOW });
    expect(row).toMatchObject({ id: segmentId(9), needsReview: true, ignored, count: null });
  });

  it("returns no Customers: resolveSegment refuses before reading any", async () => {
    const id = stored({ bought: "premium", region: "east" });
    const first = resolveSegment(id, { now: NOW }).next();
    await expect(first).rejects.toBeInstanceOf(SegmentUnavailableError);
    await expect(resolveSegment(id).next()).rejects.toMatchObject({ reason: "needs_review", ignored: ["region=east"] });
  });

  // PRD-loyalty-points slice 06: a Segment saved with the retired voucher
  // filter, at filters_version 1, still opens and returns the same Customers
  // as its other filters do.
  it("a version-1 Segment with voucher= opens and returns the same Customers, minus that filter", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    try {
      const id = stored({ source: "shopify", voucher: "issued", bought: "premium" }, 1);
      const list = await listIds("source=shopify&bought=premium");
      expect(list.ids.length).toBeGreaterThan(0);
      const [row] = await listSegments({ now: NOW });
      expect(row).toMatchObject({
        id,
        needsReview: false,
        ignored: [],
        params: { source: "shopify", bought: "premium" },
        count: list.total,
      });
      const { ids } = await resolveAll(id);
      expect(new Set(ids)).toEqual(new Set(list.ids));
      expect(ids).toHaveLength(list.ids.length);

      // Updated, it is saved at the current version, without the voucher.
      await updateSegment(id, { name: "Renamed" }, { now: NOW });
      expect(h.db.customer_segments[0]).toMatchObject({ filters: { source: "shopify", voucher: "issued", bought: "premium" } });
      await updateSegment(id, { params: { source: "shopify", bought: "premium" } }, { now: NOW });
      expect(h.db.customer_segments[0]).toMatchObject({
        filters: { source: "shopify", bought: "premium" },
        filters_version: SEGMENT_FILTERS_VERSION,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("is resolved again once updated with filters the schema knows", async () => {
    const id = stored({ bought: "premium", region: "east" });
    const updated = await updateSegment(id, { params: { bought: "premium" } }, { now: NOW });
    expect(updated).toMatchObject({ needsReview: false, ignored: [] });
    const { ids } = await resolveAll(id);
    expect(ids.length).toBe(updated!.count);
    expect(ids.length).toBeGreaterThan(0);
  });
});

describe("Segment names", () => {
  it("two live Segments cannot share a name, in any case", async () => {
    await saveFromUrl("Premium, lapsed", "bought=premium");
    await expect(saveFromUrl("premium, LAPSED", "bought=basic")).rejects.toBeInstanceOf(SegmentNameTakenError);
    expect(h.db.customer_segments).toHaveLength(1);
  });

  it("renaming onto a live name is refused; onto its own name in another case is not", async () => {
    const a = await saveFromUrl("Premium", "bought=premium");
    await saveFromUrl("Basic", "bought=basic");
    // The fake's ids are not uuids; give them real ones as the database would.
    h.db.customer_segments[0]!.id = segmentId(1);
    h.db.customer_segments[1]!.id = segmentId(2);
    await expect(updateSegment(segmentId(1), { name: "BASIC" })).rejects.toBeInstanceOf(SegmentNameTakenError);
    expect(await updateSegment(segmentId(1), { name: "PREMIUM" })).toMatchObject({ name: "PREMIUM" });
    expect(a.name).toBe("Premium");
  });

  it("an archived name can be reused, and an archived Segment is not listed or resolved", async () => {
    await saveFromUrl("Premium, lapsed", "bought=premium");
    const old = h.db.customer_segments[0]!;
    old.id = segmentId(1);
    expect(await archiveSegment(segmentId(1))).toEqual(expect.any(String));
    expect(await archiveSegment(segmentId(1))).toBeNull();
    const again = await saveFromUrl("Premium, lapsed", "bought=premium");
    expect((await listSegments({ now: NOW })).map((s) => s.id)).toEqual([again.id]);
    await expect(resolveSegment(segmentId(1)).next()).rejects.toMatchObject({ reason: "archived" });
    await expect(resolveSegment(segmentId(404)).next()).rejects.toMatchObject({ reason: "not_found" });
    expect(await updateSegment(segmentId(1), { name: "Back" })).toBeNull();
  });

  it("lists live Segments by name, case aside, with who saved them", async () => {
    await saveFromUrl("zebra", "bought=premium");
    await saveFromUrl("Apple", "bought=basic");
    await saveFromUrl("banana", "tags=vip");
    const rows = await listSegments({ now: NOW });
    expect(rows.map((s) => s.name)).toEqual(["Apple", "banana", "zebra"]);
    expect(rows[0]!.createdBy).toEqual({ id: "p-jess", name: "Jess" });
  });
});

describe("resolveSegment over 1,000 Customers", () => {
  beforeEach(() => {
    h.db.admin_customer_overview = customers(1000);
  });

  /** A stored Segment, as the database holds it. */
  const seed = (filters: Record<string, string>) => {
    h.db.customer_segments.push({
      id: segmentId(1),
      name: "Fixture",
      filters,
      filters_version: 1,
      created_by_profile_id: null,
      archived_at: null,
    });
    return segmentId(1);
  };

  const sorted = (ids: string[]) => [...ids].sort();

  it.each([1, 7, 128, RESOLVE_PAGE_SIZE, 1000, 5000])("yields each id exactly once, in id order, %i a page", async (pageSize) => {
    // Matches every fixture Customer: everyone has a search_text with "@x.test".
    const id = seed({ search: "@x.test" });
    const { ids, pages } = await resolveAll(id, pageSize);
    expect(ids).toHaveLength(1000);
    expect(new Set(ids).size).toBe(1000);
    expect(ids).toEqual(sorted(h.db.admin_customer_overview.map((r) => r.id as string)));
    // Full pages, then the empty page that ends the run.
    expect(pages).toBe(Math.ceil(1000 / pageSize));
    // One page per id at size 1 is a thousand fake-database scans: slow on a
    // loaded machine, not wrong.
  }, 30_000);

  it("yields exactly the Customers the filters choose", async () => {
    const id = seed({ bought: "premium", readjusted: "never" });
    const { ids } = await resolveAll(id, 64);
    const expected = h.db.admin_customer_overview
      .filter((r) => (r.bought as string[]).includes("premium") && r.last_readjusted_at == null)
      .map((r) => r.id as string);
    expect(expected.length).toBeGreaterThan(100);
    expect(ids).toEqual(sorted(expected));
  });

  it("stays stable when Customers are added mid-run: no id twice, none of the first skipped", async () => {
    const id = seed({ search: "@x.test" });
    const before = new Set(h.db.admin_customer_overview.map((r) => r.id as string));
    const seen: string[] = [];
    let added = 0;
    for await (const page of resolveSegment(id, { pageSize: 100, now: NOW })) {
      seen.push(...page);
      if (added < 3) {
        // One sorts before the cursor (not yielded), one after (yielded once).
        h.db.admin_customer_overview.push(
          { ...overviewRow(2000 + added), id: customerId(0) + String(added) },
          { ...overviewRow(3000 + added), id: customerId(999_000 + added) },
        );
        added++;
      }
    }
    expect(new Set(seen).size).toBe(seen.length);
    for (const original of before) expect(seen).toContain(original);
  });

  it("rejects a page size that is not a whole number above 0", async () => {
    const id = seed({ search: "@x.test" });
    await expect(resolveSegment(id, { pageSize: 0 }).next()).rejects.toBeInstanceOf(RangeError);
    await expect(resolveSegment(id, { pageSize: 2.5 }).next()).rejects.toBeInstanceOf(RangeError);
  });
});
