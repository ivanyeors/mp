#!/usr/bin/env node
/**
 * Per-route first-load JS budget check.
 *
 * Run after `next build`. Turbopack does not emit a machine-readable first-load
 * summary, so this reconstructs one from the build output:
 *
 *   - Every client route leaves a `page_client-reference-manifest.js` under
 *     `.next/server/app/<route>/`. Its `"entryJSFiles"` object maps each client
 *     entry to the `static/chunks/*.js` it needs; the union over all entries is
 *     the route's own client JS.
 *   - The framework/runtime chunks every route also pays for live in
 *     `rootMainFiles` and `polyfillFiles` of the sibling
 *     `.next/server/app/<route>/page/build-manifest.json`.
 *
 * First-load JS = gzip size of that union. That is what a visitor downloads
 * before the route is interactive, which is the number worth defending.
 *
 * Usage:
 *   node scripts/bundle-budget.mjs            # print table, enforce budgets
 *   node scripts/bundle-budget.mjs --update   # re-baseline budgets to today
 *   node scripts/bundle-budget.mjs --json     # machine-readable output
 *
 * Budgets live in scripts/bundle-budget.json as { "<route pattern>": maxGzipKB }.
 * A pattern is either an exact route or a `/**` suffix glob; `"**"` is the
 * catch-all. The most specific matching pattern wins, so a directory budget can
 * be loosened for one heavy subtree without loosening it for the whole app.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";

const NEXT_DIR = ".next";
const APP_DIR = path.join(NEXT_DIR, "server", "app");
const BUDGET_FILE = path.join("scripts", "bundle-budget.json");

/** Headroom applied by --update, then rounded up to the next 5 KB. */
const HEADROOM = 1.08;
const ROUND_TO = 5;

const args = new Set(process.argv.slice(2));
const UPDATE = args.has("--update");
const AS_JSON = args.has("--json");

// ---------------------------------------------------------------- measurement

const sizeCache = new Map();

/** Raw and gzip size of one build asset, addressed relative to `.next/`. */
function measure(file) {
  const cached = sizeCache.get(file);
  if (cached) return cached;

  const abs = path.join(NEXT_DIR, file);
  let entry = { raw: 0, gzip: 0 };
  if (fs.existsSync(abs)) {
    const buf = fs.readFileSync(abs);
    // Level 9 keeps the number stable across Node versions; CDNs compress at
    // least this well, so it is a fair floor for what a visitor downloads.
    entry = { raw: buf.length, gzip: zlib.gzipSync(buf, { level: 9 }).length };
  }
  sizeCache.set(file, entry);
  return entry;
}

function findManifests(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findManifests(p, out);
    else if (e.name === "page_client-reference-manifest.js") out.push(p);
  }
  return out;
}

/**
 * Pull `"entryJSFiles":{...}` out of a client reference manifest.
 *
 * The manifest is a JS file that assigns a large object literal, so it is not
 * JSON-parseable as a whole. The entryJSFiles value itself is plain JSON, and
 * it is followed either by `"entryCSSFiles"` or by the end of the object.
 */
function parseEntryJSFiles(source) {
  const m = source.match(/"entryJSFiles":(\{.*?\})(?:,"entryCSSFiles"|\})/s);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function collectRoutes() {
  if (!fs.existsSync(APP_DIR)) {
    console.error(
      `No build output at ${APP_DIR}. Run \`next build\` before the bundle check.`,
    );
    process.exit(2);
  }

  const rows = [];
  for (const manifestPath of findManifests(APP_DIR)) {
    const route =
      manifestPath
        .slice(APP_DIR.length)
        .replace(/[\\/]page_client-reference-manifest\.js$/, "")
        .replace(/\\/g, "/") || "/";

    const entries = parseEntryJSFiles(fs.readFileSync(manifestPath, "utf8"));
    if (!entries) continue;

    const files = new Set();
    for (const list of Object.values(entries)) {
      for (const f of list) files.add(f);
    }

    // Shared runtime + polyfills: paid on first load of every route.
    const buildManifest = path.join(
      path.dirname(manifestPath),
      "page",
      "build-manifest.json",
    );
    if (fs.existsSync(buildManifest)) {
      const bm = JSON.parse(fs.readFileSync(buildManifest, "utf8"));
      for (const f of bm.rootMainFiles ?? []) files.add(f);
      for (const f of bm.polyfillFiles ?? []) files.add(f);
    }

    const js = [...files].filter((f) => f.endsWith(".js"));
    let raw = 0;
    let gzip = 0;
    for (const f of js) {
      const s = measure(f);
      raw += s.raw;
      gzip += s.gzip;
    }

    rows.push({ route, chunks: js.length, rawKB: raw / 1024, gzipKB: gzip / 1024 });
  }

  rows.sort((a, b) => b.gzipKB - a.gzipKB || a.route.localeCompare(b.route));
  return rows;
}

// -------------------------------------------------------------------- budgets

function readBudgets() {
  if (!fs.existsSync(BUDGET_FILE)) return null;
  return JSON.parse(fs.readFileSync(BUDGET_FILE, "utf8"));
}

/**
 * Specificity of a pattern, higher wins.
 *
 * An exact route always beats a glob. Between globs, the longer prefix is the
 * more specific one, so `/[lang]/settings/**` outranks `/[lang]/**`. The bare
 * `**` catch-all always ranks last.
 */
function specificity(pattern) {
  if (pattern === "**") return -1;
  if (pattern.endsWith("/**")) return pattern.length - 3;
  return 1_000_000 + pattern.length;
}

function matches(pattern, route) {
  if (pattern === "**") return true;
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return route.startsWith(prefix + "/");
  }
  return pattern === route;
}

/** The single budget entry that governs a route, or null if none matches. */
function budgetFor(budgets, route) {
  let best = null;
  for (const [pattern, limit] of Object.entries(budgets)) {
    if (!matches(pattern, route)) continue;
    const rank = specificity(pattern);
    if (!best || rank > best.rank) best = { pattern, limit, rank };
  }
  return best;
}

function withHeadroom(gzipKB) {
  return Math.ceil((gzipKB * HEADROOM) / ROUND_TO) * ROUND_TO;
}

// --------------------------------------------------------------------- output

function printTable(rows, budgets) {
  const cols = [
    { head: "route", get: (r) => r.route, pad: "end" },
    { head: "chunks", get: (r) => String(r.chunks), pad: "start" },
    { head: "raw KB", get: (r) => r.rawKB.toFixed(1), pad: "start" },
    { head: "gzip KB", get: (r) => r.gzipKB.toFixed(1), pad: "start" },
    {
      head: "budget",
      get: (r) => {
        const b = budgets && budgetFor(budgets, r.route);
        return b ? String(b.limit) : "-";
      },
      pad: "start",
    },
  ];

  const widths = cols.map((c) =>
    Math.max(c.head.length, ...rows.map((r) => c.get(r).length)),
  );
  const line = (cells) =>
    cells
      .map((cell, i) =>
        cols[i].pad === "end" ? cell.padEnd(widths[i]) : cell.padStart(widths[i]),
      )
      .join("  ");

  console.log(line(cols.map((c) => c.head)));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(cols.map((c) => c.get(r))));
}

// ----------------------------------------------------------------------- main

const rows = collectRoutes();

if (rows.length === 0) {
  console.error(
    "Found no client reference manifests. Either the build produced no client " +
      "routes, or the Next.js build output format changed and this script needs " +
      "updating.",
  );
  process.exit(2);
}

if (UPDATE) {
  const existing = readBudgets();
  let next;

  if (existing) {
    // Keep the curated pattern set; only re-baseline its numbers. Each pattern
    // is sized by the heaviest route it actually governs, so a pattern stays
    // meaningful rather than collapsing to the global maximum.
    next = {};
    for (const pattern of Object.keys(existing)) {
      const governed = rows.filter(
        (r) => budgetFor(existing, r.route)?.pattern === pattern,
      );
      next[pattern] = governed.length
        ? withHeadroom(Math.max(...governed.map((r) => r.gzipKB)))
        : existing[pattern];
    }
  } else {
    next = { "**": withHeadroom(Math.max(...rows.map((r) => r.gzipKB))) };
  }

  // Sorted most-specific-first so the file reads as a precedence list.
  const ordered = Object.fromEntries(
    Object.entries(next).sort((a, b) => specificity(b[0]) - specificity(a[0])),
  );
  fs.writeFileSync(BUDGET_FILE, JSON.stringify(ordered, null, 2) + "\n");
  printTable(rows, ordered);
  console.log(
    `\nRe-baselined ${Object.keys(ordered).length} budget(s) in ${BUDGET_FILE} ` +
      `(current size +${Math.round((HEADROOM - 1) * 100)}%, rounded up to ${ROUND_TO} KB).`,
  );
  process.exit(0);
}

const budgets = readBudgets();

if (AS_JSON) {
  console.log(
    JSON.stringify(
      rows.map((r) => ({
        ...r,
        rawKB: Number(r.rawKB.toFixed(1)),
        gzipKB: Number(r.gzipKB.toFixed(1)),
        budgetKB: budgets ? (budgetFor(budgets, r.route)?.limit ?? null) : null,
      })),
      null,
      2,
    ),
  );
} else {
  printTable(rows, budgets);
}

if (!budgets) {
  console.error(
    `\nNo budget file at ${BUDGET_FILE}. Create one with:\n` +
      `  node scripts/bundle-budget.mjs --update`,
  );
  process.exit(2);
}

const violations = [];
for (const r of rows) {
  const b = budgetFor(budgets, r.route);
  if (!b) continue;
  if (r.gzipKB > b.limit) violations.push({ ...r, ...b });
}

if (violations.length === 0) {
  if (!AS_JSON) {
    console.log(`\nAll ${rows.length} routes are within budget.`);
  }
  process.exit(0);
}

console.error(`\nBundle budget exceeded by ${violations.length} route(s):\n`);
for (const v of violations) {
  console.error(
    `  ${v.route}\n` +
      `    ${v.gzipKB.toFixed(1)} KB gzip vs ${v.limit} KB budget ` +
      `(+${(v.gzipKB - v.limit).toFixed(1)} KB) via pattern "${v.pattern}"`,
  );
}
console.error(
  `\nEither trim the route's client JS, or — if the growth is intended — ` +
    `re-baseline deliberately with:\n  pnpm bundle:check --update\nand commit ` +
    `${BUDGET_FILE} as part of the change.`,
);
process.exit(1);
