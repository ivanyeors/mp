// Checks the fake Supabase against the real supabase-js client: embeds,
// filters, single rows, counts, writes, RPCs and sign-in. Run it after
// changing anything under lib/:
//
//   node .claude/skills/preview/selftest.mjs

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
const require = createRequire(join(repo, "package.json"));
const { createClient } = require("@supabase/supabase-js");

const port = 54400 + Math.floor(Math.random() * 500);
const server = spawn(process.execPath, [join(here, "lib", "fake-supabase.mjs"), "--port", String(port)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((resolve, reject) => {
  server.stdout.on("data", (d) => String(d).includes("fake Supabase on") && resolve());
  server.on("exit", (code) => reject(new Error(`server exited ${code}`)));
});

const url = `http://127.0.0.1:${port}`;
const admin = createClient(url, "preview-service", { auth: { persistSession: false, autoRefreshToken: false } });
let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${name}\n     ${err.message.split("\n").join("\n     ")}`);
  }
}

await check("many-to-one embed with an alias (admin.ts MEMBER_SELECT)", async () => {
  const { data, error } = await admin
    .from("admin_users")
    .select("id, is_active, auth_user_id, role:admin_roles(id, key, name, grants_all, permissions)")
    .eq("auth_user_id", "00000000-0000-4000-8000-000000000001")
    .maybeSingle();
  assert.equal(error, null);
  assert.equal(data.role.key, "owner");
  assert.equal(data.role.grants_all, true);
});

await check("ilike with an escaped pattern, maybeSingle with no match", async () => {
  const hit = await admin.from("admin_users").select("id").ilike("email", "OWNER@preview.local").maybeSingle();
  assert.equal(hit.data?.id, "member-owner");
  const miss = await admin.from("admin_users").select("id").ilike("email", "nobody\\_x@preview.local").maybeSingle();
  assert.equal(miss.data, null);
  assert.equal(miss.error, null);
});

await check("single() on no rows is PGRST116", async () => {
  const { data, error } = await admin.from("admin_users").select("id").eq("id", "nope").single();
  assert.equal(data, null);
  assert.equal(error?.code, "PGRST116");
});

await check("one-to-many embed, in(), order, range and an exact count", async () => {
  const { data, count, error } = await admin
    .from("admin_roles")
    .select("key, members:admin_users(email)", { count: "exact" })
    .in("key", ["owner", "staff"])
    .order("key", { ascending: false })
    .range(0, 0);
  assert.equal(error, null);
  assert.equal(count, 2);
  assert.equal(data.length, 1);
  assert.equal(data[0].key, "staff");
  assert.deepEqual(data[0].members, [{ email: "staff@preview.local" }]);
});

await check("or() tree, not(), is(null) and a head count", async () => {
  const { count } = await admin
    .from("admin_users")
    .select("*", { count: "exact", head: true })
    .or("email.eq.owner@preview.local,and(role.eq.staff,is_active.eq.true)")
    .not("role_id", "is", null);
  assert.equal(count, 2);
});

await check("!inner embed filtered on the embedded table", async () => {
  const { data } = await admin.from("admin_users").select("email, admin_roles!inner(key)").eq("admin_roles.key", "owner");
  assert.deepEqual(data.map((r) => r.email), ["owner@preview.local"]);
});

await check("insert fills defaults, update and delete change the table", async () => {
  const ins = await admin.from("admin_users").insert({ email: "new@preview.local", role_id: "role-staff" }).select("id, is_active, role").single();
  assert.equal(ins.error, null);
  assert.equal(ins.data.is_active, true);
  assert.equal(ins.data.role, "staff");
  assert.match(ins.data.id, /^[0-9a-f-]{36}$/);
  const up = await admin.from("admin_users").update({ is_active: false }).eq("id", ins.data.id).select("is_active").single();
  assert.equal(up.data.is_active, false);
  const del = await admin.from("admin_users").delete().eq("id", ins.data.id).select("id");
  assert.equal(del.data.length, 1);
  const left = await admin.from("admin_users").select("id", { count: "exact", head: true });
  assert.equal(left.count, 2);
});

await check("upsert merges on the conflict column", async () => {
  await admin.from("admin_roles").upsert({ id: "role-staff", name: "Staff (renamed)" }, { onConflict: "id" });
  const { data } = await admin.from("admin_roles").select("name, key").eq("id", "role-staff").single();
  assert.equal(data.name, "Staff (renamed)");
  assert.equal(data.key, "staff");
});

await check("JSON path select and filter", async () => {
  await admin.from("preview_selftest").insert([{ id: 1, data: { kind: "a", n: 2 } }, { id: 2, data: { kind: "b", n: 5 } }]);
  const { data } = await admin.from("preview_selftest").select("id, kind:data->>kind, n:data->n").eq("data->>kind", "b");
  assert.deepEqual(data, [{ id: 2, kind: "b", n: 5 }]);
});

await check("RPC with a stand-in, and one without (empty value of its return kind)", async () => {
  const known = await admin.rpc("is_admin_user");
  assert.equal(known.error, null);
  const { rpc: standIns } = await (await fetch(`${url}/__preview/status`)).json();
  const set = [...(await import("./lib/schema.mjs")).readSchema(join(repo, "supabase", "migrations")).functions].find(
    ([name, k]) => k === "set" && !standIns.includes(name),
  );
  if (set) {
    const r = await admin.rpc(set[0], {});
    assert.deepEqual(r.data, []);
  }
});

await check("sign-in: session cookie user resolves through getUser and getClaims", async () => {
  const session = await (await fetch(`${url}/__preview/session?email=owner@preview.local`)).json();
  const client = createClient(url, "preview-anon", { auth: { persistSession: false, autoRefreshToken: false } });
  await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  const { data: u } = await client.auth.getUser();
  assert.equal(u.user.email, "owner@preview.local");
  const { data: c, error } = await client.auth.getClaims();
  assert.equal(error, null);
  assert.equal(c.claims.sub, "00000000-0000-4000-8000-000000000001");
});

server.kill();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
