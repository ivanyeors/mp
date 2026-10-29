// What PostgREST would know about the database, read from supabase/migrations:
// each table's columns and defaults (for inserts), its foreign keys (for
// embedding `alias:table(cols)`), and each function's return shape (so an RPC
// with no stand-in answers with an empty value of the right kind).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** The text inside the parenthesis that opens at `open`. */
function balanced(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}

/** Split on commas that are not inside parentheses or quotes. */
export function splitTop(text) {
  const out = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

const NAME = String.raw`(?:"?\w+"?\.)?"?(\w+)"?`;
const NOT_A_COLUMN = /^(constraint|primary|unique|check|foreign|exclude|like)$/i;

function defaultOf(def) {
  const m = def.match(/\bdefault\s+(.+?)(?:\s+(?:not\s+null|null|primary\s+key|unique|references|check|constraint|generated)\b|$)/i);
  return m ? m[1].trim() : null;
}

export function readSchema(migrationsDir) {
  const tables = new Map(); // name -> { columns: Map(col -> default sql | null), primaryKey: string[] }
  const fks = []; // { table, column, refTable, refColumn, name, unique }
  const functions = new Map(); // name -> return kind

  const table = (name) => {
    if (!tables.has(name)) tables.set(name, { columns: new Map(), primaryKey: [] });
    return tables.get(name);
  };
  const addFk = (t, column, refTable, refColumn, name, unique) => {
    const fkName = name ?? `${t}_${column}_fkey`;
    const i = fks.findIndex((f) => f.table === t && f.column === column);
    const fk = { table: t, column, refTable, refColumn: refColumn ?? "id", name: fkName, unique: Boolean(unique) };
    if (i >= 0) fks[i] = fk;
    else fks.push(fk);
  };
  const addColumn = (t, def) => {
    const m = def.match(/^"?(\w+)"?\s+(.*)$/s);
    if (!m || NOT_A_COLUMN.test(m[1])) return;
    const [, col, rest] = m;
    const info = table(t);
    info.columns.set(col, defaultOf(rest));
    if (/\bprimary\s+key\b/i.test(rest)) info.primaryKey = [col];
    const ref = rest.match(new RegExp(String.raw`\breferences\s+${NAME}\s*(?:\(\s*"?(\w+)"?\s*\))?`, "i"));
    if (ref) addFk(t, col, ref[1], ref[2], null, /\b(primary\s+key|unique)\b/i.test(rest));
  };
  const addConstraint = (t, def) => {
    const fk = def.match(
      new RegExp(String.raw`^(?:constraint\s+"?(\w+)"?\s+)?foreign\s+key\s*\(\s*"?(\w+)"?\s*\)\s*references\s+${NAME}\s*(?:\(\s*"?(\w+)"?\s*\))?`, "i"),
    );
    if (fk) addFk(t, fk[2], fk[3], fk[4], fk[1], false);
    const pk = def.match(/^(?:constraint\s+"?\w+"?\s+)?primary\s+key\s*\(([^)]*)\)/i);
    if (pk) table(t).primaryKey = pk[1].split(",").map((s) => s.trim().replace(/"/g, ""));
  };

  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = stripComments(readFileSync(join(migrationsDir, file), "utf8"));

    for (const m of sql.matchAll(new RegExp(String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?${NAME}\s*\(`, "gi"))) {
      const t = m[1];
      table(t);
      for (const def of splitTop(balanced(sql, m.index + m[0].length - 1))) {
        if (/^(constraint|primary|foreign|unique|check|exclude)\b/i.test(def)) addConstraint(t, def);
        else addColumn(t, def);
      }
    }

    for (const m of sql.matchAll(new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${NAME}\s+([^;]*);`, "gi"))) {
      const t = m[1];
      for (const clause of splitTop(m[2])) {
        const add = clause.match(/^add\s+column\s+(?:if\s+not\s+exists\s+)?(.*)$/is);
        if (add) addColumn(t, add[1]);
        const con = clause.match(/^add\s+(constraint\s+.*|foreign\s+key.*|primary\s+key.*)$/is);
        if (con) addConstraint(t, con[1]);
        const ren = clause.match(/^rename\s+column\s+"?(\w+)"?\s+to\s+"?(\w+)"?/i);
        if (ren && tables.has(t)) {
          const cols = tables.get(t).columns;
          if (cols.has(ren[1])) {
            cols.set(ren[2], cols.get(ren[1]));
            cols.delete(ren[1]);
          }
          for (const fk of fks) if (fk.table === t && fk.column === ren[1]) fk.column = ren[2];
        }
        const drop = clause.match(/^drop\s+column\s+(?:if\s+exists\s+)?"?(\w+)"?/i);
        if (drop && tables.has(t)) tables.get(t).columns.delete(drop[1]);
      }
    }

    for (const m of sql.matchAll(new RegExp(String.raw`create\s+(?:or\s+replace\s+)?function\s+${NAME}\s*\(`, "gi"))) {
      const open = m.index + m[0].length - 1;
      const args = balanced(sql, open);
      const after = sql.slice(open + args.length + 2, open + args.length + 200);
      const r = after.match(/^\s*returns\s+(setof\s+)?(table\b|[\w.]+(?:\s+precision)?(?:\s*\[\])?)/i);
      if (!r) continue;
      const type = r[2].toLowerCase();
      functions.set(
        m[1],
        r[1] || type === "table"
          ? "set"
          : type.endsWith("[]")
            ? "array"
            : type === "trigger"
              ? "trigger"
              : type === "void"
                ? "void"
                : type === "boolean" || type === "bool"
                  ? "boolean"
                  : /^(int|integer|bigint|smallint|numeric|real|double precision|decimal|float\d?|int\d)$/.test(type)
                    ? "number"
                    : "value",
      );
    }
    for (const m of sql.matchAll(new RegExp(String.raw`drop\s+function\s+(?:if\s+exists\s+)?${NAME}`, "gi"))) {
      functions.delete(m[1]);
    }
    for (const m of sql.matchAll(new RegExp(String.raw`drop\s+table\s+(?:if\s+exists\s+)?${NAME}`, "gi"))) {
      tables.delete(m[1]);
      for (let i = fks.length - 1; i >= 0; i--) if (fks[i].table === m[1]) fks.splice(i, 1);
    }
  }

  return { tables, fks, functions };
}

/** The empty answer an RPC of this return kind gives when no stand-in is written. */
export function emptyReturn(kind) {
  switch (kind) {
    case "set":
    case "array":
      return [];
    case "boolean":
      return false;
    case "number":
      return 0;
    default:
      return null;
  }
}
