import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, expect, it } from "vitest";
import { loadPageTransitionsFromDb } from "@/lib/analytics/journey/aggregates";
import { DROP_OFF_NODE } from "@/lib/analytics/journey/drop-off-sink";

/**
 * Enough PostgREST over HTTP for the journey loader, so the real supabase-js
 * builds every request. `.in()` lists land in the URL; past Node's 16 KB header
 * limit the Prospect journey card died with "TypeError: fetch failed".
 */
type Row = Record<string, string | null>;
const tables: Record<string, Row[]> = { analytics_visits: [], analytics_events: [], orders: [] };
const urlLengths: number[] = [];

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

beforeAll(async () => {
  const visits = 1000;
  const t0 = Date.parse("2026-07-15T00:00:00Z");
  for (let i = 0; i < visits; i++) {
    const id = crypto.randomUUID();
    const at = (min: number) => new Date(t0 + i * 3_600_000 + min * 60_000).toISOString();
    tables.analytics_events!.push(
      { visit_id: id, type: "page_view", path: "/", section_id: null, occurred_at: at(0) },
      { visit_id: id, type: "page_view", path: "/shop", section_id: null, occurred_at: at(1) },
      { visit_id: id, type: "section_view", path: "/shop", section_id: "hero", occurred_at: at(1) },
    );
    tables.analytics_visits!.push({
      id,
      visitor_id: crypto.randomUUID(),
      started_at: at(0),
      ended_at: at(2),
      drop_off_path: "/shop",
      drop_off_section: "hero",
      entry_source: "google",
      country: "SG",
      converted_order_id: null,
    });
  }

  // Large header limit: the Supabase gateway accepts long URLs, so only the
  // client-side limit is under test.
  server = createServer({ maxHeaderSize: 1 << 20 }, (req, res) => {
    urlLengths.push(req.url!.length);
    const u = new URL(req.url!, "http://x");
    let rows = [...(tables[u.pathname.replace("/rest/v1/", "")] ?? [])];
    for (const [col, raw] of u.searchParams) {
      if (col === "select" || col === "limit" || col === "order") continue;
      rows = rows.filter((r) => matches(r, col, raw));
    }
    if (u.searchParams.get("order")?.startsWith("occurred_at")) {
      rows.sort((a, b) => a.occurred_at!.localeCompare(b.occurred_at!));
    }
    rows = rows.slice(0, Number(u.searchParams.get("limit") ?? rows.length));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(rows));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

it("keeps every request URL bounded however many Visits are in range", async () => {
  const db = createClient(url, "test-key", { auth: { persistSession: false } });
  const graph = await loadPageTransitionsFromDb(db, {
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-10-31T23:59:59.999Z",
  });

  expect(Math.max(...urlLengths)).toBeLessThan(9_000);
  // Every Visit still counted — chunking drops nothing.
  expect(graph.nodes.find((n) => n.path === DROP_OFF_NODE)?.views).toBe(1000);
  expect(graph.edges.find((e) => e.from === "/" && e.to === "/shop")?.count).toBe(1000);
});
