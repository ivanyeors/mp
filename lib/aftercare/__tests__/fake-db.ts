type Row = Record<string, unknown>;
export type AftercareFakeDb = Record<string, Row[]>;

export type RpcHandler = (args: Record<string, unknown>, db: AftercareFakeDb) => { data: unknown; error: { message: string } | null };

export function fakeAftercareDb(db: AftercareFakeDb, rpcs: Record<string, RpcHandler> = {}) {
  let seq = 0;
  const client = {
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    rpc(name: string, args: Record<string, unknown>) {
      client.rpcCalls.push({ name, args });
      const handler = rpcs[name];
      return Promise.resolve(handler ? handler(args, db) : { data: null, error: { message: `no rpc ${name}` } });
    },
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      let patch: Row | null = null;
      let upserted: Row[] | null = null;
      let sort: { col: string; asc: boolean } | null = null;
      let limit: number | null = null;
      let embeds: Array<[alias: string, table: string, fk: string]> = [];
      const out = (row: Row): Row => {
        if (!embeds.length) return row;
        const copy = { ...row };
        for (const [alias, other, fk] of embeds) copy[alias] = (db[other] ?? []).find((o) => o.id === row[fk]) ?? null;
        return copy;
      };
      const rows = (): Row[] => {
        if (upserted) return upserted;
        let r = (db[table] ??= []).filter((row) => filters.every((f) => f(row)));
        if (patch) for (const row of r) Object.assign(row, patch);
        if (sort) {
          const { col, asc } = sort;
          r = [...r].sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : 1) * (asc ? 1 : -1));
        }
        if (limit !== null) r = r.slice(0, limit);
        return r;
      };
      const q = {
        select: (cols?: string) => {
          embeds = [...(cols ?? "").matchAll(/(\w+):(\w+)(?:!(\w+))?\(/g)].map((m) => [m[1], m[2], m[3] ?? `${m[1]}_id`]);
          return q;
        },
        eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), q),
        is: (col: string, val: unknown) => (filters.push((r) => (r[col] ?? null) === val), q),
        in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), q),
        order: (col: string, opts?: { ascending?: boolean }) => ((sort = { col, asc: opts?.ascending !== false }), q),
        limit: (n: number) => ((limit = n), q),
        update: (p: Row) => ((patch = p), q),
        upsert: (row: Row, opts: { onConflict: string; ignoreDuplicates?: boolean }) => {
          const keys = opts.onConflict.split(",").map((k) => k.trim());
          const list = (db[table] ??= []);
          const clash = list.find((r) => keys.every((k) => r[k] === row[k]));
          if (clash) {
            if (!opts.ignoreDuplicates) Object.assign(clash, row);
            upserted = opts.ignoreDuplicates ? [] : [clash];
          } else {
            const inserted = { id: ++seq, created_at: new Date(Date.now() + seq).toISOString(), ...row };
            list.push(inserted);
            upserted = [inserted];
          }
          return q;
        },
        maybeSingle: () => {
          const r = rows();
          return Promise.resolve(
            r.length <= 1 ? { data: r[0] ? out(r[0]) : null, error: null } : { data: null, error: { message: "multiple rows" } },
          );
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows().map(out), error: null }).then(resolve, reject),
      };
      return q;
    },
  };
  return client;
}

export const setAftercarePreferenceRpc: RpcHandler = (args, db) => {
  const customer = (db.customers ?? []).find((c) => c.id === args.p_customer_id);
  if (!customer) return { data: null, error: { message: `Customer ${String(args.p_customer_id)} not found` } };
  const pref = args.p_preference as string;
  if (customer[pref] === args.p_value) return { data: false, error: null };
  const turningWaOn = pref === "aftercare_whatsapp" && args.p_value === true;
  if (turningWaOn && args.p_source === "profile" && !String(args.p_wording ?? "").trim()) {
    return { data: null, error: { message: "Turning WhatsApp on from the Profile stores the wording shown" } };
  }
  if (turningWaOn && args.p_source === "staff" && !String(args.p_note ?? "").trim()) {
    return { data: null, error: { message: "Turning WhatsApp on for a customer needs a note saying how they agreed" } };
  }
  customer[pref] = args.p_value;
  (db.customer_preference_events ??= []).push({
    customer_id: args.p_customer_id,
    preference: pref,
    to_value: args.p_value,
    source: args.p_source,
    changed_by_profile_id: args.p_source === "staff" ? (args.p_profile_id ?? null) : null,
    note: args.p_note ?? null,
    wording: turningWaOn ? (args.p_wording ?? null) : null,
    created_at: new Date().toISOString(),
  });
  return { data: true, error: null };
};
