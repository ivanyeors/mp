// `preview map [words]`: every page in app/ by the name a person uses for it,
// its route, and the `preview shoot` command that screenshots it.
//
// Worked out from the files on disk on every run, so it cannot go stale:
// nothing it prints is committed. The names come from the places a person
// sees them (the sidebars, the dock, the footer), else the page's own title
// or <h1>, else the route itself. A dynamic route gets one working path when
// the preview fixtures hold a record for it, and a page's tabs are listed
// when its own folder spells them out as plain <TabsTrigger> text.
//
//   node .claude/skills/preview/lib/map.mjs [words]

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const skillDir = join(here, "..");
export const repo = resolve(skillDir, "..", "..", "..");
const SHOOT = ".claude/skills/preview/preview shoot";

// Where people see a page named. Each is read as plain source, so a rename
// there shows up here on the next run; map.test.ts fails if one of these
// files moves or stops yielding names.
export const NAV_SOURCES = [
  ["components/settings/settings-sidebar-nav.tsx", "Admin sidebar"],
  ["components/account/account-sidebar-nav.tsx", "Account sidebar"],
  ["components/ui/app-dock.tsx", "Dock"],
  ["components/ui/marketing-footer.tsx", "Footer"],
];

// Which fixture table holds a record a dynamic route opens, and which column
// fills the segment. Only routes whose page reads that table by that column;
// a route missing here is printed with its pattern alone. Each path was shot
// as the Owner and opened its record; /results/[id] and /account/orders/[n]
// are left out because only the customer who owns the record may open them.
// map.test.ts checks every route named here still exists and finds a record.
export const FIXTURE_PATHS = {
  "/blog/[slug]": { table: "blog_posts", column: "slug", where: (r) => r.status === "published" },
  "/pay/[token]": { table: "order_payment_links", column: "token" },
  "/settings/blogs/[id]": { table: "blog_posts", column: "id" },
  "/settings/customers/[id]": { table: "customers", column: "id" },
  // The order page reads shipping_address.recipient unguarded (a real order
  // always has one); most sample orders have no address, or one without it.
  "/settings/orders/[id]": { table: "orders", column: "id", where: (r) => r.shipping_address?.recipient },
  "/settings/products/[id]": { table: "products", column: "id" },
  "/settings/results/[id]": { table: "mp_config_responses", column: "id" },
  "/shop/[slug]": { table: "products", column: "slug", where: (r) => r.status === "active" },
};

// ------------------------------------------------------------------ pages --

function pageFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...pageFiles(p));
    else if (name === "page.tsx") out.push(p);
  }
  return out;
}

/** app/[lang]/shop/(index)/page.tsx → /shop. The locale segment and route groups are not in the URL. */
export function routeOf(file) {
  const parts = relative(join(repo, "app"), dirname(file))
    .split(sep)
    .filter((s) => s && s !== "[lang]" && !/^\(.*\)$/.test(s));
  return "/" + parts.join("/");
}

// --------------------------------------------------------------- the nav --

// One pass over the source: comments and strings are skipped whole (so a
// brace or quote inside them does not count), braces track object nesting,
// and `href: "..."`, `label: "..."` and the like fill the innermost object.
// An object closing with an href and a label is a nav entry; the labels of
// the objects around it (a sidebar group, a parent item) are where it sits.
const TOKENS = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|\b(href|label|title|tooltip):\s*"([^"\n]*)"|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`|([{}])/g;

export function navEntries(src) {
  const out = [];
  const stack = [];
  for (const m of src.matchAll(TOKENS)) {
    if (m[3] === "{") stack.push({});
    else if (m[3] === "}") {
      const o = stack.pop() ?? {};
      const label = o.label ?? o.title;
      if (o.href?.startsWith("/") && label) {
        const around = stack.map((s) => s.label).filter(Boolean);
        out.push({ href: o.href, label, tooltip: o.tooltip, around });
      }
    } else if (m[1] && stack.length) stack[stack.length - 1][m[1]] ??= m[2];
  }
  return out;
}

// ------------------------------------------------------- titles and tabs --

function ownTitle(src) {
  const meta = src.match(/export const metadata\b[^=]*=\s*\{[^}]*?\btitle:\s*"([^"]+)"/);
  if (meta) return meta[1].replace(/\s*\|\s*Mpillow$/, "");
  const h1 = src.match(/<h1\b[^>]*>\s*([^<{]+?)\s*<\/h1>/);
  return h1?.[1];
}

/**
 * Tabs a page's own folder states as plain text, e.g. `<TabsTrigger value="roles">Roles</TabsTrigger>`.
 * A file with any trigger whose text is not plain (a count, a variable, split
 * over lines) is skipped whole: a partial list would read as the full one.
 */
function tabsIn(dir) {
  const tabs = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".tsx") || statSync(join(dir, name)).isDirectory()) continue;
    const src = readFileSync(join(dir, name), "utf8");
    const all = src.match(/<TabsTrigger\b/g)?.length ?? 0;
    if (!all) continue;
    const plain = [...src.matchAll(/<TabsTrigger\b[^>\n]*>([^<{}\n]+)<\/TabsTrigger>/g)].map((m) => m[1].trim());
    if (plain.length !== all) continue;
    for (const t of plain) if (!tabs.includes(t)) tabs.push(t);
  }
  return tabs;
}

// --------------------------------------------------------- fixture paths --

async function fixtureTables() {
  const dir = join(skillDir, "fixtures");
  const tables = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".mjs")).sort()) {
    const out = await (await import(pathToFileURL(join(dir, f)).href)).default({ scenario: "default", now: new Date() });
    for (const [name, rows] of Object.entries(out.tables ?? {})) (tables[name] ??= []).push(...rows);
  }
  return tables;
}

const DYNAMIC = /\[\[?\.{0,3}[^\]]+\]\]?/g;

function matchesPattern(route, path) {
  const re = new RegExp("^" + route.split(DYNAMIC).map((s) => s.replace(/[.*+?^${}()|\\]/g, "\\$&")).join("[^/]+") + "$");
  return re.test(path);
}

// ------------------------------------------------------------------ build --

export async function buildMap() {
  const nav = [];
  for (const [file, place] of NAV_SOURCES) {
    for (const e of navEntries(readFileSync(join(repo, file), "utf8"))) {
      nav.push({ ...e, href: e.href.split("?")[0], place: [place, ...e.around].join(" › ") });
    }
  }
  const tables = await fixtureTables();
  const files = pageFiles(join(repo, "app"));
  // A static route wins over a dynamic sibling (/settings/campaigns/funnel is
  // not campaign "funnel"), so a nav link to one is no example of the other.
  const staticRoutes = new Set(files.map(routeOf).filter((r) => !r.includes("[")));

  const pages = files.map((file) => {
    const route = routeOf(file);
    const dynamic = route.includes("[");
    const named = nav.filter((n) => n.href === route);
    const own = ownTitle(readFileSync(file, "utf8"));
    let example;
    if (dynamic) {
      const f = FIXTURE_PATHS[route];
      const row = f && (tables[f.table] ?? []).find((r) => r[f.column] != null && (!f.where || f.where(r)));
      if (row) example = route.replace(DYNAMIC, String(row[f.column]));
      else example = nav.find((n) => !staticRoutes.has(n.href) && matchesPattern(route, n.href))?.href;
    }
    const first = named[0];
    return {
      file: relative(repo, file),
      route,
      name: first?.label ?? own ?? route,
      place: first ? first.place : own ? "page title" : "no label",
      also: [...named.slice(1).map((n) => n.label), ...named.map((n) => n.tooltip), own].filter(Boolean),
      dynamic,
      example,
      tabs: tabsIn(dirname(file)),
    };
  });
  return pages.sort((a, b) => a.route.localeCompare(b.route));
}

/**
 * Pages where every word starts a word in the name, where it sits, other
 * names, the route, a working path or a tab. Word starts, so "id" finds
 * /orders/[id] and not every "sidebar".
 */
export function filterMap(pages, words) {
  const ws = words.map((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "iu"));
  return pages.filter((p) => {
    const hay = [p.name, p.place, ...p.also, p.route, p.example ?? "", ...p.tabs].join(" ");
    return ws.every((w) => w.test(hay));
  });
}

function shellQuote(s) {
  return /^[\w/.,:@%+=-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

export function format(pages) {
  const rows = pages.map((p) => {
    const path = p.example ?? p.route.replace(DYNAMIC, (seg) => `<${seg.replace(/[[\].]/g, "")}>`);
    const route = p.example ? `${p.route} → ${p.example}` : p.dynamic ? `${p.route} (no sample record)` : p.route;
    return { p, name: `${p.name} (${p.place})`, route, cmd: `${SHOOT} ${shellQuote(path)}`, path };
  });
  const w1 = Math.max(...rows.map((r) => r.name.length), 0);
  const w2 = Math.max(...rows.map((r) => r.route.length), 0);
  const lines = [];
  for (const r of rows) {
    lines.push(`${r.name.padEnd(w1)}  ${r.route.padEnd(w2)}  ${r.cmd}`);
    for (const t of r.p.tabs) lines.push(`    tab ${t}: ${r.cmd} --click ${shellQuote(t)}`);
  }
  return lines.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const words = process.argv.slice(2);
  const all = await buildMap();
  const pages = filterMap(all, words);
  if (!pages.length) {
    console.log(`No page matches "${words.join(" ")}". \`preview map\` alone lists all ${all.length}.`);
    process.exit(1);
  }
  console.log(format(pages));
  console.log(`\n${pages.length} of ${all.length} pages. Names from the sidebars, dock and footer, else the page's title, else its route.`);
}
