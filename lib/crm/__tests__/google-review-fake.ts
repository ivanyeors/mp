import { fakeSupabaseAdmin, type FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * The shared fake admin, plus what CRM slice 12 reads and writes through SQL
 * (20261020134000_customer_google_reviews.sql), in memory:
 *
 *  - `admin_google_reviews_unlinked`, computed from `google_reviews` less the
 *    links on every read;
 *  - `google_review_match_candidates()`: the rows in `db.match_candidates` (as
 *    the SQL's windows and name prefilter would return them), less linked
 *    reviews, with `rejected` and `linked_elsewhere` read from the tables;
 *  - `link_google_review()`, `unlink_google_review()` and
 *    `reject_google_review_match()`, keyed as their tables are: a review has
 *    at most one link, a pair at most one rejection.
 *
 * The SQL itself is checked against Postgres (the slice's Build notes); this
 * checks the code around it.
 */

type Row = Record<string, unknown>;

export function fakeReviewsAdmin(db: FakeDb, opts: { now?: () => string } = {}) {
  const fake = fakeSupabaseAdmin(db);
  const now = opts.now ?? (() => "2026-11-05T02:00:00.000Z");
  const links = () => (db.customer_google_reviews ??= []);
  const rejections = () => (db.customer_google_review_rejections ??= []);
  const linkOf = (reviewId: unknown) => links().find((l) => l.google_review_id === reviewId);

  const result = (rows: Row[] | unknown, error: { message: string; code?: string } | null = null) => {
    let list = Array.isArray(rows) ? [...rows] : rows;
    const b = {
      order: (col: string) => {
        if (Array.isArray(list)) list = [...list].sort((x, y) => String(x[col]).localeCompare(String(y[col])));
        return b;
      },
      range: (from: number, to: number) => {
        if (Array.isArray(list)) list = list.slice(from, to + 1);
        return b;
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: error ? null : list, error }).then(resolve, reject),
    };
    return b;
  };

  const exists = (table: string, id: unknown) => (db[table] ?? []).some((r) => r.id === id);

  return {
    from(table: string) {
      if (table === "admin_google_reviews_unlinked") {
        db.admin_google_reviews_unlinked = (db.google_reviews ?? [])
          .filter((g) => !linkOf(g.id))
          .map((g) => ({
            id: g.id,
            star_rating: g.star_rating ?? null,
            comment: g.comment ?? null,
            reviewer_name: g.reviewer_name ?? null,
            reviewer_is_anonymous: Boolean(g.reviewer_is_anonymous),
            reviewed_at: g.review_created_at ?? g.created_at,
            status: g.status ?? "pending",
            has_google_reply: Boolean(g.google_reply),
          }));
      }
      return fake.from(table);
    },
    rpc(name: string, args: Record<string, unknown>) {
      if (name === "google_review_match_candidates") {
        const ids = args.p_review_ids as string[] | null;
        const customer = args.p_customer_id as string | null;
        const rows = (db.match_candidates ?? [])
          .filter((c) => !linkOf(c.google_review_id))
          .filter((c) => !ids || ids.includes(c.google_review_id as string))
          .map((c): Row => ({
            ...c,
            rejected: rejections().some((x) => x.google_review_id === c.google_review_id && x.customer_id === c.customer_id),
            linked_elsewhere: links().some((l) => l.customer_id === c.customer_id),
          }));
        const reviews = new Set(rows.filter((r) => r.customer_id === customer).map((r) => r.google_review_id));
        return result(customer ? rows.filter((r) => reviews.has(r.google_review_id)) : rows);
      }
      if (name === "link_google_review") {
        if (!exists("google_reviews", args.p_google_review_id) || !exists("customers", args.p_customer_id)) {
          return result(null, { message: "violates foreign key constraint", code: "23503" });
        }
        if (args.p_how !== "suggestion" && args.p_how !== "manual") {
          return result(null, { message: "violates check constraint", code: "23514" });
        }
        const held = linkOf(args.p_google_review_id);
        if (held) return result([{ linked: false, ...pick(held) }]);
        const row = {
          google_review_id: args.p_google_review_id,
          customer_id: args.p_customer_id,
          how: args.p_how,
          linked_by_profile_id: args.p_profile_id ?? null,
          linked_at: now(),
        };
        links().push(row);
        db.customer_google_review_rejections = rejections().filter(
          (x) => !(x.google_review_id === row.google_review_id && x.customer_id === row.customer_id),
        );
        return result([{ linked: true, ...pick(row) }]);
      }
      if (name === "unlink_google_review") {
        const held = links().find(
          (l) => l.google_review_id === args.p_google_review_id && l.customer_id === args.p_customer_id,
        );
        if (!held) return result(false);
        db.customer_google_reviews = links().filter((l) => l !== held);
        reject(args);
        return result(true);
      }
      if (name === "reject_google_review_match") {
        if (!exists("google_reviews", args.p_google_review_id) || !exists("customers", args.p_customer_id)) {
          return result(null, { message: "violates foreign key constraint", code: "23503" });
        }
        const held = links().some(
          (l) => l.google_review_id === args.p_google_review_id && l.customer_id === args.p_customer_id,
        );
        if (held) return result("linked");
        reject(args);
        return result("rejected");
      }
      throw new Error(`fakeReviewsAdmin: rpc ${name} is not faked`);
    },
  };

  function reject(args: Record<string, unknown>) {
    const pair = (x: Row) => x.google_review_id === args.p_google_review_id && x.customer_id === args.p_customer_id;
    if (rejections().some(pair)) return;
    rejections().push({
      google_review_id: args.p_google_review_id,
      customer_id: args.p_customer_id,
      rejected_by_profile_id: args.p_profile_id ?? null,
      rejected_at: now(),
    });
  }
}

const pick = (r: Row) => ({
  customer_id: r.customer_id,
  how: r.how,
  linked_by_profile_id: r.linked_by_profile_id,
  linked_at: r.linked_at,
});
