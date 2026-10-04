/**
 * In-memory stand-in for `supabaseAdmin()` that answers the query the code
 * actually builds. `ilike` is real SQL ILIKE (backslash escapes, `%`, `_`, and
 * PostgREST's rewrite of every `*` to `%`) and
 * `eq` is exact, so a wildcard in user input matches here exactly as it would in
 * Postgres — tests fail for the real reason, not because a call shape changed.
 * Same technique as lib/auth/__tests__/partner.test.ts.
 *
 * A to-one embed in the select list (`role:admin_roles(...)`) is resolved
 * through the `<alias>_id` column, as PostgREST does through the foreign key.
 */
type Row = Record<string, unknown>;
export type FakeDb = Record<string, Row[]>;

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

export function fakeSupabaseAdmin(db: FakeDb) {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      let patch: Row | null = null;
      let removing = false;
      let head = false;
      let inserted: Row | null = null;
      let embeds: Array<[alias: string, table: string]> = [];
      let sort: { col: string; asc: boolean } | null = null;
      const out = (row: Row): Row => {
        if (!embeds.length) return row;
        const copy = { ...row };
        for (const [alias, other] of embeds) {
          copy[alias] = (db[other] ?? []).find((o) => o.id === row[`${alias}_id`]) ?? null;
        }
        return copy;
      };
      const rows = () => {
        const r = inserted ? [inserted] : (db[table] ??= []).filter((row) => filters.every((f) => f(row)));
        if (patch) for (const row of r) Object.assign(row, patch);
        if (removing) db[table] = (db[table] ?? []).filter((row) => !r.includes(row));
        if (sort) {
          const { col, asc } = sort;
          r.sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : 1) * (asc ? 1 : -1));
        }
        return r;
      };
      const q = {
        select: (cols?: string, opts?: { head?: boolean }) => {
          head = Boolean(opts?.head);
          embeds = [...(cols ?? "").matchAll(/(\w+):(\w+)\(/g)].map((m) => [m[1], m[2]]);
          return q;
        },
        eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), q),
        in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), q),
        order: (col: string, opts?: { ascending?: boolean }) => ((sort = { col, asc: opts?.ascending !== false }), q),
        neq: (col: string, val: unknown) => (filters.push((r) => r[col] !== val), q),
        is: (col: string, val: null) => (filters.push((r) => (r[col] ?? null) === val), q),
        not: (col: string, _op: "is", val: null) => (filters.push((r) => (r[col] ?? null) !== val), q),
        ilike: (col: string, pattern: string) =>
          (filters.push((r) => likeMatch(pattern.replaceAll("*", "%"), r[col])), q),
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
          return Promise.resolve({ data: head ? null : r.map(out), count: r.length, error: null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
}
