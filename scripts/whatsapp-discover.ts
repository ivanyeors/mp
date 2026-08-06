/**
 * Diagnostic: map every WABA the token can reach → its phone numbers + templates.
 * Pinpoints why #132001 fires (number on one WABA, templates on another, or a
 * language mismatch). Marks the WABA that owns the configured phone number.
 *
 *   npx tsx --env-file=.env.local scripts/whatsapp-discover.ts
 */
const GRAPH = "https://graph.facebook.com/v21.0";

async function get(url: string, token: string): Promise<any> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { __error: json?.error ?? { status: res.status } };
  return json;
}

async function main() {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const token = process.env.WHATSAPP_TOKEN?.trim();
  if (!phoneId || !token) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TOKEN");
  console.log(`configured phone number id: …${phoneId.slice(-4)}\n`);

  const me = await get(`${GRAPH}/me?fields=id,name,businesses{id,name}`, token);
  if (me.__error) {
    console.log("me error:", JSON.stringify(me.__error));
  }
  const businesses: Array<{ id: string; name?: string }> = me?.businesses?.data ?? [];
  if (!businesses.length && me?.id) {
    // system-user token: try owned/client WABAs off the business the SU belongs to
    console.log("no businesses via /me; trying /me directly:", JSON.stringify({ id: me.id, name: me.name }));
  }
  console.log(`businesses reachable: ${businesses.length}`);

  for (const biz of businesses) {
    console.log(`\n■ Business ${biz.name ?? ""} (${biz.id})`);
    for (const edge of ["owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"]) {
      const wabas = await get(`${GRAPH}/${biz.id}/${edge}?fields=id,name&limit=50`, token);
      const list: Array<{ id: string; name?: string }> = wabas?.data ?? [];
      for (const w of list) {
        const nums = await get(
          `${GRAPH}/${w.id}/phone_numbers?fields=id,display_phone_number,verified_name&limit=50`,
          token,
        );
        const numList: Array<{ id: string; display_phone_number?: string }> = nums?.data ?? [];
        const ownsIt = numList.some((n) => n.id === phoneId);
        console.log(`  ▸ WABA ${w.name ?? ""} (${w.id})${ownsIt ? "   ★ owns the configured number" : ""}`);
        for (const n of numList) {
          console.log(`      # ${n.display_phone_number ?? "?"}  id …${n.id.slice(-4)}${n.id === phoneId ? "  ← configured" : ""}`);
        }
        const tpl = await get(
          `${GRAPH}/${w.id}/message_templates?fields=name,language,status&limit=200`,
          token,
        );
        const trows: Array<{ name: string; language: string; status: string }> = tpl?.data ?? [];
        if (trows.length === 0) console.log(`      (no templates)`);
        for (const t of trows) console.log(`      · ${t.name} [${t.language}] ${t.status}`);
      }
    }
  }
}

main();
