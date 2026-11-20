import { describe, expect, it, vi } from "vitest";
import type { Permission } from "@/lib/auth/permissions";
import { loadTimeline } from "@/lib/crm/timeline/load";
import type { TimelineAdapter, TimelineEntry } from "@/lib/crm/timeline/types";

const customer = { id: "c1", email: "mei@x.test" };
const viewer = (...keys: Permission[]) => ({ permissions: new Set<Permission>(keys) });

const entry = (id: string, minute: number, href?: string): TimelineEntry => ({
  id,
  at: new Date(Date.UTC(2026, 9, 1, 0, minute)).toISOString(),
  kind: `${id}.x`,
  ref: { type: "t", id, ...(href ? { href } : {}) },
  summary: id,
});

const adapter = (key: string, permission: Permission, entries: TimelineEntry[]): TimelineAdapter => ({
  key,
  group: { key, label: key.toUpperCase() },
  kinds: [`${key}.x`],
  permission,
  load: vi.fn(async () => ({ entries, floor: null })),
});

describe("loadTimeline", () => {
  it("never asks a source the viewer may not see, and offers only the chips they may", async () => {
    const orders = adapter("orders", "orders", [entry("o", 2)]);
    const notes = adapter("notes", "customers", [entry("n", 1)]);
    const page = await loadTimeline({ customer, viewer: viewer("customers"), groups: null, after: null, adapters: [orders, notes] });
    expect(orders.load).not.toHaveBeenCalled();
    expect(page.entries.map((e) => e.id)).toEqual(["n"]);
    expect(page.groups).toEqual([{ key: "notes", label: "NOTES" }]);
  });

  it("runs only the groups asked for, and tags each entry with its group", async () => {
    const orders = adapter("orders", "orders", [entry("o", 2)]);
    const notes = adapter("notes", "customers", [entry("n", 1)]);
    const page = await loadTimeline({
      customer,
      viewer: viewer("customers", "orders"),
      groups: new Set(["orders"]),
      after: null,
      adapters: [orders, notes],
    });
    expect(notes.load).not.toHaveBeenCalled();
    expect(page.entries).toMatchObject([{ id: "o", group: "orders" }]);
    expect(page.groups.map((g) => g.key)).toEqual(["orders", "notes"]);
  });

  it("drops a link to a page the viewer cannot open, and keeps the entry", async () => {
    const linked = adapter("reviews", "customers", [entry("r", 1, "/settings/orders/o1")]);
    const without = await loadTimeline({ customer, viewer: viewer("customers"), groups: null, after: null, adapters: [linked] });
    expect(without.entries[0]!.ref).toEqual({ type: "t", id: "r" });
    const withOrders = await loadTimeline({ customer, viewer: viewer("customers", "orders"), groups: null, after: null, adapters: [linked] });
    expect(withOrders.entries[0]!.ref.href).toBe("/settings/orders/o1");
  });

  it("shows the rest of the page when one source fails, and names it", async () => {
    const broken: TimelineAdapter = { ...adapter("results", "results", []), load: async () => Promise.reject(new Error("boom")) };
    const notes = adapter("notes", "customers", [entry("n", 1)]);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const page = await loadTimeline({ customer, viewer: viewer("customers", "results"), groups: null, after: null, adapters: [broken, notes] });
    expect(page.entries.map((e) => e.id)).toEqual(["n"]);
    expect(page.unavailable).toEqual(["RESULTS"]);
    expect(errors).toHaveBeenCalledWith("[timeline] results failed: boom");
    errors.mockRestore();
  });
});
