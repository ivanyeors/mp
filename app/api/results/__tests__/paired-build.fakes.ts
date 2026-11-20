import { randomUUID } from "crypto";

export type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;
type PgError = { message: string; code: string; details?: string };

export const db = {
  tables: {} as Record<string, Row[]>,
  log: [] as Array<{ table: string; op: string; filters: string[]; patch?: unknown }>,
  faults: [] as Array<{ table: string; op: string; error: PgError; when?: (patch: unknown) => boolean }>,
  seq: 0,
};

export function resetDb(seed: Record<string, Row[]> = {}) {
  db.tables = {};
  db.log = [];
  db.faults = [];
  db.seq = 0;
  for (const [t, rows] of Object.entries(seed)) db.tables[t] = rows.map((r) => ({ ...r }));
}

export const rows = (table: string): Row[] => (db.tables[table] ??= []);
export const row = (table: string, id: unknown): Row | undefined =>
  rows(table).find((r) => r.id === id);

type UniqueKey = string[] | { cols: string[]; where: (r: Row) => boolean };

const UNIQUE: Record<string, UniqueKey[]> = {
  mp_config_responses: [
    ["id"],
    { cols: ["access_token"], where: (r) => r.paired_build_id == null || r.paired_build_id === r.id },
  ],
  orders: [["id"]],
  order_items: [["id"]],
  order_payments: [["stripe_object_id"]],
  stripe_webhook_failures: [["event_id"]],
  site_settings: [["key"]],
};

const uniqueKeys = (table: string) =>
  (UNIQUE[table] ?? []).map((key) => (Array.isArray(key) ? { cols: key, where: () => true } : key));

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function nowIso() {
  return new Date().toISOString();
}

function defaultsFor(table: string): Row {
  db.seq += 1;
  const base: Row = { id: randomUUID(), created_at: nowIso(), updated_at: nowIso() };
  if (table === "orders") {
    return {
      ...base,
      order_number: `MP-${String(db.seq).padStart(5, "0")}`,
      needs_attention: false,
      amount_refunded: 0,
    };
  }
  if (table === "mp_config_responses") {
    return {
      ...base,
      status: null,
      is_final: false,
      payment_intent_id: null,
      paired_build_id: null,
      order_id: null,
      topup_payment_intent_id: null,
      topup_paid_at: null,
      payment_reminder_count: 0,
      payment_reminder_last_at: null,
      last_reminder_at: null,
      final_amount: null,
      assigned_at: null,
    };
  }
  return base;
}

function splitCols(sel: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of sel) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function project(table: string, r: Row, sel: string | null): Row {
  if (sel == null || sel.trim() === "" || sel.trim() === "*") return structuredClone(r);
  const out: Row = {};
  for (const tok of splitCols(sel)) {
    if (tok === "*") {
      Object.assign(out, structuredClone(r));
      continue;
    }
    const embed = tok.match(/^([a-z_]+)(?:!inner)?\(([\s\S]*)\)$/);
    if (embed) {
      const child = embed[1];
      const ownFk = `${child.replace(/s$/, "")}_id`;
      if (ownFk in r) {
        const parent = rows(child).find((c) => c.id === r[ownFk]);
        out[child] = parent ? project(child, parent, embed[2]) : null;
        continue;
      }
      const fk = `${table.replace(/s$/, "")}_id`;
      out[child] = rows(child)
        .filter((c) => c[fk] === r.id)
        .map((c) => project(child, c, embed[2]));
      continue;
    }
    const [alias, col] = tok.includes(":") ? tok.split(":").map((s) => s.trim()) : [tok, tok];
    out[alias] = structuredClone(r[col]);
  }
  return out;
}

function sqlEq(a: unknown, b: unknown) {
  if (a == null || b == null) return false;
  return String(a) === String(b) || a === b;
}

function field(r: Row, c: string): unknown {
  const [col, key] = c.split("->>");
  if (key === undefined) return r[col];
  const json = r[col];
  return json && typeof json === "object" ? (json as Row)[key] : undefined;
}

class Query {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: Row | Row[] | null = null;
  private sel: string | null = null;
  private returning = false;
  private filters: Filter[] = [];
  private filterDesc: string[] = [];
  private orderBy: Array<{ col: string; asc: boolean }> = [];
  private lim: number | null = null;
  private countMode: string | null = null;
  private head = false;
  private onConflict: string | null = null;
  private ignoreDuplicates = false;
  private promise: Promise<{ data: unknown; error: PgError | null; count?: number | null }> | null = null;

  constructor(private table: string) {}

  select(sel = "*", opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") this.sel = sel;
    else {
      this.returning = true;
      this.sel = sel;
    }
    if (opts?.count) this.countMode = opts.count;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(p: Row | Row[]) {
    this.op = "insert";
    this.payload = p;
    return this;
  }
  upsert(p: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert";
    this.payload = p;
    this.onConflict = opts?.onConflict ?? null;
    this.ignoreDuplicates = Boolean(opts?.ignoreDuplicates);
    return this;
  }
  update(p: Row) {
    this.op = "update";
    this.payload = p;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  private f(desc: string, fn: Filter) {
    this.filters.push(fn);
    this.filterDesc.push(desc);
    return this;
  }
  eq(c: string, v: unknown) {
    return this.f(`${c}=eq.${String(v)}`, (r) => sqlEq(field(r, c), v));
  }
  neq(c: string, v: unknown) {
    return this.f(`${c}=neq.${String(v)}`, (r) => r[c] != null && v != null && !sqlEq(r[c], v));
  }
  is(c: string, v: unknown) {
    return this.f(`${c}=is.${String(v)}`, (r) => (v === null ? r[c] == null : r[c] === v));
  }
  in(c: string, vs: unknown[]) {
    return this.f(`${c}=in.(${vs.join(",")})`, (r) => r[c] != null && vs.some((v) => sqlEq(r[c], v)));
  }
  gt(c: string, v: unknown) {
    return this.f(`${c}=gt.${String(v)}`, (r) => r[c] != null && (r[c] as number) > (v as number));
  }
  gte(c: string, v: unknown) {
    return this.f(`${c}=gte.${String(v)}`, (r) => r[c] != null && (r[c] as number) >= (v as number));
  }
  lt(c: string, v: unknown) {
    return this.f(`${c}=lt.${String(v)}`, (r) => r[c] != null && (r[c] as number) < (v as number));
  }
  lte(c: string, v: unknown) {
    return this.f(`${c}=lte.${String(v)}`, (r) => r[c] != null && (r[c] as number) <= (v as number));
  }
  not(c: string, op: string, v: unknown) {
    if (op === "is" && v === null) return this.f(`${c}=not.is.null`, (r) => r[c] != null);
    if (op === "in") {
      const vs = String(v).replace(/^\(|\)$/g, "").split(",");
      return this.f(`${c}=not.in.${String(v)}`, (r) => r[c] != null && !vs.includes(String(r[c])));
    }
    if (op === "eq") return this.f(`${c}=not.eq.${String(v)}`, (r) => r[c] != null && !sqlEq(r[c], v));
    throw new Error(`fake supabase: unsupported not(${op})`);
  }
  match(obj: Row) {
    for (const [k, v] of Object.entries(obj)) this.eq(k, v);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }

  private matched(): Row[] {
    return rows(this.table).filter((r) => this.filters.every((f) => f(r)));
  }

  private uniqueClash(candidate: Row, ignore: Row | null): PgError | null {
    for (const { cols, where } of uniqueKeys(this.table)) {
      if (cols.some((c) => candidate[c] == null) || !where(candidate)) continue;
      const clash = rows(this.table).find(
        (r) => r !== ignore && where(r) && cols.every((c) => sqlEq(r[c], candidate[c])),
      );
      if (clash) {
        return {
          code: "23505",
          message: `duplicate key value violates unique constraint "${this.table}_${cols.join("_")}_key"`,
        };
      }
    }
    return null;
  }

  private async exec() {
    await tick();
    db.log.push({ table: this.table, op: this.op, filters: this.filterDesc, patch: this.payload ?? undefined });
    const fi = db.faults.findIndex(
      (f) => f.table === this.table && f.op === this.op && (!f.when || f.when(this.payload)),
    );
    if (fi >= 0) {
      const [fault] = db.faults.splice(fi, 1);
      return { data: null, error: fault.error };
    }
    const t = rows(this.table);
    const out = (list: Row[]) => list.map((r) => project(this.table, r, this.sel));

    if (this.op === "select") {
      let list = this.matched();
      for (const o of [...this.orderBy].reverse()) {
        list = [...list].sort((a, b) => {
          const x = a[o.col] as number | string;
          const y = b[o.col] as number | string;
          if (x === y) return 0;
          if (x == null) return 1;
          if (y == null) return -1;
          return (x < y ? -1 : 1) * (o.asc ? 1 : -1);
        });
      }
      if (this.lim != null) list = list.slice(0, this.lim);
      const count = this.countMode ? list.length : null;
      return { data: this.head ? null : out(list), error: null, count };
    }

    if (this.op === "insert" || this.op === "upsert") {
      const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload ?? {}]).map((p) => ({
        ...defaultsFor(this.table),
        ...structuredClone(p),
      }));
      const written: Row[] = [];
      const staged: Array<{ target: Row | null; next: Row }> = [];
      for (const next of incoming) {
        if (this.op === "upsert") {
          const keys = (this.onConflict ?? "id").split(",").map((s) => s.trim());
          const existing = t.find((r) => keys.every((k) => sqlEq(r[k], next[k])));
          if (existing) {
            if (!this.ignoreDuplicates) staged.push({ target: existing, next });
            continue;
          }
        }
        const clash = this.uniqueClash(next, null);
        if (clash) return { data: null, error: clash };
        if (staged.some((s) => s.target == null && uniqueKeys(this.table).some(({ cols, where }) => where(next) && where(s.next) && cols.every((c) => next[c] != null && sqlEq(s.next[c], next[c]))))) {
          return { data: null, error: { code: "23505", message: "duplicate key within statement" } };
        }
        staged.push({ target: null, next });
      }
      for (const s of staged) {
        if (s.target) {
          const { id: _ignored, created_at: _c, ...rest } = s.next;
          void _ignored;
          void _c;
          Object.assign(s.target, rest, { updated_at: nowIso() });
          written.push(s.target);
        } else {
          t.push(s.next);
          written.push(s.next);
        }
      }
      return { data: this.returning ? out(written) : null, error: null };
    }

    if (this.op === "update") {
      if (this.filters.length === 0) {
        return { data: null, error: { code: "21000", message: "UPDATE requires a WHERE clause" } };
      }
      const hit = this.matched();
      const patch = structuredClone(this.payload as Row);
      for (const r of hit) {
        const clash = this.uniqueClash({ ...r, ...patch }, r);
        if (clash) return { data: null, error: clash };
      }
      for (const r of hit) Object.assign(r, patch, { updated_at: nowIso() });
      return { data: this.returning ? out(hit) : null, error: null };
    }

    if (this.filters.length === 0) {
      return { data: null, error: { code: "21000", message: "DELETE requires a WHERE clause" } };
    }
    const hit = this.matched();
    db.tables[this.table] = t.filter((r) => !hit.includes(r));
    const ids = new Set(hit.map((r) => r.id));
    if (this.table === "mp_config_responses") {
      for (const r of rows("mp_config_responses")) {
        if (r.paired_build_id != null && ids.has(r.paired_build_id)) r.paired_build_id = null;
      }
    }
    if (this.table === "orders") {
      for (const child of ["order_items", "order_payments", "order_timeline"]) {
        db.tables[child] = rows(child).filter((c) => !ids.has(c.order_id));
      }
    }
    return { data: this.returning ? out(hit) : null, error: null };
  }

  private run() {
    return (this.promise ??= this.exec());
  }

  async maybeSingle() {
    const res = await this.run();
    if (res.error) return { data: null, error: res.error };
    const list = (res.data as Row[] | null) ?? [];
    if (list.length > 1) {
      return {
        data: null,
        error: {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
          details: `Results contain ${list.length} rows, application/vnd.pgrst.object+json requires 1 row`,
        },
      };
    }
    return { data: list[0] ?? null, error: null };
  }

  async single() {
    const res = await this.run();
    if (res.error) return { data: null, error: res.error };
    const list = (res.data as Row[] | null) ?? [];
    if (list.length !== 1) {
      return {
        data: null,
        error: {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
          details: `Results contain ${list.length} rows`,
        },
      };
    }
    return { data: list[0], error: null };
  }

  then<T1, T2>(
    onF: (v: { data: unknown; error: PgError | null; count?: number | null }) => T1 | PromiseLike<T1>,
    onR?: (e: unknown) => T2 | PromiseLike<T2>,
  ) {
    return this.run().then(onF, onR);
  }
}

export const fakeAdmin = {
  from: (table: string) => new Query(table),
  rpc: async (fn: string) => ({ data: null, error: { code: "42883", message: `fake: rpc ${fn} not implemented` } }),
  storage: {
    from: () => ({
      list: async () => ({ data: [], error: null }),
    }),
  },
};

export class FakeStripeError extends Error {
  type = "StripeInvalidRequestError";
  constructor(
    message: string,
    public code: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}

export type FakeSession = {
  id: string;
  object: "checkout.session";
  url: string;
  mode: string;
  status: "open" | "complete" | "expired";
  payment_status: "unpaid" | "paid";
  amount_total: number;
  currency: string;
  metadata: Record<string, string>;
  payment_intent: string | null;
  customer_email: string | null;
  line_items: Array<{ name: string; amount: number }>;
  capture_method: "manual" | "automatic";
  pi_metadata: Record<string, string>;
  success_url: string;
  cancel_url: string;
};

export type FakeIntent = {
  id: string;
  object: "payment_intent";
  amount: number;
  amount_capturable: number;
  amount_received: number;
  currency: string;
  capture_method: "manual" | "automatic";
  status: "requires_capture" | "succeeded" | "canceled";
  metadata: Record<string, string>;
  released: number;
};

export const stripe = {
  sessions: new Map<string, FakeSession>(),
  intents: new Map<string, FakeIntent>(),
  idempotency: new Map<string, { params: string; id: string }>(),
  calls: {
    sessionsCreate: [] as Array<{ params: Record<string, unknown>; key?: string }>,
    capture: [] as Array<{ id: string; amount: number }>,
    cancel: [] as string[],
    retrieve: [] as string[],
  },
  seq: 0,
};

export function resetStripe() {
  stripe.sessions.clear();
  stripe.intents.clear();
  stripe.idempotency.clear();
  stripe.calls = { sessionsCreate: [], capture: [], cancel: [], retrieve: [] };
  stripe.seq = 0;
}

const clone = <T>(v: T): T => structuredClone(v);

export const fakeStripeClient = {
  checkout: {
    sessions: {
      create: async (params: Record<string, unknown>, opts?: { idempotencyKey?: string }) => {
        stripe.calls.sessionsCreate.push({ params: clone(params), key: opts?.idempotencyKey });
        const p = JSON.stringify(params);
        if (opts?.idempotencyKey) {
          const seen = stripe.idempotency.get(opts.idempotencyKey);
          if (seen) {
            if (seen.params !== p) {
              throw new FakeStripeError(
                "Keys for idempotent requests can only be used with the same parameters they were first used with.",
                "idempotency_key_in_use",
              );
            }
            return clone(stripe.sessions.get(seen.id)!);
          }
        }
        stripe.seq += 1;
        const items = (params.line_items as Array<{
          quantity: number;
          price_data: { unit_amount: number; currency: string; product_data: { name: string } };
        }>) ?? [];
        const pid = params.payment_intent_data as { capture_method?: string; metadata?: Record<string, string> } | undefined;
        const session: FakeSession = {
          id: `cs_test_${stripe.seq}`,
          object: "checkout.session",
          url: `https://checkout.stripe.test/c/cs_test_${stripe.seq}`,
          mode: String(params.mode),
          status: "open",
          payment_status: "unpaid",
          amount_total: items.reduce((t, i) => t + i.price_data.unit_amount * i.quantity, 0),
          currency: items[0]?.price_data.currency ?? "sgd",
          metadata: clone((params.metadata as Record<string, string>) ?? {}),
          payment_intent: null,
          customer_email: (params.customer_email as string) ?? null,
          line_items: items.map((i) => ({ name: i.price_data.product_data.name, amount: i.price_data.unit_amount * i.quantity })),
          capture_method: pid?.capture_method === "manual" ? "manual" : "automatic",
          pi_metadata: clone(pid?.metadata ?? {}),
          success_url: String(params.success_url),
          cancel_url: String(params.cancel_url),
        };
        stripe.sessions.set(session.id, session);
        if (opts?.idempotencyKey) stripe.idempotency.set(opts.idempotencyKey, { params: p, id: session.id });
        return clone(session);
      },
      retrieve: async (id: string) => {
        const s = stripe.sessions.get(id);
        if (!s) throw new FakeStripeError(`No such checkout.session: '${id}'`, "resource_missing", 404);
        return clone(s);
      },
    },
  },
  paymentIntents: {
    retrieve: async (id: string) => {
      stripe.calls.retrieve.push(id);
      const pi = stripe.intents.get(id);
      if (!pi) throw new FakeStripeError(`No such payment_intent: '${id}'`, "resource_missing", 404);
      return clone(pi);
    },
    capture: async (id: string, params?: { amount_to_capture?: number }) => {
      const pi = stripe.intents.get(id);
      if (!pi) throw new FakeStripeError(`No such payment_intent: '${id}'`, "resource_missing", 404);
      const amount = params?.amount_to_capture ?? pi.amount_capturable;
      stripe.calls.capture.push({ id, amount });
      if (pi.status !== "requires_capture") {
        throw new FakeStripeError(
          `This PaymentIntent could not be captured because it has a status of ${pi.status}.`,
          "payment_intent_unexpected_state",
        );
      }
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new FakeStripeError("Invalid amount_to_capture", "parameter_invalid_integer");
      }
      if (amount > pi.amount_capturable) {
        throw new FakeStripeError("amount_to_capture is greater than the amount capturable", "amount_too_large");
      }
      pi.amount_received = amount;
      pi.released = pi.amount_capturable - amount;
      pi.amount_capturable = 0;
      pi.status = "succeeded";
      return clone(pi);
    },
    cancel: async (id: string) => {
      stripe.calls.cancel.push(id);
      const pi = stripe.intents.get(id);
      if (!pi) throw new FakeStripeError(`No such payment_intent: '${id}'`, "resource_missing", 404);
      if (pi.status !== "requires_capture") {
        throw new FakeStripeError(
          `You cannot cancel this PaymentIntent because it has a status of ${pi.status}.`,
          "payment_intent_unexpected_state",
        );
      }
      pi.released = pi.amount_capturable;
      pi.amount_capturable = 0;
      pi.status = "canceled";
      return clone(pi);
    },
  },
  webhooks: {
    constructEvent: (body: string, sig: string) => {
      if (sig !== "t=1,v1=fake") throw new Error("No signatures found matching the expected signature");
      return JSON.parse(body);
    },
  },
};

export function completeCheckout(sessionId: string): FakeSession {
  const s = stripe.sessions.get(sessionId);
  if (!s) throw new Error(`unknown session ${sessionId}`);
  if (s.status !== "open") throw new Error(`session ${sessionId} is ${s.status}`);
  stripe.seq += 1;
  const manual = s.capture_method === "manual";
  const pi: FakeIntent = {
    id: `pi_test_${stripe.seq}`,
    object: "payment_intent",
    amount: s.amount_total,
    amount_capturable: manual ? s.amount_total : 0,
    amount_received: manual ? 0 : s.amount_total,
    currency: s.currency,
    capture_method: manual ? "manual" : "automatic",
    status: manual ? "requires_capture" : "succeeded",
    metadata: { ...s.pi_metadata },
    released: 0,
  };
  stripe.intents.set(pi.id, pi);
  s.status = "complete";
  s.payment_intent = pi.id;
  s.payment_status = manual ? "unpaid" : "paid";
  return clone(s);
}

export function lapseIntent(id: string) {
  const pi = stripe.intents.get(id);
  if (pi && pi.status === "requires_capture") {
    pi.released = pi.amount_capturable;
    pi.amount_capturable = 0;
    pi.status = "canceled";
  }
}

export function sessionEvent(session: FakeSession, type = "checkout.session.completed") {
  stripe.seq += 1;
  return { id: `evt_${stripe.seq}`, type, data: { object: clone(session) } };
}
