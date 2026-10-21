/**
 * In-memory stand-in for `supabaseAdmin()` that answers the query the code
 * actually builds. `ilike` is real SQL ILIKE (backslash escapes, `%`, `_`, and
 * PostgREST's rewrite of every `*` to `%`) and
 * `eq` is exact, so a wildcard in user input matches here exactly as it would in
 * Postgres — tests fail for the real reason, not because a call shape changed.
 * Same technique as lib/auth/__tests__/partner.test.ts.
 *
 * A to-one embed in the select list (`role:admin_roles(...)`) is resolved
 * through the `<alias>_id` column, or the column named by a `!column` hint
 * (`member:admin_users!admin_user_id(...)`), as PostgREST does through the
 * foreign key. An `!inner` embed (`orders!inner(...)`, keyed by the singular
 * table name's `_id` column when it has no alias) drops rows it does not match,
 * and a filter on `orders.customer_id` reads the embedded row, as PostgREST's
 * embedded filters do.
 *
 * `lt`/`lte`/`gt`/`gte` compare two ISO timestamps as instants, to the
 * microsecond, as Postgres compares timestamptz: `…:00Z` and `…:00.000000Z`
 * are the same time. Two numbers compare as numbers. Anything else compares as
 * strings.
 * `filter(col, "imatch", re)` is a case-insensitive regex match.
 * `overlaps` (`&&`, given an array or a quoted array literal such as
 * `{"premium"}`) and `contains` (`@>`) read an array column. `range(from, to)`
 * returns that slice, and the exact count is of every matching row, as
 * PostgREST counts.
 */
type Row = Record<string, unknown>;
export type FakeDb = Record<string, Row[]>;

/** An ISO timestamp as a sortable UTC string with six fraction digits, or null. */
function instant(value: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})$/.exec(value);
  if (!m) return null;
  const ms = Date.parse(`${m[1]}${m[3]}`);
  if (Number.isNaN(ms)) return null;
  return `${new Date(ms).toISOString().slice(0, 19)}.${(m[2] ?? "").padEnd(6, "0").slice(0, 6)}Z`;
}

const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function likeMatch(pattern: string, value: unknown): boolean {
  if (typeof value !== "string") return false;
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") re += reEscape(pattern[++i] ?? "");
    else if (c === "%") re += ".*";
    else if (c === "_") re += ".";
    else re += reEscape(c);
  }
  return new RegExp(`^${re}$`, "is").test(value);
}

/** The elements of a Postgres array literal (`{"a","b\"c"}` or `{a,b}`), as strings. */
function pgArrayElements(literal: string): string[] {
  const body = literal.trim().replace(/^\{/, "").replace(/\}$/, "");
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  let started = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quoted) {
      if (c === "\\") cur += body[++i] ?? "";
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') {
      quoted = true;
      started = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
      started = false;
    } else {
      cur += c;
      started = true;
    }
  }
  if (started || cur) out.push(cur);
  return out;
}

const asElements = (val: unknown): string[] => (Array.isArray(val) ? val.map(String) : pgArrayElements(String(val)));

type Embed = { alias: string; table: string; fk: string; inner: boolean };

/**
 * `alias:table(...)`, `alias:table!fk(...)` and `[alias:]table!inner(...)`. An
 * unaliased embed is read only with `!inner`, so a select that never relied on
 * one keeps returning the rows it always did.
 */
function parseEmbeds(cols: string): Embed[] {
  const out: Embed[] = [];
  for (const m of cols.matchAll(/(?:(\w+):)?(\w+)((?:!\w+)*)\(/g)) {
    const [, alias, table, mods] = m;
    const hints = mods.split("!").filter(Boolean);
    const inner = hints.includes("inner");
    if (!alias && !inner) continue;
    const fk = hints.find((h) => h !== "inner") ?? (alias ? `${alias}_id` : `${table.replace(/s$/, "")}_id`);
    out.push({ alias: alias ?? table, table, fk, inner });
  }
  return out;
}

export function fakeSupabaseAdmin(db: FakeDb) {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      let patch: Row | null = null;
      let removing = false;
      let head = false;
      let inserted: Row | null = null;
      let embeds: Embed[] = [];
      // Each `order` adds a key after the ones before it, as PostgREST's `order=a,b` does.
      const sorts: { col: string; asc: boolean }[] = [];
      let limit: number | null = null;
      let range: [number, number] | null = null;
      const embedded = (row: Row, e: Embed): Row | null => (db[e.table] ?? []).find((o) => o.id === row[e.fk]) ?? null;
      // `orders.customer_id` reads the embedded `orders` row.
      const value = (row: Row, col: string): unknown => {
        const dot = col.indexOf(".");
        if (dot < 0) return row[col];
        const e = embeds.find((x) => x.alias === col.slice(0, dot));
        return e ? embedded(row, e)?.[col.slice(dot + 1)] : undefined;
      };
      const out = (row: Row): Row => {
        if (!embeds.length) return row;
        const copy = { ...row };
        for (const e of embeds) copy[e.alias] = embedded(row, e);
        return copy;
      };
      const rows = () => {
        let r = inserted
          ? [inserted]
          : (db[table] ??= []).filter(
              (row) => filters.every((f) => f(row)) && embeds.every((e) => !e.inner || embedded(row, e) !== null),
            );
        if (patch) for (const row of r) Object.assign(row, patch);
        if (removing) db[table] = (db[table] ?? []).filter((row) => !r.includes(row));
        if (sorts.length) {
          r.sort((a, b) => {
            for (const s of sorts) {
              const x = String(a[s.col] ?? "");
              const y = String(b[s.col] ?? "");
              if (x < y) return s.asc ? -1 : 1;
              if (x > y) return s.asc ? 1 : -1;
            }
            return 0;
          });
        }
        if (limit !== null) r = r.slice(0, limit);
        return r;
      };
      const cmp = (col: string, test: <T extends string | number>(a: T, b: T) => boolean, val: unknown) => {
        filters.push((r) => {
          const v = value(r, col);
          if (v == null) return false;
          // Two numbers compare as numbers, as a numeric column does.
          if (typeof v === "number" && typeof val === "number") return test(v, val);
          const [a, b] = [String(v), String(val)];
          const ta = instant(a);
          const tb = instant(b);
          return ta !== null && tb !== null ? test(ta, tb) : test(a, b);
        });
        return q;
      };
      const q = {
        select: (cols?: string, opts?: { head?: boolean }) => {
          head = Boolean(opts?.head);
          embeds = parseEmbeds(cols ?? "");
          return q;
        },
        eq: (col: string, val: unknown) => (filters.push((r) => value(r, col) === val), q),
        in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(value(r, col))), q),
        order: (col: string, opts?: { ascending?: boolean }) => (sorts.push({ col, asc: opts?.ascending !== false }), q),
        limit: (n: number) => ((limit = n), q),
        range: (from: number, to: number) => ((range = [from, to]), q),
        overlaps: (col: string, val: unknown) => {
          const want = asElements(val);
          filters.push((r) => {
            const v = value(r, col);
            return Array.isArray(v) && v.some((x) => want.includes(String(x)));
          });
          return q;
        },
        contains: (col: string, val: unknown) => {
          const want = asElements(val);
          filters.push((r) => {
            const v = value(r, col);
            return Array.isArray(v) && want.every((x) => v.map(String).includes(x));
          });
          return q;
        },
        neq: (col: string, val: unknown) => (filters.push((r) => value(r, col) !== val), q),
        is: (col: string, val: null) => (filters.push((r) => (value(r, col) ?? null) === val), q),
        not: (col: string, op: "is" | "cs", val: unknown) => {
          if (op === "cs") {
            const want = asElements(val);
            filters.push((r) => {
              const v = value(r, col);
              return !(Array.isArray(v) && want.every((x) => v.map(String).includes(x)));
            });
          } else filters.push((r) => (value(r, col) ?? null) !== val);
          return q;
        },
        lt: (col: string, val: unknown) => cmp(col, (a, b) => a < b, val),
        lte: (col: string, val: unknown) => cmp(col, (a, b) => a <= b, val),
        gt: (col: string, val: unknown) => cmp(col, (a, b) => a > b, val),
        gte: (col: string, val: unknown) => cmp(col, (a, b) => a >= b, val),
        filter: (col: string, op: string, val: string) => {
          if (op !== "imatch" && op !== "match") throw new Error(`fake-admin: filter "${op}" is not supported`);
          const re = new RegExp(val, op === "imatch" ? "i" : "");
          filters.push((r) => {
            const v = value(r, col);
            return typeof v === "string" && re.test(v);
          });
          return q;
        },
        ilike: (col: string, pattern: string) =>
          (filters.push((r) => likeMatch(pattern.replaceAll("*", "%"), value(r, col))), q),
        update: (p: Row) => ((patch = p), q),
        delete: () => ((removing = true), q),
        insert: (row: Row) => {
          inserted = { id: `${table}-${(db[table] ?? []).length + 1}`, ...row };
          db[table] = [...(db[table] ?? []), inserted];
          return q;
        },
        // PostgREST: single() errors unless exactly one row; maybeSingle() only on >1.
        single: () => {
          const r = rows();
          return Promise.resolve(
            r.length === 1 ? { data: out(r[0]), error: null } : { data: null, error: { message: `${r.length} rows` } },
          );
        },
        maybeSingle: () => {
          const r = rows();
          return Promise.resolve(
            r.length <= 1 ? { data: r[0] ? out(r[0]) : null, error: null } : { data: null, error: { message: "multiple rows" } },
          );
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          const r = rows();
          const page = range ? r.slice(range[0], range[1] + 1) : r;
          return Promise.resolve({ data: head ? null : page.map(out), count: r.length, error: null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
}
