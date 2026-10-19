/**
 * Verify a WABA: does it own the configured phone number, and what templates does
 * it already have? Run before creating templates.
 *   npx tsx --env-file=.env.local scripts/whatsapp-waba.ts <WABA_ID>
 */
const GRAPH = "https://graph.facebook.com/v21.0";

async function get(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  return res.ok ? json : { __error: json?.error ?? { status: res.status } };
}

async function main() {
  const waba = process.argv[2]?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const token = process.env.WHATSAPP_TOKEN?.trim();
  if (!waba) throw new Error("Pass the WABA id as arg 1");
  if (!phoneId || !token) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TOKEN");

  const nums = await get(`${GRAPH}/${waba}/phone_numbers?fields=id,display_phone_number,verified_name&limit=50`, token);
  if (nums.__error) { console.log("phone_numbers error:", JSON.stringify(nums.__error)); }
  const numList: Array<{ id: string; display_phone_number?: string }> = nums?.data ?? [];
  const owns = numList.some((n) => n.id === phoneId);
  console.log(`WABA ${waba}`);
  console.log(`  owns configured number (…${phoneId.slice(-4)}): ${owns ? "YES ★" : "NO"}`);
  for (const n of numList) console.log(`    # ${n.display_phone_number ?? "?"}  id …${n.id.slice(-4)}${n.id === phoneId ? "  ← configured" : ""}`);

  const tpl = await get(`${GRAPH}/${waba}/message_templates?fields=name,language,status&limit=200`, token);
  const trows: Array<{ name: string; language: string; status: string }> = tpl?.data ?? [];
  console.log(`  templates: ${trows.length}`);
  for (const t of trows) console.log(`    · ${t.name} [${t.language}] ${t.status}`);
  const need = ["appointment_day_before_v2", "appointment_morning_of", "appointment_cancelled"];
  console.log("  needed:");
  for (const n of need) {
    const hit = trows.find((r) => r.name === n);
    console.log(`    ${hit ? "✓ exists" : "✗ missing"} ${n}${hit ? ` [${hit.language}] ${hit.status}` : ""}`);
  }
}

main();
