#!/usr/bin/env node
// Requests every old Shopify address on a live host and checks each one lands
// where the approved redirect map says, in one hop (ADR 0029, the cutover).
//
//   node scripts/check-shopify-redirects.mjs https://custom.mpillow.com
//   node scripts/check-shopify-redirects.mjs https://www.mpillow.com --out report.json
//
// Run it on custom.mpillow.com before the switch, and on www.mpillow.com and the
// bare mpillow.com right after it. For each of the 215 rows in
// lib/__fixtures__/shopify-redirect-map.json it checks:
//   - the status (301 for a page that moved, 302 for a cart, checkout or sign-in);
//   - the Location is the approved page on the canonical host, with the ad tags
//     (utm_*, gclid) carried over and Shopify's own parameters dropped;
//   - the redirect expires within the hour (Cache-Control: max-age=3600);
//   - the page it lands on answers 200 itself: no second hop, no 404.
// Until the launch, an arrival at the home page of mpillow.com or www.mpillow.com
// is shown the Explore page (lib/routing/explore-entry.ts), so there "/" and the
// old addresses the map sends home take one more hop, to Explore. custom.mpillow.com
// keeps its home page. Feeds and Shopify's own sitemaps answer 410.
//
// Changes nothing: GET requests only. Exits 1 if any check fails.
// Behind an HTTPS proxy, run with NODE_USE_ENV_PROXY=1 (Node >= 22.21).

import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const base = args.find((a) => /^https?:\/\//.test(a))?.replace(/\/$/, "");
const outIndex = args.indexOf("--out");
const out = outIndex > -1 ? args[outIndex + 1] : null;
if (!base) {
  console.error("Usage: node scripts/check-shopify-redirects.mjs <https://host> [--out report.json]");
  process.exit(2);
}

/** The canonical host the redirects should name: www once the switch is done, otherwise the host itself. */
const canonical = (() => {
  const i = args.indexOf("--canonical");
  return i > -1 ? args[i + 1].replace(/\/$/, "") : new URL(base).hostname === "mpillow.com" ? "https://www.mpillow.com" : base;
})();

const MAP = JSON.parse(readFileSync(new URL("../lib/__fixtures__/shopify-redirect-map.json", import.meta.url), "utf8"));
const LAUNCH_AT = Date.parse("2026-12-31T23:59:00+08:00"); // lib/explore/launch.ts
const TAGS = { utm_source: "redirect-check", gclid: "check" };
const GONE = ["/sitemap_products_1.xml", "/products/linen-case.json", "/blogs/mpillow-blogs.atom"];
const UA = "mp-redirect-check/1.0";
const CONCURRENCY = 6;

/** The old address with test ad tags added to whatever query it already has. */
function withTags(path) {
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(TAGS)) url.searchParams.append(k, v);
  return url;
}

/** What the Location should be: the approved page on the canonical host, the ad tags kept. */
function expectedLocation(to) {
  const url = new URL(to, canonical);
  for (const [k, v] of Object.entries(TAGS)) url.searchParams.append(k, v);
  return url.href;
}

async function get(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { redirect: "manual", headers: { "user-agent": UA, "accept-language": "en-US" } });
      await res.arrayBuffer();
      return res;
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

async function pool(items, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i]);
      }
    }),
  );
  return results;
}

const beforeLaunch = Date.now() < LAUNCH_AT;
/** Hosts whose home page shows Explore to arrivals until the launch (lib/routing/explore-entry.ts). */
const EXPLORE_HOSTS = new Set(["mpillow.com", "www.mpillow.com"]);
const showsExplore = beforeLaunch && EXPLORE_HOSTS.has(new URL(base).hostname);

/** A home page that sends this arrival on to Explore, as it should until the launch. */
function isExploreEntry(url, res) {
  const location = res.headers.get("location");
  return (
    showsExplore &&
    res.status === 307 &&
    /^\/(en-US|zh-CN)\/?$/.test(new URL(url).pathname) &&
    location !== null &&
    /^\/(en-US|zh-CN)\/explore$/.test(new URL(location, url).pathname)
  );
}

async function checkRow(row) {
  const problems = [];
  if (row.status === null) {
    // The home page: Explore until the launch on mpillow.com and www, else the language redirect.
    const res = await get(new URL("/", base));
    const loc = res.headers.get("location") ? new URL(res.headers.get("location"), base).href : null;
    const want = showsExplore ? /^\/en-US\/explore$/ : /^\/en-US$/;
    if (res.status !== 307) problems.push(`status ${res.status}, expected 307`);
    if (!loc || !want.test(new URL(loc).pathname)) problems.push(`goes to ${loc}, expected ${showsExplore ? "/en-US/explore" : "/en-US"}`);
    if (loc && !loc.startsWith(canonical)) problems.push(`goes to another host: ${loc}`);
    return { old: row.old, status: res.status, location: loc, final: loc, problems };
  }

  const from = withTags(row.old);
  const res = await get(from);
  // A same-host Location may be relative; a browser resolves it against the old address.
  const location = res.headers.get("location") ? new URL(res.headers.get("location"), from).href : null;
  const want = expectedLocation(row.to);
  if (res.status !== row.status) problems.push(`status ${res.status}, expected ${row.status}`);
  if (location !== want) problems.push(`goes to ${location}, expected ${want}`);
  if (res.headers.get("cache-control") !== "max-age=3600") {
    problems.push(`cache-control ${res.headers.get("cache-control")}, expected max-age=3600`);
  }
  return { old: row.old, status: res.status, location, final: location, problems };
}

const started = new Date();
console.log(`Checking ${MAP.length} old addresses on ${base} (canonical ${canonical})…`);
const rows = await pool(MAP, checkRow);

// Every page the redirects land on must answer 200 itself: one hop, no 404.
// The one exception is the home page showing Explore until the launch.
const finals = [...new Set(rows.map((r) => r.final).filter(Boolean))];
const landing = new Map(
  await pool(finals, async (url) => {
    let res = await get(url);
    let via = null;
    if (isExploreEntry(url, res)) {
      via = new URL(res.headers.get("location"), url).href;
      res = await get(via);
    }
    return [url, { status: res.status, location: res.headers.get("location"), via }];
  }),
);
for (const row of rows) {
  const page = row.final && landing.get(row.final);
  if (!page) continue;
  row.finalStatus = page.status;
  if (page.via) row.via = page.via;
  if (page.status !== 200) {
    row.problems.push(`lands on ${page.via ?? row.final}, which answers ${page.status}${page.location ? ` → ${page.location}` : ""}`);
  }
}

const gone = await pool(GONE, async (path) => {
  const res = await get(new URL(path, base));
  return { old: path, status: res.status, problems: res.status === 410 ? [] : [`status ${res.status}, expected 410`] };
});

const all = [...rows, ...gone];
const failed = all.filter((r) => r.problems.length > 0);
const byStatus = all.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});

console.log(`\n${all.length - failed.length} of ${all.length} passed. Status: ${JSON.stringify(byStatus)}.`);
console.log(`${finals.length} distinct landing pages, ${[...landing.values()].filter((p) => p.status === 200).length} answer 200.`);
const viaExplore = rows.filter((r) => r.via).length;
if (viaExplore) console.log(`${viaExplore} land on the home page, which shows Explore until the launch: one more hop.`);
for (const row of failed) console.log(`✗ ${row.old}\n    ${row.problems.join("\n    ")}`);

if (out) {
  const report = {
    host: base,
    canonical,
    checkedAt: started.toISOString(),
    beforeLaunch,
    passed: all.length - failed.length,
    total: all.length,
    landingPages: finals.length,
    rows: all,
  };
  writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
  console.log(`\nReport written to ${out}`);
}

process.exit(failed.length > 0 ? 1 : 0);
