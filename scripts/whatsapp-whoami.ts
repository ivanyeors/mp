/**
 * Diagnostic: self-inspect the token to recover the WABA id(s) it is scoped to
 * (granular_scopes → whatsapp_business_management/messaging → target_ids), then list
 * each WABA's phone numbers + templates. Needs only the token itself.
 *
 *   npx tsx --env-file=.env.local scripts/whatsapp-whoami.ts
 */
const GRAPH = "https://graph.facebook.com/v21.0";

async function get(url: string): Promise<any> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  return res.ok ? json : { __error: json?.error ?? { status: res.status } };
}

async function main() {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const token = process.env.WHATSAPP_TOKEN?.trim();
  if (!phoneId || !token) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TOKEN");

  const dbg = await get(
    `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`,
  );
  if (dbg.__error) {
    console.log("debug_token error:", JSON.stringify(dbg.__error));
    process.exit(1);
  }
  const scopes: Array<{ scope: string; target_ids?: string[] }> =
    dbg?.data?.granular_scopes ?? [];
  const wabaIds = new Set<string>();
  for (const s of scopes) {
    if (/whatsapp_business/.test(s.scope) && s.target_ids) s.target_ids.forEach((t) => wabaIds.add(t));
  }
  console.log("granular_scopes:", JSON.stringify(scopes));
  console.log(`\ncandidate WABA ids: ${[...wabaIds].join(", ") || "(none)"}\n`);

  for (const waba of wabaIds) {
    const nums = await get(`${GRAPH}/${waba}/phone_numbers?fields=id,display_phone_number&access_token=${encodeURIComponent(token)}`);
    const numList: Array<{ id: string; display_phone_number?: string }> = nums?.data ?? [];
    const owns = numList.some((n) => n.id === phoneId);
    console.log(`▸ WABA ${waba}${owns ? "  ★ owns the configured number" : ""}`);
    for (const n of numList) console.log(`    # ${n.display_phone_number ?? "?"}  id …${n.id.slice(-4)}${n.id === phoneId ? "  ← configured" : ""}`);
    const tpl = await get(`${GRAPH}/${waba}/message_templates?fields=name,language,status&limit=200&access_token=${encodeURIComponent(token)}`);
    const trows: Array<{ name: string; language: string; status: string }> = tpl?.data ?? [];
    if (!trows.length) console.log("    (no templates)");
    for (const t of trows) console.log(`    · ${t.name} [${t.language}] ${t.status}`);
  }
}

main();
