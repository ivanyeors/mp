/**
 * A small in-memory stand-in for the Supabase query builder, enough for the
 * review, Telegram-access and social-inbox modules: select / insert / upsert
 * (single or composite onConflict) / update / delete with eq, in, is, not-is,
 * lt, order and limit. Filters really filter
 * and guarded updates really miss, so "two taps, one post" is observed on the
 * rows rather than inferred from which methods were called.
 */

export type Row = Record<string, unknown>;

type Op = "select" | "insert" | "upsert" | "update" | "delete";

export function createFakeSupabase(
  tables: Record<string, Row[]>,
  defaults: Record<string, Row> = {},
) {
  let seq = 0;
  const nowIso = () => new Date().toISOString();

  function from(table: string) {
    const state: {
      op: Op;
      payload: Row | Row[] | null;
      upsert: { onConflict?: string; ignoreDuplicates?: boolean } | null;
      filters: ((r: Row) => boolean)[];
      order: { col: string; asc: boolean } | null;
      limit: number | null;
      columns: string[] | null;
    } = { op: "select", payload: null, upsert: null, filters: [], order: null, limit: null, columns: null };

    const rows = () => (tables[table] ??= []);
    const matches = (r: Row) => state.filters.every((f) => f(r));
    // Like PostgREST: a flat column list returns only those columns.
    const project = (r: Row): Row =>
      state.columns ? Object.fromEntries(state.columns.map((c) => [c, r[c] ?? null])) : { ...r };
    const fresh = (r: Row): Row => {
      seq += 1;
      return {
        id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
        created_at: nowIso(),
        updated_at: nowIso(),
        ...(defaults[table] ?? {}),
        ...r,
      };
    };

    function run(): { data: Row[]; error: null } {
      const result = execute();
      return { data: result.map(project), error: null };
    }

    function execute(): Row[] {
      const all = rows();
      if (state.op === "select") {
        let out = all.filter(matches);
        if (state.order) {
          const { col, asc } = state.order;
          out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
        }
        if (state.limit != null) out = out.slice(0, state.limit);
        return out;
      }
      const list = Array.isArray(state.payload) ? state.payload : [state.payload ?? {}];
      if (state.op === "insert") {
        const inserted = list.map(fresh);
        all.push(...inserted);
        return inserted;
      }
      if (state.op === "upsert") {
        // Composite keys ("a,b") as in Postgres: a NULL in the key never conflicts.
        const keys = (state.upsert?.onConflict ?? "id").split(",").map((k) => k.trim());
        const conflicts = (r: Row, row: Row) =>
          keys.every((k) => row[k] != null && r[k] === row[k]);
        const out: Row[] = [];
        for (const row of list) {
          const existing = all.find((r) => conflicts(r, row));
          if (existing) {
            if (state.upsert?.ignoreDuplicates) continue;
            Object.assign(existing, row, { updated_at: nowIso() });
            out.push(existing);
          } else {
            const inserted = fresh(row);
            all.push(inserted);
            out.push(inserted);
          }
        }
        return out;
      }
      if (state.op === "update") {
        const hit = all.filter(matches);
        for (const r of hit) Object.assign(r, state.payload, { updated_at: nowIso() });
        return hit;
      }
      const removed = all.filter(matches);
      tables[table] = all.filter((r) => !matches(r));
      return removed;
    }

    const builder = {
      select: (cols?: string) => {
        if (cols && cols !== "*" && !cols.includes("(")) state.columns = cols.split(",").map((c) => c.trim());
        return builder;
      },
      insert: (payload: Row | Row[]) => ((state.op = "insert"), (state.payload = payload), builder),
      upsert: (payload: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => (
        (state.op = "upsert"), (state.payload = payload), (state.upsert = opts ?? null), builder
      ),
      update: (payload: Row) => ((state.op = "update"), (state.payload = payload), builder),
      delete: () => ((state.op = "delete"), builder),
      eq: (col: string, v: unknown) => (state.filters.push((r) => r[col] === v), builder),
      in: (col: string, vs: unknown[]) => (state.filters.push((r) => vs.includes(r[col])), builder),
      is: (col: string, v: unknown) => (state.filters.push((r) => (r[col] ?? null) === v), builder),
      not: (col: string, op: string, v: unknown) => {
        if (op === "is") state.filters.push((r) => (r[col] ?? null) !== v);
        return builder;
      },
      lt: (col: string, v: unknown) => (state.filters.push((r) => String(r[col]) < String(v)), builder),
      order: (col: string, opts?: { ascending?: boolean }) => (
        (state.order = { col, asc: opts?.ascending !== false }), builder
      ),
      limit: (n: number) => ((state.limit = n), builder),
      maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
      single: async () => {
        const row = run().data[0];
        return row ? { data: row, error: null } : { data: null, error: { message: "no rows" } };
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        try {
          return Promise.resolve(resolve(run()));
        } catch (e) {
          return reject ? Promise.resolve(reject(e)) : Promise.reject(e);
        }
      },
    };
    return builder;
  }

  return { from };
}

export const GOOGLE_REVIEW_DEFAULTS: Row = {
  source: "business_profile",
  maps_uri: null,
  star_rating: null,
  comment: null,
  reviewer_name: null,
  reviewer_is_anonymous: false,
  review_created_at: null,
  review_updated_at: null,
  google_reply: null,
  google_reply_updated_at: null,
  status: "new",
  draft_reply: null,
  draft_source: null,
  draft_version: 0,
  draft_error: null,
  posted_reply: null,
  posted_at: null,
  acted_by_telegram_user_id: null,
  acted_by_name: null,
  telegram_chat_id: null,
  telegram_message_id: null,
  last_error: null,
  reopened_at: null,
  reopened_from_rating: null,
};
