import type { SupabaseClient } from "@supabase/supabase-js";
import { likeMatch } from "@/lib/supabase/__tests__/fake-admin";

/**
 * In-memory stand-in for the service-role client, for the Aftercare jobs (CRM
 * slices 07 and 08). It answers the PostgREST calls the jobs, the email ledger
 * and the WhatsApp channel make: eq / in / gte / lt / lte / like / is /
 * not-null filters, order, limit, range, head counts, update,
 * `upsert(..., { onConflict, ignoreDuplicates })` with a real unique key, and
 * `claim_customer_email` exactly as the migration defines it.
 *
 * An `orders` row holds its `order_items` inline. A filter on
 * `order_items.<col>` keeps the matching lines and drops an order with none,
 * as an `!inner` embed does.
 *
 * Every statement yields before it runs, then runs in one step, so runs started
 * together with Promise.all interleave between statements the way concurrent
 * cron runs do, while each statement stays atomic as it is in Postgres.
 */
type Row = Record<string, unknown>;
export type ReviewFakeDb = Record<string, Row[]>;

const UNIQUE: Record<string, string[][]> = {
  customer_review_requests: [["customer_id"], ["token_hash"]],
  customer_emails: [["customer_id", "template", "entity_id"]],
  customer_whatsapp: [["customer_id", "template", "entity_id"]],
  site_settings: [["key"]],
};

const tick = () => new Promise((r) => setTimeout(r, 0));

export function reviewFakeDb(db: ReviewFakeDb, opts: { failRpc?: boolean } = {}) {
  let seq = 1000;
  const clock = () => new Date(Date.now() + ++seq).toISOString();

  const claimCustomerEmail = (args: Record<string, unknown>) => {
    const rows = (db.customer_emails ??= []);
    const existing = rows.find(
      (r) => r.customer_id === args.p_customer_id && r.template === args.p_template && r.entity_id === args.p_entity_id,
    );
    if (!existing) {
      const row = {
        id: ++seq,
        customer_id: args.p_customer_id,
        template: args.p_template,
        entity_id: args.p_entity_id,
        status: "pending",
        attempts: 1,
        last_error: null,
        sent_at: null,
        created_at: clock(),
      };
      rows.push(row);
      return [{ id: row.id, attempts: 1 }];
    }
    if (existing.status === "failed" && Number(existing.attempts) < 3) {
      existing.status = "pending";
      existing.attempts = Number(existing.attempts) + 1;
      existing.last_error = null;
      return [{ id: existing.id, attempts: existing.attempts }];
    }
    return [];
  };

  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      await tick();
      if (opts.failRpc) return { data: null, error: { message: "rpc down" } };
      if (name === "claim_customer_email") return { data: claimCustomerEmail(args), error: null };
      return { data: null, error: { message: `no rpc ${name}` } };
    },
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      const nested: Array<[string, string, unknown]> = [];
      let op: "select" | "update" | "upsert" = "select";
      let payload: Row | Row[] = {};
      let upsertOpts: { onConflict: string; ignoreDuplicates?: boolean } = { onConflict: "id" };
      let head = false;
      let sort: { col: string; asc: boolean } | null = null;
      let limit: number | null = null;
      let range: [number, number] | null = null;
      const list = () => (db[table] ??= []);

      const filtered = () => {
        let rows = list().filter((r) => filters.every((f) => f(r)));
        if (nested.length) {
          rows = rows
            .map((r) => {
              const copy = { ...r };
              for (const [embed, col, val] of nested) {
                copy[embed] = ((r[embed] as Row[] | undefined) ?? []).filter((x) => (x[col] ?? "goods") === val);
              }
              return copy;
            })
            .filter((r) => nested.every(([embed]) => (r[embed] as Row[]).length > 0));
        }
        return rows;
      };

      const exec = async () => {
        await tick();
        if (op === "upsert") {
          const rows = Array.isArray(payload) ? payload : [payload];
          const keys = upsertOpts.onConflict.split(",").map((k) => k.trim());
          const out: Row[] = [];
          for (const row of rows) {
            const clash = list().find((r) => keys.every((k) => r[k] === row[k]));
            if (clash) {
              if (!upsertOpts.ignoreDuplicates) {
                Object.assign(clash, row);
                out.push(clash);
              }
              continue;
            }
            for (const unique of UNIQUE[table] ?? []) {
              if (list().some((r) => unique.every((k) => r[k] === row[k]))) {
                return { data: null, error: { message: `duplicate key on ${unique.join(",")}`, code: "23505" }, count: null };
              }
            }
            const inserted = { id: ++seq, created_at: clock(), ...row };
            list().push(inserted);
            out.push(inserted);
          }
          return { data: out.map((r) => ({ ...r })), error: null, count: null };
        }
        if (op === "update") {
          const hit = filtered();
          for (const r of list().filter((x) => filters.every((f) => f(x)))) Object.assign(r, payload);
          return { data: hit, error: null, count: hit.length };
        }
        let rows = filtered();
        if (sort) {
          const { col, asc } = sort;
          rows = [...rows].sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : 1) * (asc ? 1 : -1));
        }
        if (limit !== null) rows = rows.slice(0, limit);
        if (range) rows = rows.slice(range[0], range[1] + 1);
        return { data: head ? null : rows.map((r) => ({ ...r })), error: null, count: rows.length };
      };

      const b = {
        select: (_cols?: string, o?: { head?: boolean }) => ((head = Boolean(o?.head)), b),
        update: (p: Row) => ((op = "update"), (payload = p), b),
        upsert: (p: Row | Row[], o: { onConflict: string; ignoreDuplicates?: boolean }) => (
          (op = "upsert"), (payload = p), (upsertOpts = o), b
        ),
        eq: (col: string, val: unknown) => {
          if (col.includes(".")) {
            const [embed, c] = col.split(".");
            nested.push([embed, c, val]);
          } else filters.push((r) => r[col] === val);
          return b;
        },
        in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), b),
        gte: (col: string, v: string) => (filters.push((r) => r[col] != null && Date.parse(String(r[col])) >= Date.parse(v)), b),
        lt: (col: string, v: string | number) => {
          filters.push((r) =>
            typeof v === "number" ? Number(r[col]) < v : r[col] != null && Date.parse(String(r[col])) < Date.parse(v),
          );
          return b;
        },
        lte: (col: string, v: string) =>
          (filters.push((r) => r[col] != null && Date.parse(String(r[col])) <= Date.parse(v)), b),
        like: (col: string, pattern: string) =>
          (filters.push((r) => likeMatch(pattern.replaceAll("*", "%"), r[col], { caseSensitive: true })), b),
        range: (from: number, to: number) => ((range = [from, to]), b),
        is: (col: string, v: null) => (filters.push((r) => (r[col] ?? null) === v), b),
        not: (col: string, operator: string, v: unknown) => {
          if (operator !== "is" || v !== null) throw new Error(`fake: not(${col}, ${operator})`);
          filters.push((r) => r[col] != null);
          return b;
        },
        order: (col: string, o?: { ascending?: boolean }) => ((sort = { col, asc: o?.ascending !== false }), b),
        limit: (n: number) => ((limit = n), b),
        maybeSingle: async () => {
          const res = await exec();
          const rows = (res.data as Row[] | null) ?? [];
          return rows.length <= 1
            ? { data: rows[0] ?? null, error: res.error }
            : { data: null, error: { message: "multiple rows" } };
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => exec().then(resolve, reject),
      };
      return b;
    },
  };
  return client as unknown as SupabaseClient & { rpc: typeof client.rpc };
}
