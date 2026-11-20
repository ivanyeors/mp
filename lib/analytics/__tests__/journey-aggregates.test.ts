import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  loadNodeDetailsFromDb,
  loadPageTransitionsFromDb,
} from "@/lib/analytics/journey/aggregates";
import { DROP_OFF_NODE } from "@/lib/analytics/journey/drop-off-sink";

type Row = Record<string, string | null>;
const tables: Record<string, Row[]> = { analytics_visits: [], analytics_events: [], orders: [] };
const urlLengths: number[] = [];
const MAX_ROWS = 1000;

function matches(row: Row, col: string, raw: string): boolean {
  const v = row[col] ?? null;
  if (raw === "not.is.null") return v !== null;
  if (raw.startsWith("in.(")) return raw.slice(4, -1).split(",").includes(String(v));
  const [op, ...rest] = raw.split(".");
  const val = rest.join(".");
  if (v === null) return false;
  if (op === "eq") return v === val;
  if (op === "gte") return v >= val;
  if (op === "lte") return v <= val;
  throw new Error(`unsupported filter ${col}=${raw}`);
}

let server: Server;
let url = "";
const range = { from: "2026-07-01T00:00:00.000Z", to: "2026-10-31T23:59:59.999Z" };
const t0 = Date.parse("2026-07-15T00:00:00Z");

function visit(id: string, at: (min: number) => string): Row {
  return {
    id,
    visitor_id: crypto.randomUUID(),
    started_at: at(0),
    ended_at: at(2),
    drop_off_path: "/shop",
    drop_off_section: "hero",
    entry_source: "google",
    country: "SG",
    converted_order_id: null,
  };
}

function event(visitId: string, type: string, path: string, section: string | null, at: string): Row {
  return { id: crypto.randomUUID(), visit_id: visitId, type, path, section_id: section, occurred_at: at };
}

beforeAll(async () => {
  for (let i = 0; i < 1000; i++) {
    const id = crypto.randomUUID();
    const at = (min: number) => new Date(t0 + i * 3_600_000 + min * 60_000).toISOString();
    tables.analytics_events!.push(
      event(id, "page_view", "/", null, at(0)),
      event(id, "page_view", "/shop", null, at(1)),
      event(id, "section_view", "/shop", "hero", at(1)),
    );
    tables.analytics_visits!.push(visit(id, at));
  }

  const bot = crypto.randomUUID();
  const botAt = (min: number) => new Date(t0 - 3_600_000 + min * 60_000).toISOString();
  tables.analytics_visits!.push(visit(bot, botAt));
  for (let k = 0; k < 1500; k++) {
    const at = new Date(t0 - 3_600_000 + k * 10).toISOString();
    tables.analytics_events!.push(event(bot, "section_view", "/bot", k % 2 ? "b" : "a", at));
  }

  const tied = crypto.randomUUID();
  const tiedAt = (min: number) => new Date(t0 - 7_200_000 + min * 60_000).toISOString();
  tables.analytics_visits!.push(visit(tied, tiedAt));
  tables.analytics_events!.push(
    { ...event(tied, "section_view", "/tied", "hero", tiedAt(1)), id: "ffffffff-0000-4000-8000-000000000000" },
    { ...event(tied, "section_view", "/tied", "reviews", tiedAt(1)), id: "00000000-0000-4000-8000-000000000000" },
  );

  server = createServer({ maxHeaderSize: 1 << 20 }, (req, res) => {
    urlLengths.push(req.url!.length);
    const u = new URL(req.url!, "http://x");
    let rows = [...(tables[u.pathname.replace("/rest/v1/", "")] ?? [])];
    for (const [col, raw] of u.searchParams) {
      if (["select", "limit", "offset", "order"].includes(col)) continue;
      rows = rows.filter((r) => matches(r, col, raw));
    }
    const keys = (u.searchParams.get("order") ?? "").split(",").filter(Boolean);
    rows.sort((a, b) => {
      for (const k of keys) {
        const col = k.split(".")[0]!;
        const x = a[col] ?? "";
        const y = b[col] ?? "";
        if (x !== y) return x < y ? -1 : 1;
      }
      return 0;
    });
    const offset = Number(u.searchParams.get("offset") ?? 0);
    const limit = Math.min(Number(u.searchParams.get("limit") ?? MAX_ROWS), MAX_ROWS);
    rows = rows.slice(offset, offset + limit);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(rows));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

const db = () => createClient(url, "test-key", { auth: { persistSession: false } });

it("keeps every request URL bounded however many Visits are in range", async () => {
  const graph = await loadPageTransitionsFromDb(db(), range);

  expect(Math.max(...urlLengths)).toBeLessThan(9_000);
  expect(graph.nodes.find((n) => n.path === DROP_OFF_NODE)?.views).toBe(1002);
  expect(graph.edges.find((e) => e.from === "/" && e.to === "/shop")?.count).toBe(1000);
});

it("reads past Supabase's 1,000-row cap without losing rows", async () => {
  const graph = await loadPageTransitionsFromDb(db(), range);
  const views = (path: string) =>
    graph.sections.filter((s) => s.path === path).reduce((n, s) => n + s.views, 0);

  expect(views("/shop")).toBe(1000);
  expect(views("/bot")).toBe(1500);
});

it("keeps events that share a timestamp in stored order", async () => {
  const graph = await loadPageTransitionsFromDb(db(), range);

  expect(graph.sectionEdges.filter((e) => e.path === "/tied")).toEqual([
    { path: "/tied", fromSection: "hero", toSection: "reviews", count: 1 },
  ]);
});

it("answers every selected node from one read", async () => {
  const [shop, home] = await loadNodeDetailsFromDb(db(), { ...range, paths: ["/shop", "/"] });

  expect(shop?.path).toBe("/shop");
  expect(shop?.detail?.exitSections).toEqual([{ sectionId: "hero", count: 1002, sharePct: 100 }]);
  expect(home?.detail?.outbound).toEqual([{ to: "/shop", count: 1000 }]);
});

it("refuses a range too large to chart instead of loading it", async () => {
  const at = (min: number) => new Date(t0 + min * 60_000).toISOString();
  for (let i = 0; i < 19_000; i++) tables.analytics_visits!.push(visit(crypto.randomUUID(), at));

  await expect(loadPageTransitionsFromDb(db(), range)).rejects.toThrow(/shorter date range/);
}, 30_000);
