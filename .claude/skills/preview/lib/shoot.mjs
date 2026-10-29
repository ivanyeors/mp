// Screenshots of the running preview: signs in as a fixture user, opens each
// page at desktop and phone width, waits for it to settle, saves a PNG, and
// reports what went wrong on the way (HTTP errors, page errors, console
// errors, server errors, tables the page read that have no sample rows).
// Exits 1 when a page failed, so a broken page is never mistaken for a picture.
//
// Called by `preview shoot`; see SKILL.md for the options.

import { createRequire } from "node:module";
import { mkdirSync, readFileSync, statSync, writeFileSync, existsSync, openSync, readSync, closeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..", "..", "..");
const require = createRequire(join(repo, "package.json"));

function loadPlaywright() {
  for (const name of ["playwright", "@playwright/test", "playwright-core"]) {
    try {
      return require(name);
    } catch {
      // try the next one
    }
  }
  try {
    return createRequire(import.meta.url)("playwright");
  } catch {
    console.error("Playwright is not installed here. Run `npm i -g playwright && npx playwright install chromium`, then try again.");
    process.exit(2);
  }
}

// ---------------------------------------------------------------- options --

const argv = process.argv.slice(2);
const opt = { paths: [], clicks: [], desktop: true, phone: true, fullPage: true, keepOverlays: false, dark: false, signedOut: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  if (a === "--out") opt.out = next();
  else if (a === "--as") opt.as = next();
  else if (a === "--signed-out") opt.signedOut = true;
  else if (a === "--desktop") opt.phone = false;
  else if (a === "--phone") opt.desktop = false;
  else if (a === "--wait-for") opt.waitFor = next();
  else if (a === "--click") opt.clicks.push(next());
  else if (a === "--element") opt.element = next();
  else if (a === "--name") opt.name = next();
  else if (a === "--viewport-only") opt.fullPage = false;
  else if (a === "--keep-overlays") opt.keepOverlays = true;
  else if (a === "--dark") opt.dark = true;
  else if (a === "--plan") opt.plan = JSON.parse(readFileSync(next(), "utf8"));
  else if (a.startsWith("--")) {
    console.error(`unknown option ${a}`);
    process.exit(2);
  } else opt.paths.push(a);
}

// `--desktop --phone` asks for both.
if (!opt.desktop && !opt.phone) opt.desktop = opt.phone = true;

const appUrl = process.env.PREVIEW_APP_URL ?? "http://localhost:3100";
const supabaseUrl = process.env.PREVIEW_SUPABASE_URL ?? "http://127.0.0.1:54329";
const nextLog = process.env.PREVIEW_NEXT_LOG;
const stateDir = process.env.PREVIEW_STATE_DIR ?? join(repo, ".preview");
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
const outDir = resolve(opt.out ?? join(stateDir, "shots", stamp));
mkdirSync(outDir, { recursive: true });

const shots = opt.plan
  ? opt.plan.map((s) => ({ clicks: [], ...s }))
  : opt.paths.map((path) => ({ path, name: opt.name, waitFor: opt.waitFor, clicks: opt.clicks, element: opt.element }));
if (shots.length === 0) {
  console.error("Name at least one page, e.g. `preview shoot /settings/analytics`.");
  process.exit(2);
}

const LOCALES = ["en-US", "zh-CN"];
function pageUrl(path) {
  if (/^https?:\/\//.test(path)) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  const first = p.split("/")[1]?.split("?")[0];
  const localized = LOCALES.includes(first) || p.startsWith("/api/") ? p : `/en-US${p === "/" ? "" : p}`;
  return appUrl + localized;
}

function fileBase(shot) {
  if (shot.name) return shot.name;
  const u = new URL(pageUrl(shot.path));
  const parts = u.pathname.split("/").filter((x) => x && !LOCALES.includes(x));
  const query = [...u.searchParams.values()].join("-");
  return [...parts, query].filter(Boolean).join("-").replace(/[^\w-]+/g, "-") || "home";
}

// ------------------------------------------------------------- the session --

async function sessionCookies() {
  if (opt.signedOut) return [];
  const res = await fetch(`${supabaseUrl}/__preview/session${opt.as ? `?email=${encodeURIComponent(opt.as)}` : ""}`);
  if (!res.ok) {
    console.error(`No fixture user ${opt.as}: add one to a fixture's users.`);
    process.exit(2);
  }
  const session = await res.json();
  // @supabase/ssr's default cookie: sb-<first label of the Supabase host>-auth-token, base64url, chunked past 3180.
  const key = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const chunks = value.length <= 3180 ? [[key, value]] : value.match(/.{1,3180}/g).map((v, i) => [`${key}.${i}`, v]);
  const host = new URL(appUrl).hostname;
  return chunks.map(([name, v]) => ({ name, value: v, domain: host, path: "/", sameSite: "Lax", httpOnly: false, secure: false }));
}

// ----------------------------------------------------------------- driving --

function readNewLog(from) {
  if (!nextLog || !existsSync(nextLog)) return { text: "", end: from };
  const size = statSync(nextLog).size;
  if (size <= from) return { text: "", end: size };
  const fd = openSync(nextLog, "r");
  const buf = Buffer.alloc(size - from);
  readSync(fd, buf, 0, buf.length, from);
  closeSync(fd);
  return { text: buf.toString(), end: size };
}

const logSize = () => (nextLog && existsSync(nextLog) ? statSync(nextLog).size : 0);
// Dev-server noise that says nothing about the page.
const NOISE = /WebSocket|webpack-hmr|realtime\/v1|Download the React DevTools|\[Fast Refresh\]|favicon|net::ERR_ABORTED|\[HMR\]/i;

async function settle(page) {
  // Requests in flight, not counting sockets and event streams that never end.
  await page
    .waitForFunction(() => window.__previewInflight === 0 && Date.now() - window.__previewLastChange > 800, null, { timeout: 60_000, polling: 200 })
    .catch(() => {});
  await page
    .waitForFunction(() => !document.querySelector("main .animate-pulse, main [data-slot=skeleton], [aria-busy=true]"), null, { timeout: 60_000 })
    .catch(() => {});
  await page.waitForTimeout(1200);
}

const TRACK_INFLIGHT = () => {
  window.__previewInflight = 0;
  window.__previewLastChange = Date.now();
  const bump = (d) => {
    window.__previewInflight += d;
    window.__previewLastChange = Date.now();
  };
  const f = window.fetch;
  window.fetch = function (...a) {
    bump(1);
    return f.apply(this, a).finally(() => bump(-1));
  };
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...a) {
    bump(1);
    this.addEventListener("loadend", () => bump(-1), { once: true });
    return send.apply(this, a);
  };
};

async function hideOverlays(page) {
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  if (opt.keepOverlays || !opt.fullPage) return;
  // A fixed bar (the dock) lands in the middle of a full-page capture; hide it there.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed") continue;
      const r = el.getBoundingClientRect();
      if (r.top > innerHeight - 200 && r.height < 200) el.style.visibility = "hidden";
    }
  });
}

/** Next's dev overlay holds the error a page threw while rendering. */
async function overlayError(page) {
  return page.evaluate(() => {
    const root = document.querySelector("nextjs-portal")?.shadowRoot;
    if (!root) return null;
    const dialog = root.querySelector("[data-nextjs-dialog], [data-nextjs-dialog-content]");
    if (dialog) return dialog.textContent.replace(/\s+/g, " ").trim().slice(0, 400);
    const badge = root.querySelector("[data-issues-count], [data-nextjs-toast-errors]");
    const n = badge ? Number(badge.textContent.replace(/\D+/g, "")) : 0;
    return n > 0 ? `${n} issue(s) in the Next.js dev overlay` : null;
  });
}

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const viewports = [
  ...(opt.desktop ? [["desktop", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }]] : []),
  ...(opt.phone ? [["phone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]] : []),
];
const cookies = await sessionCookies();
const notesBefore = (await (await fetch(`${supabaseUrl}/__preview/notes`)).json()).length;
const results = [];

for (const [vname, vopts] of viewports) {
  const ctx = await browser.newContext({ ...vopts, timezoneId: "Asia/Singapore", locale: "en-SG", colorScheme: opt.dark ? "dark" : "light" });
  if (cookies.length) await ctx.addCookies(cookies);
  await ctx.addInitScript(TRACK_INFLIGHT);
  for (const shot of shots) {
    const page = await ctx.newPage();
    const problems = [];
    page.on("pageerror", (e) => problems.push(`page error: ${String(e.message ?? e).slice(0, 300)}`));
    page.on("console", (m) => m.type() === "error" && !NOISE.test(m.text()) && problems.push(`console: ${m.text().slice(0, 300)}`));
    page.on("response", (r) => {
      const u = r.url();
      if (r.status() >= 500 && u.startsWith(appUrl)) problems.push(`HTTP ${r.status()} from ${u.slice(appUrl.length)}`);
    });
    const logFrom = logSize();
    const url = pageUrl(shot.path);
    const file = join(outDir, `${fileBase(shot)}-${vname}.png`);
    let status = null;
    try {
      const res = await page.goto(url, { waitUntil: "load", timeout: 300_000 });
      status = res?.status() ?? null;
      await settle(page);
      for (const c of shot.clicks ?? []) {
        await page.getByText(c, { exact: false }).first().click({ timeout: 15_000 });
        await settle(page);
      }
      if (shot.waitFor) await page.getByText(shot.waitFor, { exact: false }).first().waitFor({ timeout: 60_000 });
      const overlay = await overlayError(page);
      if (overlay) problems.push(`Next.js error overlay: ${overlay}`);
      await hideOverlays(page);
      if (shot.element) await page.locator(shot.element).first().screenshot({ path: file });
      else await page.screenshot({ path: file, fullPage: opt.fullPage });
    } catch (err) {
      problems.push(`could not take the shot: ${String(err.message ?? err).split("\n")[0]}`);
    }
    const finalUrl = page.url();
    if (status && status >= 400) problems.unshift(`HTTP ${status} for the page`);
    if (cookies.length && /\/account\/login/.test(finalUrl) && !/\/account\/login/.test(url)) {
      problems.unshift(`redirected to sign-in (${finalUrl.slice(appUrl.length)}): the session was not accepted`);
    }
    const serverErrors = readNewLog(logFrom)
      .text.split("\n")
      .filter((l) => /⨯|Error:|error:/i.test(l) && !NOISE.test(l))
      .map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").trim())
      .filter(Boolean);
    for (const l of [...new Set(serverErrors)].slice(0, 6)) problems.push(`server: ${l.slice(0, 300)}`);
    const saved = existsSync(file);
    results.push({ page: shot.path, viewport: vname, file: saved ? file : null, finalUrl: finalUrl.slice(appUrl.length), problems: [...new Set(problems)] });
    await page.close();
  }
  await ctx.close();
}
await browser.close();

const notes = (await (await fetch(`${supabaseUrl}/__preview/notes`)).json()).slice(notesBefore);
writeFileSync(join(outDir, "report.json"), JSON.stringify({ results, notes }, null, 2));

let failed = 0;
for (const r of results) {
  const bad = r.problems.length > 0 || !r.file;
  if (bad) failed++;
  console.log(`${bad ? "PROBLEM" : "ok     "} ${r.viewport.padEnd(7)} ${r.page}  ->  ${r.file ?? "(no screenshot)"}`);
  for (const p of r.problems) console.log(`          ${p}`);
}
if (notes.length) {
  console.log("\nThe fake database noticed (add sample rows or an rpc stand-in in a fixture if the page needs them):");
  for (const n of notes) console.log(`  - ${n}`);
}
if (results.some((r) => r.file)) writeFileSync(join(stateDir, "last-shot"), `${new Date().toISOString()}\n${outDir}\n`);
console.log(`\nScreenshots in ${outDir}`);
process.exit(failed ? 1 : 0);
