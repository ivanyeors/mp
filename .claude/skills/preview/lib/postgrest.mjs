// A PostgREST stand-in over in-memory tables: enough of its URL grammar
// (select with embeds and JSON paths, filters, or/and trees, order, limit,
// offset, counts, single objects, inserts, upserts, updates, deletes) for
// supabase-js to run unchanged. Embeds follow the foreign keys read from
// supabase/migrations; a fixture row may also carry a related row already
// nested under the embed's name, which wins.

import { randomUUID } from "node:crypto";
import { splitTop } from "./schema.mjs";

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
const OPS = "eq|neq|gt|gte|lt|lte|like|ilike|match|imatch|in|is|isdistinct|cs|cd|ov|sl|sr|nxr|nxl|adj|fts|plfts|phfts|wfts";
const OP_VALUE = new RegExp(String.raw`^(not\.)?(${OPS})(\(\w+\))?\.`, "s");
const AGGREGATES = new Set(["count", "sum", "avg", "min", "max"]);

export const looksLikeFilter = (value) => OP_VALUE.test(value);

// ---------------------------------------------------------------- select ---

/** Parse a `select` string into column, embed and aggregate nodes. */
export function parseSelect(text) {
  return splitTop(text ?? "*").map(parseItem);
}

function parseItem(raw) {
  let s = raw.trim();
  let spread = false;
  if (s.startsWith("...")) {
    spread = true;
    s = s.slice(3);
  }
  let alias = null;
  const a = s.match(/^"?([\w ]+?)"?:(?!:)/);
  if (a) {
    alias = a[1];
    s = s.slice(a[0].length);
  }
  if (s === "*") return { type: "star" };

  const paren = s.indexOf("(");
  if (paren > 0 && s.endsWith(")") && !/^\w+\.\w+\(\)/.test(s)) {
    const head = s.slice(0, paren);
    const inner = s.slice(paren + 1, -1);
    const [name, ...hints] = head.split("!");
    if (AGGREGATES.has(name) && inner.trim() === "") return { type: "agg", fn: name, column: null, alias: alias ?? name };
    return {
      type: "embed",
      table: name,
      alias: alias ?? name,
      hints: hints.filter((h) => h !== "inner" && h !== "left"),
      inner: hints.includes("inner"),
      spread,
      children: parseSelect(inner),
    };
  }
  const agg = s.match(/^(\w+(?:->>?\w+)*)\.(count|sum|avg|min|max)\(\)(?:::\w+)?$/);
  if (agg) return { type: "agg", fn: agg[2], column: agg[1], alias: alias ?? agg[2] };
  if (s === "count") return { type: "agg", fn: "count", column: null, alias: alias ?? "count" };

  const m = s.match(/^"?(\w+)"?((?:->>?'?[\w-]+'?)*)(?:::(\w+(?:\[\])?))?$/);
  if (!m) return { type: "col", column: s, alias: alias ?? s, cast: null };
  const path = m[2];
  const last = path ? path.split(/->>?/).pop().replace(/'/g, "") : m[1];
  return { type: "col", column: m[1] + path, alias: alias ?? last, cast: m[3] ?? null };
}

// ---------------------------------------------------------------- values ---

/** Read `col`, `col->key` or `col->>key` from a row. */
export function readPath(row, column) {
  const parts = column.split(/(->>?)/);
  let v = row?.[parts[0].replace(/"/g, "")];
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i + 1].replace(/'/g, "");
    if (v != null && typeof v === "string" && /^[[{]/.test(v)) {
      try {
        v = JSON.parse(v);
      } catch {
        // a plain string that starts with a bracket
      }
    }
    v = v == null || typeof v !== "object" ? undefined : v[key];
    if (parts[i] === "->>" && v != null && typeof v === "object") v = JSON.stringify(v);
    else if (parts[i] === "->>" && v != null) v = String(v);
  }
  return v === undefined ? null : v;
}

const ISO = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}(:?\d{2})?)?$/;
const isNum = (v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)));

function compare(a, b) {
  if (typeof a === "boolean" || typeof b === "boolean") return String(a).localeCompare(String(b));
  if (isNum(a) && isNum(b)) return Number(a) - Number(b);
  const sa = String(a);
  const sb = String(b);
  if (ISO.test(sa) && ISO.test(sb)) {
    const da = Date.parse(sa.length === 10 ? `${sa}T00:00:00Z` : sa);
    const db = Date.parse(sb.length === 10 ? `${sb}T00:00:00Z` : sb);
    if (Number.isFinite(da) && Number.isFinite(db)) return da - db;
  }
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

const equal = (a, b) => (a == null || b == null ? false : compare(a, b) === 0 || String(a) === String(b));

function unquote(s) {
  const t = s.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).replace(/\\"/g, '"') : t;
}

function parseList(arg) {
  const inner = arg.trim().replace(/^[({]/, "").replace(/[)}]$/, "");
  return inner === "" ? [] : splitTop(inner).map(unquote);
}

function parseCollection(arg) {
  const t = arg.trim();
  if (t.startsWith("[") || (t.startsWith("{") && t.includes(":"))) {
    try {
      return JSON.parse(t);
    } catch {
      // fall through to a Postgres array literal
    }
  }
  return parseList(t);
}

function likeRegex(pattern, flags) {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\" && i + 1 < pattern.length) re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (c === "%" || c === "*") re += "[\\s\\S]*";
    else if (c === "_") re += "[\\s\\S]";
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, flags);
}

function contains(value, wanted) {
  if (Array.isArray(wanted)) {
    const have = Array.isArray(value) ? value : [];
    return wanted.every((w) => have.some((h) => equal(h, w) || JSON.stringify(h) === JSON.stringify(w)));
  }
  if (wanted && typeof wanted === "object") {
    if (!value || typeof value !== "object") return false;
    return Object.entries(wanted).every(([k, w]) =>
      w && typeof w === "object" ? contains(value[k], w) : equal(value[k], w) || value[k] === w,
    );
  }
  return equal(value, wanted);
}

/** True, false, or null for SQL's unknown (a comparison with null). */
function test(cond, row, warn) {
  const value = readPath(row, cond.column);
  const { op, arg } = cond;
  let r;
  switch (op) {
    case "eq":
      r = value == null ? null : equal(value, arg);
      break;
    case "neq":
      r = value == null ? null : !equal(value, arg);
      break;
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      if (value == null) r = null;
      else {
        const c = compare(value, arg);
        r = op === "gt" ? c > 0 : op === "gte" ? c >= 0 : op === "lt" ? c < 0 : c <= 0;
      }
      break;
    }
    case "like":
    case "ilike":
      r = value == null ? null : likeRegex(arg, op === "ilike" ? "i" : "").test(String(value));
      break;
    case "match":
    case "imatch":
      r = value == null ? null : new RegExp(arg, op === "imatch" ? "i" : "").test(String(value));
      break;
    case "in":
      r = value == null ? null : parseList(arg).some((x) => equal(value, x));
      break;
    case "is": {
      const a = arg.toLowerCase();
      r = a === "null" || a === "unknown" ? value == null : a === "true" ? value === true : a === "false" ? value === false : null;
      break;
    }
    case "isdistinct":
      r = arg === "null" ? value != null : !(value != null && equal(value, arg));
      break;
    case "cs":
      r = value == null ? null : contains(value, parseCollection(arg));
      break;
    case "cd":
      r = value == null ? null : contains(parseCollection(arg), Array.isArray(value) ? value : [value]);
      break;
    case "ov": {
      const want = parseCollection(arg);
      r = value == null ? null : (Array.isArray(value) ? value : [value]).some((v) => want.some((w) => equal(v, w)));
      break;
    }
    case "fts":
    case "plfts":
    case "phfts":
    case "wfts": {
      const hay = String(value ?? "").toLowerCase();
      r = arg
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w && w !== "and" && w !== "or")
        .every((w) => hay.includes(w));
      break;
    }
    default:
      warn?.(`filter operator "${op}" is not supported by the preview; treated as a match`);
      r = true;
  }
  if (!cond.negate) return r;
  return r == null ? null : !r;
}

// --------------------------------------------------------------- filters ---

function parseCondition(column, value) {
  const m = value.match(new RegExp(String.raw`^(not\.)?(${OPS})(?:\((\w+)\))?\.([\s\S]*)$`));
  if (!m) return { column, negate: false, op: "eq", arg: value };
  return { column, negate: Boolean(m[1]), op: m[2], arg: m[2] === "in" ? m[4] : unquote(m[4]) };
}

/** `(a.eq.1,b.gt.2,and(c.is.null,d.neq.x))` into a logic tree. */
export function parseLogic(kind, negate, value) {
  const inner = value.trim().replace(/^\(/, "").replace(/\)$/, "");
  const terms = splitTop(inner).map((t) => {
    const nested = t.match(/^(not\.)?(and|or)\(([\s\S]*)\)$/);
    if (nested) return parseLogic(nested[2], Boolean(nested[1]), `(${nested[3]})`);
    const dot = t.search(/\.(not\.)?(?:eq|neq|gt|gte|lt|lte|like|ilike|match|imatch|in|is|isdistinct|cs|cd|ov|sl|sr|nxr|nxl|adj|fts|plfts|phfts|wfts)[.(]/);
    return parseCondition(t.slice(0, dot), t.slice(dot + 1));
  });
  return { kind, negate, terms };
}

function evaluate(node, row, warn) {
  if (!node.kind) return test(node, row, warn);
  let r;
  if (node.kind === "and") {
    r = true;
    for (const t of node.terms) {
      const v = evaluate(t, row, warn);
      if (v === false) {
        r = false;
        break;
      }
      if (v == null) r = null;
    }
  } else {
    r = false;
    for (const t of node.terms) {
      const v = evaluate(t, row, warn);
      if (v === true) {
        r = true;
        break;
      }
      if (v == null) r = null;
    }
  }
  if (!node.negate) return r;
  return r == null ? null : !r;
}

/**
 * Sort a request's query string into filters, orders and limits keyed by embed
 * path ("" for the top table, "items", "items.item" for nested embeds).
 */
export function parseQuery(params, { skip = () => false } = {}) {
  const at = new Map();
  const level = (path) => {
    if (!at.has(path)) at.set(path, { filters: [], order: [], limit: null, offset: 0 });
    return at.get(path);
  };
  for (const [key, value] of params) {
    if (RESERVED.has(key) && key !== "order" && key !== "limit" && key !== "offset") continue;
    if (skip(key, value)) continue;
    const parts = key.split(".");
    const last = parts.at(-1);
    if (last === "order" || last === "limit" || last === "offset") {
      const l = level(parts.slice(0, -1).join("."));
      if (last === "limit") l.limit = Number(value);
      else if (last === "offset") l.offset = Number(value);
      else
        for (const term of splitTop(value)) {
          const [column, ...mods] = term.split(".");
          const desc = mods.includes("desc");
          l.order.push({
            column,
            desc,
            nullsFirst: mods.includes("nullsfirst") ? true : mods.includes("nullslast") ? false : desc,
          });
        }
      continue;
    }
    if (last === "or" || last === "and") {
      const negate = parts.at(-2) === "not";
      const path = parts.slice(0, negate ? -2 : -1).join(".");
      level(path).filters.push(parseLogic(last, negate, value));
      continue;
    }
    // A JSON path (`data->>key`) has no dots of its own, so the last dot splits path from column.
    const column = last;
    level(parts.slice(0, -1).join(".")).filters.push(parseCondition(column, value));
  }
  return at;
}

function applyLevel(rows, l, warn) {
  let out = rows;
  if (l?.filters.length) out = out.filter((r) => l.filters.every((f) => evaluate(f, r, warn) === true));
  if (l?.order.length) {
    out = [...out].sort((a, b) => {
      for (const o of l.order) {
        const va = readPath(a, o.column);
        const vb = readPath(b, o.column);
        if (va == null && vb == null) continue;
        if (va == null) return o.nullsFirst ? -1 : 1;
        if (vb == null) return o.nullsFirst ? 1 : -1;
        const c = compare(va, vb);
        if (c !== 0) return o.desc ? -c : c;
      }
      return 0;
    });
  }
  return out;
}

function paginate(rows, l) {
  const offset = l?.offset ?? 0;
  return l?.limit != null ? rows.slice(offset, offset + l.limit) : offset ? rows.slice(offset) : rows;
}

// --------------------------------------------------------------- embeds ----

const singular = (t) => t.replace(/ies$/, "y").replace(/ses$/, "s").replace(/s$/, "");

/** How `node` (an embed under `from`) joins: through which key, to one row or many. */
function relation(from, node, ctx) {
  const { fks } = ctx.schema;
  const target = node.table;
  const hints = node.hints;
  const hinted = (fk) => hints.length === 0 || hints.some((h) => h === fk.column || h === fk.name || h === fk.refTable || h === fk.table);

  // `alias:fk_column(cols)`: the embed is named by the parent's foreign key column.
  const byColumn = fks.find((f) => f.table === from && f.column === target);
  if (byColumn) return { to: byColumn.refTable, kind: "one", parentKey: byColumn.column, childKey: byColumn.refColumn };

  const toOne = fks.filter((f) => f.table === from && f.refTable === target && hinted(f));
  const toMany = fks.filter((f) => f.table === target && f.refTable === from && hinted(f));
  const prefer = (list, names) => list.find((f) => names.includes(f.column)) ?? list[0];

  if (toOne.length && (!toMany.length || hints.length)) {
    const fk = prefer(toOne, [`${node.alias}_id`, `${singular(target)}_id`]);
    return { to: target, kind: "one", parentKey: fk.column, childKey: fk.refColumn };
  }
  if (toMany.length) {
    const fk = prefer(toMany, [`${singular(from)}_id`]);
    return { to: target, kind: fk.unique ? "one" : "many", parentKey: fk.refColumn, childKey: fk.column };
  }
  if (toOne.length) {
    const fk = prefer(toOne, [`${node.alias}_id`, `${singular(target)}_id`]);
    return { to: target, kind: "one", parentKey: fk.column, childKey: fk.refColumn };
  }

  // No foreign key in the migrations (a view, or a key added some other way): guess by name.
  const sample = ctx.rows(from)[0] ?? {};
  for (const col of [`${node.alias}_id`, `${singular(target)}_id`]) {
    if (col in sample) return { to: target, kind: "one", parentKey: col, childKey: "id" };
  }
  const childSample = ctx.rows(target)[0] ?? {};
  if (`${singular(from)}_id` in childSample) return { to: target, kind: "many", parentKey: "id", childKey: `${singular(from)}_id` };
  ctx.warn(`no relationship found from ${from} to ${target}; the embed "${node.alias}" is empty`);
  return null;
}

function index(ctx, table, column) {
  const key = `${table}|${column}`;
  if (!ctx.indexes.has(key)) {
    const map = new Map();
    for (const r of ctx.rows(table)) {
      const v = r[column];
      if (v == null) continue;
      const k = String(v);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    ctx.indexes.set(key, map);
  }
  return ctx.indexes.get(key);
}

/** The embed's value for one parent row: an object, null, or an array. */
function embedValue(from, row, node, path, ctx) {
  const levelOf = ctx.query.get(path);
  let children;
  let kind;
  let to = node.table;
  const nested = row[node.table] !== undefined ? row[node.table] : row[node.alias];
  if (nested !== undefined && (nested === null || typeof nested === "object")) {
    kind = Array.isArray(nested) ? "many" : "one";
    children = nested == null ? [] : Array.isArray(nested) ? nested : [nested];
  } else {
    const rel = relation(from, node, ctx);
    if (!rel) return node.inner ? undefined : kindEmpty(node, "many");
    to = rel.to;
    kind = rel.kind;
    const key = row[rel.parentKey];
    children = key == null ? [] : (index(ctx, rel.to, rel.childKey).get(String(key)) ?? []);
  }
  children = applyLevel(children, levelOf, ctx.warn);
  children = paginate(children, levelOf);
  const projected = projectRows(to, children, node.children, path, ctx).filter((r) => r !== undefined);
  if (kind === "one") {
    const one = projected[0] ?? null;
    if (node.inner && one == null) return undefined;
    return one;
  }
  if (node.inner && projected.length === 0) return undefined;
  return projected;
}

function kindEmpty(node, kind) {
  return kind === "one" ? null : [];
}

function cast(value, to) {
  if (value == null || !to) return value;
  if (/^(int|integer|bigint|smallint|numeric|float|real|double|decimal)/.test(to)) return Number(value);
  if (to === "text" || to === "varchar") return typeof value === "object" ? JSON.stringify(value) : String(value);
  if (to === "boolean" || to === "bool") return value === true || value === "true";
  return value;
}

function aggregate(fn, rows, column) {
  if (fn === "count") return column ? rows.filter((r) => readPath(r, column) != null).length : rows.length;
  const values = rows.map((r) => readPath(r, column)).filter((v) => v != null).map(Number);
  if (values.length === 0) return null;
  if (fn === "sum") return values.reduce((s, v) => s + v, 0);
  if (fn === "avg") return values.reduce((s, v) => s + v, 0) / values.length;
  return fn === "min" ? Math.min(...values) : Math.max(...values);
}

/** Project rows of `table` through select nodes; an `!inner` miss drops the row (undefined). */
export function projectRows(table, rows, nodes, path, ctx) {
  const aggs = nodes.filter((n) => n.type === "agg");
  const projectOne = (row) => {
    const out = {};
    for (const n of nodes) {
      if (n.type === "star") {
        for (const [k, v] of Object.entries(row)) if (!(k in out)) out[k] = v;
      } else if (n.type === "col") {
        out[n.alias] = cast(readPath(row, n.column), n.cast);
      } else if (n.type === "embed") {
        const childPath = path ? `${path}.${n.alias}` : n.alias;
        const v = embedValue(table, row, n, childPath, ctx);
        if (v === undefined) return undefined;
        if (n.spread) {
          const src = Array.isArray(v) ? v[0] ?? {} : v ?? {};
          for (const c of n.children) if (c.type === "col" || c.type === "agg") out[c.alias] = src[c.alias] ?? null;
          for (const [k, val] of Object.entries(src)) if (!(k in out)) out[k] = val;
        } else out[n.alias] = v;
      }
    }
    return out;
  };
  if (aggs.length === 0) return rows.map(projectOne);

  // Aggregates group by every other selected column, as PostgREST does.
  const plain = nodes.filter((n) => n.type !== "agg");
  const groups = new Map();
  for (const r of rows) {
    const keyRow = plain.length ? projectOne(r) : {};
    if (keyRow === undefined) continue;
    const key = JSON.stringify(keyRow);
    if (!groups.has(key)) groups.set(key, { keyRow, rows: [] });
    groups.get(key).rows.push(r);
  }
  if (groups.size === 0 && plain.length === 0) groups.set("{}", { keyRow: {}, rows: [] });
  return [...groups.values()].map(({ keyRow, rows: rs }) => {
    const out = { ...keyRow };
    for (const a of aggs) out[a.alias] = aggregate(a.fn, rs, a.column);
    return out;
  });
}

/** Rows of a top-level read: filtered, embedded (dropping `!inner` misses), ordered, counted, paged. */
export function readRows(table, rows, params, ctx) {
  const nodes = parseSelect(params.get("select") ?? "*");
  const top = ctx.query.get("");
  let filtered = applyLevel(rows, top, ctx.warn);
  const projected = [];
  const kept = [];
  const hasInner = (ns) => ns.some((n) => n.type === "embed" && (n.inner || hasInner(n.children)));
  if (hasInner(nodes)) {
    for (const r of filtered) {
      const p = projectRows(table, [r], nodes, "", ctx)[0];
      if (p !== undefined) {
        kept.push(r);
        projected.push(p);
      }
    }
    filtered = kept;
  }
  const total = filtered.length;
  const page = paginate(filtered, top);
  const out = hasInner(nodes)
    ? paginate(projected, top)
    : nodes.some((n) => n.type === "agg")
      ? projectRows(table, filtered, nodes, "", ctx)
      : projectRows(table, page, nodes, "", ctx);
  return { rows: out, total, offset: top?.offset ?? 0 };
}

// --------------------------------------------------------------- writes ----

function evalDefault(sql, column, existing) {
  if (sql == null) return null;
  const castTo = (sql.match(/::\s*([\w\s[\]."]+)\s*$/) ?? [])[1] ?? "";
  const s = sql.replace(/::\s*[\w\s[\]."]+\s*$/, "").trim().replace(/^\((.*)\)$/s, "$1").trim();
  if (/^(now|current_timestamp|clock_timestamp|statement_timestamp|transaction_timestamp|timezone)\b/i.test(s)) return new Date().toISOString();
  if (/^current_date\b/i.test(s)) return new Date().toISOString().slice(0, 10);
  if (/gen_random_uuid|uuid_generate_v4/i.test(s)) return randomUUID();
  if (/^nextval\b/i.test(s)) return nextId(existing, column);
  if (/^true$/i.test(s)) return true;
  if (/^false$/i.test(s)) return false;
  if (/^null$/i.test(s)) return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  const lit = s.match(/^'([\s\S]*)'$/);
  if (lit) {
    const v = lit[1].replace(/''/g, "'");
    if (/\[\]/.test(castTo)) return v === "{}" ? [] : parseList(v);
    if (/json/i.test(castTo)) {
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    }
    return v;
  }
  if (/^array\[\]/i.test(s)) return [];
  return null;
}

function nextId(existing, column) {
  let max = 0;
  for (const r of existing) if (isNum(r[column])) max = Math.max(max, Number(r[column]));
  return max + 1;
}

/** Insert or upsert body rows into `table`, filling defaults from the migrations. */
export function insertRows(table, body, params, prefer, ctx) {
  const rows = ctx.rows(table, true);
  const info = ctx.schema.tables.get(table);
  const incoming = Array.isArray(body) ? body : [body];
  const columns = params.get("columns")?.split(",").map((c) => c.replace(/"/g, ""));
  const conflict = (params.get("on_conflict") ?? info?.primaryKey.join(",") ?? "id").split(",").map((c) => c.trim());
  const merge = /resolution=merge-duplicates/.test(prefer);
  const ignore = /resolution=ignore-duplicates/.test(prefer);
  const written = [];
  for (const raw of incoming) {
    const given = columns ? Object.fromEntries(columns.filter((c) => c in raw).map((c) => [c, raw[c]])) : { ...raw };
    if (merge || ignore) {
      const hit = rows.find((r) => conflict.every((c) => given[c] !== undefined && equal(r[c], given[c])));
      if (hit) {
        if (merge) Object.assign(hit, given);
        written.push(hit);
        continue;
      }
    }
    const row = {};
    if (info) for (const [col, def] of info.columns) row[col] = col in given ? given[col] : evalDefault(def, col, rows);
    Object.assign(row, given);
    const pk = info?.primaryKey.length === 1 ? info.primaryKey[0] : info?.primaryKey.length ? null : "id";
    if (pk && row[pk] == null) {
      const sample = rows.find((r) => r[pk] != null)?.[pk];
      row[pk] = typeof sample === "number" || (sample === undefined && /identity|serial|bigint/i.test(info?.columns.get(pk) ?? "")) ? nextId(rows, pk) : randomUUID();
    }
    rows.push(row);
    written.push(row);
  }
  ctx.indexes.clear();
  return written;
}

export function updateRows(table, body, ctx) {
  const rows = ctx.rows(table, true);
  const hit = applyLevel(rows, ctx.query.get(""), ctx.warn);
  const info = ctx.schema.tables.get(table);
  for (const r of hit) {
    Object.assign(r, body);
    if (info?.columns.has("updated_at") && !("updated_at" in body)) r.updated_at = new Date().toISOString();
  }
  ctx.indexes.clear();
  return hit;
}

export function deleteRows(table, ctx) {
  const rows = ctx.rows(table, true);
  const hit = new Set(applyLevel(rows, ctx.query.get(""), ctx.warn));
  const kept = rows.filter((r) => !hit.has(r));
  rows.length = 0;
  rows.push(...kept);
  ctx.indexes.clear();
  return [...hit];
}
