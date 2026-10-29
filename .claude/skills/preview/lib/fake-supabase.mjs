// The preview's Supabase: one local HTTP server answering what supabase-js
// asks of a real project (PostgREST under /rest/v1, Auth under /auth/v1,
// Storage under /storage/v1) from sample fixtures, so the real app runs
// unchanged against NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<port>.
//
// Writes change the in-memory tables until the next reset. Nothing here ever
// talks to a real service.
//
//   node fake-supabase.mjs --port 54329 --scenario default
//
// Control endpoints (used by the `preview` script):
//   GET  /__preview/status              tables, scenario, warnings
//   POST /__preview/reset?scenario=x    reload fixtures from disk, drop writes
//   GET  /__preview/session?email=e     a signed-in session for a fixture user
//   GET  /__preview/notes?since=n       warnings since the n-th (missing rows, RPCs)

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readSchema, emptyReturn } from "./schema.mjs";
import {
  deleteRows,
  insertRows,
  looksLikeFilter,
  parseQuery,
  parseSelect,
  projectRows,
  readRows,
  updateRows,
} from "./postgrest.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const skillDir = join(here, "..");
const repo = join(skillDir, "..", "..", "..");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const port = Number(args.port ?? process.env.PREVIEW_SUPABASE_PORT ?? 54329);

const schema = readSchema(join(repo, "supabase", "migrations"));

let state = null;
const notes = [];
const noted = new Set();
function note(message) {
  if (noted.has(message)) return;
  noted.add(message);
  notes.push(message);
  console.log(`[preview] ${message}`);
}

// ---------------------------------------------------------------- fixtures --

async function loadFixtures(scenario) {
  const dir = join(skillDir, "fixtures");
  const files = readdirSync(dir).filter((f) => f.endsWith(".mjs")).sort();
  const tables = {};
  const views = {};
  const rpc = {};
  const users = [];
  for (const f of files) {
    const mod = await import(`${pathToFileURL(join(dir, f)).href}?v=${Date.now()}`);
    const out = await mod.default({ scenario, now: new Date() });
    for (const [name, rows] of Object.entries(out.tables ?? {})) (tables[name] ??= []).push(...rows);
    Object.assign(views, out.views ?? {});
    Object.assign(rpc, out.rpc ?? {});
    users.push(...(out.users ?? []));
  }
  // Rows are mutated by writes; keep the fixture modules' objects untouched.
  for (const name of Object.keys(tables)) tables[name] = structuredClone(tables[name]);
  return { scenario, tables, views, rpc, users, loadedAt: new Date().toISOString() };
}

// ------------------------------------------------------------------- auth ---

const b64url = (s) => Buffer.from(s).toString("base64url");
const FAR = Math.floor(Date.UTC(2099, 0, 1) / 1000);

function userObject(u) {
  const at = "2026-01-01T00:00:00.000Z";
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: at,
    phone: u.phone ?? "",
    confirmed_at: at,
    last_sign_in_at: at,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: u.user_metadata ?? {},
    identities: [],
    created_at: at,
    updated_at: at,
    is_anonymous: false,
  };
}

function tokenFor(u) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: u.id,
      email: u.email,
      role: "authenticated",
      aud: "authenticated",
      iat: Math.floor(Date.now() / 1000),
      exp: FAR,
      session_id: `preview-${u.id}`,
      is_anonymous: false,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: u.user_metadata ?? {},
    }),
  );
  return `${header}.${payload}.${b64url("preview")}`;
}

function sessionFor(u) {
  return {
    access_token: tokenFor(u),
    token_type: "bearer",
    expires_in: FAR - Math.floor(Date.now() / 1000),
    expires_at: FAR,
    refresh_token: `preview-refresh-${u.id}`,
    user: userObject(u),
  };
}

function userFromToken(token) {
  const part = token?.split(".")[1];
  if (!part) return null;
  try {
    const { sub } = JSON.parse(Buffer.from(part, "base64url").toString());
    return state.users.find((u) => u.id === sub) ?? null;
  } catch {
    return null;
  }
}

function findUser(emailOrId) {
  if (!emailOrId) return state.users[0] ?? null;
  const k = String(emailOrId).toLowerCase();
  return state.users.find((u) => u.email.toLowerCase() === k || u.id === emailOrId) ?? null;
}

// ------------------------------------------------------------------- http ---

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-expose-headers": "content-range,content-profile,x-total-count",
};

function send(res, status, body, headers = {}) {
  const isJson = body !== undefined && typeof body !== "string" && !Buffer.isBuffer(body);
  res.writeHead(status, { ...CORS, ...(isJson ? { "content-type": "application/json; charset=utf-8" } : {}), ...headers });
  res.end(body === undefined ? undefined : isJson ? JSON.stringify(body) : body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}

function context(query) {
  return {
    schema,
    query,
    indexes: new Map(),
    warn: note,
    rows(table, create = false) {
      // A view is worked out from the tables on every read, so it follows writes.
      if (state.views[table] && !create) return state.views[table](state.tables);
      if (!state.tables[table]) {
        if (create) state.tables[table] = [];
        else {
          note(
            schema.tables.has(table)
              ? `read "${table}", which has no sample rows (add them in a fixture if the page needs them)`
              : `read "${table}", which is not a table in the migrations (a view?) and has no sample rows`,
          );
          return [];
        }
      }
      return state.tables[table];
    },
  };
}

function stripNulls(v) {
  if (Array.isArray(v)) return v.map(stripNulls);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null));
  return v;
}

/** Shape rows the way the request's Accept and Prefer headers ask. */
function answer(req, res, rows, { status = 200, total = rows.length, offset = 0, method = req.method } = {}) {
  const accept = req.headers.accept ?? "";
  const prefer = req.headers.prefer ?? "";
  const headers = {};
  if (/count=(exact|planned|estimated)/.test(prefer) || method === "HEAD") {
    headers["content-range"] = rows.length ? `${offset}-${offset + rows.length - 1}/${total}` : `*/${total}`;
  }
  const strip = accept.includes("nulls=stripped");
  if (accept.includes("application/vnd.pgrst.object+json")) {
    if (rows.length !== 1) {
      return send(res, 406, {
        code: "PGRST116",
        details: `The result contains ${rows.length} rows`,
        hint: null,
        message: "JSON object requested, multiple (or no) rows returned",
      });
    }
    return send(res, status, method === "HEAD" ? undefined : strip ? stripNulls(rows[0]) : rows[0], headers);
  }
  if (method === "HEAD") return send(res, status, undefined, headers);
  return send(res, status, strip ? stripNulls(rows) : rows, headers);
}

async function rest(req, res, url, path) {
  const params = url.searchParams;
  const rpcMatch = path.match(/^rpc\/(\w+)$/);
  if (rpcMatch) {
    const fn = rpcMatch[1];
    const body = req.method === "POST" ? ((await readBody(req)) ?? {}) : {};
    const fnArgs = { ...body };
    if (req.method !== "POST") for (const [k, v] of params) if (k !== "select" && !looksLikeFilter(v)) fnArgs[k] = v;
    const query = parseQuery(params, { skip: (k, v) => req.method !== "POST" && !looksLikeFilter(v) && !k.includes(".") });
    const ctx = context(query);
    let result;
    if (state.rpc[fn]) {
      result = await state.rpc[fn](fnArgs, { tables: state.tables, rows: (t) => ctx.rows(t), user: userFromToken(bearer(req)) });
    } else {
      const kind = schema.functions.get(fn);
      result = emptyReturn(kind);
      note(
        kind
          ? `rpc "${fn}" has no stand-in; answered ${JSON.stringify(result)} (add one under rpc in a fixture if the page needs it)`
          : `rpc "${fn}" is not a function in the migrations; answered null`,
      );
    }
    if (Array.isArray(result) && result.every((r) => r && typeof r === "object")) {
      const { rows, total, offset } = readRows(`rpc:${fn}`, result, params, ctx);
      return answer(req, res, rows, { total, offset });
    }
    if (req.method === "HEAD") return send(res, 200, undefined);
    return send(res, 200, result ?? null);
  }

  const table = decodeURIComponent(path);
  const query = parseQuery(params);
  const ctx = context(query);
  const prefer = req.headers.prefer ?? "";
  const represent = /return=representation/.test(prefer);
  const select = parseSelect(params.get("select") ?? "*");
  const shaped = (written) => projectRows(table, written, select, "", ctx).filter((r) => r !== undefined);

  switch (req.method) {
    case "GET":
    case "HEAD": {
      const { rows, total, offset } = readRows(table, ctx.rows(table), params, ctx);
      return answer(req, res, rows, { total, offset });
    }
    case "POST": {
      const body = await readBody(req);
      const written = insertRows(table, body ?? {}, params, prefer, ctx);
      console.log(`[preview] wrote ${written.length} row(s) to ${table}`);
      return represent ? answer(req, res, shaped(written), { status: 201 }) : send(res, 201, undefined, { "content-range": `*/${written.length}` });
    }
    case "PATCH":
    case "PUT": {
      const body = (await readBody(req)) ?? {};
      const written = updateRows(table, body, ctx);
      console.log(`[preview] updated ${written.length} row(s) in ${table}`);
      return represent ? answer(req, res, shaped(written)) : send(res, 204, undefined, { "content-range": `*/${written.length}` });
    }
    case "DELETE": {
      const written = deleteRows(table, ctx);
      console.log(`[preview] deleted ${written.length} row(s) from ${table}`);
      return represent ? answer(req, res, shaped(written)) : send(res, 204, undefined, { "content-range": `*/${written.length}` });
    }
    default:
      return send(res, 405, { message: `${req.method} is not supported` });
  }
}

function bearer(req) {
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

async function auth(req, res, url, path) {
  if (path === "user" && req.method === "GET") {
    const u = userFromToken(bearer(req));
    return u ? send(res, 200, userObject(u)) : send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
  }
  if (path === "user" && req.method === "PUT") {
    const u = userFromToken(bearer(req));
    return u ? send(res, 200, userObject(u)) : send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
  }
  if (path === "token") {
    const body = (await readBody(req)) ?? {};
    const grant = url.searchParams.get("grant_type");
    const u =
      grant === "refresh_token"
        ? state.users.find((x) => body.refresh_token === `preview-refresh-${x.id}`)
        : grant === "password"
          ? findUser(body.email)
          : null;
    return u ? send(res, 200, sessionFor(u)) : send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
  }
  if (path === "verify") {
    const body = (await readBody(req)) ?? {};
    const u = findUser(body.email) ?? state.users[0];
    return send(res, 200, sessionFor(u));
  }
  if (path === "otp" || path === "recover" || path === "resend" || path === "magiclink") return send(res, 200, {});
  if (path === "logout") return send(res, 204, undefined);
  if (path === ".well-known/jwks.json") return send(res, 200, { keys: [] });
  if (path === "settings") return send(res, 200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: true });
  if (path === "admin/users" && req.method === "GET") return send(res, 200, { users: state.users.map(userObject), aud: "authenticated" });
  const one = path.match(/^admin\/users\/([^/]+)$/);
  if (one) {
    const u = findUser(one[1]);
    return u ? send(res, 200, userObject(u)) : send(res, 404, { code: 404, error_code: "user_not_found", msg: "User not found" });
  }
  if (path === "admin/users" && req.method === "POST") {
    const body = (await readBody(req)) ?? {};
    const u = { id: randomUUID(), email: body.email ?? `user${state.users.length}@preview.local`, user_metadata: body.user_metadata };
    state.users.push(u);
    return send(res, 200, userObject(u));
  }
  if (path === "admin/generate_link") {
    const body = (await readBody(req)) ?? {};
    const u = findUser(body.email) ?? state.users[0];
    return send(res, 200, { ...userObject(u), action_link: "http://localhost/preview-link", properties: { action_link: "http://localhost/preview-link" } });
  }
  note(`auth ${req.method} /${path} is not handled by the preview; answered {}`);
  return send(res, 200, {});
}

// A neutral grey square for any Storage object, so images still lay out.
const PLACEHOLDER = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="100%" height="100%" fill="#e5e7eb"/></svg>',
);

async function storage(req, res, path) {
  if (/^object\/(public|sign|authenticated)\//.test(path) || /^render\/image\//.test(path)) {
    return send(res, 200, PLACEHOLDER, { "content-type": "image/svg+xml" });
  }
  if (path.startsWith("object/list/")) return send(res, 200, []);
  if (path === "bucket" || path.startsWith("bucket/")) return send(res, 200, []);
  if (path.startsWith("object/")) return send(res, 200, { Key: path, Id: randomUUID() });
  return send(res, 200, {});
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (req.method === "OPTIONS") return send(res, 204, undefined);
    const p = url.pathname;
    if (p === "/__preview/status") {
      const counts = Object.fromEntries(Object.entries(state.tables).map(([t, r]) => [t, r.length]));
      return send(res, 200, { scenario: state.scenario, loadedAt: state.loadedAt, users: state.users.map((u) => u.email), tables: counts, views: Object.keys(state.views), rpc: Object.keys(state.rpc), notes: notes.length });
    }
    if (p === "/__preview/reset") {
      state = await loadFixtures(url.searchParams.get("scenario") ?? state.scenario);
      noted.clear();
      return send(res, 200, { scenario: state.scenario, tables: Object.keys(state.tables).length });
    }
    if (p === "/__preview/session") {
      const u = findUser(url.searchParams.get("email"));
      return u ? send(res, 200, sessionFor(u)) : send(res, 404, { message: `no fixture user ${url.searchParams.get("email")}` });
    }
    if (p === "/__preview/notes") return send(res, 200, notes.slice(Number(url.searchParams.get("since") ?? 0)));
    let m;
    if ((m = p.match(/^\/rest\/v1\/(.+)$/))) return await rest(req, res, url, m[1]);
    if (p === "/rest/v1/" || p === "/rest/v1") return send(res, 200, {});
    if ((m = p.match(/^\/auth\/v1\/(.+)$/))) return await auth(req, res, url, m[1]);
    if ((m = p.match(/^\/storage\/v1\/(.+)$/))) return await storage(req, res, m[1]);
    if (p.startsWith("/functions/v1/")) {
      note(`edge function ${p.slice(14)} was called; answered {}`);
      return send(res, 200, {});
    }
    return send(res, 404, { message: `preview has no route for ${p}` });
  } catch (err) {
    console.error(`[preview] ${req.method} ${req.url} failed:`, err);
    return send(res, 500, { code: "PREVIEW", message: String(err?.message ?? err), details: "", hint: "" });
  }
});

// Realtime: refuse the socket; the client backs off and the page renders without it.
server.on("upgrade", (_req, socket) => socket.destroy());

state = await loadFixtures(args.scenario ?? "default");
server.listen(port, "127.0.0.1", () => {
  console.log(
    `[preview] fake Supabase on http://127.0.0.1:${port}: ${Object.keys(state.tables).length} sample tables, ` +
      `${schema.fks.length} foreign keys and ${schema.functions.size} functions read from the migrations`,
  );
});
