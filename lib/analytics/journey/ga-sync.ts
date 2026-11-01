/**
 * GA4 → DB staging + Visitor stitch (ADR 0007).
 * Hobby: chained after Shopify catch-up on /api/cron/results-sla (not a 3rd vercel cron).
 *
 * BQ creds absent → load fixture JSON:
 *   lib/analytics/journey/fixtures/ga-bq-export.json
 * Override: GA_SYNC_FIXTURE_PATH (absolute or cwd-relative).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

/** `_ga=GA1.2.123.456` → `123.456` (GA client_id / user_pseudo_id shape). */
export function parseGaClientIdFromCookie(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parts = raw.trim().split(".");
  if (parts.length < 4) return null;
  const id = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  return /^\d+\.\d+$/.test(id) ? id : null;
}

export function normalizeGaClientId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > 128) return null;
  // Cookie-derived or GA4 user_pseudo_id / client_id
  if (/^\d+\.\d+$/.test(s)) return s;
  if (/^[0-9A-Za-z_.-]{8,128}$/.test(s)) return s;
  return null;
}

export type GaExportRow = {
  clientId: string;
  eventName: string;
  eventTimestamp: string;
  raw: Record<string, unknown>;
};

/** Accept BQ-ish export shapes (client_id | user_pseudo_id, event_name, event_timestamp|event_date). */
export function parseGaExportRows(raw: unknown): GaExportRow[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { rows?: unknown }).rows)
      ? (raw as { rows: unknown[] }).rows
      : null;
  if (!list) return [];

  const out: GaExportRow[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const clientId = normalizeGaClientId(
      o.client_id ?? o.clientId ?? o.user_pseudo_id ?? o.userPseudoId,
    );
    if (!clientId) continue;
    const eventName =
      typeof o.event_name === "string"
        ? o.event_name
        : typeof o.eventName === "string"
          ? o.eventName
          : "unknown";
    const tsRaw = o.event_timestamp ?? o.eventTimestamp ?? o.event_date ?? o.eventDate;
    let eventTimestamp: string;
    if (typeof tsRaw === "number" && Number.isFinite(tsRaw)) {
      // ponytail: BQ micros vs ms — treat ≥1e14 as micros
      const ms = tsRaw >= 1e14 ? Math.floor(tsRaw / 1000) : tsRaw;
      eventTimestamp = new Date(ms).toISOString();
    } else if (typeof tsRaw === "string" && !Number.isNaN(Date.parse(tsRaw))) {
      eventTimestamp = new Date(tsRaw).toISOString();
    } else {
      eventTimestamp = new Date(0).toISOString();
    }
    out.push({
      clientId,
      eventName,
      eventTimestamp,
      raw: o as Record<string, unknown>,
    });
  }
  return out;
}

export function defaultGaFixturePath(): string {
  const env = process.env.GA_SYNC_FIXTURE_PATH?.trim();
  if (env) return env;
  return join(process.cwd(), "lib/analytics/journey/fixtures/ga-bq-export.json");
}

export function loadGaExportFixture(path: string = defaultGaFixturePath()): GaExportRow[] {
  try {
    // A path chosen at run time (GA_SYNC_FIXTURE_PATH), so the build cannot
    // know the file. Without the ignore, Turbopack copies the whole project
    // (graphify-out, public, every source file) into the results-sla cron
    // function, which then passes Vercel's 250 MB limit. The cron reads a
    // fixture only when that variable is set; the check script runs locally.
    const text = readFileSync(/*turbopackIgnore: true*/ path, "utf8");
    return parseGaExportRows(JSON.parse(text) as unknown);
  } catch {
    return [];
  }
}

/** Pure stitch: match staging client_id → visitor.id where ga_client_id equals. */
export function stitchGaRowsToVisitors(
  rows: { id: string; clientId: string; visitorId: string | null }[],
  visitors: { id: string; gaClientId: string | null }[],
): { id: string; visitorId: string }[] {
  const byGa = new Map<string, string>();
  for (const v of visitors) {
    if (v.gaClientId) byGa.set(v.gaClientId, v.id);
  }
  const updates: { id: string; visitorId: string }[] = [];
  for (const row of rows) {
    if (row.visitorId) continue;
    const vid = byGa.get(row.clientId);
    if (vid) updates.push({ id: row.id, visitorId: vid });
  }
  return updates;
}

export type GaSyncResult = {
  ok: true;
  source: "fixture" | "empty";
  loaded: number;
  inserted: number;
  stitched: number;
};

/**
 * Load GA rows, insert staging, stitch to Visitors.
 * Rows source: opts.rows → else GA_SYNC_FIXTURE_PATH file → else empty (stitch-only).
 * ponytail: no @google-cloud/bigquery dep — wire BQ fetch when creds exist; fixture covers AC until then.
 */
export async function runGaSync(
  db: SupabaseClient,
  opts?: { rows?: GaExportRow[]; fixturePath?: string },
): Promise<GaSyncResult> {
  let rows: GaExportRow[];
  let source: GaSyncResult["source"];
  if (opts?.rows) {
    rows = opts.rows;
    source = "fixture";
  } else if (opts?.fixturePath || process.env.GA_SYNC_FIXTURE_PATH?.trim()) {
    // Explicit path only — avoid re-inserting default fixture on every daily cron.
    rows = loadGaExportFixture(opts?.fixturePath ?? defaultGaFixturePath());
    source = "fixture";
  } else {
    rows = [];
    source = "empty";
  }

  let inserted = 0;
  if (rows.length > 0) {
    const payload = rows.map((r) => ({
      client_id: r.clientId,
      event_name: r.eventName,
      event_timestamp: r.eventTimestamp,
      raw: r.raw,
    }));
    const { error, data } = await db
      .from("analytics_ga_events")
      .insert(payload)
      .select("id");
    if (error) throw new Error(error.message);
    inserted = data?.length ?? payload.length;
  }

  const stitched = await stitchUnlinkedGaEvents(db);
  return { ok: true, source, loaded: rows.length, inserted, stitched };
}

export async function stitchUnlinkedGaEvents(db: SupabaseClient): Promise<number> {
  const { data: unlinked, error: uErr } = await db
    .from("analytics_ga_events")
    .select("id, client_id, visitor_id")
    .is("visitor_id", null)
    .limit(2000);
  if (uErr) throw new Error(uErr.message);
  if (!unlinked?.length) return 0;

  const clientIds = [...new Set(unlinked.map((r) => r.client_id as string))];
  const { data: visitors, error: vErr } = await db
    .from("analytics_visitors")
    .select("id, ga_client_id")
    .in("ga_client_id", clientIds)
    .limit(2000);
  if (vErr) throw new Error(vErr.message);

  const updates = stitchGaRowsToVisitors(
    unlinked.map((r) => ({
      id: r.id as string,
      clientId: r.client_id as string,
      visitorId: (r.visitor_id as string | null) ?? null,
    })),
    (visitors ?? []).map((v) => ({
      id: v.id as string,
      gaClientId: (v.ga_client_id as string | null) ?? null,
    })),
  );

  let n = 0;
  for (const u of updates) {
    const { error } = await db
      .from("analytics_ga_events")
      .update({ visitor_id: u.visitorId })
      .eq("id", u.id)
      .is("visitor_id", null);
    if (!error) n += 1;
  }
  return n;
}
